import dns from 'node:dns/promises';
import { GetEmailIdentityCommand } from '@aws-sdk/client-sesv2';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { prisma } from '@documenso/prisma';
import { EmailDomainStatus } from '@prisma/client';

import { getSesClient } from './create-email-domain';

export const verifyEmailDomain = async (emailDomainId: string) => {
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

  let isVerified = false;

  // 1. Try verification via AWS SES if client is configured
  const sesClient = getSesClient();

  if (sesClient) {
    try {
      const response = await sesClient.send(
        new GetEmailIdentityCommand({
          EmailIdentity: emailDomain.domain,
        }),
      );

      if (response.VerificationStatus === 'SUCCESS' || response.DkimAttributes?.Status === 'SUCCESS') {
        isVerified = true;
      }
    } catch (err) {
      console.warn(`[Email Domain] SES verification check for ${emailDomain.domain} failed:`, err);
    }
  }

  // 2. Direct DNS TXT record check as fallback / universal verification
  if (!isVerified && emailDomain.selector) {
    try {
      const txtRecords = await dns.resolveTxt(emailDomain.selector);
      const flattenedTxt = txtRecords.map((chunk) => chunk.join('')).join('');

      if (flattenedTxt.includes('v=DKIM1') || (emailDomain.publicKey && flattenedTxt.includes(emailDomain.publicKey.slice(0, 32)))) {
        isVerified = true;
      }
    } catch (dnsErr) {
      // DNS record might not be propagated yet
    }
  }

  const updatedEmailDomain = await prisma.emailDomain.update({
    where: {
      id: emailDomainId,
    },
    data: {
      status: isVerified ? EmailDomainStatus.ACTIVE : EmailDomainStatus.PENDING,
      lastVerifiedAt: new Date(),
    },
  });

  return {
    emailDomain: updatedEmailDomain,
    isVerified,
  };
};
