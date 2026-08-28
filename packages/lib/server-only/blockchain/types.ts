import { z } from 'zod';

/**
 * Ethereum Attestation Service (EAS) & Sign Protocol standard schema for Crove Sign
 * Schema Signature: bytes32 documentHash, string envelopeId, string title, string[] signers, uint64 completedAt, string proofUri
 */
export const CROVE_EAS_SCHEMA =
  'bytes32 documentHash, string envelopeId, string title, string[] signers, uint64 completedAt, string proofUri';

export const CROVE_EAS_SCHEMA_UID =
  '0x7c9b846e4b52479e956554a938c5a2c4e231189ab8c42a265696d5e1654e5659';

export const ZAttestationSignerSchema = z.object({
  name: z.string(),
  email: z.string(),
  role: z.string(),
  signedAt: z.string().nullable().optional(),
  signatureId: z.number().optional(),
});

export type TAttestationSigner = z.infer<typeof ZAttestationSignerSchema>;

export const ZDocumentAttestationDataSchema = z.object({
  documentHash: z.string(), // Hex string (0x...)
  sha256Hash: z.string(), // Standard SHA-256 hex string
  envelopeId: z.string(),
  title: z.string(),
  signers: z.array(z.string()), // email or wallet addresses
  completedAt: z.number(), // Unix timestamp (seconds)
  proofUri: z.string().optional(),
});

export type TDocumentAttestationData = z.infer<typeof ZDocumentAttestationDataSchema>;

export const ZOffchainAttestationSchema = z.object({
  version: z.number().default(2),
  uid: z.string(),
  schema: z.string(),
  recipient: z.string().default('0x0000000000000000000000000000000000000000'),
  time: z.number(),
  expirationTime: z.number().default(0),
  revocable: z.boolean().default(false),
  refUID: z.string().default('0x0000000000000000000000000000000000000000000000000000000000000000'),
  data: ZDocumentAttestationDataSchema,
  signature: z.object({
    r: z.string(),
    s: z.string(),
    v: z.number(),
    signatureString: z.string().optional(),
  }),
  attester: z.string(), // Authority address or Crove Sign public key
  network: z.string().default('dos-chain'),
  txHash: z.string().nullable().optional(),
});

export type TOffchainAttestation = z.infer<typeof ZOffchainAttestationSchema>;

export type TAttestationVerificationResult = {
  isValid: boolean;
  status: 'VALID' | 'TAMPERED' | 'NOT_FOUND' | 'EXPIRED';
  envelopeId?: string;
  documentHash?: string;
  attestationUid?: string;
  attester?: string;
  completedAt?: string;
  signers?: string[];
  message?: string;
};
