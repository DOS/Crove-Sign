import { SESv2Client } from '@aws-sdk/client-sesv2';
import { z } from 'zod';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { env } from '../../utils/env';
import { logger } from '../../utils/logger';
import { externalOperationSemaphore } from './concurrency';

export type SesServiceConfiguration = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};

const ZAwsErrorSchema = z.object({
  name: z.string().optional(),
  // Socket and resolver failures from Node carry their reason in `code` rather
  // than `name`, so both have to be read to classify a failure at all.
  code: z.string().optional(),
  message: z.string().optional(),
  $metadata: z
    .object({
      httpStatusCode: z.number().optional(),
      requestId: z.string().optional(),
    })
    .optional(),
});

/**
 * Retries and account-level pauses are transient from our point of view: the
 * request may well succeed unchanged, so nothing about the domain's DNS can be
 * inferred from them.
 */
const TRANSIENT_SES_ERROR_NAMES: ReadonlySet<string> = new Set([
  'TooManyRequestsException',
  'ThrottlingException',
  'ConcurrentModificationException',
  'AccountSendingPausedException',
]);

/**
 * Failures that mean no HTTP response was ever received.
 *
 * This list is deliberately narrow. An error with no status code that is *not*
 * one of these — a TypeError from our own code, an SDK misuse, an unrecognised
 * exception — is a defect rather than an outage, and retrying it as though the
 * network had hiccuped would turn a bug into an endless loop.
 */
const TRANSIENT_NETWORK_ERROR_NAMES: ReadonlySet<string> = new Set([
  'TimeoutError',
  'NetworkingError',
  'RequestTimeout',
  'RequestTimeoutException',
  'ServiceUnavailable',
  'AbortError',
  'EAI_AGAIN',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'EPROTO',
  'ETIMEDOUT',
]);

export const readSesServiceConfiguration = (): SesServiceConfiguration | null => {
  const accessKeyId = env('NEXT_PRIVATE_SES_ACCESS_KEY_ID');
  const secretAccessKey = env('NEXT_PRIVATE_SES_SECRET_ACCESS_KEY');
  const region = env('NEXT_PRIVATE_SES_REGION');

  if (!accessKeyId || !secretAccessKey || !region) {
    return null;
  }

  return { accessKeyId, secretAccessKey, region };
};

export const assertSesServiceConfigured = (): SesServiceConfiguration => {
  const configuration = readSesServiceConfiguration();

  if (!configuration) {
    throw new AppError(AppErrorCode.NOT_SETUP, {
      message: 'Amazon SES is not configured. Set the NEXT_PRIVATE_SES_* access key, secret key and region variables.',
      userMessage: 'Custom sending domains are not available on this installation.',
    });
  }

  return configuration;
};

let cachedClient: { signature: string; client: SESv2Client } | null = null;

/**
 * The client is cached against the credentials it was built with so that a
 * rotated key or region takes effect without a restart, and so that repeated
 * verification passes do not each build a fresh HTTP agent.
 */
export const getSesClient = (): SESv2Client => {
  const configuration = assertSesServiceConfigured();
  const signature = `${configuration.region}:${configuration.accessKeyId}`;

  if (cachedClient && cachedClient.signature === signature) {
    return cachedClient.client;
  }

  const client = new SESv2Client({
    region: configuration.region,
    credentials: {
      accessKeyId: configuration.accessKeyId,
      secretAccessKey: configuration.secretAccessKey,
    },
    maxAttempts: 3,
  });

  cachedClient = { signature, client };

  return client;
};

export const withSesClient = async <TResult>(
  operation: (client: SESv2Client) => Promise<TResult>,
): Promise<TResult> => {
  const client = getSesClient();

  return await externalOperationSemaphore.run(() => operation(client));
};

export type AwsErrorDetails = {
  name: string;
  code: string | null;
  message: string;
  requestId: string | null;
  httpStatusCode: number | null;
};

export const describeAwsError = (error: unknown): AwsErrorDetails => {
  const parsed = ZAwsErrorSchema.safeParse(error);

  if (!parsed.success) {
    return {
      name: 'UnknownError',
      code: null,
      message: 'Unrecognised Amazon SES failure',
      requestId: null,
      httpStatusCode: null,
    };
  }

  return {
    name: parsed.data.name ?? 'UnknownError',
    code: parsed.data.code ?? null,
    message: parsed.data.message ?? 'Amazon SES returned no message',
    requestId: parsed.data.$metadata?.requestId ?? null,
    httpStatusCode: parsed.data.$metadata?.httpStatusCode ?? null,
  };
};

export const isSesErrorName = (error: unknown, name: string): boolean => {
  return describeAwsError(error).name === name;
};

/**
 * A failure is transient when SES told us to retry, when it returned a 5xx, or
 * when a recognisable network-level error stopped us getting any HTTP response.
 */
export const isTransientSesError = (error: unknown): boolean => {
  const { name, code, httpStatusCode } = describeAwsError(error);

  if (TRANSIENT_SES_ERROR_NAMES.has(name) || TRANSIENT_NETWORK_ERROR_NAMES.has(name)) {
    return true;
  }

  if (code !== null && TRANSIENT_NETWORK_ERROR_NAMES.has(code)) {
    return true;
  }

  if (httpStatusCode === null) {
    return false;
  }

  return httpStatusCode >= 500;
};

/**
 * SES failures are logged in full — including the AWS request id, which is the
 * only thing AWS support can act on — and reduced to a generic message for the
 * client, since SES messages can carry account identifiers and quota details.
 */
export const logSesError = (action: string, error: unknown): void => {
  const { name, message, requestId, httpStatusCode } = describeAwsError(error);

  logger.error({
    msg: 'email_domain_ses_error',
    action,
    errorName: name,
    errorMessage: message,
    awsRequestId: requestId,
    httpStatusCode,
  });
};

export const toSesAppError = (action: string, error: unknown): AppError => {
  logSesError(action, error);

  const errorCode = isTransientSesError(error) ? AppErrorCode.RETRY_EXCEPTION : AppErrorCode.UNKNOWN_ERROR;

  return new AppError(errorCode, {
    message: `Amazon SES refused to ${action}.`,
    userMessage: 'We could not set up this domain with our email provider. Please try again later.',
  });
};
