/**
 * CroveAttestationResolver ABI & Schema definitions
 * Contract: CroveAttestationResolver.sol
 */

export const CROVE_ATTESTATION_RESOLVER_ABI = [
  {
    type: 'constructor',
    inputs: [
      { name: 'eas', type: 'address' },
      { name: 'initialOwner', type: 'address' },
      { name: 'initialAttester', type: 'address' },
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
    name: 'schemaUID',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'authorizedAttesters',
    inputs: [{ name: 'attester', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
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
    name: 'isPayable',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'getAttestationUIDsByDocumentHash',
    inputs: [{ name: 'documentHash', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes32[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAttestationUIDsByAnchorId',
    inputs: [{ name: 'anchorId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes32[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getLatestAttestationUID',
    inputs: [{ name: 'documentHash', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isDocumentAttested',
    inputs: [{ name: 'documentHash', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'verifyDocument',
    inputs: [{ name: 'documentHash', type: 'bytes32' }],
    outputs: [
      { name: 'isAttested', type: 'bool' },
      { name: 'latestUID', type: 'bytes32' },
      { name: 'count', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'setAuthorizedAttester',
    inputs: [
      { name: 'attester', type: 'address' },
      { name: 'authorized', type: 'bool' },
    ],
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
  {
    type: 'function',
    name: 'transferOwnership',
    inputs: [{ name: 'newOwner', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'DocumentAttested',
    inputs: [
      { name: 'documentHash', type: 'bytes32', indexed: true },
      { name: 'anchorId', type: 'bytes32', indexed: true },
      { name: 'uid', type: 'bytes32', indexed: true },
      { name: 'attester', type: 'address', indexed: false },
      { name: 'itemIndex', type: 'uint16', indexed: false },
      { name: 'itemCount', type: 'uint16', indexed: false },
      { name: 'formatVersion', type: 'uint16', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'DocumentRevoked',
    inputs: [
      { name: 'uid', type: 'bytes32', indexed: true },
      { name: 'attester', type: 'address', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'AttesterAuthorized',
    inputs: [
      { name: 'attester', type: 'address', indexed: true },
      { name: 'authorized', type: 'bool', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'SchemaUIDSet',
    inputs: [{ name: 'schemaUID', type: 'bytes32', indexed: true }],
  },
  {
    type: 'event',
    name: 'OwnershipTransferred',
    inputs: [
      { name: 'previousOwner', type: 'address', indexed: true },
      { name: 'newOwner', type: 'address', indexed: true },
    ],
  },
] as const;

/**
 * Crove Sign EAS Schema Definition v2
 */
export const CROVE_SIGN_SCHEMA_V2 =
  'bytes32 anchorId, bytes32 documentHash, bytes32 auditRoot, uint16 itemIndex, uint16 itemCount, uint16 formatVersion';
