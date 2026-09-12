import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  // `DOCUMENSO_ENCRYPTION_KEY` and the webapp url are read from the environment
  // when their modules are first evaluated, so they have to be in place before
  // any import below runs.
  process.env.NEXT_PRIVATE_ENCRYPTION_KEY = 'cleanroom-test-encryption-key';
  process.env.NEXT_PUBLIC_WEBAPP_URL = 'https://sign.example.com';

  return {
    userFindFirst: vi.fn(),
    verificationTokenCreate: vi.fn(),
    auditLogCreate: vi.fn(),
    getEmailContext: vi.fn(),
    renderEmailWithI18N: vi.fn(),
    getI18nInstance: vi.fn(),
    sendMail: vi.fn(),
    emailTemplate: () => null,
  };
});

vi.mock('@documenso/prisma', () => ({
  prisma: {
    user: {
      findFirst: mocks.userFindFirst,
    },
    verificationToken: {
      create: mocks.verificationTokenCreate,
    },
    userSecurityAuditLog: {
      create: mocks.auditLogCreate,
    },
  },
}));

vi.mock('@documenso/email/templates/organisation-account-link-confirmation', () => ({
  OrganisationAccountLinkConfirmationTemplate: mocks.emailTemplate,
}));

vi.mock('../../../client-only/providers/i18n-server', () => ({
  getI18nInstance: mocks.getI18nInstance,
}));

vi.mock('../../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../utils/render-email-with-i18n', () => ({
  renderEmailWithI18N: mocks.renderEmailWithI18N,
}));

vi.mock('../../email/get-email-context', () => ({
  getEmailContext: mocks.getEmailContext,
}));

import { ORGANISATION_ACCOUNT_LINK_VERIFICATION_TOKEN_IDENTIFIER } from '../../../constants/organisations';
import { ONE_DAY } from '../../../constants/time';
import { AppErrorCode } from '../../../errors/app-error';
import { ZOrganisationAccountLinkMetadataSchema } from '../../../types/organisation';
import { decryptOrganisationAccountLinkOauthConfig } from './link-token';
import { sendOrganisationAccountLinkConfirmationEmail } from './send-sso-link-confirmation-email';

const USER_ID = 42;
const USER_EMAIL = 'alice@example.com';
const ORGANISATION_ID = 'org_123';
const ORGANISATION_NAME = 'Example Organisation';
const ACCESS_TOKEN = 'sso-access-token-secret-value';
const ID_TOKEN = 'sso-id-token-secret-value';
const PROVIDER_ACCOUNT_ID = 'oidc-subject-1';
const ACCESS_TOKEN_EXPIRES_AT = 1_900_000_000;
const TOKEN_SECONDARY_ID = 'vt_secondary_1';

const buildOptions = (type: 'link' | 'create') => ({
  type,
  userId: USER_ID,
  organisationId: ORGANISATION_ID,
  organisationName: ORGANISATION_NAME,
  oauthConfig: {
    accessToken: ACCESS_TOKEN,
    idToken: ID_TOKEN,
    providerAccountId: PROVIDER_ACCOUNT_ID,
    expiresAt: ACCESS_TOKEN_EXPIRES_AT,
  },
});

type VerificationTokenCreateArgs = {
  data: {
    identifier: string;
    token: string;
    expires: Date;
    metadata: unknown;
    user: { connect: { id: number } };
  };
};

type RenderedEmailElement = {
  props: {
    type: 'link' | 'create';
    confirmationLink: string;
    organisationName: string;
    assetBaseUrl: string;
  };
};

type SendMailArgs = {
  to: string;
  from: { name: string; address: string };
  subject: string;
  html: string;
  text: string;
};

const getCreatedTokenArgs = () => {
  const [createArgs] = mocks.verificationTokenCreate.mock.calls[0] as unknown as [VerificationTokenCreateArgs];

  return createArgs;
};

describe('sendOrganisationAccountLinkConfirmationEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.userFindFirst.mockResolvedValue({ id: USER_ID, email: USER_EMAIL });
    mocks.verificationTokenCreate.mockResolvedValue({ id: 1, secondaryId: TOKEN_SECONDARY_ID });
    mocks.auditLogCreate.mockResolvedValue({ id: 1 });
    mocks.renderEmailWithI18N.mockResolvedValue('<html></html>');
    mocks.getI18nInstance.mockResolvedValue({ _: () => 'confirmation subject' });
    mocks.sendMail.mockResolvedValue({ messageId: 'message-1' });
    mocks.getEmailContext.mockResolvedValue({
      branding: { brandingEnabled: false },
      emailLanguage: 'en-US',
      senderEmail: { name: ORGANISATION_NAME, address: 'sso@example.com' },
      emailsDisabled: false,
      emailTransport: { sendMail: mocks.sendMail },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('persists the oauth material encrypted, with an expiry inside 24 hours', async () => {
    const issuedAt = Date.now();

    await sendOrganisationAccountLinkConfirmationEmail(buildOptions('link'));

    expect(mocks.verificationTokenCreate).toHaveBeenCalledOnce();

    const createArgs = getCreatedTokenArgs();

    expect(createArgs.data.identifier).toBe(ORGANISATION_ACCOUNT_LINK_VERIFICATION_TOKEN_IDENTIFIER);
    expect(createArgs.data.user.connect.id).toBe(USER_ID);
    // 256 bits of entropy, base64url encoded.
    expect(createArgs.data.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const storedMetadata = JSON.stringify(createArgs.data.metadata);

    expect(storedMetadata).not.toContain(ACCESS_TOKEN);
    expect(storedMetadata).not.toContain(ID_TOKEN);
    expect(storedMetadata).not.toContain(PROVIDER_ACCOUNT_ID);

    const metadata = ZOrganisationAccountLinkMetadataSchema.parse(createArgs.data.metadata);

    expect(metadata.type).toBe('link');
    expect(metadata.userId).toBe(USER_ID);
    expect(metadata.organisationId).toBe(ORGANISATION_ID);
    expect(decryptOrganisationAccountLinkOauthConfig(metadata.oauthConfig)).toEqual({
      accessToken: ACCESS_TOKEN,
      idToken: ID_TOKEN,
      providerAccountId: PROVIDER_ACCOUNT_ID,
      expiresAt: ACCESS_TOKEN_EXPIRES_AT,
    });

    const expiresAt = createArgs.data.expires.getTime();

    expect(expiresAt).toBeGreaterThan(issuedAt);
    expect(expiresAt - issuedAt).toBeLessThanOrEqual(ONE_DAY);
  });

  it('throws NOT_SETUP and persists nothing when the webapp url is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_WEBAPP_URL', '');

    await expect(sendOrganisationAccountLinkConfirmationEmail(buildOptions('link'))).rejects.toMatchObject({
      code: AppErrorCode.NOT_SETUP,
    });

    expect(mocks.verificationTokenCreate).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the user no longer exists', async () => {
    mocks.userFindFirst.mockResolvedValue(null);

    await expect(sendOrganisationAccountLinkConfirmationEmail(buildOptions('link'))).rejects.toMatchObject({
      code: AppErrorCode.NOT_FOUND,
    });

    expect(mocks.verificationTokenCreate).not.toHaveBeenCalled();
  });

  it('renders the existing template through the i18n renderer and sends it via the organisation context', async () => {
    await sendOrganisationAccountLinkConfirmationEmail(buildOptions('create'));

    expect(mocks.getEmailContext).toHaveBeenCalledWith({
      emailType: 'INTERNAL',
      source: { type: 'organisation', organisationId: ORGANISATION_ID },
    });

    // Once for html, once for the plain text alternative.
    expect(mocks.renderEmailWithI18N).toHaveBeenCalledTimes(2);
    expect(mocks.renderEmailWithI18N.mock.calls[0][1]).toMatchObject({ lang: 'en-US' });
    expect(mocks.renderEmailWithI18N.mock.calls[0][1]).not.toHaveProperty('plainText');
    expect(mocks.renderEmailWithI18N.mock.calls[1][1]).toMatchObject({ lang: 'en-US', plainText: true });

    const [renderedElement] = mocks.renderEmailWithI18N.mock.calls[0] as unknown as [RenderedEmailElement];
    const createdToken = getCreatedTokenArgs().data.token;

    expect(renderedElement.props.type).toBe('create');
    expect(renderedElement.props.organisationName).toBe(ORGANISATION_NAME);
    expect(renderedElement.props.assetBaseUrl).toBe('https://sign.example.com');
    expect(renderedElement.props.confirmationLink).toBe(
      `https://sign.example.com/organisation/sso/confirmation/${createdToken}`,
    );

    const [mailArgs] = mocks.sendMail.mock.calls[0] as unknown as [SendMailArgs];

    expect(mailArgs.to).toBe(USER_EMAIL);
    expect(mailArgs.from.address).toBe('sso@example.com');
    expect(mailArgs.subject).toBe('confirmation subject');
  });

  it('audits the issued confirmation against the user', async () => {
    await sendOrganisationAccountLinkConfirmationEmail(buildOptions('link'));

    expect(mocks.auditLogCreate).toHaveBeenCalledOnce();

    const [auditArgs] = mocks.auditLogCreate.mock.calls[0] as unknown as [{ data: Record<string, unknown> }];

    expect(auditArgs.data.userId).toBe(USER_ID);
    // The token itself is a bearer credential and must never be audited.
    expect(JSON.stringify(auditArgs.data)).not.toContain(getCreatedTokenArgs().data.token);
  });

  it('fails loudly when the organisation is not allowed to send email', async () => {
    mocks.getEmailContext.mockResolvedValue({
      branding: { brandingEnabled: false },
      emailLanguage: 'en-US',
      senderEmail: { name: ORGANISATION_NAME, address: 'sso@example.com' },
      emailsDisabled: true,
      emailTransport: { sendMail: mocks.sendMail },
    });

    await expect(sendOrganisationAccountLinkConfirmationEmail(buildOptions('link'))).rejects.toMatchObject({
      code: AppErrorCode.NOT_SETUP,
    });

    expect(mocks.verificationTokenCreate).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
});
