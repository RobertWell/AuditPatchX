import { test, expect } from '@playwright/test';

test.describe('Compare Job', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Compare Job' }).click();
    await expect(page.getByRole('heading', { name: 'Comparison Configuration' })).toBeVisible();
  });

  test('direction swap exchanges source and target', async ({ page }) => {
    const inputs = page.getByRole('textbox');
    await inputs.nth(0).fill('TRDMGMR.TRANSACTIONS');
    await inputs.nth(1).fill('TRDMGMR_UAT.TRANSACTIONS');

    await page.getByTitle('Reverse Sync Direction').click();

    await expect(inputs.nth(0)).toHaveValue('TRDMGMR_UAT.TRANSACTIONS');
    await expect(inputs.nth(1)).toHaveValue('TRDMGMR.TRANSACTIONS');
  });

  test('PK filter inputs appear for each sync PK column', async ({ page }) => {
    const inputs = page.getByRole('textbox');
    await inputs.nth(0).fill('TRDMGMR.RECON_MULTI_PK');
    await inputs.nth(1).fill('TRDMGMR_UAT.RECON_MULTI_PK');
    await inputs.nth(2).fill('BATCH_ID, REGION_CODE, EFFECTIVE_TS');

    // One filter input per PK column
    await expect(page.getByPlaceholder('any').nth(0)).toBeVisible();
    await expect(page.getByPlaceholder('any').nth(1)).toBeVisible();
    await expect(page.getByPlaceholder('any').nth(2)).toBeVisible();
  });

  test('Run Comparison is disabled until tables and PK are filled', async ({ page }) => {
    const run = page.getByRole('button', { name: 'Run Comparison' });
    await expect(run).toBeDisabled();

    const inputs = page.getByRole('textbox');
    await inputs.nth(0).fill('TRDMGMR.TRANSACTIONS');
    await inputs.nth(1).fill('TRDMGMR.TRANSACTIONS');
    // Still disabled — PK not set
    await expect(run).toBeDisabled();

    await inputs.nth(2).fill('TRANSACTION_ID');
    await expect(run).toBeEnabled();
  });

  test('comparing a table with itself shows no differences', async ({ page }) => {
    const inputs = page.getByRole('textbox');
    await inputs.nth(0).fill('TRDMGMR.AGENT_MGMT');
    await inputs.nth(1).fill('TRDMGMR.AGENT_MGMT');
    await inputs.nth(2).fill('AGENT_ID');

    await page.getByRole('button', { name: 'Run Comparison' }).click();

    // Placeholder text — no rows to review
    await expect(page.getByText('Run a comparison to view the differences here.')).toBeVisible();
  });
});
