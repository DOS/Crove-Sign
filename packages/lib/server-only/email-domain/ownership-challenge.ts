import { createHmac } from 'node:crypto';

import { isConstantTimeEqual } from './constant-time';
import {
  OWNERSHIP_CHALLENGE_HMAC_CONTEXT,
  OWNERSHIP_CHALLENGE_LABEL,
  OWNERSHIP_CHALLENGE_VALUE_PREFIX,
} from './constants';
import { flattenTxtRecord } from './dns';
import type { EmailDomainDnsRecord } from './types';

export type OwnershipChallengeSubject = {
  emailDomainId: string;
  selector: string;
  domain: string;
};

/**
 * Derive the ownership-challenge token for a row.
 *
 * The token is an HMAC over the row's identity under the installation's
 * encryption key rather than a stored random value: it carries 256 bits of
 * entropy, needs no schema column, survives restarts, and can be recomputed on
 * every verification. Because the key never leaves the server, an attacker who
 * can read the row — or the DNS zone — still cannot produce the token.
 *
 * Including the selector means reregistration rotates the challenge along with
 * the DKIM key, so a token captured from an abandoned setup cannot be replayed
 * against a fresh one.
 */
export const deriveOwnershipChallengeToken = (subject: OwnershipChallengeSubject, encryptionKey: string): string => {
  const { emailDomainId, selector, domain } = subject;

  return createHmac('sha256', encryptionKey)
    .update(`${OWNERSHIP_CHALLENGE_HMAC_CONTEXT}:${emailDomainId}:${selector}:${domain}`)
    .digest('base64url');
};

export const buildOwnershipChallengeRecordValue = (token: string): string => {
  return `${OWNERSHIP_CHALLENGE_VALUE_PREFIX}${token}`;
};

export const buildOwnershipChallengeRecord = (token: string): EmailDomainDnsRecord => {
  return {
    name: OWNERSHIP_CHALLENGE_LABEL,
    value: buildOwnershipChallengeRecordValue(token),
    type: 'TXT',
  };
};

export const ownershipChallengeHostName = (domain: string): string => {
  return `${OWNERSHIP_CHALLENGE_LABEL}.${domain}`;
};

/**
 * Exact-match check over every TXT record published at the challenge host.
 *
 * Each candidate is compared in full and in constant time; the loop deliberately
 * does not short-circuit so that the number of comparisons does not depend on
 * where in the answer set the match sits.
 */
export const isOwnershipChallengeSatisfied = (records: string[][], expectedValue: string): boolean => {
  let isSatisfied = false;

  for (const chunks of records) {
    if (isConstantTimeEqual(flattenTxtRecord(chunks).trim(), expectedValue)) {
      isSatisfied = true;
    }
  }

  return isSatisfied;
};
