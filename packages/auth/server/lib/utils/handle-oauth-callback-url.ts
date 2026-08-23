import { formatPath, NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';
import {
  isDisposableEmail,
  isEmailDomainAllowedForSignup,
  isSignupEnabledForProvider,
} from '@documenso/lib/constants/auth';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { syncDosProfileAndOrgs, type DosOrgClaim } from '@documenso/lib/server-only/dos-id/sync-dos-profile';
import { getEmailBlocklistDomains } from '@documenso/lib/server-only/site-settings/get-email-blocklist-domains';
import { onCreateUserHook } from '@documenso/lib/server-only/user/create-user';
import { deletedServiceAccountEmail } from '@documenso/lib/server-only/user/service-accounts/deleted-account';
import { legacyServiceAccountEmail } from '@documenso/lib/server-only/user/service-accounts/legacy-service-account';
import { isValidReturnTo, normalizeReturnTo } from '@documenso/lib/utils/is-valid-return-to';
import { prisma } from '@documenso/prisma';
import { UserSecurityAuditLogType } from '@prisma/client';
import { decodeIdToken, OAuth2Client } from 'arctic';
import type { Context } from 'hono';
import { deleteCookie } from 'hono/cookie';

import type { OAuthClientOptions } from '../../config';
import { AuthenticationErrorCode } from '../errors/error-codes';
import { onAuthorize } from './authorizer';
import { getOpenIdConfiguration } from './open-id';

type HandleOAuthCallbackUrlOptions = {
  c: Context;
  clientOptions: OAuthClientOptions;
};

export const handleOAuthCallbackUrl = async (options: HandleOAuthCallbackUrlOptions) => {
  const { c, clientOptions } = options;

  const requestMeta = c.get('requestMetadata');

  const { email, name, sub, accessToken, accessTokenExpiresAt, idToken, redirectPath, avatarUrl, organizations } = await validateOauth({
    c,
    clientOptions,
  });

  if (email.toLowerCase() === legacyServiceAccountEmail() || email.toLowerCase() === deletedServiceAccountEmail()) {
    return c.text('FORBIDDEN', 403);
  }

  // Find the account if possible.
  const existingAccount = await prisma.account.findFirst({
    where: {
      provider: clientOptions.id,
      providerAccountId: sub,
    },
    include: {
      user: {
        select: {
          id: true,
        },
      },
    },
  });

  // Directly log in user if account already exists.
  if (existingAccount) {
    // Sync profile and organizations on each login
    await syncDosProfileAndOrgs({
      userId: existingAccount.user.id,
      email,
      name,
      avatarUrl,
      organizations,
    }).catch((err) => {
      console.error('[DOS ID] Error syncing profile on login:', err);
    });

    await onAuthorize({ userId: existingAccount.user.id }, c);

    return c.redirect(redirectPath, 302);
  }

  const userWithSameEmail = await prisma.user.findFirst({
    where: {
      email: email,
    },
    select: {
      id: true,
      emailVerified: true,
    },
  });

  // Handle existing user but no account.
  if (userWithSameEmail) {
    await prisma.$transaction(async (tx) => {
      await tx.account.create({
        data: {
          type: 'oauth',
          provider: clientOptions.id,
          providerAccountId: sub,
          access_token: accessToken,
          expires_at: Math.floor(accessTokenExpiresAt.getTime() / 1000),
          token_type: 'Bearer',
          id_token: idToken,
          userId: userWithSameEmail.id,
        },
      });

      // Log link event.
      await tx.userSecurityAuditLog.create({
        data: {
          userId: userWithSameEmail.id,
          ipAddress: requestMeta.ipAddress,
          userAgent: requestMeta.userAgent,
          type: UserSecurityAuditLogType.ACCOUNT_SSO_LINK,
        },
      });

      // If account already exists in an unverified state, remove the password to ensure
      // they cannot sign in since we cannot confirm the password was set by the user.
      if (!userWithSameEmail.emailVerified) {
        await tx.user.update({
          where: {
            id: userWithSameEmail.id,
          },
          data: {
            emailVerified: new Date(),
            password: null,
            // Todo: (RR7) Will need to update the "password" account after the migration.
          },
        });
      }
    });

    // Sync profile and organizations on account link
    await syncDosProfileAndOrgs({
      userId: userWithSameEmail.id,
      email,
      name,
      avatarUrl,
      organizations,
    }).catch((err) => {
      console.error('[DOS ID] Error syncing profile on link:', err);
    });

    await onAuthorize({ userId: userWithSameEmail.id }, c);

    return c.redirect(redirectPath, 302);
  }

  // Check if signups are disabled for this provider.
  if (!isSignupEnabledForProvider(clientOptions.id as 'google' | 'microsoft' | 'oidc')) {
    const errorUrl = new URL(formatPath('/signin'), NEXT_PUBLIC_WEBAPP_URL());

    errorUrl.searchParams.set('error', AuthenticationErrorCode.SignupDisabled);

    return c.redirect(errorUrl.toString(), 302);
  }

  // Check domain restriction for new SSO users.
  if (!isEmailDomainAllowedForSignup(email)) {
    const errorUrl = new URL(formatPath('/signin'), NEXT_PUBLIC_WEBAPP_URL());

    errorUrl.searchParams.set('error', AuthenticationErrorCode.SignupDisabled);

    return c.redirect(errorUrl.toString(), 302);
  }

  // Reject disposable / throwaway email providers for new SSO users.
  const additionalBlockedDomains = await getEmailBlocklistDomains();

  if (isDisposableEmail(email, additionalBlockedDomains)) {
    const errorUrl = new URL(formatPath('/signin'), NEXT_PUBLIC_WEBAPP_URL());

    errorUrl.searchParams.set('error', AuthenticationErrorCode.SignupDisposableEmail);

    return c.redirect(errorUrl.toString(), 302);
  }

  // Handle new user.
  const createdUser = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: email,
        name: name,
        emailVerified: new Date(),
      },
    });

    await tx.account.create({
      data: {
        type: 'oauth',
        provider: clientOptions.id,
        providerAccountId: sub,
        access_token: accessToken,
        expires_at: Math.floor(accessTokenExpiresAt.getTime() / 1000),
        token_type: 'Bearer',
        id_token: idToken,
        userId: user.id,
      },
    });

    return user;
  });

  await onCreateUserHook(createdUser).catch((err) => {
    // Todo: (RR7) Add logging.
    console.error(err);
  });

  // Sync profile and organizations for new user
  await syncDosProfileAndOrgs({
    userId: createdUser.id,
    email,
    name,
    avatarUrl,
    organizations,
  }).catch((err) => {
    console.error('[DOS ID] Error syncing profile on signup:', err);
  });

  await onAuthorize({ userId: createdUser.id }, c);

  return c.redirect(redirectPath, 302);
};

export const validateOauth = async (options: HandleOAuthCallbackUrlOptions) => {
  const { c, clientOptions } = options;

  if (!clientOptions.clientId || !clientOptions.clientSecret) {
    throw new AppError(AppErrorCode.NOT_SETUP);
  }

  const { token_endpoint, userinfo_endpoint } = await getOpenIdConfiguration(clientOptions.wellKnownUrl, {
    requiredScopes: clientOptions.scope,
  });

  const oAuthClient = new OAuth2Client(clientOptions.clientId, clientOptions.clientSecret, clientOptions.redirectUrl);

  const code = c.req.query('code');
  const state = c.req.query('state');

  const storedState = deleteCookie(c, `${clientOptions.id}_oauth_state`);
  const storedCodeVerifier = deleteCookie(c, `${clientOptions.id}_code_verifier`);
  const storedRedirectPath = deleteCookie(c, `${clientOptions.id}_redirect_path`) ?? '';

  if (!code || !storedState || state !== storedState || !storedCodeVerifier) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Invalid or missing state',
    });
  }

  // eslint-disable-next-line prefer-const
  let [redirectState, redirectPath] = storedRedirectPath.split(' ');

  // The sub-path aware root, e.g. "/" or "/ESign/".
  const defaultRedirectPath = formatPath('/');

  if (redirectState !== storedState || !redirectPath) {
    redirectPath = defaultRedirectPath;
  }

  if (!isValidReturnTo(redirectPath)) {
    redirectPath = defaultRedirectPath;
  }

  redirectPath = normalizeReturnTo(redirectPath) || defaultRedirectPath;

  const tokens = await oAuthClient.validateAuthorizationCode(token_endpoint, code, storedCodeVerifier);

  const accessToken = tokens.accessToken();
  const accessTokenExpiresAt = tokens.accessTokenExpiresAt();
  const idToken = tokens.idToken();

  let userinfoClaims: Record<string, unknown> = {};
  if (userinfo_endpoint && accessToken) {
    try {
      const userinfoRes = await fetch(userinfo_endpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (userinfoRes.ok) {
        userinfoClaims = (await userinfoRes.json()) as Record<string, unknown>;
      }
    } catch (err) {
      console.warn('[DOS ID] Error fetching userinfo endpoint:', err);
    }
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const idTokenClaims = decodeIdToken(tokens.idToken()) as Record<string, unknown>;
  const claims = { ...idTokenClaims, ...userinfoClaims };

  const email = claims.email;
  const name = claims.name || claims.display_name;
  const sub = claims.sub;
  const avatarUrl = (typeof claims.picture === 'string' ? claims.picture : typeof claims.avatar_url === 'string' ? claims.avatar_url : null) as string | null;
  const rawOrgs = (claims.organizations || claims.orgs || (claims.user_metadata as Record<string, unknown> | undefined)?.organizations || (claims.app_metadata as Record<string, unknown> | undefined)?.organizations) as DosOrgClaim[] | undefined;
  const organizations = Array.isArray(rawOrgs) ? rawOrgs : undefined;

  if (typeof email !== 'string') {
    throw new AppError(AuthenticationErrorCode.InvalidRequest, {
      message: 'Missing email',
    });
  }

  if (typeof name !== 'string') {
    throw new AppError(AuthenticationErrorCode.InvalidRequest, {
      message: 'Missing name',
    });
  }

  if (typeof sub !== 'string') {
    throw new AppError(AuthenticationErrorCode.InvalidRequest, {
      message: 'Missing sub claim',
    });
  }

  if (claims.email_verified !== true && !clientOptions.bypassEmailVerification) {
    throw new AppError(AuthenticationErrorCode.UnverifiedEmail, {
      message: 'Account email is not verified',
    });
  }

  return {
    email,
    name,
    sub,
    accessToken,
    accessTokenExpiresAt,
    idToken,
    redirectPath,
    avatarUrl,
    organizations,
  };
};
