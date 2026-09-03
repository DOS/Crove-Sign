import { getSubscriptionClaim } from '@documenso/lib/server-only/subscription/get-subscription-claim';
import { prisma } from '@documenso/prisma';
import {
  OrganisationGroupType,
  OrganisationMemberRole,
  OrganisationType,
  Prisma,
  TeamMemberRole,
} from '@prisma/client';

import { ORGANISATION_INTERNAL_GROUPS } from '../../constants/organisations';
import { INTERNAL_CLAIM_ID } from '../../types/subscription';
import { generateDatabaseId, prefixedId } from '../../universal/id';
import { optimiseAvatar } from '../../utils/images/avatar';
import { generateDefaultOrganisationSettings } from '../../utils/organisations';
import { createOrganisationClaimUpsertData } from '../organisation/create-organisation';
import { createTeam } from '../team/create-team';

export type DosOrgClaim = {
  org_id?: string;
  id?: string;
  name?: string;
  slug?: string;
  role?: string;
  avatar_url?: string | null;
  owner_id?: string;
  owner_email?: string;
};

export type DosTeamClaim = {
  id?: string;
  team_id?: string;
  org_id?: string;
  organisation_id?: string;
  name?: string;
  slug?: string;
  role?: string;
};

export type SyncDosUserOptions = {
  userId: number;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  organizations?: DosOrgClaim[];
  teams?: DosTeamClaim[];
  activeOrgId?: string;
};

/**
 * Downloads and sets a user avatar from an external URL if provided.
 */
export const syncUserAvatarFromUrl = async (userId: number, avatarUrl: string): Promise<string | null> => {
  try {
    const response = await fetch(avatarUrl, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64Bytes = Buffer.from(arrayBuffer).toString('base64');
    const optimisedBuffer = await optimiseAvatar(base64Bytes);

    const avatarImage = await prisma.avatarImage.create({
      data: {
        bytes: optimisedBuffer.toString('base64'),
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarImageId: true },
    });

    const oldAvatarId = user?.avatarImageId;

    await prisma.user.update({
      where: { id: userId },
      data: {
        avatarImageId: avatarImage.id,
      },
    });

    if (oldAvatarId) {
      await prisma.avatarImage
        .delete({
          where: { id: oldAvatarId },
        })
        .catch(() => null);
    }

    return avatarImage.id;
  } catch (error) {
    console.error(`[DOS ID] Failed to sync avatar for user ${userId}:`, error);
    return null;
  }
};

/**
 * Maps DOS ID role string to Documenso OrganisationMemberRole enum.
 */
export const mapDosRoleToOrgRole = (role?: string): OrganisationMemberRole => {
  const normalized = (role ?? '').toUpperCase().trim();

  if (normalized === 'OWNER' || normalized === 'ADMIN') {
    return OrganisationMemberRole.ADMIN;
  }

  if (normalized === 'MANAGER') {
    return OrganisationMemberRole.MANAGER;
  }

  return OrganisationMemberRole.MEMBER;
};

/**
 * Maps DOS ID team role string (LEAD, ADMIN, OWNER, MANAGER, MEMBER) to Documenso TeamMemberRole enum.
 */
export const mapDosRoleToTeamRole = (role?: string): TeamMemberRole => {
  const normalized = (role ?? '').toUpperCase().trim();

  if (normalized === 'LEAD' || normalized === 'ADMIN' || normalized === 'OWNER') {
    return TeamMemberRole.ADMIN;
  }

  if (normalized === 'MANAGER') {
    return TeamMemberRole.MANAGER;
  }

  return TeamMemberRole.MEMBER;
};

/**
 * Provision or join an organization for a user given DOS ID claims.
 */
export const syncOrganisationForUser = async ({
  userId,
  org,
}: {
  userId: number;
  org: DosOrgClaim;
}) => {
  const rawOrgId = org.org_id || org.id;
  const orgName = org.name || org.slug || 'Organization';
  const orgUrl = org.slug || rawOrgId || prefixedId('org');
  const orgIdToUse = rawOrgId || prefixedId('org');
  const memberRole = mapDosRoleToOrgRole(org.role);

  // Check if organization already exists in sign schema
  const existingOrg = await prisma.organisation.findFirst({
    where: {
      OR: [{ id: orgIdToUse }, { url: orgUrl }],
    },
    include: {
      groups: true,
      members: {
        where: { userId },
      },
    },
  });

  if (existingOrg) {
    const isAlreadyMember = existingOrg.members.length > 0;

    if (!isAlreadyMember) {
      const targetGroup = existingOrg.groups.find(
        (group) =>
          group.type === OrganisationGroupType.INTERNAL_ORGANISATION && group.organisationRole === memberRole,
      );

      if (targetGroup) {
        await prisma.organisationMember.create({
          data: {
            id: generateDatabaseId('member'),
            userId,
            organisationId: existingOrg.id,
            organisationGroupMembers: {
              create: {
                id: generateDatabaseId('group_member'),
                groupId: targetGroup.id,
              },
            },
          },
        });
      }
    }

    return existingOrg;
  }

  // Create new organization with free claim
  const freeSubscriptionClaim = await getSubscriptionClaim(INTERNAL_CLAIM_ID.FREE);

  const newOrg = await prisma.$transaction(async (tx) => {
    const organisationSetting = await tx.organisationGlobalSettings.create({
      data: {
        ...generateDefaultOrganisationSettings(),
        defaultRecipients: Prisma.DbNull,
        id: generateDatabaseId('org_setting'),
      },
    });

    const organisationClaim = await tx.organisationClaim.create({
      data: {
        id: generateDatabaseId('org_claim'),
        originalSubscriptionClaimId: freeSubscriptionClaim.id,
        ...createOrganisationClaimUpsertData(freeSubscriptionClaim),
      },
    });

    const organisationAuthenticationPortal = await tx.organisationAuthenticationPortal.create({
      data: {
        id: generateDatabaseId('org_sso'),
        enabled: false,
        clientId: '',
        clientSecret: '',
        wellKnownUrl: '',
      },
    });

    const createdOrg = await tx.organisation.create({
      data: {
        id: orgIdToUse,
        name: orgName,
        type: OrganisationType.ORGANISATION,
        url: orgUrl,
        ownerUserId: userId,
        organisationGlobalSettingsId: organisationSetting.id,
        organisationClaimId: organisationClaim.id,
        organisationAuthenticationPortalId: organisationAuthenticationPortal.id,
        groups: {
          create: ORGANISATION_INTERNAL_GROUPS.map((group) => ({
            ...group,
            id: generateDatabaseId('org_group'),
          })),
        },
      },
      include: {
        groups: true,
      },
    });

    const adminGroup = createdOrg.groups.find(
      (group) => group.organisationRole === OrganisationMemberRole.ADMIN,
    );

    if (adminGroup) {
      await tx.organisationMember.create({
        data: {
          id: generateDatabaseId('member'),
          userId,
          organisationId: createdOrg.id,
          organisationGroupMembers: {
            create: {
              id: generateDatabaseId('group_member'),
              groupId: adminGroup.id,
            },
          },
        },
      });
    }

    return createdOrg;
  });

  // Create default team for the newly provisioned organization
  await createTeam({
    userId,
    teamName: 'General',
    teamUrl: prefixedId('team'),
    organisationId: newOrg.id,
    inheritMembers: true,
  }).catch((err) => {
    console.error(`[DOS ID] Failed to create default team for org ${newOrg.id}:`, err);
  });

  return newOrg;
};

/**
 * Provision or join a team for a user given DOS ID team claims.
 */
export const syncTeamForUser = async ({
  userId,
  team,
  organisationId,
}: {
  userId: number;
  team: DosTeamClaim;
  organisationId: string;
}) => {
  const teamName = team.name || team.slug || 'Team';
  const rawTeamSlug = team.slug || team.id || team.team_id || prefixedId('team');
  const teamRole = mapDosRoleToTeamRole(team.role);

  // Check if team exists under this organisation
  let existingTeam = await prisma.team.findFirst({
    where: {
      organisationId,
      OR: [{ url: rawTeamSlug }, { name: teamName }],
    },
    include: {
      teamGroups: {
        include: {
          organisationGroup: {
            include: {
              organisationGroupMembers: {
                include: {
                  organisationMember: true,
                },
              },
            },
          },
        },
      },
    },
  });

  // If team doesn't exist, create it
  if (!existingTeam) {
    try {
      await createTeam({
        userId,
        teamName,
        teamUrl: rawTeamSlug,
        organisationId,
        inheritMembers: true,
      });

      existingTeam = await prisma.team.findFirst({
        where: {
          organisationId,
          url: rawTeamSlug,
        },
        include: {
          teamGroups: {
            include: {
              organisationGroup: {
                include: {
                  organisationGroupMembers: {
                    include: {
                      organisationMember: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
    } catch (err) {
      console.warn(`[DOS ID] Could not create team ${teamName} (${rawTeamSlug}):`, err);
    }
  }

  if (!existingTeam) {
    return;
  }

  // Find user's organisation member record
  const orgMember = await prisma.organisationMember.findFirst({
    where: {
      userId,
      organisationId,
    },
  });

  if (!orgMember) {
    return;
  }

  // Find matching team group for the desired role
  const matchingTeamGroup = existingTeam.teamGroups.find(
    (tg) => tg.teamRole === teamRole,
  );

  if (matchingTeamGroup) {
    const isAlreadyInGroup = matchingTeamGroup.organisationGroup.organisationGroupMembers.some(
      (ogm) => ogm.organisationMember.userId === userId,
    );

    if (!isAlreadyInGroup) {
      await prisma.organisationGroupMember.create({
        data: {
          id: generateDatabaseId('group_member'),
          groupId: matchingTeamGroup.organisationGroupId,
          organisationMemberId: orgMember.id,
        },
      }).catch(() => null);
    }
  }
};

/**
 * Main JIT sync function triggered on OIDC callback.
 */
export const syncDosProfileAndOrgs = async ({
  userId,
  email,
  name,
  avatarUrl,
  organizations,
  teams,
  activeOrgId,
}: SyncDosUserOptions) => {
  // 1. Sync Name
  if (name) {
    await prisma.user
      .update({
        where: { id: userId },
        data: { name },
      })
      .catch((err) => {
        console.error(`[DOS ID] Failed to update user name for user ${userId}:`, err);
      });
  }

  // 2. Sync Avatar if URL is provided
  if (avatarUrl) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarImageId: true },
    });

    if (!user?.avatarImageId) {
      await syncUserAvatarFromUrl(userId, avatarUrl);
    }
  }

  // 3. JIT Provision Organizations from claims OR shared PostgreSQL DB fallback
  let orgsToSync = organizations;

  if (!orgsToSync || orgsToSync.length === 0) {
    try {
      const userEmail = email.toLowerCase();
      const dbOrgs = await prisma.$queryRaw<
        Array<{
          id: string;
          name: string;
          slug: string | null;
          role: string | null;
          avatar_url: string | null;
        }>
      >`
        SELECT 
          o.id::text as id,
          o.name,
          COALESCE(o.slug, o.id::text) as slug,
          'ADMIN' as role,
          o.avatar_url
        FROM public.organizations o
        JOIN auth.users u ON u.id = o.owner_id
        WHERE LOWER(u.email) = ${userEmail} AND (o.is_deleted IS NULL OR o.is_deleted = false)

        UNION

        SELECT 
          o.id::text as id,
          o.name,
          COALESCE(o.slug, o.id::text) as slug,
          COALESCE(om.role, 'MEMBER') as role,
          o.avatar_url
        FROM public.organizations o
        JOIN public.org_members om ON om.org_id = o.id
        JOIN auth.users u ON u.id = om.user_id
        WHERE LOWER(u.email) = ${userEmail} AND (o.is_deleted IS NULL OR o.is_deleted = false)
      `;

      if (Array.isArray(dbOrgs) && dbOrgs.length > 0) {
        orgsToSync = dbOrgs.map((o) => ({
          org_id: o.id,
          name: o.name,
          slug: o.slug || o.id,
          role: o.role || 'MEMBER',
          avatar_url: o.avatar_url,
        }));
      }
    } catch (err) {
      console.warn('[DOS ID] Direct DB fallback query for organizations failed:', err);
    }
  }

  if (Array.isArray(orgsToSync) && orgsToSync.length > 0) {
    for (const org of orgsToSync) {
      if (org && typeof org === 'object') {
        await syncOrganisationForUser({ userId, org }).catch((err) => {
          console.error(`[DOS ID] Failed to JIT provision org for user ${userId}:`, err);
        });
      }
    }
  }

  // 4. JIT Provision Teams from claims
  if (Array.isArray(teams) && teams.length > 0) {
    for (const team of teams) {
      if (team && typeof team === 'object') {
        const targetOrgId = team.org_id || team.organisation_id || activeOrgId;
        const targetOrg = targetOrgId
          ? await prisma.organisation.findFirst({
              where: {
                OR: [{ id: targetOrgId }, { url: targetOrgId }],
              },
              select: { id: true },
            })
          : await prisma.organisationMember.findFirst({
              where: { userId },
              select: { organisationId: true },
            });

        if (targetOrg) {
          const finalOrgId = 'id' in targetOrg ? targetOrg.id : targetOrg.organisationId;
          await syncTeamForUser({
            userId,
            team,
            organisationId: finalOrgId,
          }).catch((err) => {
            console.error(
              `[DOS ID] Failed to JIT sync team ${team.name || team.slug} for user ${userId}:`,
              err,
            );
          });
        }
      }
    }
  }
};
