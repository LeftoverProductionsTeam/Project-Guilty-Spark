import { test, expect } from '@playwright/test';
test('browser preview states native boundaries and navigates workspaces', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Browser preview', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your worlds, reimagined.' })).toBeVisible();
  await page.getByRole('button', { name: 'Tag editor', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose a world to work on' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings & runtimes', exact: true }).click();
  await expect(page.getByText('Live editing · AI replication · VR')).toBeVisible();
  await page.getByRole('button', { name: 'Map library', exact: false }).first().click();
  await page.getByRole('button', { name: 'Import map', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('desktop application');
});
