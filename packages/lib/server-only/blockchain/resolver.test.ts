import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  CROVE_ANCHOR_GATEWAY_ABI,
  CROVE_EAS_SCHEMA_V2,
  CROVE_RESOLVER_ABI,
} from './resolver-abi';

describe('CroveAttestationResolver ABI & Schema Contract', () => {
  it('should export the standard Crove Sign EAS schema v2', () => {
    expect(CROVE_EAS_SCHEMA_V2).toBe(
      'bytes32 envelopeHash, bytes32 artifactRoot, bytes32 auditBundleRoot, bytes32 identityEvidenceRoot, bytes32 riskEvidenceRoot, bytes32 policyHash, uint16 evidenceVersion, uint8 eventType',
    );
  });

  it('should include all required view functions for reverse lookup in the resolver ABI', () => {
    const functionNames = CROVE_RESOLVER_ABI
      .filter((item) => item.type === 'function')
      .map((item) => item.name);

    expect(functionNames).toContain('getAttestationsByArtifactRoot');
    expect(functionNames).toContain('getAttestationsByEnvelopeHash');
    expect(functionNames).toContain('getLatestAttestationByArtifactRoot');
    expect(functionNames).toContain('verifyArtifact');
    expect(functionNames).toContain('owner');
    expect(functionNames).toContain('trustedGateway');
    expect(functionNames).toContain('schemaUID');
    expect(functionNames).toContain('getEAS');
    expect(functionNames).toContain('setTrustedGateway');
    expect(functionNames).toContain('setSchemaUID');
  });

  it('should include the anchoring entrypoints and the indexing event in the gateway ABI', () => {
    const functionNames = CROVE_ANCHOR_GATEWAY_ABI
      .filter((item) => item.type === 'function')
      .map((item) => item.name);

    expect(functionNames).toContain('anchorEnvelope');
    expect(functionNames).toContain('batchAnchorEnvelopes');
    expect(functionNames).toContain('authorizedRelayers');
    expect(functionNames).toContain('anchorKeyToUID');

    const eventNames = CROVE_ANCHOR_GATEWAY_ABI
      .filter((item) => item.type === 'event')
      .map((item) => item.name);

    expect(eventNames).toContain('EnvelopeAnchored');
  });

  it('should keep the gateway payload components in sync with the EAS schema fields', () => {
    // The schema string is what gets registered on EAS; the anchorEnvelope
    // payload tuple is what gets attested against it. If one side changes
    // without the other, on-chain attestations silently stop matching the
    // registered schema, so this drift guard is part of the contract.
    const schemaFields = CROVE_EAS_SCHEMA_V2.split(', ').map((field) => {
      const [type, name] = field.trim().split(' ');

      return { type: type ?? '', name: name ?? '' };
    });

    const anchorEnvelope = CROVE_ANCHOR_GATEWAY_ABI.find(
      (item) => item.type === 'function' && item.name === 'anchorEnvelope',
    );

    expect(anchorEnvelope).toBeDefined();

    if (!anchorEnvelope) {
      return;
    }

    const payloadInput = anchorEnvelope.inputs.find((input) => input.name === 'payload');

    expect(payloadInput).toBeDefined();

    if (!payloadInput) {
      return;
    }

    expect(payloadInput.type).toBe('tuple');

    const components = payloadInput.components ?? [];

    expect(components.map((component) => component.name)).toEqual(
      schemaFields.map((field) => field.name),
    );

    // uint16/uint8 value types line up; bytes32 vs the schema's value types.
    expect(components.map((component) => component.type)).toEqual(
      schemaFields.map((field) => field.type),
    );
  });

  it('should correctly simulate reverse lookup mapping logic', () => {
    // In-memory simulation of CroveAttestationResolver state
    const documentHashToUIDs = new Map<string, string[]>();
    const anchorIdToUIDs = new Map<string, string[]>();

    const docHash = `0x${crypto.createHash('sha256').update('sample pdf buffer').digest('hex')}`;
    const anchorId = `0x${crypto.randomBytes(32).toString('hex')}`;
    const attestationUid = `0x${crypto.randomBytes(32).toString('hex')}`;

    // onAttest simulation
    const existingDocUIDs = documentHashToUIDs.get(docHash) ?? [];
    documentHashToUIDs.set(docHash, [...existingDocUIDs, attestationUid]);

    const existingAnchorUIDs = anchorIdToUIDs.get(anchorId) ?? [];
    anchorIdToUIDs.set(anchorId, [...existingAnchorUIDs, attestationUid]);

    // verifyDocument simulation
    const uids = documentHashToUIDs.get(docHash) ?? [];
    const isAttested = uids.length > 0;
    const latestUID = isAttested ? (uids[uids.length - 1] ?? '0x0') : '0x0';
    const count = uids.length;

    expect(isAttested).toBe(true);
    expect(latestUID).toBe(attestationUid);
    expect(count).toBe(1);
    expect(anchorIdToUIDs.get(anchorId)).toEqual([attestationUid]);
  });
});
