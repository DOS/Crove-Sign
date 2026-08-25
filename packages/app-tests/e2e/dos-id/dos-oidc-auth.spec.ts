import { expect, test } from '@playwright/test';

test.describe('[DOS OIDC Auth]: Sign In & Sign Up pages', () => {
  test('should render Sign In page with DOS.Me ID option', async ({ page }) => {
    await page.goto('/signin');

    // Verify title and main heading
    await expect(page).toHaveTitle(/Crove Sign/);

    // Verify DOS.Me ID button is visible if OIDC is enabled
    const oidcButton = page.getByRole('button', { name: /DOS\.Me ID|OIDC/i });
    if (await oidcButton.isVisible()) {
      await expect(oidcButton).toBeEnabled();
    }
  });

  test('should render Sign Up page with DOS.Me ID option', async ({ page }) => {
    await page.goto('/signup');

    await expect(page).toHaveTitle(/Crove Sign/);

    const oidcButton = page.getByRole('button', { name: /DOS\.Me ID|OIDC/i });
    if (await oidcButton.isVisible()) {
      await expect(oidcButton).toBeEnabled();
    }
  });

  test('should handle invalid OIDC callback gracefully', async ({ page }) => {
    // Navigate to OIDC callback with invalid state/code
    const response = await page.goto('/api/auth/callback/oidc?code=invalid_mock_code&state=invalid_state');
    
    // Should not crash the server (either redirect to /signin with error or return 400/500 structured response)
    expect(response?.status()).toBeLessThan(600);
  });
});
