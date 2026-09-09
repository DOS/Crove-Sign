import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  handleDosWebhookEvent: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({
  prisma: {
    rateLimit: {
      findUnique: mocks.findUnique,
      create: mocks.create,
    },
  },
}));

vi.mock('@documenso/lib/server-only/dos-id/handle-dos-webhook', () => ({
  handleDosWebhookEvent: mocks.handleDosWebhookEvent,
}));

import { dosWebhookRoute } from './dos-webhook';

const makeBody = (orgId: string) =>
  JSON.stringify({
    event: 'org.member_added',
    org_id: orgId,
    user_email: 'attacker@example.com',
    id: orgId,
  });

const sign = (secret: string, body: string) =>
  `sha256=${crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;

const post = (body: string, headers: Record<string, string> = {}) =>
  dosWebhookRoute.request('/dos-org-sync', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', ...headers },
  });

describe('POST /dos-org-sync (C4 fail-closed + M12 durable dedupe)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('rejects state-changing events with 503 when no secret is configured', async () => {
    vi.stubEnv('CROVE_DOS_WEBHOOK_SECRET', '');

    const res = await post(makeBody('org_unset'));

    expect(res.status).toBe(503);

    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(false);
    expect(mocks.handleDosWebhookEvent).not.toHaveBeenCalled();
  });

  it('answers the connectivity ping with 200 but reports the missing secret', async () => {
    vi.stubEnv('CROVE_DOS_WEBHOOK_SECRET', '');

    const res = await post(JSON.stringify({ event: 'ping' }));

    expect(res.status).toBe(200);

    const json = (await res.json()) as { success: boolean; message: string };
    expect(json.success).toBe(false);
    expect(json.message).toContain('Webhook secret is not configured');
  });

  it('rejects requests with an invalid signature with 401', async () => {
    vi.stubEnv('CROVE_DOS_WEBHOOK_SECRET', 's3cret');

    const res = await post(makeBody('org_bad_sig'), { 'x-dos-signature': 'sha256=deadbeef' });

    expect(res.status).toBe(401);
    expect(mocks.handleDosWebhookEvent).not.toHaveBeenCalled();
  });

  it('answers a validly signed ping', async () => {
    vi.stubEnv('CROVE_DOS_WEBHOOK_SECRET', 's3cret');

    const body = JSON.stringify({ event: 'ping' });
    const res = await post(body, { 'x-dos-signature': sign('s3cret', body) });

    expect(res.status).toBe(200);

    const json = (await res.json()) as { message: string };
    expect(json.message).toContain('Pong');
  });

  it('processes a validly signed event and writes a durable dedupe marker', async () => {
    vi.stubEnv('CROVE_DOS_WEBHOOK_SECRET', 's3cret');
    // Force the synchronous processing path regardless of the host shell env.
    vi.stubEnv('NEXT_PRIVATE_JOBS_PROVIDER', '');
    mocks.findUnique.mockResolvedValue(null);
    mocks.create.mockResolvedValue({});
    mocks.handleDosWebhookEvent.mockResolvedValue({ success: true, message: 'Member added successfully' });

    const body = makeBody('org_ok');
    const res = await post(body, { 'x-dos-signature': sign('s3cret', body) });

    expect(res.status).toBe(200);

    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(true);
    expect(mocks.handleDosWebhookEvent).toHaveBeenCalledOnce();

    expect(mocks.create).toHaveBeenCalledOnce();

    const createArg = mocks.create.mock.calls[0][0] as { data: { key: string; action: string } };
    expect(createArg.data.key).toMatch(/^webhook-evt:/);
    expect(createArg.data.action).toBe('webhook.dos-dedupe');
  });

  it('returns the idempotent response when the durable marker already exists', async () => {
    vi.stubEnv('CROVE_DOS_WEBHOOK_SECRET', 's3cret');
    mocks.findUnique.mockResolvedValue({ count: 1 });

    const body = makeBody('org_dup');
    const res = await post(body, { 'x-dos-signature': sign('s3cret', body) });

    expect(res.status).toBe(200);

    const json = (await res.json()) as { message: string };
    expect(json.message).toContain('already processed');
    expect(mocks.handleDosWebhookEvent).not.toHaveBeenCalled();
  });

  it('does not leak internal error messages (M17)', async () => {
    vi.stubEnv('CROVE_DOS_WEBHOOK_SECRET', 's3cret');
    vi.stubEnv('NEXT_PRIVATE_JOBS_PROVIDER', '');
    mocks.findUnique.mockResolvedValue(null);
    mocks.create.mockResolvedValue({});
    mocks.handleDosWebhookEvent.mockRejectedValue(
      new Error('PrismaClientKnownRequestError: table `OrganisationMember` leaked detail'),
    );

    const body = makeBody('org_err');
    const res = await post(body, { 'x-dos-signature': sign('s3cret', body) });

    expect(res.status).toBe(500);

    const json = (await res.json()) as { message: string };
    expect(json.message).toBe('Internal Server Error');
    expect(json.message).not.toContain('Prisma');
  });
});
