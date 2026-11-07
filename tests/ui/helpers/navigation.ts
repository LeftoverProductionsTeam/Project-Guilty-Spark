import type { Page } from '@playwright/test';
export async function openStudioMenu(page: Page) {
  const menu=page.locator('.gs-studio-menu');
  if(await menu.getAttribute('open')===null)await menu.getByLabel('Studio options',{exact:true}).click();
  return menu;
}
export async function openViewMenu(page: Page) {
  const menu=page.locator('.gs-view-menu');
  if(await menu.getAttribute('open')===null)await menu.getByLabel('View and window options',{exact:true}).click();
  return menu;
}
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
  await page.getByRole('button', { name: 'Toggle workspace navigation', exact: true }).waitFor({state:'visible'});
  const drawer = page.locator('.gs-navigation-drawer');
  if (!(await drawer.isVisible()))
    await page.getByRole('button', { name: 'Toggle workspace navigation', exact: true }).click();
  await drawer.getByRole('button', { name, exact: true }).click();
}

/** A real File/New gesture, shared by browser and embedded Windows acceptance. */
export async function createMultiplayerMap(page:Page,title:string,runtime='mccSteam'){
 await page.getByLabel('File menu',{exact:true}).click();
 await page.getByRole('menuitem',{name:'New',exact:true}).click();
 await page.getByRole('menuitem',{name:'Multiplayer Map',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'New Multiplayer Map',exact:true});
 await dialog.getByLabel('New map name',{exact:true}).fill(title);
 await dialog.getByLabel('New map runtime',{exact:true}).selectOption(runtime);
 await dialog.getByLabel('New map template',{exact:true}).selectOption('customBlank');
 await dialog.getByRole('button',{name:'Create editable map',exact:true}).click();
 await dialog.waitFor({state:'hidden',timeout:180000});
}
