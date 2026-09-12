import { prisma } from '@documenso/prisma';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { logEmailDomainTransition } from './audit';
import { logOrphanedSesIdentity, removeSesEmailIdentity } from './ses-identity';
import { buildNegativeStreakKey, clearNegativeStreak } from './verification-state';

export type DeleteEmailDomainOptions = {
  emailDomainId: string;
};

/**
 * Remove an email domain and its SES identity (F4).
 *
 * The SES call is best-effort and always runs first. An unreachable provider must
 * not strand a row the administrator asked us to delete — they would keep seeing a
 * domain they can no longer control — so the identity is logged as an orphan
 * instead and the row goes regardless.
 */
export const deleteEmailDomain = async ({ emailDomainId }: DeleteEmailDomainOptions): Promise<void> => {
  const emailDomain = await prisma.emailDomain.findUnique({
    where: { id: emailDomainId },
    select: {
      id: true,
      domain: true,
      selector: true,
      status: true,
      organisationId: true,
    },
  });

  if (!emailDomain) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Email domain not found',
    });
  }

  const removal = await removeSesEmailIdentity({ domain: emailDomain.domain });

  if (removal.kind === 'failed') {
    logOrphanedSesIdentity({
      domain: emailDomain.domain,
      emailDomainId: emailDomain.id,
      organisationId: emailDomain.organisationId,
      reason: removal.reason,
    });
  }

  await prisma.emailDomain.delete({
    where: { id: emailDomain.id },
  });

  clearNegativeStreak(buildNegativeStreakKey({ emailDomainId: emailDomain.id, selector: emailDomain.selector }));

  logEmailDomainTransition({
    event: 'deleted',
    emailDomainId: emailDomain.id,
    organisationId: emailDomain.organisationId,
    domain: emailDomain.domain,
    previousStatus: emailDomain.status,
    nextStatus: null,
    reason: removal.kind === 'failed' ? `Deleted with an orphaned SES identity (${removal.reason})` : 'Deleted',
  });
};
