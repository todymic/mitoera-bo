/**
 * Shared helpers for E2E integration tests.
 */

export const EMAIL    = process.env.E2E_EMAIL    ?? 'gtody.rabekoto@gmail.com';
export const PASSWORD = process.env.E2E_PASSWORD ?? '';
export const BASE_URL = process.env.E2E_BASE_URL ?? 'https://bo.mitoera.com';

/**
 * Log in via the UI and wait until the dashboard is reached.
 */
export async function login(page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole('button', { name: /connexion|se connecter/i }).click();
  await page.waitForURL('/', { timeout: 15_000 });
}

/**
 * Returns the JWT stored in localStorage after login.
 */
export async function getToken(page) {
  return page.evaluate(() => localStorage.getItem('bo_jwt') ?? '');
}

/**
 * Make an authenticated API call from the page context.
 * Returns the parsed JSON response.
 */
export async function apiFetch(page, path, options = {}) {
  return page.evaluate(
    async ({ path, options }) => {
      const token = localStorage.getItem('bo_jwt') ?? '';
      const res = await fetch(path, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(options.headers ?? {}),
        },
      });
      const text = await res.text();
      let body = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = { _raw: text }; }
      return { status: res.status, body };
    },
    { path, options },
  );
}
