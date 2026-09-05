/**
 * Tests d'intégration — gestion des plans de salle (charts).
 * Identification par UUID pur (slug supprimé).
 * Les tests API utilisent apiFetch() via la page connectée.
 *
 * Note: les tests de création/suppression API requièrent que la migration
 * (DROP COLUMN slug) ait été exécutée sur le serveur. Ils sont automatiquement
 * skippés si l'API répond avec une erreur HTML (ancien serveur non déployé).
 */
import { test, expect } from '@playwright/test';
import { login, apiFetch } from './helpers.js';

async function requireNewApi(page, t) {
  const probe = await apiFetch(page, '/api/charts', {
    method: 'POST',
    body: JSON.stringify({ name: `probe-${Date.now()}` }),
  });
  if (probe.body?._raw) {
    t.skip('API non déployée (réponse HTML) — lance le deploy Ansible puis relance les tests');
    return null;
  }
  // Cleanup probe if created
  if (probe.status === 201 && probe.body?.id) {
    await apiFetch(page, `/api/charts/${probe.body.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'archived' }),
    });
    await apiFetch(page, `/api/charts/${probe.body.id}`, { method: 'DELETE' });
  }
  return true;
}

test.describe('Plans de salle', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('page /plans accessible avec le titre "Plans de salle"', async ({ page }) => {
    await page.goto('/plans');
    await expect(page.getByRole('heading', { name: 'Plans de salle' })).toBeVisible();
  });

  test('créer un plan via l\'UI → visible dans la liste', async ({ page }) => {
    await page.goto('/plans');

    const planName = `E2E-${Date.now()}`;

    const nameInput = page.getByPlaceholder('Nom du plan');
    await expect(nameInput).toBeVisible();
    await nameInput.fill(planName);

    await page.getByRole('button', { name: 'Créer le plan' }).click();

    // Le plan doit apparaître (first() pour éviter strict-mode si un ancien champ slug le duplique)
    await expect(page.getByText(planName).first()).toBeVisible({ timeout: 10_000 });

    // Nettoyage via API
    const plans = await apiFetch(page, '/api/charts');
    const created = plans.body?.find(p => p.name === planName);
    if (created) {
      await apiFetch(page, `/api/charts/${created.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'archived' }),
      });
      await apiFetch(page, `/api/charts/${created.id}`, { method: 'DELETE' });
    }
  });

  test('créer puis supprimer un plan archivé via API', async ({ page }) => {
    if (!await requireNewApi(page, test)) return;
    const name = `API-Delete-${Date.now()}`;

    const created = await apiFetch(page, '/api/charts', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    expect(created.status).toBe(201);
    const id = created.body.id;

    // Archiver
    const archived = await apiFetch(page, `/api/charts/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'archived' }),
    });
    expect(archived.status).toBe(200);
    expect(archived.body.status).toBe('archived');

    // Supprimer — le plan n'a pas d'events, doit réussir
    const deleted = await apiFetch(page, `/api/charts/${id}`, { method: 'DELETE' });
    expect(deleted.status).toBe(200);

    // Vérification : 404 désormais
    const fetched = await apiFetch(page, `/api/charts/${id}`);
    expect(fetched.status).toBe(404);
  });

  test('la réponse API n\'inclut pas de champ slug', async ({ page }) => {
    if (!await requireNewApi(page, test)) return;
    const name = `NoSlug-${Date.now()}`;
    const res = await apiFetch(page, '/api/charts', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    expect(res.status).toBe(201);

    const plan = res.body;
    // UUID présent et valide
    expect(plan.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    // Pas de slug
    expect('slug' in plan).toBe(false);

    // Nettoyage
    await apiFetch(page, `/api/charts/${plan.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'archived' }),
    });
    await apiFetch(page, `/api/charts/${plan.id}`, { method: 'DELETE' });
  });

  test('renommer un plan via API met à jour le nom', async ({ page }) => {
    if (!await requireNewApi(page, test)) return;
    const original = `Rename-${Date.now()}`;
    const renamed  = `${original}-v2`;

    const res = await apiFetch(page, '/api/charts', {
      method: 'POST',
      body: JSON.stringify({ name: original }),
    });
    expect(res.status).toBe(201);
    const id = res.body.id;

    const updated = await apiFetch(page, `/api/charts/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name: renamed }),
    });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe(renamed);

    // Nettoyage
    await apiFetch(page, `/api/charts/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'archived' }),
    });
    await apiFetch(page, `/api/charts/${id}`, { method: 'DELETE' });
  });
});
