/**
 * Playwright globalSetup — s'exécute UNE FOIS avant tous les tests.
 *
 * Réinitialise l'abonnement du compte de test pour que les specs
 * subscription.spec.js et zzz-subscription-flow.spec.js partent
 * d'un état sans plan actif.
 *
 * Variables d'environnement requises :
 *   E2E_EMAIL          (défaut: gtody.rabekoto@gmail.com)
 *   E2E_PASSWORD       mot de passe du compte de test
 *   E2E_BASE_URL       (défaut: https://bo.mitoera.com)
 *   E2E_RESET_SECRET   secret partagé avec l'endpoint /api/billing/test/reset
 */
import { chromium } from '@playwright/test';

const EMAIL      = process.env.E2E_EMAIL      ?? 'gtody.rabekoto@gmail.com';
const PASSWORD   = process.env.E2E_PASSWORD   ?? '';
const BASE_URL   = process.env.E2E_BASE_URL   ?? 'https://bo.mitoera.com';
const E2E_SECRET = process.env.E2E_RESET_SECRET ?? '';

export default async function globalSetup() {
  if (!PASSWORD) {
    console.warn('[global-setup] E2E_PASSWORD non défini — reset abonnement ignoré');
    return;
  }

  const browser = await chromium.launch();
  const page    = await browser.newPage();

  try {
    await page.goto(`${BASE_URL}/login`);
    await page.locator('input[type="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.getByRole('button', { name: /connexion|se connecter/i }).click();
    await page.waitForURL(`${BASE_URL}/`, { timeout: 20_000 });

    const token = await page.evaluate(() => localStorage.getItem('bo_jwt') ?? '');

    if (!token) {
      console.warn('[global-setup] token introuvable après login — reset ignoré');
      return;
    }

    if (!E2E_SECRET) {
      console.warn('[global-setup] E2E_RESET_SECRET non défini — reset ignoré');
      return;
    }

    const resp = await page.request.post(`${BASE_URL}/api/billing/test/reset`, {
      headers: {
        Authorization:   `Bearer ${token}`,
        'Content-Type':  'application/json',
        'X-E2E-Secret':  E2E_SECRET,
      },
    });
    console.log(`[global-setup] reset abonnement → HTTP ${resp.status()}`);
  } catch (err) {
    console.error('[global-setup] erreur:', err.message);
  } finally {
    await browser.close();
  }
}
