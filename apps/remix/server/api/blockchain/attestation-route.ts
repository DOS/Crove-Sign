import {
  verifyDocumentByQrToken,
  verifyDocumentFile,
} from '@documenso/lib/server-only/blockchain/verify-attestation';
import { prisma } from '@documenso/prisma';
import { Hono } from 'hono';

export const attestationRoute = new Hono()
  /**
   * GET /api/v1/attestation/:envelopeId
   * Retrieve blockchain anchor and attestation evidence for an envelope
   */
  .get('/:envelopeId', async (c) => {
    const envelopeId = c.req.param('envelopeId');

    if (!envelopeId) {
      return c.json({ success: false, message: 'Envelope ID is required' }, 400);
    }

    try {
      const anchor = await prisma.blockchainAnchor.findFirst({
        where: { envelopeId },
        orderBy: { createdAt: 'desc' },
      });

      if (!anchor) {
        return c.json(
          { success: false, message: 'No blockchain anchor record found for this envelope' },
          404,
        );
      }

      return c.json(
        {
          success: true,
          anchor,
        },
        200,
      );
    } catch (error) {
      console.error(`[Attestation API] Error fetching anchor for ${envelopeId}:`, error);
      return c.json(
        { success: false, message: error instanceof Error ? error.message : 'Internal Server Error' },
        500,
      );
    }
  })

  /**
   * POST /api/v1/attestation/verify
   * Verify an uploaded PDF file against blockchain attestations
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

      const result = await verifyDocumentFile(buffer);

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
        { success: false, message: error instanceof Error ? error.message : 'Internal Server Error' },
        500,
      );
    }
  })

  /**
   * GET /api/v1/attestation/qr/:qrToken
   * Resolve verification data from certificate QR code token
   */
  .get('/qr/:qrToken', async (c) => {
    const qrToken = c.req.param('qrToken');

    if (!qrToken) {
      return c.json({ success: false, message: 'QR Token is required' }, 400);
    }

    try {
      const result = await verifyDocumentByQrToken(qrToken);

      if (!result) {
        return c.json({ success: false, message: 'Document not found for this QR token' }, 404);
      }

      return c.json({ success: true, result }, 200);
    } catch (error) {
      console.error('[Attestation API] Error resolving QR token:', error);
      return c.json(
        { success: false, message: error instanceof Error ? error.message : 'Internal Server Error' },
        500,
      );
    }
  });
