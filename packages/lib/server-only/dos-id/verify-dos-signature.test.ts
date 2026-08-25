import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { verifyDosWebhookSignature } from './verify-dos-signature';

describe('verifyDosWebhookSignature', () => {
  const secret = 'super-secret-key-12345';
  const rawBody = JSON.stringify({
    event: 'organization.created',
    data: {
      id: 'org_test_123',
      name: 'Test Org',
      owner_email: 'owner@example.com',
    },
  });

  const validHmacHex = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

  it('should verify signature with sha256= prefix', () => {
    const signatureHeader = `sha256=${validHmacHex}`;
    const result = verifyDosWebhookSignature({ rawBody, signatureHeader, secret });
    expect(result).toBe(true);
  });

  it('should verify signature without sha256= prefix', () => {
    const signatureHeader = validHmacHex;
    const result = verifyDosWebhookSignature({ rawBody, signatureHeader, secret });
    expect(result).toBe(true);
  });

  it('should reject invalid signature', () => {
    const signatureHeader = 'sha256=invalidhash000000000000000000000000000000000000000000000000000000';
    const result = verifyDosWebhookSignature({ rawBody, signatureHeader, secret });
    expect(result).toBe(false);
  });

  it('should reject when secret is wrong', () => {
    const signatureHeader = `sha256=${validHmacHex}`;
    const result = verifyDosWebhookSignature({ rawBody, signatureHeader, secret: 'wrong-secret' });
    expect(result).toBe(false);
  });

  it('should reject when signatureHeader is null or empty', () => {
    expect(verifyDosWebhookSignature({ rawBody, signatureHeader: null, secret })).toBe(false);
    expect(verifyDosWebhookSignature({ rawBody, signatureHeader: '', secret })).toBe(false);
  });

  it('should reject when body is tampered with', () => {
    const signatureHeader = `sha256=${validHmacHex}`;
    const tamperedBody = rawBody + ' ';
    const result = verifyDosWebhookSignature({ rawBody: tamperedBody, signatureHeader, secret });
    expect(result).toBe(false);
  });
});
