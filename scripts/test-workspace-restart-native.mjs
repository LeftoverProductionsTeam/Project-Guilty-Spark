import { assertQaOutputPath } from './native-qa-storage.mjs';
// Same owned native profile across two genuine app processes. No mocked IPC,
// SDK copies, source leases granted by layout data, or simulated game evidence.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,expect as assertion} from '@playwright/test';
import {chooseTool,openDrawer,openViewMenu,openStudioMenu} from '../tests/ui/helpers/navigation.ts';
const args=process.argv.slice(2);
if(args.length!==2)throw Error('test-workspace-restart-native <embedded exe> <fresh evidence root>');
const [source,root]=args.map(p=>path.resolve(p)),expect=assertion.configure({timeout:45000});
await fs.mkdir(await assertQaOutputPath(root));const exe=path.join(root,'GuiltySpark-restart.exe');await fs.copyFile(source,exe,fs.constants.COPYFILE_EXCL);
const report={schemaVersion:1,appSha256:crypto.createHash('sha256').update(await fs.readFile(exe)).digest('hex'),mockedIpc:false,actualGamePlayed:false,complete:false,cases:[]};
const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
let child,browser;
const pages=()=>browser.contexts().flatMap(c=>c.pages()).filter(p=>p.url().includes('tauri.localhost'));
const call=(page,command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
async function start(){
  child=spawn(exe,[],{windowsHide:true,stdio:'ignore',env:{...process.env,GUILTY_SPARK_DATA_DIR:path.join(root,'library'),WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
  await expect.poll(()=>fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.ok,()=>false)).toBe(true);browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);await expect.poll(()=>pages().length).toBeGreaterThan(0);
  const main=pages()[0];await expect(main.getByRole('button',{name:'Close window',exact:true})).toBeVisible();return main;
}
async function work(page){const dialog=page.getByRole('dialog',{name:'Open work',exact:true});if(!await dialog.isVisible())await page.getByRole('button',{name:'Open work and workspace windows',exact:true}).click();return dialog;}
async function role(page,value){await(await work(page)).getByLabel('Workspace in this window',{exact:true}).selectOption(value);await expect(page.locator('.gs-workspace-shell')).toHaveAttribute('data-workspace',value==='quickforge'?'level':value);}
async function mapOpen(page,id){await chooseTool(page,'Map library');await page.locator(`.map-card[data-project-id="${id}"]`).click();await expect(page.locator('.map-tab.active')).toHaveAttribute('data-map-tab-id',id);await expect(page.locator('.gs-workspace-shell')).not.toHaveAttribute('data-workspace','library');}
async function editX(page,value){await expect(page.locator('.forge-viewport canvas')).toBeVisible();await expect(page.getByRole('menuitemcheckbox',{name:'Build tools',exact:true,includeHidden:true})).toBeAttached();await openDrawer(page,'Build tools');await page.getByRole('region',{name:'Build tools panel',exact:true}).locator('.forge-tree-select').first().click();await openDrawer(page,'Inspector');const inspector=page.getByRole('region',{name:'Inspector panel',exact:true});await inspector.getByRole('button',{name:'Properties',exact:true}).click();const field=inspector.getByRole('spinbutton',{name:'Position X',exact:true}).first();await field.fill(String(value));await field.press('Tab');await expect(field).toHaveValue(String(value));}
async function layoutMenu(page){const menu=page.locator('.gs-layout-menu');if(await menu.getAttribute('open')===null)await menu.locator('summary').click();return menu;}
const camera=(page,id)=>page.evaluate(id=>{const label=window.__TAURI_INTERNALS__.metadata.currentWindow.label;return JSON.parse(localStorage.getItem(`guilty-spark-map-session-v1:${id}:window:${label}`)??'{}')['bsp.view.top'];},id);
async function bspView(page,face,wheel,create=false){
  await role(page,'quickforge');await page.getByRole('button',{name:'BSP Workshop',exact:true}).click();
  if(create)await page.getByRole('button',{name:'Two rooms + corridor + ramp',exact:true}).click();
  const region=page.getByRole('region',{name:'Native BSP Workshop',exact:true});await expect(region).toBeVisible();
  await region.locator('.bsp-source-list button').first().click();await region.getByRole('button',{name:'Face',exact:true}).click();await region.getByLabel('BSP source face',{exact:true}).selectOption({index:face});
  const top=region.getByLabel('top orthographic editing view',{exact:true});await top.hover();await page.mouse.wheel(0,wheel);
  await expect(region).toHaveAttribute('data-selected-face',`face-${face-1}`);
  return {face:await region.getAttribute('data-selected-face'),brush:await region.getAttribute('data-selected-brush'),viewBox:await top.getAttribute('viewBox'),camera:await camera(page,await region.evaluate(()=>document.querySelector('.map-tab.active').getAttribute('data-map-tab-id')))};
}
async function expectBsp(page,id,expected){await mapOpen(page,id);await role(page,'quickforge');const region=page.getByRole('region',{name:'Native BSP Workshop',exact:true});await expect(region).toBeVisible();await expect(region).toHaveAttribute('data-selected-face',expected.face);await expect(region).toHaveAttribute('data-selected-brush',expected.brush);await expect.poll(()=>camera(page,id)).toEqual(expected.camera);}
const tabs=page=>page.locator('.map-tab[data-map-tab-id]').evaluateAll(nodes=>nodes.map(n=>({id:n.getAttribute('data-map-tab-id'),name:n.querySelector('.map-tab-title')?.textContent.trim()})));
async function stop(){if(browser){for(const page of pages().reverse()){if(!page.isClosed())await page.getByRole('button',{name:'Close window',exact:true}).click();}await expect.poll(()=>child.exitCode).not.toBe(null);await browser.close();browser=null;}}
try{
  let main=await start();const boot=await call(main,'bootstrap');await call(main,'save_settings',{settings:{...boot.settings,onboardingCompleted:true,autoBuild:false}});
  const projects=[];for(const suffix of ['A','B','C','D','E','F','G'])projects.push((await call(main,'create_quickforge_project',{title:`C69 restart ${suffix}`,template:'smallIndoorArena',target:'haloCustomEdition'})).project);
  const [a,b,c]=projects;report.projects=projects.map(p=>p.id);await main.reload();await mapOpen(main,a.id);await editX(main,.625);report.mainBsp=await bspView(main,1,-140,true);await main.keyboard.press('Control+s');await mapOpen(main,b.id);await role(main,'creator');await main.getByRole('tab',{name:'Custom power-ups',exact:true}).click();
  const before=new Set(pages());await call(main,'open_project_window',{id:a.id,workspace:'quickforge',observe:true,another:true});await expect.poll(()=>pages().filter(p=>!before.has(p)).length).toBe(1);const second=pages().find(p=>!before.has(p));await expect(second.getByRole('button',{name:'Close window',exact:true})).toBeVisible();report.childBsp=await bspView(second,2,-290);expect(report.childBsp).not.toEqual(report.mainBsp);
  await openDrawer(second,'Changes');await second.getByRole('button',{name:'Edit here',exact:true}).click();await expect.poll(async()=>(await call(second,'read_workspace_history',{projectId:a.id})).writable).toBe(true);
  await mapOpen(second,c.id);await role(second,'creator');await second.getByRole('tab',{name:'Cinematic timeline',exact:true}).click();
  await chooseTool(main,'Settings & tools');await main.getByRole('tab',{name:'Interface Studio',exact:true}).click();await main.getByRole('tab',{name:'Appearance',exact:true}).click();await main.getByRole('button',{name:/^Dark Glow/}).click();await main.getByRole('checkbox',{name:'Subtle workspace fades',exact:true}).uncheck();await main.getByRole('checkbox',{name:'Shield loading animation',exact:true}).uncheck();await main.getByRole('checkbox',{name:'Restore my saved workspace layout on launch',exact:true}).check();await role(main,'creator');
  await main.getByRole('button',{name:'Maximize window',exact:true}).click();await expect(main.locator('html')).toHaveAttribute('data-gs-maximized','true');
  await second.keyboard.press('F11');await expect(second.locator('.gs-workspace-shell')).toHaveAttribute('data-fullscreen','true');
  // Both windows contain independent tab sets and a different Creator pane.
  await expect.poll(async()=>(await call(main,'workspace_window_inventory')).filter(w=>w.project===c.id).length).toBe(1);
  const menu=await layoutMenu(main);await menu.getByLabel('Window layout name',{exact:true}).fill('Native restart');await menu.getByRole('button',{name:'Save workspace windows',exact:true}).click();await expect(main.getByRole('status').filter({hasText:'Saved “Native restart”'})).toBeVisible();
  report.before={layout:await call(main,'read_workspace_layout',{name:'Native restart'}),mainTabs:await tabs(main),childTabs:await tabs(second),history:await call(main,'read_workspace_history',{projectId:a.id}),childHistory:await call(second,'read_workspace_history',{projectId:a.id})};
  expect(report.before.mainTabs).toHaveLength(2);expect(report.before.childTabs).toHaveLength(2);
  expect(report.before.layout.windows[0].maximized).toBe(true);expect(report.before.layout.windows[1].fullscreen).toBe(true);
  expect(report.before.layout.windows.every(w=>w.view.places?.length===2)).toBe(true);
  expect(report.before.layout.windows[1].ownedDocuments).toContain(a.id);expect(report.before.layout.windows[0].ownedDocuments).not.toContain(a.id);
  await stop();report.cases.push('Both windows closed normally and their actual process exited');
  main=await start();await call(main,'bootstrap');await expect.poll(()=>pages().length).toBe(2);await expect(main.locator('html')).toHaveAttribute('data-gs-theme','dark-glow');await expect(main.locator('html')).toHaveAttribute('data-gs-workspace-transitions','false');await expect(main.locator('html')).toHaveAttribute('data-gs-shield-loading','false');
  let restored;await expect.poll(async()=>{for(const p of pages()){const inventory=await call(p,'workspace_window_inventory');const row=inventory.find(w=>w.current);if(row?.project===c.id)restored=p;}return !!restored;}).toBe(true);
  await expect.poll(async()=>(await tabs(restored)).map(t=>t.id)).toEqual(report.before.childTabs.map(t=>t.id));
  report.after={layout:await call(main,'save_workspace_layout',{name:'Native restart readback'}),mainTabs:await tabs(main),childTabs:await tabs(restored),history:await call(main,'read_workspace_history',{projectId:a.id})};
  expect(report.after.layout.windows.map(w=>w.view.documents)).toEqual(report.before.layout.windows.map(w=>w.view.documents));
  expect(report.after.mainTabs.map(t=>t.name)).toEqual(report.before.mainTabs.map(t=>t.name));expect(report.after.childTabs.map(t=>t.name)).toEqual(report.before.childTabs.map(t=>t.name));
  expect(report.after.layout.windows[0].maximized).toBe(true);expect(report.after.layout.windows[1].fullscreen).toBe(true);
  await expect(main.getByRole('tab',{name:'Custom power-ups',exact:true})).toHaveClass(/selected|active/);await expect(restored.getByRole('tab',{name:'Cinematic timeline',exact:true})).toHaveClass(/selected|active/);
  expect(report.after.history.history.head).toEqual(report.before.history.history.head);expect(report.after.history.history.snapshots).toEqual(report.before.history.history.snapshots);
  report.cases.push('Independent tab sets, active maps, Creator panes and authoritative source history survived process restart');
  report.headerLayout=await main.locator('#gs-window-header').evaluate(header=>{
    const rect=header.getBoundingClientRect(),list=header.querySelector('.map-tabs'),items=[...list.querySelectorAll('.map-tab')].map(el=>el.getBoundingClientRect()),tools=header.querySelector('#gs-header-workspace-tools').getBoundingClientRect(),lastTool=header.querySelector('.gs-layout-menu > summary').getBoundingClientRect();
    const children=[...header.children].map(el=>el.getBoundingClientRect()).filter(el=>el.width&&el.height);
    return {width:rect.width,tabStripWidth:list.getBoundingClientRect().width,tabSpan:items.at(-1).right-items[0].left,tabScrollExcess:list.scrollWidth-list.clientWidth,unusedToolTail:tools.right-lastTool.right,nonOverlapping:children.every((el,i)=>el.left>=rect.left-1&&el.right<=rect.right+1&&(!i||children[i-1].right<=el.left+1))};
  });
  expect(report.headerLayout.nonOverlapping).toBe(true);expect(report.headerLayout.tabScrollExcess).toBeLessThanOrEqual(1);expect(Math.abs(report.headerLayout.tabStripWidth-report.headerLayout.tabSpan)).toBeLessThanOrEqual(6);expect(report.headerLayout.unusedToolTail).toBeLessThanOrEqual(6);
  const selected=main.getByRole('tab',{name:'Custom power-ups',exact:true});await selected.blur();await main.mouse.move(1000,700);
  report.tabStyles=[];
  for(const theme of ['halo-ce','unsc','covenant','forerunner','dark-glow']){
    await main.evaluate(theme=>document.documentElement.dataset.gsTheme=theme,theme);
    const orbButton=main.getByRole('button',{name:'Toggle workspace navigation',exact:true});await orbButton.hover();
    await expect(orbButton).toHaveCSS('background-color','rgba(0, 0, 0, 0)');await expect(orbButton).toHaveCSS('background-image','none');await expect(orbButton).toHaveCSS('box-shadow','none');await main.mouse.move(1000,700);
    const styles=await main.locator('.studio-tabs > button.active,.map-tab.active').evaluateAll(nodes=>nodes.map(el=>{const s=getComputedStyle(el);return {className:el.className,background:s.backgroundImage,shadow:s.boxShadow,radius:s.borderRadius,borderWidths:[s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth],borderColors:[s.borderTopColor,s.borderRightColor,s.borderBottomColor,s.borderLeftColor],after:getComputedStyle(el,'::after').display};}));
    expect(styles).toHaveLength(2);
    for(const style of styles){expect(style.shadow).not.toMatch(/\)\s+2px\s+0px\s+0px\s+0px\s+inset/);expect(parseFloat(style.radius)).toBeLessThanOrEqual(5);expect(new Set(style.borderWidths).size).toBe(1);expect(new Set(style.borderColors).size).toBe(1);}
    report.tabStyles.push({theme,styles});
    if(theme==='covenant')await main.screenshot({path:path.join(root,'smooth-tabs-covenant.png')});
  }
  await main.screenshot({path:path.join(root,'restored-main.png')});await restored.screenshot({path:path.join(root,'restored-child.png')});
  await openViewMenu(main);const volume=main.getByRole('slider',{name:'Map sound volume',exact:true});await volume.fill('0.54');
  await main.screenshot({path:path.join(root,'view-menu.png')});await main.getByRole('button',{name:'Fullscreen editing',exact:true}).click();await expect(main.locator('html')).toHaveAttribute('data-gs-fullscreen','true');
  await openViewMenu(main);await expect(volume).toBeInViewport();await expect(volume).toHaveValue('0.54');await main.keyboard.press('Escape');await expect(main.getByLabel('View and window options',{exact:true})).toBeFocused();await main.keyboard.press('F11');await expect(main.locator('html')).toHaveAttribute('data-gs-fullscreen','false');
  report.cases.push('Compact View dropdown remains reachable in native fullscreen and preserves editor-only sound volume; Escape returns focus without changing source history');
  await restored.keyboard.press('F11');await expectBsp(main,a.id,report.mainBsp);await expectBsp(restored,a.id,report.childBsp);
  report.cases.push('Different saved BSP faces, volume selections and orthographic cameras restore per window; maximized/fullscreen native states retained');
  expect((await call(main,'read_workspace_history',{projectId:a.id})).history.head).toEqual(report.before.history.history.head);
  expect((await call(main,'read_workspace_history',{projectId:a.id})).writable).toBe(report.before.history.writable);expect((await call(restored,'read_workspace_history',{projectId:a.id})).writable).toBe(report.before.childHistory.writable);
  report.cases.push('Saved theme and animation choices survive actual restart; only the original editing window retains the source writer');
  await openStudioMenu(main);await expect(main.getByRole('combobox',{name:'Active Halo runtime',exact:true})).toBeVisible();await main.getByRole('button',{name:'Help & shortcuts',exact:true}).click();await expect(main.getByRole('button',{name:'Close help',exact:true})).toBeVisible();await main.keyboard.press('Escape');await expect(main.getByLabel('Studio options',{exact:true})).toBeFocused();
  for(const project of projects.slice(3))await mapOpen(main,project.id);
  await role(main,'creator');await expect(main.locator('.map-tab')).toHaveCount(6);
  const strip=main.getByRole('tablist',{name:'Open maps',exact:true});report.sixMapHeader=await strip.evaluate(list=>{const items=[...list.querySelectorAll('.map-tab')].map(el=>el.getBoundingClientRect());return {width:list.getBoundingClientRect().width,span:items.at(-1).right-items[0].left,scrollExcess:list.scrollWidth-list.clientWidth};});
  expect(report.sixMapHeader.scrollExcess).toBeLessThanOrEqual(1);expect(Math.abs(report.sixMapHeader.width-report.sixMapHeader.span)).toBeLessThanOrEqual(6);
  await main.locator('#gs-window-header').screenshot({path:path.join(root,'six-map-header.png')});await openStudioMenu(main);await main.screenshot({path:path.join(root,'studio-menu.png')});await main.keyboard.press('Escape');
  report.cases.push('Six genuine project tabs fill the native header; Studio exposes the single runtime selector and Help restores menu focus');
  for(const [page,title] of [[main,'Creator Studio'],[restored,'Level editor']]){
    await page.getByRole('button',{name:'Toggle workspace navigation',exact:true}).click();
    const orb=page.locator('.gs-navigation-drawer'),selected=orb.locator('[aria-current="page"]');
    await expect(orb.getByLabel('Current workspace',{exact:true})).toHaveText(title);await expect(selected).toHaveCount(1);await expect(selected).toHaveAccessibleName(title);await expect(selected.locator('.gs-workspace-current-mark')).toBeVisible();
    if(page===main)await page.screenshot({path:path.join(root,'orb-current-workspace.png')});
    await page.getByRole('button',{name:'Toggle workspace navigation',exact:true}).click();
  }
  report.cases.push('Each native window shows its own current workspace title and one smooth checked Orb entry; Home and first setup remain in that menu');
  await call(main,'plugin:window|unmaximize',{label:'main'});await expect(main.locator('html')).toHaveAttribute('data-gs-maximized','false');
  await call(main,'plugin:window|set_size',{label:'main',value:{Logical:{width:900,height:760}}});
  await expect(main.locator('.map-tab-bar')).toHaveAttribute('data-overflow','dropdown');await expect(main.getByRole('tablist',{name:'Open maps',exact:true}).getByRole('tab')).toHaveCount(1);
  report.narrowHeader=await main.locator('.gs-titlebar-drag-space').evaluate(element=>({dragWidth:element.getBoundingClientRect().width,dragRegion:element.getAttribute('data-tauri-drag-region')}));expect(report.narrowHeader.dragWidth).toBeGreaterThanOrEqual(48);expect(report.narrowHeader.dragRegion).toBe('deep');
  await main.getByLabel('Choose open map',{exact:true}).click();const choices=main.getByRole('menu',{name:'Open map switcher',exact:true});await expect(choices.getByRole('menuitemradio')).toHaveCount(6);await main.screenshot({path:path.join(root,'narrow-map-dropdown.png')});
  await choices.getByRole('menuitemradio').first().click();await expect(main.getByRole('tab',{name:/C69 restart A/})).toHaveAttribute('aria-selected','true');await main.getByRole('tab',{name:/C69 restart A/}).press('End');await expect(main.getByRole('tab',{name:/C69 restart G/})).toBeFocused();await expect(main.getByRole('tab',{name:/C69 restart G/})).toHaveAttribute('aria-selected','true');
  report.cases.push('A narrow native window keeps a clear drag region and one active tab; the existing Maps dropdown exposes all six maps and keyboard switching focuses the selected map');
  report.complete=true;
}catch(error){report.complete=false;report.error=String(error.stack??error);console.error(report.error);for(const [index,page] of (browser?pages():[]).entries()){await page.screenshot({path:path.join(root,`failure-${index}.png`)}).catch(()=>{});await fs.writeFile(path.join(root,`failure-${index}.txt`),await page.locator('body').innerText()).catch(()=>{});}process.exitCode=1;}finally{try{await stop();}catch(error){report.complete=false;report.closeError=String(error);if(child?.exitCode===null)child.kill();}await fs.writeFile(path.join(root,'acceptance.json'),JSON.stringify(report,null,2));}
