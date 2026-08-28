import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  CROVE_ATTESTATION_RESOLVER_ABI,
  CROVE_SIGN_SCHEMA_V2,
} from './resolver-abi';

describe('CroveAttestationResolver ABI & Schema Contract', () => {
  it('should export the standard Crove Sign EAS schema v2', () => {
    expect(CROVE_SIGN_SCHEMA_V2).toBe(
      'bytes32 anchorId, bytes32 documentHash, bytes32 auditRoot, uint16 itemIndex, uint16 itemCount, uint16 formatVersion',
    );
  });

  it('should include all required view functions for reverse lookup in ABI', () => {
    const functionNames = CROVE_ATTESTATION_RESOLVER_ABI.filter(
      (item) => item.type === 'function',
    ).map((item) => item.name);

    expect(functionNames).toContain('getAttestationUIDsByDocumentHash');
    expect(functionNames).toContain('getAttestationUIDsByAnchorId');
    expect(functionNames).toContain('getLatestAttestationUID');
    expect(functionNames).toContain('isDocumentAttested');
    expect(functionNames).toContain('verifyDocument');
    expect(functionNames).toContain('authorizedAttesters');
    expect(functionNames).toContain('setAuthorizedAttester');
    expect(functionNames).toContain('setSchemaUID');
    expect(functionNames).toContain('owner');
    expect(functionNames).toContain('getEAS');
  });

  it('should include all indexing events in ABI', () => {
    const eventNames = CROVE_ATTESTATION_RESOLVER_ABI.filter(
      (item) => item.type === 'event',
    ).map((item) => item.name);

    expect(eventNames).toContain('DocumentAttested');
    expect(eventNames).toContain('DocumentRevoked');
    expect(eventNames).toContain('AttesterAuthorized');
    expect(eventNames).toContain('SchemaUIDSet');
    expect(eventNames).toContain('OwnershipTransferred');
  });

  it('should correctly simulate reverse lookup mapping logic', () => {
    // In-memory simulation of CroveAttestationResolver state
    const documentHashToUIDs = new Map<string, string[]>();
    const anchorIdToUIDs = new Map<string, string[]>();

    const docHash = `0x${crypto.createHash('sha256').update('sample pdf buffer').digest('hex')}`;
    const anchorId = `0x${crypto.randomBytes(32).toString('hex')}`;
    const attestationUid = `0x${crypto.randomBytes(32).toString('hex')}`;

    // onAttest simulation
    if (!documentHashToUIDs.has(docHash)) {
      documentHashToUIDs.set(docHash, []);
    }
    documentHashToUIDs.get(docHash)!.push(attestationUid);

    if (!anchorIdToUIDs.has(anchorId)) {
      anchorIdToUIDs.set(anchorId, []);
    }
    anchorIdToUIDs.get(anchorId)!.push(attestationUid);

    // verifyDocument simulation
    const uids = documentHashToUIDs.get(docHash) || [];
    const isAttested = uids.length > 0;
    const latestUID = isAttested ? uids[uids.length - 1] : '0x0';
    const count = uids.length;

    expect(isAttested).toBe(true);
    expect(latestUID).toBe(attestationUid);
    expect(count).toBe(1);
    expect(anchorIdToUIDs.get(anchorId)).toEqual([attestationUid]);
  });
});
