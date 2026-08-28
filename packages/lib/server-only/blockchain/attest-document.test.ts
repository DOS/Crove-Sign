import { describe, expect, it } from 'vitest';

import {
  computeDocumentHashes,
  generateAttestationUid,
  signAttestationPayload,
} from './attest-document';
import { CROVE_EAS_SCHEMA_UID } from './types';

describe('blockchain/attest-document', () => {
  const samplePdfContent = Buffer.from('%PDF-1.4 Mock Contract Content For Testing 12345');

  it('should compute valid deterministic SHA-256 and Keccak-256 hashes', () => {
    const { sha256, keccak256Hex } = computeDocumentHashes(samplePdfContent);

    expect(sha256).toBeDefined();
    expect(sha256.length).toBe(64); // 32 bytes hex
    expect(keccak256Hex).toBeDefined();
    expect(keccak256Hex.startsWith('0x')).toBe(true);
    expect(keccak256Hex.length).toBe(66); // '0x' + 64 hex chars
  });

  it('should produce deterministic EAS UID for identical inputs', () => {
    const time = 1756000000;
    const recipient = '0x0000000000000000000000000000000000000000';
    const dataHash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

    const uid1 = generateAttestationUid(CROVE_EAS_SCHEMA_UID, recipient, time, dataHash);
    const uid2 = generateAttestationUid(CROVE_EAS_SCHEMA_UID, recipient, time, dataHash);

    expect(uid1).toBe(uid2);
    expect(uid1.startsWith('0x')).toBe(true);
  });

  it('should generate valid EIP-712 / HMAC signature components (r, s, v)', () => {
    const uid = '0x7c9b846e4b52479e956554a938c5a2c4e231189ab8c42a265696d5e1654e5659';
    const secret = 'test-crove-attestation-secret';

    const sig = signAttestationPayload(uid, secret);

    expect(sig.r).toBeDefined();
    expect(sig.s).toBeDefined();
    expect(sig.v).toBe(27);
    expect(sig.signatureString.startsWith('0x')).toBe(true);
  });
});
