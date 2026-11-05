import { assertQaOutputPath, beginQaStorage, waitForQaExit } from './native-qa-storage.mjs';
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
const previewOnly=process.env.SPARK_LIFECYCLE_PREVIEW_ONLY==='1';
const contextOnly=process.env.SPARK_LIFECYCLE_TAG_CONTEXTS==='1';
if(contextOnly&&(!nativeOnly||previewOnly))throw Error('Native asset-context acceptance requires native-only mode and its own small bounded run');
const expectedCacheVersion=Number(process.env.SPARK_LIFECYCLE_CACHE_VERSION??'13');
if(![5,6,7,13,609].includes(expectedCacheVersion)||expectedCacheVersion!==13&&!previewOnly||previewOnly&&!nativeOnly)throw Error('Other native cache families require explicit read-only preview acceptance');
const profilePreview=process.env.SPARK_LIFECYCLE_PROFILE==='1';
if(profilePreview&&!nativeOnly)throw Error('Preview profiling requires native-only mode');
const geometryOnly=process.env.SPARK_LIFECYCLE_GEOMETRY==='1';
const repeatedEdits=process.env.SPARK_LIFECYCLE_REPEAT_EDITS??'';
if(!['','20'].includes(repeatedEdits)||repeatedEdits&&!nativeOnly)throw Error('Repeated native acceptance requires native-only mode and exactly20 edits');
if(nativeOnly&&!nativeMap)throw Error('Native-only acceptance requires an owned map');
const inputInfo=nativeMap&&nativeMap!=='-'?await fs.stat(path.resolve(nativeMap)):null;
if(inputInfo&&!inputInfo.isFile())throw Error('Native acceptance input must be an existing owned cache');
if((previewOnly||contextOnly)&&(!inputInfo||inputInfo.size>128*1024*1024))throw Error('The small native preview/context test requires a cache within128MiB; use the full reserved native workflow for larger fixtures');
const reservationBytes=previewOnly||contextOnly?1024**3:4*1024**3;
await fs.mkdir(await assertQaOutputPath(root,{reservationBytes}));
const app=path.join(root,'GuiltySpark-workspace-lifecycle.exe');await fs.copyFile(path.resolve(source),app,fs.constants.COPYFILE_EXCL);
const report={schemaVersion:1,appSha256:crypto.createHash('sha256').update(await fs.readFile(app)).digest('hex'),mockedIpc:false,detachMethod,scope:geometryOnly?'native-geometry-roundtrip':contextOnly?'native-asset-contexts':previewOnly?'native-source-preview':nativeOnly?'native-edit-only':'workspace-lifecycle',physicalMonitorDisconnectTested:false,physicalSecondaryMonitorTransferTested:false,cases:[],errors:[],complete:false};
const finishStorage=await beginQaStorage(root,{workflow:geometryOnly?'native-geometry-roundtrip':contextOnly?'native-asset-contexts':previewOnly?'native-source-preview':repeatedEdits?'native-20-edits':nativeOnly?'native-edit-export':'workspace-lifecycle',appSha256:report.appSha256,reservationBytes});
let child,browser,main;
const invoke=(page,command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
const pages=()=>browser.contexts().flatMap(context=>context.pages()).filter(page=>page.url().includes('tauri.localhost'));
async function launchNative(){
  const started=performance.now();
  const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
  child=spawn(app,[],{windowsHide:true,stdio:'ignore',env:{...process.env,GUILTY_SPARK_DATA_DIR:path.join(root,'library'),WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
  await expect.poll(()=>fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.ok,()=>false)).toBe(true);browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await expect.poll(()=>pages().length).toBeGreaterThan(0);main=pages()[0];main.on('pageerror',error=>report.errors.push(String(error)));
  if(profilePreview)report.previewProfile={appWindowMs:performance.now()-started,conditions:'Fresh application/profile; OS file cache not cleared; same embedded app, source, settings and readiness checks',calls:[]};
}
async function nextPage(before){let page;await expect.poll(()=>{page=pages().find(page=>!before.has(page));return !!page;}).toBe(true);page.on('pageerror',error=>report.errors.push(String(error)));page.on('close',()=>{(report.closedWindows??=[]).push({url:page.url(),completedCases:report.cases.length,at:new Date().toISOString()});});await expect(page.getByRole('button',{name:'Close window',exact:true})).toHaveCount(1);
  // WebView controls can mount while native construction is still applying its
  // saved placement. Wait for registration before testing a subsequent move.
  const label=await page.evaluate(()=>window.__TAURI_INTERNALS__.metadata.currentWindow.label);
  await expect.poll(async()=>(await invoke(page,'workspace_window_inventory')).some(window=>window.label===label)).toBe(true);
  return page;}
async function state(page,id){const status=await invoke(page,'read_workspace_history',{projectId:id});return {...status,project:status.history?.snapshots.find(s=>s.key===status.history.head.current)?.project};}
function step(name,data={}){report.cases.push({name,...data});console.log(JSON.stringify({passed:name,...data}));}
async function storageSample(phase){
  const overview=await invoke(main,'storage_overview'),folders=[];
  for(const folder of overview.folders.filter(folder=>['Projects & preserved originals','Existing native jobs'].includes(folder.label))){
    folders.push(await invoke(main,'storage_measure_folder',{folderId:folder.id}));
  }
  const process=JSON.parse((await promisify(execFile)('pwsh.exe',['-NoProfile','-File',path.resolve('scripts/profile-process-tree.ps1'),'-RootProcessId',String(child.pid)],{windowsHide:true,timeout:30000,maxBuffer:1024*1024})).stdout);
  const row={phase,folders,process,at:new Date().toISOString()};(report.storageSamples??=[]).push(row);return row;
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
async function close(page){await page.getByRole('button',{name:'Close window',exact:true}).click();await expect.poll(()=>page.isClosed()).toBe(true);}
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
try{
  await launchNative();
  const boot=await invoke(main,'bootstrap');await invoke(main,'save_settings',{settings:{...boot.settings,onboardingCompleted:true,autoBuild:false}});
  if(geometryOnly){
    const {nativeGeometryRoundTrip}=await import('./native-geometry-roundtrip.mjs');
    await nativeGeometryRoundTrip({main,root,invoke,expect,report,step,invaderDirectory});
  }
  if(!nativeOnly&&!geometryOnly){
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
  step(`${detachMethod==='pointer'?'Pointer drag':'Native button'} detaches the actual Inspector; selection, draft and authoritative history converge; stale observer writes are retained and refused`);
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
  }
  if(nativeMap&&!geometryOnly){
    if(!invaderDirectory)throw Error('Native map acceptance requires the installed Invader directory');
    const original=await fs.readFile(path.resolve(nativeMap)),originalHash=crypto.createHash('sha256').update(original).digest('hex');
    const importStarted=performance.now();
    const [opened]=await invoke(main,'import_paths',{paths:[path.resolve(nativeMap)]});
    if(profilePreview)report.previewProfile.importMs=performance.now()-importStarted;
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
      report.sourcePreview={cacheVersion:expectedCacheVersion,engine:opened.inspection.header.engine,sourceSha256:originalHash,resources:actualSource.resourceSha256??{},requiredPrimaryShaders:required,missingPrimaryShaders:missing,requiredLightmapPages:lightmaps.size,spartanTagId:spartan?.id??null,spartanModelClass:expectedCacheVersion===5?'mode':'mod2',visibleObjects:opened.project.scene.filter(object=>object.visible).length,readOnly:true,gameplayAccepted:false};
      step('Actual source-family preview loads every required placed/BSP primary shader and its native player-start model; original cache unchanged');
      if(contextOnly){
        if(!pistol)throw Error('Native asset-context acceptance requires the actual pistol');
        await main.evaluate(()=>{window.__GS_PROFILE__=true;performance.clearMeasures();});
        await chooseTool(main,'Tag editor');
        await main.getByRole('textbox',{name:'Search tags',exact:true}).fill(pistol.path);await main.getByRole('combobox',{name:'Filter tag class',exact:true}).selectOption('weap');await main.locator('.tag-row').click();
        const tabs=main.getByRole('tablist',{name:'Asset contexts',exact:true}),area=main.getByRole('region',{name:'Actual model preview',exact:true}),preview=area.locator('.native-model-preview'),canvas=area.locator('canvas');
        await expect(tabs.getByRole('tab')).toHaveCount(8);await expect(preview).toHaveAttribute('data-model-first-frame','true',{timeout:90000});
        await canvas.evaluate(element=>window.c71ContextCanvas=element);const camera=await canvas.getAttribute('data-gs-preview-camera');
        const radius=main.getByRole('spinbutton',{name:'Bounding radius',exact:true}),prior=await radius.inputValue();await radius.fill('0.225');
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
        await expect(radius).toHaveValue('0.225');await main.keyboard.press('Control+z');await expect(radius).toHaveValue(prior);await main.keyboard.press('Control+y');await expect(radius).toHaveValue('0.225');
        await tabs.getByRole('tab',{name:'Collision',exact:true}).click();await expect(preview).toHaveAttribute('data-collision-status','ready');
        await tabs.getByRole('tab',{name:'Properties',exact:true}).click();await expect(preview).toHaveAttribute('data-model-first-frame','true');
        expect(await canvas.evaluate(element=>element===window.c71ContextCanvas)).toBe(true);expect(await canvas.getAttribute('data-gs-preview-camera')).toBe(camera);
        const calls=await main.evaluate(()=>performance.getEntriesByType('measure').filter(entry=>entry.name.startsWith('spark.ipc.')).map(({name,duration})=>({command:name.slice(10),ms:duration})));
        expect(calls.filter(call=>call.command==='preview_owned_object_collision')).toHaveLength(1);
        await main.keyboard.press('Control+s');await expect.poll(async()=>(await invoke(main,'open_project',{id:opened.project.id})).project.tagEdits.find(edit=>edit.tagId===pistol.id&&edit.fieldKey==='bounding-radius')?.value).toBe(.225);
        const smart=main.locator('.smart-edit').first();await smart.locator('summary').first().click();await smart.getByRole('button',{name:'Review save plan',exact:true}).click();await expect(smart.locator('.smart-edit-plan>strong')).toHaveText('Direct map copy');await smart.getByRole('button',{name:'Save validated map copy',exact:true}).click();await expect(smart.locator('.smart-edit-result>strong')).toHaveText('Validated copy ready');
        const edited=(await invoke(main,'open_project',{id:opened.project.id})).project,build=edited.builds.at(-1);
        const proof=JSON.parse(await fs.readFile(path.join(root,'library/jobs',build.id,'smart-edit-receipt.json'),'utf8'));expect(proof.compilerRan).toBe(false);expect(proof.allOtherBytesPreserved).toBe(true);
        const tool=name=>path.join(path.resolve(invaderDirectory),name+'.exe'),run=promisify(execFile),tags=path.join(root,'independent-native-tags');await fs.mkdir(tags);
        expect((await run(tool('invader-info'),['-T','crc32_mismatched',build.output],{windowsHide:true,timeout:30000})).stdout.trim()).toBe('0');
        await run(tool('invader-extract'),['-s',pistol.path+'.weapon','-t',tags,build.output],{windowsHide:true,timeout:30000});
        const readback=Number((await run(tool('invader-edit'),['-t',tags,'-G','bounding_radius',pistol.path+'.weapon'],{windowsHide:true,timeout:30000})).stdout.trim());expect(readback).toBeCloseTo(.225,6);
        await chooseTool(main,'Map library');await main.locator(`.map-card[data-project-id="${opened.project.id}"]`).click();await chooseTool(main,'Tag editor');await expect(radius).toHaveValue('0.225');
        report.assetContexts={sourceSha256:originalHash,tagId:pistol.id,selectedShader,selectedBitmap,usedShaders,reflectionInspection:{tagId:reflectionId,faces},collisionTriangles:collision.indices.length/3,sameCanvas:true,sameCamera:true,collisionReads:1,calls,undoRedoSaveReopen:true,output:build.output,outputSha256:build.sha256,independentInvaderReadback:readback,compilerRan:false,gameplayAccepted:false};
        let playable;
        const candidates=opened.inspection.tags.filter(tag=>tag.class==='snd!').sort((a,b)=>Number(/teleporter_loop/.test(b.path))-Number(/teleporter_loop/.test(a.path))).slice(0,8);
        for(const tag of candidates){const inspected=await invoke(main,'inspect_sound',{projectId:opened.project.id,tagId:tag.id});if(inspected.sourceSha256!==originalHash)throw Error('Native sound source differs');if(inspected.permutations.some(sample=>sample.available)){playable=tag;break;}}
        if(!playable)throw Error('No playable native sound in the bounded context acceptance selection');
        await main.getByRole('textbox',{name:'Search tags',exact:true}).fill(playable.path);await main.getByRole('combobox',{name:'Filter tag class',exact:true}).selectOption('snd!');await main.locator('.tag-row').click();
        const sound=main.locator('.sound-inspector');await expect(sound.getByRole('button',{name:'Play sample',exact:true})).toBeVisible();await sound.getByText('Sample details & options',{exact:true}).click();await sound.getByRole('checkbox',{name:'Repeat sample',exact:true}).check();
        let meter,done;const meterPath=process.env.SPARK_LIFECYCLE_AUDIO_METER;
        if(meterPath){meter=spawn(path.resolve(meterPath),[String(child.pid),path.join(root,'context-audio-output.json'),'6'],{windowsHide:true,stdio:['ignore','ignore','pipe']});let stderr='';meter.stderr.on('data',data=>stderr+=data.toString());done=new Promise(resolve=>meter.once('exit',code=>resolve({code,stderr})));}
        await sound.getByRole('button',{name:'Play sample',exact:true}).click();await expect(sound.locator('[data-audition-state]')).toHaveAttribute('data-audition-state','playing');await main.waitForTimeout(2000);
        await tabs.getByRole('tab',{name:'Properties',exact:true}).click();await expect(sound.locator('[data-audition-state]')).toHaveAttribute('data-audition-state','idle');await tabs.getByRole('tab',{name:'Sound',exact:true}).click();await expect(sound.getByRole('checkbox',{name:'Repeat sample',exact:true})).toBeChecked();
        report.assetContexts.sound={tagId:playable.id,path:playable.path,playedThenStoppedOnContextChange:true,retainedSampleOptions:true,humanHearingAccepted:false};
        if(done){const result=await done;expect(result).toEqual({code:0,stderr:''});const output=JSON.parse(await fs.readFile(path.join(root,'context-audio-output.json'),'utf8'));const peak=Math.max(0,...output.readings.flatMap(row=>row.sessions.map(session=>session.Peak)));expect(peak).toBeGreaterThan(.0001);report.assetContexts.sound.windowsOwnedSessionPeak=peak;}
        await main.screenshot({path:path.join(root,'native-context-sound.png')});
        await nativeTagAnimation(opened);
        expect(crypto.createHash('sha256').update(await fs.readFile(path.resolve(nativeMap))).digest('hex')).toBe(originalHash);
        step('Actual asset contexts retain one native preview/camera, reuse real collision, and preserve Undo/Save/reopen and independently read native output',report.assetContexts);
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
      const baseline=await storageSample('textured-map-and-preview-ready');
      const rows=[];let previous=.225;
      for(let index=0;index<20;index++){
        const value=Number((.226+index*.001).toFixed(3));
        await radius.fill(String(value));await radius.press('Tab');
        await main.keyboard.press('Control+z');await expect(radius).toHaveValue(String(previous));
        await main.keyboard.press('Control+y');await expect(radius).toHaveValue(String(value));
        await main.keyboard.press('Control+s');
        await expect.poll(async()=>{
          const project=(await invoke(main,'open_project',{id:opened.project.id})).project;
          return project.tagEdits.find(edit=>edit.tagId===pistol.id&&edit.fieldKey==='bounding-radius')?.value;
        }).toBe(value);
        const snapshot=await invoke(main,'create_project_snapshot',{projectId:opened.project.id,reason:'periodic'});
        rows.push({index:index+1,value,snapshotId:snapshot?.id??null});previous=value;
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
      const stoppedPid=child.pid;await browser.close();child.kill();await waitForQaExit(child);await launchNative();
      // The replacement WebView has its own Page; never carry a locator from
      // the deliberately crashed process into the recovery acceptance checks.
      radius=main.getByRole('spinbutton',{name:'Bounding radius',exact:true});
      report.repeatedEdits.ownedProcessCrashRecovery={stoppedPid,restartedPid:child.pid,libraryReused:true,acknowledgedSaveOnly:true};
      await chooseTool(main,'Map library');await main.locator(`.map-card[data-project-id="${opened.project.id}"]`).click();
      await chooseTool(main,'Tag editor');await main.getByRole('textbox',{name:'Search tags',exact:true}).fill(pistol.path);
      await main.getByRole('combobox',{name:'Filter tag class',exact:true}).selectOption('weap');
      await main.locator('.tag-row').filter({has:main.locator('strong',{hasText:/^pistol$/})}).click();await expect(radius).toHaveValue('0.225');
      const final=await storageSample('same-project-reopened-after20-edits');
      const projectBytes=sample=>sample.folders.find(folder=>folder.label==='Projects & preserved originals')?.measurement?.logicalBytes;
      const growth=projectBytes(final)-projectBytes(baseline);expect(Number.isFinite(growth)).toBe(true);expect(growth).toBeLessThan(32*1024**2);
      report.repeatedEdits.projectLogicalGrowthBytes=growth;
      report.repeatedEdits.sampledPeakPrivateBytes=Math.max(...report.storageSamples.map(row=>Number(row.process.privateBytes)));
      const comparable=report.storageSamples.find(row=>row.phase==='saved-edit-20');
      const memoryGrowth=Number(comparable.process.privateBytes)-Number(baseline.process.privateBytes);
      expect(Number.isFinite(memoryGrowth)).toBe(true);expect(memoryGrowth).toBeLessThan(512*1024**2);
      report.repeatedEdits.comparablePrivateMemoryGrowthBytes=memoryGrowth;
      step('Twenty genuine native tag edits, author Undo/Redo, immediate saves and same-project reopen remain bounded',{edits:20,projectLogicalGrowthBytes:growth});
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
    const smart=main.locator('.smart-edit').first();await smart.locator('summary').first().click();
    await smart.getByRole('button',{name:'Review save plan',exact:true}).click();
    await expect(smart.locator('.smart-edit-plan>strong')).toHaveText('Direct map copy');
    await smart.getByRole('button',{name:'Save validated map copy',exact:true}).click();
    await expect(smart.locator('.smart-edit-result>strong')).toHaveText('Validated copy ready');
    const edited=(await invoke(main,'open_project',{id:opened.project.id})).project,build=edited.builds.at(-1);
    const proof=JSON.parse(await fs.readFile(path.join(root,'library','jobs',build.id,'smart-edit-receipt.json'),'utf8'));
    expect(proof.compilerRan).toBe(false);expect(proof.allOtherBytesPreserved).toBe(true);
    const run=promisify(execFile),tool=name=>path.join(path.resolve(invaderDirectory),name+'.exe');
    const crc=await run(tool('invader-info'),['-T','crc32_mismatched',build.output],{windowsHide:true,timeout:30000});expect(crc.stdout.trim()).toBe('0');
    const tags=path.join(root,'independent-native-tags');await fs.mkdir(tags);
    await run(tool('invader-extract'),['-s',pistol.path+'.weapon','-t',tags,build.output],{windowsHide:true,timeout:30000});
    const readback=await run(tool('invader-edit'),['-t',tags,'-G','bounding_radius',pistol.path+'.weapon'],{windowsHide:true,timeout:30000});
    expect(Number(readback.stdout.trim())).toBeCloseTo(.225,6);
    expect(crypto.createHash('sha256').update(await fs.readFile(path.resolve(nativeMap))).digest('hex')).toBe(originalHash);
    const output=await invoke(main,'open_built_map',{projectId:opened.project.id,buildId:build.id});
    expect(output.inspection.tags.find(tag=>tag.class==='weap'&&tag.path===pistol.path).fields.find(field=>field.key==='bounding-radius').value).toBeCloseTo(.225,6);
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
    }
  }
  expect(report.errors).toEqual([]);report.complete=true;
}catch(error){report.errors.push(String(error));report.failureStack=error.stack;process.exitCode=1;if(browser)for(const [i,page]of pages().entries())await page.screenshot({path:path.join(root,`failure-window-${i}.png`)}).catch(()=>{});}
finally{
  // Successful acceptance closes the actual application normally before
  // sealing its regenerable cache. Abrupt termination leaves WebView writers
  // flushing files after the parent exits; those files must never be deleted
  // against an unstable hash inventory.
  if(report.complete&&browser){
    try{for(const page of pages().reverse()){if(!page.isClosed())await close(page);}if(child)await waitForQaExit(child);report.gracefulAppClose=true;}
    catch(error){report.complete=false;report.errors.push('Normal QA app close failed: '+String(error));process.exitCode=1;}
  }
  await browser?.close().catch(()=>{});
  if(child?.exitCode===null)child.kill();
  if(finishStorage){try{
    if(child)await waitForQaExit(child);
    if(report.complete){
      await finishStorage.registerDisposable(app);
      for(const name of ['Cache','Code Cache','GPUCache']){
        const cache=path.join(root,'webview/EBWebView/Default',name);
        if(await fs.stat(cache).catch(()=>null))await finishStorage.registerDisposable(cache);
      }
    }
    await finishStorage(report.complete?'passed':'failed');
  }catch(error){report.complete=false;report.errors.push(String(error));process.exitCode=1;}}
  await fs.writeFile(path.join(root,'acceptance.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({complete:report.complete,cases:report.cases.length,errors:report.errors}));
}
