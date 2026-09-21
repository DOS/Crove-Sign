import { authClient } from '@documenso/auth/client';
import { getOptionalSession } from '@documenso/auth/server/lib/utils/get-session';
import {
  IS_GOOGLE_SSO_ENABLED,
  IS_MICROSOFT_SSO_ENABLED,
  IS_OIDC_AUTO_REDIRECT_DISABLED,
  IS_OIDC_SSO_ENABLED,
  isSignupEnabledForProvider,
  OIDC_PROVIDER_LABEL,
} from '@documenso/lib/constants/auth';
import { isValidReturnTo, normalizeReturnTo } from '@documenso/lib/utils/is-valid-return-to';
import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { Loader2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { redirect, useSearchParams } from 'react-router';

import { SignUpForm } from '~/components/forms/signup';
import { appMetaTags } from '~/utils/meta';

import type { Route } from './+types/signup';

export function meta() {
  return appMetaTags(msg`Sign Up`);
}

export async function loader({ request }: Route.LoaderArgs) {
  const { isAuthenticated } = await getOptionalSession(request);

  const isEmailPasswordSignupEnabled = isSignupEnabledForProvider('email');
  const isGoogleSignupEnabled = IS_GOOGLE_SSO_ENABLED && isSignupEnabledForProvider('google');
  const isMicrosoftSignupEnabled = IS_MICROSOFT_SSO_ENABLED && isSignupEnabledForProvider('microsoft');
  const isOidcSignupEnabled = IS_OIDC_SSO_ENABLED && isSignupEnabledForProvider('oidc');
  const oidcProviderLabel = OIDC_PROVIDER_LABEL;

  const isAnySignupEnabled =
    isEmailPasswordSignupEnabled || isGoogleSignupEnabled || isMicrosoftSignupEnabled || isOidcSignupEnabled;

  if (!isAnySignupEnabled) {
    throw redirect('/signin');
  }

  // For DOS ID the signup and signin flows are the same OIDC round-trip, so
  // when OIDC is the only enabled signup transport we redirect automatically.
  const isOIDCSignupOnlyTransport =
    isOidcSignupEnabled && !isEmailPasswordSignupEnabled && !isGoogleSignupEnabled && !isMicrosoftSignupEnabled;

  const shouldAutoRedirectToOIDC = isOIDCSignupOnlyTransport && !IS_OIDC_AUTO_REDIRECT_DISABLED;

  let returnTo = new URL(request.url).searchParams.get('returnTo') ?? undefined;

  returnTo = isValidReturnTo(returnTo) ? normalizeReturnTo(returnTo) : undefined;

  if (isAuthenticated && shouldAutoRedirectToOIDC) {
    throw redirect(returnTo || '/');
  }

  return {
    isEmailPasswordSignupEnabled,
    isGoogleSignupEnabled,
    isMicrosoftSignupEnabled,
    isOidcSignupEnabled,
    oidcProviderLabel,
    returnTo,
    shouldAutoRedirectToOIDC,
  };
}

export default function SignUp({ loaderData }: Route.ComponentProps) {
  const {
    isEmailPasswordSignupEnabled,
    isGoogleSignupEnabled,
    isMicrosoftSignupEnabled,
    isOidcSignupEnabled,
    oidcProviderLabel,
    returnTo,
    shouldAutoRedirectToOIDC,
  } = loaderData;

  const [searchParams] = useSearchParams();
  const [isRedirectFailed, setIsRedirectFailed] = useState(false);

  // Suppress the automatic redirect when the user asked for the manual form
  // via ?direct=1, or when a previous OIDC attempt bounced back with an error
  // (avoids a redirect loop).
  const isDirectEntry = searchParams.get('direct') === '1';
  const hasIdpError = searchParams.get('error') !== null;

  const shouldRedirectToOIDC = shouldAutoRedirectToOIDC && !isDirectEntry && !hasIdpError;

  useEffect(() => {
    if (!shouldRedirectToOIDC) {
      return;
    }

    // Embedded signing widgets must not bounce to the IdP; read the hash
    // synchronously to match the guard on the signin route.
    if (new URLSearchParams(window.location.hash.slice(1)).get('embedded') === 'true') {
      return;
    }

    authClient.oidc.signIn({ redirectPath: returnTo ?? '/' }).catch(() => {
      // Fall back to the manual form instead of leaving the user on the
      // spinner forever when the IdP is unreachable.
      setIsRedirectFailed(true);
    });
  }, [shouldRedirectToOIDC, returnTo]);

  if (shouldRedirectToOIDC && !isRedirectFailed) {
    return (
      <div className="w-screen max-w-lg px-4">
        <div className="flex flex-col items-center justify-center gap-y-4 py-12">
          <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground text-sm">
            <Trans>Redirecting to {oidcProviderLabel || 'OIDC'}...</Trans>
          </p>
        </div>
      </div>
    );
  }

  return (
    <SignUpForm
      className="w-screen max-w-screen-2xl px-4 md:px-16 lg:-my-16"
      isEmailPasswordSignupEnabled={isEmailPasswordSignupEnabled}
      isGoogleSignupEnabled={isGoogleSignupEnabled}
      isMicrosoftSignupEnabled={isMicrosoftSignupEnabled}
      isOidcSignupEnabled={isOidcSignupEnabled}
      oidcProviderLabel={oidcProviderLabel}
      returnTo={returnTo}
    />
  );
}
