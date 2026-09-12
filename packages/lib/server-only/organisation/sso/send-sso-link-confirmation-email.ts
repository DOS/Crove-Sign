import { OrganisationAccountLinkConfirmationTemplate } from '@documenso/email/templates/organisation-account-link-confirmation';
import { prisma } from '@documenso/prisma';
import { msg } from '@lingui/core/macro';
import { createElement } from 'react';

import { getI18nInstance } from '../../../client-only/providers/i18n-server';
import { formatPath, NEXT_PUBLIC_WEBAPP_URL } from '../../../constants/app';
import { ORGANISATION_ACCOUNT_LINK_VERIFICATION_TOKEN_IDENTIFIER } from '../../../constants/organisations';
import { AppError, AppErrorCode } from '../../../errors/app-error';
import type { TOrganisationAccountLinkMetadata } from '../../../types/organisation';
import { env } from '../../../utils/env';
import { logger } from '../../../utils/logger';
import { renderEmailWithI18N } from '../../../utils/render-email-with-i18n';
import { getEmailContext } from '../../email/get-email-context';
import { writeOrganisationSsoLinkAuditLog } from './link-audit';
import {
  createOrganisationAccountLinkExpiry,
  createOrganisationAccountLinkToken,
  encryptOrganisationAccountLinkOauthConfig,
} from './link-token';

/**
 * Route served by
 * `apps/remix/app/routes/_unauthenticated+/organisation.sso.confirmation.$token.tsx`.
 */
const ORGANISATION_SSO_CONFIRMATION_PATH = '/organisation/sso/confirmation';

export type SendOrganisationAccountLinkConfirmationEmailOptions = {
  /**
   * `create` when the account was provisioned by the SSO sign-in itself (and
   * therefore has no password), `link` when an existing account is being
   * attached to the organisation.
   */
  type: 'link' | 'create';
  userId: number;
  organisationId: string;
  organisationName: string;
  oauthConfig: {
    accessToken: string;
    idToken: string;
    providerAccountId: string;
    /**
     * Access token expiry, in unix seconds.
     */
    expiresAt: number;
  };
};

/**
 * Builds the absolute base URL confirmation links are rooted at.
 *
 * `NEXT_PUBLIC_WEBAPP_URL()` silently falls back to localhost, which would hand
 * users a link that only resolves on a developer machine, so the raw variable is
 * asserted here instead of relying on that fallback.
 */
const getWebappBaseUrl = () => {
  const configuredBaseUrl = env('NEXT_PUBLIC_WEBAPP_URL');

  if (!configuredBaseUrl) {
    throw new AppError(AppErrorCode.NOT_SETUP, {
      message: 'NEXT_PUBLIC_WEBAPP_URL is not configured, unable to build an account link confirmation url',
    });
  }

  return NEXT_PUBLIC_WEBAPP_URL();
};

/**
 * Issues the single-use confirmation link that authorises an organisation SSO
 * account link, and emails it to the address the identity provider asserted.
 *
 * Called from the organisation OIDC callback while the user is *not* yet a
 * member of the organisation: membership is granted only by
 * `linkOrganisationAccount`, once the recipient has proven control of the inbox
 * the link was delivered to.
 */
export const sendOrganisationAccountLinkConfirmationEmail = async ({
  type,
  userId,
  organisationId,
  organisationName,
  oauthConfig,
}: SendOrganisationAccountLinkConfirmationEmailOptions): Promise<void> => {
  const baseUrl = getWebappBaseUrl();

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
    },
    select: {
      id: true,
      email: true,
    },
  });

  if (!user) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Unable to find the user requesting an organisation account link',
    });
  }

  // Sent through the organisation's own email context so a configured sending
  // domain and branding apply; `getEmailContext` falls back to the global
  // mailer when the organisation has no custom sender.
  const { branding, emailLanguage, senderEmail, emailsDisabled, emailTransport } = await getEmailContext({
    emailType: 'INTERNAL',
    source: {
      type: 'organisation',
      organisationId,
    },
  });

  // `getEmailContext` is authoritative on whether an organisation may send mail
  // at all. Issuing a link nobody can receive would leave the user waiting on an
  // email that was never sent, so nothing is persisted in that case.
  if (emailsDisabled) {
    logger.warn({
      msg: 'Skipped organisation account link confirmation, organisation emails are disabled',
      userId: user.id,
      organisationId,
    });

    return;
  }

  const token = createOrganisationAccountLinkToken();
  const encryptedOauthConfig = encryptOrganisationAccountLinkOauthConfig(oauthConfig);

  const createdVerificationToken = await prisma.verificationToken.create({
    data: {
      identifier: ORGANISATION_ACCOUNT_LINK_VERIFICATION_TOKEN_IDENTIFIER,
      token,
      expires: createOrganisationAccountLinkExpiry(),
      metadata: {
        type,
        userId: user.id,
        organisationId,
        oauthConfig: { ...encryptedOauthConfig },
      } satisfies TOrganisationAccountLinkMetadata,
      user: {
        connect: {
          id: user.id,
        },
      },
    },
  });

  await writeOrganisationSsoLinkAuditLog({ userId: user.id });

  const confirmationLink = new URL(formatPath(`${ORGANISATION_SSO_CONFIRMATION_PATH}/${token}`), baseUrl).toString();

  const template = createElement(OrganisationAccountLinkConfirmationTemplate, {
    type,
    confirmationLink,
    organisationName,
    assetBaseUrl: baseUrl,
  });

  const [html, text] = await Promise.all([
    renderEmailWithI18N(template, { lang: emailLanguage, branding }),
    renderEmailWithI18N(template, { lang: emailLanguage, branding, plainText: true }),
  ]);

  const i18n = await getI18nInstance(emailLanguage);

  const subject =
    type === 'create'
      ? msg`${organisationName} requested to create your Documenso account`
      : msg`${organisationName} requested to link your Documenso account`;

  await emailTransport.sendMail({
    to: user.email,
    from: senderEmail,
    subject: i18n._(subject),
    html,
    text,
  });

  // The raw token is a bearer credential and the OAuth material is secret, so
  // only the non-sensitive secondary id is logged.
  logger.info({
    msg: 'Organisation account link confirmation issued',
    userId: user.id,
    organisationId,
    tokenSecondaryId: createdVerificationToken.secondaryId,
  });
};
