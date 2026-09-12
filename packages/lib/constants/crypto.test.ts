import { describe, expect, it, vi } from 'vitest';

import { describeEncryptionKeyProblem, MINIMUM_ENCRYPTION_KEY_LENGTH } from './crypto';

const VALID_KEY = 'a'.repeat(MINIMUM_ENCRYPTION_KEY_LENGTH);
const VALID_SECONDARY_KEY = 'b'.repeat(MINIMUM_ENCRYPTION_KEY_LENGTH);

describe('describeEncryptionKeyProblem', () => {
  it('accepts two distinct keys that meet the minimum length', () => {
    expect(describeEncryptionKeyProblem(VALID_KEY, VALID_SECONDARY_KEY)).toBeNull();
  });

  it('accepts keys longer than the minimum', () => {
    expect(describeEncryptionKeyProblem(`${VALID_KEY}extra`, `${VALID_SECONDARY_KEY}extra`)).toBeNull();
  });

  it('rejects a missing primary key', () => {
    expect(describeEncryptionKeyProblem(undefined, VALID_SECONDARY_KEY)).toContain('both required');
  });

  it('rejects an empty secondary key', () => {
    expect(describeEncryptionKeyProblem(VALID_KEY, '')).toContain('both required');
  });

  it('rejects the published placeholder values in either slot', () => {
    expect(describeEncryptionKeyProblem('CAFEBABE', 'DEADBEEF')).toContain('placeholder');
    expect(describeEncryptionKeyProblem(VALID_KEY, 'DEADBEEF')).toContain('placeholder');
    expect(describeEncryptionKeyProblem('CAFEBABE', VALID_SECONDARY_KEY)).toContain('placeholder');
  });

  it('rejects a key one character below the minimum', () => {
    const tooShort = 'a'.repeat(MINIMUM_ENCRYPTION_KEY_LENGTH - 1);

    expect(describeEncryptionKeyProblem(tooShort, VALID_SECONDARY_KEY)).toContain(
      `at least ${MINIMUM_ENCRYPTION_KEY_LENGTH} characters`,
    );
  });

  it('rejects identical keys so that rotation can tell old ciphertext from new', () => {
    expect(describeEncryptionKeyProblem(VALID_KEY, VALID_KEY)).toContain('must differ');
  });

  it('reports the placeholder problem before the length problem, since it is the more specific one', () => {
    // CAFEBABE is also shorter than the minimum; naming it as a placeholder is
    // what tells the operator they copied a shipped default rather than typed a
    // short secret.
    expect(describeEncryptionKeyProblem('CAFEBABE', VALID_SECONDARY_KEY)).not.toContain('at least');
  });
});

describe('assertEncryptionKeysConfigured', () => {
  it('refuses to start when the process environment still holds the shipped defaults', async () => {
    vi.stubEnv('NEXT_PRIVATE_ENCRYPTION_KEY', 'CAFEBABE');
    vi.stubEnv('NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY', 'DEADBEEF');
    vi.resetModules();

    try {
      const reloaded = await import('./crypto');

      expect(() => reloaded.assertEncryptionKeysConfigured()).toThrow(/Refusing to start/);
      expect(() => reloaded.assertEncryptionKeysConfigured()).toThrow(/placeholder/);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it('starts when the process environment holds usable keys', async () => {
    vi.stubEnv('NEXT_PRIVATE_ENCRYPTION_KEY', VALID_KEY);
    vi.stubEnv('NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY', VALID_SECONDARY_KEY);
    vi.resetModules();

    try {
      const reloaded = await import('./crypto');

      expect(() => reloaded.assertEncryptionKeysConfigured()).not.toThrow();
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
