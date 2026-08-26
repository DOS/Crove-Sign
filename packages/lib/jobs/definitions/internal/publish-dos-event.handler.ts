import { env } from '../../../utils/env';
import type { JobRunIO } from '../../client/_internal/job';
import type { TPublishDosEventJobDefinition } from './publish-dos-event';

export const run = async ({
  payload,
  io,
}: {
  payload: TPublishDosEventJobDefinition;
  io: JobRunIO;
}) => {
  const { event, data } = payload;
  const dosApiUrl = env('DOS_API_URL') || 'https://api.dos.me';
  const apiKey = env('DOS_INTERNAL_API_KEY') || env('NEXT_PRIVATE_DOS_INTERNAL_API_KEY') || '';

  const endpoint = `${dosApiUrl}/internal/events/publish`;

  io.logger.info(`[DOS Event Publisher] Publishing event "${event}" to ${endpoint}`);

  try {
    const response = await fetch(endpoint, {
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
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      io.logger.warn(
        `[DOS Event Publisher] Failed with status ${response.status}: ${errorText}`,
      );
      // Don't crash worker if external event router returns non-200 in dev
      if (response.status >= 500) {
        throw new Error(`[DOS Event Publisher] HTTP ${response.status}: ${errorText}`);
      }
    } else {
      io.logger.info(`[DOS Event Publisher] Event "${event}" successfully published`);
    }

    return {
      success: true,
      status: response.status,
    };
  } catch (error) {
    io.logger.error('[DOS Event Publisher] Network error while publishing event:', error);
    throw error;
  }
};
