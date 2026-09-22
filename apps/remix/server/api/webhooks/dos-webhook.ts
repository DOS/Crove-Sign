import crypto from 'node:crypto';
import { jobsClient } from '@documenso/lib/jobs/client';
import { handleDosWebhookEvent } from '@documenso/lib/server-only/dos-id/handle-dos-webhook';
import { verifyDosWebhookSignature } from '@documenso/lib/server-only/dos-id/verify-dos-signature';
import { env } from '@documenso/lib/utils/env';
import { prisma } from '@documenso/prisma';
import { Hono } from 'hono';

// In-memory idempotency cache (TTL: 10 minutes) - fast path only; durable
// markers live in the database so a redelivered event is not re-processed
// after a restart or on another replica.
const processedEventIds = new Map<string, number>();
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

const WEBHOOK_DEDUPE_ACTION = 'webhook.dos-dedupe';
// Fixed bucket: dedupe markers are permanent one-row-per-event records, not
// rate-limit counters. Purge rows with this action if the table ever needs
// trimming.
const WEBHOOK_DEDUPE_BUCKET = new Date('2020-01-01T00:00:00.000Z');

const isDuplicateEvent = async (eventId: string): Promise<boolean> => {
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

  // Durable marker: the in-memory cache above is lost on restart and is
  // per-replica, so without it a redelivered event (or an event replayed
  // from the queue after a crash) would be processed a second time -
  // including destructive events like org.deleted.
  const dedupeKey = `webhook-evt:${eventId}`;

  const existing = await prisma.rateLimit
    .findUnique({
      where: {
        key_action_bucket: {
          key: dedupeKey,
          action: WEBHOOK_DEDUPE_ACTION,
          bucket: WEBHOOK_DEDUPE_BUCKET,
        },
      },
    })
    .catch(() => null);

  processedEventIds.set(eventId, now);

  if (existing) {
    return true;
  }

  // A lost create race across replicas only weakens dedupe for that single
  // event; dedupe stays fail-open rather than blocking the webhook.
  await prisma.rateLimit
    .create({
      data: {
        key: dedupeKey,
        action: WEBHOOK_DEDUPE_ACTION,
        bucket: WEBHOOK_DEDUPE_BUCKET,
        count: 1,
      },
    })
    .catch(() => null);

  return false;
};

export const dosWebhookRoute = new Hono().post('/dos-org-sync', async (c) => {
  const signatureHeader = c.req.header('x-dos-signature') ?? null;
  const webhookSecret = env('CROVE_DOS_WEBHOOK_SECRET') || env('NEXT_PRIVATE_DOS_WEBHOOK_SECRET') || '';

  const rawBody = await c.req.text();

  let eventName = '';

  try {
    eventName = (JSON.parse(rawBody).event || '').toString().toLowerCase();
  } catch {
    eventName = '';
  }

  const isPingEvent = eventName === 'ping' || eventName === 'test' || eventName === 'endpoint.test';

  // Fail-closed: the webhook handler performs privileged mutations
  // (organisation deletion, member role grants), so it must never run
  // without a configured shared secret. Only the connectivity ping is
  // allowed through so the Developer Portal health check still reports
  // that the endpoint is reachable but unconfigured.
  if (!webhookSecret) {
    if (isPingEvent) {
      return c.json(
        {
          success: false,
          message: 'Webhook secret is not configured; events will be rejected. Set CROVE_DOS_WEBHOOK_SECRET.',
          eventId: 'unconfigured',
        },
        200,
      );
    }

    return c.json(
      {
        success: false,
        message: 'Webhook endpoint is not configured to process events',
      },
      503,
    );
  }

  const isValid = verifyDosWebhookSignature({
    rawBody,
    signatureHeader,
    secret: webhookSecret,
  });

  if (!isValid) {
    return c.json({ success: false, message: 'Invalid webhook signature' }, 401);
  }

  try {
    const payload = JSON.parse(rawBody);
    const eventId =
      payload.id ||
      payload.event_id ||
      payload.eventId ||
      crypto.createHash('sha256').update(rawBody).digest('hex').slice(0, 32);

    console.log(`[DOS Webhook] Received event: ${eventName} (id: ${eventId})`);

    // Immediate synchronous response for ping/test events from Developer Portal
    if (eventName === 'ping' || eventName === 'test' || eventName === 'endpoint.test') {
      return c.json(
        {
          success: true,
          message: 'Pong! Webhook endpoint is active and verified.',
          eventId,
        },
        200,
      );
    }

    // Idempotency check: avoid duplicate execution for identical payloads in a 10-minute window
    if (await isDuplicateEvent(eventId)) {
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
    return c.json({ success: false, message: 'Internal Server Error' }, 500);
  }
});
