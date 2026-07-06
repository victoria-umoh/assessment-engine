import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Admin surface smoke against the seeded + journey-mutated database. Runs
// AFTER candidate-journey (alphabetical file order would break this — the
// journey file sorts first: 'admin-smoke' < 'auth-smoke' < 'candidate-journey'
// is false, so order is pinned by naming this file zz- in the testMatch...
// simpler: this spec only needs SEEDED data plus ANY candidate rows, and the
// dashboard/audit assertions below hold both before and after the journey.

const fixtures = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../.fixtures.json'), 'utf8'),
) as { cohortId: string };

test('admin overview, cohort dashboard (cached path), and audit trail render', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@e2e.local');
  await page.getByLabel('Password').fill('admin-password-1');
  await page.getByRole('button', { name: /sign in|log in|login/i }).click();
  await page.waitForURL('**/dashboard');

  // Overview stat cards with non-zero users.
  await page.goto('/admin');
  await expect(page.getByText(/users/i).first()).toBeVisible();

  // Cohort dashboard — this exercises the Redis-cached read path end-to-end.
  await page.goto(`/admin/cohorts/${fixtures.cohortId}`);
  await expect(page.getByText('E2E Cohort')).toBeVisible();
  await expect(page.getByText('E2E Journey Track')).toBeVisible();

  // Audit trail: the seed's admin mutations are recorded newest-first.
  await page.goto('/admin/audit');
  await expect(page.getByText(/POST/).first()).toBeVisible();
});
