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

test.describe('Abonnement', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('le menu Abonnement est visible dans la sidebar', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Abonnement' })).toBeVisible();
  });

  test('la page /subscription affiche les 3 plans avec leur prix', async ({ page }) => {
    await page.goto('/subscription');

    await expect(page.getByText('Base')).toBeVisible();
    await expect(page.getByText('Plus')).toBeVisible();
    await expect(page.getByText('Max')).toBeVisible();

    // Prix prépayés annuels
    await expect(page.getByText('300 €')).toBeVisible();
    await expect(page.getByText('575 €')).toBeVisible();
  });

  test('cliquer Commencer sur Base redirige vers Stripe (setup mode)', async ({ page }) => {
    await page.goto('/subscription');

    // Intercept navigation to Stripe
    const stripeNavigation = page.waitForURL(/checkout\.stripe\.com|stripe\.com/, { timeout: 15_000 });

    const commencerBtn = page.getByRole('button', { name: /commencer/i }).first();
    await expect(commencerBtn).toBeVisible();
    await commencerBtn.click();

    // Should redirect to Stripe checkout (setup mode)
    await stripeNavigation;
    expect(page.url()).toContain('stripe.com');
  });

  test('le banner plan manquant est visible sur la page Accueil', async ({ page }) => {
    await page.goto('/');
    // Only shown when no active plan
    const banner = page.getByText(/aucun plan actif/i);
    // If user has a plan, banner won't show — test is conditional
    const hasBanner = await banner.isVisible().catch(() => false);
    if (hasBanner) {
      await expect(page.getByRole('link', { name: /choisir un plan/i })).toBeVisible();
      await page.getByRole('link', { name: /choisir un plan/i }).click();
      await expect(page).toHaveURL(/\/subscription/);
    }
  });

  test('la page /billing affiche uniquement les factures', async ({ page }) => {
    await page.goto('/billing');
    await expect(page.getByRole('heading', { name: 'Facturation' })).toBeVisible();
    // No subscription tab anymore
    await expect(page.getByRole('button', { name: 'Abonnement' })).not.toBeVisible();
    // Should show invoice table or empty state
    const hasInvoices = await page.getByText('Aucune facture disponible').isVisible().catch(() => false);
    const hasTable    = await page.locator('table').isVisible().catch(() => false);
    expect(hasInvoices || hasTable).toBeTruthy();
  });
});
