// Real Tauri/WebView2 acceptance. Own process/library/profile; no mocked IPC,
// synthetic game success, original source writes or optional downloads.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,expect as assertion} from '@playwright/test';
import {chooseTool,openDrawer} from '../tests/ui/helpers/navigation.ts';
const args=process.argv.slice(2);
if(args.length!==3)throw Error('test-spark-flow-native <embedded exe> <fresh evidence root> <owned native map>');
const [source,root,map]=args.map(p=>path.resolve(p)),expect=assertion.configure({timeout:45000});
await fs.mkdir(root);const exe=path.join(root,'GuiltySpark-spark-flow.exe');await fs.copyFile(source,exe,fs.constants.COPYFILE_EXCL);
const sha=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const report={schemaVersion:1,appSha256:await sha(exe),sourceMapSha256:await sha(map),mockedIpc:false,actualGamePlayed:false,complete:false,cases:[],errors:[],timing:{}};
const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
let processHandle,browser,main,temporarilyMissing;
const pages=()=>browser.contexts().flatMap(c=>c.pages()).filter(p=>p.url().includes('tauri.localhost'));
const call=(page,command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
const shell=page=>page.locator('.gs-workspace-shell');
const row=page=>page.getByRole('region',{name:'Inspector panel',exact:true});
const x=page=>row(page).getByRole('spinbutton',{name:'Position X',exact:true}).first();
const history=async(page,id)=>{const s=await call(page,'read_workspace_history',{projectId:id});return {...s,project:s.history?.snapshots.find(p=>p.key===s.history.head.current)?.project};};
const mark=(name,evidence={})=>{report.cases.push({name,...evidence});console.log(JSON.stringify({passed:name,...evidence}));};
async function nextPage(before){let page;await expect.poll(()=>{page=pages().find(p=>!before.has(p));return !!page;}).toBe(true);page.on('pageerror',e=>report.errors.push(String(e)));await expect(page.getByRole('button',{name:'Close window',exact:true})).toHaveCount(1);return page;}
async function close(page){await page.getByRole('button',{name:'Close window',exact:true}).click();await expect.poll(()=>page.isClosed()).toBe(true);}
async function work(page){const button=page.getByRole('button',{name:'Open work and workspace windows',exact:true});if(!await page.getByRole('dialog',{name:'Open work',exact:true}).isVisible())await button.click();return page.getByRole('dialog',{name:'Open work',exact:true});}
async function role(page,value){await(await work(page)).getByLabel('Workspace in this window',{exact:true}).selectOption(value);await expect(shell(page)).toHaveAttribute('data-workspace',['world','quickforge','live'].includes(value)?'level':value);}
async function mapOpen(page,title){await chooseTool(page,'Map library');console.log('MAP_CHOICES',JSON.stringify({wanted:title,cards:await page.locator('.map-card h3').allTextContents()}));await page.locator('.map-card').filter({hasText:title}).click();await expect(page.locator('.runtime-dock-heading>span').first()).toHaveText(title);}
async function inspector(page,select=false){if(select){await openDrawer(page,'Build tools');await page.getByRole('region',{name:'Build tools panel',exact:true}).locator('.forge-tree-select').first().click();}await openDrawer(page,'Inspector');await row(page).getByRole('button',{name:'Properties',exact:true}).click();await expect(x(page)).toBeVisible();}
async function setX(page,value){await x(page).fill(String(value));await x(page).press('Tab');}
try{
  const start=performance.now();processHandle=spawn(exe,[],{windowsHide:true,stdio:'ignore',env:{...process.env,GUILTY_SPARK_DATA_DIR:path.join(root,'library'),WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
  await fs.writeFile(path.join(root,'owned-process.json'),JSON.stringify({pid:processHandle.pid,port}));
  await expect.poll(()=>fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.ok,()=>false)).toBe(true);browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await expect.poll(()=>pages().length).toBeGreaterThan(0);main=pages()[0];main.on('pageerror',e=>report.errors.push(String(e)));
  const boot=await call(main,'bootstrap');report.timing.coldBootstrapMs=performance.now()-start;
  await call(main,'save_settings',{settings:{...boot.settings,onboardingCompleted:true,autoBuild:false}});
  const a=await call(main,'create_quickforge_project',{title:'C69 Flow A',template:'smallIndoorArena',target:'haloCustomEdition'}),b=await call(main,'create_quickforge_project',{title:'C69 Flow B',template:'smallIndoorArena',target:'haloCustomEdition'});
  const [nativeMap]=await call(main,'import_paths',{paths:[map]});report.sourceProjectId=nativeMap.project.id;
  const reloadStarted=performance.now();await main.reload();await expect(main.getByRole('heading',{name:'One Halo. Every World. Every Tool. Together.',exact:true})).toBeVisible({timeout:120000});report.timing.firstLibraryReadyMs=performance.now()-reloadStarted;report.timing.fixtureSetupMs=reloadStarted-start;await mapOpen(main,'C69 Flow A');await inspector(main,true);await setX(main,.75);
  await expect.poll(async()=>(await history(main,a.project.id)).project.quickForge.geometry[0].position[0]).toBe(.75);
  await main.locator('.forge-viewport canvas').evaluate(canvas=>{window.c69Canvas=canvas;window.c69Gl=canvas.getContext('webgl2');});
  const before=(await history(main,a.project.id)).history.head;
  await role(main,'creator');await main.getByRole('tab',{name:'Custom power-ups',exact:true}).click();
  await main.locator('.creator-workspace,.creator-page').first().evaluate(el=>window.c69Creator=el).catch(()=>{});
  await role(main,'assets');await expect(main.getByRole('heading',{name:'Give an idea some shape.',exact:true})).toBeVisible();
  let previous=new Set(pages()),began=performance.now();await(await work(main)).getByRole('button',{name:'Open workspace in another window',exact:true}).click();const assetWindow=await nextPage(previous);
  report.timing.newWorkspaceWindowMs=performance.now()-began;
  await expect(assetWindow.locator('.runtime-dock-heading>span').first()).toHaveText('C69 Flow A');
  await role(assetWindow,'creator');await assetWindow.getByRole('tab',{name:'Custom power-ups',exact:true}).click();await role(assetWindow,'assets');await role(assetWindow,'creator');
  await expect(assetWindow.getByRole('tab',{name:'Custom power-ups',exact:true})).toHaveClass(/selected|active/);
  await expect(shell(main)).toHaveAttribute('data-workspace','assets');expect((await history(assetWindow,a.project.id)).writable).toBe(false);
  const windows=await call(main,'workspace_window_inventory');expect(windows).toHaveLength(2);expect(windows.filter(w=>w.writable)).toHaveLength(1);
  mark('One native app owns both windows; the companion changes roles independently and retains its own Creator state');
  // Focusing an existing role never manufactures a second source owner/window.
  await role(assetWindow,'assets');const existing=await call(main,'open_project_window',{id:a.project.id,workspace:'assets',observe:true});expect(existing).toBe(await assetWindow.evaluate(()=>window.__TAURI_INTERNALS__.metadata.currentWindow.label));expect(pages()).toHaveLength(2);
  previous=new Set(pages());await call(main,'open_project_window',{id:a.project.id,workspace:'assets',observe:true,another:true});const explicit=await nextPage(previous);expect(pages()).toHaveLength(3);await close(explicit);
  mark('Default open focuses the existing role; explicit another-view is required for a duplicate');
  began=performance.now();await role(main,'quickforge');await inspector(main);await expect(x(main)).toHaveValue('0.75');report.timing.retainedLevelReturnMs=performance.now()-began;
  expect(await main.evaluate(()=>window.c69Canvas===document.querySelector('.forge-viewport canvas'))).toBe(true);
  expect((await history(main,a.project.id)).history.head.past).toHaveLength(before.past.length);
  await main.keyboard.press('Control+z');await expect(x(main)).toHaveValue('0');await main.keyboard.press('Control+y');await expect(x(main)).toHaveValue('0.75');
  mark('Source draft, same Canvas and Undo/Redo survive role changes; navigation does not add source edits');
  // Focused numeric fields must allow inspector scrolling without wheel edits.
  await x(main).focus();const box=await x(main).boundingBox();await main.mouse.move(box.x+box.width/2,box.y+box.height/2);await main.mouse.wheel(0,300);await expect(x(main)).toHaveValue('0.75');
  mark('Inspector wheel input does not change a focused numeric value');
  // Each view keeps its own selection even while accepted source changes follow.
  await role(assetWindow,'quickforge');await inspector(assetWindow,true);await openDrawer(assetWindow,'Build tools');const tree=assetWindow.getByRole('region',{name:'Build tools panel',exact:true}).locator('.forge-tree-select');await tree.nth(1).click();await inspector(assetWindow);
  const sourceBefore=(await history(main,a.project.id)).project.quickForge;
  await setX(main,1.25);await expect.poll(async()=>(await history(assetWindow,a.project.id)).project.quickForge.geometry[0].position[0]).toBe(1.25);
  expect((await history(main,a.project.id)).project.quickForge.geometry.slice(1)).toEqual(sourceBefore.geometry.slice(1));
  await expect(x(main)).toHaveValue('1.25');await expect(x(assetWindow)).not.toHaveValue('1.25');
  mark('Independent selected objects share one authoritative revision without changing each other’s view');
  await mapOpen(main,'C69 Flow B');await inspector(main,true);await setX(main,2.5);await expect.poll(async()=>(await history(main,b.project.id)).project.quickForge.geometry[0].position[0]).toBe(2.5);
  expect((await history(assetWindow,a.project.id)).project.quickForge.geometry[0].position[0]).toBe(1.25);
  // Tab actions change UI order only.
  const bTab=main.getByRole('tab',{name:/C69 Flow B/});await bTab.click({button:'right'});await main.getByRole('menuitem',{name:'Pin tab',exact:true}).click();await expect(main.locator('.map-tab').first()).toHaveAttribute('data-pinned','true');
  mark('Two maps remain isolated; pinning and tab ordering do not change either source');
  // A real editable BSP face, its camera and view context belong to this source.
  await main.getByRole('button',{name:'BSP Workshop',exact:true}).click();
  await main.getByRole('button',{name:'Two rooms + corridor + ramp',exact:true}).click();
  const bsp=main.getByRole('region',{name:'Native BSP Workshop',exact:true});
  await expect(bsp).toBeVisible();await bsp.locator('.bsp-source-list button').first().click();
  await bsp.getByRole('button',{name:'Face',exact:true}).click();
  const faces=bsp.getByLabel('BSP source face',{exact:true});await faces.selectOption({index:1});
  const top=bsp.getByLabel('top orthographic editing view',{exact:true}),initialView=await top.getAttribute('viewBox');await top.hover();await main.mouse.wheel(0,-140);await expect(top).not.toHaveAttribute('viewBox',initialView);
  const savedFace=await bsp.getAttribute('data-selected-face'),savedBrush=await bsp.getAttribute('data-selected-brush'),savedView=await top.getAttribute('viewBox');
  const bspHead=(await history(main,b.project.id)).history.head.past.length;
  await role(main,'creator');await role(main,'assets');
  const recent=(await work(main)).getByRole('region',{name:'Recent places',exact:true});
  await recent.getByRole('button').filter({hasText:'Level editor'}).filter({hasText:'C69 Flow B'}).first().click();
  await expect(bsp).toHaveAttribute('data-selected-face',savedFace);await expect(bsp).toHaveAttribute('data-selected-brush',savedBrush);await expect(top).toHaveAttribute('viewBox',savedView);
  await main.getByRole('button',{name:'Back to previous workspace',exact:true}).click();await expect(shell(main)).toHaveAttribute('data-workspace','assets');
  await main.getByRole('button',{name:'Forward to next workspace',exact:true}).click();await expect(bsp).toBeVisible();
  expect((await history(main,b.project.id)).history.head.past.length).toBe(bspHead);
  mark('Recent Places and Back/Forward restore the actual BSP face, volume and camera without adding source Undo entries',{face:savedFace,brush:savedBrush,viewBox:savedView});
  // The main map has a real native cache; preview readiness is actual geometry,
  // source materials and first usable frame, not a decoded-count assertion.
  await main.evaluate(()=>{window.__GS_PROFILE__=true;performance.clearMeasures();});
  await mapOpen(main,nativeMap.project.title);await role(main,'tags');const query=main.getByRole('textbox',{name:'Search tags',exact:true});
  await main.getByLabel('Filter tag class',{exact:true}).selectOption('weap');await query.fill('weapons\\pistol\\pistol');const candidate=main.locator('.tag-list .tag-row').filter({hasText:/pistol/}).first();
  if(await candidate.count())await candidate.click();
  const preview=main.locator('.native-model-preview').first();began=performance.now();
  if(await preview.count()){
    await expect(preview).toHaveAttribute('data-model-ready','true',{timeout:120000});await expect(preview).toHaveAttribute('data-model-first-frame','true');report.timing.nativePreviewReadyMs=performance.now()-began;
    const attributes=await preview.evaluate(el=>Object.fromEntries([...el.attributes].filter(a=>a.name.startsWith('data-model-')).map(a=>[a.name,a.value])));report.preview=attributes;
    await preview.evaluate(el=>window.c69Preview=el);await main.screenshot({path:path.join(root,'native-preview.png')});
    report.initialPreviewIpc=await main.evaluate(()=>performance.getEntriesByType('measure').map(e=>e.name).filter(name=>name.startsWith('spark.ipc.')));
    expect(report.initialPreviewIpc.length).toBeGreaterThan(0);
    // The retained Level Editor is still finishing its first full-map texture
    // load behind the pistol preview. Measure warm navigation after that work
    // settles, rather than attributing its in-flight batches to this preview.
    const settleStarted=performance.now();let completed=-1,stableSince=performance.now();
    await expect.poll(async()=>{const count=await main.evaluate(()=>performance.getEntriesByType('measure').filter(e=>/spark.ipc.preview_owned_(object_model|cache_bitmap_batch|reflection_cube)/.test(e.name)).length);if(count!==completed){completed=count;stableSince=performance.now();}return performance.now()-stableSince;},{timeout:120000}).toBeGreaterThan(1800);
    report.timing.initialMapResourcesSettleMs=performance.now()-settleStarted;await main.evaluate(()=>performance.clearMeasures());
    await role(main,'creator');began=performance.now();await role(main,'tags');report.timing.retainedPreviewReturnMs=performance.now()-began;
    expect(await preview.evaluate(el=>el===window.c69Preview)).toBe(true);await expect(preview).toHaveAttribute('data-model-first-frame','true');expect(await preview.locator('.gs-shield-loading').count()).toBe(0);
    report.retainedPreviewMeasures=await main.evaluate(()=>performance.getEntriesByType("measure").filter(e=>e.name.startsWith("spark.ipc.")).map(({name,startTime,duration})=>({name,startTime,duration})));report.retainedPreviewIpc=await main.evaluate(()=>performance.getEntriesByType('measure').map(e=>e.name).filter(name=>name.startsWith('spark.ipc.')));expect(report.retainedPreviewIpc.length).toBeGreaterThan(0);expect(report.retainedPreviewIpc.filter(command=>/model|bitmap|reflection|animation/.test(command))).toEqual([]);
    mark('A native Halo model reaches first-frame readiness and returns as the same preview without a loading reset',attributes);
    const previewCanvas=preview.locator('canvas');await previewCanvas.evaluate(canvas=>{const gl=canvas.getContext('webgl2'),clear=gl.clear.bind(gl);window.c69PreviewCanvas=canvas;window.c69PreviewClears=0;const measured=(...args)=>{window.c69PreviewClears++;return clear(...args);};gl.clear=measured;if(gl.clear!==measured)throw Error('GL instrumentation is unavailable');});await expect.poll(()=>main.evaluate(()=>window.c69PreviewClears)).toBeGreaterThan(0);
    await main.getByRole('button',{name:'Minimize window',exact:true}).click();await expect(previewCanvas).toHaveAttribute('data-gs-editor-activity','paused');const paused=await main.evaluate(()=>window.c69PreviewClears);await main.waitForTimeout(650);expect(await main.evaluate(()=>window.c69PreviewClears)).toBe(paused);
    await call(main,'plugin:window|unminimize',{label:'main'});await call(main,'plugin:window|set_focus',{label:'main'});await expect(previewCanvas).not.toHaveAttribute('data-gs-editor-activity','paused');expect(await previewCanvas.evaluate(canvas=>canvas===window.c69PreviewCanvas)).toBe(true);
    mark('Minimizing the native model-preview window pauses actual GL clears and restores the same Canvas',{glClearsOver650ms:0});
  }else throw Error('The native model preview was not selected; acceptance remains incomplete');
  // Save native window layout, reduce to one window, then restore both roles.
  await role(main,'quickforge');await call(main,'save_workspace_layout',{name:'Map Builder'});const saved=await call(main,'read_workspace_layout',{name:'Map Builder'});expect(saved.windows).toHaveLength(2);
  await call(main,'save_workspace_layout',{name:'Asset Creator'});expect(await call(main,'workspace_layout_names')).toEqual(['Asset Creator','Map Builder']);
  expect(await call(main,'read_workspace_layout',{name:'Map Builder'})).toEqual(saved);
  await close(assetWindow);await expect.poll(()=>call(main,'workspace_window_inventory').then(rows=>rows.length)).toBe(1);
  const layout=main.locator('.gs-layout-menu');await layout.locator('summary').click();await layout.getByLabel('Window layout name',{exact:true}).fill('Map Builder');await layout.getByRole('button',{name:'Restore workspace windows',exact:true}).click();
  await expect.poll(()=>call(main,'workspace_window_inventory').then(rows=>rows.length)).toBe(2);
  await expect(main.locator('.toast')).toContainText('Workspace windows restored');
  report.savedLayout=saved;mark('Saved roles, source identities and native window placement restore without running a tool or build');
  const current=await call(main,'workspace_window_inventory');const childWindow=pages().find(p=>p!==main);expect(childWindow).toBeTruthy();
  const childLabel=current.find(w=>!w.current).label;await call(childWindow,'plugin:window|set_position',{label:childLabel,value:{Physical:{x:-30000,y:30000}}});await call(childWindow,'recover_workspace_window');const recovered=await call(childWindow,'plugin:window|outer_position',{label:childLabel});expect(recovered.x).toBeGreaterThan(-30000);expect(recovered.y).toBeLessThan(30000);report.offscreenRecovery=recovered;
  // Optional companion is a picture/shortcut, never a second App or renderer.
  await role(main,'settings');await main.getByRole('tab',{name:'Interface Studio',exact:true}).click();await main.getByRole('tab',{name:'Window',exact:true}).click();
  await main.getByLabel('Show desktop Spark companion',{exact:true}).check();let orb;
  await expect.poll(()=>{orb=pages().find(p=>p.url().includes('companion=1'));return !!orb;}).toBe(true);
  await expect(orb.getByRole('button',{name:'Open Spark command hub',exact:true})).toBeVisible();expect(await orb.locator('canvas').count()).toBe(0);expect(await orb.locator('.application').count()).toBe(0);
  await call(orb,'plugin:window|set_position',{label:'spark-orb',value:{Physical:{x:-30000,y:30000}}});await call(orb,'recover_workspace_window');const orbPosition=await call(orb,'plugin:window|outer_position',{label:'spark-orb'});expect(orbPosition.x).toBeGreaterThan(-30000);expect(orbPosition.y).toBeLessThan(30000);await call(orb,'remember_spark_companion');
  await orb.getByRole('button',{name:'Open Spark command hub',exact:true}).click();await expect(main.getByRole('dialog',{name:'Open work',exact:true})).toBeVisible();expect((await call(main,'workspace_window_inventory')).length).toBe(2);
  try{await orb.getByRole('button',{name:'Hide Spark companion',exact:true}).click({noWaitAfter:true});}catch(error){if(!orb.isClosed())throw error;}
  await expect.poll(()=>orb.isClosed()).toBe(true);await main.keyboard.press('Escape');await expect(main.getByLabel('Show desktop Spark companion',{exact:true})).not.toBeChecked();
  mark('Optional desktop companion opens the same command hub, has no renderer/project UI, recovers offscreen and hides through its saved preference',{position:orbPosition});
  // Repeat a comparable three-workspace cycle after warm-up, with GC-normalized
  // WebView measurements. These are not VRAM-byte estimates or gameplay tests.
  await role(main,'tags');const cdp=await main.context().newCDPSession(main);await cdp.send('Performance.enable');
  const metrics=async()=>{await main.waitForTimeout(750);await cdp.send('HeapProfiler.collectGarbage');return Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.filter(m=>['JSHeapUsedSize','JSHeapTotalSize','Nodes','Documents','TaskDuration'].includes(m.name)).map(m=>[m.name,m.value]));};
  await main.evaluate(()=>{window.c69Fades=[];const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){if(this.classList.contains('gs-workspace-content'))window.c69Fades.push({frames,options});return animate.call(this,frames,options);};performance.clearMeasures();});
  report.retentionSamples=[await metrics()];const loopStart=performance.now();
  for(let batch=0;batch<3;batch++){for(let i=0;i<6;i++){await role(main,'creator');await role(main,'assets');await role(main,'tags');await expect(preview).toHaveAttribute('data-model-first-frame','true');}report.retentionSamples.push(await metrics());}
  report.retentionCycleMs=performance.now()-loopStart;report.retentionCycles=18;
  expect(report.retentionSamples.at(-1).JSHeapUsedSize-report.retentionSamples[1].JSHeapUsedSize).toBeLessThan(48*1024*1024);
  expect(report.retentionSamples.at(-1).Documents).toBe(report.retentionSamples[0].Documents);
  expect(await preview.evaluate(el=>el===window.c69Preview)).toBe(true);report.retentionNativeReads=await main.evaluate(()=>performance.getEntriesByType('measure').map(e=>e.name).filter(command=>/preview_owned_object_model|preview_owned_cache_bitmap_batch|preview_owned_reflection_cube/.test(command)));expect(report.retentionNativeReads).toEqual([]);
  report.fades=await main.evaluate(()=>window.c69Fades);expect(report.fades.length).toBeGreaterThan(0);expect(report.fades.every(f=>f.options.duration<=200&&f.frames.every(frame=>frame.opacity>=.8))).toBe(true);
  mark('Eighteen repeated three-workspace cycles retain the native preview without new model/bitmap/cube reads and with bounded measured WebView growth',{samples:report.retentionSamples,cycles:18});
  // Exercise a genuine unavailable source, exclusively in this run's owned
  // imported copy. The exact bytes are restored even if a later assertion fails.
  const anotherTag=nativeMap.inspection.tags.find(t=>t.class==='weap'&&t.id!==Number(report.preview['data-model-tag']));expect(anotherTag).toBeTruthy();
  const preserved=nativeMap.project.source.preservedPath,relative=path.relative(path.toNamespacedPath(root),path.toNamespacedPath(preserved));
  if(relative.startsWith('..')||path.isAbsolute(relative)||(await fs.lstat(preserved)).isSymbolicLink())throw Error('Refuse to move a source outside this fresh owned library');
  expect(await sha(preserved)).toBe(report.sourceMapSha256);temporarilyMissing={path:preserved,backup:preserved+'.c69-owned-missing-source'};await fs.rename(preserved,temporarilyMissing.backup);
  await query.fill(anotherTag.path);await main.locator('.tag-list .tag-row').filter({hasText:anotherTag.path.split('\\').at(-1)}).first().click();
  const failedPreview=main.locator('.native-model-preview').first(),retry=failedPreview.getByRole('button',{name:'Retry preview',exact:true});
  await expect.poll(async()=>await retry.isVisible()||await failedPreview.getAttribute('data-model-first-frame')==='true').toBe(true);
  const rejected=await retry.isVisible();expect(await failedPreview.getAttribute('data-model-loading-phase')).toBeNull();expect(await failedPreview.locator('.gs-shield-loading').count()).toBe(0);
  await fs.rename(temporarilyMissing.backup,preserved);temporarilyMissing=null;
  if(rejected){await retry.click();await expect(failedPreview).toHaveAttribute('data-model-first-frame','true',{timeout:120000});}
  else{await expect(failedPreview).toHaveAttribute('data-model-source-hash',report.sourceMapSha256);await expect(failedPreview).toHaveAttribute('data-model-material-gaps','0');}
  report.missingSource={tag:anotherTag.path,result:rejected?'Native read refused; retry recovered':'Previously verified immutable source remained usable in memory',retryFailurePathVerified:rejected};
  mark(rejected?'Unavailable owned source stops loading and recovers through Retry':'A temporarily unavailable owned file keeps its verified immutable preview usable without a false loading loop',report.missingSource);
  // A separate, explicitly malformed QA cache exercises the genuine model
  // reader's "no geometry" refusal. No original, game install or accepted map
  // is changed, and the corruption is never attributed to an external tool.
  const pistol=nativeMap.inspection.tags.find(t=>t.id===Number(report.preview['data-model-tag']));
  const modelRef=pistol.references.find(r=>r.label==='Model');expect(modelRef).toBeTruthy();
  const modelTag=nativeMap.inspection.tags.find(t=>t.id===modelRef.targetId);expect(modelTag?.class).toBe('mod2');
  const bytes=await fs.readFile(map),geometryCount=modelTag.dataOffset+208;
  expect(bytes.readUInt32LE(geometryCount)).toBeGreaterThan(0);expect(bytes.readUInt32LE(geometryCount)).toBeLessThanOrEqual(256);
  bytes.writeUInt32LE(0,geometryCount);const malformed=path.join(root,'qa-incomplete-model.map');await fs.writeFile(malformed,bytes,{flag:'wx'});
  const [bad]=await call(main,'import_paths',{paths:[malformed]});
  // Setup used native IPC rather than the file-dialog controller. Deliver its
  // normal native library invalidation, preserving the still-open documents.
  await call(main,'plugin:event|emit',{event:'spark:library-changed',payload:null});
  await chooseTool(main,'Map library');await main.locator(`.map-card[data-project-id="${bad.project.id}"]`).click();await role(main,'tags');
  await main.getByLabel('Filter tag class',{exact:true}).selectOption('weap');await main.getByLabel('Search tags',{exact:true}).fill(pistol.path);await main.locator('.tag-list .tag-row').first().click();
  const broken=main.locator('.native-model-preview').first();await expect(broken).toHaveAttribute('data-model-source-hash',bad.project.source.sha256);await expect(broken.getByRole('button',{name:'Retry preview',exact:true})).toBeVisible();await expect(broken).toContainText('Model contains no geometry');expect(await broken.getAttribute('data-model-loading-phase')).toBeNull();expect(await broken.locator('.gs-shield-loading').count()).toBe(0);
  const retryReads=await main.evaluate(()=>performance.getEntriesByName('spark.ipc.preview_owned_object_model').length);
  await broken.getByRole('button',{name:'Retry preview',exact:true}).click();await expect.poll(()=>main.evaluate(()=>performance.getEntriesByName('spark.ipc.preview_owned_object_model').length)).toBeGreaterThan(retryReads);await expect(broken.getByRole('button',{name:'Retry preview',exact:true})).toBeVisible();await expect(broken).toHaveAttribute('data-model-first-frame','false');
  await chooseTool(main,'Map library');await main.locator(`.map-card[data-project-id="${nativeMap.project.id}"]`).click();await role(main,'tags');await main.getByLabel('Search tags',{exact:true}).fill(pistol.path);await main.locator('.tag-list .tag-row').first().click();
  const repaired=main.locator('.native-model-preview').first();await expect(repaired).toHaveAttribute('data-model-source-hash',report.sourceMapSha256);await expect(repaired).toHaveAttribute('data-model-first-frame','true',{timeout:120000});
  report.nativeFailure={writer:'Deliberate QA fixture',byteOffset:geometryCount,mutatedBytes:4,sourceHash:bad.project.source.sha256,retryRefusesIncompleteSource:true,returnToGoodSource:true};
  mark('Genuine incomplete native model stops shield loading, Retry refuses unchanged corruption, and returning to the valid source restores its actual preview',report.nativeFailure);
  await main.screenshot({path:path.join(root,'spark-flow.png')});
  // Bounded live WebView metrics; these are not VRAM-byte estimates.
  report.webviewMetrics=(await cdp.send('Performance.getMetrics')).metrics.filter(m=>['JSHeapUsedSize','JSHeapTotalSize','Nodes','Documents','TaskDuration'].includes(m.name));
  report.actualNativeWindows=(await call(main,'workspace_window_inventory')).length;report.physicalMonitorDisconnectVerified=false;report.actualGamePlayed=false;
  expect(await sha(map)).toBe(report.sourceMapSha256);expect(report.errors).toEqual([]);report.complete=true;
}catch(e){report.errors.push(String(e));report.stack=e.stack;process.exitCode=1;if(browser)for(const [i,page]of pages().entries()){await page.screenshot({path:path.join(root,`failure-${i}.png`)}).catch(()=>{});await fs.writeFile(path.join(root,`failure-${i}.html`),await page.content()).catch(()=>{});}}
finally{if(temporarilyMissing){await fs.rename(temporarilyMissing.backup,temporarilyMissing.path);report.ownedSourceRestoredAfterFailure=true;}await fs.writeFile(path.join(root,'acceptance.json'),JSON.stringify(report,null,2));await browser?.close().catch(()=>{});if(processHandle?.exitCode===null)processHandle.kill();console.log(JSON.stringify({complete:report.complete,cases:report.cases.length,errors:report.errors,timing:report.timing}));}
