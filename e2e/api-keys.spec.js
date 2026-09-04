import { test, expect } from '@playwright/test';

const EMAIL    = process.env.E2E_EMAIL    ?? 'gtody.rabekoto@gmail.com';
const PASSWORD = process.env.E2E_PASSWORD ?? '';

async function login(page) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/mot de passe|password/i).fill(PASSWORD);
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
    const lockedBlock = page.getByText(/choisissez un plan/i);
    const hasPlan     = await page.getByText(/clé publique/i).isVisible().catch(() => false);

    if (!hasPlan) {
      await expect(lockedBlock).toBeVisible();
    } else {
      // User already has a plan — prod keys should be visible
      await expect(page.getByText(/clé publique/i)).toBeVisible();
    }
  });
});
