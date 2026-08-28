import { z } from 'zod';

import type { JobDefinition } from '../../client/_internal/job';

const ANCHOR_ENVELOPE_ONCHAIN_JOB_DEFINITION_ID = 'internal.anchor-envelope-onchain';

const ANCHOR_ENVELOPE_ONCHAIN_JOB_DEFINITION_SCHEMA = z.object({
  envelopeId: z.string(),
  anchorKey: z.string().optional(),
});

export type TAnchorEnvelopeOnchainJobDefinition = z.infer<
  typeof ANCHOR_ENVELOPE_ONCHAIN_JOB_DEFINITION_SCHEMA
>;

export const ANCHOR_ENVELOPE_ONCHAIN_JOB_DEFINITION = {
  id: ANCHOR_ENVELOPE_ONCHAIN_JOB_DEFINITION_ID,
  name: 'Anchor Envelope On-Chain (EAS / DOS Chain)',
  version: '1.0.0',
  trigger: {
    name: ANCHOR_ENVELOPE_ONCHAIN_JOB_DEFINITION_ID,
    schema: ANCHOR_ENVELOPE_ONCHAIN_JOB_DEFINITION_SCHEMA,
  },
  handler: async ({ payload, io }) => {
    const handler = await import('./anchor-envelope-onchain.handler');

    await handler.run({ payload, io });
  },
} as const satisfies JobDefinition<
  typeof ANCHOR_ENVELOPE_ONCHAIN_JOB_DEFINITION_ID,
  TAnchorEnvelopeOnchainJobDefinition
>;
