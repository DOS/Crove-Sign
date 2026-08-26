import { z } from 'zod';

import type { JobDefinition } from '../../client/_internal/job';

const PUBLISH_DOS_EVENT_JOB_DEFINITION_ID = 'internal.publish-dos-event';

const PUBLISH_DOS_EVENT_JOB_DEFINITION_SCHEMA = z.object({
  event: z.string(),
  data: z.record(z.unknown()),
});

export type TPublishDosEventJobDefinition = z.infer<typeof PUBLISH_DOS_EVENT_JOB_DEFINITION_SCHEMA>;

export const PUBLISH_DOS_EVENT_JOB_DEFINITION = {
  id: PUBLISH_DOS_EVENT_JOB_DEFINITION_ID,
  name: 'Publish Event to DOS.Me Event Router',
  version: '1.0.0',
  trigger: {
    name: PUBLISH_DOS_EVENT_JOB_DEFINITION_ID,
    schema: PUBLISH_DOS_EVENT_JOB_DEFINITION_SCHEMA,
  },
  handler: async ({ payload, io }) => {
    const handler = await import('./publish-dos-event.handler');

    await handler.run({ payload, io });
  },
} as const satisfies JobDefinition<typeof PUBLISH_DOS_EVENT_JOB_DEFINITION_ID, TPublishDosEventJobDefinition>;
