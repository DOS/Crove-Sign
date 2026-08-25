import { OrganisationMemberRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { mapDosRoleToOrgRole } from './sync-dos-profile';

describe('sync-dos-profile', () => {
  describe('mapDosRoleToOrgRole', () => {
    it('should map OWNER and ADMIN to ADMIN', () => {
      expect(mapDosRoleToOrgRole('OWNER')).toBe(OrganisationMemberRole.ADMIN);
      expect(mapDosRoleToOrgRole('owner')).toBe(OrganisationMemberRole.ADMIN);
      expect(mapDosRoleToOrgRole('ADMIN')).toBe(OrganisationMemberRole.ADMIN);
      expect(mapDosRoleToOrgRole('admin')).toBe(OrganisationMemberRole.ADMIN);
    });

    it('should map MANAGER to MANAGER', () => {
      expect(mapDosRoleToOrgRole('MANAGER')).toBe(OrganisationMemberRole.MANAGER);
      expect(mapDosRoleToOrgRole('manager')).toBe(OrganisationMemberRole.MANAGER);
    });

    it('should map MEMBER to MEMBER', () => {
      expect(mapDosRoleToOrgRole('MEMBER')).toBe(OrganisationMemberRole.MEMBER);
      expect(mapDosRoleToOrgRole('member')).toBe(OrganisationMemberRole.MEMBER);
    });

    it('should fallback to MEMBER for undefined or unknown roles', () => {
      expect(mapDosRoleToOrgRole(undefined)).toBe(OrganisationMemberRole.MEMBER);
      expect(mapDosRoleToOrgRole('guest')).toBe(OrganisationMemberRole.MEMBER);
      expect(mapDosRoleToOrgRole('')).toBe(OrganisationMemberRole.MEMBER);
    });
  });
});
