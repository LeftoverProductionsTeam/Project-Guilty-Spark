import type { Page } from '@playwright/test';
export async function chooseTool(page: Page, name: string) {
  if (await page.locator('#gs-window-header').isVisible())
    await page.getByRole('button', { name: 'Close window header', exact: true }).click();
  const drawer = page.locator('.gs-navigation-drawer');
  if (!(await drawer.isVisible()))
    await page.getByRole('button', { name: 'Toggle workspace navigation', exact: true }).click();
  await drawer.getByRole('button', { name, exact: true }).click();
}
