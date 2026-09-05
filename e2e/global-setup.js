import { chromium } from '@playwright/test';

const EMAIL    = process.env.E2E_EMAIL    ?? 'gtody.rabekoto@gmail.com';
const PASSWORD = process.env.E2E_PASSWORD ?? '';
const BASE_URL = process.env.E2E_BASE_URL ?? 'https://bo.mitoera.com';

export default async function globalSetup() {
  const browser = await chromium.launch();
  const page    = await browser.newPage();

  // Login pour obtenir le cookie JWT
  await page.goto(`${BASE_URL}/login`);
  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole('button', { name: /connexion|se connecter/i }).click();
  await page.waitForURL(`${BASE_URL}/`, { timeout: 15_000 });

  // Récupérer le token depuis le localStorage
  const token = await page.evaluate(() => localStorage.getItem('bo_jwt') ?? '');

  // Appeler l'endpoint de reset (sandbox uniquement)
  const E2E_SECRET = process.env.E2E_RESET_SECRET ?? '';
  if (token && E2E_SECRET) {
    const resp = await page.request.post(`${BASE_URL}/api/billing/test/reset`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-E2E-Secret': E2E_SECRET,
      },
    });
    console.log(`[global-setup] reset subscription: HTTP ${resp.status()}`);
  } else {
    console.log('[global-setup] skip reset: token=%s secret=%s', !!token, !!E2E_SECRET);
  }

  await browser.close();
}
