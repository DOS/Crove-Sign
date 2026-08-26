import type { WebhookTriggerEvents } from '@prisma/client';

import { jobs } from '../../../jobs/client';
import { publishDosEcosystemEvent } from '../../dos-id/publish-dos-event';
import { getAllWebhooksByEventTrigger } from '../get-all-webhooks-by-event-trigger';

export type TriggerWebhookOptions = {
  event: WebhookTriggerEvents;
  data: Record<string, unknown>;
  userId: number;
  teamId: number;
};

export const triggerWebhook = async ({ event, data, userId, teamId }: TriggerWebhookOptions) => {
  try {
    // 1. Dispatch to ecosystem event router (Crove OS Event Router -> CRM / Desk)
    void publishDosEcosystemEvent({
      event: event.toLowerCase().replace(/_/g, '.'),
      data: {
        ...data,
        user_id: userId,
        team_id: teamId,
      },
    }).catch(() => null);

    // 2. Dispatch to tenant-configured webhooks
    const registeredWebhooks = await getAllWebhooksByEventTrigger({ event, userId, teamId });

    if (registeredWebhooks.length === 0) {
      return;
    }

    await Promise.allSettled(
      registeredWebhooks.map(async (webhook) => {
        await jobs.triggerJob({
          name: 'internal.execute-webhook',
          payload: {
            event,
            webhookId: webhook.id,
            data,
          },
        });
      }),
    );
  } catch (err) {
    console.error(err);
    throw new Error(`Failed to trigger webhook`);
  }
};
