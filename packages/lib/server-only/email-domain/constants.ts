/**
 * Host (relative to the zone apex) of the TXT record that proves control of a
 * domain.
 *
 * Deliberately independent of Amazon SES: DKIM and SPF records can be published
 * by anyone who can reach a zone's DNS, so they cannot on their own bind a
 * domain claim to the organisation that started it.
 */
export const OWNERSHIP_CHALLENGE_LABEL = '_crove-verify';

export const OWNERSHIP_CHALLENGE_VALUE_PREFIX = 'crove-domain-verification=';

/**
 * Domain-separation prefix for the ownership-challenge HMAC. Bumping the version
 * invalidates every outstanding challenge, which is the intended escape hatch if
 * the derivation ever needs to change.
 */
export const OWNERSHIP_CHALLENGE_HMAC_CONTEXT = 'crove:email-domain-ownership-challenge:v1';

export const DKIM_SELECTOR_PREFIX = 'crove-';

export const DKIM_SELECTOR_RANDOM_LENGTH = 12;

/**
 * RFC 6376 fixes the parent of a DKIM public-key record to `_domainkey`.
 *
 * The stored `selector` column holds the record *host* (`<label>._domainkey`)
 * rather than the bare label so that it can be handed straight to a DNS
 * provider. `packages/lib/utils/email-domains.ts` — and therefore every screen
 * that shows an administrator their records — treats the first argument as a
 * record name, and the SPF record it emits uses the same zone-relative
 * convention (`@`).
 */
export const DKIM_SELECTOR_SUFFIX = '._domainkey';

export const DKIM_MODULUS_LENGTH_BITS = 2048;

export const MAX_DNS_LABEL_LENGTH = 63;

export const PUNYCODE_LABEL_PREFIX = 'xn--';

/**
 * A PENDING claim older than this may be taken over by another organisation.
 * 72h comfortably exceeds the 48h DNS propagation window we quote to
 * administrators, so a claim inside the window may still be mid-setup.
 */
export const STALE_PENDING_CLAIM_TTL_MS = 72 * 60 * 60 * 1000;

/**
 * Challenge + DKIM + SPF, plus one SOA query used to corroborate an NXDOMAIN so
 * that a broken resolver is never mistaken for a missing record.
 */
export const MAX_DNS_QUERIES_PER_VERIFICATION = 4;

export const MAX_CONCURRENT_EXTERNAL_OPERATIONS = 8;

/**
 * Three consecutive authoritative negatives are required before an ACTIVE domain
 * is demoted. A single negative is routinely produced by DNS provider outages,
 * zone transfers and partial rollbacks, none of which say anything about whether
 * the administrator still controls the domain.
 */
export const CONSECUTIVE_NEGATIVES_BEFORE_DOWNGRADE = 3;

export const EMAIL_DOMAIN_VERIFICATION_MAX_PER_HOUR = 100;

export const SES_SPF_MECHANISMS: ReadonlySet<string> = new Set(['include:amazonses.com', '+include:amazonses.com']);

/**
 * Domains that can never be a customer's own sending domain. Claiming one would
 * let an organisation send mail that appears to come from a public mailbox
 * provider.
 */
export const BLOCKED_SENDING_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'proton.me',
  'protonmail.com',
  'aol.com',
  'zoho.com',
  'gmx.net',
  'gmx.com',
  'mail.ru',
  'yandex.ru',
  'yandex.com',
  'fastmail.com',
]);
