import type { Page } from '@playwright/test';
export async function openDrawer(page: Page, name: string) {
  const panel=page.getByRole('region',{name:`${name} panel`,exact:true});
  if(await panel.isVisible())return;
  const overflow=page.locator('.gs-panel-overflow');
  if(await overflow.isVisible()) {
    if(await overflow.getAttribute('open')===null) await overflow.locator('summary').click();
    await overflow.getByRole('menuitemcheckbox',{name,exact:true}).click();
  } else await page.getByRole('button',{name:`Toggle ${name}`,exact:true}).click();
}
export async function chooseTool(page: Page, name: string) {
  const drawer = page.locator('.gs-navigation-drawer');
  if (!(await drawer.isVisible()))
    await page.getByRole('button', { name: 'Toggle workspace navigation', exact: true }).click();
  await drawer.getByRole('button', { name, exact: true }).click();
}
