import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { ENCRYPTION_KEY } = vi.hoisted(() => {
  process.env.NEXT_PRIVATE_ENCRYPTION_KEY = 'cleanroom-test-encryption-key';
  process.env.NEXT_PRIVATE_SES_ACCESS_KEY_ID = 'cleanroom-access-key';
  process.env.NEXT_PRIVATE_SES_SECRET_ACCESS_KEY = 'cleanroom-secret-key';
  process.env.NEXT_PRIVATE_SES_REGION = 'us-east-1';

  return { ENCRYPTION_KEY: 'cleanroom-test-encryption-key' };
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

// The command classes are spied rather than stubbed with objects so that the
// production `new SomeCommand(input)` keeps working and the inputs can be
// asserted directly. `SESv2Client` is a class for the same reason: production
// code constructs it, and an arrow function cannot be constructed.
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

import { AppError, AppErrorCode } from '../../errors/app-error';
import { symmetricDecrypt } from '../../universal/crypto';
import { STALE_PENDING_CLAIM_TTL_MS } from './constants';
import { createEmailDomain } from './create-email-domain';

const DKIM_VALUE_PREFIX = 'v=DKIM1; k=rsa; p=';
const ORGANISATION_ID = 'org_cleanroom_create';
const RIVAL_ORGANISATION_ID = 'org_rival';
const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');

const readCreatePayload = (): Record<string, unknown> => {
  const call = mocks.emailDomainCreate.mock.calls.at(0);
  const payload = call?.[0] as { data: Record<string, unknown> } | undefined;

  return payload?.data ?? {};
};

const buildExistingClaim = (overrides: Record<string, unknown> = {}) => ({
  id: 'email_domain_existing_claim',
  domain: 'contested.example',
  selector: 'crove-staleclaim01._domainkey',
  status: 'PENDING',
  createdAt: CREATED_AT,
  organisationId: RIVAL_ORGANISATION_ID,
  ...overrides,
});

describe('createEmailDomain', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.emailDomainFindUnique.mockResolvedValue(null);
    mocks.rateLimitUpsert.mockResolvedValue({ count: 1 });
    mocks.sesSend.mockResolvedValue({});
    mocks.emailDomainCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      ...args.data,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      lastVerifiedAt: null,
      emails: [],
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns SPF, DKIM and ownership-challenge records and stores the private key encrypted', async () => {
    const result = await createEmailDomain({ domain: 'example.com', organisationId: ORGANISATION_ID });

    expect(result.records).toHaveLength(3);

    const [dkimRecord, spfRecord, challengeRecord] = result.records;

    expect(dkimRecord?.type).toBe('TXT');
    expect(dkimRecord?.name).toMatch(/^crove-[a-z0-9]{12}\._domainkey$/);
    expect(dkimRecord?.value.startsWith(DKIM_VALUE_PREFIX)).toBe(true);

    expect(spfRecord?.type).toBe('TXT');
    expect(spfRecord?.name).toBe('@');
    expect(spfRecord?.value).toBe('v=spf1 include:amazonses.com -all');

    expect(challengeRecord?.type).toBe('TXT');
    expect(challengeRecord?.name).toBe('_crove-verify');
    expect(challengeRecord?.value.startsWith('crove-domain-verification=')).toBe(true);

    // The records dialog keys its list on `name`, so a collision would drop a record.
    expect(new Set(result.records.map((record) => record.name)).size).toBe(3);

    expect(result.emailDomain.status).toBe('PENDING');
    expect(result.emailDomain.domain).toBe('example.com');
    expect(result.emailDomain.organisationId).toBe(ORGANISATION_ID);
    expect(result.emailDomain.emails).toEqual([]);
    expect(result.emailDomain.selector).toBe(dkimRecord?.name);
    expect(result.emailDomain.lastVerifiedAt).toBeNull();
    expect('privateKey' in result.emailDomain).toBe(false);

    const storedRow = readCreatePayload();

    expect(storedRow.status).toBe('PENDING');
    expect(String(storedRow.privateKey)).not.toContain('BEGIN PRIVATE KEY');

    const decryptedPrivateKey = Buffer.from(
      symmetricDecrypt({ key: ENCRYPTION_KEY, data: String(storedRow.privateKey) }),
    ).toString('utf8');

    expect(decryptedPrivateKey).toContain('BEGIN PRIVATE KEY');
    expect(String(storedRow.publicKey)).toBe(dkimRecord?.value.slice(DKIM_VALUE_PREFIX.length));
  });

  it('registers the identity with Amazon SES using our own DKIM key', async () => {
    const result = await createEmailDomain({ domain: 'example.com', organisationId: ORGANISATION_ID });

    expect(mocks.createEmailIdentityCommand).toHaveBeenCalledWith({ EmailIdentity: 'example.com' });

    const selectorLabel = result.emailDomain.selector.replace('._domainkey', '');

    expect(mocks.putDkimSigningAttributesCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        EmailIdentity: 'example.com',
        SigningAttributesOrigin: 'EXTERNAL',
        SigningAttributes: expect.objectContaining({ DomainSigningSelector: selectorLabel }),
      }),
    );

    expect(mocks.sesSend).toHaveBeenCalledTimes(2);
  });

  it('logs the creation as one structured audit transition', async () => {
    await createEmailDomain({ domain: 'example.com', organisationId: ORGANISATION_ID });

    expect(mocks.logInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'email_domain_transition',
        event: 'created',
        organisationId: ORGANISATION_ID,
        domain: 'example.com',
        previousStatus: null,
        nextStatus: 'PENDING',
      }),
    );
  });

  it('throws NOT_SETUP and creates nothing when Amazon SES is unconfigured', async () => {
    vi.stubEnv('NEXT_PRIVATE_SES_REGION', '');

    await expect(createEmailDomain({ domain: 'example.com', organisationId: ORGANISATION_ID })).rejects.toMatchObject({
      code: AppErrorCode.NOT_SETUP,
    });

    expect(mocks.emailDomainCreate).not.toHaveBeenCalled();
    expect(mocks.sesSend).not.toHaveBeenCalled();
  });

  it('rejects a public mailbox provider domain', async () => {
    await expect(createEmailDomain({ domain: 'gmail.com', organisationId: ORGANISATION_ID })).rejects.toMatchObject({
      code: AppErrorCode.INVALID_BODY,
    });

    expect(mocks.emailDomainCreate).not.toHaveBeenCalled();
  });

  it('rejects single-label hosts and non-alphabetic TLDs', async () => {
    await expect(createEmailDomain({ domain: 'intranet', organisationId: ORGANISATION_ID })).rejects.toMatchObject({
      code: AppErrorCode.INVALID_BODY,
    });

    await expect(createEmailDomain({ domain: 'example.c0m', organisationId: ORGANISATION_ID })).rejects.toMatchObject({
      code: AppErrorCode.INVALID_BODY,
    });

    expect(mocks.emailDomainCreate).not.toHaveBeenCalled();
  });

  it('refuses a domain another organisation holds ACTIVE', async () => {
    mocks.emailDomainFindUnique.mockResolvedValue(buildExistingClaim({ status: 'ACTIVE' }));

    await expect(
      createEmailDomain({ domain: 'contested.example', organisationId: ORGANISATION_ID }),
    ).rejects.toMatchObject({ code: AppErrorCode.ALREADY_EXISTS });

    expect(mocks.emailDomainCreate).not.toHaveBeenCalled();
    expect(mocks.emailDomainDelete).not.toHaveBeenCalled();
  });

  it('takes over a PENDING claim older than the takeover window', async () => {
    const staleCreatedAt = new Date(Date.now() - STALE_PENDING_CLAIM_TTL_MS - 60 * 60 * 1000);

    mocks.emailDomainFindUnique.mockResolvedValue(buildExistingClaim({ createdAt: staleCreatedAt }));

    const result = await createEmailDomain({ domain: 'contested.example', organisationId: ORGANISATION_ID });

    expect(result.emailDomain.organisationId).toBe(ORGANISATION_ID);
    expect(mocks.emailDomainDelete).toHaveBeenCalledWith({ where: { id: 'email_domain_existing_claim' } });
    expect(mocks.emailDomainCreate).toHaveBeenCalledOnce();

    expect(mocks.logInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'takeover',
        organisationId: RIVAL_ORGANISATION_ID,
        takingOverOrganisationId: ORGANISATION_ID,
        previousStatus: 'PENDING',
        nextStatus: null,
      }),
    );
  });

  it('refuses a PENDING claim that is still inside the takeover window', async () => {
    mocks.emailDomainFindUnique.mockResolvedValue(buildExistingClaim({ createdAt: new Date() }));

    await expect(
      createEmailDomain({ domain: 'contested.example', organisationId: ORGANISATION_ID }),
    ).rejects.toMatchObject({ code: AppErrorCode.ALREADY_EXISTS });

    expect(mocks.emailDomainDelete).not.toHaveBeenCalled();
    expect(mocks.emailDomainCreate).not.toHaveBeenCalled();
  });

  it('never names the organisation holding a contested domain', async () => {
    mocks.emailDomainFindUnique.mockResolvedValue(buildExistingClaim({ status: 'ACTIVE' }));

    let caught: unknown;

    try {
      await createEmailDomain({ domain: 'contested.example', organisationId: ORGANISATION_ID });
    } catch (error) {
      caught = error;
    }

    const appError = AppError.parseError(caught);

    expect(`${appError.message} ${appError.userMessage ?? ''}`).not.toContain(RIVAL_ORGANISATION_ID);
    expect(JSON.stringify(appError)).not.toContain(RIVAL_ORGANISATION_ID);
  });

  it('rolls the row back when Amazon SES refuses the registration', async () => {
    mocks.sesSend.mockRejectedValue(
      Object.assign(new Error('LimitExceededException'), {
        name: 'LimitExceededException',
        $metadata: { httpStatusCode: 400, requestId: 'aws-request-id-1' },
      }),
    );

    await expect(createEmailDomain({ domain: 'example.com', organisationId: ORGANISATION_ID })).rejects.toMatchObject({
      code: AppErrorCode.UNKNOWN_ERROR,
    });

    expect(mocks.emailDomainDelete).toHaveBeenCalledWith({ where: { id: expect.any(String) } });
    expect(mocks.logError).toHaveBeenCalledWith(
      expect.objectContaining({ msg: 'email_domain_ses_error', awsRequestId: 'aws-request-id-1' }),
    );
  });
});
