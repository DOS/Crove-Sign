import { handleDosWebhookEvent } from '@documenso/lib/server-only/dos-id/handle-dos-webhook';
import { verifyDosWebhookSignature } from '@documenso/lib/server-only/dos-id/verify-dos-signature';
import { env } from '@documenso/lib/utils/env';
import { Hono } from 'hono';

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
