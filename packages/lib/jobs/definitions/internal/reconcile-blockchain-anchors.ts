import { z } from 'zod';

import type { JobDefinition } from '../../client/_internal/job';

const RECONCILE_BLOCKCHAIN_ANCHORS_JOB_DEFINITION_ID = 'internal.reconcile-blockchain-anchors';

const RECONCILE_BLOCKCHAIN_ANCHORS_JOB_DEFINITION_SCHEMA = z.object({});

export type TReconcileBlockchainAnchorsJobDefinition = z.infer<
  typeof RECONCILE_BLOCKCHAIN_ANCHORS_JOB_DEFINITION_SCHEMA
>;

export const RECONCILE_BLOCKCHAIN_ANCHORS_JOB_DEFINITION = {
  id: RECONCILE_BLOCKCHAIN_ANCHORS_JOB_DEFINITION_ID,
  name: 'Reconcile Blockchain Anchors (Outbox Recovery Sweep)',
  version: '1.0.0',
  trigger: {
    name: RECONCILE_BLOCKCHAIN_ANCHORS_JOB_DEFINITION_ID,
    schema: RECONCILE_BLOCKCHAIN_ANCHORS_JOB_DEFINITION_SCHEMA,
    cron: '*/10 * * * *', // Run every 10 minutes
  },
  handler: async ({ payload, io }) => {
    const handler = await import('./reconcile-blockchain-anchors.handler');

    await handler.run({ payload, io });
  },
} as const satisfies JobDefinition<
  typeof RECONCILE_BLOCKCHAIN_ANCHORS_JOB_DEFINITION_ID,
  TReconcileBlockchainAnchorsJobDefinition
>;
