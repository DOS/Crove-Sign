import { getSubscriptionClaim } from '@documenso/lib/server-only/subscription/get-subscription-claim';
import { prisma } from '@documenso/prisma';
import { OrganisationType } from '@prisma/client';

import { INTERNAL_CLAIM_ID } from '../../types/subscription';
import { env } from '../../utils/env';
import { slugify } from '../../utils/slugify';
import { createOrganisation } from '../organisation/create-organisation';
import { syncOrganisationForUser } from './sync-dos-profile';

export type CreateDosOrganisationOptions = {
  userId: number;
  name: string;
  slug?: string;
};

/**
 * Delegate organization creation to DOS.Me API (api.dos.me/organizations).
 * If the user has a valid OIDC access token, this calls DOS.Me Hub which
 * creates the organization in public.organizations and fans out webhook events
 * to Crove CRM, Crove Post, Crove Cal, etc.
 *
 * If API delegation is unavailable, it gracefully falls back to local creation.
 */
export const createDosOrganisation = async ({
  userId,
  name,
  slug,
}: CreateDosOrganisationOptions) => {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: 'oidc',
    },
  });

  const rawSlug = slug || slugify(name) || `org-${Date.now()}`;
  const dosApiUrl = env('DOS_API_URL') || 'https://api.dos.me';

  if (account?.access_token) {
    try {
      const response = await fetch(`${dosApiUrl}/organizations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${account.access_token}`,
        },
        body: JSON.stringify({
          name,
          slug: rawSlug,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          id?: string;
          org_id?: string;
          name?: string;
          slug?: string;
          avatar_url?: string | null;
          role?: string;
        };

        const createdOrg = await syncOrganisationForUser({
          userId,
          org: {
            org_id: data.org_id || data.id,
            name: data.name || name,
            slug: data.slug || rawSlug,
            role: data.role || 'ADMIN',
            avatar_url: data.avatar_url,
          },
        });

        return createdOrg;
      }

      console.warn(`[DOS ID] API delegation to ${dosApiUrl}/organizations returned ${response.status}`);
    } catch (error) {
      console.warn('[DOS ID] API delegation to DOS.Me failed, falling back to local creation:', error);
    }
  }

  // Fallback: create organization directly in sign schema
  const freeSubscriptionClaim = await getSubscriptionClaim(INTERNAL_CLAIM_ID.FREE);

  return await createOrganisation({
    userId,
    name,
    type: OrganisationType.ORGANISATION,
    url: rawSlug,
    claim: freeSubscriptionClaim,
  });
};
