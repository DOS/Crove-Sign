import { AppError, AppErrorCode } from '../../errors/app-error';
import { createRateLimit } from '../rate-limit/rate-limit';
import { EMAIL_DOMAIN_VERIFICATION_MAX_PER_HOUR } from './constants';

const emailDomainVerificationRateLimit = createRateLimit({
  action: 'email-domain.verify',
  max: EMAIL_DOMAIN_VERIFICATION_MAX_PER_HOUR,
  window: '1h',
});

/**
 * Verification issues outbound DNS and SES traffic on the caller's behalf, and
 * the organisation route fans a single click out across every domain the
 * organisation owns. Without a per-organisation ceiling that is an amplification
 * primitive against both our resolver and our SES quota.
 *
 * The hourly sync job stays well inside the limit: it only walks PENDING domains
 * and pauses between batches.
 */
export const assertEmailDomainVerificationRateLimit = async (organisationId: string): Promise<void> => {
  const result = await emailDomainVerificationRateLimit.check({
    ip: 'system:email-domain-verification',
    identifier: organisationId,
  });

  if (result.isLimited) {
    throw new AppError(AppErrorCode.TOO_MANY_REQUESTS, {
      message: 'Too many email domain verifications for this organisation.',
      userMessage: 'Too many verification attempts. Please try again later.',
      headers: {
        'Retry-After': String(Math.max(1, Math.ceil((result.reset.getTime() - Date.now()) / 1000))),
      },
    });
  }
};
