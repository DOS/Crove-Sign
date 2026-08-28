import { describe, expect, it } from 'vitest';

import {
  canonicalizeJson,
  computeMerkleRoot,
  hashBytes32,
  hashCanonicalJson,
} from './canonical-json';

describe('canonical-json (RFC 8785)', () => {
  it('should sort object keys deterministically', () => {
    const objA = { z: 1, a: 2, m: { b: 1, a: 2 } };
    const objB = { a: 2, m: { a: 2, b: 1 }, z: 1 };

    const canonicalA = canonicalizeJson(objA);
    const canonicalB = canonicalizeJson(objB);

    expect(canonicalA).toBe('{"a":2,"m":{"a":2,"b":1},"z":1}');
    expect(canonicalA).toBe(canonicalB);
    expect(hashCanonicalJson(objA)).toBe(hashCanonicalJson(objB));
  });

  it('should compute valid 32-byte sha256 hex string', () => {
    const buffer = Buffer.from('%PDF-1.4 test document content');
    const hash = hashBytes32(buffer);

    expect(hash.startsWith('0x')).toBe(true);
    expect(hash.length).toBe(66);
  });

  it('should compute deterministic Merkle root for single and multiple leaves', () => {
    const leaf1 = '0x1111111111111111111111111111111111111111111111111111111111111111';
    const leaf2 = '0x2222222222222222222222222222222222222222222222222222222222222222';

    const rootSingle = computeMerkleRoot([leaf1]);
    expect(rootSingle).toBe(leaf1);

    const rootMulti = computeMerkleRoot([leaf1, leaf2]);
    expect(rootMulti.startsWith('0x')).toBe(true);
    expect(rootMulti.length).toBe(66);
  });
});
