import { test, expect } from '@playwright/test';
import { EMAIL, login } from './helpers.js';

test.describe('Authentification', () => {
  test('login avec identifiants valides → dashboard', async ({ page }) => {
    await login(page);
    // On est sur la page d'accueil, pas sur /login
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page).toHaveURL('/');
  });

  test('mauvais mot de passe → reste sur /login', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"]').first().fill('mauvais-mot-de-passe-xyz');
    await page.getByRole('button', { name: /connexion|se connecter/i }).click();
    await page.waitForTimeout(2_000);
    await expect(page).toHaveURL(/\/login/);
  });

  test('accès direct à / sans être connecté → redirigé vers /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('logout → redirigé vers /login', async ({ page }) => {
    await login(page);
    const logoutBtn = page.getByRole('button', { name: /déconnexion|logout|quitter/i });
    if (await logoutBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await logoutBtn.click();
      await expect(page).toHaveURL(/\/login/);
    } else {
      await page.evaluate(() => localStorage.clear());
      await page.goto('/');
      await expect(page).toHaveURL(/\/login/);
    }
  });
});
