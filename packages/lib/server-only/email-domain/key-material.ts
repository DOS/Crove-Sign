import { DOCUMENSO_ENCRYPTION_KEY } from '../../constants/crypto';
import { AppError, AppErrorCode } from '../../errors/app-error';
import { symmetricEncrypt } from '../../universal/crypto';

/**
 * The DKIM private key is the only thing that lets whoever holds it sign mail as
 * the domain, so it is encrypted with the installation's symmetric key before it
 * ever reaches the database. Refusing to run without that key is deliberate:
 * writing a bare private key would be an unrecoverable exposure.
 */
export const assertEmailDomainEncryptionKey = (): string => {
  if (!DOCUMENSO_ENCRYPTION_KEY) {
    throw new AppError(AppErrorCode.MISSING_ENV_VAR, {
      message: 'NEXT_PRIVATE_ENCRYPTION_KEY is not configured, so DKIM key material cannot be stored safely.',
      userMessage: 'Custom sending domains are not fully configured on this installation.',
    });
  }

  return DOCUMENSO_ENCRYPTION_KEY;
};

export const encryptDkimPrivateKey = (privateKeyPem: string): string => {
  return symmetricEncrypt({
    key: assertEmailDomainEncryptionKey(),
    data: privateKeyPem,
  });
};
