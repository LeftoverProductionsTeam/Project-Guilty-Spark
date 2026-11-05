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
const repeatedEdits=process.env.SPARK_LIFECYCLE_REPEAT_EDITS??'';
if(!['','20'].includes(repeatedEdits)||repeatedEdits&&!nativeOnly)throw Error('Repeated native acceptance requires native-only mode and exactly20 edits');
if(nativeOnly&&!nativeMap)throw Error('Native-only acceptance requires an owned map');
await fs.mkdir(await assertQaOutputPath(root));
const app=path.join(root,'GuiltySpark-workspace-lifecycle.exe');await fs.copyFile(path.resolve(source),app,fs.constants.COPYFILE_EXCL);
const report={schemaVersion:1,appSha256:crypto.createHash('sha256').update(await fs.readFile(app)).digest('hex'),mockedIpc:false,detachMethod,scope:nativeOnly?'native-edit-only':'workspace-lifecycle',physicalMonitorDisconnectTested:false,physicalSecondaryMonitorTransferTested:false,cases:[],errors:[],complete:false};
const finishStorage=await beginQaStorage(root,{workflow:repeatedEdits?'native-20-edits':nativeOnly?'native-edit-export':'workspace-lifecycle',appSha256:report.appSha256});
let child,browser,main;
const invoke=(page,command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
const pages=()=>browser.contexts().flatMap(context=>context.pages()).filter(page=>page.url().includes('tauri.localhost'));
async function launchNative(){
  const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
  child=spawn(app,[],{windowsHide:true,stdio:'ignore',env:{...process.env,GUILTY_SPARK_DATA_DIR:path.join(root,'library'),WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
  await expect.poll(()=>fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.ok,()=>false)).toBe(true);browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await expect.poll(()=>pages().length).toBeGreaterThan(0);main=pages()[0];main.on('pageerror',error=>report.errors.push(String(error)));
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
try{
  await launchNative();
  const boot=await invoke(main,'bootstrap');await invoke(main,'save_settings',{settings:{...boot.settings,onboardingCompleted:true,autoBuild:false}});
  if(!nativeOnly){
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
  if(nativeMap){
    if(!invaderDirectory)throw Error('Native map acceptance requires the installed Invader directory');
    const original=await fs.readFile(path.resolve(nativeMap)),originalHash=crypto.createHash('sha256').update(original).digest('hex');
    const [opened]=await invoke(main,'import_paths',{paths:[path.resolve(nativeMap)]});
    expect(opened.project.source.cacheVersion).toBe(13);
    const pistol=opened.inspection.tags.find(tag=>tag.class==='weap'&&tag.path.replaceAll('\\','/').endsWith('weapons/pistol/pistol'));
    if(!pistol)throw Error('Owned native map does not contain the representative pistol');
    await main.reload();await chooseTool(main,'Map library');
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
    expect(nativeGeometry).toMatch(/[\d,]+ visible triangles/);
    await main.screenshot({path:path.join(root,'owned-native-bsp.png')});
    step('Owned MCC map opens in actual native BSP viewport with source materials',{nativeViewport,nativeGeometry,engineParityClaimed:false});
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
  expect(report.errors).toEqual([]);report.complete=true;
}catch(error){report.errors.push(String(error));report.failureStack=error.stack;process.exitCode=1;if(browser)for(const [i,page]of pages().entries())await page.screenshot({path:path.join(root,`failure-window-${i}.png`)}).catch(()=>{});}
finally{await fs.writeFile(path.join(root,'acceptance.json'),JSON.stringify(report,null,2));await browser?.close().catch(()=>{});if(child?.exitCode===null)child.kill();if(finishStorage){try{if(child)await waitForQaExit(child);if(report.complete){await finishStorage.registerDisposable(app);for(const name of ['Cache','Code Cache','GPUCache']){const cache=path.join(root,'webview/EBWebView/Default',name);if(await fs.stat(cache).catch(()=>null))await finishStorage.registerDisposable(cache);}}await finishStorage(report.complete?'passed':'failed');}catch(error){report.complete=false;report.errors.push(String(error));process.exitCode=1;await fs.writeFile(path.join(root,'acceptance.json'),JSON.stringify(report,null,2));}}console.log(JSON.stringify({complete:report.complete,cases:report.cases.length,errors:report.errors}));}
