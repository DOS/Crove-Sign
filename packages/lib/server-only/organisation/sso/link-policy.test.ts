import { OrganisationMemberRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { extractEmailDomain, isEmailDomainPermittedByPortal, resolveGrantedOrganisationRole } from './link-policy';

describe('resolveGrantedOrganisationRole', () => {
  it('grants exactly the configured member role', () => {
    expect(resolveGrantedOrganisationRole(OrganisationMemberRole.MEMBER)).toBe(OrganisationMemberRole.MEMBER);
    expect(resolveGrantedOrganisationRole(OrganisationMemberRole.MANAGER)).toBe(OrganisationMemberRole.MANAGER);
    expect(resolveGrantedOrganisationRole(OrganisationMemberRole.ADMIN)).toBe(OrganisationMemberRole.ADMIN);
  });

  it('clamps anything that is not a member role down to the lowest role', () => {
    expect(resolveGrantedOrganisationRole('OWNER')).toBe(OrganisationMemberRole.MEMBER);
    expect(resolveGrantedOrganisationRole('')).toBe(OrganisationMemberRole.MEMBER);
    expect(resolveGrantedOrganisationRole('manager')).toBe(OrganisationMemberRole.MEMBER);
  });
});

describe('extractEmailDomain', () => {
  it('returns the lowercased domain of an address', () => {
    expect(extractEmailDomain('Alice@Example.com')).toBe('example.com');
  });

  it('returns null when there is no usable domain', () => {
    expect(extractEmailDomain('alice')).toBeNull();
    expect(extractEmailDomain('alice@')).toBeNull();
  });
});

describe('isEmailDomainPermittedByPortal', () => {
  it('permits any domain when the portal does not restrict them', () => {
    expect(isEmailDomainPermittedByPortal('alice@example.com', [])).toBe(true);
    expect(isEmailDomainPermittedByPortal('alice@example.com', ['  '])).toBe(true);
  });

  it('permits a listed domain regardless of casing or a leading @', () => {
    expect(isEmailDomainPermittedByPortal('alice@example.com', ['EXAMPLE.com'])).toBe(true);
    expect(isEmailDomainPermittedByPortal('alice@example.com', ['@example.com'])).toBe(true);
  });

  it('refuses a domain that is not listed', () => {
    expect(isEmailDomainPermittedByPortal('alice@other.com', ['example.com'])).toBe(false);
  });

  it('does not treat a subdomain as the listed parent domain', () => {
    expect(isEmailDomainPermittedByPortal('alice@subsidiary.example.com', ['example.com'])).toBe(false);
    expect(isEmailDomainPermittedByPortal('alice@subsidiary.example.com', ['subsidiary.example.com'])).toBe(true);
  });

  it('fails closed for an address without a domain', () => {
    expect(isEmailDomainPermittedByPortal('alice', ['example.com'])).toBe(false);
  });
});
