import { resolveSoa, resolveTxt } from 'node:dns/promises';
import { z } from 'zod';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { externalOperationSemaphore } from './concurrency';
import { MAX_DNS_QUERIES_PER_VERIFICATION } from './constants';

/**
 * c-ares reports "the authoritative server says this name/type does not exist"
 * with these codes.
 *
 * Everything else — SERVFAIL, timeouts, refused queries, malformed responses,
 * socket errors — means we never got an answer, which says nothing about whether
 * the record is published.
 */
const AUTHORITATIVE_NEGATIVE_DNS_ERROR_CODES: ReadonlySet<string> = new Set(['ENOTFOUND', 'ENODATA']);

const ZDnsErrorSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

export type DnsReadOutcome<TValue> =
  | { kind: 'answered'; value: TValue }
  | { kind: 'absent'; code: string }
  | { kind: 'unavailable'; code: string; detail: string };

export type DnsQueryBudget = {
  remaining: number;
};

export const createDnsQueryBudget = (): DnsQueryBudget => ({
  remaining: MAX_DNS_QUERIES_PER_VERIFICATION,
});

const describeDnsError = (error: unknown): { code: string; detail: string } => {
  const parsed = ZDnsErrorSchema.safeParse(error);

  if (!parsed.success) {
    return { code: 'UNKNOWN', detail: 'Unrecognised DNS failure' };
  }

  return {
    code: parsed.data.code ?? 'UNKNOWN',
    detail: parsed.data.message ?? 'DNS resolution failed',
  };
};

const consumeDnsQuery = (budget: DnsQueryBudget): void => {
  if (budget.remaining <= 0) {
    throw new AppError(AppErrorCode.LIMIT_EXCEEDED, {
      message: `Refusing to issue more than ${MAX_DNS_QUERIES_PER_VERIFICATION} DNS queries for one verification.`,
    });
  }

  budget.remaining -= 1;
};

/**
 * Re-join the chunks of a single TXT answer.
 *
 * RFC 1035 caps one character-string at 255 octets, so a long DKIM key is
 * published as several strings inside one record and resolvers hand them back as
 * an array. Concatenating them is the only way to read the value as published.
 */
export const flattenTxtRecord = (chunks: string[]): string => {
  return chunks.join('');
};

export const readTxtRecords = async (name: string, budget: DnsQueryBudget): Promise<DnsReadOutcome<string[][]>> => {
  consumeDnsQuery(budget);

  try {
    const value = await externalOperationSemaphore.run(() => resolveTxt(name));

    return { kind: 'answered', value };
  } catch (error) {
    const { code, detail } = describeDnsError(error);

    if (AUTHORITATIVE_NEGATIVE_DNS_ERROR_CODES.has(code)) {
      return { kind: 'absent', code };
    }

    return { kind: 'unavailable', code, detail };
  }
};

export type StartOfAuthorityState = 'resolved' | 'absent' | 'unavailable';

/**
 * Probe the zone apex so that an NXDOMAIN for a required name can be told apart
 * from a resolver that cannot answer anything at all.
 */
export const readStartOfAuthorityState = async (
  name: string,
  budget: DnsQueryBudget,
): Promise<StartOfAuthorityState> => {
  consumeDnsQuery(budget);

  try {
    await externalOperationSemaphore.run(() => resolveSoa(name));

    return 'resolved';
  } catch (error) {
    const { code } = describeDnsError(error);

    if (AUTHORITATIVE_NEGATIVE_DNS_ERROR_CODES.has(code)) {
      return 'absent';
    }

    return 'unavailable';
  }
};
