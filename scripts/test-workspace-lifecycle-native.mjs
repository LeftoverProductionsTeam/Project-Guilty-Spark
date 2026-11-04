// Opt-in real desktop acceptance. Separate WebViews, native ownership and disk
// journals; never substitutes IPC responses or touches the user's projects.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,expect as assertion} from '@playwright/test';
import {chooseTool,openDrawer} from '../tests/ui/helpers/navigation.ts';
const [source,destination]=process.argv.slice(2);
if(!source||!destination)throw Error('Use: test-workspace-lifecycle-native <embedded exe> <fresh evidence directory>');
const root=path.resolve(destination),expect=assertion.configure({timeout:45000});
await fs.mkdir(root);
const app=path.join(root,'GuiltySpark-workspace-lifecycle.exe');await fs.copyFile(path.resolve(source),app,fs.constants.COPYFILE_EXCL);
const report={schemaVersion:1,appSha256:crypto.createHash('sha256').update(await fs.readFile(app)).digest('hex'),mockedIpc:false,physicalMonitorDisconnectTested:false,physicalSecondaryMonitorTransferTested:false,cases:[],errors:[],complete:false};
let child,browser,main;
const invoke=(page,command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
const pages=()=>browser.contexts().flatMap(context=>context.pages()).filter(page=>page.url().includes('tauri.localhost'));
async function nextPage(before){let page;await expect.poll(()=>{page=pages().find(page=>!before.has(page));return !!page;}).toBe(true);page.on('pageerror',error=>report.errors.push(String(error)));page.on('close',()=>{(report.closedWindows??=[]).push({url:page.url(),completedCases:report.cases.length,at:new Date().toISOString()});});await expect(page.getByRole('button',{name:'Close window',exact:true})).toHaveCount(1);return page;}
async function state(page,id){const status=await invoke(page,'read_workspace_history',{projectId:id});return {...status,project:status.history?.snapshots.find(s=>s.key===status.history.head.current)?.project};}
function step(name,data={}){report.cases.push({name,...data});console.log(JSON.stringify({passed:name,...data}));}
async function openProject(page,title){await chooseTool(page,'Map library');await page.locator('.map-card').filter({has:page.getByRole('heading',{name:title,exact:true})}).click();await expect(page.locator('.runtime-dock-heading>span').first()).toHaveText(title);await expect(page.locator('.forge-viewport canvas')).toBeVisible();}
const panel=page=>page.getByRole('region',{name:'Inspector panel',exact:true});
const x=page=>panel(page).getByRole('spinbutton',{name:'Position X',exact:true}).first();
async function inspector(page,select=false){
  if(select){await openDrawer(page,'Build tools');await page.getByRole('region',{name:'Build tools panel',exact:true}).locator('.forge-tree-select').first().click();}
  if(!new URL(page.url()).searchParams.has('panel'))await openDrawer(page,'Inspector');
  await panel(page).getByRole('button',{name:'Properties',exact:true}).click();await expect(x(page)).toBeVisible();
}
async function setX(page,value){await x(page).fill(String(value));await x(page).press('Tab');}
async function acknowledged(page,id,value){await expect.poll(async()=>{const s=await state(page,id);return s.project?.quickForge.geometry[0]?.position[0];}).toBe(value);return state(page,id);}
async function close(page){await page.getByRole('button',{name:'Close window',exact:true}).click();await expect.poll(()=>page.isClosed()).toBe(true);}
try{
  const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
  child=spawn(app,[],{windowsHide:true,stdio:'ignore',env:{...process.env,GUILTY_SPARK_DATA_DIR:path.join(root,'library'),WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
  await expect.poll(()=>fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.ok,()=>false)).toBe(true);browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await expect.poll(()=>pages().length).toBeGreaterThan(0);main=pages()[0];main.on('pageerror',error=>report.errors.push(String(error)));
  const boot=await invoke(main,'bootstrap');await invoke(main,'save_settings',{settings:{...boot.settings,onboardingCompleted:true,autoBuild:false}});
  const a=await invoke(main,'create_quickforge_project',{title:'C59 map A',template:'smallIndoorArena',target:'haloCustomEdition'});
  const b=await invoke(main,'create_quickforge_project',{title:'C59 map B',template:'smallIndoorArena',target:'haloCustomEdition'});
  await invoke(main,'create_quickforge_project',{title:'C59 map C',template:'smallIndoorArena',target:'haloCustomEdition'});
  await main.reload();await openProject(main,'C59 map A');await inspector(main,true);
  await setX(main,0.5);await acknowledged(main,a.project.id,0.5);
  await main.locator('.forge-viewport canvas').evaluate(canvas=>{window.c59OriginalCanvas=canvas;});
  await panel(main).getByLabel('Inspector drawer options',{exact:true}).click();await main.getByLabel('Inspector position',{exact:true}).selectOption('float');await main.getByLabel('Inspector size',{exact:true}).fill('420');await panel(main).getByLabel('Inspector drawer options',{exact:true}).click();
  const before=new Set(pages()),handle=await panel(main).locator('.gs-panel-drag').boundingBox();
  await main.mouse.move(handle.x+30,handle.y+handle.height/2);await main.mouse.down();await main.mouse.move(-45,-45,{steps:15});await main.mouse.up();
  let detached=await nextPage(before);await expect(detached.locator('.gs-workspace-shell')).toHaveAttribute('data-detached-panel','forge-inspector');await inspector(detached);
  await expect(detached.locator('.gs-workspace-panel:visible')).toHaveCount(1);await expect(detached.getByRole('button',{name:'Close Inspector',exact:true})).toHaveCount(0);
  const headerLayout=await detached.evaluate(()=>{
    const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {left:r.left,right:r.right};};
    return {view:rect('[aria-label="View and window options"]'),returning:rect('[aria-label="Return panel to workspace"]'),window:rect('.gs-window-controls')};
  });
  expect(headerLayout.returning.right).toBeLessThanOrEqual(headerLayout.view.left);
  expect(headerLayout.view.right).toBeLessThanOrEqual(headerLayout.window.left);
  await expect(detached.locator('.forge-viewport canvas')).toHaveCount(0);
  expect((await state(main,a.project.id)).writable).toBe(false);expect((await state(detached,a.project.id)).writable).toBe(true);
  await expect(x(detached)).toHaveValue('0.5');await setX(detached,1.25);const committed=await acknowledged(detached,a.project.id,1.25);await acknowledged(main,a.project.id,1.25);
  const stale=structuredClone(committed.project);stale.title='Rejected stale observer';const key=crypto.randomUUID();
  const rejected=await invoke(main,'commit_workspace_history',{projectId:a.project.id,revision:committed.history.revision,head:{...committed.history.head,current:key},snapshots:[{key,project:stale}]}).then(()=>'',String);
  expect(rejected).toContain('retained');
  // A legitimate autosave may acknowledge the same content while the rejected
  // observer request is in flight. Verify source content and ownership rather
  // than incorrectly forbidding that unrelated saved/dirty history transition.
  const afterRefusal=await state(main,a.project.id);
  expect(afterRefusal.history.revision).toBeGreaterThanOrEqual(committed.history.revision);
  expect(afterRefusal.project.quickForge).toEqual(committed.project.quickForge);
  expect(afterRefusal.project.title).toBe('C59 map A');expect(afterRefusal.writable).toBe(false);
  const journal=path.join(root,'library','projects',a.project.id,'window-history');
  const rejectedFiles=(await fs.readdir(journal)).filter(name=>name.startsWith('rejected-'));
  expect(rejectedFiles.length).toBeGreaterThan(0);
  expect((await Promise.all(rejectedFiles.map(name=>fs.readFile(path.join(journal,name),'utf8')))).some(text=>text.includes('Rejected stale observer'))).toBe(true);
  step('Pointer drag detaches the actual Inspector; selection, draft and authoritative history converge; stale observer writes are retained and refused');
  await detached.screenshot({path:path.join(root,'detached-inspector.png')});
  await chooseTool(detached,'Map library');await expect(detached.locator('.gs-workspace-shell')).toHaveAttribute('data-workspace','library');await expect(detached.locator('.gs-workspace-shell')).not.toHaveAttribute('data-detached-panel');
  await chooseTool(detached,'Level editor');await expect(detached.locator('.gs-workspace-shell')).toHaveAttribute('data-detached-panel','forge-inspector');await inspector(detached);
  await openProject(main,'C59 map B');await inspector(main,true);
  const writes=await Promise.allSettled([setX(main,2.5),setX(detached,1.5)]);expect(writes.every(result=>result.status==='fulfilled')).toBe(true);
  await acknowledged(main,b.project.id,2.5);await acknowledged(detached,a.project.id,1.5);
  await close(detached);await expect(main.locator('.runtime-dock-heading>span').first()).toHaveText('C59 map B');
  await main.getByRole('tab',{name:/C59 map A/}).click();await expect(main.locator('.runtime-dock-heading>span').first()).toHaveText('C59 map A');await inspector(main);
  await expect(x(main)).toHaveValue('1.5');expect((await state(main,a.project.id)).writable).toBe(true);
  expect(await main.evaluate(()=>window.c59OriginalCanvas===document.querySelector('.forge-viewport canvas'))).toBe(true);
  await main.keyboard.press('Control+z');await expect(x(main)).toHaveValue('1.25');await main.keyboard.press('Control+y');await expect(x(main)).toHaveValue('1.5');
  step('Editing a second map while the detached panel edits the first preserves both documents; closing returns the lease without stealing the active map; Undo/Redo and original Canvas survive');
  await main.evaluate(()=>{
    const gl=window.c59OriginalCanvas.getContext('webgl2'),clear=gl.clear.bind(gl);window.c59Draws=0;window.c59OriginalGl=gl;
    gl.clear=(...args)=>{window.c59Draws++;return clear(...args);};
  });
  await chooseTool(main,'Tag editor');await expect.poll(()=>main.evaluate(()=>window.c59OriginalCanvas.dataset.gsEditorActivity)).toBe('paused');
  await main.waitForTimeout(350);const parkedDraws=await main.evaluate(()=>window.c59Draws);await main.waitForTimeout(650);expect(await main.evaluate(()=>window.c59Draws)).toBe(parkedDraws);
  await chooseTool(main,'Level editor');await expect(main.locator('.gs-workspace-shell')).toHaveAttribute('data-workspace','level');await inspector(main);expect(await main.evaluate(()=>window.c59OriginalCanvas===document.querySelector('.forge-viewport canvas'))).toBe(true);
  step('Inactive editor pauses its actual GL clears and resumes the same Canvas and selection',{parkedGlClearsOver650ms:0});
  await invoke(main,'plugin:window|minimize',{label:'main'});
  await expect.poll(()=>invoke(main,'plugin:window|is_minimized',{label:'main'})).toBe(true);
  await expect.poll(()=>main.evaluate(()=>window.c59OriginalCanvas.dataset.gsEditorActivity)).toBe('paused');
  await main.waitForTimeout(350);const minimizedDraws=await main.evaluate(()=>window.c59Draws);await main.waitForTimeout(650);expect(await main.evaluate(()=>window.c59Draws)).toBe(minimizedDraws);
  await invoke(main,'plugin:window|unminimize',{label:'main'});
  await expect.poll(()=>invoke(main,'plugin:window|is_minimized',{label:'main'})).toBe(false);
  await expect.poll(()=>main.evaluate(()=>window.c59OriginalCanvas.dataset.gsEditorActivity)).not.toBe('paused');
  expect(await main.evaluate(()=>window.c59OriginalCanvas===document.querySelector('.forge-viewport canvas'))).toBe(true);
  step('Native minimization pauses the actual viewport and restoring resumes it without unloading the document',{minimizedGlClearsOver650ms:0});
  const beforeRetirement=await state(main,a.project.id);
  await openProject(main,'C59 map B');await openProject(main,'C59 map C');
  await expect.poll(()=>main.evaluate(()=>window.c59OriginalGl.isContextLost())).toBe(true);
  await main.getByRole('tab',{name:/C59 map A/}).click();await expect(main.locator('.runtime-dock-heading>span').first()).toHaveText('C59 map A');await inspector(main);
  expect(await main.evaluate(()=>window.c59OriginalCanvas!==document.querySelector('.forge-viewport canvas'))).toBe(true);
  await expect(x(main)).toHaveValue('1.5');const afterRetirement=await state(main,a.project.id);
  expect(afterRetirement.project.quickForge).toEqual(beforeRetirement.project.quickForge);expect(afterRetirement.history.head.past).toEqual(beforeRetirement.history.head.past);
  await main.keyboard.press('Control+z');await expect(x(main)).toHaveValue('1.25');await main.keyboard.press('Control+y');await expect(x(main)).toHaveValue('1.5');
  step('A third map retires the oldest actual GPU context; returning rehydrates its renderer while preserving document, selection and Undo/Redo',{warmGpuMapLimit:2,openDocuments:3});
  let prior=new Set(pages());await panel(main).getByRole('button',{name:'Detach Inspector',exact:true}).click();detached=await nextPage(prior);await inspector(detached);
  const label=await detached.evaluate(()=>window.__TAURI_INTERNALS__.metadata.currentWindow.label);
  await invoke(detached,'plugin:window|set_size',{label,value:{Logical:{width:610,height:690}}});
  await invoke(detached,'plugin:window|set_position',{label,value:{Physical:{x:100,y:80}}});
  const placement={size:await invoke(detached,'plugin:window|inner_size',{label}),position:await invoke(detached,'plugin:window|outer_position',{label})};
  await detached.getByRole('button',{name:'Return panel to workspace',exact:true}).click();await expect.poll(()=>detached.isClosed()).toBe(true);await inspector(main);
  prior=new Set(pages());await panel(main).getByRole('button',{name:'Detach Inspector',exact:true}).click();detached=await nextPage(prior);await inspector(detached);
  const reopenedLabel=await detached.evaluate(()=>window.__TAURI_INTERNALS__.metadata.currentWindow.label);
  expect(await invoke(detached,'plugin:window|outer_position',{label:reopenedLabel})).toEqual(placement.position);
  expect(await invoke(detached,'plugin:window|inner_size',{label:reopenedLabel})).toEqual(placement.size);
  await invoke(detached,'plugin:window|set_position',{label:reopenedLabel,value:{Physical:{x:-30000,y:20000}}});await invoke(detached,'recover_workspace_window');
  const recovered=await invoke(detached,'plugin:window|outer_position',{label:reopenedLabel});expect(recovered.x).toBeGreaterThan(-30000);expect(recovered.y).toBeLessThan(20000);
  const monitors=await invoke(detached,'plugin:window|available_monitors');
  report.availableNativeMonitors=monitors.map(m=>({position:m.position,size:m.size,scaleFactor:m.scaleFactor}));
  if(monitors.length>1){
    const second=monitors[1],position={x:second.position.x+32,y:second.position.y+32};
    await invoke(detached,'plugin:window|set_position',{label:reopenedLabel,value:{Physical:position}});await invoke(detached,'recover_workspace_window');
    const actual=await invoke(detached,'plugin:window|outer_position',{label:reopenedLabel});expect(actual).toEqual(position);report.nativeSecondaryMonitorPlacementTested=true;
  }
  await close(detached);await inspector(main);
  step('Native size/position survive close and reopen; an offscreen saved window is recovered onto an available monitor',{placement,recovered});
  prior=new Set(pages());await invoke(main,'open_workspace_window',{workspace:'learning',context:null,section:null});const learning=await nextPage(prior);await openDrawer(learning,'Help');
  const beforeHelp=new Set(pages());await learning.getByRole('button',{name:'Detach Help',exact:true}).click();const help=await nextPage(beforeHelp);await expect(help.locator('.gs-workspace-shell')).toHaveAttribute('data-detached-panel','help');await help.getByRole('button',{name:'Return panel to workspace',exact:true}).click();await expect.poll(()=>help.isClosed()).toBe(true);await expect(learning.getByRole('region',{name:'Help panel',exact:true})).toBeVisible();await close(learning);
  step('A non-map drawer returns to the native window that opened it, including nested pop-outs');
  await chooseTool(main,'Online');await main.getByRole('button',{name:'Collaborate',exact:true}).click();await expect(main.getByRole('region',{name:'Collaborate on source'})).toBeVisible();await expect(main.getByRole('button',{name:'Start private server',exact:true})).toHaveCount(0);
  await main.getByRole('button',{name:'Set up editor collaboration',exact:true}).click();await expect(main.getByRole('region',{name:'Co-edit setup panel',exact:true})).toBeVisible();
  await main.getByRole('button',{name:'C59 map A · open SparkLink',exact:true}).click();await expect(main.getByRole('region',{name:'SparkLink panel',exact:true})).toBeVisible();await expect(main.getByRole('button',{name:'Host editing session',exact:true})).toBeVisible();
  await expect(main.locator('.runtime-dock-heading>span').first()).toHaveText('C59 map A');
  const steam=await invoke(main,'steam_module_status');expect(steam.configured).toBe(false);expect(steam.testMode).toBe(false);
  const denied=await invoke(main,'choose_steam_module',{path:root}).then(()=>'',String);expect(denied).toContain('disabled in release builds');
  step('Online exposes source collaboration separately from game hosting; production Steam test identities are refused natively');
  await main.screenshot({path:path.join(root,'online-collaboration.png')});
  await chooseTool(main,'Level editor');await inspector(main);await acknowledged(main,a.project.id,1.5);
  expect(report.errors).toEqual([]);report.complete=true;
}catch(error){report.errors.push(String(error));report.failureStack=error.stack;process.exitCode=1;if(browser)for(const [i,page]of pages().entries())await page.screenshot({path:path.join(root,`failure-window-${i}.png`)}).catch(()=>{});}
finally{await fs.writeFile(path.join(root,'acceptance.json'),JSON.stringify(report,null,2));await browser?.close().catch(()=>{});if(child?.exitCode===null)child.kill();console.log(JSON.stringify({complete:report.complete,cases:report.cases.length,errors:report.errors}));}
