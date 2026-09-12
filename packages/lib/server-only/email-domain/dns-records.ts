import { AWS_SES_SPF_RECORD, generateDkimRecord } from '../../utils/email-domains';
import { buildOwnershipChallengeRecord } from './ownership-challenge';
import type { EmailDomainDnsRecord } from './types';

export type BuildEmailDomainDnsRecordsOptions = {
  selector: string;
  publicKeyFlattened: string;
  ownershipChallengeToken: string;
};

/**
 * The records an administrator has to publish, in the same order and shape the
 * domain detail page renders from `generateEmailDomainRecords`, with the
 * ownership challenge appended.
 *
 * Names are zone-relative (`@`, `_crove-verify`, `<selector>._domainkey`) because
 * that is what DNS control panels ask for and what the shared helper already
 * emits for SPF.
 */
export const buildEmailDomainDnsRecords = ({
  selector,
  publicKeyFlattened,
  ownershipChallengeToken,
}: BuildEmailDomainDnsRecordsOptions): EmailDomainDnsRecord[] => {
  return [
    generateDkimRecord(selector, publicKeyFlattened),
    { ...AWS_SES_SPF_RECORD },
    buildOwnershipChallengeRecord(ownershipChallengeToken),
  ];
};

/**
 * Fully-qualified name of the DKIM TXT record for a stored selector.
 */
export const dkimRecordHostName = (selector: string, domain: string): string => {
  return `${selector}.${domain}`;
};
