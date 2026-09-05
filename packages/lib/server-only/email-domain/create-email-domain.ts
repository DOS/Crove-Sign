import { CreateEmailIdentityCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { DOCUMENSO_ENCRYPTION_KEY } from '@documenso/lib/constants/crypto';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { symmetricEncrypt } from '@documenso/lib/universal/crypto';
import { generateDatabaseId } from '@documenso/lib/universal/id';
import { generateEmailDomainRecords } from '@documenso/lib/utils/email-domains';
import { env } from '@documenso/lib/utils/env';
import { prisma } from '@documenso/prisma';
import { EmailDomainStatus } from '@prisma/client';
import { generateKeyPair } from 'node:crypto';
import { promisify } from 'node:util';

export const getSesClient = () => {
  const accessKeyId = env('NEXT_PRIVATE_SES_ACCESS_KEY_ID');
  const secretAccessKey = env('NEXT_PRIVATE_SES_SECRET_ACCESS_KEY');
  const region = env('NEXT_PRIVATE_SES_REGION');

  if (!accessKeyId || !secretAccessKey || !region) {
    return null;
  }

  return new SESv2Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
};

const flattenKey = (key: string) => {
  return key.trim().split('\n').slice(1, -1).join('');
};

export async function verifyDomainWithDKIM(domain: string, selector: string, privateKey: string) {
  const sesClient = getSesClient();

  if (!sesClient) {
    // If AWS SES credentials are not set, return without error
    return null;
  }

  const command = new CreateEmailIdentityCommand({
    EmailIdentity: domain,
    DkimSigningAttributes: {
      DomainSigningSelector: selector,
      DomainSigningPrivateKey: privateKey,
    },
  });

  return await sesClient.send(command);
}

export type CreateEmailDomainOptions = {
  domain: string;
  organisationId: string;
};

export type DomainRecord = {
  name: string;
  value: string;
  type: string;
};

export const createEmailDomain = async ({ domain, organisationId }: CreateEmailDomainOptions) => {
  const encryptionKey = DOCUMENSO_ENCRYPTION_KEY;

  if (!encryptionKey) {
    throw new Error('Missing DOCUMENSO_ENCRYPTION_KEY');
  }

  const cleanDomain = domain.toLowerCase().trim();
  const selector = `crove-${organisationId}`.replace(/[_.]/g, '-');
  const recordName = `${selector}._domainkey.${cleanDomain}`;

  // Check if domain already exists in database
  const existingDomain = await prisma.emailDomain.findUnique({
    where: {
      domain: cleanDomain,
    },
  });

  if (existingDomain) {
    throw new AppError(AppErrorCode.ALREADY_EXISTS, {
      message: 'Domain already exists in database',
    });
  }

  // Generate 2048-bit RSA DKIM key pair
  const generateKeyPairAsync = promisify(generateKeyPair);

  const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  const publicKeyFlattened = flattenKey(publicKey);
  const privateKeyFlattened = flattenKey(privateKey);

  // Generate DNS records for user to add to their DNS provider
  const records: DomainRecord[] = generateEmailDomainRecords(recordName, publicKeyFlattened);

  const encryptedPrivateKey = symmetricEncrypt({
    key: encryptionKey,
    data: privateKeyFlattened,
  });

  // Verify domain with SES if configured
  await verifyDomainWithDKIM(cleanDomain, selector, privateKeyFlattened).catch((err) => {
    if (err.name === 'AlreadyExistsException') {
      throw new AppError(AppErrorCode.ALREADY_EXISTS, {
        message: 'Domain already exists in SES',
      });
    }

    console.warn('[Email Domain] AWS SES identity creation warning:', err?.message || err);
  });

  const emailDomain = await prisma.emailDomain.create({
    data: {
      id: generateDatabaseId('email_domain'),
      domain: cleanDomain,
      status: EmailDomainStatus.PENDING,
      organisationId,
      selector: recordName,
      publicKey: publicKeyFlattened,
      privateKey: encryptedPrivateKey,
    },
    select: {
      id: true,
      status: true,
      organisationId: true,
      domain: true,
      selector: true,
      publicKey: true,
      createdAt: true,
      updatedAt: true,
      lastVerifiedAt: true,
      emails: true,
    },
  });

  return {
    emailDomain,
    records,
  };
};
