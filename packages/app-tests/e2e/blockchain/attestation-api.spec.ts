import { expect, test } from '@playwright/test';

test.describe('[Blockchain Attestation & Verification Portal]: /articles/verify-document & /api/v1/attestation', () => {
  test('should render /articles/verify-document page with upload dropzone', async ({ page }) => {
    await page.goto('/articles/verify-document');

    await expect(page).toHaveTitle(/Verify Document/);
    await expect(page.getByText('Document Integrity Verification')).toBeVisible();
    await expect(page.getByText('Upload Final PDF')).toBeVisible();
  });

  test('should reject verify API request with empty payload', async ({ request }) => {
    const response = await request.post('/api/v1/attestation/verify', {
      data: Buffer.from(''),
      headers: {
        'Content-Type': 'application/pdf',
      },
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should return NOT_FOUND for unknown mock PDF file verification', async ({ request }) => {
    const mockPdf = Buffer.from('%PDF-1.4 Mock Unknown File Content ' + Date.now());

    const response = await request.post('/api/v1/attestation/verify', {
      data: mockPdf,
      headers: {
        'Content-Type': 'application/pdf',
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.result.status).toBe('NOT_FOUND');
    expect(body.result.isValid).toBe(false);
    expect(body.result.documentHash).toBeDefined();
  });

  test('should return 404 for non-existent envelope anchor', async ({ request }) => {
    const response = await request.get('/api/v1/attestation/non_existent_envelope_id_123');

    expect(response.status()).toBe(404);
    const data = await response.json();
    expect(data.success).toBe(false);
  });
});
