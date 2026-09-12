import { describe, expect, it } from 'vitest';

import { AppError, AppErrorCode } from '../../errors/app-error';
import {
  assertDomainIsClaimable,
  describeDomainPolicyViolation,
  isDnsLegalLabel,
  normaliseDomain,
} from './domain-policy';

describe('normaliseDomain', () => {
  it('lowercases, trims and strips the trailing root dot', () => {
    expect(normaliseDomain('  Example.COM.  ')).toBe('example.com');
    expect(normaliseDomain('example.com...')).toBe('example.com');
    expect(normaliseDomain('example.com')).toBe('example.com');
  });
});

describe('isDnsLegalLabel', () => {
  it('accepts ordinary host labels', () => {
    expect(isDnsLegalLabel('a')).toBe(true);
    expect(isDnsLegalLabel('mail-01')).toBe(true);
    expect(isDnsLegalLabel('x'.repeat(63))).toBe(true);
  });

  it('rejects labels that are not valid in DNS', () => {
    expect(isDnsLegalLabel('')).toBe(false);
    expect(isDnsLegalLabel('-lead')).toBe(false);
    expect(isDnsLegalLabel('trail-')).toBe(false);
    expect(isDnsLegalLabel('x'.repeat(64))).toBe(false);
    expect(isDnsLegalLabel('under_score')).toBe(false);
    expect(isDnsLegalLabel('spaced label')).toBe(false);
  });
});

describe('describeDomainPolicyViolation', () => {
  it('accepts an ordinary registrable domain', () => {
    expect(describeDomainPolicyViolation('example.com')).toBeNull();
    expect(describeDomainPolicyViolation('mail.example.co.uk')).toBeNull();
    expect(describeDomainPolicyViolation('crove-sign.io')).toBeNull();
  });

  it.each([
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
  ])('rejects the public mailbox provider %s', (domain) => {
    expect(describeDomainPolicyViolation(domain)).toContain('Shared mailbox providers');
  });

  it('rejects single-label hosts', () => {
    expect(describeDomainPolicyViolation('intranet')).toContain('single-label');
  });

  it('rejects a non-alphabetic top-level domain', () => {
    expect(describeDomainPolicyViolation('example.c0m')).toContain('alphabetic');
    expect(describeDomainPolicyViolation('example.123')).toContain('alphabetic');
  });

  it('rejects a www. prefixed host', () => {
    expect(describeDomainPolicyViolation('www.example.com')).toContain('www');
  });

  it('rejects domains containing an illegal label', () => {
    expect(describeDomainPolicyViolation('exa_mple.com')).toContain('not valid in DNS');
    expect(describeDomainPolicyViolation('-example.com')).toContain('not valid in DNS');
  });

  it('rejects an empty domain', () => {
    expect(describeDomainPolicyViolation('')).toContain('required');
  });
});

describe('assertDomainIsClaimable', () => {
  it('returns the normalised domain when it can be claimed', () => {
    expect(assertDomainIsClaimable('Example.COM.')).toBe('example.com');
  });

  it('throws INVALID_BODY when policy forbids the claim', () => {
    let caught: unknown;

    try {
      assertDomainIsClaimable('gmail.com');
    } catch (error) {
      caught = error;
    }

    const appError = AppError.parseError(caught);

    expect(appError.code).toBe(AppErrorCode.INVALID_BODY);
    expect(appError.userMessage).toContain('Shared mailbox providers');
  });
});
