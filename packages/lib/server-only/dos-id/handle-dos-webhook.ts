import { prisma } from '@documenso/prisma';
import { OrganisationGroupType } from '@prisma/client';

import { generateDatabaseId } from '../../universal/id';
import { deleteOrganisation } from '../organisation/delete-organisation';
import { createTeam } from '../team/create-team';
import {
  mapDosRoleToOrgRole,
  mapDosRoleToTeamRole,
  syncOrganisationForUser,
  syncTeamForUser,
  syncUserAvatarFromUrl,
} from './sync-dos-profile';

export type DosWebhookPayload = {
  event: string;
  data?: Record<string, unknown>;
  // Support flat payload formats as well
  org_id?: string;
  name?: string;
  slug?: string;
  owner_id?: string;
  owner_email?: string;
  avatar_url?: string | null;
  org_name?: string;
  user_id?: string;
  user_email?: string;
  role?: string;
  email?: string;
  display_name?: string;
  team_id?: string;
  team_name?: string;
  team_slug?: string;
  [key: string]: unknown;
};

export const handleDosWebhookEvent = async (payload: DosWebhookPayload): Promise<{ success: boolean; message: string }> => {
  const event = (payload.event || '').toLowerCase();
  const data = (payload.data && typeof payload.data === 'object' ? payload.data : payload) as Record<string, unknown>;

  switch (event) {
    case 'ping':
    case 'test':
    case 'endpoint.test': {
      return { success: true, message: 'Pong! Webhook endpoint is active and verified.' };
    }

    // ==========================================
    // ORGANISATION EVENTS
    // ==========================================
    case 'organization.created':
    case 'org.created': {
      const orgId = (data.org_id || data.id) as string | undefined;
      const name = (data.name || data.slug || 'Organization') as string;
      const slug = (data.slug || orgId) as string | undefined;
      const ownerEmail = (data.owner_email || data.email) as string | undefined;

      if (!ownerEmail) {
        return { success: false, message: 'Missing owner_email in payload' };
      }

      let owner = await prisma.user.findFirst({
        where: { email: ownerEmail.toLowerCase() },
      });

      if (!owner) {
        owner = await prisma.user.create({
          data: {
            email: ownerEmail.toLowerCase(),
            name: (data.owner_name as string) || ownerEmail.split('@')[0],
            emailVerified: new Date(),
          },
        });
      }

      await syncOrganisationForUser({
        userId: owner.id,
        org: {
          org_id: orgId,
          name,
          slug,
          role: 'ADMIN',
          avatar_url: data.avatar_url as string | undefined,
        },
      });

      return { success: true, message: 'Organization created successfully' };
    }

    case 'organization.updated':
    case 'org.updated': {
      const orgId = (data.org_id || data.id) as string | undefined;
      const slug = data.slug as string | undefined;
      const name = data.name as string | undefined;

      const org = await prisma.organisation.findFirst({
        where: {
          OR: [
            ...(orgId ? [{ id: orgId }] : []),
            ...(slug ? [{ url: slug }] : []),
          ],
        },
      });

      if (!org) {
        return { success: false, message: 'Organization not found' };
      }

      await prisma.organisation.update({
        where: { id: org.id },
        data: {
          ...(name ? { name } : {}),
          ...(slug ? { url: slug } : {}),
        },
      });

      return { success: true, message: 'Organization updated successfully' };
    }

    case 'organization.deleted':
    case 'org.deleted': {
      const orgId = (data.org_id || data.id) as string | undefined;
      const slug = data.slug as string | undefined;

      const org = await prisma.organisation.findFirst({
        where: {
          OR: [
            ...(orgId ? [{ id: orgId }] : []),
            ...(slug ? [{ url: slug }] : []),
          ],
        },
        include: {
          teams: { select: { id: true } },
          subscription: { select: { planId: true } },
        },
      });

      if (!org) {
        return { success: false, message: 'Organization not found for deletion' };
      }

      await deleteOrganisation({
        organisation: {
          id: org.id,
          teams: org.teams,
          subscription: org.subscription,
        },
      });

      return { success: true, message: 'Organization deleted successfully' };
    }

    case 'organization.member_added':
    case 'org.member_added':
    case 'organization.member.added':
    case 'org.member.added': {
      const orgId = (data.org_id || data.id) as string | undefined;
      const userEmail = (data.user_email || data.email) as string | undefined;
      const role = data.role as string | undefined;

      if (!userEmail || !orgId) {
        return { success: false, message: 'Missing user_email or org_id' };
      }

      const org = await prisma.organisation.findFirst({
        where: { id: orgId },
        include: { groups: true },
      });

      if (!org) {
        return { success: false, message: 'Organization not found' };
      }

      let user = await prisma.user.findFirst({
        where: { email: userEmail.toLowerCase() },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            email: userEmail.toLowerCase(),
            name: (data.user_name as string) || userEmail.split('@')[0],
            emailVerified: new Date(),
          },
        });
      }

      const orgRole = mapDosRoleToOrgRole(role);
      const targetGroup = org.groups.find(
        (group) =>
          group.type === OrganisationGroupType.INTERNAL_ORGANISATION && group.organisationRole === orgRole,
      );

      const existingMember = await prisma.organisationMember.findUnique({
        where: {
          userId_organisationId: {
            userId: user.id,
            organisationId: org.id,
          },
        },
      });

      if (!existingMember && targetGroup) {
        await prisma.organisationMember.create({
          data: {
            id: generateDatabaseId('member'),
            userId: user.id,
            organisationId: org.id,
            organisationGroupMembers: {
              create: {
                id: generateDatabaseId('group_member'),
                groupId: targetGroup.id,
              },
            },
          },
        });
      }

      return { success: true, message: 'Member added successfully' };
    }

    case 'organization.member_removed':
    case 'org.member_removed':
    case 'organization.member.removed':
    case 'org.member.removed': {
      const orgId = (data.org_id || data.id) as string | undefined;
      const userEmail = (data.user_email || data.email) as string | undefined;

      if (!userEmail || !orgId) {
        return { success: false, message: 'Missing user_email or org_id' };
      }

      const user = await prisma.user.findFirst({
        where: { email: userEmail.toLowerCase() },
      });

      if (!user) {
        return { success: true, message: 'User not found, nothing to remove' };
      }

      await prisma.organisationMember
        .delete({
          where: {
            userId_organisationId: {
              userId: user.id,
              organisationId: orgId,
            },
          },
        })
        .catch(() => null);

      return { success: true, message: 'Member removed successfully' };
    }

    // ==========================================
    // TEAM EVENTS (Real-Time Teams Hierarchy Sync)
    // ==========================================
    case 'team.created': {
      const orgId = (data.org_id || data.organisation_id) as string | undefined;
      const teamId = (data.team_id || data.id) as string | undefined;
      const teamName = (data.name || data.team_name || data.slug || 'Team') as string;
      const teamSlug = (data.slug || data.team_slug || teamId) as string;

      if (!orgId) {
        return { success: false, message: 'Missing org_id in team.created' };
      }

      const org = await prisma.organisation.findFirst({
        where: {
          OR: [{ id: orgId }, { url: orgId }],
        },
        select: { id: true, ownerUserId: true },
      });

      if (!org) {
        return { success: false, message: `Organisation ${orgId} not found for team.created` };
      }

      // Check if team already exists
      const existingTeam = await prisma.team.findFirst({
        where: {
          organisationId: org.id,
          OR: [{ url: teamSlug }, { name: teamName }],
        },
      });

      if (existingTeam) {
        return { success: true, message: 'Team already exists' };
      }

      await createTeam({
        userId: org.ownerUserId,
        teamName,
        teamUrl: teamSlug,
        organisationId: org.id,
        inheritMembers: true,
      });

      return { success: true, message: 'Team created successfully' };
    }

    case 'team.updated': {
      const orgId = (data.org_id || data.organisation_id) as string | undefined;
      const teamId = (data.team_id || data.id) as string | undefined;
      const teamSlug = (data.slug || data.team_slug) as string | undefined;
      const teamName = (data.name || data.team_name) as string | undefined;

      const team = await prisma.team.findFirst({
        where: {
          ...(orgId ? { organisation: { OR: [{ id: orgId }, { url: orgId }] } } : {}),
          OR: [
            ...(teamId && !isNaN(Number(teamId)) ? [{ id: Number(teamId) }] : []),
            ...(teamSlug ? [{ url: teamSlug }] : []),
          ],
        },
      });

      if (!team) {
        return { success: false, message: 'Team not found for update' };
      }

      await prisma.team.update({
        where: { id: team.id },
        data: {
          ...(teamName ? { name: teamName } : {}),
          ...(teamSlug ? { url: teamSlug } : {}),
        },
      });

      return { success: true, message: 'Team updated successfully' };
    }

    case 'team.deleted': {
      const orgId = (data.org_id || data.organisation_id) as string | undefined;
      const teamId = (data.team_id || data.id) as string | undefined;
      const teamSlug = (data.slug || data.team_slug) as string | undefined;

      const team = await prisma.team.findFirst({
        where: {
          ...(orgId ? { organisation: { OR: [{ id: orgId }, { url: orgId }] } } : {}),
          OR: [
            ...(teamId && !isNaN(Number(teamId)) ? [{ id: Number(teamId) }] : []),
            ...(teamSlug ? [{ url: teamSlug }] : []),
          ],
        },
      });

      if (!team) {
        return { success: false, message: 'Team not found for deletion' };
      }

      await prisma.$transaction(async (tx) => {
        await tx.team.delete({
          where: { id: team.id },
        });

        await tx.organisationGroup.deleteMany({
          where: {
            organisationId: team.organisationId,
            type: OrganisationGroupType.INTERNAL_TEAM,
            teamGroups: { none: {} },
          },
        });
      });

      return { success: true, message: 'Team deleted successfully' };
    }

    case 'team.member_added':
    case 'team.member.added': {
      const orgId = (data.org_id || data.organisation_id) as string | undefined;
      const teamSlug = (data.slug || data.team_slug || data.team_id || data.id) as string | undefined;
      const userEmail = (data.user_email || data.email) as string | undefined;
      const role = (data.role || 'MEMBER') as string;

      if (!userEmail) {
        return { success: false, message: 'Missing user_email in team.member_added' };
      }

      let user = await prisma.user.findFirst({
        where: { email: userEmail.toLowerCase() },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            email: userEmail.toLowerCase(),
            name: (data.user_name as string) || userEmail.split('@')[0],
            emailVerified: new Date(),
          },
        });
      }

      // Resolve target organization
      const targetOrg = orgId
        ? await prisma.organisation.findFirst({
            where: { OR: [{ id: orgId }, { url: orgId }] },
            select: { id: true },
          })
        : await prisma.organisationMember.findFirst({
            where: { userId: user.id },
            select: { organisationId: true },
          });

      if (!targetOrg) {
        return { success: false, message: 'Target organisation not found' };
      }

      const finalOrgId = 'id' in targetOrg ? targetOrg.id : targetOrg.organisationId;

      await syncTeamForUser({
        userId: user.id,
        team: {
          slug: teamSlug,
          name: (data.team_name as string) || teamSlug,
          role,
        },
        organisationId: finalOrgId,
      });

      return { success: true, message: 'Team member added successfully' };
    }

    case 'team.member_removed':
    case 'team.member.removed': {
      const orgId = (data.org_id || data.organisation_id) as string | undefined;
      const teamSlug = (data.slug || data.team_slug || data.team_id || data.id) as string | undefined;
      const userEmail = (data.user_email || data.email) as string | undefined;

      if (!userEmail) {
        return { success: false, message: 'Missing user_email in team.member_removed' };
      }

      const user = await prisma.user.findFirst({
        where: { email: userEmail.toLowerCase() },
      });

      if (!user) {
        return { success: true, message: 'User not found, nothing to remove' };
      }

      const team = await prisma.team.findFirst({
        where: {
          ...(orgId ? { organisation: { OR: [{ id: orgId }, { url: orgId }] } } : {}),
          OR: [
            ...(teamSlug && !isNaN(Number(teamSlug)) ? [{ id: Number(teamSlug) }] : []),
            ...(teamSlug ? [{ url: teamSlug }] : []),
          ],
        },
        include: {
          teamGroups: true,
        },
      });

      if (!team) {
        return { success: true, message: 'Team not found, nothing to remove' };
      }

      const teamGroupIds = team.teamGroups.map((tg) => tg.organisationGroupId);

      await prisma.organisationGroupMember.deleteMany({
        where: {
          groupId: { in: teamGroupIds },
          organisationMember: {
            userId: user.id,
            organisationId: team.organisationId,
          },
        },
      });

      return { success: true, message: 'Team member removed successfully' };
    }

    // ==========================================
    // USER EVENTS
    // ==========================================
    case 'user.updated': {
      const email = (data.email || data.user_email) as string | undefined;
      const displayName = (data.display_name || data.name) as string | undefined;
      const avatarUrl = data.avatar_url as string | undefined;

      if (!email) {
        return { success: false, message: 'Missing email in user.updated' };
      }

      const user = await prisma.user.findFirst({
        where: { email: email.toLowerCase() },
      });

      if (!user) {
        return { success: true, message: 'User not found in sign schema' };
      }

      if (displayName && displayName !== user.name) {
        await prisma.user.update({
          where: { id: user.id },
          data: { name: displayName },
        });
      }

      if (avatarUrl) {
        await syncUserAvatarFromUrl(user.id, avatarUrl);
      }

      return { success: true, message: 'User updated successfully' };
    }

    default:
      return { success: true, message: `Ignored unhandled event: ${event}` };
  }
};
