import { env } from '@documenso/lib/utils/env';
import { prisma } from '@documenso/prisma';
import { BlockchainAnchorStatus } from '@prisma/client';
import type { JobRunIO } from '../../client/_internal/job';
import type { TAnchorEnvelopeOnchainJobDefinition } from './anchor-envelope-onchain';

export const run = async ({ payload, io }: { payload: TAnchorEnvelopeOnchainJobDefinition; io: JobRunIO }) => {
  const { envelopeId, anchorKey } = payload;

  io.logger.info(`[Blockchain Anchor] Starting on-chain anchor job for envelope ${envelopeId}`);

  const anchor = await prisma.blockchainAnchor.findFirst({
    where: {
      envelopeId,
      ...(anchorKey ? { anchorKey } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!anchor) {
    io.logger.warn(`[Blockchain Anchor] No BlockchainAnchor record found for envelope ${envelopeId}`);
    return { success: false, message: 'Anchor record not found' };
  }

  if (anchor.status === BlockchainAnchorStatus.CONFIRMED) {
    io.logger.info(
      `[Blockchain Anchor] Envelope ${envelopeId} already confirmed on-chain (UID: ${anchor.attestationUid})`,
    );
    return { success: true, attestationUid: anchor.attestationUid };
  }

  // Update status to SUBMITTED
  await prisma.blockchainAnchor.update({
    where: { id: anchor.id },
    data: {
      status: BlockchainAnchorStatus.SUBMITTED,
      attempts: { increment: 1 },
    },
  });

  try {
    const gatewayAddress = env('CROVE_ANCHOR_GATEWAY_ADDRESS');
    const relayerKey = env('CROVE_RELAYER_PRIVATE_KEY');

    if (!gatewayAddress || !relayerKey) {
      throw new Error(
        'On-chain anchoring is not configured (missing CROVE_ANCHOR_GATEWAY_ADDRESS or CROVE_RELAYER_PRIVATE_KEY); the anchor is kept local-only and is NOT confirmed on-chain',
      );
    }

    // A real broadcast (viem/ethers -> EAS gateway) is not implemented yet.
    // The previous placeholder fabricated txHash/blockNumber and marked the
    // anchor CONFIRMED without any on-chain transaction, which surfaced
    // fabricated evidence in certificates and the public verification
    // portal. Fail instead so the anchor lands in RETRYABLE_FAILED /
    // PERMANENT_FAILED (see the catch block below) until a real receipt
    // exists and DOCUMENT_ANCHORED_ONCHAIN can be written truthfully.
    throw new Error(
      `Live on-chain broadcast to gateway ${gatewayAddress} is not implemented; the anchor is kept local-only and is NOT confirmed on-chain`,
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    io.logger.error(`[Blockchain Anchor] Error anchoring envelope ${envelopeId}:`, errorMessage);

    const isRetryable = anchor.attempts < 5;

    await prisma.blockchainAnchor.update({
      where: { id: anchor.id },
      data: {
        status: isRetryable ? BlockchainAnchorStatus.RETRYABLE_FAILED : BlockchainAnchorStatus.PERMANENT_FAILED,
        lastError: errorMessage,
      },
    });

    throw error;
  }
};
