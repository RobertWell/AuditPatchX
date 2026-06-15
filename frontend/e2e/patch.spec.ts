import { test, expect } from '@playwright/test';

// Uses real k8s data — AGENT_DEMO exists, NONEXISTENT-PW-E2E does not.

test.describe('Patch Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // h1 is the page title (sidebar also has "Patch Management" as a nav item — use level:1)
    await expect(page.getByRole('heading', { name: 'Patch Management', level: 1 })).toBeVisible();

    // Select table
    await page.locator('[class*="SelectTrigger"], [role="combobox"]').first().click();
    await page.getByText('TRDMGMR.AGENT_MGMT').click();
  });

  test('fetches an existing row and shows diff view', async ({ page }) => {
    await page.getByPlaceholder('AGENT_ID').fill('AGENT_DEMO');
    await page.getByRole('button', { name: /FETCH/i }).click();

    // Diff view appears
    await expect(page.getByText('Diff View')).toBeVisible();
    // Approve button disabled (no changes yet)
    await expect(page.getByRole('button', { name: /Approve/i })).toBeDisabled();
    // Reject button visible
    await expect(page.getByRole('button', { name: /Reject/i })).toBeVisible();
  });

  test('activates INSERT MODE for a non-existent PK', async ({ page }) => {
    await page.getByPlaceholder('AGENT_ID').fill('NONEXISTENT-PW-E2E');
    await page.getByRole('button', { name: /FETCH/i }).click();

    // INSERT MODE badge and title
    await expect(page.getByText('INSERT MODE')).toBeVisible();
    await expect(page.getByText('Insert New Record')).toBeVisible();
    // Button reads "Insert Record", not "Approve Change"
    await expect(page.getByRole('button', { name: /Insert Record/i })).toBeVisible();
    // No Reject button in insert mode
    await expect(page.getByRole('button', { name: /Reject/i })).not.toBeVisible();
    // AGENT_ID pre-filled with the entered PK
    await expect(page.getByText('NONEXISTENT-PW-E2E')).toBeVisible();
  });
});
