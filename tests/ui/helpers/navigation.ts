import type { Page } from '@playwright/test';
export async function chooseTool(page: Page, name: string) {
  const drawer = page.locator('.gs-navigation-drawer');
  if (!(await drawer.isVisible()))
    await page.getByRole('button', { name: 'Toggle workspace navigation', exact: true }).click();
  await drawer.getByRole('button', { name, exact: true }).click();
}
