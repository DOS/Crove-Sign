import type { EmailDomainStatus } from '@prisma/client';

import { logger } from '../../utils/logger';
import type { EmailDomainTransitionEvent } from './types';

export type EmailDomainTransition = {
  event: EmailDomainTransitionEvent;
  emailDomainId: string;
  organisationId: string;
  domain: string;
  previousStatus: EmailDomainStatus | null;
  nextStatus: EmailDomainStatus | null;
  reason: string;
  /**
   * Only populated for `takeover`, where two organisations are involved and the
   * audit line has to be attributable to both.
   */
  takingOverOrganisationId?: string;
};

/**
 * Emit the single structured audit line for a state transition.
 *
 * Key material is never part of a transition record: the DKIM private key and the
 * ownership-challenge token are both secrets, and the selector/public key are
 * already public in DNS so they add nothing to an investigation.
 */
export const logEmailDomainTransition = (transition: EmailDomainTransition): void => {
  logger.info({
    msg: 'email_domain_transition',
    ...transition,
  });
};
