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
import { buildOwnershipChallengeRecordValue, deriveOwnershipChallengeToken } from './ownership-challenge';
import { verifyEmailDomain } from './verify-email-domain';

const ENCRYPTION_KEY = 'cleanroom-test-encryption-key';
const DOMAIN = 'example.com';
const SELECTOR = 'crove-verifytest1._domainkey';
const CHALLENGE_HOST = `_crove-verify.${DOMAIN}`;
const DKIM_HOST = `${SELECTOR}.${DOMAIN}`;
const ORGANISATION_ID = 'org_cleanroom_verify';
const PUBLIC_KEY = `MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA${'A'.repeat(300)}`;
const UNRELATED_PUBLIC_KEY = `MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA${'B'.repeat(300)}`;
const SPF_RECORD = 'v=spf1 include:amazonses.com -all';

const SES_IDENTITY_HEALTHY = {
  IdentityType: 'MANAGED_DOMAIN',
  VerifiedForSendingStatus: true,
  DkimAttributes: { Status: 'SUCCESS', SigningEnabled: true },
};

const buildRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'email_domain_verify',
  domain: DOMAIN,
  selector: SELECTOR,
  publicKey: PUBLIC_KEY,
  status: EmailDomainStatus.PENDING,
  organisationId: ORGANISATION_ID,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  lastVerifiedAt: null,
  ...overrides,
});

const expectedChallengeValue = (emailDomainId: string): string =>
  buildOwnershipChallengeRecordValue(
    deriveOwnershipChallengeToken({ emailDomainId, selector: SELECTOR, domain: DOMAIN }, ENCRYPTION_KEY),
  );

const dnsError = (code: string): Error => Object.assign(new Error(`DNS failure ${code}`), { code });

const sesError = (name: string, httpStatusCode?: number): Error =>
  Object.assign(new Error(name), {
    name,
    $metadata: httpStatusCode === undefined ? undefined : { httpStatusCode, requestId: 'aws-request-id' },
  });

type DnsStub = Record<string, string[][] | Error>;

const stubTxt = (answers: DnsStub) => {
  mocks.resolveTxt.mockImplementation((name: string) => {
    const answer = answers[name] ?? dnsError('ENOTFOUND');

    if (answer instanceof Error) {
      return Promise.reject(answer);
    }

    return Promise.resolve(answer);
  });
};

const stubHealthyDns = (emailDomainId: string, publishedPublicKey = PUBLIC_KEY) => {
  stubTxt({
    [CHALLENGE_HOST]: [[expectedChallengeValue(emailDomainId)]],
    [DKIM_HOST]: [[`v=DKIM1; k=rsa; p=${publishedPublicKey}`]],
    [DOMAIN]: [[SPF_RECORD]],
  });
};

const stubMissingRequiredRecords = () => {
  stubTxt({
    [CHALLENGE_HOST]: dnsError('ENOTFOUND'),
    [DKIM_HOST]: dnsError('ENOTFOUND'),
    [DOMAIN]: [[SPF_RECORD]],
  });
};

const stubRow = (emailDomainId: string, status: EmailDomainStatus = EmailDomainStatus.PENDING) => {
  mocks.emailDomainFindUnique.mockResolvedValue(buildRow({ id: emailDomainId, status }));
};

const expectActiveDomainSurvivesDnsFailure = async (emailDomainId: string, failure: Error) => {
  stubRow(emailDomainId, EmailDomainStatus.ACTIVE);
  stubTxt({
    [CHALLENGE_HOST]: failure,
    [DKIM_HOST]: failure,
    [DOMAIN]: [[SPF_RECORD]],
  });

  const result = await verifyEmailDomain(emailDomainId);

  expect(result.isVerified).toBe(false);
  expect(result.status).toBe(EmailDomainStatus.ACTIVE);
  expect(mocks.emailDomainUpdate).not.toHaveBeenCalled();
  expect(mocks.logWarn).toHaveBeenCalledWith(
    expect.objectContaining({ msg: 'email_domain_verification_inconclusive' }),
  );
};

describe('verifyEmailDomain', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.emailDomainFindUnique.mockResolvedValue(null);
    mocks.rateLimitUpsert.mockResolvedValue({ count: 1 });
    mocks.sesSend.mockResolvedValue(SES_IDENTITY_HEALTHY);
    mocks.emailDomainUpdate.mockResolvedValue(buildRow());
    mocks.resolveSoa.mockResolvedValue({
      nsname: 'ns1.example.com',
      hostmaster: 'hostmaster.example.com',
      serial: 1,
      refresh: 3600,
      retry: 600,
      expire: 604800,
      minttl: 60,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('activates a domain whose challenge TXT matches and whose DKIM key matches exactly', async () => {
    const emailDomainId = 'email_domain_verify_activates';

    stubRow(emailDomainId);
    stubHealthyDns(emailDomainId);

    const result = await verifyEmailDomain(emailDomainId);

    expect(result.isVerified).toBe(true);
    expect(result.status).toBe(EmailDomainStatus.ACTIVE);

    expect(mocks.getEmailIdentityCommand).toHaveBeenCalledWith({ EmailIdentity: DOMAIN });

    expect(mocks.emailDomainUpdate).toHaveBeenCalledWith({
      where: { id: emailDomainId },
      data: { status: EmailDomainStatus.ACTIVE, lastVerifiedAt: expect.any(Date) },
    });

    expect(mocks.logInfo).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'verified', organisationId: ORGANISATION_ID, domain: DOMAIN }),
    );
  });

  it('accepts records that DNS returned split across several character-strings', async () => {
    const emailDomainId = 'email_domain_verify_split_txt';
    const challengeValue = expectedChallengeValue(emailDomainId);

    stubRow(emailDomainId);
    stubTxt({
      [CHALLENGE_HOST]: [[challengeValue.slice(0, 20), challengeValue.slice(20)]],
      [DKIM_HOST]: [[`v=DKIM1; k=rsa; p=${PUBLIC_KEY.slice(0, 200)}`, PUBLIC_KEY.slice(200)]],
      [DOMAIN]: [['v=spf1 ', 'include:amazonses.com -all']],
    });

    const result = await verifyEmailDomain(emailDomainId);

    expect(result.isVerified).toBe(true);
  });

  it('fails when the published DKIM record belongs to a different key', async () => {
    const emailDomainId = 'email_domain_verify_wrong_key';

    stubRow(emailDomainId);
    stubHealthyDns(emailDomainId, UNRELATED_PUBLIC_KEY);

    const result = await verifyEmailDomain(emailDomainId);

    expect(result.isVerified).toBe(false);
    expect(result.status).toBe(EmailDomainStatus.PENDING);
    expect(mocks.emailDomainUpdate).not.toHaveBeenCalled();
  });

  it('fails when the published DKIM key merely extends ours', async () => {
    const emailDomainId = 'email_domain_verify_superstring_key';

    stubRow(emailDomainId);
    stubHealthyDns(emailDomainId, `${PUBLIC_KEY}EXTRAMATERIAL`);

    const result = await verifyEmailDomain(emailDomainId);

    expect(result.isVerified).toBe(false);
  });

  it('fails when the published DKIM key is a prefix of ours', async () => {
    const emailDomainId = 'email_domain_verify_prefix_key';

    stubRow(emailDomainId);
    stubHealthyDns(emailDomainId, PUBLIC_KEY.slice(0, 120));

    const result = await verifyEmailDomain(emailDomainId);

    expect(result.isVerified).toBe(false);
  });

  it('fails when a record looks like DKIM but does not carry our key', async () => {
    const emailDomainId = 'email_domain_verify_dkim_shaped';

    stubRow(emailDomainId);
    stubTxt({
      [CHALLENGE_HOST]: [[expectedChallengeValue(emailDomainId)]],
      [DKIM_HOST]: [['v=DKIM1; k=rsa; h=sha256; t=s; p='], [SPF_RECORD]],
      [DOMAIN]: [[SPF_RECORD]],
    });

    const result = await verifyEmailDomain(emailDomainId);

    expect(result.isVerified).toBe(false);
  });

  it('fails when the DKIM record is published in testing mode', async () => {
    const emailDomainId = 'email_domain_verify_testing_flag';

    stubRow(emailDomainId);
    stubTxt({
      [CHALLENGE_HOST]: [[expectedChallengeValue(emailDomainId)]],
      [DKIM_HOST]: [[`v=DKIM1; k=rsa; t=y; p=${PUBLIC_KEY}`]],
      [DOMAIN]: [[SPF_RECORD]],
    });

    const result = await verifyEmailDomain(emailDomainId);

    expect(result.isVerified).toBe(false);
  });

  it('fails when the ownership challenge value does not match exactly', async () => {
    const emailDomainId = 'email_domain_verify_bad_challenge';

    stubRow(emailDomainId);
    stubTxt({
      [CHALLENGE_HOST]: [[`${expectedChallengeValue(emailDomainId)}-tampered`]],
      [DKIM_HOST]: [[`v=DKIM1; k=rsa; p=${PUBLIC_KEY}`]],
      [DOMAIN]: [[SPF_RECORD]],
    });

    const result = await verifyEmailDomain(emailDomainId);

    expect(result.isVerified).toBe(false);
    expect(mocks.emailDomainUpdate).not.toHaveBeenCalled();
  });

  it('leaves an ACTIVE domain ACTIVE when DNS times out', async () => {
    await expectActiveDomainSurvivesDnsFailure('email_domain_verify_timeout', dnsError('ETIMEOUT'));
  });

  it('leaves an ACTIVE domain ACTIVE when DNS returns SERVFAIL', async () => {
    await expectActiveDomainSurvivesDnsFailure('email_domain_verify_servfail', dnsError('ESERVFAIL'));
  });

  it('leaves an ACTIVE domain ACTIVE when the resolver cannot be reached', async () => {
    await expectActiveDomainSurvivesDnsFailure('email_domain_verify_refused', dnsError('ECONNREFUSED'));
  });

  it('leaves an ACTIVE domain ACTIVE when Amazon SES returns a 5xx', async () => {
    const emailDomainId = 'email_domain_verify_ses_5xx';

    stubRow(emailDomainId, EmailDomainStatus.ACTIVE);
    stubHealthyDns(emailDomainId);
    mocks.sesSend.mockRejectedValue(sesError('InternalFailure', 503));

    const result = await verifyEmailDomain(emailDomainId);

    expect(result.isVerified).toBe(false);
    expect(result.status).toBe(EmailDomainStatus.ACTIVE);
    expect(mocks.emailDomainUpdate).not.toHaveBeenCalled();
    expect(mocks.logError).toHaveBeenCalledWith(expect.objectContaining({ msg: 'email_domain_ses_error' }));
  });

  it('leaves an ACTIVE domain ACTIVE when Amazon SES throttles the identity read', async () => {
    const emailDomainId = 'email_domain_verify_ses_throttled';

    stubRow(emailDomainId, EmailDomainStatus.ACTIVE);
    stubHealthyDns(emailDomainId);
    mocks.sesSend.mockRejectedValue(sesError('TooManyRequestsException', 429));

    const result = await verifyEmailDomain(emailDomainId);

    expect(result.isVerified).toBe(false);
    expect(result.status).toBe(EmailDomainStatus.ACTIVE);
    expect(mocks.emailDomainUpdate).not.toHaveBeenCalled();
  });

  it('downgrades an ACTIVE domain only on the third consecutive definitive negative', async () => {
    const emailDomainId = 'email_domain_verify_three_strikes';

    stubRow(emailDomainId, EmailDomainStatus.ACTIVE);
    stubMissingRequiredRecords();

    const first = await verifyEmailDomain(emailDomainId);
    const second = await verifyEmailDomain(emailDomainId);

    expect(first.status).toBe(EmailDomainStatus.ACTIVE);
    expect(second.status).toBe(EmailDomainStatus.ACTIVE);
    expect(mocks.emailDomainUpdate).not.toHaveBeenCalled();

    const third = await verifyEmailDomain(emailDomainId);

    expect(third.isVerified).toBe(false);
    expect(third.status).toBe(EmailDomainStatus.PENDING);
    expect(mocks.emailDomainUpdate).toHaveBeenCalledWith({
      where: { id: emailDomainId },
      data: { status: EmailDomainStatus.PENDING },
    });
    expect(mocks.logInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'downgraded',
        previousStatus: EmailDomainStatus.ACTIVE,
        nextStatus: EmailDomainStatus.PENDING,
      }),
    );
  });

  it('does not count an authoritative negative when the resolver cannot confirm the zone', async () => {
    const emailDomainId = 'email_domain_verify_broken_resolver';

    stubRow(emailDomainId, EmailDomainStatus.ACTIVE);
    stubMissingRequiredRecords();
    mocks.resolveSoa.mockRejectedValue(dnsError('ESERVFAIL'));

    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await verifyEmailDomain(emailDomainId);

      expect(result.status).toBe(EmailDomainStatus.ACTIVE);
    }

    expect(mocks.emailDomainUpdate).not.toHaveBeenCalled();
  });

  it('resets the negative streak once a verification succeeds again', async () => {
    const emailDomainId = 'email_domain_verify_streak_reset';

    stubRow(emailDomainId, EmailDomainStatus.ACTIVE);
    stubMissingRequiredRecords();

    await verifyEmailDomain(emailDomainId);
    await verifyEmailDomain(emailDomainId);

    stubHealthyDns(emailDomainId);

    const recovered = await verifyEmailDomain(emailDomainId);

    expect(recovered.isVerified).toBe(true);
    expect(mocks.emailDomainUpdate).toHaveBeenCalledTimes(1);

    stubMissingRequiredRecords();

    const afterRecovery = await verifyEmailDomain(emailDomainId);

    expect(afterRecovery.status).toBe(EmailDomainStatus.ACTIVE);
    expect(mocks.emailDomainUpdate).toHaveBeenCalledTimes(1);
  });

  it('never downgrades a PENDING domain, whatever DNS says', async () => {
    const emailDomainId = 'email_domain_verify_pending_negative';

    stubRow(emailDomainId);
    stubMissingRequiredRecords();

    for (let attempt = 0; attempt < 4; attempt++) {
      const result = await verifyEmailDomain(emailDomainId);

      expect(result.status).toBe(EmailDomainStatus.PENDING);
    }

    expect(mocks.emailDomainUpdate).not.toHaveBeenCalled();
  });

  it('activates a domain without an SPF record but warns about it', async () => {
    const emailDomainId = 'email_domain_verify_no_spf';

    stubRow(emailDomainId);
    stubTxt({
      [CHALLENGE_HOST]: [[expectedChallengeValue(emailDomainId)]],
      [DKIM_HOST]: [[`v=DKIM1; k=rsa; p=${PUBLIC_KEY}`]],
      [DOMAIN]: [['v=spf1 -all']],
    });

    const result = await verifyEmailDomain(emailDomainId);

    expect(result.isVerified).toBe(true);
    expect(mocks.logWarn).toHaveBeenCalledWith(expect.objectContaining({ msg: 'email_domain_missing_spf_record' }));
  });

  it('does not read a disauthorising SPF mechanism as authorising Amazon SES', async () => {
    const emailDomainId = 'email_domain_verify_negative_spf';

    stubRow(emailDomainId);
    stubTxt({
      [CHALLENGE_HOST]: [[expectedChallengeValue(emailDomainId)]],
      [DKIM_HOST]: [[`v=DKIM1; k=rsa; p=${PUBLIC_KEY}`]],
      [DOMAIN]: [['v=spf1 -include:amazonses.com -all']],
    });

    const result = await verifyEmailDomain(emailDomainId);

    expect(result.isVerified).toBe(true);
    expect(mocks.logWarn).toHaveBeenCalledWith(expect.objectContaining({ msg: 'email_domain_missing_spf_record' }));
  });

  it('downgrades when Amazon SES no longer holds the identity', async () => {
    const emailDomainId = 'email_domain_verify_ses_gone';

    stubRow(emailDomainId, EmailDomainStatus.ACTIVE);
    stubHealthyDns(emailDomainId);
    mocks.sesSend.mockRejectedValue(sesError('NotFoundException', 404));

    await verifyEmailDomain(emailDomainId);
    await verifyEmailDomain(emailDomainId);

    expect(mocks.emailDomainUpdate).not.toHaveBeenCalled();

    const third = await verifyEmailDomain(emailDomainId);

    expect(third.status).toBe(EmailDomainStatus.PENDING);
  });

  it('throws NOT_FOUND for an unknown id', async () => {
    await expect(verifyEmailDomain('email_domain_missing')).rejects.toMatchObject({
      code: AppErrorCode.NOT_FOUND,
    });
  });

  it('throws NOT_SETUP and touches nothing when Amazon SES is unconfigured', async () => {
    vi.stubEnv('NEXT_PRIVATE_SES_ACCESS_KEY_ID', '');

    await expect(verifyEmailDomain('email_domain_no_ses')).rejects.toMatchObject({
      code: AppErrorCode.NOT_SETUP,
    });

    expect(mocks.emailDomainFindUnique).not.toHaveBeenCalled();
    expect(mocks.resolveTxt).not.toHaveBeenCalled();
    expect(mocks.sesSend).not.toHaveBeenCalled();
  });

  it('rate limits verification per organisation', async () => {
    const emailDomainId = 'email_domain_verify_rate_limited';

    stubRow(emailDomainId);
    mocks.rateLimitUpsert.mockResolvedValue({ count: 9999 });

    await expect(verifyEmailDomain(emailDomainId)).rejects.toMatchObject({
      code: AppErrorCode.TOO_MANY_REQUESTS,
    });

    expect(mocks.resolveTxt).not.toHaveBeenCalled();
  });
});
