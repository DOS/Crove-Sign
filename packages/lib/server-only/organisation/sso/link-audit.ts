import { prisma } from '@documenso/prisma';
import { UserSecurityAuditLogType } from '@prisma/client';

import type { RequestMetadata } from '../../../universal/extract-request-metadata';

export type WriteOrganisationSsoLinkAuditLogOptions = {
  userId: number;
  /**
   * Absent for events that happen outside a user request (the confirmation
   * email is issued from the OIDC callback, whose signature carries no request
   * metadata).
   */
  requestMeta?: RequestMetadata;
};

/**
 * Records an organisation SSO link lifecycle event on the user's security audit
 * log: confirmation issued, link completed, link refused.
 *
 * All three share `ORGANISATION_SSO_LINK` because `UserSecurityAuditLog` has no
 * reason column and `UserSecurityAuditLogType` has no refusal-specific value;
 * the precise outcome goes to the structured application log instead. Only the
 * user and the request metadata are persisted — never a token value and never
 * OAuth material.
 */
export const writeOrganisationSsoLinkAuditLog = async ({
  userId,
  requestMeta,
}: WriteOrganisationSsoLinkAuditLogOptions) => {
  await prisma.userSecurityAuditLog.create({
    data: {
      userId,
      ipAddress: requestMeta?.ipAddress,
      userAgent: requestMeta?.userAgent,
      type: UserSecurityAuditLogType.ORGANISATION_SSO_LINK,
    },
  });
};
