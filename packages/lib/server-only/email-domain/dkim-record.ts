import { isConstantTimeEqual } from './constant-time';
import { flattenTxtRecord } from './dns';

const DKIM_VERSION = 'DKIM1';
const DKIM_TAG_NAME_PATTERN = /^[a-z0-9]+$/;
const SUPPORTED_DKIM_KEY_TYPE = 'rsa';
const DKIM_TESTING_FLAG = 'y';
const WHITESPACE_PATTERN = /\s+/g;

export type ParsedDkimRecord = {
  version: string | null;
  keyType: string;
  flags: string | null;
  /**
   * Base64 of the public key with all folding whitespace removed.
   */
  publicKey: string;
  /**
   * Set when the record parses as DKIM but cannot prove anything — a bad version,
   * an unsupported key algorithm, a duplicate tag, or testing mode.
   */
  disqualifyingReason: string | null;
};

/**
 * Base64 is case-sensitive and carries no internal whitespace of its own, so
 * stripping folding whitespace is the only normalisation that is safe before an
 * exact comparison.
 */
export const normaliseDkimPublicKey = (value: string): string => {
  return value.replace(WHITESPACE_PATTERN, '');
};

const unquoteTagValue = (value: string): string => {
  const trimmed = value.trim();

  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
};

const describeDkimDisqualification = (
  version: string | null,
  keyType: string | null,
  flags: string | null,
): string | null => {
  if (version !== null && version.toUpperCase() !== DKIM_VERSION) {
    return `Unsupported DKIM version "${version}"`;
  }

  if (keyType !== null && keyType.toLowerCase() !== SUPPORTED_DKIM_KEY_TYPE) {
    return `Unsupported DKIM key type "${keyType}"`;
  }

  // t=y marks the domain as testing DKIM; RFC 6376 §3.6.1 tells verifiers not to
  // treat such a domain as fully valid, so it cannot be accepted as proof.
  const hasTestingFlag = (flags ?? '').split(':').some((flag) => flag.trim().toLowerCase() === DKIM_TESTING_FLAG);

  if (hasTestingFlag) {
    return 'DKIM record is published in testing mode (t=y)';
  }

  return null;
};

/**
 * Parse one TXT answer as an RFC 6376 §3.6.1 DKIM key record.
 *
 * Returns null when the answer is not a DKIM record at all (no `p=` tag, or a
 * syntactically broken tag list), so that unrelated TXT records published at the
 * same name are simply skipped rather than treated as a failed proof.
 */
export const parseDkimTxtRecord = (chunks: string[]): ParsedDkimRecord | null => {
  const segments = flattenTxtRecord(chunks).split(';');
  const tags = new Map<string, string>();
  let firstTagName: string | null = null;

  for (const segment of segments) {
    const trimmedSegment = segment.trim();

    // A trailing semicolon is legal and produces one empty segment.
    if (trimmedSegment.length === 0) {
      continue;
    }

    const separatorIndex = trimmedSegment.indexOf('=');

    if (separatorIndex <= 0) {
      return null;
    }

    const tagName = trimmedSegment.slice(0, separatorIndex).trim().toLowerCase();

    if (!DKIM_TAG_NAME_PATTERN.test(tagName)) {
      return null;
    }

    // RFC 6376 §3.2 forbids a tag appearing more than once.
    if (tags.has(tagName)) {
      return null;
    }

    if (firstTagName === null) {
      firstTagName = tagName;
    }

    tags.set(tagName, unquoteTagValue(trimmedSegment.slice(separatorIndex + 1)));
  }

  const publicKey = tags.get('p');

  if (publicKey === undefined) {
    return null;
  }

  const version = tags.get('v') ?? null;

  if (version !== null && firstTagName !== 'v') {
    return null;
  }

  const disqualifyingReason = describeDkimDisqualification(version, tags.get('k') ?? null, tags.get('t') ?? null);

  return {
    version,
    keyType: (tags.get('k') ?? SUPPORTED_DKIM_KEY_TYPE).toLowerCase(),
    flags: tags.get('t') ?? null,
    publicKey: normaliseDkimPublicKey(publicKey),
    disqualifyingReason,
  };
};

export type DkimProofResult = { isProven: true } | { isProven: false; reason: string };

/**
 * Decide whether DNS proves that the domain publishes *our* DKIM key.
 *
 * A record that merely looks like DKIM proves nothing — anyone able to reach a
 * zone's DNS can publish `v=DKIM1; k=rsa; p=<their own key>`. The whole base64
 * key is compared, in constant time, against the key we generated; no prefix,
 * substring or "contains" test is involved at any point.
 */
export const evaluateDkimProof = (records: string[][], expectedPublicKey: string): DkimProofResult => {
  const expectedKey = normaliseDkimPublicKey(expectedPublicKey);
  const disqualifyingReasons: string[] = [];
  let didSeeDkimShapedRecord = false;

  for (const chunks of records) {
    const parsed = parseDkimTxtRecord(chunks);

    if (parsed === null) {
      continue;
    }

    didSeeDkimShapedRecord = true;

    if (parsed.disqualifyingReason !== null) {
      disqualifyingReasons.push(parsed.disqualifyingReason);
      continue;
    }

    if (isConstantTimeEqual(parsed.publicKey, expectedKey)) {
      return { isProven: true };
    }

    disqualifyingReasons.push('A DKIM record is published but its key is not ours');
  }

  if (!didSeeDkimShapedRecord) {
    return { isProven: false, reason: 'No DKIM record is published for this selector' };
  }

  return { isProven: false, reason: disqualifyingReasons.at(0) ?? 'The published DKIM record does not match' };
};
