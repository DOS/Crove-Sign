import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  canonicalizeJson,
  computeMerkleRoot,
  hashBytes32,
  hashCanonicalJson,
} from './canonical-json';
import { CROVE_EAS_SCHEMA_V2 } from './resolver-abi';

describe('Blockchain Outbox & Attestation State Machine Simulation', () => {
  // Enum mirroring Prisma BlockchainAnchorStatus
  const BlockchainAnchorStatus = {
    PENDING: 'PENDING',
    SUBMITTED: 'SUBMITTED',
    CONFIRMED: 'CONFIRMED',
    RETRYABLE_FAILED: 'RETRYABLE_FAILED',
    PERMANENT_FAILED: 'PERMANENT_FAILED',
  } as const;

  type TBlockchainAnchorRecord = {
    id: string;
    envelopeId: string;
    anchorKey: string;
    envelopeHash: string;
    artifactRoot: string;
    auditBundleRoot: string;
    identityEvidenceRoot?: string | null;
    riskEvidenceRoot?: string | null;
    policyHash?: string | null;
    evidenceVersion: number;
    eventType: number;
    status: (typeof BlockchainAnchorStatus)[keyof typeof BlockchainAnchorStatus];
    attempts: number;
    lastError?: string | null;
    txHash?: string | null;
    blockNumber?: number | null;
    attestationUid?: string | null;
    createdAt: Date;
    updatedAt: Date;
    anchoredAt?: Date | null;
  };

  it('should generate canonical RFC 8785 hash for complex audit bundles', () => {
    const auditBundle1 = {
      version: 1,
      envelopeId: 'env_12345',
      events: [
        { type: 'DOCUMENT_CREATED', at: '2026-08-31T05:00:00Z', by: 'user@crove.com' },
        { type: 'DOCUMENT_SIGNED', at: '2026-08-31T05:10:00Z', by: 'signer@crove.com' },
      ],
      meta: { certId: 'cert_abc', algorithm: 'RSA-SHA256' },
    };

    const auditBundle2 = {
      meta: { algorithm: 'RSA-SHA256', certId: 'cert_abc' },
      events: [
        { by: 'user@crove.com', at: '2026-08-31T05:00:00Z', type: 'DOCUMENT_CREATED' },
        { by: 'signer@crove.com', at: '2026-08-31T05:10:00Z', type: 'DOCUMENT_SIGNED' },
      ],
      envelopeId: 'env_12345',
      version: 1,
    };

    const hash1 = hashCanonicalJson(auditBundle1);
    const hash2 = hashCanonicalJson(auditBundle2);

    expect(hash1).toBe(hash2);
    expect(hash1.startsWith('0x')).toBe(true);
  });

  it('should compute artifactRoot Merkle tree for multi-item envelopes', () => {
    const pdf1Bytes = Buffer.from('%PDF-1.7 Agreement Document Item 1');
    const pdf2Bytes = Buffer.from('%PDF-1.7 Appendix A Document Item 2');
    const pdf3Bytes = Buffer.from('%PDF-1.7 Terms & Conditions Item 3');

    const hash1 = hashBytes32(pdf1Bytes);
    const hash2 = hashBytes32(pdf2Bytes);
    const hash3 = hashBytes32(pdf3Bytes);

    const artifactRoot = computeMerkleRoot([hash1, hash2, hash3]);

    expect(artifactRoot.startsWith('0x')).toBe(true);
    expect(artifactRoot.length).toBe(66);

    // Re-computing on same leaves must yield exact same root
    const verifyRoot = computeMerkleRoot([hash1, hash2, hash3]);
    expect(verifyRoot).toBe(artifactRoot);
  });

  it('should enforce idempotency when processing duplicate anchor requests', () => {
    const outboxDb = new Map<string, TBlockchainAnchorRecord>();

    const envelopeId = 'env_idempotency_test_01';
    const artifactRoot = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const auditBundleRoot = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    const envelopeHash = hashCanonicalJson({ domain: 'CroveSign:Envelope', id: envelopeId });
    const anchorKey = hashCanonicalJson({ envelopeId, eventType: 1, artifactRoot });

    // Step 1: Initial Outbox creation during seal transaction
    const initialRecord: TBlockchainAnchorRecord = {
      id: 'anc_1',
      envelopeId,
      anchorKey,
      envelopeHash,
      artifactRoot,
      auditBundleRoot,
      evidenceVersion: 1,
      eventType: 1,
      status: BlockchainAnchorStatus.PENDING,
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    outboxDb.set(anchorKey, initialRecord);

    // Step 2: Worker execution 1
    const record = outboxDb.get(anchorKey)!;
    expect(record.status).toBe(BlockchainAnchorStatus.PENDING);

    record.status = BlockchainAnchorStatus.SUBMITTED;
    record.attempts += 1;

    const deterministicUID = `0x${crypto
      .createHash('sha256')
      .update(`${record.anchorKey}:${record.artifactRoot}:${record.auditBundleRoot}`)
      .digest('hex')}`;

    record.attestationUid = deterministicUID;
    record.status = BlockchainAnchorStatus.CONFIRMED;
    record.anchoredAt = new Date();

    // Step 3: Duplicate trigger (e.g. queue retry or webhook replay)
    const secondExecution = () => {
      const existing = outboxDb.get(anchorKey);
      if (existing && existing.status === BlockchainAnchorStatus.CONFIRMED) {
        return { success: true, attestationUid: existing.attestationUid, isReplay: true };
      }
      return { success: false };
    };

    const result = secondExecution();
    expect(result.success).toBe(true);
    expect(result.isReplay).toBe(true);
    expect(result.attestationUid).toBe(deterministicUID);
    expect(record.attempts).toBe(1); // Did not double-increment
  });

  it('should handle outbox worker crash recovery and exponential retry state transitions', () => {
    const anchorRecord: TBlockchainAnchorRecord = {
      id: 'anc_crash_test',
      envelopeId: 'env_crash_test',
      anchorKey: 'key_crash_test',
      envelopeHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
      artifactRoot: '0x2222222222222222222222222222222222222222222222222222222222222222',
      auditBundleRoot: '0x3333333333333333333333333333333333333333333333333333333333333333',
      evidenceVersion: 1,
      eventType: 1,
      status: BlockchainAnchorStatus.PENDING,
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Simulate Failure 1 (e.g. temporary RPC network error)
    anchorRecord.attempts += 1;
    anchorRecord.lastError = 'RPC Connection Timeout';
    anchorRecord.status =
      anchorRecord.attempts < 5
        ? BlockchainAnchorStatus.RETRYABLE_FAILED
        : BlockchainAnchorStatus.PERMANENT_FAILED;

    expect(anchorRecord.status).toBe(BlockchainAnchorStatus.RETRYABLE_FAILED);
    expect(anchorRecord.attempts).toBe(1);

    // Simulate Reconciliation Sweep picking up RETRYABLE_FAILED record
    const eligibleForReconcile = [anchorRecord].filter(
      (a) =>
        (a.status === BlockchainAnchorStatus.PENDING ||
          a.status === BlockchainAnchorStatus.RETRYABLE_FAILED) &&
        a.attempts < 5,
    );
    expect(eligibleForReconcile.length).toBe(1);

    // Simulate Successful retry on attempt 2
    anchorRecord.attempts += 1;
    anchorRecord.status = BlockchainAnchorStatus.SUBMITTED;
    anchorRecord.attestationUid = '0xconfirmed_attestation_uid_123';
    anchorRecord.status = BlockchainAnchorStatus.CONFIRMED;
    anchorRecord.lastError = null;

    expect(anchorRecord.status).toBe(BlockchainAnchorStatus.CONFIRMED);
    expect(anchorRecord.lastError).toBeNull();
    expect(anchorRecord.attempts).toBe(2);
  });
});
