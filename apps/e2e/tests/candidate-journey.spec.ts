import { expect, test, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Spec §9: enroll → complete day → reading + quiz → coding submit → result page.
// Runs against the REAL stack (api, BullMQ worker, next) with the Judge0 stub.

const fixtures = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../.fixtures.json'), 'utf8'),
) as { inviteCode: string };

const EMAIL = `journey-${Date.now()}@e2e.local`;

async function register(page: Page): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('Name').fill('Journey Candidate');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill('password-123');
  await page.getByRole('button', { name: /register|create|sign up/i }).click();
  await page.waitForURL('**/dashboard');
}

// Answer every question by its correct option, then submit and wait for 100%.
// Options are shuffled per attempt, so select by accessible name within each
// question's radiogroup (clicking a stale .all() handle right after start
// silently drops the selection).
async function answerAllAndSubmit(page: Page, optionName: string): Promise<void> {
  const groups = page.getByRole('radiogroup');
  await groups.first().waitFor(); // questions render after the attempt starts
  const count = await groups.count();
  for (let i = 0; i < count; i++) {
    await groups.nth(i).getByRole('radio', { name: optionName }).click();
  }
  await expect(page.getByText(`${count}/${count} answered`)).toBeVisible();
  await page.getByRole('button', { name: /^submit$/i }).click();
  await expect(page.getByText(/score: 100%/i)).toBeVisible();
}

test('candidate journey: invite join → lesson → reading → quiz → coding → result', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await register(page);

  // Join the seeded cohort by invite code.
  await page.getByLabel('Invite code').fill(fixtures.inviteCode);
  await page.getByRole('button', { name: 'Join' }).click();
  await page.waitForURL('**/enrollments/**');

  // Day 1 unlocked with all four items visible.
  await expect(page.getByText('E2E Journey Track')).toBeVisible();
  const enrollmentUrl = page.url();

  // 1) Lesson: read → mark complete.
  await page.getByRole('link', { name: 'Lesson' }).click();
  await expect(page.getByText('Read me, then continue.')).toBeVisible();
  await page.getByRole('button', { name: /mark as complete/i }).click();
  await expect(page.getByText(/completed ✓/i)).toBeVisible();
  await page.goto(enrollmentUrl);

  // 2) Reading: material → comprehension questions → 100%.
  await page.getByRole('link', { name: 'Reading' }).click();
  await expect(page.getByText(/the sky in e2e-land is green/i)).toBeVisible();
  await page.getByRole('button', { name: /continue to questions/i }).click();
  await page.getByRole('button', { name: /start quiz/i }).click();
  await answerAllAndSubmit(page, 'Green');
  await page.goto(enrollmentUrl);

  // 3) Quiz: countdown ticks, answer Alpha on both, submit.
  await page.getByRole('link', { name: 'Quiz' }).click();
  await page.getByRole('button', { name: /start quiz/i }).click();
  await expect(page.getByText(/\d{2}:\d{2}/)).toBeVisible(); // countdown badge
  await answerAllAndSubmit(page, 'Alpha');
  await page.goto(enrollmentUrl);

  // 4) Coding: Monaco loads self-hosted (no CDN); starter code passes the stub.
  const externalRequests: string[] = [];
  page.on('request', (req) => {
    const url = req.url();
    // blob:/data: are in-page (Monaco's web workers) — only real network hosts matter.
    if (url.startsWith('blob:') || url.startsWith('data:')) return;
    const host = new URL(url).host;
    if (!host.includes('localhost') && !host.includes('127.0.0.1')) externalRequests.push(url);
  });
  await page.getByRole('link', { name: 'Coding' }).click();
  await expect(page.getByText('E2E Echo')).toBeVisible();
  // Monaco is real in the browser — wait for the editor surface, then submit
  // the seeded starter code through the real queue + worker + judge0 stub.
  await page.locator('.monaco-editor').first().waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: /^submit$/i }).click();
  // 'Passed' appears twice (status banner + per-case row); assert on the first.
  await expect(page.getByText('Passed').first()).toBeVisible({ timeout: 30_000 });
  // The exam editor must not depend on a CDN (P5 gate fix pinned end-to-end).
  expect(externalRequests).toEqual([]);

  // 5) All required items complete → worker finalizes → result page shows PASS.
  await page.goto(`${enrollmentUrl}/result`);
  // 'PASS' hero + 'Pass mark: 60%' both match — assert the exact verdict hero.
  await expect(page.getByText('PASS', { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/100/).first()).toBeVisible();
});
