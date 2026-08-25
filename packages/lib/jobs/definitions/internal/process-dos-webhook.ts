import { z } from 'zod';

import type { JobDefinition } from '../../client/_internal/job';

const PROCESS_DOS_WEBHOOK_JOB_DEFINITION_ID = 'internal.process-dos-webhook';

const PROCESS_DOS_WEBHOOK_JOB_DEFINITION_SCHEMA = z.object({
  eventId: z.string().optional(),
  event: z.string(),
  data: z.record(z.unknown()).optional(),
  org_id: z.string().optional(),
  name: z.string().optional(),
  slug: z.string().optional(),
  owner_id: z.string().optional(),
  owner_email: z.string().optional(),
  avatar_url: z.string().nullable().optional(),
  org_name: z.string().optional(),
  user_id: z.string().optional(),
  user_email: z.string().optional(),
  role: z.string().optional(),
  email: z.string().optional(),
  display_name: z.string().optional(),
}).passthrough();

export type TProcessDosWebhookJobDefinition = z.infer<typeof PROCESS_DOS_WEBHOOK_JOB_DEFINITION_SCHEMA>;

export const PROCESS_DOS_WEBHOOK_JOB_DEFINITION = {
  id: PROCESS_DOS_WEBHOOK_JOB_DEFINITION_ID,
  name: 'Process DOS.Me Webhook',
  version: '1.0.0',
  trigger: {
    name: PROCESS_DOS_WEBHOOK_JOB_DEFINITION_ID,
    schema: PROCESS_DOS_WEBHOOK_JOB_DEFINITION_SCHEMA,
  },
  handler: async ({ payload, io }) => {
    const handler = await import('./process-dos-webhook.handler');

    await handler.run({ payload, io });
  },
} as const satisfies JobDefinition<typeof PROCESS_DOS_WEBHOOK_JOB_DEFINITION_ID, TProcessDosWebhookJobDefinition>;
