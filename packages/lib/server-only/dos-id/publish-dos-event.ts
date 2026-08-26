import { jobs } from '../../jobs/client';
import { env } from '../../utils/env';

export type PublishDosEventOptions = {
  event: string;
  data: Record<string, unknown>;
};

/**
 * Dispatch an ecosystem business event to api.dos.me Event Router (e.g. contract.signed, contract.completed).
 * This runs asynchronously via BullMQ / Inngest background queue without blocking caller.
 */
export const publishDosEcosystemEvent = async ({ event, data }: PublishDosEventOptions) => {
  try {
    const jobsProvider = env('NEXT_PRIVATE_JOBS_PROVIDER');

    if (jobsProvider === 'bullmq' || jobsProvider === 'inngest') {
      await jobs.triggerJob({
        name: 'internal.publish-dos-event',
        payload: {
          event,
          data,
        },
      });
    } else {
      // In local dev without Redis, trigger in background with fetch
      const dosApiUrl = env('DOS_API_URL') || 'https://api.dos.me';
      const apiKey = env('DOS_INTERNAL_API_KEY') || env('NEXT_PRIVATE_DOS_INTERNAL_API_KEY') || '';

      void fetch(`${dosApiUrl}/internal/events/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'X-API-Key': apiKey } : {}),
        },
        body: JSON.stringify({
          event,
          data: {
            ...data,
            source: 'crove_sign',
            timestamp: new Date().toISOString(),
          },
        }),
        signal: AbortSignal.timeout(5000),
      }).catch((err) => {
        console.warn('[DOS Event Publisher] Direct fetch fallback failed:', err?.message || err);
      });
    }
  } catch (err) {
    console.warn('[DOS Event Publisher] Failed to enqueue event:', err);
  }
};
