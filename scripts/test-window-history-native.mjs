import { assertQaOutputPath } from './native-qa-storage.mjs';
import {openViewMenu,revealPagedControl} from '../tests/ui/helpers/navigation.ts';
// Real local WebViews, persistent journal, window leases and process death.
// No mock IPC, tool launch, game session or remote collaborator is used here.
import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
import net from 'node:net';import {spawn} from 'node:child_process';
import {chromium,expect as assertion} from '@playwright/test';
const expect=assertion.configure({timeout:60000});
const [app,destination]=process.argv.slice(2);if(!app||!destination)throw Error('test-window-history-native <Spark.exe> <fresh output>');
const output=path.resolve(destination);await fs.mkdir(await assertQaOutputPath(output));const exe=path.join(output,'Spark-window-history.exe');await fs.copyFile(path.resolve(app),exe,fs.constants.COPYFILE_EXCL);
const digest=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
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
async function withoutPaint(page,action){
 await page.evaluate(()=>{window.__historyFrame=window.requestAnimationFrame;window.requestAnimationFrame=()=>0;});
 try{return await action();}
 finally{
  if(!page.isClosed())await page.evaluate(()=>{window.requestAnimationFrame=window.__historyFrame;delete window.__historyFrame;}).catch(error=>{if(!page.isClosed())throw error;});
 }
}
try{
  await start();const boot=await invoke(main,'bootstrap');await invoke(main,'save_settings',{settings:{...boot.settings,onboardingCompleted:true,autoBuild:false}});
  const created=await invoke(main,'create_quickforge_project',{title:'C43 history A',template:'customBlank',target:'haloCustomEdition'}),id=created.project.id;
  await main.reload();await main.locator('.map-card').filter({has:main.getByRole('heading',{name:'C43 history A',exact:true})}).click();await main.getByRole('button',{name:'BSP Workshop',exact:true}).click();await main.getByRole('button',{name:'Two rooms + corridor + ramp',exact:true}).click();
  // API-created projects still perform the real owned-runtime material setup.
  // Finish that separate authored transaction before measuring one user undo.
  await expect.poll(async()=>{const s=await state(main,id);const materials=s?.project.quickForge.materials;return !!materials?.length&&materials.every(m=>!!m.shaderPath);}).toBe(true);
  // Crash recovery is opt-in. Use the project's actual storage control.
  await choose(main,'Settings & tools');await main.getByRole('tab',{name:'Storage & Cache',exact:true}).click();
  const storage=main.getByRole('region',{name:'Storage and cache settings',exact:true});
  const limit=storage.getByLabel('Maximum automatic map backups',{exact:true});await revealPagedControl(limit);await limit.selectOption('3');
  const saveLimit=storage.getByRole('button',{name:'Save limit',exact:true});await revealPagedControl(saveLimit);await saveLimit.click();
  const descriptor=await assertQaOutputPath(path.join(output,'library/projects',id,'project.gsproject'),{reservationBytes:0});
  const readSaved=async()=>JSON.parse(await fs.readFile(descriptor,'utf8'));
  await expect(storage.getByRole('status').filter({hasText:'Backup limit saved for this project.'})).toBeVisible();
  expect((await readSaved()).automaticBackupRetention).toBe(3);
  const beforePopout=await digest(descriptor);
  await openProject(main,'C43 history A');await setX(main,0.5);await acknowledged(main,id,0.5);
  await main.locator('.bsp-source-list button').nth(1).click();const selectedBrush=await main.locator('.bsp-source-list button.selected').innerText();
  let previous=new Set(pages());await openViewMenu(main);
  const editor=await withoutPaint(main,async()=>{
   await main.getByRole('button',{name:'Pop out workspace',exact:true}).click();
   return nextPage(previous);
  });
  expect(await digest(descriptor)).toBe(beforePopout);
  expect((await state(editor,id)).writable).toBe(true);
  await expect(editor.locator('.bsp-source-list button.selected')).toHaveText(selectedBrush);await value(editor,0.5);
  await editor.keyboard.press('Control+z');await value(editor,0);await acknowledged(editor,id,0);await editor.keyboard.press('Control+y');await value(editor,0.5);await acknowledged(editor,id,0.5);
  step('moving a native Workshop with the source renderer suspended retains project, selection and Undo/Redo',{projectId:id,descriptorSha256:beforePopout,diskSave:false});
  await changes(editor);previous=new Set(pages());await editor.getByRole('button',{name:'Open another view',exact:true}).click();const observer=await nextPage(previous);await value(observer,0.5);
  const began=performance.now();await setX(editor,0.75);await value(observer,0.75);const propagationMs=performance.now()-began;await acknowledged(editor,id,0.75);expect((await state(observer,id)).writable).toBe(false);
  // Keep the observer open past the ordinary background staging delay.
  await observer.waitForTimeout(1600);
  await expect(observer.locator('.toast.error').filter({hasText:'No writable native history is attached'})).not.toBeVisible();
  step('another native window observes the same committed transform',{propagationMs:Math.round(propagationMs),independentWriter:false});
  const ownerBeforeMove=await state(editor,id),savedBeforeMove=await digest(descriptor);
  const observedTab=page=>page.getByRole('tab',{name:'C43 history A',exact:true});
  await expect(observedTab(observer)).toHaveAttribute('aria-description','Unsaved changes');
  await expect(observer.getByRole('button',{name:'Return map to workspace',exact:true})).toHaveCount(0);
  await observer.keyboard.press('Control+Shift+p');
  const work=observer.getByRole('dialog',{name:'Open work',exact:true});
  await work.getByRole('tab',{name:'Saved projects',exact:true}).click();
  previous=new Set(pages());
  await work.getByRole('button',{name:'Open saved project C43 history A in another window',exact:true}).click();
  const extraView=await nextPage(previous);
  await value(extraView,0.75);
  expect((await state(extraView,id)).writable).toBe(false);
  await expect(observedTab(observer)).toBeVisible();
  await openViewMenu(extraView);previous=new Set(pages());
  await extraView.getByRole('button',{name:'Pop out workspace',exact:true}).click();
  const movedView=await nextPage(previous);
  await expect(observedTab(extraView)).toHaveCount(0);
  await value(movedView,0.75);
  expect((await state(movedView,id)).writable).toBe(false);
  await movedView.keyboard.press('Control+w');
  await expect(observedTab(movedView)).toHaveCount(0);
  for(const view of [observer,extraView,movedView]){
   await expect(view.getByRole('dialog',{name:'Save changes before closing?',exact:true})).toHaveCount(0);
   await expect(view.locator('.toast.error')).toHaveCount(0);
  }
  expect((await state(editor,id)).writable).toBe(true);
  expect((await state(editor,id)).owner).toBe(ownerBeforeMove.owner);
  expect((await state(editor,id)).history).toEqual(ownerBeforeMove.history);
  expect(await digest(descriptor)).toBe(savedBeforeMove);
  step('read-only saved-project window, pop out and keyboard close preserve the writer, its draft and the saved descriptor',{descriptorSha256:savedBeforeMove,historyRevision:ownerBeforeMove.history.revision});
  await changes(observer);await observer.getByRole('button',{name:'Edit here',exact:true}).click();await expect.poll(async()=>(await state(observer,id)).writable).toBe(true);await expect.poll(async()=>(await state(editor,id)).writable).toBe(false);
  await closeChanges(observer);await observer.keyboard.press('Control+z');await value(observer,0.5);await value(editor,0.5);await observer.keyboard.press('Control+y');await value(observer,0.75);
  const current=await acknowledged(observer,id,0.75),beforeRevision=current.history.revision;
  const staleKey=crypto.randomUUID(),staleProject={...current.project,title:'Unacknowledged stale draft'};
  const draft={projectId:id,revision:beforeRevision-1,head:{...current.history.head,current:staleKey},snapshots:[{key:staleKey,project:staleProject}]};
  const rejected=await invoke(observer,'commit_workspace_history',draft).then(()=>'',String);
  expect(rejected).toContain('revision conflict');expect(rejected).toContain('in-memory draft');
  expect((await state(observer,id)).history.revision).toBe(beforeRevision);
  const exported=await assertQaOutputPath(await invoke(observer,'retain_workspace_draft',draft),{reservationBytes:0});
  expect(await fs.readFile(exported,'utf8')).toContain(staleProject.title);
  step('editing lease transfer shares Undo/Redo; stale revision is rejected and its explicit export retains the draft');
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
  previous=new Set(pages());await openViewMenu(main);await main.getByRole('button',{name:'Pop out workspace',exact:true}).click();const final=await nextPage(previous);await value(final,1.25);
  await x(final).fill('1.5');
  await withoutPaint(final,async()=>{
   await final.getByRole('button',{name:'Close window',exact:true}).click();
   const closeReview=final.getByRole('dialog',{name:'Save changes before closing?',exact:true});
   await closeReview.getByRole('button',{name:'Save changes',exact:true}).click();
   await expect.poll(()=>final.isClosed()).toBe(true);
  });
  expect((await readSaved()).quickForge.workshop.brushes[0].position[0]).toBe(1.5);
  await openProject(main,'C43 history A');await value(main,1.5);await main.keyboard.press('Control+z');await value(main,1.25);
  step('closing with the renderer suspended saves the edited transform and returns its Undo history',{descriptorSha256:await digest(descriptor)});
  previous=new Set(pages());const tab=main.getByRole('tab',{name:'C43 history A',exact:true});const bounds=await tab.boundingBox();
  await main.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await main.mouse.down();await main.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height+110,{steps:12});await main.mouse.up();
  const dragged=await nextPage(previous);await value(dragged,1.25);await setX(dragged,2.25);await acknowledged(dragged,id,2.25);
  await dragged.getByRole('button',{name:'Return map to workspace',exact:true}).click();await value(main,2.25);
  expect((await state(main,id)).writable).toBe(true);expect((await state(dragged,id)).writable).toBe(false);
  await main.keyboard.press('Control+z');await value(main,1.25);await main.keyboard.press('Control+y');await value(main,2.25);await acknowledged(main,id,2.25);
  await main.screenshot({path:path.join(output,'reattached-after-tab-drag.png')});
  step('pointer drag detaches a real tab; Return to main transfers the editing lease and durable Undo/Redo');
  expect(report.errors).toEqual([]);report.complete=true;
}catch(e){report.errors.push(String(e));report.failureStack=e.stack;process.exitCode=1;await main?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});if(browser)for(const [index,page]of pages().entries())await page.screenshot({path:path.join(output,`failure-window-${index}.png`)}).catch(()=>{});}
finally{await fs.writeFile(path.join(output,'acceptance.json'),JSON.stringify(report,null,2));await browser?.close().catch(()=>{});if(child?.exitCode===null)child.kill();console.log(JSON.stringify({complete:report.complete,cases:report.cases.length,errors:report.errors}));}
