/**
 * Tests E2E : switch prod ↔ sandbox
 * Vérifie que les pages /plans et /events affichent des données
 * filtrées par le bon workspace dès le premier chargement (sans reload manuel).
 */
import { test, expect } from '@playwright/test';
import { login, apiFetch } from './helpers.js';

test.describe('Switch de mode prod/sandbox', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('/plans — switch prod→sandbox filtre les plans sans reload', async ({ page }) => {
    // 1. Aller sur /plans en mode prod
    await page.goto('/plans');
    await expect(page.getByRole('heading', { name: 'Plans de salle' })).toBeVisible();

    // Récupère le workspaceId prod depuis le token JWT
    const tokenProd = await page.evaluate(() => localStorage.getItem('bo_jwt') ?? '');
    const payloadProd = JSON.parse(atob(tokenProd.split('.')[1]));
    const wsProd = payloadProd.workspaceId;

    // 2. Switch vers sandbox en cliquant sur le toggle
    // switchMode() fait window.location.reload() → on attend la navigation
    const switchBtn = page.locator('button', { hasText: /sandbox|prod/i }).first();
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20_000 }),
      switchBtn.click(),
    ]);

    // Attendre que le heading réapparaisse (page chargée)
    await expect(page.getByRole('heading', { name: 'Plans de salle' })).toBeVisible({ timeout: 10_000 });

    // 3. Vérifier que le token a changé (nouveau workspaceId sandbox)
    const tokenSandbox = await page.evaluate(() => localStorage.getItem('bo_jwt') ?? '');
    expect(tokenSandbox).not.toBe(tokenProd);
    const payloadSandbox = JSON.parse(atob(tokenSandbox.split('.')[1]));
    expect(payloadSandbox.workspaceId).not.toBe(wsProd);

    // 4. Vérifier que les plans affichés appartiennent au workspace sandbox
    const plans = await apiFetch(page, '/api/charts');
    expect(plans.status).toBe(200);
    // Chaque plan retourné doit appartenir au workspace sandbox, pas prod
    for (const plan of (plans.body ?? [])) {
      expect(plan.workspaceId ?? plan.workspace_id ?? payloadSandbox.workspaceId)
        .not.toBe(wsProd);
    }
  });

  test('/events — switch prod→sandbox filtre les events sans reload', async ({ page }) => {
    // 1. Aller sur /events en mode prod
    await page.goto('/events');
    await expect(page.getByRole('heading', { name: /événements/i })).toBeVisible();

    const tokenProd = await page.evaluate(() => localStorage.getItem('bo_jwt') ?? '');
    const payloadProd = JSON.parse(atob(tokenProd.split('.')[1]));
    const wsProd = payloadProd.workspaceId;

    // Compter les events prod
    const eventsProd = await apiFetch(page, '/api/events');
    const countProd = (eventsProd.body ?? []).length;

    // 2. Switch (switchMode → window.location.reload)
    const switchBtn = page.locator('button', { hasText: /sandbox|prod/i }).first();
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20_000 }),
      switchBtn.click(),
    ]);

    await expect(page.getByRole('heading', { name: /événements/i })).toBeVisible({ timeout: 10_000 });

    // 3. Vérifier que le token a changé
    const tokenSandbox = await page.evaluate(() => localStorage.getItem('bo_jwt') ?? '');
    expect(tokenSandbox).not.toBe(tokenProd);
    const payloadSandbox = JSON.parse(atob(tokenSandbox.split('.')[1]));
    expect(payloadSandbox.workspaceId).not.toBe(wsProd);

    // 4. Les events sandbox (souvent vides en sandbox) ne doivent pas égaler ceux de prod
    const eventsSandbox = await apiFetch(page, '/api/events');
    expect(eventsSandbox.status).toBe(200);
    // Si prod a des events et sandbox est vide, le count doit différer
    // (ou au minimum le token doit pointer sur un workspace différent — déjà vérifié ci-dessus)
    const countSandbox = (eventsSandbox.body ?? []).length;
    // Le test passe si les counts diffèrent, ou s'ils sont tous les deux vides
    // Le cas d'erreur serait countSandbox === countProd alors que les workspaces diffèrent
    if (countProd > 0) {
      expect(countSandbox).toBeLessThan(countProd);
    }
  });
});
