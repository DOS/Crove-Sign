import { prisma } from '@documenso/prisma';
import { OrganisationGroupType } from '@prisma/client';

import { generateDatabaseId } from '../../universal/id';
import { deleteOrganisation } from '../organisation/delete-organisation';
import { createTeam } from '../team/create-team';
import {
  mapDosRoleToOrgRole,
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

export const handleDosWebhookEvent = async (
  payload: DosWebhookPayload,
): Promise<{ success: boolean; message: string }> => {
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
    // DOS ID broadcasts events for the whole ecosystem, including
    // organisations absent from the sign schema (created before webhook
    // integration, failed provisioning, or deleted upstream). An
    // entity-not-found lookup is permanent, so those events are consumed as
    // idempotent no-ops instead of failures: retrying never succeeds and the
    // retry storm once produced ~1.4k failed jobs per hour. Malformed
    // payloads (missing required fields) keep failing so contract breaks
    // stay loud.
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
            // Email ownership is not proven by the webhook payload; never auto-verify.
            emailVerified: null,
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

      // An empty where clause must never reach Prisma: a missing id AND slug
      // is a malformed payload, not an entity to resolve.
      if (!orgId && !slug) {
        return { success: false, message: 'Missing org_id or slug in org.updated' };
      }

      const org = await prisma.organisation.findFirst({
        where: {
          OR: [...(orgId ? [{ id: orgId }] : []), ...(slug ? [{ url: slug }] : [])],
        },
      });

      if (!org) {
        return { success: true, message: 'Organization not found in sign schema, nothing to update' };
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

      // Same malformed-payload guard as org.updated: an empty OR clause must
      // never reach Prisma on a destructive path.
      if (!orgId && !slug) {
        return { success: false, message: 'Missing org_id or slug in org.deleted' };
      }

      const org = await prisma.organisation.findFirst({
        where: {
          OR: [...(orgId ? [{ id: orgId }] : []), ...(slug ? [{ url: slug }] : [])],
        },
        include: {
          teams: { select: { id: true } },
          subscription: { select: { planId: true } },
        },
      });

      if (!org) {
        return { success: true, message: 'Organization not found in sign schema, nothing to delete' };
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
        return { success: true, message: 'Organization not found in sign schema, nothing to update' };
      }

      let user = await prisma.user.findFirst({
        where: { email: userEmail.toLowerCase() },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            email: userEmail.toLowerCase(),
            name: (data.user_name as string) || userEmail.split('@')[0],
            // Email ownership is not proven by the webhook payload; never auto-verify.
            emailVerified: null,
          },
        });
      }

      const orgRole = mapDosRoleToOrgRole(role);
      const targetGroup = org.groups.find(
        (group) => group.type === OrganisationGroupType.INTERNAL_ORGANISATION && group.organisationRole === orgRole,
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
        return { success: true, message: `Organisation ${orgId} not found in sign schema, nothing to create` };
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

      if (!orgId) {
        return { success: false, message: 'Missing org_id in team.updated' };
      }

      const team = await prisma.team.findFirst({
        where: {
          // Org scope is mandatory: a bare team id/slug match could resolve
          // to a team in another organisation (cross-tenant mutation).
          organisation: { OR: [{ id: orgId }, { url: orgId }] },
          OR: [
            ...(teamId && !Number.isNaN(Number(teamId)) ? [{ id: Number(teamId) }] : []),
            ...(teamSlug ? [{ url: teamSlug }] : []),
          ],
        },
      });

      if (!team) {
        return { success: true, message: 'Team not found in sign schema, nothing to update' };
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

      if (!orgId) {
        return { success: false, message: 'Missing org_id in team.deleted' };
      }

      const team = await prisma.team.findFirst({
        where: {
          // Org scope is mandatory: a bare team id/slug match could resolve
          // to a team in another organisation (cross-tenant deletion).
          organisation: { OR: [{ id: orgId }, { url: orgId }] },
          OR: [
            ...(teamId && !Number.isNaN(Number(teamId)) ? [{ id: Number(teamId) }] : []),
            ...(teamSlug ? [{ url: teamSlug }] : []),
          ],
        },
      });

      if (!team) {
        return { success: true, message: 'Team not found in sign schema, nothing to delete' };
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
            // Email ownership is not proven by the webhook payload; never auto-verify.
            emailVerified: null,
          },
        });
      }

      // Resolve target organisation — the payload must name it explicitly.
      // Falling back to "any organisation the user belongs to" lets a
      // mis-scoped payload mutate a team in the wrong tenant.
      if (!orgId) {
        return { success: false, message: 'Missing org_id in team.member_added' };
      }

      const targetOrg = await prisma.organisation.findFirst({
        where: { OR: [{ id: orgId }, { url: orgId }] },
        select: { id: true },
      });

      if (!targetOrg) {
        return { success: true, message: 'Target organisation not found in sign schema, nothing to add' };
      }

      const finalOrgId = targetOrg.id;

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

      if (!orgId) {
        return { success: false, message: 'Missing org_id in team.member_removed' };
      }

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
          // Org scope is mandatory: a numeric team_id can collide with a team
          // in another organisation (cross-tenant member removal).
          organisation: { OR: [{ id: orgId }, { url: orgId }] },
          OR: [
            ...(teamSlug && !Number.isNaN(Number(teamSlug)) ? [{ id: Number(teamSlug) }] : []),
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
