import { test, expect } from '@playwright/test';
test('browser preview states native boundaries and navigates workspaces', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Browser preview', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your worlds, reimagined.' })).toBeVisible();
  await page.getByRole('button', { name: 'Tag editor', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose a world to work on' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings & tools', exact: true }).click();
  await expect(page.getByText('Live editing · AI replication · VR')).toBeVisible();
  await page.getByRole('button', { name: 'Map library', exact: false }).first().click();
  await page.getByRole('button', { name: 'Import map or archive', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('desktop application');
});
test('preservation and runtime workspaces disclose unavailable evidence without fake controls', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Compare variants', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Import two map variants' })).toBeVisible();
  await page.getByRole('button', { name: 'Runtimes & friends', exact: true }).click();
  await expect(
    page.getByText('Runtime discovery and file hashing require the desktop application.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh reports', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Live Lab', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Disconnected · no live bridge implemented' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Connect|Spawn|Dispatch/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open Build & playtest', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose a world to work on' })).toBeVisible();
});
test('help modal traps focus and restores it after Escape', async ({ page }) => {
  await page.goto('/');
  const help = page.getByRole('button', { name: 'Help & shortcuts' });
  await help.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Back to the workbench' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close help' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(help).toBeFocused();
});
