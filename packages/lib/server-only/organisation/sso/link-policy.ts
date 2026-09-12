import { OrganisationMemberRole } from '@prisma/client';

import { LOWEST_ORGANISATION_ROLE } from '../../../constants/organisations';

/**
 * The member roles an SSO-provisioned user may be given.
 *
 * Organisation ownership is deliberately absent: it is not a member role (it
 * lives on `Organisation.ownerUserId`), and nothing in the SSO link flow writes
 * to it.
 */
const PERMITTED_SSO_ORGANISATION_ROLES: OrganisationMemberRole[] = [
  OrganisationMemberRole.ADMIN,
  OrganisationMemberRole.MANAGER,
  OrganisationMemberRole.MEMBER,
];

/**
 * Resolves the role granted to a user who confirms an organisation SSO link.
 *
 * The role is exactly the one the organisation configured on its portal, and is
 * never elevated above it. The parameter is typed as a string rather than the
 * enum because the value is read from a row this flow does not own: an
 * unrecognised value clamps to the lowest role instead of being passed through
 * to the membership write.
 */
export const resolveGrantedOrganisationRole = (configuredRole: string): OrganisationMemberRole => {
  const permittedRole = PERMITTED_SSO_ORGANISATION_ROLES.find((role) => role === configuredRole);

  return permittedRole ?? LOWEST_ORGANISATION_ROLE;
};

export const extractEmailDomain = (email: string): string | null => {
  const separatorIndex = email.lastIndexOf('@');

  if (separatorIndex === -1) {
    return null;
  }

  const domain = email
    .slice(separatorIndex + 1)
    .trim()
    .toLowerCase();

  return domain.length > 0 ? domain : null;
};

const normaliseAllowedDomain = (domain: string) => {
  return domain.trim().replace(/^@/, '').toLowerCase();
};

/**
 * Whether an email address is permitted by a portal's `allowedDomains`.
 *
 * Defence in depth for the redemption path: the caller checks the same rule when
 * the link is issued, but the portal can be reconfigured in between, so the
 * restriction is enforced again at redemption time and fails closed. An empty
 * list means the identity provider is the only gate, which matches the
 * documented portal behaviour.
 */
export const isEmailDomainPermittedByPortal = (email: string, allowedDomains: string[]): boolean => {
  const permittedDomains = allowedDomains.map(normaliseAllowedDomain).filter((domain) => domain.length > 0);

  if (permittedDomains.length === 0) {
    return true;
  }

  const emailDomain = extractEmailDomain(email);

  return emailDomain !== null && permittedDomains.includes(emailDomain);
};
