import { DeleteEmailIdentityCommand } from '@aws-sdk/client-sesv2';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { prisma } from '@documenso/prisma';

import { getSesClient } from './create-email-domain';

export type DeleteEmailDomainOptions = {
  emailDomainId: string;
};

/**
 * Delete the email domain and SES email identity if applicable.
 */
export const deleteEmailDomain = async ({ emailDomainId }: DeleteEmailDomainOptions) => {
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
          console.warn('[Email Domain] Failed to delete SES identity:', err?.message || err);
        }
      });
  }

  await prisma.emailDomain.delete({
    where: {
      id: emailDomainId,
    },
  });
};
