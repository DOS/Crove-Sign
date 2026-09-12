import { prisma } from '@documenso/prisma';
import { EmailDomainStatus } from '@prisma/client';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { logEmailDomainTransition } from './audit';
import { STALE_PENDING_CLAIM_TTL_MS } from './constants';
import { removeSesEmailIdentity } from './ses-identity';
import { buildNegativeStreakKey, clearNegativeStreak } from './verification-state';

const MS_PER_HOUR = 60 * 60 * 1000;

export type ResolveDomainClaimOptions = {
  domain: string;
  organisationId: string;
  /**
   * Injectable so the takeover window can be exercised without waiting for it.
   */
  now?: Date;
};

/**
 * Enforce the global uniqueness of `domain` and release claims that were started
 * and abandoned.
 *
 * `selector` and `domain` are unique across the whole installation, not per
 * organisation, so a second organisation asking for a domain someone else already
 * holds has to be refused. The refusal never names the holder: which organisation
 * owns a domain is not the requester's business, and the answer would otherwise
 * be an oracle for enumerating customers.
 *
 * A PENDING claim is only released once it is older than the window we tell
 * administrators DNS propagation can take, so a setup genuinely in progress is
 * never stolen out from under its owner.
 */
export const resolveDomainClaim = async ({
  domain,
  organisationId,
  now = new Date(),
}: ResolveDomainClaimOptions): Promise<void> => {
  const existingClaim = await prisma.emailDomain.findUnique({
    where: { domain },
    select: {
      id: true,
      domain: true,
      selector: true,
      status: true,
      createdAt: true,
      organisationId: true,
    },
  });

  if (!existingClaim) {
    return;
  }

  if (existingClaim.organisationId === organisationId) {
    throw new AppError(AppErrorCode.ALREADY_EXISTS, {
      message: 'This organisation has already registered the domain.',
      userMessage: 'Your organisation has already added this domain.',
    });
  }

  if (existingClaim.status === EmailDomainStatus.ACTIVE) {
    throw new AppError(AppErrorCode.ALREADY_EXISTS, {
      message: 'The domain is verified and in use by another organisation.',
      userMessage: 'This domain is already in use.',
    });
  }

  const claimAgeMs = now.getTime() - existingClaim.createdAt.getTime();

  if (claimAgeMs < STALE_PENDING_CLAIM_TTL_MS) {
    const retryAfterHours = Math.max(1, Math.ceil((STALE_PENDING_CLAIM_TTL_MS - claimAgeMs) / MS_PER_HOUR));

    throw new AppError(AppErrorCode.ALREADY_EXISTS, {
      message: 'The domain has an unfinished registration held by another organisation.',
      userMessage: `This domain is still being set up. Please try again in about ${retryAfterHours} hours.`,
    });
  }

  await removeSesEmailIdentity({ domain: existingClaim.domain });

  await prisma.emailDomain.delete({
    where: { id: existingClaim.id },
  });

  clearNegativeStreak(buildNegativeStreakKey({ emailDomainId: existingClaim.id, selector: existingClaim.selector }));

  logEmailDomainTransition({
    event: 'takeover',
    emailDomainId: existingClaim.id,
    organisationId: existingClaim.organisationId,
    takingOverOrganisationId: organisationId,
    domain: existingClaim.domain,
    previousStatus: existingClaim.status,
    nextStatus: null,
    reason: `Pending claim was ${Math.floor(claimAgeMs / MS_PER_HOUR)}h old, exceeding the ${Math.floor(
      STALE_PENDING_CLAIM_TTL_MS / MS_PER_HOUR,
    )}h takeover window`,
  });
};
