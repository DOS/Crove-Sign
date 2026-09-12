import { describe, expect, it } from 'vitest';

import { isConstantTimeEqual } from './constant-time';
import {
  buildOwnershipChallengeRecord,
  buildOwnershipChallengeRecordValue,
  deriveOwnershipChallengeToken,
  isOwnershipChallengeSatisfied,
  ownershipChallengeHostName,
} from './ownership-challenge';

const ENCRYPTION_KEY = 'cleanroom-test-encryption-key';
const SUBJECT = {
  emailDomainId: 'email_domain_challenge',
  selector: 'crove-challengetst._domainkey',
  domain: 'example.com',
};

describe('isConstantTimeEqual', () => {
  it('is an exact equality test', () => {
    expect(isConstantTimeEqual('same', 'same')).toBe(true);
    expect(isConstantTimeEqual('same', 'Same')).toBe(false);
    expect(isConstantTimeEqual('same', 'sam')).toBe(false);
    expect(isConstantTimeEqual('same', 'samee')).toBe(false);
    expect(isConstantTimeEqual('', '')).toBe(true);
    expect(isConstantTimeEqual('', 'x')).toBe(false);
  });

  it('handles inputs of very different lengths without throwing', () => {
    expect(isConstantTimeEqual('a'.repeat(4096), 'a')).toBe(false);
    expect(isConstantTimeEqual('a'.repeat(4096), 'a'.repeat(4096))).toBe(true);
  });
});

describe('deriveOwnershipChallengeToken', () => {
  it('carries at least 128 bits of entropy', () => {
    const token = deriveOwnershipChallengeToken(SUBJECT, ENCRYPTION_KEY);

    // base64url of a 32-byte HMAC-SHA256 digest.
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('is deterministic for the same subject and key', () => {
    expect(deriveOwnershipChallengeToken(SUBJECT, ENCRYPTION_KEY)).toBe(
      deriveOwnershipChallengeToken(SUBJECT, ENCRYPTION_KEY),
    );
  });

  it('rotates with the selector so a reregistration invalidates the old challenge', () => {
    const rotated = deriveOwnershipChallengeToken(
      { ...SUBJECT, selector: 'crove-rotated00001._domainkey' },
      ENCRYPTION_KEY,
    );

    expect(rotated).not.toBe(deriveOwnershipChallengeToken(SUBJECT, ENCRYPTION_KEY));
  });

  it('cannot be produced from another installation key', () => {
    expect(deriveOwnershipChallengeToken(SUBJECT, 'a-different-encryption-key')).not.toBe(
      deriveOwnershipChallengeToken(SUBJECT, ENCRYPTION_KEY),
    );
  });

  it('differs per row even when the selector and domain collide', () => {
    expect(deriveOwnershipChallengeToken({ ...SUBJECT, emailDomainId: 'email_domain_other' }, ENCRYPTION_KEY)).not.toBe(
      deriveOwnershipChallengeToken(SUBJECT, ENCRYPTION_KEY),
    );
  });
});

describe('the ownership challenge record', () => {
  it('is published at a deterministic host and carries the token', () => {
    const token = deriveOwnershipChallengeToken(SUBJECT, ENCRYPTION_KEY);
    const record = buildOwnershipChallengeRecord(token);

    expect(ownershipChallengeHostName('example.com')).toBe('_crove-verify.example.com');
    expect(record.name).toBe('_crove-verify');
    expect(record.type).toBe('TXT');
    expect(record.value).toBe(`crove-domain-verification=${token}`);
    expect(record.value).toBe(buildOwnershipChallengeRecordValue(token));
  });
});

describe('isOwnershipChallengeSatisfied', () => {
  const token = deriveOwnershipChallengeToken(SUBJECT, ENCRYPTION_KEY);
  const expected = buildOwnershipChallengeRecordValue(token);

  it('accepts an exactly matching record', () => {
    expect(isOwnershipChallengeSatisfied([[expected]], expected)).toBe(true);
  });

  it('accepts a value split across character-strings or padded with whitespace', () => {
    expect(isOwnershipChallengeSatisfied([[expected.slice(0, 20), expected.slice(20)]], expected)).toBe(true);
    expect(isOwnershipChallengeSatisfied([[`  ${expected}  `]], expected)).toBe(true);
  });

  it('accepts the match wherever it sits in the answer set', () => {
    expect(isOwnershipChallengeSatisfied([['unrelated'], [expected]], expected)).toBe(true);
  });

  it('rejects a tampered, truncated or extended value', () => {
    const mutatedLastCharacter = `${expected.slice(0, -1)}${expected.endsWith('A') ? 'B' : 'A'}`;

    expect(isOwnershipChallengeSatisfied([[`${expected}x`]], expected)).toBe(false);
    expect(isOwnershipChallengeSatisfied([[expected.slice(0, -1)]], expected)).toBe(false);
    expect(isOwnershipChallengeSatisfied([[mutatedLastCharacter]], expected)).toBe(false);
  });

  it('rejects the bare token without its prefix', () => {
    expect(isOwnershipChallengeSatisfied([[token]], expected)).toBe(false);
  });

  it('rejects an empty answer set', () => {
    expect(isOwnershipChallengeSatisfied([], expected)).toBe(false);
  });
});
