import { expect, test } from '@playwright/test';

// Smoke: the stack is up, registration works end-to-end, and the seeded
// published track is visible on the dashboard.
test('register a candidate and land on the dashboard with the seeded track', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Name').fill('Smoke Candidate');
  await page.getByLabel('Email').fill(`smoke-${Date.now()}@e2e.local`);
  await page.getByLabel('Password').fill('password-123');
  await page.getByRole('button', { name: /register|create|sign up/i }).click();

  await page.waitForURL('**/dashboard');
  await expect(page.getByText('E2E Journey Track')).toBeVisible();
});
