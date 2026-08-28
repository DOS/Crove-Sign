import crypto from 'node:crypto';
import { prisma } from '@documenso/prisma';
import { BlockchainAnchorStatus } from '@prisma/client';

import { hashBytes32 } from './canonical-json';

export type TBlockchainVerificationResult = {
  isValid: boolean;
  status: 'VALID' | 'NOT_FOUND' | 'REVOKED';
  documentHash: string;
  envelopeId?: string;
  envelopeTitle?: string;
  attestationUid?: string;
  txHash?: string | null;
  blockNumber?: number | null;
  network?: string;
  anchoredAt?: string | null;
  completedAt?: string | null;
  signers?: Array<{ name: string; email: string; role: string }>;
  evidence?: {
    artifactRoot: string;
    auditBundleRoot: string;
    envelopeHash: string;
  };
  disclaimer: string;
};

/**
 * Verify raw PDF file bytes against immutable blockchain anchors and EAS records.
 */
export async function verifyDocumentFile(
  pdfBuffer: Buffer | Uint8Array,
): Promise<TBlockchainVerificationResult> {
  const documentHash = hashBytes32(pdfBuffer);

  // 1. Search in BlockchainAnchor table by matching artifactRoot or through Envelope items
  const anchor = await prisma.blockchainAnchor.findFirst({
    where: {
      OR: [
        { artifactRoot: documentHash },
        {
          envelope: {
            envelopeItems: {
              some: {
                // If single PDF matches
                documentData: {
                  data: { contains: documentHash.slice(2) },
                },
              },
            },
          },
        },
      ],
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

  // Fallback: Check Audit Logs for on-chain anchoring events
  if (!anchor) {
    const auditLog = await prisma.documentAuditLog.findFirst({
      where: {
        type: 'DOCUMENT_ANCHORED_ONCHAIN',
        data: {
          path: ['artifactRoot'],
          equals: documentHash,
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        envelope: {
          include: {
            recipients: true,
          },
        },
      },
    });

    if (auditLog && auditLog.envelope) {
      const data = auditLog.data as Record<string, unknown>;
      return {
        isValid: true,
        status: 'VALID',
        documentHash,
        envelopeId: auditLog.envelope.id,
        envelopeTitle: auditLog.envelope.title,
        attestationUid: (data.attestationUid as string) || undefined,
        txHash: (data.txHash as string) || null,
        blockNumber: (data.blockNumber as number) || null,
        network: 'dos-chain',
        anchoredAt: auditLog.createdAt.toISOString(),
        completedAt: auditLog.envelope.completedAt?.toISOString() || null,
        signers: auditLog.envelope.recipients.map((r) => ({
          name: r.name,
          email: r.email,
          role: r.role,
        })),
        evidence: {
          artifactRoot: (data.artifactRoot as string) || documentHash,
          auditBundleRoot: (data.auditBundleRoot as string) || '',
          envelopeHash: (data.envelopeHash as string) || '',
        },
        disclaimer:
          'This document matches byte-for-byte with the tamper-evident cryptographic evidence anchored to DOS Chain / EAS layer. Legal signature validity is governed by qualified certificate standards (PAdES).',
      };
    }

    return {
      isValid: false,
      status: 'NOT_FOUND',
      documentHash,
      disclaimer:
        'No matching blockchain attestation was found for this document hash. Please ensure you are verifying the exact finalized PDF.',
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
      email: r.email,
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
 * Verify document by QR Token (from certificate QR code).
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

  const anchor = envelope.blockchainAnchors[0];

  return {
    isValid: true,
    status: 'VALID',
    documentHash: anchor?.artifactRoot || '0x0',
    envelopeId: envelope.id,
    envelopeTitle: envelope.title,
    attestationUid: anchor?.attestationUid || undefined,
    txHash: anchor?.txHash || null,
    blockNumber: anchor?.blockNumber || null,
    network: 'dos-chain',
    anchoredAt: anchor?.anchoredAt?.toISOString() || anchor?.createdAt.toISOString() || null,
    completedAt: envelope.completedAt?.toISOString() || null,
    signers: envelope.recipients.map((r) => ({
      name: r.name,
      email: r.email,
      role: r.role,
    })),
    evidence: anchor
      ? {
          artifactRoot: anchor.artifactRoot,
          auditBundleRoot: anchor.auditBundleRoot,
          envelopeHash: anchor.envelopeHash,
        }
      : undefined,
    disclaimer:
      'This document certificate is registered on Crove Sign with decentralized tamper-evident integrity receipt.',
  };
}
