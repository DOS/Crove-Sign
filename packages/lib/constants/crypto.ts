import { env } from '../utils/env';

export const DOCUMENSO_ENCRYPTION_KEY = env('NEXT_PRIVATE_ENCRYPTION_KEY');

export const DOCUMENSO_ENCRYPTION_SECONDARY_KEY = env('NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY');

/**
 * Both values are used as symmetric AEAD keys (see `universal/crypto.ts`).
 * A short key is not merely weak: anyone who can read a single ciphertext can
 * brute-force the key offline and then decrypt everything else protected by it,
 * which in this app includes DKIM private keys and SSO client secrets.
 */
export const MINIMUM_ENCRYPTION_KEY_LENGTH = 32;

/**
 * Placeholder values that `.env.example` used to ship and that
 * `docker/Dockerfile` still bakes in as build-time ENV defaults. They are public
 * knowledge, so an instance running on them has no encryption at all.
 */
const PLACEHOLDER_ENCRYPTION_KEYS = ['CAFEBABE', 'DEADBEEF'];

const GENERATE_HINT = 'Generate one with: openssl rand -base64 32';

/**
 * Explain why the configured encryption keys are unusable, or return null when
 * they are acceptable. Pure and parameterised so it can be tested without
 * touching process.env or re-importing the module.
 */
export const describeEncryptionKeyProblem = (
  key: string | undefined,
  secondaryKey: string | undefined,
): string | null => {
  if (!key || !secondaryKey) {
    return `NEXT_PRIVATE_ENCRYPTION_KEY and NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY are both required. ${GENERATE_HINT}`;
  }

  if (PLACEHOLDER_ENCRYPTION_KEYS.includes(key) || PLACEHOLDER_ENCRYPTION_KEYS.includes(secondaryKey)) {
    return `An encryption key is still set to a published placeholder (${PLACEHOLDER_ENCRYPTION_KEYS.join(' / ')}), which is not a secret. ${GENERATE_HINT}`;
  }

  if (key.length < MINIMUM_ENCRYPTION_KEY_LENGTH || secondaryKey.length < MINIMUM_ENCRYPTION_KEY_LENGTH) {
    return `Both encryption keys must be at least ${MINIMUM_ENCRYPTION_KEY_LENGTH} characters. ${GENERATE_HINT}`;
  }

  if (key === secondaryKey) {
    return 'NEXT_PRIVATE_ENCRYPTION_KEY and NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY must differ, otherwise rotation cannot tell old ciphertext from new.';
  }

  return null;
};

/**
 * Refuse to serve traffic with unusable encryption keys.
 *
 * Called from the server entry point rather than at module load on purpose: the
 * Docker image carries the placeholder values as ENV defaults, so throwing while
 * modules are being imported would fail the image build itself, and every test
 * or one-off script that imports this module would need a full server
 * environment to do so.
 */
export const assertEncryptionKeysConfigured = (): void => {
  const problem = describeEncryptionKeyProblem(DOCUMENSO_ENCRYPTION_KEY, DOCUMENSO_ENCRYPTION_SECONDARY_KEY);

  if (problem) {
    throw new Error(`Refusing to start: ${problem}`);
  }
};
