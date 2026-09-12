import { describe, expect, it } from 'vitest';

import { evaluateDkimProof, normaliseDkimPublicKey, parseDkimTxtRecord } from './dkim-record';

const PUBLIC_KEY = `MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA${'A'.repeat(200)}`;
const OTHER_PUBLIC_KEY = `MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA${'B'.repeat(200)}`;

const dkimRecord = (publicKey: string, extraTags = '') => [`v=DKIM1; ${extraTags}k=rsa; p=${publicKey}`];

describe('parseDkimTxtRecord', () => {
  it('reads the standard tag set', () => {
    const parsed = parseDkimTxtRecord(dkimRecord(PUBLIC_KEY));

    expect(parsed).not.toBeNull();
    expect(parsed?.version).toBe('DKIM1');
    expect(parsed?.keyType).toBe('rsa');
    expect(parsed?.publicKey).toBe(PUBLIC_KEY);
    expect(parsed?.disqualifyingReason).toBeNull();
  });

  it('concatenates the character-strings of one record before parsing', () => {
    const parsed = parseDkimTxtRecord([`v=DKIM1; k=rsa; p=${PUBLIC_KEY.slice(0, 100)}`, PUBLIC_KEY.slice(100)]);

    expect(parsed?.publicKey).toBe(PUBLIC_KEY);
  });

  it('tolerates folding whitespace and line breaks inside the key', () => {
    const folded = PUBLIC_KEY.replace(/(.{60})/g, '$1 ');
    const parsed = parseDkimTxtRecord([`v=DKIM1; k=rsa; p=${folded}`]);

    expect(parsed?.publicKey).toBe(PUBLIC_KEY);
  });

  it('tolerates quoted tag values', () => {
    const parsed = parseDkimTxtRecord([`v="DKIM1"; k="rsa"; p="${PUBLIC_KEY}"`]);

    expect(parsed?.publicKey).toBe(PUBLIC_KEY);
    expect(parsed?.disqualifyingReason).toBeNull();
  });

  it('defaults the key type to rsa when the tag is omitted', () => {
    const parsed = parseDkimTxtRecord([`v=DKIM1; p=${PUBLIC_KEY}`]);

    expect(parsed?.keyType).toBe('rsa');
  });

  it('returns null for an answer that is not a DKIM record', () => {
    expect(parseDkimTxtRecord(['v=spf1 include:amazonses.com -all'])).toBeNull();
    expect(parseDkimTxtRecord(['crove-domain-verification=abc'])).toBeNull();
  });

  it('returns null for a malformed tag list', () => {
    expect(parseDkimTxtRecord(['v=DKIM1; nonsense; p=abc'])).toBeNull();
    expect(parseDkimTxtRecord(['v=DKIM1; =rsa; p=abc'])).toBeNull();
  });

  it('returns null when a tag is repeated', () => {
    expect(parseDkimTxtRecord([`v=DKIM1; k=rsa; k=rsa; p=${PUBLIC_KEY}`])).toBeNull();
  });

  it('returns null when the version tag is not first', () => {
    expect(parseDkimTxtRecord([`k=rsa; v=DKIM1; p=${PUBLIC_KEY}`])).toBeNull();
  });

  it('disqualifies an unknown version', () => {
    const parsed = parseDkimTxtRecord([`v=DKIM2; k=rsa; p=${PUBLIC_KEY}`]);

    expect(parsed?.disqualifyingReason).not.toBeNull();
  });

  it('disqualifies a non-RSA key type', () => {
    const parsed = parseDkimTxtRecord([`v=DKIM1; k=ed25519; p=${PUBLIC_KEY}`]);

    expect(parsed?.disqualifyingReason).toContain('ed25519');
  });

  it('disqualifies a record published in testing mode', () => {
    expect(parseDkimTxtRecord([`v=DKIM1; t=y; p=${PUBLIC_KEY}`])?.disqualifyingReason).toContain('testing mode');
    expect(parseDkimTxtRecord([`v=DKIM1; t=s; p=${PUBLIC_KEY}`])?.disqualifyingReason).toBeNull();
  });
});

describe('normaliseDkimPublicKey', () => {
  it('strips folding whitespace and nothing else', () => {
    expect(normaliseDkimPublicKey(' abc\tde\nf ')).toBe('abcdef');
    expect(normaliseDkimPublicKey('aBc')).toBe('aBc');
  });
});

describe('evaluateDkimProof', () => {
  it('proves ownership when the whole key matches', () => {
    expect(evaluateDkimProof([dkimRecord(PUBLIC_KEY)], PUBLIC_KEY).isProven).toBe(true);
  });

  it('proves ownership when the key is published with folding whitespace', () => {
    const folded = PUBLIC_KEY.replace(/(.{60})/g, '$1\n');

    expect(evaluateDkimProof([dkimRecord(folded)], PUBLIC_KEY).isProven).toBe(true);
  });

  it('refuses a record carrying somebody else key', () => {
    expect(evaluateDkimProof([dkimRecord(OTHER_PUBLIC_KEY)], PUBLIC_KEY).isProven).toBe(false);
  });

  it('refuses a record whose key extends ours', () => {
    expect(evaluateDkimProof([dkimRecord(`${PUBLIC_KEY}SUFFIX`)], PUBLIC_KEY).isProven).toBe(false);
  });

  it('refuses a record whose key is a prefix of ours', () => {
    expect(evaluateDkimProof([dkimRecord(PUBLIC_KEY.slice(0, 80))], PUBLIC_KEY).isProven).toBe(false);
  });

  it('refuses a DKIM-shaped record with an empty key', () => {
    const result = evaluateDkimProof([['v=DKIM1; k=rsa; p=']], PUBLIC_KEY);

    expect(result.isProven).toBe(false);

    if (result.isProven === false) {
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it('refuses when only unrelated records are published at the selector', () => {
    const result = evaluateDkimProof([['v=spf1 include:amazonses.com -all'], ['hello']], PUBLIC_KEY);

    expect(result.isProven).toBe(false);
  });

  it('ignores unrelated records published alongside the real one', () => {
    const records = [['v=spf1 include:amazonses.com -all'], dkimRecord(PUBLIC_KEY)];

    expect(evaluateDkimProof(records, PUBLIC_KEY).isProven).toBe(true);
  });

  it('refuses when the matching record is disqualified', () => {
    expect(evaluateDkimProof([dkimRecord(PUBLIC_KEY, 't=y; ')], PUBLIC_KEY).isProven).toBe(false);
  });
});
