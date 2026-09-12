import { prisma } from '@documenso/prisma';
import type { EmailDomain, OrganisationEmail } from '@prisma/client';
import { EmailDomainStatus } from '@prisma/client';

import { AppError, AppErrorCode } from '../../errors/app-error';
import type { TEmailDomain } from '../../types/email-domain';
import { generateDatabaseId } from '../../universal/id';
import { logger } from '../../utils/logger';
import { logEmailDomainTransition } from './audit';
import type { GeneratedDkimKeyPair } from './dkim-keys';
import { generateDkimKeyPair } from './dkim-keys';
import { buildEmailDomainDnsRecords } from './dns-records';
import { resolveDomainClaim } from './domain-claim';
import { assertDomainIsClaimable } from './domain-policy';
import { assertEmailDomainEncryptionKey, encryptDkimPrivateKey } from './key-material';
import { deriveOwnershipChallengeToken } from './ownership-challenge';
import { isPrismaConflictOn } from './prisma-conflict';
import { assertSesServiceConfigured } from './ses-client';
import { registerSesEmailIdentity } from './ses-identity';
import type { EmailDomainDnsRecord } from './types';

/**
 * A selector carries 62 bits of randomness, so a collision is not a realistic
 * event — but the column is globally unique, so the insert has to cope with one
 * rather than surfacing a database error to an administrator.
 */
const MAX_ROW_INSERT_ATTEMPTS = 2;

type PersistedEmailDomain = EmailDomain & { emails: OrganisationEmail[] };

type AllocatedEmailDomain = {
  emailDomain: PersistedEmailDomain;
  keyPair: GeneratedDkimKeyPair;
  ownershipChallengeToken: string;
};

export type CreateEmailDomainOptions = {
  /**
   * Already lowercased and regex-validated by the tRPC layer; re-normalised and
   * re-checked here for every other caller.
   */
  domain: string;
  organisationId: string;
};

export type CreateEmailDomainResult = {
  emailDomain: TEmailDomain;
  records: EmailDomainDnsRecord[];
};

/**
 * Project a row onto the public response contract.
 *
 * Done field by field rather than by spreading so that the encrypted DKIM private
 * key can never ride along inside an object that happens to carry one.
 */
const toEmailDomainResponse = (emailDomain: PersistedEmailDomain): TEmailDomain => {
  return {
    id: emailDomain.id,
    status: emailDomain.status,
    organisationId: emailDomain.organisationId,
    domain: emailDomain.domain,
    selector: emailDomain.selector,
    publicKey: emailDomain.publicKey,
    createdAt: emailDomain.createdAt,
    updatedAt: emailDomain.updatedAt,
    lastVerifiedAt: emailDomain.lastVerifiedAt,
    emails: emailDomain.emails.map((email) => ({
      id: email.id,
      createdAt: email.createdAt,
      updatedAt: email.updatedAt,
      email: email.email,
      emailName: email.emailName,
      emailDomainId: email.emailDomainId,
      organisationId: email.organisationId,
    })),
  };
};

const insertEmailDomainRow = async ({
  emailDomainId,
  organisationId,
  domain,
  keyPair,
  encryptedPrivateKey,
}: {
  emailDomainId: string;
  organisationId: string;
  domain: string;
  keyPair: GeneratedDkimKeyPair;
  encryptedPrivateKey: string;
}): Promise<PersistedEmailDomain | null> => {
  try {
    return await prisma.emailDomain.create({
      data: {
        id: emailDomainId,
        status: EmailDomainStatus.PENDING,
        organisationId,
        domain,
        selector: keyPair.selector,
        publicKey: keyPair.publicKeyFlattened,
        privateKey: encryptedPrivateKey,
      },
      include: { emails: true },
    });
  } catch (error) {
    // Claiming the globally unique domain here is what closes the race between
    // the pre-flight claim check and the insert.
    if (isPrismaConflictOn(error, 'domain')) {
      throw new AppError(AppErrorCode.ALREADY_EXISTS, {
        message: 'The domain was registered while this request was being processed.',
        userMessage: 'This domain is already in use.',
      });
    }

    if (isPrismaConflictOn(error, 'selector')) {
      return null;
    }

    throw error;
  }
};

const allocateEmailDomain = async ({
  emailDomainId,
  organisationId,
  domain,
  encryptionKey,
}: {
  emailDomainId: string;
  organisationId: string;
  domain: string;
  encryptionKey: string;
}): Promise<AllocatedEmailDomain | null> => {
  for (let attempt = 1; attempt <= MAX_ROW_INSERT_ATTEMPTS; attempt++) {
    const keyPair = generateDkimKeyPair();
    const ownershipChallengeToken = deriveOwnershipChallengeToken(
      { emailDomainId, selector: keyPair.selector, domain },
      encryptionKey,
    );

    const emailDomain = await insertEmailDomainRow({
      emailDomainId,
      organisationId,
      domain,
      keyPair,
      encryptedPrivateKey: encryptDkimPrivateKey(keyPair.privateKeyPem),
    });

    if (emailDomain) {
      return { emailDomain, keyPair, ownershipChallengeToken };
    }
  }

  return null;
};

const releaseFailedRegistration = async (emailDomainId: string): Promise<void> => {
  try {
    await prisma.emailDomain.delete({
      where: { id: emailDomainId },
    });
  } catch (rollbackError) {
    logger.error({
      msg: 'email_domain_registration_rollback_failed',
      emailDomainId,
      error: rollbackError,
    });
  }
};

/**
 * Register a domain an organisation may send mail from (F1, F2).
 *
 * The row is written before SES is called so that the globally unique domain is
 * claimed atomically; if SES then refuses, the row is removed again, so a domain
 * is never left behind that could not send.
 */
export const createEmailDomain = async ({
  domain,
  organisationId,
}: CreateEmailDomainOptions): Promise<CreateEmailDomainResult> => {
  assertSesServiceConfigured();

  const encryptionKey = assertEmailDomainEncryptionKey();
  const normalisedDomain = assertDomainIsClaimable(domain);

  await resolveDomainClaim({ domain: normalisedDomain, organisationId });

  const emailDomainId = generateDatabaseId('email_domain');

  const allocation = await allocateEmailDomain({
    emailDomainId,
    organisationId,
    domain: normalisedDomain,
    encryptionKey,
  });

  if (!allocation) {
    throw new AppError(AppErrorCode.RETRY_EXCEPTION, {
      message: 'Could not allocate a unique DKIM selector for the email domain.',
      userMessage: 'We could not set up this domain. Please try again.',
    });
  }

  const { emailDomain, keyPair, ownershipChallengeToken } = allocation;

  try {
    await registerSesEmailIdentity({
      domain: normalisedDomain,
      selectorLabel: keyPair.selectorLabel,
      privateKeyPem: keyPair.privateKeyPem,
    });
  } catch (error) {
    await releaseFailedRegistration(emailDomainId);

    throw error;
  }

  logEmailDomainTransition({
    event: 'created',
    emailDomainId: emailDomain.id,
    organisationId,
    domain: normalisedDomain,
    previousStatus: null,
    nextStatus: EmailDomainStatus.PENDING,
    reason: 'Domain registered and awaiting DNS configuration',
  });

  return {
    emailDomain: toEmailDomainResponse(emailDomain),
    records: buildEmailDomainDnsRecords({
      selector: keyPair.selector,
      publicKeyFlattened: keyPair.publicKeyFlattened,
      ownershipChallengeToken,
    }),
  };
};
