import crypto from 'node:crypto';

import { DOCUMENSO_ENCRYPTION_KEY } from '../../../constants/crypto';
import { ONE_MINUTE } from '../../../constants/time';
import { AppError, AppErrorCode } from '../../../errors/app-error';
import {
  type TOrganisationAccountLinkMetadata,
  ZOrganisationAccountLinkMetadataSchema,
} from '../../../types/organisation';
import { symmetricDecrypt, symmetricEncrypt } from '../../../universal/crypto';

/**
 * How long an issued confirmation link stays redeemable.
 *
 * Deliberately short, and kept in sync with the "Link expires in 30 minutes"
 * copy rendered by `OrganisationAccountLinkConfirmationTemplate`.
 */
export const ORGANISATION_ACCOUNT_LINK_TOKEN_LIFETIME_MS = 30 * ONE_MINUTE;

/**
 * Random bytes behind a confirmation token (256 bits of entropy).
 */
const LINK_TOKEN_RANDOM_BYTE_LENGTH = 32;

export type OrganisationAccountLinkOauthConfig = TOrganisationAccountLinkMetadata['oauthConfig'];

/**
 * A confirmation token is a bearer credential delivered by email, so it comes
 * straight from a CSPRNG. `base64url` keeps it safe to embed in a link path.
 */
export const createOrganisationAccountLinkToken = () => {
  return crypto.randomBytes(LINK_TOKEN_RANDOM_BYTE_LENGTH).toString('base64url');
};

export const createOrganisationAccountLinkExpiry = () => {
  return new Date(Date.now() + ORGANISATION_ACCOUNT_LINK_TOKEN_LIFETIME_MS);
};

export const isOrganisationAccountLinkTokenExpired = (expires: Date) => {
  return expires.getTime() <= Date.now();
};

const requireLinkEncryptionKey = () => {
  if (!DOCUMENSO_ENCRYPTION_KEY) {
    throw new AppError(AppErrorCode.NOT_SETUP, {
      message: 'Missing encryption key, unable to store organisation account link material',
    });
  }

  return DOCUMENSO_ENCRYPTION_KEY;
};

const encryptLinkSecret = (key: string, data: string) => {
  return symmetricEncrypt({ key, data });
};

const decryptLinkSecret = (key: string, data: string) => {
  return Buffer.from(symmetricDecrypt({ key, data })).toString('utf-8');
};

/**
 * Encrypts the OIDC material before it is persisted in
 * `VerificationToken.metadata`.
 *
 * The metadata column is a plain JSONB blob that is readable by anyone with
 * database access, and the access/id tokens inside it are live bearer
 * credentials, so they are never stored in plaintext. `expiresAt` stays a
 * number because the link metadata schema types it as one; it is a timestamp,
 * not a secret.
 */
export const encryptOrganisationAccountLinkOauthConfig = (
  oauthConfig: OrganisationAccountLinkOauthConfig,
): OrganisationAccountLinkOauthConfig => {
  const key = requireLinkEncryptionKey();

  return {
    providerAccountId: encryptLinkSecret(key, oauthConfig.providerAccountId),
    accessToken: encryptLinkSecret(key, oauthConfig.accessToken),
    idToken: encryptLinkSecret(key, oauthConfig.idToken),
    expiresAt: oauthConfig.expiresAt,
  };
};

/**
 * Reverses {@link encryptOrganisationAccountLinkOauthConfig}.
 *
 * Decryption fails when the encryption key changed between issue and
 * redemption, or when the stored material was tampered with. The failure is
 * reported without the ciphertext, which would otherwise end up in logs and in
 * the error surfaced to the caller.
 */
export const decryptOrganisationAccountLinkOauthConfig = (
  oauthConfig: OrganisationAccountLinkOauthConfig,
): OrganisationAccountLinkOauthConfig => {
  const key = requireLinkEncryptionKey();

  try {
    return {
      providerAccountId: decryptLinkSecret(key, oauthConfig.providerAccountId),
      accessToken: decryptLinkSecret(key, oauthConfig.accessToken),
      idToken: decryptLinkSecret(key, oauthConfig.idToken),
      expiresAt: oauthConfig.expiresAt,
    };
  } catch {
    throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
      message: 'Unable to decrypt the organisation account link material',
    });
  }
};

/**
 * Parses persisted link metadata, returning `null` when it does not conform.
 *
 * A `null` result is treated as a refusal by the caller rather than a thrown
 * schema error: the row is left untouched so the failure stays explainable.
 */
export const parseOrganisationAccountLinkMetadata = (metadata: unknown): TOrganisationAccountLinkMetadata | null => {
  const parsedMetadata = ZOrganisationAccountLinkMetadataSchema.safeParse(metadata);

  return parsedMetadata.success ? parsedMetadata.data : null;
};
