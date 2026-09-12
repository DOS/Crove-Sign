import { domainToUnicode } from 'node:url';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { BLOCKED_SENDING_DOMAINS, MAX_DNS_LABEL_LENGTH, PUNYCODE_LABEL_PREFIX } from './constants';

const DNS_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const ALPHABETIC_TLD_PATTERN = /^[a-z]{2,}$/;
const WWW_PREFIX = 'www.';

/**
 * Lowercase, trim and drop the trailing root dot so that `EXAMPLE.com.` and
 * `example.com` are the same claim.
 */
export const normaliseDomain = (domain: string): string => {
  return domain.trim().toLowerCase().replace(/\.+$/, '');
};

/**
 * RFC 1035 label rules as they apply to names we publish or store: 1-63 octets,
 * alphanumerics and interior hyphens only, never starting or ending with a
 * hyphen.
 */
export const isDnsLegalLabel = (label: string): boolean => {
  return label.length > 0 && label.length <= MAX_DNS_LABEL_LENGTH && DNS_LABEL_PATTERN.test(label);
};

/**
 * A cheap homograph guard.
 *
 * Full mixed-script detection needs Unicode script tables; this catches the case
 * that actually gets used for impersonation — a punycode label that decodes to a
 * mixture of ASCII letters and non-ASCII lookalikes. Labels that are entirely
 * non-ASCII are legitimate internationalised domains and are left alone, as are
 * labels we cannot decode (including on Node builds without full ICU, where
 * `domainToUnicode` gives up rather than echoing).
 */
const isMixedScriptPunycodeLabel = (label: string): boolean => {
  if (!label.startsWith(PUNYCODE_LABEL_PREFIX)) {
    return false;
  }

  const decoded = domainToUnicode(label);

  if (decoded === label || decoded.length === 0) {
    return false;
  }

  const hasAsciiLetter = /[a-z]/i.test(decoded);
  const hasNonAsciiCharacter = /[^\p{ASCII}]/u.test(decoded);

  return hasAsciiLetter && hasNonAsciiCharacter;
};

/**
 * Returns the reason a domain cannot be claimed, or null when it can.
 */
export const describeDomainPolicyViolation = (domain: string): string | null => {
  if (domain.length === 0) {
    return 'A domain is required.';
  }

  if (domain.startsWith(WWW_PREFIX)) {
    return 'Enter the registrable domain without a www. prefix.';
  }

  const labels = domain.split('.');

  if (labels.length < 2) {
    return 'A single-label host cannot be used as a sending domain.';
  }

  if (labels.some((label) => !isDnsLegalLabel(label))) {
    return 'The domain contains a label that is not valid in DNS.';
  }

  const tld = labels.at(-1) ?? '';

  if (!ALPHABETIC_TLD_PATTERN.test(tld)) {
    return 'The top-level domain must be alphabetic.';
  }

  if (BLOCKED_SENDING_DOMAINS.has(domain)) {
    return 'Shared mailbox providers cannot be claimed as a sending domain.';
  }

  if (labels.some(isMixedScriptPunycodeLabel)) {
    return 'The domain mixes writing systems in a way that could impersonate another domain.';
  }

  return null;
};

/**
 * Normalise a domain and reject it when policy forbids claiming it.
 *
 * The tRPC layer already applies a regex and lowercases the value; this is the
 * authoritative re-check for every other caller and for the invariants the regex
 * does not express (blocked providers, single-label hosts, non-alphabetic TLDs).
 */
export const assertDomainIsClaimable = (domain: string): string => {
  const normalised = normaliseDomain(domain);
  const violation = describeDomainPolicyViolation(normalised);

  if (violation) {
    throw new AppError(AppErrorCode.INVALID_BODY, {
      message: `Refusing to register email domain "${normalised}": ${violation}`,
      userMessage: violation,
    });
  }

  return normalised;
};
