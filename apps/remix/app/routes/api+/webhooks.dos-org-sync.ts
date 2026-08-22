import { handleDosWebhookEvent } from '@documenso/lib/server-only/dos-id/handle-dos-webhook';
import { verifyDosWebhookSignature } from '@documenso/lib/server-only/dos-id/verify-dos-signature';
import { env } from '@documenso/lib/utils/env';

export const action = async ({ request }: { request: Request }) => {
  if (request.method !== 'POST') {
    return Response.json({ success: false, message: 'Method not allowed' }, { status: 405 });
  }

  const signatureHeader = request.headers.get('x-dos-signature');
  const webhookSecret = env('CROVE_DOS_WEBHOOK_SECRET') || env('NEXT_PRIVATE_DOS_WEBHOOK_SECRET') || '';

  const rawBody = await request.text();

  if (webhookSecret) {
    const isValid = verifyDosWebhookSignature({
      rawBody,
      signatureHeader,
      secret: webhookSecret,
    });

    if (!isValid) {
      return Response.json({ success: false, message: 'Invalid webhook signature' }, { status: 401 });
    }
  }

  try {
    const payload = JSON.parse(rawBody);
    const result = await handleDosWebhookEvent(payload);

    return Response.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error('[DOS Webhook] Error processing payload:', error);
    return Response.json(
      { success: false, message: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 },
    );
  }
};
