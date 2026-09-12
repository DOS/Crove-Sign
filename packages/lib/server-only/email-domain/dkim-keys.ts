import { createPublicKey, generateKeyPairSync } from 'node:crypto';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { alphaid } from '../../universal/id';
import {
  DKIM_MODULUS_LENGTH_BITS,
  DKIM_SELECTOR_PREFIX,
  DKIM_SELECTOR_RANDOM_LENGTH,
  DKIM_SELECTOR_SUFFIX,
} from './constants';
import { isDnsLegalLabel } from './domain-policy';

export type GeneratedDkimKeyPair = {
  /**
   * The bare selector handed to Amazon SES, which publishes and looks for
   * `<selectorLabel>._domainkey.<domain>` itself.
   */
  selectorLabel: string;
  /**
   * The zone-relative host of the DKIM TXT record. This is what is stored in the
   * `selector` column.
   */
  selector: string;
  /**
   * Base64 of the DER-encoded SubjectPublicKeyInfo, on one line, ready for the
   * `p=` tag.
   */
  publicKeyFlattened: string;
  privateKeyPem: string;
};

export const buildDkimSelectorLabel = (): string => {
  const label = `${DKIM_SELECTOR_PREFIX}${alphaid(DKIM_SELECTOR_RANDOM_LENGTH)}`;

  if (!isDnsLegalLabel(label)) {
    throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
      message: 'Generated a DKIM selector label that is not DNS-legal.',
    });
  }

  return label;
};

export const buildDkimSelector = (selectorLabel: string): string => {
  return `${selectorLabel}${DKIM_SELECTOR_SUFFIX}`;
};

/**
 * Generate the RSA key pair used for BYODKIM.
 *
 * We hold the key rather than letting SES manage it so that the public half we
 * publish is the public half we can later prove is in DNS — SES-managed DKIM
 * rotates keys on its own schedule and exposes only CNAME delegation records,
 * which prove nothing about the key actually signing our mail.
 */
export const generateDkimKeyPair = (): GeneratedDkimKeyPair => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: DKIM_MODULUS_LENGTH_BITS,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const publicKeyDer: Buffer = createPublicKey(publicKey).export({ type: 'spki', format: 'der' });
  const selectorLabel = buildDkimSelectorLabel();

  return {
    selectorLabel,
    selector: buildDkimSelector(selectorLabel),
    publicKeyFlattened: publicKeyDer.toString('base64'),
    privateKeyPem: privateKey,
  };
};
