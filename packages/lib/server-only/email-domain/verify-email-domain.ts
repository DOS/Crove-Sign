import { prisma } from '@documenso/prisma';
import { EmailDomainStatus } from '@prisma/client';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { logger } from '../../utils/logger';
import { logEmailDomainTransition } from './audit';
import { CONSECUTIVE_NEGATIVES_BEFORE_DOWNGRADE } from './constants';
import type { DomainDnsVerificationResult } from './domain-verification';
import { checkDomainDnsConfiguration } from './domain-verification';
import { assertEmailDomainEncryptionKey } from './key-material';
import { buildOwnershipChallengeRecordValue, deriveOwnershipChallengeToken } from './ownership-challenge';
import { assertSesServiceConfigured } from './ses-client';
import type { SesIdentityRead } from './ses-identity';
import { readSesEmailIdentity } from './ses-identity';
import { assertEmailDomainVerificationRateLimit } from './verification-rate-limit';
import {
  buildNegativeStreakKey,
  clearNegativeStreak,
  isDowngradeThresholdReached,
  recordDefinitiveNegative,
} from './verification-state';

export type VerifyEmailDomainResult = {
  isVerified: boolean;
  status: EmailDomainStatus;
  reason: string;
};

type SesVeto = { kind: 'none' } | { kind: 'definitive'; reason: string } | { kind: 'inconclusive'; reason: string };

/**
 * SES is consulted as a veto, not as the source of truth.
 *
 * DNS is what actually decides whether a recipient's mail server will accept our
 * signatures, and SES only re-reads the same DNS on its own schedule. SES still
 * gets a vote on the two things DNS cannot tell us: the identity was removed, or
 * SES has definitively given up on signing for it. A pending or temporary SES
 * state is not evidence against the domain.
 */
const classifySesIdentity = (identity: SesIdentityRead): SesVeto => {
  if (identity.kind === 'unavailable') {
    return { kind: 'inconclusive', reason: `Amazon SES could not be reached (${identity.reason})` };
  }

  if (identity.kind === 'absent') {
    return { kind: 'definitive', reason: 'Amazon SES holds no identity for this domain' };
  }

  if (identity.hasFailedDkim) {
    return { kind: 'definitive', reason: 'Amazon SES reports DKIM signing as failed for this domain' };
  }

  return { kind: 'none' };
};

const describeDefinitiveNegative = (dnsResult: DomainDnsVerificationResult, sesVeto: SesVeto): string => {
  if (dnsResult.kind === 'unsatisfied') {
    return dnsResult.reason;
  }

  if (sesVeto.kind === 'definitive') {
    return sesVeto.reason;
  }

  return 'The domain is not correctly configured';
};

/**
 * Read DNS (and SES) for a domain and move it between PENDING and ACTIVE (F3).
 *
 * Called positionally with a single id by both the organisation route and the
 * hourly sync job.
 */
export const verifyEmailDomain = async (emailDomainId: string): Promise<VerifyEmailDomainResult> => {
  assertSesServiceConfigured();

  const encryptionKey = assertEmailDomainEncryptionKey();

  // The private key is deliberately not selected: verification only needs the
  // public half, and a secret that is never loaded cannot be logged.
  const emailDomain = await prisma.emailDomain.findUnique({
    where: { id: emailDomainId },
    select: {
      id: true,
      domain: true,
      selector: true,
      publicKey: true,
      status: true,
      organisationId: true,
    },
  });

  if (!emailDomain) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Email domain not found',
    });
  }

  await assertEmailDomainVerificationRateLimit(emailDomain.organisationId);

  const ownershipChallengeValue = buildOwnershipChallengeRecordValue(
    deriveOwnershipChallengeToken(
      {
        emailDomainId: emailDomain.id,
        selector: emailDomain.selector,
        domain: emailDomain.domain,
      },
      encryptionKey,
    ),
  );

  const [dnsResult, sesVeto] = await Promise.all([
    checkDomainDnsConfiguration({
      domain: emailDomain.domain,
      selector: emailDomain.selector,
      publicKey: emailDomain.publicKey,
      ownershipChallengeValue,
    }),
    readSesEmailIdentity({ domain: emailDomain.domain }).then(classifySesIdentity),
  ]);

  const streakKey = buildNegativeStreakKey({
    emailDomainId: emailDomain.id,
    selector: emailDomain.selector,
  });

  if (dnsResult.kind === 'inconclusive') {
    logger.warn({
      msg: 'email_domain_verification_inconclusive',
      emailDomainId: emailDomain.id,
      organisationId: emailDomain.organisationId,
      domain: emailDomain.domain,
      reason: dnsResult.reason,
    });

    return { isVerified: false, status: emailDomain.status, reason: dnsResult.reason };
  }

  if (sesVeto.kind === 'inconclusive') {
    logger.warn({
      msg: 'email_domain_verification_inconclusive',
      emailDomainId: emailDomain.id,
      organisationId: emailDomain.organisationId,
      domain: emailDomain.domain,
      reason: sesVeto.reason,
    });

    return { isVerified: false, status: emailDomain.status, reason: sesVeto.reason };
  }

  if (dnsResult.kind === 'satisfied' && sesVeto.kind === 'none') {
    clearNegativeStreak(streakKey);

    await prisma.emailDomain.update({
      where: { id: emailDomain.id },
      data: {
        status: EmailDomainStatus.ACTIVE,
        lastVerifiedAt: new Date(),
      },
    });

    if (!dnsResult.hasSpfRecord) {
      logger.warn({
        msg: 'email_domain_missing_spf_record',
        emailDomainId: emailDomain.id,
        domain: emailDomain.domain,
      });
    }

    logEmailDomainTransition({
      event: 'verified',
      emailDomainId: emailDomain.id,
      organisationId: emailDomain.organisationId,
      domain: emailDomain.domain,
      previousStatus: emailDomain.status,
      nextStatus: EmailDomainStatus.ACTIVE,
      reason: 'Ownership challenge and DKIM public key both published correctly',
    });

    return {
      isVerified: true,
      status: EmailDomainStatus.ACTIVE,
      reason: 'Ownership challenge and DKIM public key both published correctly',
    };
  }

  const negativeReason = describeDefinitiveNegative(dnsResult, sesVeto);

  // A PENDING domain has nothing to lose, so the demotion machinery is only
  // engaged for domains that are currently trusted to send.
  if (emailDomain.status !== EmailDomainStatus.ACTIVE) {
    clearNegativeStreak(streakKey);

    return { isVerified: false, status: emailDomain.status, reason: negativeReason };
  }

  const negativeStreak = recordDefinitiveNegative(streakKey);

  if (!isDowngradeThresholdReached(negativeStreak)) {
    logger.warn({
      msg: 'email_domain_definitive_negative',
      emailDomainId: emailDomain.id,
      organisationId: emailDomain.organisationId,
      domain: emailDomain.domain,
      negativeStreak,
      requiredStreak: CONSECUTIVE_NEGATIVES_BEFORE_DOWNGRADE,
      reason: negativeReason,
    });

    return {
      isVerified: false,
      status: EmailDomainStatus.ACTIVE,
      reason: `${negativeReason} (negative ${negativeStreak}/${CONSECUTIVE_NEGATIVES_BEFORE_DOWNGRADE})`,
    };
  }

  clearNegativeStreak(streakKey);

  await prisma.emailDomain.update({
    where: { id: emailDomain.id },
    data: {
      status: EmailDomainStatus.PENDING,
    },
  });

  logEmailDomainTransition({
    event: 'downgraded',
    emailDomainId: emailDomain.id,
    organisationId: emailDomain.organisationId,
    domain: emailDomain.domain,
    previousStatus: EmailDomainStatus.ACTIVE,
    nextStatus: EmailDomainStatus.PENDING,
    reason: `${CONSECUTIVE_NEGATIVES_BEFORE_DOWNGRADE} consecutive authoritative negatives: ${negativeReason}`,
  });

  return { isVerified: false, status: EmailDomainStatus.PENDING, reason: negativeReason };
};
