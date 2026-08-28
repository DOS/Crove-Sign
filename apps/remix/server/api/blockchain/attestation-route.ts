import {
  getAttestationPackage,
  verifyDocumentBuffer,
} from '@documenso/lib/server-only/blockchain/verify-attestation';
import { Hono } from 'hono';

export const attestationRoute = new Hono()
  /**
   * Retrieve verifiable EAS Attestation Package for an envelope
   */
  .get('/:envelopeId', async (c) => {
    const envelopeId = c.req.param('envelopeId');

    if (!envelopeId) {
      return c.json({ success: false, message: 'Envelope ID is required' }, 400);
    }

    try {
      const attestation = await getAttestationPackage(envelopeId);

      if (!attestation) {
        return c.json(
          { success: false, message: 'No on-chain attestation record found for this envelope' },
          404,
        );
      }

      return c.json(
        {
          success: true,
          attestation,
        },
        200,
      );
    } catch (error) {
      console.error(`[Attestation API] Error fetching attestation for ${envelopeId}:`, error);
      return c.json(
        { success: false, message: error instanceof Error ? error.message : 'Internal server error' },
        500,
      );
    }
  })

  /**
   * Verify an uploaded PDF file or binary payload against cryptographic attestations
   */
  .post('/verify', async (c) => {
    try {
      const contentType = c.req.header('content-type') || '';

      let buffer: Buffer;

      if (contentType.includes('multipart/form-data')) {
        const body = await c.req.parseBody();
        const file = body['file'];

        if (!file || !(file instanceof Blob || typeof (file as any).arrayBuffer === 'function')) {
          return c.json({ success: false, message: 'File is required in multipart form data' }, 400);
        }

        const arrayBuffer = await (file as Blob).arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
      } else {
        const arrayBuffer = await c.req.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
      }

      if (!buffer || buffer.length === 0) {
        return c.json({ success: false, message: 'Empty PDF payload provided' }, 400);
      }

      const result = await verifyDocumentBuffer(buffer);

      return c.json(
        {
          success: true,
          result,
        },
        200,
      );
    } catch (error) {
      console.error('[Attestation API] Error verifying document buffer:', error);
      return c.json(
        { success: false, message: error instanceof Error ? error.message : 'Internal server error' },
        500,
      );
    }
  });
