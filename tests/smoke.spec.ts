import { test, expect } from '@playwright/test';

// Smoke test: is the system up at all? It checks that a user can open the page and
// see real data from the API. Business rules are out of scope here - see docs/SPEC.md.
test('home page loads and shows the balance from the API', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('Quick Transfer');
  await expect(page.getByRole('heading', { name: 'Quick Transfer' })).toBeVisible();

  // The balance comes from GET /api/accounts/:id through the Vite proxy. A title alone
  // would pass even with the API down; seeing the seeded balance proves both servers work.
  await expect(page.getByTestId('balance')).toHaveText('30,000 TWD');
});
