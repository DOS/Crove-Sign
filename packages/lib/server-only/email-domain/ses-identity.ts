import {
  CreateEmailIdentityCommand,
  DeleteEmailIdentityCommand,
  GetEmailIdentityCommand,
  PutEmailIdentityDkimSigningAttributesCommand,
} from '@aws-sdk/client-sesv2';
import { z } from 'zod';

import { logger } from '../../utils/logger';
import {
  describeAwsError,
  isSesErrorName,
  logSesError,
  readSesServiceConfiguration,
  toSesAppError,
  withSesClient,
} from './ses-client';

const DKIM_SIGNING_ATTRIBUTES_ORIGIN_EXTERNAL = 'EXTERNAL';
const SES_DKIM_STATUS_FAILED = 'FAILED';

const ZEmailIdentityResponseSchema = z.object({
  IdentityType: z.string().optional(),
  VerifiedForSendingStatus: z.boolean().optional(),
  DkimAttributes: z
    .object({
      Status: z.string().optional(),
    })
    .optional(),
});

export type SesIdentityRemoval =
  | { kind: 'removed' }
  | { kind: 'absent' }
  /**
   * SES is not configured on this installation, so there is nothing to remove.
   */
  | { kind: 'skipped' }
  /**
   * SES could not be reached or refused the deletion. The database row is still
   * removed and the identity is logged as an orphan for cleanup.
   */
  | { kind: 'failed'; reason: string };

/**
 * Remove the SES identity for a domain. Never throws: deleting our own row must
 * not be blocked by the state of a third party.
 */
export const removeSesEmailIdentity = async ({ domain }: { domain: string }): Promise<SesIdentityRemoval> => {
  if (!readSesServiceConfiguration()) {
    return { kind: 'skipped' };
  }

  try {
    await withSesClient((client) => client.send(new DeleteEmailIdentityCommand({ EmailIdentity: domain })));

    return { kind: 'removed' };
  } catch (error) {
    if (isSesErrorName(error, 'NotFoundException')) {
      return { kind: 'absent' };
    }

    logSesError('delete the sending domain identity', error);

    return { kind: 'failed', reason: describeAwsError(error).name };
  }
};

/**
 * Log an SES identity that outlived its database row so that it can be cleaned up
 * out of band.
 */
export const logOrphanedSesIdentity = ({
  domain,
  emailDomainId,
  organisationId,
  reason,
}: {
  domain: string;
  emailDomainId: string;
  organisationId: string;
  reason: string;
}): void => {
  logger.error({
    msg: 'email_domain_ses_orphan',
    emailDomainId,
    organisationId,
    domain,
    reason,
  });
};

export type RegisterSesEmailIdentityOptions = {
  domain: string;
  selectorLabel: string;
  privateKeyPem: string;
};

export type SesIdentityRegistration = {
  /**
   * False when SES already knew about the identity, which happens after a
   * reregistration or when a previous attempt got as far as SES but not as far as
   * the database.
   */
  didCreateIdentity: boolean;
};

/**
 * Create the SES email identity for a domain and hand SES the private half of our
 * BYODKIM key pair.
 *
 * Registering the identity is not sufficient on its own: SES-managed DKIM would
 * sign with keys we never see and cannot verify against DNS, so the signing
 * attributes are pointed at our own selector and key. Both steps must succeed or
 * the domain cannot send.
 */
export const registerSesEmailIdentity = async ({
  domain,
  selectorLabel,
  privateKeyPem,
}: RegisterSesEmailIdentityOptions): Promise<SesIdentityRegistration> => {
  let didCreateIdentity = false;

  try {
    await withSesClient((client) => client.send(new CreateEmailIdentityCommand({ EmailIdentity: domain })));

    didCreateIdentity = true;
  } catch (error) {
    if (!isSesErrorName(error, 'AlreadyExistsException')) {
      throw toSesAppError('register the sending domain', error);
    }
  }

  try {
    await withSesClient((client) =>
      client.send(
        new PutEmailIdentityDkimSigningAttributesCommand({
          EmailIdentity: domain,
          SigningAttributesOrigin: DKIM_SIGNING_ATTRIBUTES_ORIGIN_EXTERNAL,
          SigningAttributes: {
            DomainSigningSelector: selectorLabel,
            DomainSigningPrivateKey: privateKeyPem,
          },
        }),
      ),
    );
  } catch (error) {
    // Only roll back an identity we just created; deleting a pre-existing one
    // would silently break whatever was already configured against it.
    if (didCreateIdentity) {
      await removeSesEmailIdentity({ domain });
    }

    throw toSesAppError('configure DKIM signing for the sending domain', error);
  }

  return { didCreateIdentity };
};

export type SesIdentityRead =
  | { kind: 'found'; verifiedForSending: boolean; dkimStatus: string | null; hasFailedDkim: boolean }
  | { kind: 'absent' }
  | { kind: 'unavailable'; reason: string };

export const readSesEmailIdentity = async ({ domain }: { domain: string }): Promise<SesIdentityRead> => {
  try {
    const response = await withSesClient((client) =>
      client.send(new GetEmailIdentityCommand({ EmailIdentity: domain })),
    );

    const parsed = ZEmailIdentityResponseSchema.safeParse(response);

    if (!parsed.success) {
      return { kind: 'unavailable', reason: 'Amazon SES returned an unreadable identity description' };
    }

    const dkimStatus = parsed.data.DkimAttributes?.Status ?? null;

    return {
      kind: 'found',
      verifiedForSending: parsed.data.VerifiedForSendingStatus === true,
      dkimStatus,
      hasFailedDkim: dkimStatus === SES_DKIM_STATUS_FAILED,
    };
  } catch (error) {
    if (isSesErrorName(error, 'NotFoundException')) {
      return { kind: 'absent' };
    }

    logSesError('read the sending domain identity', error);

    return { kind: 'unavailable', reason: describeAwsError(error).name };
  }
};
