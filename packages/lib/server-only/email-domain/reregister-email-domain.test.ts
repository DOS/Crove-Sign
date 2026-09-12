import { EmailDomainStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NEXT_PRIVATE_ENCRYPTION_KEY = 'cleanroom-test-encryption-key';
  process.env.NEXT_PRIVATE_SES_ACCESS_KEY_ID = 'cleanroom-access-key';
  process.env.NEXT_PRIVATE_SES_SECRET_ACCESS_KEY = 'cleanroom-secret-key';
  process.env.NEXT_PRIVATE_SES_REGION = 'us-east-1';
});

const mocks = vi.hoisted(() => ({
  emailDomainFindUnique: vi.fn(),
  emailDomainCreate: vi.fn(),
  emailDomainUpdate: vi.fn(),
  emailDomainDelete: vi.fn(),
  rateLimitUpsert: vi.fn(),
  sesSend: vi.fn(),
  createEmailIdentityCommand: vi.fn(),
  deleteEmailIdentityCommand: vi.fn(),
  getEmailIdentityCommand: vi.fn(),
  putDkimSigningAttributesCommand: vi.fn(),
  resolveTxt: vi.fn(),
  resolveSoa: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({
  prisma: {
    emailDomain: {
      findUnique: mocks.emailDomainFindUnique,
      create: mocks.emailDomainCreate,
      update: mocks.emailDomainUpdate,
      delete: mocks.emailDomainDelete,
    },
    rateLimit: {
      upsert: mocks.rateLimitUpsert,
    },
  },
}));

// `SESv2Client` is a class because production code constructs it; an arrow
// function cannot be constructed.
vi.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: vi.fn(
    class {
      send = mocks.sesSend;
    },
  ),
  CreateEmailIdentityCommand: mocks.createEmailIdentityCommand,
  DeleteEmailIdentityCommand: mocks.deleteEmailIdentityCommand,
  GetEmailIdentityCommand: mocks.getEmailIdentityCommand,
  PutEmailIdentityDkimSigningAttributesCommand: mocks.putDkimSigningAttributesCommand,
}));

vi.mock('node:dns/promises', () => ({
  resolveTxt: mocks.resolveTxt,
  resolveSoa: mocks.resolveSoa,
}));

vi.mock('../../utils/logger', () => ({
  logger: {
    info: mocks.logInfo,
    warn: mocks.logWarn,
    error: mocks.logError,
  },
}));

import { AppErrorCode } from '../../errors/app-error';
import { symmetricDecrypt } from '../../universal/crypto';
import { reregisterEmailDomain } from './reregister-email-domain';

const ENCRYPTION_KEY = 'cleanroom-test-encryption-key';
const EMAIL_DOMAIN_ID = 'email_domain_reregister_target';
const DOMAIN = 'example.com';
const ORGANISATION_ID = 'org_cleanroom_reregister';
const ORIGINAL_SELECTOR = 'crove-originalsel1._domainkey';
const ORIGINAL_PUBLIC_KEY = 'ORIGINALPUBLICKEYMATERIAL';

const buildRow = (overrides: Record<string, unknown> = {}) => ({
  id: EMAIL_DOMAIN_ID,
  domain: DOMAIN,
  selector: ORIGINAL_SELECTOR,
  publicKey: ORIGINAL_PUBLIC_KEY,
  privateKey: 'original-encrypted-private-key',
  status: EmailDomainStatus.PENDING,
  organisationId: ORGANISATION_ID,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  lastVerifiedAt: new Date('2026-02-01T00:00:00.000Z'),
  ...overrides,
});

type UpdatePayload = {
  where: { id: string };
  data: Record<string, unknown>;
};

const readUpdatePayload = (callIndex: number): UpdatePayload => {
  const call = mocks.emailDomainUpdate.mock.calls.at(callIndex);
  const payload = call?.[0] as UpdatePayload | undefined;

  return payload ?? { where: { id: '' }, data: {} };
};

describe('reregisterEmailDomain', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.emailDomainFindUnique.mockResolvedValue(buildRow());
    mocks.emailDomainUpdate.mockResolvedValue(buildRow());
    mocks.sesSend.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps the row id while rotating the selector and the key pair', async () => {
    await reregisterEmailDomain({ emailDomainId: EMAIL_DOMAIN_ID });

    expect(mocks.emailDomainCreate).not.toHaveBeenCalled();
    expect(mocks.emailDomainDelete).not.toHaveBeenCalled();
    expect(mocks.emailDomainUpdate).toHaveBeenCalledOnce();

    const payload = readUpdatePayload(0);

    expect(payload.where).toEqual({ id: EMAIL_DOMAIN_ID });
    expect(payload.data.status).toBe(EmailDomainStatus.PENDING);
    expect(payload.data.lastVerifiedAt).toBeNull();

    const selector = String(payload.data.selector);

    expect(selector).not.toBe(ORIGINAL_SELECTOR);
    expect(selector).toMatch(/^crove-[a-z0-9]{12}\._domainkey$/);
    expect(String(payload.data.publicKey)).not.toBe(ORIGINAL_PUBLIC_KEY);
    expect(String(payload.data.privateKey)).not.toContain('BEGIN PRIVATE KEY');

    const decryptedPrivateKey = Buffer.from(
      symmetricDecrypt({ key: ENCRYPTION_KEY, data: String(payload.data.privateKey) }),
    ).toString('utf8');

    expect(decryptedPrivateKey).toContain('BEGIN PRIVATE KEY');
  });

  it('points Amazon SES at the freshly generated selector', async () => {
    await reregisterEmailDomain({ emailDomainId: EMAIL_DOMAIN_ID });

    const selectorLabel = String(readUpdatePayload(0).data.selector).replace('._domainkey', '');

    expect(mocks.createEmailIdentityCommand).toHaveBeenCalledWith({ EmailIdentity: DOMAIN });
    expect(mocks.putDkimSigningAttributesCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        EmailIdentity: DOMAIN,
        SigningAttributesOrigin: 'EXTERNAL',
        SigningAttributes: expect.objectContaining({ DomainSigningSelector: selectorLabel }),
      }),
    );
  });

  it('leaves the stored row alone when Amazon SES refuses the rotation', async () => {
    mocks.sesSend.mockRejectedValue(
      Object.assign(new Error('BadRequestException'), {
        name: 'BadRequestException',
        $metadata: { httpStatusCode: 400, requestId: 'aws-request-id' },
      }),
    );

    await expect(reregisterEmailDomain({ emailDomainId: EMAIL_DOMAIN_ID })).rejects.toMatchObject({
      code: AppErrorCode.UNKNOWN_ERROR,
    });

    expect(mocks.emailDomainUpdate).not.toHaveBeenCalled();
  });

  it('is safe to call repeatedly', async () => {
    await reregisterEmailDomain({ emailDomainId: EMAIL_DOMAIN_ID });
    await reregisterEmailDomain({ emailDomainId: EMAIL_DOMAIN_ID });

    expect(mocks.emailDomainUpdate).toHaveBeenCalledTimes(2);
    expect(readUpdatePayload(0).where).toEqual({ id: EMAIL_DOMAIN_ID });
    expect(readUpdatePayload(1).where).toEqual({ id: EMAIL_DOMAIN_ID });
    expect(String(readUpdatePayload(0).data.selector)).not.toBe(String(readUpdatePayload(1).data.selector));
    expect(mocks.emailDomainCreate).not.toHaveBeenCalled();
    expect(mocks.emailDomainDelete).not.toHaveBeenCalled();
  });

  it('logs the rotation as one structured audit transition', async () => {
    await reregisterEmailDomain({ emailDomainId: EMAIL_DOMAIN_ID });

    expect(mocks.logInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'email_domain_transition',
        event: 'reregistered',
        emailDomainId: EMAIL_DOMAIN_ID,
        organisationId: ORGANISATION_ID,
        domain: DOMAIN,
        previousStatus: EmailDomainStatus.PENDING,
        nextStatus: EmailDomainStatus.PENDING,
      }),
    );
  });

  it('throws NOT_FOUND for an unknown id', async () => {
    mocks.emailDomainFindUnique.mockResolvedValue(null);

    await expect(reregisterEmailDomain({ emailDomainId: 'email_domain_missing' })).rejects.toMatchObject({
      code: AppErrorCode.NOT_FOUND,
    });

    expect(mocks.emailDomainUpdate).not.toHaveBeenCalled();
  });

  it('throws NOT_SETUP when Amazon SES is unconfigured', async () => {
    vi.stubEnv('NEXT_PRIVATE_SES_SECRET_ACCESS_KEY', '');

    await expect(reregisterEmailDomain({ emailDomainId: EMAIL_DOMAIN_ID })).rejects.toMatchObject({
      code: AppErrorCode.NOT_SETUP,
    });

    expect(mocks.emailDomainFindUnique).not.toHaveBeenCalled();
    expect(mocks.emailDomainUpdate).not.toHaveBeenCalled();
  });
});
