/**
 * Flow complet souscription — doit s'exécuter EN DERNIER (préfixe zzz-)
 * car il active un plan et changerait l'état pour les autres specs.
 *
 * Pré-conditions :
 *   - globalSetup a réinitialisé l'abonnement (aucun plan actif)
 *   - E2E_PASSWORD défini
 *
 * Ce test passe par la vraie page Stripe (test mode).
 * Il utilise la carte Stripe de test : 4242 4242 4242 4242
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

async function fillStripeCard(page) {
  // Stripe peut rendre les champs dans des iframes ou directement
  const cardInput = page.getByPlaceholder(/1234 1234 1234 1234|card number/i).first();
  if (await cardInput.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await cardInput.fill('4242424242424242');
    await page.getByPlaceholder(/MM \/ YY|expir/i).first().fill('12 / 30');
    await page.getByPlaceholder(/CVC|CVV/i).first().fill('123');
    return true;
  }

  // Fallback iframe
  const frame = page.frameLocator('iframe').first();
  const iframeCard = frame.getByRole('textbox', { name: /card number|numéro/i });
  if (await iframeCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await iframeCard.fill('4242424242424242');
    await frame.getByRole('textbox', { name: /expir/i }).fill('12 / 30');
    await frame.getByRole('textbox', { name: /cvc|cvv/i }).fill('123');
    return true;
  }

  return false;
}

test.describe('Flow complet souscription Base', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Commencer Base → checkout Stripe → retour → plan actif', async ({ page }) => {
    await page.goto('/subscription');

    // Vérifier qu'aucun plan n'est actif (sinon globalSetup n'a pas fonctionné)
    const alreadyActive = await page.getByText(/actif/i).isVisible({ timeout: 3_000 }).catch(() => false);
    if (alreadyActive) {
      console.warn('[zzz-flow] Un plan est déjà actif — le reset global-setup a peut-être échoué');
    }

    // Cliquer Commencer sur Base
    const btn = page.getByRole('button', { name: /commencer/i }).first();
    await expect(btn).toBeVisible({ timeout: 5_000 });

    const stripeNav = page.waitForURL(/checkout\.stripe\.com|stripe\.com/, { timeout: 20_000 });
    await btn.click();
    await stripeNav;
    expect(page.url()).toContain('stripe.com');

    // --- Page Stripe ---

    // Stripe Link OTP (si proposé)
    const otpInput = page.locator('[data-testid="otp-input"], input[inputmode="numeric"][maxlength="1"]').first();
    if (await otpInput.isVisible({ timeout: 6_000 }).catch(() => false)) {
      await otpInput.click();
      await page.keyboard.type('000000');
      await page.waitForTimeout(1_500);
    }

    // Ignorer Link si proposé
    const skipLink = page.getByRole('button', { name: /pay without link|continuer sans link|not now/i })
      .or(page.getByText(/pay without link|continuer sans link/i));
    if (await skipLink.isVisible({ timeout: 4_000 }).catch(() => false)) {
      await skipLink.click();
      await page.waitForTimeout(1_000);
    }

    // Remplir la carte Stripe 4242
    const cardFilled = await fillStripeCard(page);
    if (!cardFilled) {
      test.skip('Impossible de localiser les champs carte Stripe — UI Stripe a changé');
      return;
    }

    // Nom sur la carte (optionnel selon le flow)
    const cardName = page.getByPlaceholder(/full name|nom/i).first();
    if (await cardName.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await cardName.fill('Tody Raza');
    }

    // Soumettre
    const saveBtn = page.getByRole('button', { name: /^save$|^enregistrer$|^confirmer$/i });
    if (await saveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await saveBtn.click();
    } else {
      await page.getByRole('button', { name: /submit|payer|pay/i }).first().click();
    }

    // Retour sur /subscription?success=1
    await page.waitForURL(/\/subscription/, { timeout: 30_000 });

    // Attendre que le webhook active le plan (quelques secondes)
    await page.waitForTimeout(4_000);
    await page.reload();

    // Le plan Base doit être actif
    await expect(page.getByText(/base/i).first()).toBeVisible();
    await expect(page.getByText(/actif/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/aucun plan actif/i)).not.toBeVisible();
  });
});
