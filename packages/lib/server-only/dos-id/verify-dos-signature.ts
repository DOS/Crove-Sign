import crypto from 'node:crypto';

/**
 * Verify HMAC-SHA256 signature from DOS.Me webhook dispatcher.
 * Expected Header format: `X-DOS-Signature: sha256=<hex>` or `<hex>`.
 */
export const verifyDosWebhookSignature = ({
  rawBody,
  signatureHeader,
  secret,
}: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
}): boolean => {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expectedPrefix = 'sha256=';
  const providedHash = signatureHeader.startsWith(expectedPrefix)
    ? signatureHeader.slice(expectedPrefix.length)
    : signatureHeader;

  const computedHash = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');

  if (providedHash.length !== computedHash.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(Buffer.from(providedHash), Buffer.from(computedHash));
  } catch {
    return false;
  }
};
