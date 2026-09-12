import { SES_SPF_MECHANISMS } from './constants';
import { evaluateDkimProof } from './dkim-record';
import { createDnsQueryBudget, flattenTxtRecord, readStartOfAuthorityState, readTxtRecords } from './dns';
import { dkimRecordHostName } from './dns-records';
import { isOwnershipChallengeSatisfied, ownershipChallengeHostName } from './ownership-challenge';

export type DomainDnsVerificationResult =
  /**
   * Both mandatory proofs are published and correct.
   */
  | { kind: 'satisfied'; hasSpfRecord: boolean }
  /**
   * An authoritative answer says the configuration is wrong. Safe to count
   * towards a demotion.
   */
  | { kind: 'unsatisfied'; reason: string }
  /**
   * We could not get an authoritative answer. Says nothing about the domain and
   * must never be counted towards a demotion.
   */
  | { kind: 'inconclusive'; reason: string };

export type CheckDomainDnsConfigurationOptions = {
  domain: string;
  selector: string;
  publicKey: string;
  ownershipChallengeValue: string;
};

/**
 * Whether a TXT answer authorises Amazon SES to send for the domain.
 *
 * Mechanisms are compared as whole tokens because `-include:amazonses.com`
 * actively disauthorises SES and must not be mistaken for the pass form.
 */
export const hasAuthorisingSpfRecord = (records: string[][]): boolean => {
  return records.some((chunks) => {
    const tokens = flattenTxtRecord(chunks).split(/\s+/);
    const isSpfRecord = (tokens.at(0) ?? '').toLowerCase() === 'v=spf1';

    return isSpfRecord && tokens.slice(1).some((token) => SES_SPF_MECHANISMS.has(token.toLowerCase()));
  });
};

export const checkDomainDnsConfiguration = async ({
  domain,
  selector,
  publicKey,
  ownershipChallengeValue,
}: CheckDomainDnsConfigurationOptions): Promise<DomainDnsVerificationResult> => {
  const budget = createDnsQueryBudget();

  const [challengeOutcome, dkimOutcome, spfOutcome] = await Promise.all([
    readTxtRecords(ownershipChallengeHostName(domain), budget),
    readTxtRecords(dkimRecordHostName(selector, domain), budget),
    readTxtRecords(domain, budget),
  ]);

  if (challengeOutcome.kind === 'unavailable') {
    return {
      kind: 'inconclusive',
      reason: `DNS could not answer for the ownership challenge record (${challengeOutcome.code})`,
    };
  }

  if (dkimOutcome.kind === 'unavailable') {
    return {
      kind: 'inconclusive',
      reason: `DNS could not answer for the DKIM record (${dkimOutcome.code})`,
    };
  }

  const challengeAnswer = challengeOutcome.kind === 'answered' ? challengeOutcome.value : null;
  const dkimAnswer = dkimOutcome.kind === 'answered' ? dkimOutcome.value : null;

  if (challengeAnswer === null || dkimAnswer === null) {
    // An NXDOMAIN for a required name only counts as proof of absence if the
    // resolver can still answer for the zone itself; otherwise a dead resolver
    // would look exactly like a record the administrator removed.
    const soaState = await readStartOfAuthorityState(domain, budget);

    if (soaState === 'unavailable') {
      return {
        kind: 'inconclusive',
        reason: 'Required records were reported missing but the resolver could not confirm the zone exists',
      };
    }

    return {
      kind: 'unsatisfied',
      reason:
        soaState === 'absent' ? 'The domain does not resolve in DNS at all' : 'A required DNS record does not exist',
    };
  }

  if (!isOwnershipChallengeSatisfied(challengeAnswer, ownershipChallengeValue)) {
    return {
      kind: 'unsatisfied',
      reason: 'The ownership challenge TXT record is missing or does not match exactly',
    };
  }

  const dkimProof = evaluateDkimProof(dkimAnswer, publicKey);

  if (!dkimProof.isProven) {
    return { kind: 'unsatisfied', reason: dkimProof.reason };
  }

  // SPF is advisory: administrators frequently already run an SPF record and have
  // to merge our include into it, and SES enforces sending authorisation itself.
  // Gating activation on it would reject domains that sign correctly.
  const hasSpfRecord = spfOutcome.kind === 'answered' && hasAuthorisingSpfRecord(spfOutcome.value);

  return { kind: 'satisfied', hasSpfRecord };
};
