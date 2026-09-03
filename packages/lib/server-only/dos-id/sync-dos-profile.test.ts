import { OrganisationMemberRole, TeamMemberRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { mapDosRoleToOrgRole, mapDosRoleToTeamRole } from './sync-dos-profile';

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

  describe('mapDosRoleToTeamRole', () => {
    it('should map LEAD, OWNER, and ADMIN to ADMIN', () => {
      expect(mapDosRoleToTeamRole('LEAD')).toBe(TeamMemberRole.ADMIN);
      expect(mapDosRoleToTeamRole('lead')).toBe(TeamMemberRole.ADMIN);
      expect(mapDosRoleToTeamRole('ADMIN')).toBe(TeamMemberRole.ADMIN);
      expect(mapDosRoleToTeamRole('admin')).toBe(TeamMemberRole.ADMIN);
      expect(mapDosRoleToTeamRole('OWNER')).toBe(TeamMemberRole.ADMIN);
      expect(mapDosRoleToTeamRole('owner')).toBe(TeamMemberRole.ADMIN);
    });

    it('should map MANAGER to MANAGER', () => {
      expect(mapDosRoleToTeamRole('MANAGER')).toBe(TeamMemberRole.MANAGER);
      expect(mapDosRoleToTeamRole('manager')).toBe(TeamMemberRole.MANAGER);
    });

    it('should map MEMBER to MEMBER', () => {
      expect(mapDosRoleToTeamRole('MEMBER')).toBe(TeamMemberRole.MEMBER);
      expect(mapDosRoleToTeamRole('member')).toBe(TeamMemberRole.MEMBER);
    });

    it('should fallback to MEMBER for undefined or unknown roles', () => {
      expect(mapDosRoleToTeamRole(undefined)).toBe(TeamMemberRole.MEMBER);
      expect(mapDosRoleToTeamRole('guest')).toBe(TeamMemberRole.MEMBER);
      expect(mapDosRoleToTeamRole('')).toBe(TeamMemberRole.MEMBER);
    });
  });
});
