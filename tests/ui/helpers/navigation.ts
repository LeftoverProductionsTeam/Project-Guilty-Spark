import type { Page, Locator } from '@playwright/test';
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
    await overflow.getByRole('menu',{name:'Workspace drawers',exact:true}).waitFor({state:'visible'});
    const command=overflow.getByRole('menuitemcheckbox',{name,exact:true,includeHidden:true});await revealPagedControl(command);await command.click();
  } else await page.getByRole('button',{name:`Toggle ${name}`,exact:true}).click();
}
export async function chooseTool(page: Page, name: string) {
  await page.getByRole('button', { name: 'Toggle workspace navigation', exact: true }).waitFor({state:'visible'});
  const drawer = page.locator('.gs-navigation-drawer');
  if (!(await drawer.isVisible()))
    await page.getByRole('button', { name: 'Toggle workspace navigation', exact: true }).click();
  const command=drawer.getByRole('button', { name, exact: true, includeHidden:true });
  await revealPagedControl(command);await command.click();
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

/** Use the same visible page controls as a creator; no forced clicks or DOM edits. */
export async function revealPagedControl(target:Locator){
 await target.waitFor({state:'attached',timeout:10000});
 await target.page().evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 if(await target.isVisible())return;
 const surface=target.locator('xpath=ancestor::*[@data-surface][1]');
 if(!await surface.count())throw Error('Hidden control has no paged ancestor: '+target);
 const pages=Number(await surface.getAttribute('data-pages'));
 const input=surface.locator(':scope > .gs-surface-pages input[type=number]');
 if(!await input.isVisible())throw Error('Paged ancestor has no visible page input: '+JSON.stringify({surface:await surface.getAttribute('data-surface'),pages,inputCount:await input.count(),target:await target.evaluate(node=>({label:node.getAttribute('aria-label'),offpage:node.hasAttribute('data-gs-offpage'),inert:(node as HTMLElement).inert,details:[...function*(node:Element|null):Generator<Element>{while(node){if(node instanceof HTMLDetailsElement)yield node;node=node.parentElement;}}(node)].map(node=>({class:node.className,open:(node as HTMLDetailsElement).open}))}))}));
 const search=surface.locator(':scope > .gs-surface-pages > input[type=search]');
 if(await search.isVisible()){
  const label=await target.evaluate(node=>(node.getAttribute('aria-label')||node.closest('label')?.textContent||node.textContent||node.getAttribute('title')||'').trim().slice(0,160));
  if(label){await search.fill(label);await surface.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));if(await target.isVisible()){await search.fill('');return;}}
  await search.fill('');
 }
 for(let page=1;page<=Math.min(pages,4096);page++){
  await input.fill(String(page));
  await surface.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  if(await target.isVisible())return;
 }
 throw Error('Control remained hidden after actual page navigation: '+JSON.stringify({surface:await surface.getAttribute('data-surface'),pages,page:await surface.getAttribute('data-page')}));
}
