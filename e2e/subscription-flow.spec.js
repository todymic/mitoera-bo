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

// Helper : remplit la carte Stripe dans l'iframe checkout
async function fillStripeCard(page) {
  // Stripe Checkout embarque un iframe pour les champs carte
  const cardFrame = page.frameLocator('iframe[name*="card-number"], iframe[title*="Secure card"], iframe').first();

  // Champ numéro de carte
  const cardNumber = cardFrame.getByRole('textbox', { name: /card number|numéro/i });
  if (await cardNumber.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await cardNumber.fill('4242424242424242');
    await cardFrame.getByRole('textbox', { name: /expir/i }).fill('12 / 30');
    await cardFrame.getByRole('textbox', { name: /cvc|cvv/i }).fill('123');
  }
}

test.describe('Flow complet souscription Base', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Commencer Base → Stripe setup → retour → plan actif', async ({ page }) => {
    await page.goto('/subscription');

    // Aucun plan actif : banner orange visible
    await expect(page.getByText(/aucun plan actif/i)).toBeVisible();

    // Cliquer Commencer sur Base
    const commencer = page.getByRole('button', { name: /commencer/i }).first();
    await expect(commencer).toBeVisible();

    // Intercepter la redirection vers Stripe
    const stripeUrl = page.waitForURL(/checkout\.stripe\.com|stripe\.com/, { timeout: 15_000 });
    await commencer.click();
    await stripeUrl;

    expect(page.url()).toContain('stripe.com');

    // Stripe Link OTP : attendre que la popup apparaisse, taper 000000 chiffre par chiffre
    const otpFirstBox = page.locator('[data-testid="otp-input"], input[inputmode="numeric"], input[maxlength="1"]').first();
    if (await otpFirstBox.isVisible({ timeout: 8_000 }).catch(() => false)) {
      // Cliquer le premier champ et taper le code
      await otpFirstBox.click();
      await page.keyboard.type('000000');
      await page.waitForTimeout(2_000);
    } else {
      // Fallback : cliquer "Pay without Link" directement
      const payBtn = page.getByRole('link', { name: /pay without link/i })
        .or(page.getByText(/pay without link/i));
      await payBtn.click({ timeout: 8_000 });
      await page.waitForTimeout(1_500);
    }

    // Remplir la carte test Stripe 4242
    const cardInput = page.getByPlaceholder(/1234|card number/i).first();
    if (await cardInput.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await cardInput.fill('4242424242424242');
      await page.getByPlaceholder(/MM \/ YY|expir/i).first().fill('12 / 30');
      await page.getByPlaceholder(/CVC|CVV/i).first().fill('123');
    } else {
      await fillStripeCard(page);
    }

    await page.waitForTimeout(500);

    // Cardholder name si requis
    const cardholderName = page.getByPlaceholder(/full name on card/i)
      .or(page.getByLabel(/cardholder name/i));
    if (await cardholderName.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await cardholderName.fill('Tody Raza');
    }

    // Soumettre avec "Save"
    await page.getByRole('button', { name: /^save$/i }).click({ timeout: 5_000 });

    // Attendre le retour sur /subscription?success=1
    await page.waitForURL(/\/subscription/, { timeout: 30_000 });

    // Attendre que le webhook active le plan (peut prendre quelques secondes)
    await page.waitForTimeout(3_000);
    await page.reload();

    // Le plan Base doit être actif
    await expect(page.getByText(/base/i).first()).toBeVisible();
    await expect(page.getByText(/actif/i)).toBeVisible();

    // Le banner "aucun plan actif" doit avoir disparu
    await expect(page.getByText(/aucun plan actif/i)).not.toBeVisible();
  });
});
