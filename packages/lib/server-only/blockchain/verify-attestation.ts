import { prisma } from '@documenso/prisma';
import { BlockchainAnchorStatus } from '@prisma/client';

import { hashBytes32 } from './canonical-json';

export type TBlockchainVerificationResult = {
  isValid: boolean;
  status: 'VALID' | 'NOT_FOUND' | 'NOT_ANCHORED' | 'REVOKED';
  // Null when there is no on-chain anchor to compare against; never a
  // placeholder value that could be mistaken for a real hash.
  documentHash: string | null;
  envelopeId?: string;
  envelopeTitle?: string;
  attestationUid?: string;
  txHash?: string | null;
  blockNumber?: number | null;
  network?: string;
  anchoredAt?: string | null;
  completedAt?: string | null;
  // Signer emails are intentionally excluded: this result is served by
  // unauthenticated public endpoints.
  signers?: Array<{ name: string; role: string }>;
  evidence?: {
    artifactRoot: string;
    auditBundleRoot: string;
    envelopeHash: string;
  };
  disclaimer: string;
};

/**
 * Verify raw PDF file bytes against immutable blockchain anchors.
 *
 * Only anchors in the CONFIRMED state count as evidence. The previous
 * implementation also substring-searched every stored PDF blob and trusted
 * legacy DOCUMENT_ANCHORED_ONCHAIN audit entries; both were removed because
 * those entries were written by a placeholder that fabricated txHash /
 * blockNumber without any on-chain transaction, so treating them as valid
 * evidence is dishonest. Re-introduce a fallback only once anchors carry a
 * real on-chain receipt.
 */
export async function verifyDocumentFile(
  pdfBuffer: Buffer | Uint8Array,
): Promise<TBlockchainVerificationResult> {
  const documentHash = hashBytes32(pdfBuffer);

  const anchor = await prisma.blockchainAnchor.findFirst({
    where: {
      artifactRoot: documentHash,
      status: BlockchainAnchorStatus.CONFIRMED,
    },
    include: {
      envelope: {
        include: {
          recipients: true,
          documentMeta: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (!anchor) {
    return {
      isValid: false,
      status: 'NOT_FOUND',
      documentHash,
      disclaimer:
        'No confirmed on-chain attestation was found for this document hash. Please ensure you are verifying the exact finalized PDF.',
    };
  }

  return {
    isValid: true,
    status: 'VALID',
    documentHash,
    envelopeId: anchor.envelope.id,
    envelopeTitle: anchor.envelope.title,
    attestationUid: anchor.attestationUid || undefined,
    txHash: anchor.txHash,
    blockNumber: anchor.blockNumber,
    network: 'dos-chain',
    anchoredAt: anchor.anchoredAt?.toISOString() || anchor.createdAt.toISOString(),
    completedAt: anchor.envelope.completedAt?.toISOString() || null,
    signers: anchor.envelope.recipients.map((r) => ({
      name: r.name,
      role: r.role,
    })),
    evidence: {
      artifactRoot: anchor.artifactRoot,
      auditBundleRoot: anchor.auditBundleRoot,
      envelopeHash: anchor.envelopeHash,
    },
    disclaimer:
      'This document matches byte-for-byte with the tamper-evident cryptographic evidence anchored to DOS Chain / EAS layer. Legal signature validity is governed by qualified certificate standards (PAdES).',
  };
}

/**
 * Verify a document by the QR token printed on its completion certificate.
 *
 * A document that has no CONFIRMED anchor is reported as NOT_ANCHORED with
 * `isValid: false` - previously this endpoint returned `isValid: true` /
 * `status: 'VALID'` for any existing envelope, with a fabricated
 * `documentHash: '0x0'` when no anchor existed, so the public verification
 * portal confirmed documents that were never anchored on-chain.
 */
export async function verifyDocumentByQrToken(
  qrToken: string,
): Promise<TBlockchainVerificationResult | null> {
  const envelope = await prisma.envelope.findFirst({
    where: { qrToken },
    include: {
      recipients: true,
      blockchainAnchors: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!envelope) {
    return null;
  }

  const anchor = envelope.blockchainAnchors.find((a) => a.status === BlockchainAnchorStatus.CONFIRMED);

  if (!anchor) {
    return {
      isValid: false,
      status: 'NOT_ANCHORED',
      documentHash: null,
      envelopeId: envelope.id,
      envelopeTitle: envelope.title,
      completedAt: envelope.completedAt?.toISOString() || null,
      signers: envelope.recipients.map((r) => ({
        name: r.name,
        role: r.role,
      })),
      disclaimer:
        'This document certificate exists in Crove Sign but has not been confirmed on-chain; no tamper-evident on-chain receipt is available for it.',
    };
  }

  return {
    isValid: true,
    status: 'VALID',
    documentHash: anchor.artifactRoot,
    envelopeId: envelope.id,
    envelopeTitle: envelope.title,
    attestationUid: anchor.attestationUid || undefined,
    txHash: anchor.txHash,
    blockNumber: anchor.blockNumber,
    network: 'dos-chain',
    anchoredAt: anchor.anchoredAt?.toISOString() || anchor.createdAt.toISOString(),
    completedAt: envelope.completedAt?.toISOString() || null,
    signers: envelope.recipients.map((r) => ({
      name: r.name,
      role: r.role,
    })),
    evidence: {
      artifactRoot: anchor.artifactRoot,
      auditBundleRoot: anchor.auditBundleRoot,
      envelopeHash: anchor.envelopeHash,
    },
    disclaimer:
      'This document certificate is registered on Crove Sign with decentralized tamper-evident integrity receipt.',
  };
}
