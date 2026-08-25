import { handleDosWebhookEvent } from '../../../server-only/dos-id/handle-dos-webhook';
import type { JobRunIO } from '../../client/_internal/job';
import type { TProcessDosWebhookJobDefinition } from './process-dos-webhook';

export const run = async ({
  payload,
  io,
}: {
  payload: TProcessDosWebhookJobDefinition;
  io: JobRunIO;
}) => {
  io.logger.info(`[DOS Webhook Job] Processing event: ${payload.event} (id: ${payload.eventId || 'n/a'})`);

  const result = await handleDosWebhookEvent(payload);

  if (!result.success) {
    io.logger.error(`[DOS Webhook Job] Event processing failed: ${result.message}`);
    throw new Error(`[DOS Webhook Job] Failed: ${result.message}`);
  }

  io.logger.info(`[DOS Webhook Job] Successfully processed event: ${payload.event}`);

  return {
    success: true,
    message: result.message,
  };
};
