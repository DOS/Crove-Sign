/**
 * Crove Sign EAS Contract ABIs & Standard Artifacts
 * Network: DOS Chain (and EVM L2s)
 */

export const CROVE_EAS_SCHEMA_V2 =
  'bytes32 envelopeHash, bytes32 artifactRoot, bytes32 auditBundleRoot, bytes32 identityEvidenceRoot, bytes32 riskEvidenceRoot, bytes32 policyHash, uint16 evidenceVersion, uint8 eventType';

export const CROVE_RESOLVER_ABI = [
  {
    type: 'constructor',
    inputs: [
      { name: 'eas', type: 'address' },
      { name: 'initialOwner', type: 'address' },
      { name: 'initialGateway', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'trustedGateway',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'schemaUID',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getEAS',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAttestationsByArtifactRoot',
    inputs: [{ name: 'artifactRoot', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes32[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAttestationsByEnvelopeHash',
    inputs: [{ name: 'envelopeHash', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes32[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getLatestAttestationByArtifactRoot',
    inputs: [{ name: 'artifactRoot', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'verifyArtifact',
    inputs: [{ name: 'artifactRoot', type: 'bytes32' }],
    outputs: [
      { name: 'isAttested', type: 'bool' },
      { name: 'latestUID', type: 'bytes32' },
      { name: 'totalAttestations', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'setTrustedGateway',
    inputs: [{ name: 'newGateway', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setSchemaUID',
    inputs: [{ name: '_schemaUID', type: 'bytes32' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

export const CROVE_ANCHOR_GATEWAY_ABI = [
  {
    type: 'constructor',
    inputs: [
      { name: '_eas', type: 'address' },
      { name: 'initialOwner', type: 'address' },
      { name: 'initialRelayer', type: 'address' },
      { name: '_schemaUID', type: 'bytes32' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'eas',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'schemaUID',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'authorizedRelayers',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'anchorKeyToUID',
    inputs: [{ name: '', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'anchorEnvelope',
    inputs: [
      { name: 'anchorKey', type: 'bytes32' },
      { name: 'refUID', type: 'bytes32' },
      {
        name: 'payload',
        type: 'tuple',
        components: [
          { name: 'envelopeHash', type: 'bytes32' },
          { name: 'artifactRoot', type: 'bytes32' },
          { name: 'auditBundleRoot', type: 'bytes32' },
          { name: 'identityEvidenceRoot', type: 'bytes32' },
          { name: 'riskEvidenceRoot', type: 'bytes32' },
          { name: 'policyHash', type: 'bytes32' },
          { name: 'evidenceVersion', type: 'uint16' },
          { name: 'eventType', type: 'uint8' },
        ],
      },
    ],
    outputs: [{ name: 'uid', type: 'bytes32' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'batchAnchorEnvelopes',
    inputs: [
      { name: 'anchorKeys', type: 'bytes32[]' },
      { name: 'refUIDs', type: 'bytes32[]' },
      {
        name: 'payloads',
        type: 'tuple[]',
        components: [
          { name: 'envelopeHash', type: 'bytes32' },
          { name: 'artifactRoot', type: 'bytes32' },
          { name: 'auditBundleRoot', type: 'bytes32' },
          { name: 'identityEvidenceRoot', type: 'bytes32' },
          { name: 'riskEvidenceRoot', type: 'bytes32' },
          { name: 'policyHash', type: 'bytes32' },
          { name: 'evidenceVersion', type: 'uint16' },
          { name: 'eventType', type: 'uint8' },
        ],
      },
    ],
    outputs: [{ name: 'uids', type: 'bytes32[]' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'EnvelopeAnchored',
    inputs: [
      { name: 'anchorKey', type: 'bytes32', indexed: true },
      { name: 'envelopeHash', type: 'bytes32', indexed: true },
      { name: 'artifactRoot', type: 'bytes32', indexed: true },
      { name: 'uid', type: 'bytes32', indexed: false },
      { name: 'refUID', type: 'bytes32', indexed: false },
      { name: 'eventType', type: 'uint8', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
] as const;
