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
import { deleteEmailDomain } from './delete-email-domain';

const EMAIL_DOMAIN_ID = 'email_domain_delete_target';
const DOMAIN = 'example.com';
const ORGANISATION_ID = 'org_cleanroom_delete';

const buildRow = (overrides: Record<string, unknown> = {}) => ({
  id: EMAIL_DOMAIN_ID,
  domain: DOMAIN,
  selector: 'crove-deletetarget._domainkey',
  status: EmailDomainStatus.ACTIVE,
  organisationId: ORGANISATION_ID,
  publicKey: 'unused-public-key',
  privateKey: 'unused-encrypted-private-key',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  lastVerifiedAt: new Date('2026-02-01T00:00:00.000Z'),
  ...overrides,
});

const sesError = (name: string, httpStatusCode?: number): Error =>
  Object.assign(new Error(name), {
    name,
    $metadata: httpStatusCode === undefined ? undefined : { httpStatusCode, requestId: 'aws-request-id' },
  });

describe('deleteEmailDomain', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.emailDomainFindUnique.mockResolvedValue(buildRow());
    mocks.emailDomainDelete.mockResolvedValue(buildRow());
    mocks.sesSend.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('removes the Amazon SES identity and then the row', async () => {
    await deleteEmailDomain({ emailDomainId: EMAIL_DOMAIN_ID });

    expect(mocks.deleteEmailIdentityCommand).toHaveBeenCalledWith({ EmailIdentity: DOMAIN });
    expect(mocks.sesSend).toHaveBeenCalledOnce();

    expect(mocks.emailDomainDelete).toHaveBeenCalledWith({ where: { id: EMAIL_DOMAIN_ID } });

    expect(mocks.logInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'email_domain_transition',
        event: 'deleted',
        organisationId: ORGANISATION_ID,
        domain: DOMAIN,
        previousStatus: EmailDomainStatus.ACTIVE,
        nextStatus: null,
      }),
    );
  });

  it('still removes the row when Amazon SES cannot be reached', async () => {
    mocks.sesSend.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));

    await expect(deleteEmailDomain({ emailDomainId: EMAIL_DOMAIN_ID })).resolves.toBeUndefined();

    expect(mocks.emailDomainDelete).toHaveBeenCalledWith({ where: { id: EMAIL_DOMAIN_ID } });
    expect(mocks.logError).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'email_domain_ses_orphan',
        emailDomainId: EMAIL_DOMAIN_ID,
        organisationId: ORGANISATION_ID,
        domain: DOMAIN,
      }),
    );
  });

  it('does not treat an identity Amazon SES never had as an orphan', async () => {
    mocks.sesSend.mockRejectedValue(sesError('NotFoundException', 404));

    await deleteEmailDomain({ emailDomainId: EMAIL_DOMAIN_ID });

    expect(mocks.emailDomainDelete).toHaveBeenCalledWith({ where: { id: EMAIL_DOMAIN_ID } });
    expect(mocks.logError).not.toHaveBeenCalledWith(expect.objectContaining({ msg: 'email_domain_ses_orphan' }));
  });

  it('deletes the row even when Amazon SES is not configured at all', async () => {
    vi.stubEnv('NEXT_PRIVATE_SES_REGION', '');

    await deleteEmailDomain({ emailDomainId: EMAIL_DOMAIN_ID });

    expect(mocks.sesSend).not.toHaveBeenCalled();
    expect(mocks.emailDomainDelete).toHaveBeenCalledWith({ where: { id: EMAIL_DOMAIN_ID } });
  });

  it('throws NOT_FOUND for an unknown id', async () => {
    mocks.emailDomainFindUnique.mockResolvedValue(null);

    await expect(deleteEmailDomain({ emailDomainId: 'email_domain_missing' })).rejects.toMatchObject({
      code: AppErrorCode.NOT_FOUND,
    });

    expect(mocks.emailDomainDelete).not.toHaveBeenCalled();
  });
});
