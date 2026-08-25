import crypto from 'node:crypto';
import { jobsClient } from '@documenso/lib/jobs/client';
import { handleDosWebhookEvent } from '@documenso/lib/server-only/dos-id/handle-dos-webhook';
import { verifyDosWebhookSignature } from '@documenso/lib/server-only/dos-id/verify-dos-signature';
import { env } from '@documenso/lib/utils/env';
import { Hono } from 'hono';

// In-memory idempotency cache (TTL: 10 minutes)
const processedEventIds = new Map<string, number>();
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

const isDuplicateEvent = (eventId: string): boolean => {
  const now = Date.now();

  // Clean expired entries
  for (const [id, timestamp] of processedEventIds.entries()) {
    if (now - timestamp > IDEMPOTENCY_TTL_MS) {
      processedEventIds.delete(id);
    }
  }

  if (processedEventIds.has(eventId)) {
    return true;
  }

  processedEventIds.set(eventId, now);
  return false;
};

export const dosWebhookRoute = new Hono()
  .post('/dos-org-sync', async (c) => {
    const signatureHeader = c.req.header('x-dos-signature') ?? null;
    const webhookSecret = env('CROVE_DOS_WEBHOOK_SECRET') || env('NEXT_PRIVATE_DOS_WEBHOOK_SECRET') || '';

    const rawBody = await c.req.text();

    if (webhookSecret) {
      const isValid = verifyDosWebhookSignature({
        rawBody,
        signatureHeader,
        secret: webhookSecret,
      });

      if (!isValid) {
        return c.json({ success: false, message: 'Invalid webhook signature' }, 401);
      }
    }

    try {
      const payload = JSON.parse(rawBody);
      const eventId =
        payload.id ||
        payload.event_id ||
        payload.eventId ||
        crypto.createHash('sha256').update(rawBody).digest('hex').slice(0, 32);

      // Idempotency check: avoid duplicate execution for identical payloads in a 10-minute window
      if (isDuplicateEvent(eventId)) {
        return c.json(
          {
            success: true,
            message: 'Webhook event already processed (idempotent)',
            eventId,
          },
          200,
        );
      }

      const jobsProvider = env('NEXT_PRIVATE_JOBS_PROVIDER');

      // If BullMQ or Inngest queue provider is configured, dispatch via persistent queue
      if (jobsProvider === 'bullmq' || jobsProvider === 'inngest') {
        await jobsClient.triggerJob({
          name: 'internal.process-dos-webhook',
          payload: {
            ...payload,
            eventId,
          },
        });

        return c.json(
          {
            success: true,
            message: 'Webhook event received and enqueued for persistent processing',
            eventId,
          },
          200,
        );
      }

      // Synchronous execution fallback (local / dev mode)
      const result = await handleDosWebhookEvent(payload);
      return c.json(result, result.success ? 200 : 400);
    } catch (error) {
      console.error('[DOS Webhook] Error processing payload:', error);
      return c.json(
        { success: false, message: error instanceof Error ? error.message : 'Internal Server Error' },
        500,
      );
    }
  });
