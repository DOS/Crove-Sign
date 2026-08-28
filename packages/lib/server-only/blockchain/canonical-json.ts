import crypto from 'node:crypto';

/**
 * RFC 8785 JSON Canonicalization Scheme (JCS) Implementation.
 * Recursively normalizes object key sorting and deterministic formatting.
 */
export function canonicalizeJson(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return 'null';
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return JSON.stringify(obj);
  }

  if (typeof obj === 'string') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    const items = obj.map((item) => canonicalizeJson(item));
    return `[${items.join(',')}]`;
  }

  if (typeof obj === 'object') {
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    const pairs = keys
      .filter((k) => (obj as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalizeJson((obj as Record<string, unknown>)[k])}`);
    return `{${pairs.join(',')}}`;
  }

  return JSON.stringify(obj);
}

/**
 * Compute standard SHA-256 hash in bytes32 format (0x...) from canonical JSON.
 */
export function hashCanonicalJson(obj: unknown): string {
  const canonicalStr = canonicalizeJson(obj);
  const hashHex = crypto.createHash('sha256').update(canonicalStr, 'utf8').digest('hex');
  return `0x${hashHex}`;
}

/**
 * Compute standard SHA-256 hash in bytes32 format (0x...) from a binary Buffer / Uint8Array.
 */
export function hashBytes32(buffer: Buffer | Uint8Array): string {
  const hashHex = crypto.createHash('sha256').update(buffer).digest('hex');
  return `0x${hashHex}`;
}

/**
 * Compute Merkle root from an ordered array of 32-byte leaf hashes.
 */
export function computeMerkleRoot(leafHashes: string[]): string {
  if (leafHashes.length === 0) {
    return '0x0000000000000000000000000000000000000000000000000000000000000000';
  }

  if (leafHashes.length === 1) {
    return leafHashes[0];
  }

  let currentLevel = leafHashes.map((h) => (h.startsWith('0x') ? h.slice(2) : h));

  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];

    for (let i = 0; i < currentLevel.length; i += 2) {
      if (i + 1 < currentLevel.length) {
        const combined = Buffer.concat([
          Buffer.from(currentLevel[i], 'hex'),
          Buffer.from(currentLevel[i + 1], 'hex'),
        ]);
        nextLevel.push(crypto.createHash('sha256').update(combined).digest('hex'));
      } else {
        // Odd node duplicated or carried up
        const combined = Buffer.concat([
          Buffer.from(currentLevel[i], 'hex'),
          Buffer.from(currentLevel[i], 'hex'),
        ]);
        nextLevel.push(crypto.createHash('sha256').update(combined).digest('hex'));
      }
    }

    currentLevel = nextLevel;
  }

  return `0x${currentLevel[0]}`;
}
