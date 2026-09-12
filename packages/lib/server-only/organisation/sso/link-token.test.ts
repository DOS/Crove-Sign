import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  // `DOCUMENSO_ENCRYPTION_KEY` is read from the environment when
  // `constants/crypto` is first evaluated, so it must be set before any import.
  process.env.NEXT_PRIVATE_ENCRYPTION_KEY = 'cleanroom-test-encryption-key';
});

import { ONE_DAY } from '../../../constants/time';
import { AppErrorCode } from '../../../errors/app-error';
import {
  createOrganisationAccountLinkExpiry,
  createOrganisationAccountLinkToken,
  decryptOrganisationAccountLinkOauthConfig,
  encryptOrganisationAccountLinkOauthConfig,
  isOrganisationAccountLinkTokenExpired,
  ORGANISATION_ACCOUNT_LINK_TOKEN_LIFETIME_MS,
  parseOrganisationAccountLinkMetadata,
} from './link-token';

const OAUTH_CONFIG = {
  providerAccountId: 'oidc-subject-1',
  accessToken: 'sso-access-token-secret-value',
  idToken: 'sso-id-token-secret-value',
  expiresAt: 1_900_000_000,
};

describe('link tokens', () => {
  it('issues a url safe token backed by 256 bits of entropy', () => {
    const token = createOrganisationAccountLinkToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url').length).toBe(32);
  });

  it('never issues the same token twice', () => {
    const tokens = new Set(Array.from({ length: 25 }, () => createOrganisationAccountLinkToken()));

    expect(tokens.size).toBe(25);
  });

  it('expires the token well inside the 24 hour ceiling', () => {
    const issuedAt = Date.now();
    const expires = createOrganisationAccountLinkExpiry();

    expect(ORGANISATION_ACCOUNT_LINK_TOKEN_LIFETIME_MS).toBeLessThanOrEqual(ONE_DAY);
    expect(expires.getTime()).toBeGreaterThan(issuedAt);
    expect(expires.getTime() - issuedAt).toBeLessThanOrEqual(ONE_DAY);
  });

  it('treats a past expiry as expired and a future expiry as live', () => {
    expect(isOrganisationAccountLinkTokenExpired(new Date(Date.now() - 1))).toBe(true);
    expect(isOrganisationAccountLinkTokenExpired(new Date(Date.now() + 1000))).toBe(false);
  });
});

describe('link oauth material', () => {
  it('round trips through the repository symmetric encryption helper', () => {
    const encrypted = encryptOrganisationAccountLinkOauthConfig(OAUTH_CONFIG);

    expect(encrypted.accessToken).not.toBe(OAUTH_CONFIG.accessToken);
    expect(encrypted.idToken).not.toBe(OAUTH_CONFIG.idToken);
    expect(encrypted.providerAccountId).not.toBe(OAUTH_CONFIG.providerAccountId);
    expect(JSON.stringify(encrypted)).not.toContain(OAUTH_CONFIG.accessToken);
    expect(JSON.stringify(encrypted)).not.toContain(OAUTH_CONFIG.idToken);
    expect(decryptOrganisationAccountLinkOauthConfig(encrypted)).toEqual(OAUTH_CONFIG);
  });

  it('refuses tampered material without echoing it', () => {
    const encrypted = encryptOrganisationAccountLinkOauthConfig(OAUTH_CONFIG);
    const firstCharacter = encrypted.accessToken.slice(0, 1);
    const tamperedAccessToken = `${firstCharacter === '0' ? '1' : '0'}${encrypted.accessToken.slice(1)}`;

    let caughtError: unknown;

    try {
      decryptOrganisationAccountLinkOauthConfig({ ...encrypted, accessToken: tamperedAccessToken });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError as { code: string }).code).toBe(AppErrorCode.UNKNOWN_ERROR);
    expect((caughtError as { message: string }).message).not.toContain(tamperedAccessToken);
  });
});

describe('link metadata', () => {
  it('parses conforming metadata', () => {
    const metadata = parseOrganisationAccountLinkMetadata({
      type: 'create',
      userId: 42,
      organisationId: 'org_123',
      oauthConfig: encryptOrganisationAccountLinkOauthConfig(OAUTH_CONFIG),
    });

    expect(metadata).not.toBeNull();
    expect(metadata?.type).toBe('create');
    expect(metadata?.userId).toBe(42);
  });

  it('returns null for metadata that does not conform', () => {
    expect(parseOrganisationAccountLinkMetadata(null)).toBeNull();
    expect(parseOrganisationAccountLinkMetadata({ type: 'link' })).toBeNull();
    expect(parseOrganisationAccountLinkMetadata({ type: 'unlink', userId: 1, organisationId: 'org_1' })).toBeNull();
  });
});
