import { prisma } from '@documenso/prisma';

import {
  ORGANISATION_ACCOUNT_LINK_VERIFICATION_TOKEN_IDENTIFIER,
  ORGANISATION_USER_ACCOUNT_TYPE,
} from '../../../constants/organisations';
import { AppError, AppErrorCode } from '../../../errors/app-error';
import type { RequestMetadata } from '../../../universal/extract-request-metadata';
import { logger } from '../../../utils/logger';
import { addUserToOrganisation } from '../accept-organisation-invitation';
import { writeOrganisationSsoLinkAuditLog } from './link-audit';
import { isEmailDomainPermittedByPortal, resolveGrantedOrganisationRole } from './link-policy';
import {
  decryptOrganisationAccountLinkOauthConfig,
  isOrganisationAccountLinkTokenExpired,
  parseOrganisationAccountLinkMetadata,
} from './link-token';

/**
 * Why a redemption was refused.
 *
 * Only ever written to the application log. The caller-facing error is uniform
 * across every refusal so an unauthenticated caller cannot use the response to
 * probe which links exist, which expired and which were rejected on policy.
 */
type OrganisationAccountLinkRefusalReason =
  | 'token-unknown'
  | 'token-already-used'
  | 'token-expired'
  | 'token-metadata-invalid'
  | 'token-user-mismatch'
  | 'user-missing'
  | 'organisation-missing'
  | 'portal-disabled'
  | 'email-domain-not-allowed'
  | 'auto-provisioning-disabled'
  | 'provider-account-conflict'
  | 'token-redeemed-concurrently';

const LINK_REFUSAL_MESSAGE = 'Unable to link the organisation account';

const LINK_REFUSAL_USER_MESSAGE =
  'This account link is no longer valid. Please sign in through your organisation again to request a new link.';

type RefuseOrganisationAccountLinkOptions = {
  reason: OrganisationAccountLinkRefusalReason;
  requestMeta: RequestMetadata;
  userId?: number;
  organisationId?: string;
  tokenSecondaryId?: string;
};

/**
 * Records a refusal and rejects the redemption.
 *
 * Nothing is mutated before this is called, so an expired or malformed link is
 * left in place: burning it would destroy the evidence needed to explain the
 * failure and would let anyone who guesses a pending link invalidate it.
 */
const refuseOrganisationAccountLink = async ({
  reason,
  requestMeta,
  userId,
  organisationId,
  tokenSecondaryId,
}: RefuseOrganisationAccountLinkOptions): Promise<never> => {
  logger.warn({
    msg: 'Organisation account link refused',
    reason,
    userId,
    organisationId,
    tokenSecondaryId,
  });

  // Refusals that happen before a user is resolved (an unknown token) cannot be
  // audited: the audit row is keyed on a user.
  if (userId !== undefined) {
    await writeOrganisationSsoLinkAuditLog({ userId, requestMeta }).catch(() => {
      // The user may themselves be gone, which is the reason for the refusal in
      // the `user-missing` case. Losing the audit row must not mask it.
      logger.error({
        msg: 'Unable to write the organisation account link refusal audit log',
        reason,
        userId,
        organisationId,
        tokenSecondaryId,
      });
    });
  }

  throw new AppError(AppErrorCode.INVALID_REQUEST, {
    message: LINK_REFUSAL_MESSAGE,
    userMessage: LINK_REFUSAL_USER_MESSAGE,
  });
};

export type LinkOrganisationAccountOptions = {
  token: string;
  requestMeta: RequestMetadata;
};

/**
 * Redeems an organisation SSO account link confirmation.
 *
 * Unauthenticated by design — possession of the emailed link is the
 * authorisation — so everything the caller cannot be trusted to have checked is
 * re-verified here: token state, portal configuration, allowed domains and the
 * role that is granted. The caller rate limits; this function does not.
 */
export const linkOrganisationAccount = async ({
  token,
  requestMeta,
}: LinkOrganisationAccountOptions): Promise<void> => {
  // ── Validation phase ────────────────────────────────────────────────────
  const verificationToken = await prisma.verificationToken.findFirst({
    where: {
      token,
      identifier: ORGANISATION_ACCOUNT_LINK_VERIFICATION_TOKEN_IDENTIFIER,
    },
  });

  if (!verificationToken) {
    return refuseOrganisationAccountLink({ reason: 'token-unknown', requestMeta });
  }

  const { id: verificationTokenId, secondaryId: tokenSecondaryId, userId: tokenUserId } = verificationToken;

  if (verificationToken.completed) {
    return refuseOrganisationAccountLink({
      reason: 'token-already-used',
      requestMeta,
      userId: tokenUserId,
      tokenSecondaryId,
    });
  }

  if (isOrganisationAccountLinkTokenExpired(verificationToken.expires)) {
    return refuseOrganisationAccountLink({
      reason: 'token-expired',
      requestMeta,
      userId: tokenUserId,
      tokenSecondaryId,
    });
  }

  const metadata = parseOrganisationAccountLinkMetadata(verificationToken.metadata);

  if (!metadata) {
    return refuseOrganisationAccountLink({
      reason: 'token-metadata-invalid',
      requestMeta,
      userId: tokenUserId,
      tokenSecondaryId,
    });
  }

  // The row and its metadata must agree on the user. A mismatch means the stored
  // material was tampered with, so it is never acted on.
  if (metadata.userId !== tokenUserId) {
    return refuseOrganisationAccountLink({
      reason: 'token-user-mismatch',
      requestMeta,
      userId: tokenUserId,
      organisationId: metadata.organisationId,
      tokenSecondaryId,
    });
  }

  const user = await prisma.user.findFirst({
    where: {
      id: tokenUserId,
    },
    select: {
      id: true,
      email: true,
      emailVerified: true,
    },
  });

  if (!user) {
    return refuseOrganisationAccountLink({
      reason: 'user-missing',
      requestMeta,
      userId: tokenUserId,
      organisationId: metadata.organisationId,
      tokenSecondaryId,
    });
  }

  const organisation = await prisma.organisation.findFirst({
    where: {
      id: metadata.organisationId,
    },
    include: {
      groups: true,
      organisationAuthenticationPortal: true,
    },
  });

  if (!organisation) {
    return refuseOrganisationAccountLink({
      reason: 'organisation-missing',
      requestMeta,
      userId: user.id,
      organisationId: metadata.organisationId,
      tokenSecondaryId,
    });
  }

  const portal = organisation.organisationAuthenticationPortal;

  if (!portal.enabled) {
    return refuseOrganisationAccountLink({
      reason: 'portal-disabled',
      requestMeta,
      userId: user.id,
      organisationId: organisation.id,
      tokenSecondaryId,
    });
  }

  // Defence in depth: the portal may have been reconfigured between issue and
  // redemption, so the domain restriction is enforced again here and fails
  // closed.
  if (!isEmailDomainPermittedByPortal(user.email, portal.allowedDomains)) {
    return refuseOrganisationAccountLink({
      reason: 'email-domain-not-allowed',
      requestMeta,
      userId: user.id,
      organisationId: organisation.id,
      tokenSecondaryId,
    });
  }

  const oauthConfig = decryptOrganisationAccountLinkOauthConfig(metadata.oauthConfig);

  const existingMembership = await prisma.organisationMember.findFirst({
    where: {
      userId: user.id,
      organisationId: organisation.id,
    },
    select: {
      id: true,
    },
  });

  // An organisation that switched auto-provisioning off after the link was
  // issued must not gain a member through it. Existing members are unaffected.
  if (!existingMembership && !portal.autoProvisionUsers) {
    return refuseOrganisationAccountLink({
      reason: 'auto-provisioning-disabled',
      requestMeta,
      userId: user.id,
      organisationId: organisation.id,
      tokenSecondaryId,
    });
  }

  const existingAccount = await prisma.account.findFirst({
    where: {
      provider: organisation.id,
      providerAccountId: oauthConfig.providerAccountId,
    },
    select: {
      id: true,
      userId: true,
    },
  });

  // The identity provider subject is already bound to somebody else. Silently
  // rebinding it would move that person's SSO sign-in onto this account, so the
  // conflict is surfaced instead.
  if (existingAccount && existingAccount.userId !== user.id) {
    return refuseOrganisationAccountLink({
      reason: 'provider-account-conflict',
      requestMeta,
      userId: user.id,
      organisationId: organisation.id,
      tokenSecondaryId,
    });
  }

  // The granted role is the portal's configured default, clamped to a known
  // member role and never elevated. Ownership is never written by this flow.
  const organisationMemberRole = resolveGrantedOrganisationRole(portal.defaultOrganisationRole);

  // ── Mutation phase ──────────────────────────────────────────────────────
  // Claiming the token with `completed: false` in the filter makes redemption
  // atomic: a concurrent request matches zero rows and is rejected, which is how
  // a link redeemed twice is kept from provisioning the same user twice.
  const claimedTokens = await prisma.verificationToken.updateMany({
    where: {
      id: verificationTokenId,
      completed: false,
    },
    data: {
      completed: true,
    },
  });

  if (claimedTokens.count === 0) {
    return refuseOrganisationAccountLink({
      reason: 'token-redeemed-concurrently',
      requestMeta,
      userId: user.id,
      organisationId: organisation.id,
      tokenSecondaryId,
    });
  }

  try {
    if (!existingMembership) {
      await addUserToOrganisation({
        userId: user.id,
        organisationId: organisation.id,
        organisationGroups: organisation.groups,
        organisationMemberRole,
      });
    }

    await prisma.$transaction(async (tx) => {
      // Persisting the OIDC account row is what makes the next SSO sign-in
      // resolve straight to this user instead of issuing another confirmation.
      await tx.account.upsert({
        where: {
          provider_providerAccountId: {
            provider: organisation.id,
            providerAccountId: oauthConfig.providerAccountId,
          },
        },
        create: {
          userId: user.id,
          type: ORGANISATION_USER_ACCOUNT_TYPE,
          provider: organisation.id,
          providerAccountId: oauthConfig.providerAccountId,
          access_token: oauthConfig.accessToken,
          id_token: oauthConfig.idToken,
          expires_at: oauthConfig.expiresAt,
          token_type: 'Bearer',
        },
        update: {
          access_token: oauthConfig.accessToken,
          id_token: oauthConfig.idToken,
          expires_at: oauthConfig.expiresAt,
          token_type: 'Bearer',
        },
      });

      // Clicking a link delivered to this exact inbox is genuine proof of
      // control, which is the only reason `emailVerified` may be set here. The
      // `emailVerified: null` filter keeps an earlier verification timestamp
      // intact even if the account was verified concurrently.
      //
      // The password is deliberately left alone for both flavours of link:
      // converting an account to SSO-only is a separate, user-initiated action.
      if (!user.emailVerified) {
        await tx.user.updateMany({
          where: {
            id: user.id,
            emailVerified: null,
          },
          data: {
            emailVerified: new Date(),
          },
        });
      }
    });
  } catch (error) {
    // Release the claim so a transient failure does not permanently burn a link
    // the user still holds. Best effort — the token expires on its own anyway.
    await prisma.verificationToken
      .updateMany({
        where: {
          id: verificationTokenId,
        },
        data: {
          completed: false,
        },
      })
      .catch(() => undefined);

    logger.error({
      msg: 'Organisation account link failed after the token was claimed',
      userId: user.id,
      organisationId: organisation.id,
      tokenSecondaryId,
    });

    if (error instanceof AppError) {
      throw error;
    }

    // A raw driver error can embed the statement's arguments, which hold the
    // decrypted OAuth material, so it never reaches the caller.
    throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
      message: 'Unable to complete the organisation account link',
    });
  }

  await writeOrganisationSsoLinkAuditLog({ userId: user.id, requestMeta });

  logger.info({
    msg: 'Organisation account linked',
    userId: user.id,
    organisationId: organisation.id,
    tokenSecondaryId,
  });
};
