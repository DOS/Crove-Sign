import { DeleteEmailIdentityCommand } from '@aws-sdk/client-sesv2';
import { DOCUMENSO_ENCRYPTION_KEY } from '@documenso/lib/constants/crypto';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { symmetricDecrypt } from '@documenso/lib/universal/crypto';
import { prisma } from '@documenso/prisma';
import { EmailDomainStatus } from '@prisma/client';

import { getSesClient, verifyDomainWithDKIM } from './create-email-domain';

type ReregisterEmailDomainOptions = {
  emailDomainId: string;
};

export const reregisterEmailDomain = async ({ emailDomainId }: ReregisterEmailDomainOptions) => {
  const encryptionKey = DOCUMENSO_ENCRYPTION_KEY;

  if (!encryptionKey) {
    throw new Error('Missing DOCUMENSO_ENCRYPTION_KEY');
  }

  const emailDomain = await prisma.emailDomain.findUnique({
    where: {
      id: emailDomainId,
    },
  });

  if (!emailDomain) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Email domain not found',
    });
  }

  const sesClient = getSesClient();

  if (sesClient) {
    await sesClient
      .send(
        new DeleteEmailIdentityCommand({
          EmailIdentity: emailDomain.domain,
        }),
      )
      .catch((err) => {
        if (err.name !== 'NotFoundException') {
          console.warn('[Email Domain] Failed to delete existing SES identity during reregister:', err);
        }
      });
  }

  const decryptedPrivateKeyBytes = symmetricDecrypt({
    key: encryptionKey,
    data: emailDomain.privateKey,
  });

  const decryptedPrivateKey = new TextDecoder().decode(decryptedPrivateKeyBytes);

  const selectorParts = emailDomain.selector.split('._domainkey.');
  const selector = selectorParts[0];

  if (!selector) {
    throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
      message: 'Could not extract selector from email domain record',
    });
  }

  await verifyDomainWithDKIM(emailDomain.domain, selector, decryptedPrivateKey);

  const updatedEmailDomain = await prisma.emailDomain.update({
    where: {
      id: emailDomainId,
    },
    data: {
      status: EmailDomainStatus.PENDING,
      lastVerifiedAt: new Date(),
    },
  });

  return updatedEmailDomain;
};
