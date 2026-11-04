import {openViewMenu} from '../tests/ui/helpers/navigation.ts';
// Real local WebViews, persistent journal, window leases and process death.
// No mock IPC, tool launch, game session or remote collaborator is used here.
import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
import net from 'node:net';import {spawn} from 'node:child_process';
import {chromium,expect as assertion} from '@playwright/test';
const expect=assertion.configure({timeout:60000});
const [app,destination]=process.argv.slice(2);if(!app||!destination)throw Error('test-window-history-native <Spark.exe> <fresh output>');
const output=path.resolve(destination);await fs.mkdir(output);const exe=path.join(output,'Spark-window-history.exe');await fs.copyFile(path.resolve(app),exe,fs.constants.COPYFILE_EXCL);
const report={schemaVersion:1,appSha256:crypto.createHash('sha256').update(await fs.readFile(exe)).digest('hex'),mockedIpc:false,complete:false,cases:[],errors:[]};
let child,browser,main;
const pages=()=>browser.contexts().flatMap(c=>c.pages()).filter(p=>p.url().includes('tauri.localhost'));
const invoke=(page,command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
async function start(){const endpoint=net.createServer();await new Promise(r=>endpoint.listen(0,'127.0.0.1',r));const port=endpoint.address().port;await new Promise(r=>endpoint.close(r));
  child=spawn(exe,[],{windowsHide:true,stdio:'ignore',env:{...process.env,GUILTY_SPARK_DATA_DIR:path.join(output,'library'),WEBVIEW2_USER_DATA_FOLDER:path.join(output,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port} --disable-background-timer-throttling --disable-renderer-backgrounding`}});
  await expect.poll(()=>fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.ok,()=>false)).toBe(true);browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);await expect.poll(()=>pages().length).toBeGreaterThan(0);main=pages()[0];main.on('pageerror',e=>report.errors.push(String(e)));await expect(main.getByLabel('View and window options',{exact:true})).toBeVisible();
}
async function choose(page,name){const drawer=page.locator('.gs-navigation-drawer');if(!await drawer.isVisible())await page.getByRole('button',{name:'Toggle workspace navigation',exact:true}).click();await drawer.getByRole('button',{name,exact:true}).click();}
async function openProject(page,title){await choose(page,'Map library');await page.locator('.map-card').filter({has:page.getByRole('heading',{name:title,exact:true})}).click();await expect(page.getByLabel('Native BSP Workshop')).toBeVisible();}
const x=page=>page.locator('.bsp-source-fields .bsp-workshop-vector').first().getByRole('spinbutton',{name:'X',exact:true});
async function closeChanges(page){const close=page.getByRole('button',{name:'Close Changes',exact:true});if(await close.isVisible())await close.click();}
async function value(page,n){await closeChanges(page);await page.locator('.bsp-source-list button').first().click();await expect(x(page)).toHaveValue(String(n));}
async function setX(page,n){await closeChanges(page);await page.locator('.bsp-source-list button').first().click();await x(page).fill(String(n));await x(page).press('Tab');}
async function state(page,id){const view=await invoke(page,'read_workspace_history',{projectId:id});if(!view.history)return null;return{...view,project:view.history.snapshots.find(s=>s.key===view.history.head.current)?.project};}
async function acknowledged(page,id,n){await expect.poll(async()=>{const s=await state(page,id);return s?.project.quickForge.workshop?.brushes[0].position[0];}).toBe(n);return state(page,id);}
async function nextPage(previous){let page;await expect.poll(()=>{page=pages().find(p=>!previous.has(p));return !!page;}).toBe(true);page.on('pageerror',e=>report.errors.push(String(e)));await expect(page.getByLabel('Native BSP Workshop')).toBeVisible();return page;}
async function changes(page){if(!await page.getByRole('group',{name:'Workspace window ownership',exact:true}).isVisible()){const tools=page.locator('.gs-panel-overflow');if(await tools.getAttribute('open')===null)await tools.locator('summary').click();await tools.getByRole('menuitemcheckbox',{name:'Changes',exact:true}).click();}}
function step(name,data={}){report.cases.push({name,...data});console.log(JSON.stringify({passed:name,...data}));}
try{
  await start();const boot=await invoke(main,'bootstrap');await invoke(main,'save_settings',{settings:{...boot.settings,onboardingCompleted:true,autoBuild:false}});
  const created=await invoke(main,'create_quickforge_project',{title:'C43 history A',template:'customBlank',target:'haloCustomEdition'}),id=created.project.id;
  await main.reload();await main.locator('.map-card').filter({has:main.getByRole('heading',{name:'C43 history A',exact:true})}).click();await main.getByRole('button',{name:'BSP Workshop',exact:true}).click();await main.getByRole('button',{name:'Two rooms + corridor + ramp',exact:true}).click();
  // API-created projects still perform the real owned-runtime material setup.
  // Finish that separate authored transaction before measuring one user undo.
  await expect.poll(async()=>{const s=await state(main,id);const materials=s?.project.quickForge.materials;return !!materials?.length&&materials.every(m=>!!m.shaderPath);}).toBe(true);
  await setX(main,0.5);await acknowledged(main,id,0.5);
  await main.locator('.bsp-source-list button').nth(1).click();const selectedBrush=await main.locator('.bsp-source-list button.selected').innerText();
  let previous=new Set(pages());await openViewMenu(main);await main.getByRole('button',{name:'Pop out workspace',exact:true}).click();const editor=await nextPage(previous);
  await expect(editor.locator('.bsp-source-list button.selected')).toHaveText(selectedBrush);await value(editor,0.5);
  await editor.keyboard.press('Control+z');await value(editor,0);await acknowledged(editor,id,0);await editor.keyboard.press('Control+y');await value(editor,0.5);await acknowledged(editor,id,0.5);
  step('moving a real Workshop retains project identity, selected brush and Undo/Redo',{projectId:id,selectionRetained:true});
  await changes(editor);previous=new Set(pages());await editor.getByRole('button',{name:'Open another view',exact:true}).click();const observer=await nextPage(previous);await value(observer,0.5);
  const began=performance.now();await setX(editor,0.75);await value(observer,0.75);const propagationMs=performance.now()-began;await acknowledged(editor,id,0.75);expect((await state(observer,id)).writable).toBe(false);
  step('another native window observes the same committed transform',{propagationMs:Math.round(propagationMs),independentWriter:false});
  await changes(observer);await observer.getByRole('button',{name:'Edit here',exact:true}).click();await expect.poll(async()=>(await state(observer,id)).writable).toBe(true);await expect.poll(async()=>(await state(editor,id)).writable).toBe(false);
  await closeChanges(observer);await observer.keyboard.press('Control+z');await value(observer,0.5);await value(editor,0.5);await observer.keyboard.press('Control+y');await value(observer,0.75);
  const current=await acknowledged(observer,id,0.75),beforeRevision=current.history.revision;
  const staleKey=crypto.randomUUID(),staleProject={...current.project,title:'Unacknowledged stale draft'};
  let rejected='';try{await invoke(observer,'commit_workspace_history',{projectId:id,revision:beforeRevision-1,head:{...current.history.head,current:staleKey},snapshots:[{key:staleKey,project:staleProject}]});}catch(e){rejected=String(e);}
  expect(rejected).toContain('revision conflict');expect(rejected).toContain('retained');expect((await state(observer,id)).history.revision).toBe(beforeRevision);
  const journal=path.join(output,'library/projects',id,'window-history');expect((await fs.readdir(journal)).some(name=>name.startsWith('rejected-'))).toBe(true);
  step('editing lease transfer shares Undo/Redo; stale revision is rejected with a durable draft');
  for(const n of [0.76,0.77,0.78,0.79,0.8])await setX(observer,n);
  await acknowledged(observer,id,0.8);await value(editor,0.8);await setX(observer,0.75);await acknowledged(observer,id,0.75);await value(editor,0.75);
  step('rapid committed edits converge in the observing window without losing the final notification');
  const other=await invoke(main,'create_quickforge_project',{title:'C43 history B',template:'smallIndoorArena',target:'haloCustomEdition'});previous=new Set(pages());await invoke(main,'open_project_window',{id:other.project.id,workspace:'quickforge'});let independent;await expect.poll(()=>{independent=pages().find(p=>!previous.has(p));return !!independent;}).toBe(true);await expect(independent.locator('.gs-workspace-shell')).toHaveAttribute('data-workspace','level');
  const independentBefore=(await invoke(independent,'open_project',{id:other.project.id})).project;
  const foreignState=await state(observer,id);
  const foreign=await invoke(observer,'commit_workspace_history',{projectId:id,revision:foreignState.history.revision,head:{...foreignState.history.head,current:crypto.randomUUID()},snapshots:[{key:crypto.randomUUID(),project:independentBefore}]}).then(()=>'',String);expect(foreign).toMatch(/another map\/source|foreign source/);
  expect((await invoke(independent,'open_project',{id:other.project.id})).project.quickForge).toEqual(independentBefore.quickForge);step('independent map remains unchanged and its snapshot cannot enter the other map history');
  const savedBefore=(await invoke(observer,'open_project',{id})).project.quickForge.workshop.brushes[0].position[0];await setX(observer,1.25);await acknowledged(observer,id,1.25);expect(savedBefore).not.toBe(1.25);
  await main.screenshot({path:path.join(output,'multiple-windows.png')});child.kill();await expect.poll(()=>child.exitCode!==null||child.signalCode!==null).toBe(true);await browser.close().catch(()=>{});browser=null;
  await start();await openProject(main,'C43 history A');await value(main,1.25);await main.keyboard.press('Control+z');await value(main,0.75);await main.keyboard.press('Control+y');await value(main,1.25);await acknowledged(main,id,1.25);step('abrupt process death recovers acknowledged unsaved transform and its Undo/Redo');
  previous=new Set(pages());await openViewMenu(main);await main.getByRole('button',{name:'Pop out workspace',exact:true}).click();const final=await nextPage(previous);await value(final,1.25);await final.getByRole('button',{name:'Close window',exact:true}).click();await expect.poll(()=>final.isClosed()).toBe(true);
  const saved=(await invoke(main,'open_project',{id})).project;expect(saved.quickForge.workshop.brushes[0].position[0]).toBe(1.25);await openProject(main,'C43 history A');await value(main,1.25);await main.keyboard.press('Control+z');await value(main,0.75);step('closing and reopening a pop-out saves the map and preserves its history');
  previous=new Set(pages());const tab=main.getByRole('tab',{name:'C43 history A',exact:true});const bounds=await tab.boundingBox();
  await main.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await main.mouse.down();await main.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height+110,{steps:12});await main.mouse.up();
  const dragged=await nextPage(previous);await value(dragged,.75);await setX(dragged,2.25);await acknowledged(dragged,id,2.25);
  await dragged.getByRole('button',{name:'Return map to workspace',exact:true}).click();await value(main,2.25);
  expect((await state(main,id)).writable).toBe(true);expect((await state(dragged,id)).writable).toBe(false);
  await main.keyboard.press('Control+z');await value(main,.75);await main.keyboard.press('Control+y');await value(main,2.25);await acknowledged(main,id,2.25);
  await main.screenshot({path:path.join(output,'reattached-after-tab-drag.png')});
  step('pointer drag detaches a real tab; Return to main transfers the editing lease and durable Undo/Redo');
  expect(report.errors).toEqual([]);report.complete=true;
}catch(e){report.errors.push(String(e));report.failureStack=e.stack;process.exitCode=1;await main?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});if(browser)for(const [index,page]of pages().entries())await page.screenshot({path:path.join(output,`failure-window-${index}.png`)}).catch(()=>{});}
finally{await fs.writeFile(path.join(output,'acceptance.json'),JSON.stringify(report,null,2));await browser?.close().catch(()=>{});if(child?.exitCode===null)child.kill();console.log(JSON.stringify({complete:report.complete,cases:report.cases.length,errors:report.errors}));}
