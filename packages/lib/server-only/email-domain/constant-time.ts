import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Compare two strings without leaking how much of them matched.
 *
 * `timingSafeEqual` refuses buffers of differing length, and the length itself is
 * already a hint, so both sides are folded through SHA-256 first. That keeps the
 * comparison constant-time for inputs of any length while still being an exact
 * equality test — a digest collision is not reachable by an attacker who cannot
 * read the expected value.
 */
export const isConstantTimeEqual = (left: string, right: string): boolean => {
  const leftDigest = createHash('sha256').update(left, 'utf8').digest();
  const rightDigest = createHash('sha256').update(right, 'utf8').digest();

  return timingSafeEqual(leftDigest, rightDigest);
};
