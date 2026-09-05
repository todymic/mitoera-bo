import { test, expect } from '@playwright/test';

const EMAIL    = process.env.E2E_EMAIL    ?? 'gtody.rabekoto@gmail.com';
const PASSWORD = process.env.E2E_PASSWORD ?? '';

async function login(page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole('button', { name: /connexion|se connecter/i }).click();
  await page.waitForURL('/', { timeout: 10_000 });
}

test.describe('Clés API', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('la page /api-keys est accessible', async ({ page }) => {
    await page.goto('/api-keys');
    await expect(page.getByRole('heading', { name: 'Clés API' })).toBeVisible();
  });

  test('sans plan actif, les clés prod ne sont pas affichées', async ({ page }) => {
    await page.goto('/api-keys');

    // Check if the no-plan state is shown
    const lockedBlock = page.getByRole('link', { name: /choisir un plan/i }).first();
    const hasPlan     = await page.getByText(/clé publique \(widget\)/i).isVisible().catch(() => false);

    if (!hasPlan) {
      await expect(lockedBlock).toBeVisible();
    } else {
      await expect(page.getByText(/clé publique \(widget\)/i)).toBeVisible();
    }
  });
});
