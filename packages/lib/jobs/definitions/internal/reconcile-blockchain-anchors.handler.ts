import { prisma } from '@documenso/prisma';
import { BlockchainAnchorStatus } from '@prisma/client';

import { jobs } from '../../client';
import type { JobRunIO } from '../../client/_internal/job';
import type { TReconcileBlockchainAnchorsJobDefinition } from './reconcile-blockchain-anchors';

export const run = async ({
  payload: _payload,
  io,
}: {
  payload: TReconcileBlockchainAnchorsJobDefinition;
  io: JobRunIO;
}) => {
  io.logger.info('[Blockchain Reconcile] Checking for un-anchored outbox entries...');

  // Find anchors stuck in PENDING or RETRYABLE_FAILED with fewer than 5 attempts
  const stuckAnchors = await prisma.blockchainAnchor.findMany({
    where: {
      status: {
        in: [
          BlockchainAnchorStatus.PENDING,
          BlockchainAnchorStatus.RETRYABLE_FAILED,
        ],
      },
      attempts: {
        lt: 5,
      },
    },
    take: 50,
    orderBy: { createdAt: 'asc' },
  });

  if (stuckAnchors.length === 0) {
    io.logger.info('[Blockchain Reconcile] No stuck anchors found.');
    return { count: 0 };
  }

  io.logger.info(`[Blockchain Reconcile] Found ${stuckAnchors.length} outbox anchors to reconcile.`);

  for (const anchor of stuckAnchors) {
    try {
      await jobs.triggerJob({
        name: 'internal.anchor-envelope-onchain',
        payload: {
          envelopeId: anchor.envelopeId,
          anchorKey: anchor.anchorKey,
        },
      });
    } catch (err) {
      io.logger.warn(`[Blockchain Reconcile] Failed to re-trigger anchor for ${anchor.envelopeId}:`, err);
    }
  }

  return { count: stuckAnchors.length };
};
