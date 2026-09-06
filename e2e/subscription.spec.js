import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

test.describe('Abonnement', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('lien "Abonnement" visible dans la sidebar', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Abonnement' })).toBeVisible({ timeout: 8_000 });
  });

  test('page /subscription accessible et affiche les 3 plans', async ({ page }) => {
    await page.goto('/subscription');
    await expect(page.getByText('Base').first()).toBeVisible();
    await expect(page.getByText('Plus').first()).toBeVisible();
    await expect(page.getByText('Max').first()).toBeVisible();
  });

  test('page /subscription affiche les prix annuels', async ({ page }) => {
    await page.goto('/subscription');
    await expect(page.getByText('300 €')).toBeVisible();
    await expect(page.getByText('575 €')).toBeVisible();
  });

  test('page /subscription affiche soit un plan actif soit le bouton Commencer', async ({ page }) => {
    await page.goto('/subscription');
    await page.waitForTimeout(1_500); // laisser Vue charger

    const hasActif     = await page.getByText(/actif/i).isVisible().catch(() => false);
    const hasCommencer = await page.getByRole('button', { name: /commencer/i }).first().isVisible().catch(() => false);

    expect(hasActif || hasCommencer).toBe(true);
  });

  test('cliquer Commencer sur Base redirige vers Stripe', async ({ page }) => {
    await page.goto('/subscription');
    await page.waitForTimeout(1_500);

    const btn = page.getByRole('button', { name: /commencer/i }).first();
    const hasBtn = await btn.isVisible({ timeout: 4_000 }).catch(() => false);

    if (!hasBtn) {
      test.skip('Un plan est déjà actif — redirection Stripe non testable');
      return;
    }

    const stripeNav = page.waitForURL(/checkout\.stripe\.com|stripe\.com/, { timeout: 20_000 });
    await btn.click();
    await stripeNav;
    expect(page.url()).toContain('stripe.com');
  });

  test('page /billing accessible et affiche la section Facturation', async ({ page }) => {
    await page.goto('/billing');
    await expect(page.getByRole('heading', { name: 'Facturation' })).toBeVisible();
    await page.waitForSelector('[class*="animate-pulse"]', { state: 'hidden', timeout: 10_000 }).catch(() => {});
    const empty = await page.getByText('Aucune facture disponible').isVisible().catch(() => false);
    const table = await page.locator('table').isVisible().catch(() => false);
    expect(empty || table).toBe(true);
  });

  test('sans plan actif : banner d\'accueil avec lien vers /subscription', async ({ page }) => {
    await page.goto('/');
    const banner = page.getByText(/aucun plan actif/i);
    const hasBanner = await banner.isVisible({ timeout: 5_000 }).catch(() => false);
    if (hasBanner) {
      const link = page.getByRole('link', { name: /choisir un plan/i });
      await expect(link).toBeVisible();
      await link.click();
      await expect(page).toHaveURL(/\/subscription/);
    }
  });
});
