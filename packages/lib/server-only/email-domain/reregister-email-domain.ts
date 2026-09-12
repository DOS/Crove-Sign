import { prisma } from '@documenso/prisma';
import { EmailDomainStatus } from '@prisma/client';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { logEmailDomainTransition } from './audit';
import type { GeneratedDkimKeyPair } from './dkim-keys';
import { generateDkimKeyPair } from './dkim-keys';
import { assertEmailDomainEncryptionKey, encryptDkimPrivateKey } from './key-material';
import { isPrismaConflictOn } from './prisma-conflict';
import { assertSesServiceConfigured } from './ses-client';
import { registerSesEmailIdentity } from './ses-identity';
import { buildNegativeStreakKey, clearNegativeStreak } from './verification-state';

const MAX_REREGISTER_ATTEMPTS = 2;

export type ReregisterEmailDomainOptions = {
  emailDomainId: string;
};

/**
 * Rotate a stalled domain's key material and hand the administrator a fresh set of
 * records to publish (F5).
 *
 * The row id is preserved so that any `OrganisationEmail` addresses already
 * created against the domain survive; only the selector, the key pair and the
 * derived ownership challenge change. Calling it repeatedly is harmless — each
 * call simply supersedes the previous rotation — which matters because the hourly
 * sync job re-registers anything that has been PENDING for more than 48 hours.
 */
export const reregisterEmailDomain = async ({ emailDomainId }: ReregisterEmailDomainOptions): Promise<void> => {
  assertSesServiceConfigured();

  // Fails before anything is written when the rotated private key could not be
  // stored encrypted.
  assertEmailDomainEncryptionKey();

  const emailDomain = await prisma.emailDomain.findUnique({
    where: { id: emailDomainId },
    select: {
      id: true,
      domain: true,
      selector: true,
      status: true,
      organisationId: true,
    },
  });

  if (!emailDomain) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Email domain not found',
    });
  }

  let rotatedKeyPair: GeneratedDkimKeyPair | null = null;

  for (let attempt = 1; attempt <= MAX_REREGISTER_ATTEMPTS && rotatedKeyPair === null; attempt++) {
    const keyPair = generateDkimKeyPair();

    // SES is re-pointed before the row is touched: if signing cannot be
    // reconfigured, the database keeps describing the key SES is actually using.
    await registerSesEmailIdentity({
      domain: emailDomain.domain,
      selectorLabel: keyPair.selectorLabel,
      privateKeyPem: keyPair.privateKeyPem,
    });

    try {
      await prisma.emailDomain.update({
        where: { id: emailDomain.id },
        data: {
          selector: keyPair.selector,
          publicKey: keyPair.publicKeyFlattened,
          privateKey: encryptDkimPrivateKey(keyPair.privateKeyPem),
          status: EmailDomainStatus.PENDING,
          lastVerifiedAt: null,
        },
      });

      rotatedKeyPair = keyPair;
    } catch (error) {
      if (!isPrismaConflictOn(error, 'selector')) {
        throw error;
      }
    }
  }

  if (!rotatedKeyPair) {
    throw new AppError(AppErrorCode.RETRY_EXCEPTION, {
      message: 'Could not allocate a unique DKIM selector while re-registering the email domain.',
      userMessage: 'We could not refresh this domain. Please try again.',
    });
  }

  clearNegativeStreak(buildNegativeStreakKey({ emailDomainId: emailDomain.id, selector: emailDomain.selector }));

  logEmailDomainTransition({
    event: 'reregistered',
    emailDomainId: emailDomain.id,
    organisationId: emailDomain.organisationId,
    domain: emailDomain.domain,
    previousStatus: emailDomain.status,
    nextStatus: EmailDomainStatus.PENDING,
    reason: 'DKIM key pair, selector and ownership challenge rotated',
  });
};
