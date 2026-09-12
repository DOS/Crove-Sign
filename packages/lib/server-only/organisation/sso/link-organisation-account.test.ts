import { OrganisationMemberRole, UserSecurityAuditLogType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  // The link material is encrypted with the repository symmetric helper, so the
  // key has to exist before `constants/crypto` is first evaluated.
  process.env.NEXT_PRIVATE_ENCRYPTION_KEY = 'cleanroom-test-encryption-key';

  return {
    verificationTokenFindFirst: vi.fn(),
    verificationTokenUpdateMany: vi.fn(),
    verificationTokenDelete: vi.fn(),
    verificationTokenDeleteMany: vi.fn(),
    userFindFirst: vi.fn(),
    userUpdate: vi.fn(),
    organisationFindFirst: vi.fn(),
    organisationUpdate: vi.fn(),
    organisationMemberFindFirst: vi.fn(),
    accountFindFirst: vi.fn(),
    accountUpsert: vi.fn(),
    txUserUpdateMany: vi.fn(),
    transaction: vi.fn(),
    auditLogCreate: vi.fn(),
    addUserToOrganisation: vi.fn(),
  };
});

const transactionClient = {
  account: { upsert: mocks.accountUpsert },
  user: { updateMany: mocks.txUserUpdateMany },
};

vi.mock('@documenso/prisma', () => ({
  prisma: {
    verificationToken: {
      findFirst: mocks.verificationTokenFindFirst,
      updateMany: mocks.verificationTokenUpdateMany,
      delete: mocks.verificationTokenDelete,
      deleteMany: mocks.verificationTokenDeleteMany,
    },
    user: {
      findFirst: mocks.userFindFirst,
      update: mocks.userUpdate,
    },
    organisation: {
      findFirst: mocks.organisationFindFirst,
      update: mocks.organisationUpdate,
    },
    organisationMember: {
      findFirst: mocks.organisationMemberFindFirst,
    },
    account: {
      findFirst: mocks.accountFindFirst,
    },
    userSecurityAuditLog: {
      create: mocks.auditLogCreate,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock('../../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../accept-organisation-invitation', () => ({
  addUserToOrganisation: mocks.addUserToOrganisation,
}));

import {
  ORGANISATION_ACCOUNT_LINK_VERIFICATION_TOKEN_IDENTIFIER,
  ORGANISATION_USER_ACCOUNT_TYPE,
} from '../../../constants/organisations';
import { ONE_MINUTE } from '../../../constants/time';
import { AppError, AppErrorCode } from '../../../errors/app-error';
import { linkOrganisationAccount } from './link-organisation-account';
import { encryptOrganisationAccountLinkOauthConfig } from './link-token';

const TOKEN = 'confirmation-token-value';
const TOKEN_SECONDARY_ID = 'vt_secondary_1';
const VERIFICATION_TOKEN_ID = 7;
const USER_ID = 42;
const USER_EMAIL = 'alice@example.com';
const ORGANISATION_ID = 'org_123';
const PROVIDER_ACCOUNT_ID = 'oidc-subject-1';
const ACCESS_TOKEN = 'sso-access-token-secret-value';
const ID_TOKEN = 'sso-id-token-secret-value';
const ACCESS_TOKEN_EXPIRES_AT = 1_900_000_000;

const REQUEST_META = { ipAddress: '203.0.113.7', userAgent: 'vitest-agent' };

type PortalRow = {
  id: string;
  enabled: boolean;
  defaultOrganisationRole: OrganisationMemberRole;
  autoProvisionUsers: boolean;
  allowedDomains: string[];
  allowPersonalOrganisations: boolean;
};

type GroupRow = {
  id: string;
  type: string;
  organisationRole: OrganisationMemberRole;
};

type OrganisationRow = {
  id: string;
  name: string;
  url: string;
  groups: GroupRow[];
  organisationAuthenticationPortal: PortalRow;
};

type VerificationTokenRow = {
  id: number;
  secondaryId: string;
  identifier: string;
  token: string;
  completed: boolean;
  expires: Date;
  createdAt: Date;
  metadata: unknown;
  userId: number;
};

type UserRow = {
  id: number;
  email: string;
  emailVerified: Date | null;
};

type AddUserToOrganisationArgs = {
  userId: number;
  organisationId: string;
  organisationGroups: GroupRow[];
  organisationMemberRole: OrganisationMemberRole;
};

type AccountUpsertArgs = {
  where: { provider_providerAccountId: { provider: string; providerAccountId: string } };
  create: Record<string, unknown>;
  update: Record<string, unknown>;
};

type AuditLogCreateArgs = {
  data: {
    userId: number;
    ipAddress: string | undefined;
    userAgent: string | undefined;
    type: UserSecurityAuditLogType;
  };
};

const buildGroups = (): GroupRow[] => [
  { id: 'group_admin', type: 'INTERNAL_ORGANISATION', organisationRole: OrganisationMemberRole.ADMIN },
  { id: 'group_manager', type: 'INTERNAL_ORGANISATION', organisationRole: OrganisationMemberRole.MANAGER },
  { id: 'group_member', type: 'INTERNAL_ORGANISATION', organisationRole: OrganisationMemberRole.MEMBER },
];

const buildPortal = (overrides: Partial<PortalRow> = {}): PortalRow => ({
  id: 'portal_1',
  enabled: true,
  defaultOrganisationRole: OrganisationMemberRole.MANAGER,
  autoProvisionUsers: true,
  allowedDomains: ['example.com'],
  allowPersonalOrganisations: false,
  ...overrides,
});

const buildOrganisation = (portalOverrides: Partial<PortalRow> = {}): OrganisationRow => ({
  id: ORGANISATION_ID,
  name: 'Example Organisation',
  url: 'example',
  groups: buildGroups(),
  organisationAuthenticationPortal: buildPortal(portalOverrides),
});

const buildMetadata = (overrides: Record<string, unknown> = {}) => ({
  type: 'link',
  userId: USER_ID,
  organisationId: ORGANISATION_ID,
  oauthConfig: encryptOrganisationAccountLinkOauthConfig({
    accessToken: ACCESS_TOKEN,
    idToken: ID_TOKEN,
    providerAccountId: PROVIDER_ACCOUNT_ID,
    expiresAt: ACCESS_TOKEN_EXPIRES_AT,
  }),
  ...overrides,
});

const buildVerificationToken = (overrides: Partial<VerificationTokenRow> = {}): VerificationTokenRow => ({
  id: VERIFICATION_TOKEN_ID,
  secondaryId: TOKEN_SECONDARY_ID,
  identifier: ORGANISATION_ACCOUNT_LINK_VERIFICATION_TOKEN_IDENTIFIER,
  token: TOKEN,
  completed: false,
  expires: new Date(Date.now() + 30 * ONE_MINUTE),
  createdAt: new Date(),
  metadata: buildMetadata(),
  userId: USER_ID,
  ...overrides,
});

const buildUser = (overrides: Partial<UserRow> = {}): UserRow => ({
  id: USER_ID,
  email: USER_EMAIL,
  emailVerified: null,
  ...overrides,
});

const arrangeHappyPath = () => {
  mocks.transaction.mockImplementation(async (runInTransaction: (tx: typeof transactionClient) => Promise<unknown>) =>
    runInTransaction(transactionClient),
  );

  mocks.verificationTokenFindFirst.mockResolvedValue(buildVerificationToken());
  mocks.verificationTokenUpdateMany.mockResolvedValue({ count: 1 });
  mocks.userFindFirst.mockResolvedValue(buildUser());
  mocks.organisationFindFirst.mockResolvedValue(buildOrganisation());
  mocks.organisationMemberFindFirst.mockResolvedValue(null);
  mocks.accountFindFirst.mockResolvedValue(null);
  mocks.accountUpsert.mockResolvedValue({ id: 'account_1' });
  mocks.txUserUpdateMany.mockResolvedValue({ count: 1 });
  mocks.auditLogCreate.mockResolvedValue({ id: 1 });
  mocks.addUserToOrganisation.mockResolvedValue(undefined);
};

/**
 * Every refusal that has a resolved user must be audited. An unknown token is
 * handled separately: with no user there is nothing to key an audit row on.
 */
const refusalScenarios: { name: string; arrange: () => void }[] = [
  {
    name: 'the token was already used',
    arrange: () => mocks.verificationTokenFindFirst.mockResolvedValue(buildVerificationToken({ completed: true })),
  },
  {
    name: 'the token expired',
    arrange: () =>
      mocks.verificationTokenFindFirst.mockResolvedValue(
        buildVerificationToken({ expires: new Date(Date.now() - ONE_MINUTE) }),
      ),
  },
  {
    name: 'the token metadata is malformed',
    arrange: () =>
      mocks.verificationTokenFindFirst.mockResolvedValue(buildVerificationToken({ metadata: { type: 'link' } })),
  },
  {
    name: 'the token metadata points at another user',
    arrange: () =>
      mocks.verificationTokenFindFirst.mockResolvedValue(
        buildVerificationToken({ metadata: buildMetadata({ userId: USER_ID + 1 }) }),
      ),
  },
  {
    name: 'the user no longer exists',
    arrange: () => mocks.userFindFirst.mockResolvedValue(null),
  },
  {
    name: 'the organisation no longer exists',
    arrange: () => mocks.organisationFindFirst.mockResolvedValue(null),
  },
  {
    name: 'the portal was disabled',
    arrange: () => mocks.organisationFindFirst.mockResolvedValue(buildOrganisation({ enabled: false })),
  },
  {
    name: 'the email domain is no longer allowed',
    arrange: () =>
      mocks.organisationFindFirst.mockResolvedValue(buildOrganisation({ allowedDomains: ['example.org'] })),
  },
  {
    name: 'auto provisioning was disabled',
    arrange: () => mocks.organisationFindFirst.mockResolvedValue(buildOrganisation({ autoProvisionUsers: false })),
  },
  {
    name: 'the provider account belongs to somebody else',
    arrange: () => mocks.accountFindFirst.mockResolvedValue({ id: 'account_1', userId: USER_ID + 1 }),
  },
  {
    name: 'the token was redeemed concurrently',
    arrange: () => mocks.verificationTokenUpdateMany.mockResolvedValue({ count: 0 }),
  },
];

describe('linkOrganisationAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    arrangeHappyPath();
  });

  it('adds the user with the portal default role, persists the oidc account and completes the token', async () => {
    await linkOrganisationAccount({ token: TOKEN, requestMeta: REQUEST_META });

    expect(mocks.verificationTokenFindFirst).toHaveBeenCalledWith({
      where: {
        token: TOKEN,
        identifier: ORGANISATION_ACCOUNT_LINK_VERIFICATION_TOKEN_IDENTIFIER,
      },
    });

    expect(mocks.verificationTokenUpdateMany).toHaveBeenCalledWith({
      where: { id: VERIFICATION_TOKEN_ID, completed: false },
      data: { completed: true },
    });

    const [addUserArgs] = mocks.addUserToOrganisation.mock.calls[0] as unknown as [AddUserToOrganisationArgs];

    expect(addUserArgs).toEqual({
      userId: USER_ID,
      organisationId: ORGANISATION_ID,
      organisationGroups: buildGroups(),
      organisationMemberRole: OrganisationMemberRole.MANAGER,
    });

    const [accountUpsertArgs] = mocks.accountUpsert.mock.calls[0] as unknown as [AccountUpsertArgs];

    expect(accountUpsertArgs.where.provider_providerAccountId).toEqual({
      provider: ORGANISATION_ID,
      providerAccountId: PROVIDER_ACCOUNT_ID,
    });
    expect(accountUpsertArgs.create).toMatchObject({
      userId: USER_ID,
      type: ORGANISATION_USER_ACCOUNT_TYPE,
      provider: ORGANISATION_ID,
      providerAccountId: PROVIDER_ACCOUNT_ID,
      access_token: ACCESS_TOKEN,
      id_token: ID_TOKEN,
      expires_at: ACCESS_TOKEN_EXPIRES_AT,
    });

    expect(mocks.auditLogCreate).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        ipAddress: REQUEST_META.ipAddress,
        userAgent: REQUEST_META.userAgent,
        type: UserSecurityAuditLogType.ORGANISATION_SSO_LINK,
      },
    });
  });

  it('validates before consuming: an expired token is left untouched', async () => {
    mocks.verificationTokenFindFirst.mockResolvedValue(
      buildVerificationToken({ expires: new Date(Date.now() - ONE_MINUTE) }),
    );

    await expect(linkOrganisationAccount({ token: TOKEN, requestMeta: REQUEST_META })).rejects.toMatchObject({
      code: AppErrorCode.INVALID_REQUEST,
    });

    expect(mocks.verificationTokenUpdateMany).not.toHaveBeenCalled();
    expect(mocks.verificationTokenDelete).not.toHaveBeenCalled();
    expect(mocks.verificationTokenDeleteMany).not.toHaveBeenCalled();
    expect(mocks.addUserToOrganisation).not.toHaveBeenCalled();
    expect(mocks.accountUpsert).not.toHaveBeenCalled();
  });

  it('validates before consuming: malformed metadata is left untouched', async () => {
    mocks.verificationTokenFindFirst.mockResolvedValue(buildVerificationToken({ metadata: { type: 'link' } }));

    await expect(linkOrganisationAccount({ token: TOKEN, requestMeta: REQUEST_META })).rejects.toMatchObject({
      code: AppErrorCode.INVALID_REQUEST,
    });

    expect(mocks.verificationTokenUpdateMany).not.toHaveBeenCalled();
    expect(mocks.verificationTokenDelete).not.toHaveBeenCalled();
    expect(mocks.userFindFirst).not.toHaveBeenCalled();
    expect(mocks.addUserToOrganisation).not.toHaveBeenCalled();
  });

  it('refuses an already completed token without creating a second membership', async () => {
    mocks.verificationTokenFindFirst.mockResolvedValue(buildVerificationToken({ completed: true }));

    await expect(linkOrganisationAccount({ token: TOKEN, requestMeta: REQUEST_META })).rejects.toMatchObject({
      code: AppErrorCode.INVALID_REQUEST,
    });

    expect(mocks.verificationTokenUpdateMany).not.toHaveBeenCalled();
    expect(mocks.verificationTokenDelete).not.toHaveBeenCalled();
    expect(mocks.addUserToOrganisation).not.toHaveBeenCalled();
    expect(mocks.organisationMemberFindFirst).not.toHaveBeenCalled();
  });

  it('refuses an unknown token and leaves no audit trail for it', async () => {
    mocks.verificationTokenFindFirst.mockResolvedValue(null);

    await expect(linkOrganisationAccount({ token: TOKEN, requestMeta: REQUEST_META })).rejects.toMatchObject({
      code: AppErrorCode.INVALID_REQUEST,
    });

    expect(mocks.userFindFirst).not.toHaveBeenCalled();
    expect(mocks.auditLogCreate).not.toHaveBeenCalled();
  });

  it('refuses when the email domain is no longer permitted by the portal', async () => {
    mocks.organisationFindFirst.mockResolvedValue(buildOrganisation({ allowedDomains: ['example.org'] }));

    await expect(linkOrganisationAccount({ token: TOKEN, requestMeta: REQUEST_META })).rejects.toMatchObject({
      code: AppErrorCode.INVALID_REQUEST,
    });

    expect(mocks.addUserToOrganisation).not.toHaveBeenCalled();
    expect(mocks.auditLogCreate).toHaveBeenCalledOnce();
  });

  it('permits any domain when the portal does not restrict them', async () => {
    mocks.organisationFindFirst.mockResolvedValue(buildOrganisation({ allowedDomains: [] }));

    await expect(linkOrganisationAccount({ token: TOKEN, requestMeta: REQUEST_META })).resolves.toBeUndefined();

    expect(mocks.addUserToOrganisation).toHaveBeenCalledOnce();
  });

  it('refuses when the portal has been disabled', async () => {
    mocks.organisationFindFirst.mockResolvedValue(buildOrganisation({ enabled: false }));

    await expect(linkOrganisationAccount({ token: TOKEN, requestMeta: REQUEST_META })).rejects.toMatchObject({
      code: AppErrorCode.INVALID_REQUEST,
    });

    expect(mocks.addUserToOrganisation).not.toHaveBeenCalled();
    expect(mocks.verificationTokenUpdateMany).not.toHaveBeenCalled();
    expect(mocks.auditLogCreate).toHaveBeenCalledOnce();
  });

  it('never writes a password while linking', async () => {
    await linkOrganisationAccount({ token: TOKEN, requestMeta: REQUEST_META });

    expect(mocks.userUpdate).not.toHaveBeenCalled();

    const userWrites = JSON.stringify(mocks.txUserUpdateMany.mock.calls);

    expect(userWrites).not.toContain('password');
    expect(userWrites).toContain('emailVerified');
    expect(JSON.stringify(mocks.accountUpsert.mock.calls)).not.toContain('"password"');
  });

  it('sets emailVerified when it is still null', async () => {
    mocks.userFindFirst.mockResolvedValue(buildUser({ emailVerified: null }));

    await linkOrganisationAccount({ token: TOKEN, requestMeta: REQUEST_META });

    expect(mocks.txUserUpdateMany).toHaveBeenCalledWith({
      where: { id: USER_ID, emailVerified: null },
      data: { emailVerified: expect.any(Date) },
    });
  });

  it('preserves an existing emailVerified timestamp', async () => {
    mocks.userFindFirst.mockResolvedValue(buildUser({ emailVerified: new Date('2024-01-01T00:00:00.000Z') }));

    await linkOrganisationAccount({ token: TOKEN, requestMeta: REQUEST_META });

    // The write is guarded by `emailVerified: null`, so an account verified
    // earlier is never re-stamped — and here it is skipped entirely.
    expect(mocks.txUserUpdateMany).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.addUserToOrganisation).toHaveBeenCalledOnce();
  });

  it('clamps the granted role to the portal default and never grants ownership', async () => {
    mocks.organisationFindFirst.mockResolvedValue(
      buildOrganisation({ defaultOrganisationRole: OrganisationMemberRole.MEMBER }),
    );

    await linkOrganisationAccount({ token: TOKEN, requestMeta: REQUEST_META });

    const [addUserArgs] = mocks.addUserToOrganisation.mock.calls[0] as unknown as [AddUserToOrganisationArgs];

    expect(addUserArgs.organisationMemberRole).toBe(OrganisationMemberRole.MEMBER);
    expect(addUserArgs.organisationMemberRole).not.toBe(OrganisationMemberRole.ADMIN);
    expect(mocks.organisationUpdate).not.toHaveBeenCalled();
  });

  it('does not create a second membership for an existing member', async () => {
    mocks.organisationMemberFindFirst.mockResolvedValue({ id: 'member_1' });

    await linkOrganisationAccount({ token: TOKEN, requestMeta: REQUEST_META });

    expect(mocks.addUserToOrganisation).not.toHaveBeenCalled();
    expect(mocks.accountUpsert).toHaveBeenCalledOnce();
  });

  it('links an existing member even when auto provisioning is disabled', async () => {
    mocks.organisationFindFirst.mockResolvedValue(buildOrganisation({ autoProvisionUsers: false }));
    mocks.organisationMemberFindFirst.mockResolvedValue({ id: 'member_1' });

    await linkOrganisationAccount({ token: TOKEN, requestMeta: REQUEST_META });

    expect(mocks.addUserToOrganisation).not.toHaveBeenCalled();
    expect(mocks.accountUpsert).toHaveBeenCalledOnce();
  });

  it('releases the claim when provisioning fails and hides the underlying error', async () => {
    mocks.addUserToOrganisation.mockRejectedValue(new Error('database exploded'));

    let caughtError: unknown;

    try {
      await linkOrganisationAccount({ token: TOKEN, requestMeta: REQUEST_META });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(AppError);

    const appError = AppError.parseError(caughtError);

    expect(appError.code).toBe(AppErrorCode.UNKNOWN_ERROR);
    expect(appError.message).not.toContain('database exploded');

    expect(mocks.verificationTokenUpdateMany).toHaveBeenLastCalledWith({
      where: { id: VERIFICATION_TOKEN_ID },
      data: { completed: false },
    });
  });

  describe('refusals', () => {
    for (const scenario of refusalScenarios) {
      it(`audits the refusal when ${scenario.name}`, async () => {
        scenario.arrange();

        await expect(linkOrganisationAccount({ token: TOKEN, requestMeta: REQUEST_META })).rejects.toBeInstanceOf(
          AppError,
        );

        expect(mocks.auditLogCreate).toHaveBeenCalledOnce();

        const [auditArgs] = mocks.auditLogCreate.mock.calls[0] as unknown as [AuditLogCreateArgs];

        expect(auditArgs.data).toEqual({
          userId: USER_ID,
          ipAddress: REQUEST_META.ipAddress,
          userAgent: REQUEST_META.userAgent,
          type: UserSecurityAuditLogType.ORGANISATION_SSO_LINK,
        });
      });
    }

    it('reports every refusal identically to the caller', async () => {
      const reportedErrors = new Set<string>();

      for (const scenario of refusalScenarios) {
        vi.clearAllMocks();
        arrangeHappyPath();
        scenario.arrange();

        let caughtError: unknown;

        try {
          await linkOrganisationAccount({ token: TOKEN, requestMeta: REQUEST_META });
        } catch (error) {
          caughtError = error;
        }

        const appError = AppError.parseError(caughtError);

        reportedErrors.add(`${appError.code}:${appError.message}:${appError.userMessage}`);
      }

      expect(reportedErrors.size).toBe(1);
    });
  });
});
