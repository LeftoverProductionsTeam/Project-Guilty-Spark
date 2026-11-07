import { assertQaOutputPath, beginQaStorage, waitForQaExit, stopQaProcess } from './native-qa-storage.mjs';
// Opt-in real desktop acceptance. Separate WebViews, native ownership and disk
// journals; never substitutes IPC responses or touches the user's projects.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chromium,expect as assertion} from '@playwright/test';
import {chooseTool,openDrawer} from '../tests/ui/helpers/navigation.ts';
const [source,destination,nativeMap,invaderDirectory]=process.argv.slice(2);
if(!source||!destination)throw Error('Use: test-workspace-lifecycle-native <embedded exe> <fresh evidence directory>');
const root=path.resolve(destination),expect=assertion.configure({timeout:45000});
const detachMethod=process.env.SPARK_LIFECYCLE_DETACH_METHOD??'pointer';
if(!['pointer','button'].includes(detachMethod))throw Error('Detach method must be pointer or button');
const nativeOnly=process.env.SPARK_LIFECYCLE_NATIVE_ONLY==='1';
const launchOnly=process.env.SPARK_LIFECYCLE_LAUNCH_ONLY==='1';
const previewOnly=process.env.SPARK_LIFECYCLE_PREVIEW_ONLY==='1';
const contextOnly=process.env.SPARK_LIFECYCLE_TAG_CONTEXTS==='1';
if(contextOnly&&(!nativeOnly||previewOnly))throw Error('Native asset-context acceptance requires native-only mode and its own small bounded run');
const contextReadOnly=process.env.SPARK_LIFECYCLE_CONTEXT_READ_ONLY==='1';
if(contextReadOnly&&!contextOnly)throw Error('Read-only asset contexts require the explicit native asset-context mode');
const readOnly=previewOnly||contextReadOnly;
const expectedCacheVersion=Number(process.env.SPARK_LIFECYCLE_CACHE_VERSION??'13');
if(![5,6,7,13,609].includes(expectedCacheVersion)||expectedCacheVersion!==13&&!readOnly||previewOnly&&!nativeOnly)throw Error('Other native cache families require explicit read-only preview acceptance');
const profilePreview=process.env.SPARK_LIFECYCLE_PROFILE==='1';
if(profilePreview&&!nativeOnly)throw Error('Preview profiling requires native-only mode');
const geometryOnly=process.env.SPARK_LIFECYCLE_GEOMETRY==='1';
const logicOnly=process.env.SPARK_LIFECYCLE_LOGIC==='1';
const crossRuntime=process.env.SPARK_LOGIC_CROSS_RUNTIME==='1';
if(crossRuntime&&!logicOnly)throw Error('Cross-runtime asset acceptance uses the existing native logic workflow');
if(logicOnly&&(geometryOnly||nativeOnly||previewOnly||contextOnly))throw Error('Native logic authoring requires its own bounded run');
const repeatedEdits=process.env.SPARK_LIFECYCLE_REPEAT_EDITS??'';
if(!['','20','50'].includes(repeatedEdits)||repeatedEdits&&!nativeOnly)throw Error('Repeated native acceptance requires native-only mode and exactly20 or50 edits');
const editCount=Number(repeatedEdits||0);
const memoryAcceptance=process.env.SPARK_LIFECYCLE_MEMORY==='1';
if(memoryAcceptance&&(!nativeOnly||readOnly))throw Error('Memory lifecycle acceptance requires the real editable native app mode');
if(nativeOnly&&!nativeMap)throw Error('Native-only acceptance requires an owned map');
const inputInfo=nativeMap&&nativeMap!=='-'?await fs.stat(path.resolve(nativeMap)):null;
if(inputInfo&&!inputInfo.isFile())throw Error('Native acceptance input must be an existing owned cache');
if((previewOnly||contextOnly)&&(!inputInfo||inputInfo.size>128*1024*1024))throw Error('The small native preview/context test requires a cache within128MiB; use the full reserved native workflow for larger fixtures');
const reservationBytes=previewOnly||contextOnly?1024**3:logicOnly?2*1024**3:4*1024**3;
await fs.mkdir(await assertQaOutputPath(root,{reservationBytes}));
const app=path.join(root,'application','GuiltySpark-workspace-lifecycle.exe');
const report={schemaVersion:1,appSha256:crypto.createHash('sha256').update(await fs.readFile(path.resolve(source))).digest('hex'),mockedIpc:false,detachMethod,scope:geometryOnly?'native-geometry-roundtrip':logicOnly?'native-logic-roundtrip':contextOnly?'native-asset-contexts':previewOnly?'native-source-preview':nativeOnly?'native-edit-only':'workspace-lifecycle',physicalMonitorDisconnectTested:false,physicalSecondaryMonitorTransferTested:false,cases:[],errors:[],complete:false};
const finishStorage=await beginQaStorage(root,{workflow:geometryOnly?'native-geometry-roundtrip':logicOnly?'native-logic-roundtrip':contextOnly?'native-asset-contexts':previewOnly?'native-source-preview':repeatedEdits?`native-${editCount}-edits`:nativeOnly?'native-edit-export':'workspace-lifecycle',appSha256:report.appSha256,reservationBytes});
await finishStorage.createScratch('application');
await fs.copyFile(path.resolve(source),app,fs.constants.COPYFILE_EXCL);
await finishStorage.createScratch('library');
await finishStorage.createScratch('webview');
if(nativeOnly&&!readOnly)await finishStorage.createScratch('independent-native-tags');
if(logicOnly)await finishStorage.createScratch('independent-native-tags');
if(logicOnly&&crossRuntime){await finishStorage.createScratch('donor-inputs');await finishStorage.createScratch('native-output');}
if(geometryOnly)await finishStorage.createScratch('independent-model-tags');
if(process.env.SPARK_QA_MEGAWORLD_COMPILE==='1')await finishStorage.createScratch('assembly-donor-tags');
const runOwned=async(...args)=>{const pending=promisify(execFile)(...args);if(pending.child)await finishStorage.trackProcess(pending.child);return pending;};
const interrupt=async()=>{try{await finishStorage.interrupt();}finally{process.exit(130);}};
process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
let child,browser,main;
const invoke=(page,command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
const pages=()=>browser.contexts().flatMap(context=>context.pages()).filter(page=>page.url().includes('tauri.localhost'));
async function launchNative(){
  const started=performance.now();
  if(!report.applicationIcon){
    const readback=await runOwned('pwsh.exe',['-NoProfile','-File',path.resolve('scripts/verify-app-icon.ps1'),'-Executable',app,'-ExpectedIco',path.resolve('src-tauri/icons/icon.ico'),'-OutputPng',path.join(root,'application-icon.png')],{windowsHide:true,timeout:30000});
    report.applicationIcon=JSON.parse(readback.stdout);expect(report.applicationIcon.matchesExpectedMonitor).toBe(true);
  }
  const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
  child=spawn(app,[],{windowsHide:true,stdio:'ignore',env:{...process.env,GUILTY_SPARK_DATA_DIR:path.join(root,'library'),WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
  await finishStorage.trackProcess(child);
  await expect.poll(()=>fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.ok,()=>false)).toBe(true);browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  try{await expect.poll(()=>pages().length).toBeGreaterThan(0);}
  catch(error){report.startupPages=await Promise.all(browser.contexts().flatMap(context=>context.pages()).map(async page=>({url:page.url(),title:await page.title().catch(()=>''),body:(await page.locator('body').innerText().catch(()=>'')).slice(0,1200)})));throw error;}
  main=pages()[0];main.on('pageerror',error=>report.errors.push(String(error)));
  if(profilePreview){
    const windowMs=performance.now()-started;
    if(!report.previewProfile)report.previewProfile={appWindowMs:windowMs,conditions:'Fresh application/profile; OS file cache not cleared; same embedded app, source, settings and readiness checks',calls:[]};
    else(report.previewProfile.restarts??=[]).push({appWindowMs:windowMs,pid:child.pid});
  }
}
async function nextPage(before){let page;await expect.poll(()=>{page=pages().find(page=>!before.has(page));return !!page;}).toBe(true);page.on('pageerror',error=>report.errors.push(String(error)));page.on('close',()=>{(report.closedWindows??=[]).push({url:page.url(),completedCases:report.cases.length,at:new Date().toISOString()});});await expect(page.getByRole('button',{name:'Close window',exact:true})).toHaveCount(1);
  // WebView controls can mount while native construction is still applying its
  // saved placement. Wait for registration before testing a subsequent move.
  const label=await page.evaluate(()=>window.__TAURI_INTERNALS__.metadata.currentWindow.label);
  await expect.poll(async()=>(await invoke(page,'workspace_window_inventory')).some(window=>window.label===label)).toBe(true);
  return page;}
async function state(page,id){const status=await invoke(page,'read_workspace_history',{projectId:id});return {...status,project:status.history?.snapshots.find(s=>s.key===status.history.head.current)?.project};}
function step(name,data={}){report.cases.push({name,...data});console.log(JSON.stringify({passed:name}));}
async function storageSample(phase){
  const overview=await invoke(main,'storage_overview'),folders=[];
  for(const folder of overview.folders.filter(folder=>['Projects & preserved originals','Existing native jobs'].includes(folder.label))){
    folders.push(await invoke(main,'storage_measure_folder',{folderId:folder.id}));
  }
  const process=JSON.parse((await promisify(execFile)('pwsh.exe',['-NoProfile','-File',path.resolve('scripts/profile-process-tree.ps1'),'-RootProcessId',String(child.pid)],{windowsHide:true,timeout:30000,maxBuffer:1024*1024})).stdout);
  const row={phase,folders,process,at:new Date().toISOString()};(report.storageSamples??=[]).push(row);await physicalSample(phase);return row;
}
async function physicalSample(phase){
  const meter=process.env.SPARK_LIFECYCLE_PHYSICAL_METER,directory=process.env.SPARK_LIFECYCLE_PHYSICAL_OUTPUT;
  if(!meter)return;
  if(!directory)throw Error('Physical meter requires a separate bounded evidence directory');
  await fs.mkdir(await assertQaOutputPath(path.resolve(directory),{reservationBytes:0}),{recursive:true});
  const output=path.join(path.resolve(directory),`${String(report.physicalSamples?.length??0).padStart(3,'0')}-${phase}.jsonl`);
  // Read-only scanner writes only its bounded evidence outside the measured run.
  await promisify(execFile)(path.resolve(meter),[root,output],{windowsHide:true,timeout:30000});
  const rows=(await fs.readFile(output,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
  const measured=rows.find(row=>row.type==='root-summary');
  expect(measured.errors).toBe(0);
  (report.physicalSamples??=[]).push({phase,allocatedBytes:measured.uniqueAllocatedFileBytes,files:measured.files,at:new Date().toISOString(),evidence:output});
}
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
async function close(page,choice){
  await page.getByRole('button',{name:'Close window',exact:true}).click();
  const review=page.getByRole('dialog',{name:'Save changes before closing?',exact:true});
  await expect.poll(async()=>page.isClosed()||await review.isVisible().catch(()=>false)).toBe(true);
  if(!page.isClosed()){
    if(choice!=='save')throw Error('Unexpected unsaved changes while closing the native test window');
    await review.getByRole('button',{name:'Save changes',exact:true}).click();
  }
  await expect.poll(()=>page.isClosed()).toBe(true);
}
async function independentNativeWindows(id){
  const original=main,orb=page=>page.getByRole('button',{name:'Toggle workspace navigation',exact:true});
  await original.getByRole('tab',{name:'C59 map A',exact:true}).click();await inspector(original);await expect(x(original)).toHaveValue('1.5');
  const originLabel=await original.evaluate(()=>window.__TAURI_INTERNALS__.metadata.currentWindow.label);
  await invoke(original,'focus_workspace_window',{label:originLabel});await expect.poll(()=>original.evaluate(()=>document.hasFocus())).toBe(true);
  const tab=original.getByRole('tab',{name:'C59 map A',exact:true}),start=await tab.boundingBox(),count=pages().length;
  const lift=async()=>{await original.mouse.move(start.x+start.width/2,start.y+start.height/2);await original.mouse.down();await original.mouse.move(start.x+start.width/2,start.y+130,{steps:10});};
  const history=await state(original,id);await lift();await expect(original.locator('[data-tab-drag-phase=ready]')).toBeVisible();
  await original.screenshot({path:path.join(root,'tab-lift.png')});await original.keyboard.press('Escape');await original.mouse.up();
  expect(pages().length).toBe(count);expect((await state(original,id)).history.head).toEqual(history.history.head);await expect(tab).toBeVisible();
  let before=new Set(pages());await lift();await original.mouse.up();
  await original.evaluate(()=>window.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,clientX:300,clientY:180})));
  let editor=await nextPage(before);await inspector(editor);expect(pages().length).toBe(count+1);await expect(tab).toHaveCount(0);
  expect((await state(editor,id)).writable).toBe(true);expect((await state(original,id)).writable).toBe(false);
  await chooseTool(original,'Map library');before=new Set(pages());const work=await original.getByRole('button',{name:'Open work and workspace windows',exact:true}).boundingBox();
  await original.mouse.move(work.x+work.width/2,work.y+work.height/2);await original.mouse.down();await original.mouse.move(work.x+work.width/2,work.y+130,{steps:10});await original.mouse.up();
  const independent=await nextPage(before);await chooseTool(independent,'Features & workflows');
  for(const page of [original,editor,independent])await expect(orb(page)).toHaveAttribute('aria-expanded','false');
  await orb(original).click();await expect(orb(original)).toHaveAttribute('aria-expanded','true');
  // Force an ordinary shared appearance update too; transient menus must not
  // follow it, while the intentionally shared color must reach every window.
  await chooseTool(editor,'Settings & tools');await editor.getByRole('tab',{name:'Interface Studio',exact:true}).click();
  await editor.getByLabel('Monitor eye color',{exact:true}).fill('#f07abb');
  for(const page of [original,editor,independent])await expect.poll(()=>page.locator('html').evaluate(root=>getComputedStyle(root).getPropertyValue('--gs-monitor-eye-color').trim())).toBe('#f07abb');
  await expect(orb(original)).toHaveAttribute('aria-expanded','true');for(const page of [editor,independent])await expect(orb(page)).toHaveAttribute('aria-expanded','false');
  await orb(editor).click();await expect(orb(editor)).toHaveAttribute('aria-expanded','true');await expect(orb(independent)).toHaveAttribute('aria-expanded','false');
  await original.keyboard.press('Escape');await expect(orb(original)).toHaveAttribute('aria-expanded','false');await expect(orb(editor)).toHaveAttribute('aria-expanded','true');
  await editor.keyboard.press('Escape');await orb(independent).click();await expect(orb(original)).toHaveAttribute('aria-expanded','false');await expect(orb(editor)).toHaveAttribute('aria-expanded','false');await independent.keyboard.press('Escape');
  await expect(original.locator('.gs-workspace-shell')).toHaveAttribute('data-workspace','library');await expect(independent.locator('.gs-workspace-shell')).toHaveAttribute('data-workspace','features');
  const portrait=original.locator('[data-spark-emblem="app-monitor"]');await expect(portrait).toBeVisible();
  const portraitSource=await portrait.getAttribute('src');await expect(original.locator('.gs-spark-eye')).toBeVisible();
  expect(await portrait.evaluate(image=>image.complete&&image.naturalWidth===256&&image.naturalHeight===256)).toBe(true);
  // The native image is displayed through img-src self; do not weaken the
  // app's connect-src policy or add a rendering context to read it back.
  expect(portraitSource).toContain('/assets/icon-');
  const png=await fs.readFile(path.resolve('src-tauri/icons/icon.png'));
  await fs.writeFile(path.join(root,'monitor-source.png'),png,{flag:'wx'});
  await fs.writeFile(path.join(root,'monitor-source.json'),JSON.stringify({pngSha256:crypto.createHash('sha256').update(png).digest('hex'),capture:'Permanent application portrait served to the native WebView; no 3D header capture or source reads'}),{flag:'wx'});
  await original.screenshot({path:path.join(root,'monitor-pink.png')});
  await editor.getByLabel('Monitor eye color',{exact:true}).fill('#57dfff');
  for(const page of [original,editor,independent])await expect.poll(()=>page.locator('html').evaluate(root=>getComputedStyle(root).getPropertyValue('--gs-monitor-eye-color').trim())).toBe('#57dfff');
  expect(await portrait.getAttribute('src')).toBe(portraitSource);await expect(original.locator('.gs-spark-capture')).toHaveCount(0);
  await orb(original).hover();await original.screenshot({path:path.join(root,'monitor-glow.png')});
  const thirdLabel=await independent.evaluate(()=>window.__TAURI_INTERNALS__.metadata.currentWindow.label);
  await invoke(independent,'plugin:window|minimize',{label:thirdLabel});await expect.poll(()=>invoke(editor,'plugin:window|is_minimized',{label:thirdLabel})).toBe(true);
  await expect(orb(original)).toHaveAttribute('aria-expanded','false');await expect(editor.getByLabel('Monitor eye color',{exact:true})).toBeVisible();
  await invoke(editor,'plugin:window|unminimize',{label:thirdLabel});await invoke(independent,'plugin:window|maximize',{label:thirdLabel});await expect.poll(()=>invoke(independent,'plugin:window|is_maximized',{label:thirdLabel})).toBe(true);
  await invoke(independent,'plugin:window|unmaximize',{label:thirdLabel});
  const inventory=await invoke(original,'workspace_window_inventory'),beforeFailed=await state(editor,id);
  const refused=await invoke(editor,'open_project_window',{id,workspace:'unsupported-route',another:true}).then(()=>'',String);
  expect(refused).not.toBe('');expect((await invoke(original,'workspace_window_inventory')).map(w=>w.label).sort()).toEqual(inventory.map(w=>w.label).sort());
  expect((await state(editor,id)).history.head).toEqual(beforeFailed.history.head);expect((await state(editor,id)).writable).toBe(true);
  await editor.keyboard.press('F1');await expect(editor.getByRole('dialog',{name:'A familiar spark of possibility.',exact:true})).toBeVisible();
  for(const page of [original,independent])await expect(page.getByRole('dialog')).toHaveCount(0);
  await editor.keyboard.press('Escape');await editor.getByRole('button',{name:'Toggle workspace navigation',exact:true}).focus();await editor.keyboard.press('ArrowDown');
  await expect(orb(editor)).toHaveAttribute('aria-expanded','true');await expect(orb(original)).toHaveAttribute('aria-expanded','false');await expect(orb(independent)).toHaveAttribute('aria-expanded','false');
  await editor.keyboard.press('Escape');await expect(orb(editor)).toBeFocused();await editor.keyboard.press('F6');expect(await editor.evaluate(()=>!!document.activeElement?.closest('main.main-content'))).toBe(true);
  expect((await state(editor,id)).history.head).toEqual(beforeFailed.history.head);
  step('Native keyboard Help, workspace-menu arrows and F6 focus stay local without changing the shared source or Undo head',{windows:3,sourceUnchanged:true});
  await chooseTool(editor,'Level editor');await inspector(editor);await setX(editor,1.75);await acknowledged(editor,id,1.75);
  await editor.keyboard.press('Control+z');await expect(x(editor)).toHaveValue('1.5');await editor.keyboard.press('Control+y');await expect(x(editor)).toHaveValue('1.75');await editor.keyboard.press('Control+s');
  await original.locator('.gs-view-menu>summary').click();await original.getByRole('button',{name:'Save workspace windows',exact:true}).click();
  let layout;await expect.poll(async()=>{try{layout=await invoke(original,'read_workspace_layout');return layout.windows.length;}catch{return 0;}}).toBeGreaterThanOrEqual(3);
  expect(layout.windows.filter(w=>w.ownedDocuments?.includes(id))).toHaveLength(1);
  report.windowIndependence={nativeWindows:inventory.map(w=>({label:w.label,workspace:w.workspace,project:w.project,writable:w.writable})),cancelledDrag:true,duplicatePointerUpCreatedOneWindow:true,invalidRouteRefused:refused,singleWriter:true,sharedAppearanceOnly:true,cachedPortraitUnchanged:true,savedLayoutWindows:layout.windows.length};
  step('Three actual native windows keep Monitor menus, navigation and controls independent; eye tint shares appearance without recapturing its portrait; cancelled, duplicate and refused handoffs preserve one writer',report.windowIndependence);
  await close(original,'save');expect(editor.isClosed()).toBe(false);expect(independent.isClosed()).toBe(false);expect((await state(editor,id)).writable).toBe(true);
  await setX(editor,2);await acknowledged(editor,id,2);await editor.keyboard.press('Control+s');await expect.poll(async()=>(await state(editor,id)).history.head.dirty).toBe(false);const saved=await state(editor,id),pid=child.pid;
  for(const page of [...pages()].reverse())if(!page.isClosed())await close(page,'save');
  await waitForQaExit(child);await browser.close();await launchNative();
  await main.locator('.gs-view-menu>summary').click();await main.getByRole('button',{name:'Restore workspace windows',exact:true}).click();
  await expect.poll(()=>pages().length).toBeGreaterThanOrEqual(3);
  await expect.poll(()=>{editor=pages().find(page=>new URL(page.url()).searchParams.get('project')===id);return !!editor;}).toBe(true);await expect(editor.locator('.forge-viewport canvas')).toBeVisible();await inspector(editor);
  await expect(x(editor)).toHaveValue('2');const restored=await state(editor,id);expect(restored.history.head).toEqual(saved.history.head);expect(restored.writable).toBe(true);
  for(const page of pages())await expect(orb(page)).toHaveAttribute('aria-expanded','false');
  const after=await invoke(editor,'workspace_window_inventory');expect(after.filter(w=>w.project===id&&w.writable)).toHaveLength(1);expect(after.some(w=>w.project===null&&w.workspace==='features')).toBe(true);
  await expect.poll(()=>editor.locator('html').evaluate(root=>getComputedStyle(root).getPropertyValue('--gs-monitor-eye-color').trim())).toBe('#57dfff');
  await expect(editor.locator('[data-spark-emblem="app-monitor"]')).toBeVisible();expect(await editor.locator('[data-spark-emblem="app-monitor"]').getAttribute('src')).toBe(portraitSource);
  await expect(editor.locator('.gs-spark-capture')).toHaveCount(0);
  report.windowIndependence.restart={stoppedPid:pid,restartedPid:child.pid,restoredWindows:after.length,historyPreserved:true,sourcePreserved:true,menusClosed:true,eyeTintPreserved:true,cachedPortraitReused:true};
  step('Detached native editor keeps editing after the original closes; normal application restart restores the saved independent layout and exact source/Undo head',report.windowIndependence.restart);
}
async function projectDirectories(){return fs.readdir(path.join(root,'library/projects')).catch(error=>{if(error.code==='ENOENT')return[];throw error;});}
async function nativeMemoryLifecycle(){
  const original=await fs.readFile(path.resolve(nativeMap)),hash=crypto.createHash('sha256').update(original).digest('hex');
  const began=performance.now(),rows=[];
  async function openTags(opened){
    await main.reload();await chooseTool(main,'Map library');await main.locator(`.map-card[data-project-id="${opened.project.id}"]`).click();await chooseTool(main,'Tag editor');
    const pistol=opened.inspection.tags.find(tag=>tag.class==='weap'&&tag.path.replaceAll('\\','/').endsWith('weapons/pistol/pistol'));
    if(!pistol)throw Error('Native memory fixture needs the actual pistol');
    await main.getByRole('textbox',{name:'Search tags',exact:true}).fill(pistol.path);
    await main.getByRole('combobox',{name:'Filter tag class',exact:true}).selectOption('weap');
    await main.locator('.tag-row').filter({has:main.locator('strong',{hasText:/^pistol$/})}).click();
    const radius=main.getByRole('spinbutton',{name:'Bounding radius',exact:true});await expect(radius).toBeVisible();return{radius,pistol};
  }
  for(let index=0;index<20;index++){
    const [opened]=await invoke(main,'import_paths',{paths:[path.resolve(nativeMap)]});await openTags(opened);
    const entries=(await invoke(main,'bootstrap')).entries;expect(entries).toHaveLength(1);expect(entries[0].sessionOnly).toBe(true);
    expect(await fs.realpath(opened.project.source.preservedPath)).toBe(await fs.realpath(path.resolve(nativeMap)));
    await main.getByRole('button',{name:'Close map '+opened.project.title,exact:true}).click();
    await expect(main.getByRole('tablist',{name:'Open maps',exact:true})).toHaveCount(0);
    await expect.poll(async()=>(await invoke(main,'bootstrap')).entries.length).toBe(0);expect(await projectDirectories()).toEqual([]);
    rows.push({cycle:index+1,sparkProjectDirectories:0,savedCopies:0});
  }
  const [opened]=await invoke(main,'import_paths',{paths:[path.resolve(nativeMap)]});let {radius,pistol}=await openTags(opened);
  await radius.fill('0.123');await radius.press('Tab');
  await main.getByRole('button',{name:'Close map '+opened.project.title,exact:true}).click();
  let dialog=main.getByRole('dialog',{name:'Save changes before closing?',exact:true});await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(radius).toHaveValue('0.123');expect(await projectDirectories()).toEqual([]);
  await main.getByRole('button',{name:'Close window',exact:true}).click();dialog=main.getByRole('dialog',{name:'Save changes before closing?',exact:true});await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'Cancel',exact:true}).click();expect(main.isClosed()).toBe(false);await expect(radius).toHaveValue('0.123');
  const before=new Set(pages());await main.locator(`[data-map-tab-id="${opened.project.id}"] [role="tab"]`).click({button:'right'});await main.getByRole('menuitem',{name:'Move to another window',exact:true}).click();
  const child=await nextPage(before);await chooseTool(child,'Tag editor');const childRadius=child.getByRole('spinbutton',{name:'Bounding radius',exact:true});
  await child.getByRole('textbox',{name:'Search tags',exact:true}).fill(pistol.path);await child.getByRole('combobox',{name:'Filter tag class',exact:true}).selectOption('weap');await child.locator('.tag-row').filter({has:child.locator('strong',{hasText:/^pistol$/})}).click();
  await expect(childRadius).toHaveValue('0.123');expect((await state(main,opened.project.id)).writable).toBe(false);expect((await state(child,opened.project.id)).writable).toBe(true);
  await child.keyboard.press('Control+z');await expect(childRadius).not.toHaveValue('0.123');await child.keyboard.press('Control+y');await expect(childRadius).toHaveValue('0.123');
  await child.getByRole('button',{name:'Return map to workspace',exact:true}).click();await expect.poll(async()=>(await state(main,opened.project.id)).writable).toBe(true);await close(child);await expect(radius).toHaveValue('0.123');expect(await projectDirectories()).toEqual([]);
  await main.getByRole('button',{name:'Close map '+opened.project.title,exact:true}).click();dialog=main.getByRole('dialog',{name:'Save changes before closing?',exact:true});await dialog.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(main.getByRole('tablist',{name:'Open maps',exact:true})).toHaveCount(0);const file=path.join(root,'library/projects',opened.project.id,'project.gsproject');
  const saved=await fs.readFile(file);expect((JSON.parse(saved).tagEdits.find(edit=>edit.tagId===pistol.id&&edit.fieldKey==='bounding-radius'))?.value).toBe(.123);
  expect(await fs.stat(path.join(root,'library/projects',opened.project.id,'source.map')).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;})).toBe(false);
  ({radius}=await openTags(await invoke(main,'open_project',{id:opened.project.id})));await radius.fill('0.456');await radius.press('Tab');
  await main.getByRole('button',{name:'Close map '+opened.project.title,exact:true}).click();dialog=main.getByRole('dialog',{name:'Save changes before closing?',exact:true});await dialog.getByRole('button',{name:'Discard changes',exact:true}).click();await expect(main.getByRole('tablist',{name:'Open maps',exact:true})).toHaveCount(0);expect(await fs.readFile(file)).toEqual(saved);
  ({radius}=await openTags(await invoke(main,'open_project',{id:opened.project.id})));await expect(radius).toHaveValue('0.123');await main.getByRole('button',{name:'Close map '+opened.project.title,exact:true}).click();await expect(main.getByRole('tablist',{name:'Open maps',exact:true})).toHaveCount(0);
  expect(crypto.createHash('sha256').update(await fs.readFile(path.resolve(nativeMap))).digest('hex')).toBe(hash);
  report.memoryLifecycle={rows,milliseconds:performance.now()-began,actualNativeSource:true,mockedIpc:false,noSavedMapCopies:true,cancelRetainedEdit:true,windowCloseCancel:true,ramWindowHandoffAndUndoRedo:true,explicitSaveAndDiscardReopen:true,originalSourceUnchanged:true};
  step('Twenty actual map inspect/close cycles create no project copies; RAM window handoff, Cancel, explicit Save and Discard/reopen preserve source and history',report.memoryLifecycle);
}
async function nativeTagAnimation(opened){
      const actor=opened.inspection.tags.find(tag=>tag.class==='bipd'&&tag.references.some(ref=>ref.label==='Animation graph'));
      if(!actor)throw Error('Native animation acceptance requires a real biped with its own graph');
      await chooseTool(main,'Tag editor');await main.getByRole('textbox',{name:'Search tags',exact:true}).fill(actor.path);await main.getByRole('combobox',{name:'Filter tag class',exact:true}).selectOption('bipd');await main.locator('.tag-row').click();
      const area=main.getByRole('region',{name:'Actual model preview',exact:true}),preview=area.locator('.native-model-preview');
      await expect(preview).toHaveAttribute('data-model-ready','true',{timeout:90000});
      const canvas=area.locator('canvas');await canvas.evaluate(element=>window.c71PreviewCanvas=element);
      await main.getByRole('tab',{name:'Animation',exact:true}).click();
      const animate=area.getByRole('checkbox',{name:'Native animation',exact:true});await animate.check();
      await expect.poll(async()=>Number(await preview.getAttribute('data-native-animation-count')),{timeout:90000}).toBeGreaterThan(0);
      const clipCount=Number(await preview.getAttribute('data-native-animation-count'));
      const frame=()=>canvas.evaluate(element=>JSON.parse(element.dataset.gsAnimation??'null'));
      await expect.poll(async()=>(await frame())?.source).toBe('verified-skeletal-animation');
      const initial=await frame();expect(initial.bones).toBeGreaterThan(0);expect(initial.frames).toBeGreaterThan(1);expect(initial.samplePosition.every(Number.isFinite)).toBe(true);await expect.poll(async()=>(await frame())?.time).toBeGreaterThan(initial.time+.1);
      await area.getByRole('button',{name:'Pause model animation',exact:true}).click();await expect.poll(async()=>(await frame())?.playing).toBe(false);
      const paused=await frame();await main.waitForTimeout(150);expect((await frame()).time).toBe(paused.time);
      await main.getByRole('tab',{name:'Materials',exact:true}).click();await main.getByRole('tab',{name:'Animation',exact:true}).click();expect((await frame()).time).toBe(paused.time);
      await area.getByRole('button',{name:'Play model animation',exact:true}).click();await expect.poll(async()=>(await frame())?.time).toBeGreaterThan(paused.time);
      await main.screenshot({path:path.join(root,'native-tag-animation.png')});
      await animate.uncheck();await expect.poll(()=>canvas.evaluate(element=>element.dataset.gsAnimation??null)).toBeNull();
      expect(await canvas.evaluate(element=>element===window.c71PreviewCanvas)).toBe(true);
      report.tagAnimation={actorPath:actor.path,clips:clipCount,bones:initial.bones,source:initial.source,pausedTime:paused.time,sameCanvas:true,gameplayAccepted:false};
      step('Actual Tag Inspector plays and pauses the selected biped native skeleton/animation, then restores its static model without replacing the viewport');
}
async function reviewNativeScene(id,label,requireNormalExit=false,receipt=report.logicRoundTrip){
      // Explicit, bounded operator review of the existing installed-tool UI.
      // Process launch/exit never asserts game loading or trigger traversal.
      const testScene=main.locator('.runtime-dock').getByRole('button',{name:/^Test Scene/});
      // The dock resolves real source/tool readiness asynchronously on reopen.
      // A setup action remains clickable to explain missing prerequisites.
      await expect(testScene).toContainText('Ready');await testScene.click();
      const dialog=main.getByRole('dialog',{name:'Open Standalone scene test',exact:true});await expect(dialog).toBeVisible();
      await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Open tool',exact:true}).click();
      let game;await expect.poll(async()=>{game=(await invoke(main,'runtime_tool_processes')).find(p=>p.projectId===id&&p.actionId==='testScene');return !!game;}).toBe(true);
      const trial={label,projectId:id,processId:game.processId,executable:game.executable,executableSha256:game.executableSha256,tagsDirectory:game.tagsDirectory,gameLoaded:null,gameplayVerified:false,startedAt:new Date().toISOString()};
      await fs.writeFile(path.join(root,`logic-${label}-game-review.json`),JSON.stringify(trial,null,2),{flag:'wx'});console.log('NATIVE_GAME_REVIEW',JSON.stringify(trial));
      await expect.poll(async()=>{game=(await invoke(main,'runtime_tool_processes')).find(p=>p.processId===trial.processId);return game?.status;},{timeout:180000,intervals:[1000,2500]}).not.toBe('running');
      const diagnostics=[];
      for(const name of ['debug.txt','reports/debug.txt']){
        const file=path.join(path.dirname(trial.tagsDirectory),name),info=await fs.lstat(file).catch(()=>null);
        if(!info?.isFile()||info.isSymbolicLink()||info.size>4*1024**2)continue;
        const bytes=await fs.readFile(file);diagnostics.push({file:name,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),tail:bytes.subarray(-65536).toString('utf8')});
      }
      // Preserve the actual failed exit and bounded native diagnostics before
      // disposal too. A failed game must never leave only a launch receipt.
      const result={...trial,status:game?.status??'unknown',exitCode:game?.exitCode??null,closedAt:new Date().toISOString(),diagnostics};
      // Retain the actual native failure before asserting; a rejected exit
      // must not throw away the diagnostics we just collected.
      if(label==='control')receipt.controlTrial=result;
      else receipt.standaloneProcessTrial=result;
      if(requireNormalExit)expect(game?.exitCode,'Close the observed game normally; a process exit is not gameplay acceptance').toBe(0);
      step(`Installed Standalone ${label} process observed; scene loading and gameplay require separate visual evidence`,result);return result;
}
try{
  await physicalSample('before-launch');
  await launchNative();
  const boot=await invoke(main,'bootstrap');await invoke(main,'save_settings',{settings:{...boot.settings,onboardingCompleted:true,autoBuild:false}});
  if(launchOnly){expect(path.resolve(boot.dataDirectory)).toBe(path.join(root,'library'));await expect(main.locator('#root')).not.toBeEmpty();step('Actual embedded app starts with its isolated library and no mocked IPC',{url:main.url()});}
  if(memoryAcceptance){expect(boot.memoryFirst).toBe(true);expect(boot.settings.watchSharedMccInbox).toBe(false);await nativeMemoryLifecycle();}
  if(geometryOnly){
    const {nativeGeometryRoundTrip}=await import('./native-geometry-roundtrip.mjs');
    await nativeGeometryRoundTrip({main,root,invoke,expect,report,step,invaderDirectory,run:runOwned});
  }
  if(logicOnly&&crossRuntime){
    const {nativeCrossRuntimeAssetRoundTrip}=await import('./native-logic-roundtrip.mjs');
    report.crossRuntime={stage:'starting real cross-runtime UI workflow',pairs:[],mockedIpc:false,gameplayVerified:false};
    if(process.env.SPARK_QA_MEGAWORLD_ONLY==='1'&&(!process.env.SPARK_QA_MEGAWORLD_BASE||!process.env.SPARK_QA_MEGAWORLD_DONOR))throw Error('Select the two owned MegaWorld source maps');
    if(process.env.SPARK_QA_MEGAWORLD_ONLY!=='1'){
    const donors=[process.env.SPARK_LOGIC_CE_SCENERY,process.env.SPARK_LOGIC_CE_VEHICLE];if(!donors.every(Boolean))throw Error('Select two owned CE donor caches');
    await nativeCrossRuntimeAssetRoundTrip({page:main,root,kit:path.resolve(process.env.SPARK_LOGIC_KIT),tags:path.resolve(process.env.SPARK_LOGIC_TAGS),invader:path.resolve(invaderDirectory),cache:path.resolve(nativeMap),donors:donors.map(value=>path.resolve(value)),call:(command,args)=>invoke(main,command,args),receipt:report.crossRuntime,expect,run:runOwned,retain:finishStorage.retain,reviewControl:process.env.SPARK_LOGIC_GAME_REVIEW==='1'?(id,record)=>reviewNativeScene(id,'control',true,record):undefined});
    step('Two real CE donor asset classes drag into separate MCC authoring documents and compile independently');
    }
    if(process.env.SPARK_QA_MEGAWORLD_BASE&&process.env.SPARK_QA_MEGAWORLD_DONOR){
      report.megaWorldCreation={};const {nativeMegaWorldCreation}=await import('./native-logic-roundtrip.mjs');
      await nativeMegaWorldCreation({page:main,call:(command,args)=>invoke(main,command,args),receipt:report.megaWorldCreation,expect,root,run:runOwned,invader:path.resolve(invaderDirectory),baseFile:process.env.SPARK_QA_MEGAWORLD_BASE,donorFile:process.env.SPARK_QA_MEGAWORLD_DONOR});
      step('File/New creates an independent native two-source world, then Save and reopen retain its plan');
    }

    const pid=child.pid;
    for(const view of [...pages()].reverse())if(!view.isClosed())await close(view,'save');
    await waitForQaExit(child);await browser.close();await launchNative();
    for(const pair of report.crossRuntime.pairs){const reopened=await invoke(main,'open_project',{id:pair.targetProjectId}),history=await state(main,pair.targetProjectId);
      expect(reopened.project.quickForge).toEqual(pair.savedProject.quickForge);expect(reopened.project.scene).toEqual(pair.savedProject.scene);expect(reopened.project.nativeAssetImports).toEqual(pair.savedProject.nativeAssetImports);expect(history.history.head).toEqual(pair.savedHistory.head);
      pair.fullProcessRestart={stoppedPid:pid,restartedPid:child.pid,sourceImportsAndUndoPreserved:true};delete pair.savedProject;delete pair.savedHistory;
    }
    if(report.crossRuntime.pairs.length){
    step('Both cross-runtime destinations survive full process restart with native dependencies and the same Undo head');
    const projectId=report.crossRuntime.pairs[0].targetProjectId;
    await chooseTool(main,'Map library');await main.locator(`.map-card[data-project-id="${projectId}"]`).click();
    await expect(main.locator(`.map-tab[data-map-tab-id="${projectId}"] [role="tab"]`)).toHaveAttribute('aria-selected','true');
    if(await main.locator('.gs-workspace-shell').getAttribute('data-workspace')!=='level')await chooseTool(main,'Level editor');
    const fileBounds=await main.getByLabel('File menu',{exact:true}).boundingBox(),toolsButtonBounds=await main.getByLabel('More workspace drawers',{exact:true}).boundingBox();
    const maps=await main.getByLabel('Choose open map',{exact:true}).boundingBox(),tabs=await main.getByRole('tablist',{name:'Open maps',exact:true}).boundingBox();expect(maps.x+maps.width).toBeLessThanOrEqual(tabs.x+1);expect(fileBounds.x+fileBounds.width).toBeLessThanOrEqual(toolsButtonBounds.x+1);expect(toolsButtonBounds.x+toolsButtonBounds.width).toBeLessThanOrEqual(maps.x+1);
    await main.getByLabel('More workspace drawers',{exact:true}).click();const tools=main.getByRole('menu',{name:'Workspace drawers',exact:true});await expect(tools).toBeVisible();
    const toolBounds=await tools.boundingBox();expect(toolBounds.height).toBeLessThan(430);expect(toolBounds.width).toBeLessThanOrEqual(322);expect(toolBounds.x).toBeGreaterThanOrEqual(7);
    await tools.screenshot({path:path.join(root,'runtime-catalog-tools.png')});
    await main.keyboard.press('Escape');await main.getByLabel('File menu',{exact:true}).click();const fileMenu=main.getByRole('menu',{name:'File commands',exact:true});await expect(fileMenu.getByRole('menuitem',{name:'Save',exact:true})).toBeEnabled();await fileMenu.screenshot({path:path.join(root,'runtime-catalog-file.png')});await fileMenu.getByRole('menuitem',{name:'Save As…',exact:true}).click();
    await expect(main.locator(`.smart-edit[data-smart-edit-project="${projectId}"]:visible`)).toHaveAttribute('open','');await chooseTool(main,'Level editor');await main.getByLabel('More workspace drawers',{exact:true}).click();
    const prior=new Set(pages()),head=(await state(main,projectId)).history.head;await tools.getByRole('menuitem',{name:'New workspace window',exact:true}).click();
    const extra=await nextPage(prior);await chooseTool(extra,'Learning center');await expect(main.locator('.gs-workspace-shell')).toHaveAttribute('data-workspace','level');expect((await state(main,projectId)).writable).toBe(true);expect((await state(main,projectId)).history.head).toEqual(head);await close(extra);
    report.crossRuntime.headerWorkflow={mapsBeforeTabs:true,toolsBounds:toolBounds,newIndependentWindow:true,originalNavigationAndUndoUnchanged:true};
    step('Compact Tools opens a real independent workspace without moving the original map or changing its Undo head');
    const worldId=report.crossRuntime.pairs[1].targetProjectId;await chooseTool(main,'Map library');await main.locator(`.map-card[data-project-id="${worldId}"]`).click();await chooseTool(main,'Build & playtest');
    await expect(main.getByText('Checking saved map dependencies…',{exact:true})).toHaveCount(0,{timeout:60000});
    const build=main.locator('.build-page'),breadcrumb=await main.locator('.editor-bar .breadcrumb').getByRole('button',{name:'Library',exact:true}).boundingBox(),monitor=await main.locator('.gs-spark-emblem').boundingBox();
    expect(breadcrumb.x).toBeGreaterThan(monitor.x+monitor.width+3);const buildBounds=await build.locator('.build-columns').boundingBox();expect(buildBounds.height).toBeLessThan(710);
    await expect(build.locator('.build-conversion')).not.toHaveAttribute('open','');await expect(build.locator('.build-resources')).not.toHaveAttribute('open','');
    await main.screenshot({path:path.join(root,'runtime-catalog-build.png')});report.crossRuntime.buildWorkflow={compactBounds:buildBounds,breadcrumbClearOfMonitor:true,sourceAndHistoryDetailsExpandable:true};
    step('Native Build keeps its controls compact and the Library breadcrumb clear of the cached Monitor');
    const sourceId=report.crossRuntime.sourceProjectIds[0];await chooseTool(main,'Map library');await main.locator(`.map-card[data-project-id="${sourceId}"]`).click();await chooseTool(main,'Tag editor');
    await main.getByLabel('Filter tag class',{exact:true}).selectOption('scen');await main.getByRole('textbox',{name:'Search tags',exact:true}).fill('scenery\\rocks\\boulder\\boulder');await main.locator('.tag-row').filter({has:main.locator('strong',{hasText:/^boulder$/})}).click();
    await main.getByLabel('File menu',{exact:true}).click();await main.getByRole('menu',{name:'File commands',exact:true}).getByRole('menuitem',{name:'Export tag + dependencies…',exact:true}).click();
    await expect.poll(async()=>{const rows=await invoke(main,'list_tag_exchanges');return rows.find(row=>row.sourceProjectId===sourceId&&row.requestedTag.replaceAll('\\','/').includes('scenery/rocks/boulder/boulder'))?.fileCount;},{timeout:120000}).toBe(5);
    report.crossRuntime.fileWorkflow={sourceAwareTagExtraction:true,tagFiles:5,nativeMapSaveAsPlanVisible:true,realFileSave:true,projectDescriptorDialogTested:false};
    for(const original of report.crossRuntime.originalInputs)expect(crypto.createHash('sha256').update(await fs.readFile(original.file)).digest('hex')).toBe(original.sha256);
    step('File saves the real document, opens its native Save As plan and extracts the selected source tag through Invader');
    }

  }
  if(logicOnly&&!crossRuntime){
    const {nativeLogicRoundTrip}=await import('./native-logic-roundtrip.mjs');
    report.logicRoundTrip={appSha256:report.appSha256,sourceCacheSha256:crypto.createHash('sha256').update(await fs.readFile(path.resolve(nativeMap))).digest('hex'),mockedIpc:false,gameplayVerified:false,externalGuiEdited:false};
    await nativeLogicRoundTrip({page:main,root,kit:path.resolve(process.env.SPARK_LOGIC_KIT??''),tags:path.resolve(process.env.SPARK_LOGIC_TAGS??''),invader:path.resolve(invaderDirectory),cache:path.resolve(nativeMap),call:(command,args)=>invoke(main,command,args),receipt:report.logicRoundTrip,expect,run:runOwned,verifyEditedAsset:true,reviewControl:process.env.SPARK_LOGIC_GAME_REVIEW==='1'?id=>reviewNativeScene(id,'control'):undefined});
    step('Actual edited native asset import, door/trigger authoring, Undo/Save/reopen and native build',report.logicRoundTrip);
    const {nativeWorldMachineRoundTrip}=await import('./native-logic-roundtrip.mjs');report.worldMachineRoundTrip={};
    const nativeDonor=(await invoke(main,'open_project',{id:report.logicRoundTrip.projectId})).project.nativeAssetImports.find(binding=>binding.tagClass==='mach');
    expect(nativeDonor,'Use the validated edited-copy donor, not the source with pending tag edits').toBeTruthy();
    await nativeWorldMachineRoundTrip({page:main,root,cache:path.resolve(nativeMap),compiled:report.logicRoundTrip.nativeBuild.build.output,donorProjectId:nativeDonor.sourceProjectId,call:(command,args)=>invoke(main,command,args),receipt:report.worldMachineRoundTrip,expect,run:runOwned,invader:path.resolve(invaderDirectory)});
    step('Actual imported-map World native door drop, copied placement, Undo/Save/reopen and independent scenario readback',report.worldMachineRoundTrip);

    const id=report.logicRoundTrip.projectId,before=await invoke(main,'open_project',{id}),beforeHistory=await state(main,id),pid=child.pid;
    report.logicRoundTrip.beforeProcessClose={inventory:await invoke(main,'workspace_window_inventory'),pages:await Promise.all(pages().map(async page=>({url:page.url(),label:await page.evaluate(()=>window.__TAURI_INTERNALS__.metadata.currentWindow.label)})))};
    for(const view of [...pages()].reverse())if(!view.isClosed())await close(view,'save');
    await waitForQaExit(child);await browser.close();await launchNative();
    const reopened=await invoke(main,'open_project',{id}),restored=await state(main,id);
    expect(reopened.project.quickForge).toEqual(before.project.quickForge);expect(reopened.project.nativeAssetImports).toEqual(before.project.nativeAssetImports);
    expect(reopened.project.builds).toEqual(before.project.builds); // Native metadata must survive independently of an authored dirty flag.
    report.logicRoundTrip.reopenedNativeBuild=await invoke(main,'quickforge_build_report',{projectId:id});
    expect(report.logicRoundTrip.reopenedNativeBuild.current).toBe(true);
    expect(restored.history.head).toEqual(beforeHistory.history.head);expect(restored.history.revision).toBe(beforeHistory.history.revision);
    await chooseTool(main,'Map library');await main.locator(`.map-card[data-project-id="${id}"]`).click();await chooseTool(main,'Level editor');
    const canvas=main.locator('.forge-viewport canvas');await expect(canvas).toBeVisible();
    report.logicRoundTrip.processReopen={stoppedPid:pid,restartedPid:child.pid,sourceAndImportsPreserved:true,undoHeadPreserved:true,nativeWindowReopened:true};
    step('Authored native asset and logic survive a normal process close/restart with the same Undo head',report.logicRoundTrip.processReopen);
    if(process.env.SPARK_LOGIC_GAME_REVIEW==='1')report.logicRoundTrip.standaloneProcessTrial=await reviewNativeScene(id,'authored',true);
  }

  if(report.megaWorldCreation){
    const world=(await invoke(main,'open_project',{id:report.megaWorldCreation.projectId})).project;expect(world.bspAssembly).toEqual(report.megaWorldCreation.plan);expect(world.source.sha256).toBe(report.megaWorldCreation.sourceHash);expect(world.scene.length).toBe(report.megaWorldCreation.sourceObjectCount);
    await chooseTool(main,'Map library');await main.locator('.map-card').filter({has:main.getByRole('heading',{name:world.title,exact:true})}).click();await chooseTool(main,'Level editor');await openDrawer(main,'Construction');
    await expect(main.getByLabel('BSP donor map',{exact:true})).toHaveValue(world.bspAssembly.donorProjectId);
    await expect(main.getByLabel('Donor BSP section',{exact:true})).toHaveValue(String(world.bspAssembly.donorBspIndex));
    await expect(main.locator('.bsp-assembly .bsp-error')).toHaveCount(0);
    report.megaWorldCreation.fullProcessRestart=true;report.megaWorldCreation.reopenedNativeDonorControls=true;
    const field=main.getByRole('spinbutton',{name:'Tunnel width',exact:true});await field.fill('2.5');await field.press('Enter');await main.getByRole('button',{name:'Apply connection',exact:true}).click();
    const saved=async()=>{await main.getByLabel('File menu',{exact:true}).click();await main.getByRole('menu',{name:'File commands',exact:true}).getByRole('menuitem',{name:'Save',exact:true}).click();await expect.poll(async()=>(await state(main,world.id)).history?.head.dirty).toBe(false);return (await invoke(main,'open_project',{id:world.id})).project;};
    expect((await saved()).bspAssembly.tunnelWidth).toBe(2.5);await main.keyboard.press('Control+z');expect((await saved()).bspAssembly.tunnelWidth).toBe(2);await main.keyboard.press('Control+y');expect((await saved()).bspAssembly.tunnelWidth).toBe(2.5);
    report.megaWorldCreation.editedAfterRestart=true;report.megaWorldCreation.undoRedoImmediateSave=true;
    await main.getByRole('button',{name:'Check tunnel clearance',exact:true}).click();
    await expect.poll(async()=>await main.locator('.bsp-assembly .bsp-error').count()?'blocked':(await main.locator('.bsp-assembly').innerText()).includes('Source clearance checked at')?'checked':'working',{timeout:180000}).not.toBe('working');
    const failure=main.locator('.bsp-assembly .bsp-error');if(await failure.count()){report.megaWorldCreation.sourceClearance={accepted:false,error:await failure.innerText()};throw Error('Native source clearance failed: '+report.megaWorldCreation.sourceClearance.error);}
    report.megaWorldCreation.sourceClearance={accepted:true,scope:'Source reconstruction and capsule diagnostics; no compiled-map or gameplay acceptance',summary:(await main.locator('.bsp-assembly').innerText()).match(/Source clearance checked at[^\n]*/)?.[0]};
    await main.screenshot({path:path.join(root,'megaworld-source-check.png')});step('Saved source-bound donor controls support edited width, Undo/Redo, immediate Save and actual native source clearance');
    if(process.env.SPARK_QA_MEGAWORLD_COMPILE==='1'){
      await main.getByRole('button',{name:'Build & playtest connection',exact:true}).click();await expect(main.locator('.gs-workspace-shell')).toHaveAttribute('data-workspace','build');
      const build=main.getByRole('button',{name:'Convert map to MCC',exact:true});await expect(build).toBeEnabled({timeout:90000});await build.click();
      let output;const began=performance.now();await expect.poll(async()=>{const project=(await invoke(main,'open_project',{id:world.id})).project;output=project.builds.findLast(row=>row.status==='validated'&&row.output);const log=(await invoke(main,'bootstrap')).logs.findLast(row=>row.projectId===world.id);if(log?.phase==='failed')throw Error(log.message);return output?.status;},{timeout:900000,intervals:[1500,3000]}).toBe('validated');
      const inspected=await invoke(main,'open_built_map',{projectId:world.id,buildId:output.id});expect(inspected.inspection.header.version).toBe(13);expect(inspected.inspection.mesh.parts.length).toBe(1);expect(inspected.inspection.mesh.indices.length).toBeGreaterThan(30000);
      const extracted=path.join(root,'independent-native-tags','megaworld');await fs.mkdir(extracted);const scenario=inspected.inspection.tags.find(row=>row.class==='scnr').path+'.scenario',bsp=inspected.inspection.tags.find(row=>row.class==='sbsp').path+'.scenario_structure_bsp';
      for(const tag of [scenario,bsp]){const extraction=await runOwned(path.join(invaderDirectory,'invader-extract.exe'),['-s',tag,'-t',extracted,output.output],{windowsHide:true,timeout:180000,maxBuffer:8*1024**2});expect(extraction.stdout+'\n'+extraction.stderr).not.toMatch(/Failed to extract|ERROR:/i);}
      const crc=Number((await runOwned(path.join(invaderDirectory,'invader-info.exe'),['-T','crc32_mismatched',output.output],{windowsHide:true,timeout:30000})).stdout.trim());expect(crc).toBe(0);
      const read=async(tag,field)=>(await runOwned(path.join(invaderDirectory,'invader-edit.exe'),['-t',extracted,'-G',field,tag],{windowsHide:true,timeout:30000})).stdout.trim();
      const ref=await read(scenario,'structure_bsps[0].structure_bsp');expect(ref.replaceAll('\\','/').toLowerCase()).toBe(bsp.replaceAll('\\','/').toLowerCase());
      report.megaWorldCreation.nativeCompilation={accepted:true,target:'mcc-cea',mapSha256:crypto.createHash('sha256').update(await fs.readFile(output.output)).digest('hex'),bytes:(await fs.stat(output.output)).size,milliseconds:Math.round(performance.now()-began),collisionTriangles:inspected.inspection.mesh.indices.length/3,independentBspReference:ref,crcMismatch:crc};
      const retained=path.join(root,'native-output','megaworld.map');await fs.copyFile(output.output,retained,fs.constants.COPYFILE_EXCL);await finishStorage.retain(retained,'Owner-requested independently verified Timberland–Sidewinder native cache for gameplay acceptance');report.megaWorldCreation.nativeCompilation.retainedOutput=retained;
      for(const input of report.megaWorldCreation.originals)expect(crypto.createHash('sha256').update(await fs.readFile(input.file)).digest('hex')).toBe(input.sha256);
      report.megaWorldCreation.originalMapsUnchangedAfterCompilation=true;
      step('Native combined Timberland–Sidewinder cache compiled and independently reopened; player traversal remains unverified');
      if(process.env.SPARK_LOGIC_GAME_REVIEW==='1'){
        await chooseTool(main,'Map library');await main.locator(`.map-card[data-project-id="${world.id}"]`).click();await chooseTool(main,'Level editor');
        await reviewNativeScene(world.id,'megaworld',true,report.megaWorldCreation);
      }
    }


  }
  if(!nativeOnly&&!geometryOnly&&!logicOnly&&!launchOnly){
  const a=await invoke(main,'create_quickforge_project',{title:'C59 map A',template:'smallIndoorArena',target:'haloCustomEdition'});
  const b=await invoke(main,'create_quickforge_project',{title:'C59 map B',template:'smallIndoorArena',target:'haloCustomEdition'});
  await invoke(main,'create_quickforge_project',{title:'C59 map C',template:'smallIndoorArena',target:'haloCustomEdition'});
  await main.reload();await openProject(main,'C59 map A');await inspector(main,true);
  await setX(main,0.5);await acknowledged(main,a.project.id,0.5);
  await main.locator('.forge-viewport canvas').evaluate(canvas=>{window.c59OriginalCanvas=canvas;});
  await panel(main).getByLabel('Inspector drawer options',{exact:true}).click();await main.getByLabel('Inspector position',{exact:true}).selectOption('float');await main.getByLabel('Inspector size',{exact:true}).fill('420');await panel(main).getByLabel('Inspector drawer options',{exact:true}).click();
  const before=new Set(pages()),handle=await panel(main).locator('.gs-panel-drag').boundingBox();
  if(detachMethod==='button')await panel(main).getByRole('button',{name:'Detach Inspector',exact:true}).click();
  else{await main.mouse.move(handle.x+30,handle.y+handle.height/2);await main.mouse.down();await main.mouse.move(-45,-45,{steps:15});await main.mouse.up();}
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
  expect(rejected).toContain('Editing moved to another window. Retained in-memory draft ');
  // A legitimate autosave may acknowledge the same content while the rejected
  // observer request is in flight. Verify source content and ownership rather
  // than incorrectly forbidding that unrelated saved/dirty history transition.
  const afterRefusal=await state(main,a.project.id);
  expect(afterRefusal.history.revision).toBeGreaterThanOrEqual(committed.history.revision);
  expect(afterRefusal.project.quickForge).toEqual(committed.project.quickForge);
  expect(afterRefusal.project.title).toBe('C59 map A');expect(afterRefusal.writable).toBe(false);
  const journal=path.join(root,'library','projects',a.project.id,'window-history');
  const rejectedFiles=(await fs.readdir(journal).catch(error=>{if(error.code==='ENOENT')return[];throw error;})).filter(name=>name.startsWith('rejected-'));
  expect(rejectedFiles).toEqual([]); // Automatic refusal retains RAM, not an implicit disk Save.
  const draftFile=await invoke(main,'retain_workspace_draft',{projectId:a.project.id,revision:committed.history.revision,head:{...committed.history.head,current:key},snapshots:[{key,project:stale}]});
  expect(await fs.realpath(path.dirname(draftFile))).toBe(await fs.realpath(journal));
  const draft=JSON.parse(await fs.readFile(draftFile,'utf8'));
  expect(draft.accepted).toBe(false);expect(draft.projectId).toBe(a.project.id);
  // serde_json::Value widens native f32 vectors to their exact f64 numeric
  // value. Compare these declared Vec3/color/angle fields at exact native precision;
  // keep every other field and the entire snapshot shape strictly equal.
  const nativeDraftProject=value=>{
    const p=structuredClone(value),q=p.quickForge;
    for(const item of q.geometry)for(const field of ['position','rotation','dimensions'])item[field]=item[field].map(Math.fround);
    for(const item of q.spawns){item.position=item.position.map(Math.fround);item.facing=Math.fround(item.facing);}
    for(const item of q.materials)item.color=item.color.map(Math.fround);
    return p;
  };
  expect(draft.snapshots.map(row=>({...row,project:nativeDraftProject(row.project)}))).toEqual([{key,project:nativeDraftProject(stale)}]);expect(draft.head.current).toBe(key);
  expect((await state(main,a.project.id)).project.title).toBe('C59 map A');
  step(`${detachMethod==='pointer'?'Pointer drag':'Native button'} detaches the actual Inspector; authoritative history converges; stale observer writes are refused, RAM retention is reported and deliberate draft export preserves native-typed content`);
  await detached.screenshot({path:path.join(root,'detached-inspector.png')});
  await chooseTool(detached,'Map library');await expect(detached.locator('.gs-workspace-shell')).toHaveAttribute('data-workspace','library');await expect(detached.locator('.gs-workspace-shell')).not.toHaveAttribute('data-detached-panel');
  await chooseTool(detached,'Level editor');await expect(detached.locator('.gs-workspace-shell')).toHaveAttribute('data-detached-panel','forge-inspector');await inspector(detached);
  await openProject(main,'C59 map B');await inspector(main,true);
  const writes=await Promise.allSettled([setX(main,2.5),setX(detached,1.5)]);expect(writes.every(result=>result.status==='fulfilled')).toBe(true);
  await acknowledged(main,b.project.id,2.5);await acknowledged(detached,a.project.id,1.5);
  await detached.getByRole('button',{name:'Close window',exact:true}).click();
  const closeReview=detached.getByRole('dialog',{name:'Save changes before closing?',exact:true});await expect(closeReview).toBeVisible();
  await closeReview.getByRole('button',{name:'Cancel',exact:true}).click();expect(detached.isClosed()).toBe(false);await acknowledged(detached,a.project.id,1.5);
  await close(detached,'save');await expect(main.locator('.runtime-dock-heading>span').first()).toHaveText('C59 map B');
  expect(JSON.parse(await fs.readFile(path.join(root,'library/projects',a.project.id,'project.gsproject'),'utf8')).quickForge.geometry[0].position[0]).toBe(1.5);
  await acknowledged(main,b.project.id,2.5);expect(await fs.stat(path.join(root,'library/projects',b.project.id,'project.gsproject')).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;})).toBe(false);
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
  await close(detached,'save');await inspector(main);
  step('Native size/position survive close and reopen; an offscreen saved window is recovered onto an available monitor',{placement,recovered});
  // Exercise the actual pointer entrypoints, rather than invoking the window
  // command as a substitute for tab/current-workspace tear-off.
  const beforeTabTear=await state(main,a.project.id);
  await chooseTool(main,'Settings & tools');await main.getByRole('tab',{name:'Interface Studio',exact:true}).click();
  prior=new Set(pages());const tab=await main.getByRole('tab',{name:'C59 map A',exact:true}).boundingBox();
  await main.mouse.move(tab.x+tab.width/2,tab.y+tab.height/2);await main.mouse.down();await main.mouse.move(tab.x+tab.width/2,tab.y+120,{steps:12});await main.mouse.up();
  const tornTab=await nextPage(prior);await expect(tornTab.locator('.gs-workspace-shell')).toHaveAttribute('data-workspace','settings');
  await expect(tornTab.getByRole('tab',{name:'Interface Studio',exact:true})).toHaveAttribute('aria-selected','true');
  const tornState=await state(tornTab,a.project.id);expect(tornState.project.quickForge).toEqual(beforeTabTear.project.quickForge);expect(tornState.history.head.current).toBe(beforeTabTear.history.head.current);expect(tornState.writable).toBe(true);
  await close(tornTab,'save');await openProject(main,'C59 map A');await inspector(main);await expect(x(main)).toHaveValue('1.5');
  await main.keyboard.press('Control+z');await expect(x(main)).toHaveValue('1.25');await main.keyboard.press('Control+y');await expect(x(main)).toHaveValue('1.5');
  await chooseTool(main,'Map library');prior=new Set(pages());const work=await main.getByRole('button',{name:'Open work and workspace windows',exact:true}).boundingBox();
  await main.mouse.move(work.x+work.width/2,work.y+work.height/2);await main.mouse.down();await main.mouse.move(work.x+work.width/2,work.y+120,{steps:12});await main.mouse.up();
  const tornWorkspace=await nextPage(prior);await expect(tornWorkspace.locator('.gs-workspace-shell')).toHaveAttribute('data-workspace','library');
  await chooseTool(tornWorkspace,'Features & workflows');await expect(main.locator('.gs-workspace-shell')).toHaveAttribute('data-workspace','library');await close(tornWorkspace);
  report.compactHeader=await main.locator('#gs-window-header').evaluate(header=>{
    const r=header.getBoundingClientRect(),children=[...header.children].map(child=>child.getBoundingClientRect()).filter(c=>c.width>0&&c.height>0);
    return{height:r.height,width:r.width,childrenContained:children.every((c,i)=>c.left>=r.left-1&&c.right<=r.right+1&&c.top>=r.top-1&&c.bottom<=r.bottom+1&&(!i||children[i-1].right<=c.left+1)),dragWidth:header.querySelector('.gs-titlebar-drag-space').getBoundingClientRect().width};
  });
  expect(report.compactHeader.height).toBe(32);expect(report.compactHeader.childrenContained).toBe(true);expect(report.compactHeader.dragWidth).toBeGreaterThanOrEqual(48);
  await main.screenshot({path:path.join(root,'compact-header.png')});
  step('Real map-tab tear-off preserves current workspace, settings section and Undo; current-workspace drag opens an independent native window; the 32px header stays aligned',report.compactHeader);
  await chooseTool(main,'Level editor');await inspector(main);
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
  await independentNativeWindows(a.project.id);
  }
  if(nativeMap&&!geometryOnly&&!logicOnly){
    if(!readOnly&&!invaderDirectory)throw Error('Native map acceptance requires the installed Invader directory');
    const original=await fs.readFile(path.resolve(nativeMap)),originalHash=crypto.createHash('sha256').update(original).digest('hex');
    const importStarted=performance.now();
    const missing=path.join(root,'not-a-map.map');
    const imported=await invoke(main,'import_paths',{paths:[missing,path.resolve(nativeMap),path.join(root,'also-missing.map')],includeReport:true});
    expect(imported.projects).toHaveLength(1);expect(imported.failures.map(row=>path.basename(row.path))).toEqual(['not-a-map.map','also-missing.map']);
    expect(imported.failures.every(row=>row.message.length>0)).toBe(true);
    const [opened]=imported.projects;
    const entries=(await invoke(main,'bootstrap')).entries;expect(entries).toHaveLength(1);
    const indexed=JSON.stringify(entries),directoriesBefore=await projectDirectories();
    for(let index=0;index<10;index++){
      const failed=await invoke(main,'import_paths',{paths:[missing],includeReport:true});
      expect(failed.projects).toEqual([]);expect(failed.failures).toHaveLength(1);
      expect(JSON.stringify((await invoke(main,'bootstrap')).entries)).toBe(indexed);
      expect(await projectDirectories()).toEqual(directoriesBefore);
    }
    report.importBatch={mixedSuccesses:1,mixedFailures:2,rejectedAttempts:10,libraryIndexUnchangedAfterRejections:true};
    if(!readOnly){
      const inputs=await finishStorage.createScratch('rejected-descriptor-inputs');
      const first=path.join(inputs,'first.obj'),bad=path.join(inputs,'late.obj');
      const payload=await fs.readFile(path.resolve('crates/spark-core/tests/fixtures/static_wedge.obj'));
      await fs.writeFile(first,payload,{flag:'wx'});await fs.writeFile(bad,'invalid mesh',{flag:'wx'});
      const asset=(id,file,bytes)=>({id,name:id,kind:'obj',path:file,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),vertices:0,triangles:0,hasUvs:false,materials:[]});
      const descriptor=path.join(inputs,'incoming.gsproject');
      await fs.writeFile(descriptor,JSON.stringify({...opened.project,title:'Rejected descriptor keeps original source',assets:[asset('first',first,payload),asset('late',bad,Buffer.from('invalid mesh'))]}),{flag:'wx'});
      for(let index=0;index<10;index++){
        const failed=await invoke(main,'import_paths',{paths:[descriptor],includeReport:true});
        expect(failed.projects).toEqual([]);expect(failed.failures).toHaveLength(1);
        expect(JSON.stringify((await invoke(main,'bootstrap')).entries)).toBe(indexed);
        expect(await projectDirectories()).toEqual(directoriesBefore);
      }
      expect(await fs.readFile(first)).toEqual(payload);expect(await fs.readFile(bad,'utf8')).toBe('invalid mesh');
      report.importBatch.lateAssetDescriptorRejections=10;report.importBatch.originalAssetsUnchanged=true;
    }
    if(profilePreview){report.previewProfile.importMs=performance.now()-importStarted;if(memoryAcceptance)report.previewProfile.conditions+='; map timings follow twenty source-inspection cycles and are warm-session measurements';}
    expect(opened.project.source.cacheVersion).toBe(expectedCacheVersion);
    const pistol=opened.inspection.tags.find(tag=>tag.class==='weap'&&tag.path.replaceAll('\\','/').endsWith('weapons/pistol/pistol'));
    if(!pistol&&!previewOnly)throw Error('Owned native map does not contain the representative pistol');
    await main.reload();await chooseTool(main,'Map library');
    if(profilePreview)await main.evaluate(()=>{window.__GS_PROFILE__=true;performance.clearMeasures();});
    const viewportStarted=performance.now();
    await main.locator(`.map-card[data-project-id="${opened.project.id}"]`).click();
    await chooseTool(main,'Level editor');
    await expect(main.locator('.world-layout canvas')).toBeVisible();
    await expect.poll(async()=>Number(await main.locator('.world-layout').getAttribute('data-source-shaders')),{timeout:90000}).toBeGreaterThan(0);
    // A false loading flag between batches is not completion. Wait for the
    // pending source-material queue and reflection worker together.
    await expect.poll(()=>main.locator('.world-layout').evaluate(element=>({
      loading:element.dataset.materialLoading,
      pending:element.dataset.pendingMaterials,
      reflections:element.dataset.reflectionLoading,
    })),{timeout:90000}).toEqual({loading:'false',pending:'0',reflections:'false'});
    const nativeViewport=await main.locator('.world-layout').evaluate(element=>({...element.dataset}));
    const nativeGeometry=await main.locator('.viewport-status').innerText();
    if(profilePreview){
      report.previewProfile.firstMapReadyMs=performance.now()-viewportStarted;
      report.previewProfile.calls=await main.evaluate(()=>performance.getEntriesByType('measure').filter(entry=>entry.name.startsWith('spark.ipc.')).map(({name,duration})=>({command:name.slice(10),ms:duration})));
      expect(report.previewProfile.calls.some(call=>call.command==='preview_owned_cache_bitmap_batch')).toBe(true);
      report.previewProfile.gauges=await main.evaluate(()=>window.__GS_PROFILE_GAUGES__??{});
      report.previewProfile.viewport=nativeViewport;
      const spartan=opened.inspection.tags.find(tag=>tag.class==='bipd'&&tag.references.some(ref=>ref.label==='Model'&&opened.inspection.tags.some(model=>model.id===ref.targetId&&model.class==='mod2'&&/characters[\\/]cyborg(?:_mp)?[\\/]cyborg(?:_mp)?$/i.test(model.path))));
      const renderedModels=opened.project.scene.filter(object=>object.visible&&!object.sourceModel).flatMap(object=>{
        const mesh=object.kind==='Player spawn'?opened.inspection.modelMeshes?.[spartan?.id]:object.assetId?undefined:opened.inspection.modelMeshes?.[object.tagId];return mesh?[mesh]:[];
      });
      const requiredIds=[...new Set([opened.inspection.renderMesh,...renderedModels].flatMap(mesh=>mesh?.materialRanges??[]).map(range=>range.shaderTagId))];
      const requiredPrimaries=requiredIds.filter(id=>opened.inspection.tags.some(tag=>tag.id===id&&tag.primaryBitmapStatus==='resolved'));
      const loaded=new Set(nativeViewport.sourceShaderIds.split(',').map(Number));for(const id of requiredPrimaries)expect(loaded.has(id)).toBe(true);
      report.previewProfile.materialCoverage={allBspAndVisibleModelShaders:requiredIds,requiredPrimaries,loadedPrimaries:requiredPrimaries.filter(id=>loaded.has(id)),visibleObjects:opened.project.scene.filter(object=>object.visible).length,sourcePreserved:true};
      report.previewProfile.performance=await main.locator('.world-layout canvas').evaluate(canvas=>JSON.parse(canvas.dataset.gsPerformance??'null'));
      report.previewProfile.process=JSON.parse((await promisify(execFile)('pwsh.exe',['-NoProfile','-File',path.resolve('scripts/profile-process-tree.ps1'),'-RootProcessId',String(child.pid)],{windowsHide:true,timeout:30000,maxBuffer:1024*1024})).stdout);
      const canvas=main.locator('.world-layout canvas');await canvas.evaluate(element=>window.c71WorldCanvas=element);
      const requestsBefore=report.previewProfile.calls.length;await chooseTool(main,'Map library');
      const resumeStarted=performance.now();await chooseTool(main,'Level editor');await expect(canvas).toBeVisible();
      await expect(main.locator('.world-layout')).toHaveAttribute('data-material-loading','false');
      report.previewProfile.resumeMs=performance.now()-resumeStarted;
      report.previewProfile.sameCanvas=await canvas.evaluate(element=>element===window.c71WorldCanvas);expect(report.previewProfile.sameCanvas).toBe(true);
      report.previewProfile.resumeCalls=(await main.evaluate(()=>performance.getEntriesByType('measure').filter(entry=>entry.name.startsWith('spark.ipc.')).map(({name,duration})=>({command:name.slice(10),ms:duration})))).slice(requestsBefore);
      expect(report.previewProfile.resumeCalls.filter(row=>row.command.startsWith('preview_owned_'))).toEqual([]);
      expect(crypto.createHash('sha256').update(await fs.readFile(path.resolve(nativeMap))).digest('hex')).toBe(originalHash);
    }
    expect(nativeGeometry).toMatch(/[\d,]+ visible triangles/);
    await main.screenshot({path:path.join(root,'owned-native-bsp.png')});
    step(`Owned native cache ${expectedCacheVersion} opens in actual BSP viewport with source materials`,{nativeViewport,nativeGeometry,engineParityClaimed:false});
    if(previewOnly||contextOnly){
      const actualSource=(await invoke(main,'open_project',{id:opened.project.id})).project.source;
      expect(actualSource.sha256).toBe(originalHash);expect(actualSource.cacheVersion).toBe(expectedCacheVersion);
      const spartan=opened.inspection.tags.find(tag=>tag.class==='bipd'&&tag.references.some(ref=>ref.label==='Model'&&ref.class===(expectedCacheVersion===5?'mode':'mod2')&&opened.inspection.tags.some(model=>model.id===ref.targetId&&model.class===ref.class&&/characters[\\/]cyborg(?:_mp)?[\\/]cyborg(?:_mp)?$/i.test(model.path))));
      if(opened.project.scene.some(object=>object.kind==='Player spawn')){expect(spartan).toBeTruthy();expect(opened.inspection.modelMeshes?.[spartan.id]?.indices.length).toBeGreaterThan(0);}
      const meshes=opened.project.scene.filter(object=>object.visible&&!object.sourceModel).flatMap(object=>{const mesh=object.kind==='Player spawn'?opened.inspection.modelMeshes?.[spartan?.id]:object.assetId?undefined:opened.inspection.modelMeshes?.[object.tagId];return mesh?[mesh]:[];});
      const ids=[...new Set([opened.inspection.renderMesh,...meshes].flatMap(mesh=>mesh?.materialRanges??[]).map(range=>range.shaderTagId))];
      const required=ids.filter(id=>opened.inspection.tags.some(tag=>tag.id===id&&tag.primaryBitmapStatus==='resolved'));
      const loaded=new Set(nativeViewport.sourceShaderIds.split(',').map(Number));const missing=required.filter(id=>!loaded.has(id));expect(missing).toEqual([]);
      const lightmaps=new Set(opened.inspection.renderMesh?.materialRanges?.filter(range=>range.hasLightmapUvs&&range.lightmapBitmapTagId!=null&&range.lightmapPage>=0).map(range=>`${range.bspIndex}:${range.lightmapPage}`)??[]);
      expect(Number(nativeViewport.sourceLightmaps)).toBeGreaterThanOrEqual(lightmaps.size);
      expect(crypto.createHash('sha256').update(await fs.readFile(path.resolve(nativeMap))).digest('hex')).toBe(originalHash);
      report.sourcePreview={cacheVersion:expectedCacheVersion,engine:opened.inspection.header.engine,sourceSha256:originalHash,resources:actualSource.resourceSha256??{},requiredPrimaryShaders:required,missingPrimaryShaders:missing,requiredLightmapPages:lightmaps.size,spartanTagId:spartan?.id??null,spartanModelClass:expectedCacheVersion===5?'mode':'mod2',visibleObjects:opened.project.scene.filter(object=>object.visible).length,readOnly,gameplayAccepted:false};
      step('Actual source-family preview loads every required placed/BSP primary shader and its native player-start model; original cache unchanged');
      if(contextOnly){
        if(!pistol)throw Error('Native asset-context acceptance requires the actual pistol');
        await main.evaluate(()=>{window.__GS_PROFILE__=true;performance.clearMeasures();});
        await chooseTool(main,'Tag editor');
        await main.getByRole('textbox',{name:'Search tags',exact:true}).fill(pistol.path);await main.getByRole('combobox',{name:'Filter tag class',exact:true}).selectOption('weap');await main.locator('.tag-row').click();
        const tabs=main.getByRole('tablist',{name:'Asset contexts',exact:true}),area=main.getByRole('region',{name:'Actual model preview',exact:true}),preview=area.locator('.native-model-preview'),canvas=area.locator('canvas');
        await expect(tabs.getByRole('tab')).toHaveCount(8);await expect(preview).toHaveAttribute('data-model-first-frame','true',{timeout:90000});
        await canvas.evaluate(element=>window.c71ContextCanvas=element);const camera=await canvas.getAttribute('data-gs-preview-camera');
        const radius=main.getByRole('spinbutton',{name:'Bounding radius',exact:true}),prior=await radius.inputValue();if(!contextReadOnly)await radius.fill('0.225');
        await tabs.getByRole('tab',{name:'Materials',exact:true}).click();const materialSelector=main.getByRole('combobox',{name:'Asset material',exact:true});await expect(materialSelector).toBeVisible();
        const selectedShader=Number(await materialSelector.inputValue()),usedShaders=(await preview.getAttribute('data-model-shader-ids')).split(',').map(Number);expect(usedShaders).toContain(selectedShader);
        const selectedBitmap=Number(await main.getByRole('combobox',{name:'Asset bitmap',exact:true}).inputValue());expect(opened.inspection.tags.find(tag=>tag.id===selectedShader).references.filter(ref=>ref.class==='bitm').map(ref=>ref.targetId)).toContain(selectedBitmap);
        await expect(main.getByRole('region',{name:'Original bitmap preview',exact:true}).getByLabel('Verified original bitmap pixels',{exact:true})).toHaveAttribute('data-source-sha256',originalHash,{timeout:90000});
        await main.screenshot({path:path.join(root,'native-context-materials.png')});
        const reflectionId=opened.inspection.tags.find(tag=>tag.id===selectedShader).shaderPreview?.reflection?.bitmapTagId;expect(reflectionId).toBeTruthy();
        await main.getByRole('combobox',{name:'Asset bitmap',exact:true}).selectOption(String(reflectionId));
        const faceSelector=main.getByRole('combobox',{name:'Cubemap face',exact:true}),pixels=main.getByRole('region',{name:'Original bitmap preview',exact:true}).getByLabel('Verified original bitmap pixels',{exact:true}),faces=[];
        await expect(faceSelector.locator('option')).toHaveCount(6);
        for(let index=0;index<6;index++){
          await faceSelector.selectOption(String(index));await expect(pixels).toHaveAttribute('data-cube-face',String(index));await expect(pixels).toHaveAttribute('data-source-sha256',originalHash);
          faces.push(await pixels.evaluate(async canvas=>({width:canvas.width,height:canvas.height,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.buffer)),v=>v.toString(16).padStart(2,'0')).join('')})));
        }
        expect(new Set(faces.map(face=>face.sha256)).size).toBeGreaterThan(1);await main.screenshot({path:path.join(root,'native-context-reflection.png')});
        await tabs.getByRole('tab',{name:'Collision',exact:true}).click();await expect(preview).toHaveAttribute('data-collision-status','ready',{timeout:90000});await expect(preview).toHaveAttribute('data-model-first-frame','true');
        const collision=await invoke(main,'preview_owned_object_collision',{projectId:opened.project.id,sourceSha256:originalHash,tagId:pistol.id});expect(collision.source).toBe('halo-model-collision');expect(collision.indices.length).toBeGreaterThan(0);
        expect(Number(await preview.getAttribute('data-collision-triangles'))).toBe(collision.indices.length/3);
        await main.screenshot({path:path.join(root,'native-context-collision.png')});
        for(const label of ['Dependencies','Native Output','Logic','Animation','Properties'])await tabs.getByRole('tab',{name:label,exact:true}).click();
        if(!contextReadOnly){await expect(radius).toHaveValue('0.225');await main.keyboard.press('Control+z');await expect(radius).toHaveValue(prior);await main.keyboard.press('Control+y');await expect(radius).toHaveValue('0.225');}
        else await expect(radius).toHaveValue(prior);
        await tabs.getByRole('tab',{name:'Collision',exact:true}).click();await expect(preview).toHaveAttribute('data-collision-status','ready');
        await tabs.getByRole('tab',{name:'Properties',exact:true}).click();await expect(preview).toHaveAttribute('data-model-first-frame','true');
        expect(await canvas.evaluate(element=>element===window.c71ContextCanvas)).toBe(true);expect(await canvas.getAttribute('data-gs-preview-camera')).toBe(camera);
        const calls=await main.evaluate(()=>performance.getEntriesByType('measure').filter(entry=>entry.name.startsWith('spark.ipc.')).map(({name,duration})=>({command:name.slice(10),ms:duration})));
        expect(calls.filter(call=>call.command==='preview_owned_object_collision')).toHaveLength(1);
        let editEvidence={undoRedoSaveReopen:false,compilerRan:false,gameplayAccepted:false};
        if(!contextReadOnly){
        await main.keyboard.press('Control+s');await expect.poll(async()=>(await invoke(main,'open_project',{id:opened.project.id})).project.tagEdits.find(edit=>edit.tagId===pistol.id&&edit.fieldKey==='bounding-radius')?.value).toBe(.225);
        const smart=main.locator('.smart-edit:visible').first();await smart.locator('summary').first().click();await smart.getByRole('button',{name:'Review save plan',exact:true}).click();await expect(smart.locator('.smart-edit-plan>strong')).toHaveText('Direct map copy');await smart.getByRole('button',{name:'Save validated map copy',exact:true}).click();await expect(smart.locator('.smart-edit-result>strong')).toHaveText('Validated copy ready');
        const edited=(await invoke(main,'open_project',{id:opened.project.id})).project,build=edited.builds.at(-1);
        const proof=JSON.parse(await fs.readFile(path.join(root,'library/jobs',build.id,'smart-edit-receipt.json'),'utf8'));expect(proof.compilerRan).toBe(false);expect(proof.allOtherBytesPreserved).toBe(true);
        const tool=name=>path.join(path.resolve(invaderDirectory),name+'.exe'),run=runOwned,tags=path.join(root,'independent-native-tags');
        expect((await run(tool('invader-info'),['-T','crc32_mismatched',build.output],{windowsHide:true,timeout:30000})).stdout.trim()).toBe('0');
        await run(tool('invader-extract'),['-s',pistol.path+'.weapon','-t',tags,build.output],{windowsHide:true,timeout:30000});
        const readback=Number((await run(tool('invader-edit'),['-t',tags,'-G','bounding_radius',pistol.path+'.weapon'],{windowsHide:true,timeout:30000})).stdout.trim());expect(readback).toBeCloseTo(.225,6);
        await chooseTool(main,'Map library');await main.locator(`.map-card[data-project-id="${opened.project.id}"]`).click();await chooseTool(main,'Tag editor');await expect(radius).toHaveValue('0.225');
        editEvidence={...editEvidence,undoRedoSaveReopen:true,output:build.output,outputSha256:build.sha256,independentInvaderReadback:readback};
        }else{
          const unchanged=(await invoke(main,'open_project',{id:opened.project.id})).project;
          expect(unchanged.tagEdits).toEqual(opened.project.tagEdits);expect(unchanged.builds).toEqual(opened.project.builds);
        }
        report.assetContexts={sourceSha256:originalHash,tagId:pistol.id,selectedShader,selectedBitmap,usedShaders,reflectionInspection:{tagId:reflectionId,faces},collisionTriangles:collision.indices.length/3,sameCanvas:true,sameCamera:true,collisionReads:1,calls,readOnly:contextReadOnly,...editEvidence};
        let playable;
        const candidates=opened.inspection.tags.filter(tag=>tag.class==='snd!').sort((a,b)=>Number(/teleporter_loop/.test(b.path))-Number(/teleporter_loop/.test(a.path))).slice(0,8);
        for(const tag of candidates){const inspected=await invoke(main,'inspect_sound',{projectId:opened.project.id,tagId:tag.id});if(inspected.sourceSha256!==originalHash)throw Error('Native sound source differs');if(inspected.permutations.some(sample=>sample.available)){playable=tag;break;}}
        if(!playable)throw Error('No playable native sound in the bounded context acceptance selection');
        await main.getByRole('textbox',{name:'Search tags',exact:true}).fill(playable.path);await main.getByRole('combobox',{name:'Filter tag class',exact:true}).selectOption('snd!');await main.locator('.tag-row').click();
        const sound=main.locator('.sound-inspector');await expect(sound.getByRole('button',{name:'Play sample',exact:true})).toBeVisible();await sound.getByText('Sample details & options',{exact:true}).click();await sound.getByRole('checkbox',{name:'Repeat sample',exact:true}).check();
        let meter,done;const meterPath=process.env.SPARK_LIFECYCLE_AUDIO_METER;
        if(meterPath){meter=spawn(path.resolve(meterPath),[String(child.pid),path.join(root,'context-audio-output.json'),'6'],{windowsHide:true,stdio:['ignore','ignore','pipe']});await finishStorage.trackProcess(meter);let stderr='';meter.stderr.on('data',data=>stderr+=data.toString());done=new Promise(resolve=>meter.once('exit',code=>resolve({code,stderr})));}
        await sound.getByRole('button',{name:'Play sample',exact:true}).click();await expect(sound.locator('[data-audition-state]')).toHaveAttribute('data-audition-state','playing');await main.waitForTimeout(2000);
        await tabs.getByRole('tab',{name:'Properties',exact:true}).click();await expect(sound.locator('[data-audition-state]')).toHaveAttribute('data-audition-state','idle');await tabs.getByRole('tab',{name:'Sound',exact:true}).click();await expect(sound.getByRole('checkbox',{name:'Repeat sample',exact:true})).toBeChecked();
        report.assetContexts.sound={tagId:playable.id,path:playable.path,playedThenStoppedOnContextChange:true,retainedSampleOptions:true,humanHearingAccepted:false};
        if(done){const result=await done;expect(result).toEqual({code:0,stderr:''});const output=JSON.parse(await fs.readFile(path.join(root,'context-audio-output.json'),'utf8'));const peak=Math.max(0,...output.readings.flatMap(row=>row.sessions.map(session=>session.Peak)));expect(peak).toBeGreaterThan(.0001);report.assetContexts.sound.windowsOwnedSessionPeak=peak;}
        await main.screenshot({path:path.join(root,'native-context-sound.png')});
        await nativeTagAnimation(opened);
        expect(crypto.createHash('sha256').update(await fs.readFile(path.resolve(nativeMap))).digest('hex')).toBe(originalHash);
        step(contextReadOnly?'Actual read-only asset contexts retain native materials/cubemap/collision/animation/audio without editing tags or creating a build':'Actual asset contexts retain one native preview/camera, reuse real collision, and preserve Undo/Save/reopen and independently read native output',report.assetContexts);
      }
    }else{
    if(process.env.SPARK_LIFECYCLE_ANIMATION==='1')await nativeTagAnimation(opened);
    await chooseTool(main,'Tag editor');
    await main.getByRole('textbox',{name:'Search tags',exact:true}).fill(pistol.path);
    await main.getByRole('combobox',{name:'Filter tag class',exact:true}).selectOption('weap');
    await main.locator('.tag-row').filter({has:main.locator('strong',{hasText:/^pistol$/})}).click();
    let radius=main.getByRole('spinbutton',{name:'Bounding radius',exact:true});
    const prior=await radius.inputValue();await radius.fill('0.225');await radius.press('Tab');
    await main.keyboard.press('Control+z');await expect(radius).toHaveValue(prior);await main.keyboard.press('Control+y');await expect(radius).toHaveValue('0.225');
    if(repeatedEdits){
      // New projects deliberately default to no automatic backups. Exercise
      // that contract first, then opt this owned test project into its bounded
      // three-backup policy through the real UI before measuring retention.
      const initialBackups=await invoke(main,'project_backup_overview',{projectId:opened.project.id});
      expect(initialBackups.automaticRetention).toBe(0);expect(initialBackups.automatic.count).toBe(0);
      expect(await invoke(main,'create_project_snapshot',{projectId:opened.project.id,reason:'periodic'})).toBeNull();
      await chooseTool(main,'Settings & tools');await main.getByRole('tab',{name:'Storage & Cache',exact:true}).click();
      const backupSettings=main.getByRole('region',{name:'Storage and cache settings',exact:true});
      await backupSettings.getByLabel('Maximum automatic map backups',{exact:true}).selectOption('3');
      await backupSettings.getByRole('button',{name:'Save limit',exact:true}).click();
      await expect.poll(async()=>(await invoke(main,'open_project',{id:opened.project.id})).project.automaticBackupRetention).toBe(3);
      await chooseTool(main,'Tag editor');await main.getByRole('textbox',{name:'Search tags',exact:true}).fill(pistol.path);
      await main.getByRole('combobox',{name:'Filter tag class',exact:true}).selectOption('weap');
      await main.locator('.tag-row').filter({has:main.locator('strong',{hasText:/^pistol$/})}).click();
      await expect(radius).toHaveValue('0.225');
      const baseline=await storageSample('textured-map-and-preview-ready');
      const rows=[];let previous=.225;
      for(let index=0;index<editCount;index++){
        const value=Number((.226+index*.001).toFixed(3));
        await radius.fill(String(value));await radius.press('Tab');
        await main.keyboard.press('Control+z');await expect(radius).toHaveValue(String(previous));
        await main.keyboard.press('Control+y');await expect(radius).toHaveValue(String(value));
        await main.keyboard.press('Control+s');
        await expect.poll(async()=>{
          const file=path.join(root,'library/projects',opened.project.id,'project.gsproject');
          const project=JSON.parse(await fs.readFile(file,'utf8'));
          return project.tagEdits.find(edit=>edit.tagId===pistol.id&&edit.fieldKey==='bounding-radius')?.value;
        }).toBe(value);
        const snapshot=await invoke(main,'create_project_snapshot',{projectId:opened.project.id,reason:'periodic'});
        rows.push({index:index+1,value,snapshotId:snapshot?.id??null});previous=value;
        await physicalSample(`native-edit-${index+1}`);
        if((index+1)%5===0)await storageSample(`saved-edit-${index+1}`);
      }
      const backups=await invoke(main,'project_backup_overview',{projectId:opened.project.id});
      expect(backups.automaticRetention).toBe(3);expect(backups.automatic.count).toBe(3);expect(backups.automaticAtCapacity).toBe(true);
      expect(rows.filter(row=>row.snapshotId!==null)).toHaveLength(3);expect(backups.recovery.valid).toBe(true);
      const recoveryLeaves=(await fs.readdir(path.join(root,'library/projects',opened.project.id))).filter(name=>name.startsWith('project.gsproject.bak'));
      expect(recoveryLeaves).toEqual(['project.gsproject.bak']);
      report.repeatedEdits={count:rows.length,rows,backups,peakIsSampled:true,notAnOsOrGpuQuota:true};
      // Return to the original value so the existing independent native export
      // readback remains comparable. Reopen only this same project/document.
      await radius.fill('0.225');await radius.press('Tab');await main.keyboard.press('Control+s');
      await expect.poll(async()=>(await invoke(main,'open_project',{id:opened.project.id})).project.tagEdits.find(edit=>edit.tagId===pistol.id&&edit.fieldKey==='bounding-radius')?.value).toBe(.225);
      const stoppedPid=child.pid;await browser.close();await stopQaProcess(child);await launchNative();
      // The replacement WebView has its own Page; never carry a locator from
      // the deliberately crashed process into the recovery acceptance checks.
      radius=main.getByRole('spinbutton',{name:'Bounding radius',exact:true});
      report.repeatedEdits.ownedProcessCrashRecovery={stoppedPid,restartedPid:child.pid,libraryReused:true,acknowledgedSaveOnly:true};
      if(profilePreview){expect(report.previewProfile.firstMapReadyMs).toBeGreaterThan(0);expect(report.previewProfile.sameCanvas).toBe(true);expect(report.previewProfile.restarts).toHaveLength(1);}
      await chooseTool(main,'Map library');await main.locator(`.map-card[data-project-id="${opened.project.id}"]`).click();
      await chooseTool(main,'Tag editor');await main.getByRole('textbox',{name:'Search tags',exact:true}).fill(pistol.path);
      await main.getByRole('combobox',{name:'Filter tag class',exact:true}).selectOption('weap');
      await main.locator('.tag-row').filter({has:main.locator('strong',{hasText:/^pistol$/})}).click();await expect(radius).toHaveValue('0.225');
      const final=await storageSample(`same-project-reopened-after${editCount}-edits`);
      const projectBytes=sample=>sample.folders.find(folder=>folder.label==='Projects & preserved originals')?.measurement?.logicalBytes;
      const growth=projectBytes(final)-projectBytes(baseline);expect(Number.isFinite(growth)).toBe(true);expect(growth).toBeLessThan(32*1024**2);
      report.repeatedEdits.projectLogicalGrowthBytes=growth;
      report.repeatedEdits.sampledPeakPrivateBytes=Math.max(...report.storageSamples.map(row=>Number(row.process.privateBytes)));
      const comparable=report.storageSamples.find(row=>row.phase===`saved-edit-${editCount}`);
      const memoryGrowth=Number(comparable.process.privateBytes)-Number(baseline.process.privateBytes);
      expect(Number.isFinite(memoryGrowth)).toBe(true);expect(memoryGrowth).toBeLessThan(512*1024**2);
      report.repeatedEdits.comparablePrivateMemoryGrowthBytes=memoryGrowth;
      step(`${editCount} genuine native tag edits, author Undo/Redo, immediate saves and same-project reopen remain bounded`,{edits:editCount,projectLogicalGrowthBytes:growth});
      await chooseTool(main,'Settings & tools');await main.getByRole('tab',{name:'Storage & Cache',exact:true}).click();
      const storage=main.getByRole('region',{name:'Storage and cache settings',exact:true});
      await storage.getByLabel('Maximum automatic map backups',{exact:true}).selectOption('0');await storage.getByRole('button',{name:'Save limit',exact:true}).click();
      await expect.poll(async()=>(await invoke(main,'open_project',{id:opened.project.id})).project.automaticBackupRetention).toBe(0);
      expect(await invoke(main,'create_project_snapshot',{projectId:opened.project.id,reason:'periodic'})).toBeNull();
      const disabled=await invoke(main,'project_backup_overview',{projectId:opened.project.id});expect(disabled.automatic.count).toBe(3);expect(disabled.recovery.valid).toBe(true);
      await storage.getByRole('button',{name:'Back up now',exact:true}).click();
      await expect.poll(async()=>(await invoke(main,'project_backup_overview',{projectId:opened.project.id})).manual.count).toBe(backups.manual.count+1);
      await storage.getByRole('button',{name:'Review 3 old automatic backups',exact:true}).click();
      await storage.getByLabel('Remove these reviewed automatic backups.',{exact:true}).check();await storage.getByRole('button',{name:'Remove reviewed backups',exact:true}).click();
      await expect.poll(async()=>(await invoke(main,'project_backup_overview',{projectId:opened.project.id})).automatic.count).toBe(0);
      const cleaned=await invoke(main,'project_backup_overview',{projectId:opened.project.id});expect(cleaned.manual.count).toBe(backups.manual.count+1);expect(cleaned.safety.count).toBe(backups.safety.count);expect(cleaned.recovery.valid).toBe(true);
      await storage.getByLabel('Maximum automatic map backups',{exact:true}).selectOption('3');await storage.getByRole('button',{name:'Save limit',exact:true}).click();
      await expect.poll(async()=>(await invoke(main,'open_project',{id:opened.project.id})).project.automaticBackupRetention).toBe(3);
      report.repeatedEdits.explicitBackupReview={disabled,cleaned,manualBackupPreserved:true,automaticRotationClaimed:false};
      const locations=await invoke(main,'storage_mod_locations');expect(locations.modDirectory).toBe(path.join(root,'library/Mods'));expect(await fs.stat(locations.modDirectory).catch(()=>null)).toBeNull();
      report.repeatedEdits.modFolderReadDidNotAllocate=true;
      await chooseTool(main,'Tag editor');await main.getByRole('textbox',{name:'Search tags',exact:true}).fill(pistol.path);await main.getByRole('combobox',{name:'Filter tag class',exact:true}).selectOption('weap');await main.locator('.tag-row').filter({has:main.locator('strong',{hasText:/^pistol$/})}).click();await expect(radius).toHaveValue('0.225');
      step('Real Storage controls save None and manual backup, review exact automatic snapshots, and retain recovery/manual checkpoints');
    }
    await main.getByRole('tab',{name:'Properties',exact:true}).click();
    const smart=main.locator('.smart-edit:visible').first();await smart.locator('summary').first().click();
    await smart.getByRole('button',{name:'Review save plan',exact:true}).click();
    await expect(smart.locator('.smart-edit-plan>strong')).toHaveText('Direct map copy');
    await smart.getByRole('button',{name:'Save validated map copy',exact:true}).click();
    await expect(smart.locator('.smart-edit-result>strong')).toHaveText('Validated copy ready');
    const edited=(await invoke(main,'open_project',{id:opened.project.id})).project,build=edited.builds.at(-1);
    const proof=JSON.parse(await fs.readFile(path.join(root,'library','jobs',build.id,'smart-edit-receipt.json'),'utf8'));
    expect(proof.compilerRan).toBe(false);expect(proof.allOtherBytesPreserved).toBe(true);
    const run=runOwned,tool=name=>path.join(path.resolve(invaderDirectory),name+'.exe');
    const crc=await run(tool('invader-info'),['-T','crc32_mismatched',build.output],{windowsHide:true,timeout:30000});expect(crc.stdout.trim()).toBe('0');
    const tags=path.join(root,'independent-native-tags');
    await run(tool('invader-extract'),['-s',pistol.path+'.weapon','-t',tags,build.output],{windowsHide:true,timeout:30000});
    const readback=await run(tool('invader-edit'),['-t',tags,'-G','bounding_radius',pistol.path+'.weapon'],{windowsHide:true,timeout:30000});
    expect(Number(readback.stdout.trim())).toBeCloseTo(.225,6);
    expect(crypto.createHash('sha256').update(await fs.readFile(path.resolve(nativeMap))).digest('hex')).toBe(originalHash);
    step('Real native tag edit, Undo/Redo, Save and direct map export pass independent Invader extraction/readback; original is unchanged',{sourceSha256:originalHash,output:build.output,outputSha256:build.sha256,readback:Number(readback.stdout.trim()),compilerRan:false});
    if(process.env.SPARK_LIFECYCLE_EXPORT==='1'){
      const exporter=smart.locator('.map-export');await exporter.locator('summary').click();
      const modDirectory=path.join(root,'library/Mods');expect(await fs.stat(modDirectory).catch(()=>null)).toBeNull();
      await exporter.getByLabel('Map export runtime',{exact:true}).selectOption('haloCustomEdition');
      await exporter.getByRole('button',{name:'Export to mods folder',exact:true}).click();
      await expect(exporter).toContainText('different native cache format');
      expect(await fs.stat(modDirectory).catch(()=>null)).toBeNull();
      await exporter.getByLabel('Map export runtime',{exact:true}).selectOption('mccSteam');
      await exporter.getByRole('button',{name:'Export to mods folder',exact:true}).click();
      await expect(exporter.getByRole('status')).toContainText('Native map exported and hash-verified.');
      const outputPath=await exporter.getByRole('status').locator('code').innerText();
      const exportHash=crypto.createHash('sha256').update(await fs.readFile(outputPath)).digest('hex');expect(exportHash).toBe(build.sha256);
      const before=await fs.readdir(modDirectory);
      await exporter.getByRole('button',{name:'Export to mods folder',exact:true}).click();
      await expect(exporter.getByRole('status')).toContainText('Existing identical export verified.');
      expect(await fs.readdir(modDirectory)).toEqual(before);
      expect((await run(tool('invader-info'),['-T','crc32_mismatched',outputPath],{windowsHide:true,timeout:30000})).stdout.trim()).toBe('0');
      report.nativeExport={output:outputPath,sha256:exportHash,reused:true,incompatibleRuntimeRefusedBeforeFolderCreation:true};
      step('Actual desktop exports the native map into the configured default, reuses identical bytes and refuses unsupported target before allocation');
    }
    // Opening a built cache deliberately activates a new document. Complete
    // source-owned export before this handoff, then verify the independent map.
    const output=await invoke(main,'open_built_map',{projectId:opened.project.id,buildId:build.id});
    expect(output.inspection.tags.find(tag=>tag.class==='weap'&&tag.path===pistol.path).fields.find(field=>field.key==='bounding-radius').value).toBeCloseTo(.225,6);
    }
  }
  expect(report.errors).toEqual([]);report.complete=true;
}catch(error){report.errors.push(String(error));report.failureStack=error.stack;process.exitCode=1;if(browser){
  report.failureWindows=await Promise.all(pages().map(async(page,i)=>{await page.screenshot({path:path.join(root,`failure-window-${i}.png`)}).catch(()=>{});return{url:page.url(),label:await page.evaluate(()=>window.__TAURI_INTERNALS__.metadata.currentWindow.label).catch(()=>null),workspace:await page.locator('.gs-workspace-shell').getAttribute('data-workspace').catch(()=>null),body:(await page.locator('body').innerText().catch(()=>'')).slice(0,2500),tail:(await page.locator('body').innerText().catch(()=>'')).slice(-4000)};}));
}
  report.nativeFailureLogs=await Promise.race([invoke(main,'bootstrap').then(value=>value.logs.slice(-10)).catch(()=>[]),new Promise(resolve=>setTimeout(()=>resolve([]),3000))]);
  if(report.megaWorldCreation){
    // Preserve bounded native error geometry before the owned failed job is
    // disposed. A compiler diagnostic must survive cleanup, not its SDK tree.
    report.megaWorldCreation.nativeErrorGeometry=[];
    let visited=0,total=0;const sourceFiles=[];
    const inspectErrors=async(directory,depth=0)=>{if(depth>8||++visited>256)return;for(const row of await fs.readdir(directory,{withFileTypes:true}).catch(()=>[])){
      const file=path.join(directory,row.name),info=await fs.lstat(file);if(info.isSymbolicLink())continue;
      if(info.isDirectory()&&!/^(?:tags|sdk-tags|bsp-dependencies-\d+)$/.test(row.name))await inspectErrors(file,depth+1);
      else if(info.isFile()&&row.name==='connected.jms'&&info.size<=16*1024**2)sourceFiles.push(file);
      else if(info.isFile()&&/lightmaps_errors\.wrl$/i.test(row.name)&&info.size<=256*1024&&total+info.size<=512*1024){const bytes=await fs.readFile(file);total+=bytes.length;report.megaWorldCreation.nativeErrorGeometry.push({file:path.relative(root,file),sha256:crypto.createHash('sha256').update(bytes).digest('hex'),text:bytes.toString('utf8')});}
    }};
    await inspectErrors(path.join(root,'library','jobs'));
    for(const file of sourceFiles)try{
      const lines=(await fs.readFile(file,'utf8')).trim().split(/\r?\n/);let at=8;const count=Number(lines[at++]),materials=[];
      for(let i=0;i<count;i++){materials.push(lines[at++]);at++;}at+=3;
      const vertexCount=Number(lines[at++]),vertices=[];
      for(let i=0;i<vertexCount;i++){at++;const position=lines[at++].split(/\s+/).map(Number);at+=3;const uv=[Number(lines[at++]),Number(lines[at++])];at++;vertices.push({position,uv});}
      const triangleCount=Number(lines[at++]),triangles=[];
      for(let i=0;i<triangleCount;i++){
        at++;const material=Number(lines[at++]),ids=lines[at++].split(/\s+/).map(Number);
        if(materials[material].includes('@')||materials[material].startsWith('+'))continue;
        const v=ids.map(id=>vertices[id]),a=v[1].position.map((x,k)=>x-v[0].position[k]),b=v[2].position.map((x,k)=>x-v[0].position[k]);
        const area=Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]),maxEdge=Math.max(a.reduce((n,x)=>n+x*x,0),b.reduce((n,x)=>n+x*x,0),a.reduce((n,x,k)=>n+(x-b[k])**2,0));
        const u=v.map(x=>x.uv),uvArea=Math.abs((u[1][0]-u[0][0])*(u[2][1]-u[0][1])-(u[1][1]-u[0][1])*(u[2][0]-u[0][0]));
        triangles.push({index:i,material:materials[material],quality:area/maxEdge,uvArea,vertices:v});
      }
      const worst=triangles.sort((a,b)=>a.quality-b.quality).slice(0,8),neighbors=[];
      for(const tri of worst.slice(0,3))for(const other of triangles){if(other.index===tri.index)continue;const shared=other.vertices.filter(v=>tri.vertices.some(w=>Math.hypot(...v.position.map((n,k)=>n-w.position[k]))<.001));if(shared.length>=2&&neighbors.length<24)neighbors.push({of:tri.index,...other});}
      report.megaWorldCreation.nativeSourceGeometry={vertices:vertexCount,triangles:triangleCount,renderTriangles:triangles.length,worst,neighbors};
    }catch(error){report.megaWorldCreation.nativeSourceDiagnosticError=String(error);}
  }
  // Preserve the primary assertion before native teardown can fail. Cleanup
  // diagnostics must never erase the actual acceptance failure.
  await fs.writeFile(path.join(root,'acceptance.json'),JSON.stringify(report,null,2));
}
finally{
  // Successful acceptance closes the actual application normally before
  // sealing its regenerable cache. Abrupt termination leaves WebView writers
  // flushing files after the parent exits; those files must never be deleted
  // against an unstable hash inventory.
  if(browser){
    try{for(const page of pages().reverse()){if(!page.isClosed()){console.log('NATIVE_CLOSE_REVIEW',JSON.stringify({scope:report.scope,url:page.url(),at:new Date().toISOString()}));await close(page,'save');}}if(child)await waitForQaExit(child);report.gracefulAppClose=true;}
    catch(error){
      report.complete=false;report.errors.push('Normal QA app close failed: '+String(error));process.exitCode=1;
      report.closeFailure=await Promise.all(pages().map(async(page,index)=>{
        await page.screenshot({path:path.join(root,`close-failure-${index}.png`)}).catch(()=>{});
        return{url:page.url(),body:(await page.locator('body').innerText().catch(()=>'' )).slice(-16384)};
      }));
    }
  }
  await browser?.close().catch(()=>{});
  if(child?.exitCode===null)try{await stopQaProcess(child);}catch(error){report.complete=false;report.errors.push('Owned QA process stop failed: '+String(error));process.exitCode=1;await fs.writeFile(path.join(root,'acceptance.json'),JSON.stringify(report,null,2));}
  if(finishStorage){try{
    if(child)await waitForQaExit(child);
    // Tests own these fresh namespaces, on failure too. A deliberate geometry
    // fixture is the only large retained payload; source recipes/receipts live
    // outside scratch. No abandoned browser profile or full library is kept.
    // Geometry acceptance already performed independent readback above. Its
    // generated test map remains disposable; the source recipe and compact
    // hashes are sufficient to reproduce it without another retained cache.
    // A diagnostic failure must not leave owned writer payloads behind.
    try{await physicalSample('before-cleanup');}
    catch(error){report.complete=false;report.errors.push('Pre-cleanup measurement failed: '+String(error));process.exitCode=1;}
    await finishStorage(report.complete?'passed':'failed');
  }catch(error){report.complete=false;report.errors.push(String(error));process.exitCode=1;}}
  await fs.writeFile(path.join(root,'acceptance.json'),JSON.stringify(report,null,2));
  await physicalSample('after-cleanup');
  await fs.writeFile(path.join(root,'acceptance.json'),JSON.stringify(report,null,2));
  process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt);
  console.log(JSON.stringify({complete:report.complete,cases:report.cases.length,errors:report.errors}));
}
