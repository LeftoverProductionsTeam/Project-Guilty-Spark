import { assertQaOutputPath,sealQaScratch,disposeQaScratch } from './native-qa-storage.mjs';
import {openStudioMenu,chooseTool,openDrawer,revealPagedControl} from '../tests/ui/helpers/navigation.ts';
import {auditPagedSurface} from '../tests/ui/helpers/compactSurfaces.ts';
import {configureNativeCeTarget} from './native-live-rebuild.mjs';
import {nativeDedicatedServer} from './native-dedicated-server.mjs';
import {prepareSharedNativeContent,exerciseSharedNativeContent,readbackSharedNativeContent,retireNativeSeeds,verifyRetainedNativePreviews} from './native-shared-content.mjs';
const sharedNativeContent=process.env.SPARK_QA_SHARED_NATIVE_CONTENT==='1';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const runNative=promisify(execFile);
const chupathingyTrial=process.env.SPARK_QA_SHARED_CHUPATHINGY==='1';
const dedicatedFaults=process.env.SPARK_QA_DEDICATED_FAULTS==='1';
if(dedicatedFaults&&(!chupathingyTrial||process.env.SPARK_QA_SHARED_CHUPATHINGY_REBUILD!=='1'))throw Error('Dedicated crash acceptance requires the explicit private Chupathingy Live Rebuild workflow');
const ceSource=process.env.SPARK_TEST_CE_SOURCE_MAP;
if(chupathingyTrial&&(!ceSource||!process.env.SPARK_TEST_CHUPATHINGY_ROOT))throw Error('Select the owned native CE source map and Chupathingy package');
const targetRuntime=chupathingyTrial?'chupathingyCe':'mccSteam';
const cacheVersion=chupathingyTrial?609:13;
const nativeSourceMap=chupathingyTrial?ceSource:process.env.SPARK_TEST_MCC_SOURCE_MAP;
if(sharedNativeContent&&!nativeSourceMap)throw Error('Select the owned source map for the actual native target edition');
// Opt-in acceptance: three real desktop processes with isolated libraries.
// Private LAN and a real Radmin adapter on ONE PC do not prove cross-PC delivery.
import { chromium, expect as assertion } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';
import {beginQaStorage,waitForQaExit} from './native-qa-storage.mjs';
const expect = assertion.configure({ timeout: 45000 }),
  args = process.argv.slice(2);
if (args.length !== 5)
  throw Error(
    'test-sparklink-workshop-native <Spark exe> <fresh evidence root> <H1A kit> <source tags> <Invader>',
  );
const [app, root, kit, tags, invader] = args.map((p) => path.resolve(p));
await fs.mkdir(await assertQaOutputPath(root), { recursive: false });
await fs.copyFile(new URL(import.meta.url), path.join(root, 'harness.mjs'), fs.constants.COPYFILE_EXCL);
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex'),
  fileHash = async (p) => hash(await fs.readFile(p));
const clone = (x) => structuredClone(x),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  actors = [],
  errors = [];
const receipt = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  appSha256: await fileHash(app),
  harnessSha256: await fileHash(new URL(import.meta.url)),
  physicalMachines: 1,
  nativeProcesses: 3,
  separateLibraries: 3,
  mockedIpc: false,
  gameLaunched: false,
  gameplayReplicationTested: false,
  crossComputerTested: false,
  steamRelayTested: false,
  complete: false,
  acceptanceScope: {cacheVersion,nativeContent:sharedNativeContent,chupathingyGame:chupathingyTrial,liveRebuild:chupathingyTrial&&process.env.SPARK_QA_SHARED_CHUPATHINGY_REBUILD==='1',dedicatedCrashRollback:dedicatedFaults},
  stages: {},
  latencies: [],
  memory: [],
};
const finishStorage=await beginQaStorage(root,{workflow:'sparklink-workshop',appSha256:receipt.appSha256});
async function mark(key, value = true) {
  receipt.stages[key] = value;
  await fs.writeFile(path.join(root, 'progress.json'), JSON.stringify(receipt, null, 2));
  console.log(key, typeof value === 'object' ? JSON.stringify(value) : value);
}
// Bounded diagnostics for this owned disposable tree only; never read file
// contents or traverse a linked directory. Retain the cause before cleanup.
async function qaFootprint(label){
  let files=0,bytes=0;const groups=new Map(),largest=[];let partial=false;
  async function walk(directory,relative=''){
    let entries;try{entries=await fs.readdir(directory,{withFileTypes:true});}catch(error){if(error.code==='ENOENT'){partial=true;return;}throw error;}
    for(const entry of entries){
      if(++files>25000)throw Error('QA footprint exceeds its diagnostic entry bound');
      const next=path.join(relative,entry.name),file=path.join(directory,entry.name);
      if(entry.isSymbolicLink())throw Error('Linked QA diagnostic entry refused');
      if(entry.isDirectory())await walk(file,next);
      else if(entry.isFile()){
        let info;try{info=await fs.lstat(file);}catch(error){if(error.code==='ENOENT'){partial=true;continue;}throw error;}
        if(info.isSymbolicLink()||!info.isFile())throw Error('QA diagnostic file changed type');
        bytes+=info.size;const group=next.split(path.sep).slice(0,4).join('/');groups.set(group,(groups.get(group)??0)+info.size);
        if(info.size>=32*1024**2){largest.push({file:next.replaceAll(path.sep,'/'),bytes:info.size});largest.sort((a,b)=>b.bytes-a.bytes);if(largest.length>32)largest.pop();}
      }
    }
  }
  await walk(root);const sample={label,logicalBytes:bytes,entries:files,partial,groups:[...groups].sort((a,b)=>b[1]-a[1]).slice(0,24),largest};
  receipt.qaFootprints??=[];if(receipt.qaFootprints.length>=20)receipt.qaFootprints.shift();receipt.qaFootprints.push(sample);
  console.log('QA_FOOTPRINT',JSON.stringify(sample));return sample;
}
async function freePort() {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
async function start(a, restart = false) {
  // Independent processes/libraries can read one immutable, hash-pinned app.
  // Do not retain three identical 50 MiB binaries merely to isolate settings.
  expect(await fileHash(a.exe)).toBe(receipt.appSha256);
  const port = await freePort();
  a.child = spawn(a.exe, [], {
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      GUILTY_SPARK_DATA_DIR: a.data,
      WEBVIEW2_USER_DATA_FOLDER: path.join(a.dir, 'webview'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
  });
  await finishStorage.trackProcess(a.child);
  await fs.writeFile(
    path.join(a.dir, restart ? 'restarted-process.json' : 'process.json'),
    JSON.stringify({ pid: a.child.pid, port, executable: a.exe, appSha256: receipt.appSha256 }),
  );
  await expect
    .poll(() =>
      fetch(`http://127.0.0.1:${port}/json/version`).then(
        (r) => r.ok,
        () => false,
      ),
    )
    .toBe(true);
  a.browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await expect
    .poll(() =>
      a.browser
        .contexts()
        .flatMap((c) => c.pages())
        .some((p) => p.url().includes('tauri.localhost')),
    )
    .toBe(true);
  a.page = a.browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url().includes('tauri.localhost'));
  a.page.on('pageerror', (e) => errors.push({ actor: a.slug, error: String(e) }));
  await a.page.addInitScript(()=>{
    window.__sparkQaSourceEvents=[];
    for(const kind of ['input','change','pointerdown','pointerup'])document.addEventListener(kind,event=>{
      const target=event.target;if(!(target instanceof HTMLElement))return;
      if((kind==='input'||kind==='change')&&!target.closest('.bsp-workshop'))return;
      const node=target.closest('input,select,button,canvas,svg');if(!node)return;
      const row={kind,label:(node.getAttribute('aria-label')||node.closest('label')?.textContent||node.textContent||node.tagName).trim().slice(0,100),value:node instanceof HTMLInputElement||node instanceof HTMLSelectElement?node.value:null,x:event.clientX,y:event.clientY,time:performance.now()};
      window.__sparkQaSourceEvents.push(row);if(window.__sparkQaSourceEvents.length>96)window.__sparkQaSourceEvents.shift();
    },true);
  });
  a.call = (command, params = {}) =>
    a.page.evaluate(({ command, params }) => window.__TAURI_INTERNALS__.invoke(command, params), {
      command,
      params,
    });
  const boot = await a.call('bootstrap');
  await a.call('save_settings', {
    settings: {
      ...boot.settings,
      onboardingCompleted: true,
      autoBuild: false,
      preferredHalo: targetRuntime,
      hekDirectory: kit,
      hekTagsDirectory: chupathingyTrial ? null : tags,
      hekFlavor: 'h1aEk',
      invaderDirectory: invader,
    },
  });
  // Registration only performs read-only inspection and stores the profile in this actor's disposable library.
  if(chupathingyTrial){const runtime=path.resolve(process.env.SPARK_TEST_CHUPATHINGY_ROOT);await a.call('register_runtime',{registration:{id:'shared-native-chupathingy',runtimeId:'chupathingyCe',root:runtime,executable:path.join(runtime,'chupathingy.exe'),dataRoot:runtime,version:'v0.9.0c'}});}
  if (!restart) {
    const created = await a.call('create_quickforge_project', {
      title: `C48 Workshop ${a.slug}`,
      template: 'customBlank',
      target: targetRuntime,
    });
    a.id = created.project.id;
    a.title = created.project.title;
  }
  await a.page.reload();
  await a.page
    .locator('.map-card')
    .filter({ has: a.page.getByRole('heading', { name: a.title, exact: true }) })
    .click();
  await a.call('claim_project_document', { id: a.id });
  const scripts = await a.page.locator('script[src]').evaluateAll((nodes) => nodes.map((n) => n.src));
  const debuggerSession = await a.page.context().newCDPSession(a.page),
    parsed = [];
  debuggerSession.on('Debugger.scriptParsed', (event) => parsed.push(event));
  await debuggerSession.send('Debugger.enable');
  const served = [];
  for (const url of scripts) {
    const script = parsed.find((script) => script.url === url);
    if (!script) throw Error('Native debugger did not return the loaded app source');
    const { scriptSource: code } = await debuggerSession.send('Debugger.getScriptSource', {
      scriptId: script.scriptId,
    });
    const file = path.join(process.env.SPARK_FRONTEND_DIST??'dist', new URL(url).pathname.replace(/^\//, ''));
    served.push({ file, sha256: hash(code), localSha256: await fileHash(file) });
    expect(hash(code)).toBe(await fileHash(file));
  }
  await debuggerSession.detach();
  await fs.writeFile(path.join(a.dir, 'served-source.json'), JSON.stringify(served, null, 2));
  if (restart) {
    await expect(a.page.getByLabel('Native BSP Workshop')).toBeVisible();
  }
  console.log('started', a.slug, a.child.pid);
}
async function actor(slug) {
  const dir = path.join(root, slug),
    data = path.join(dir, 'library');
  await finishStorage.createScratch(slug);
  await fs.mkdir(data, { recursive: true });
  const a = { slug, dir, data, exe: app };
  actors.push(a);
  receipt.sharedExecutable = { path: app, sha256: receipt.appSha256, independentLibraries: true, redundantCopiesAvoided: actors.length, avoidedLogicalBytes: actors.length * (await fs.stat(app)).size };
  await start(a);
  return a;
}
async function panel(a) {
  if (!(await a.page.getByRole('button', { name: 'Close SparkLink', exact: true }).isVisible())) {
    await openStudioMenu(a.page);await a.page.getByRole('button', { name: /Live Studio ·/ }).click();
  }
  a.panel = a.page.locator('.studio-panel');
  await expect(a.panel).toBeVisible();
  if (!(await a.panel.evaluate((el) => el.open))) await a.panel.locator(':scope > summary').click();
}
async function status(a) {
  return a.call('forge_session_status', { projectId: a.id });
}
async function view(a) {
  return a.call('forge_session_poll', { projectId: a.id, sessionId: a.session });
}
async function host(a, address) {
  await panel(a);
  await a.panel.getByRole('textbox', { name: 'Studio display name', exact: true }).fill(a.slug);
  await expect
    .poll(async () =>
      a.panel
        .getByRole('combobox', { name: 'Session network', exact: true })
        .locator('option')
        .allTextContents(),
    )
    .toContainEqual(expect.stringContaining(address));
  await a.panel.getByRole('combobox', { name: 'Session network', exact: true }).selectOption(address);
  await a.panel.getByRole('button', { name: 'Host editing session', exact: true }).click();
  await openStudioMenu(a.page);await expect(a.page.getByRole('button', { name: 'Live Studio · Hosting', exact: true })).toBeVisible();
  const info = await status(a);
  a.session = info.sessionId;
  a.author = 'host';
  a.directory = info.directoryId;
  expect(info.view.encrypted && info.view.durable).toBe(true);
  await a.page.getByRole('button', { name: 'Close SparkLink', exact: true }).click();
  return info;
}
async function invitation(a, address) {
  return a.call('forge_session_invite', { projectId: a.id, sessionId: a.session, address, viewer: false });
}
async function join(a, text) {
  await panel(a);
  await a.panel.getByRole('textbox', { name: 'Studio display name', exact: true }).fill(a.slug);
  await a.panel.getByRole('textbox', { name: 'Private Spark invite', exact: true }).fill(text);
  await a.panel.getByRole('button', { name: 'Join private invite', exact: true }).click();
  await openStudioMenu(a.page);await expect(a.page.getByRole('button', { name: 'Live Studio · Connected', exact: true })).toBeVisible();
  const info = await status(a);
  expect(info.view.encrypted && info.view.durable).toBe(true);
  a.session = info.sessionId;
  a.author = info.view.authorId;
  await a.page.getByRole('button', { name: 'Close SparkLink', exact: true }).click();
  if (!(await a.page.getByLabel('Native BSP Workshop').isVisible()))
    await a.page.getByRole('button', { name: 'BSP Workshop', exact: true }).click();
}
async function leave(a) {
  await a.call('forge_session_leave', { projectId: a.id, sessionId: a.session });
  // Reload the actual app to retire its session refs without mutating its document.
  await a.page.reload();
  await a.page
    .locator('.map-card')
    .filter({ has: a.page.getByRole('heading', { name: a.title, exact: true }) })
    .click();
  await a.call('claim_project_document', { id: a.id });
}
async function update(a, base, change, id = crypto.randomUUID()) {
  const document = clone(base.document);
  change(document);
  const next = await a.call('forge_session_update', {
    projectId: a.id,
    sessionId: a.session,
    revision: base.revision,
    document,
    operationId: id,
  });
  expect(next.acknowledgedOperationId).toBe(id);
  return { next, document, operationId: id, revision: base.revision };
}
// Resolve only this participant's exact local source identity. The shared
// document and durable proposal retain null private library references.
async function localProjection(a,expected){
  const document=clone(expected);
  if(document.placements.some(placement=>placement.sourceSha256)){
    const entries=(await a.call('bootstrap')).entries;
    for(const placement of document.placements)if(placement.sourceSha256){
      const entry=entries.find(entry=>entry.sha256===placement.sourceSha256);
      expect(entry,{message:`${a.slug} must have the exact source for its local preview`}).toBeTruthy();
      placement.sourceProjectId=entry.id;
    }
  }
  return document;
}
async function validateForActor(a,document){return a.call('quickforge_validate',{document:await localProjection(a,document)});}
async function converge(expected) {
  try {
  await expect
    .poll(
      async () => {
        const all = await Promise.all(actors.map(view));
        return all.every(
          (v) =>
            v.revision === expected.revision &&
            JSON.stringify(v.document) === JSON.stringify(expected.document),
        );
      },
      { intervals: [600] },
    )
    .toBe(true);
  // A network document deliberately carries hashes rather than another
  // participant's private library IDs. Validate each actual local projection,
  // as the existing UI does, before comparing its React/native CSG report.
  await Promise.all(
    actors.map(async (a) => {
      const report=await validateForActor(a,expected.document);
      await expect(a.page.getByLabel('Native BSP Workshop')).toHaveAttribute(
        'data-source-sha',
        report.sourceSha256,
      );
      for (const b of expected.document.workshop.brushes)
        await expect(
          a.page
            .locator('.bsp-source-list')
            .getByRole('button', { name: `${b.role === 'space' ? '◇' : '◆'} ${b.name}`, exact: true }),
        ).toHaveCount(1);
    }),
  );
  }catch(problem){
    receipt.failedConvergence={expected,actors:await Promise.all(actors.map(async actor=>({slug:actor.slug,backend:await view(actor).catch(error=>({error:String(error)})),savedProject:await actor.call('open_project',{id:actor.id}).then(value=>({document:value.project.quickForge,modifiedAt:value.project.modifiedAt})).catch(error=>({error:String(error)})),ui:await actor.page.evaluate(()=>({hash:document.querySelector('[aria-label="Native BSP Workshop"]')?.getAttribute('data-source-sha'),sourceFields:[...document.querySelectorAll('.bsp-source-fields input')].map(node=>({label:node.getAttribute('aria-label')||node.closest('label')?.textContent,value:node.value})),names:[...document.querySelectorAll('.bsp-source-list button')].map(node=>node.textContent),events:window.__sparkQaSourceEvents,studioSummary:document.querySelector('.studio-panel>summary')?.textContent,alerts:[...document.querySelectorAll('.studio-panel [role=alert]')].map(node=>node.textContent?.slice(0,2000))})).catch(error=>({error:String(error)}))})))};
    await mark('nativeSourceConvergenceFailed',true);throw problem;
  }
}
// Only completed generated tag staging inside this test's declared scratch.
// Keep frozen project source, receipts/logs, current input tags and every map.
async function retireQaTagIntermediates(a,build){
  expect(build.status).toBe('validated');expect(build.id).toMatch(/^[0-9a-f-]{36}$/);
  const job=path.join(a.data,'jobs',build.id),target=path.join(job,'workspace','tags');
  expect(path.relative(root,target).startsWith('..')).toBe(false);
  const real=await fs.realpath(target),inside=(parent,child)=>{const r=path.relative(parent.toLowerCase(),child.toLowerCase());return r===''||(!path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep));};
  const project=(await a.call('open_project',{id:a.id})).project;
  for(const profile of project.buildTargets??[])if(profile.tagsDirectory){const source=await fs.realpath(profile.tagsDirectory);expect(inside(source,real)||inside(real,source)).toBe(false);}
  const output=await fileHash(build.output),snapshot=await fileHash(path.join(job,'workspace','project.gsproject'));
  expect(output).toBe(build.sha256);
  const seal=await sealQaScratch(root,target),removed=await disposeQaScratch(root,seal,{ownerFinished:true});
  expect(await fs.stat(target).catch(()=>null)).toBeNull();expect(await fileHash(build.output)).toBe(output);expect(await fileHash(path.join(job,'workspace','project.gsproject'))).toBe(snapshot);
  let preparedInput;
  if(sharedNativeContent&&(await fs.readFile(path.join(job,'workspace/project.gsproject'),'utf8').then(JSON.parse)).quickForge.native){
   const staging=JSON.parse(await fs.readFile(path.join(job,'staging-plan.json'),'utf8'));
   const source=await fs.realpath(staging.source),parts=path.relative(path.join(a.data,'studio-native'),source).split(path.sep);
   expect(parts).toHaveLength(3);expect(parts[0]).toMatch(/^[0-9a-f-]{36}$/);expect(parts[1]).toMatch(/^build-[0-9a-f-]{36}$/);expect(parts[2]).toBe('tags');
   const preparation=JSON.parse(await fs.readFile(path.join(path.dirname(source),'prepared.json'),'utf8'));
   const inputs=JSON.parse(await fs.readFile(path.join(job,'input-tags.json'),'utf8'));expect(preparation[2]).toEqual(inputs);
   expect(source).not.toBe(await fs.realpath(a.nativeAdmission.tags));
   const inputSeal=await sealQaScratch(root,source);preparedInput=await disposeQaScratch(root,inputSeal,{ownerFinished:true});
   expect(await fileHash(build.output)).toBe(output);expect(await fileHash(path.join(job,'workspace','project.gsproject'))).toBe(snapshot);
  }
  (receipt.retiredQaTagIntermediates??=[]).push({buildId:build.id,bytes:removed.bytes,files:removed.files,preparedInput,outputSha256:output,projectSnapshotSha256:snapshot,inputsAndMapsPreserved:true,qaOnly:true});
  await mark('completedQaIntermediatesRetired',receipt.retiredQaTagIntermediates);
}
// The frozen QA output has completed its independent readback and preservation
// comparison before retirement. Keep the frozen project/source receipt and the
// actual current/previous-good game maps; this never evicts a user build.
async function retireFrozenQaMap(a,frozen,current){
  expect(frozen.id).not.toBe(current.id);expect(frozen.status).toBe('validated');expect(current.status).toBe('validated');
  expect(await fileHash(frozen.output)).toBe(receipt.frozenCeReadback.sha256);
  const currentSha=await fileHash(current.output),snapshot=path.join(a.data,'jobs',frozen.id,'workspace','project.gsproject'),sourceSha=await fileHash(snapshot);
  const seal=await sealQaScratch(root,frozen.output),removed=await disposeQaScratch(root,seal,{ownerFinished:true});
  expect(await fileHash(current.output)).toBe(currentSha);expect(await fileHash(snapshot)).toBe(sourceSha);
  receipt.retiredFrozenQaOutput={buildId:frozen.id,sha256:receipt.frozenCeReadback.sha256,logicalBytes:removed.bytes,sourceSnapshotSha256:sourceSha,retiredOnlyAfterNativeReadbackAndConcurrentBuildCheck:true,currentGameOutputPreserved:true,qaOnly:true};
  await mark('finishedFrozenQaOutputRetired',receipt.retiredFrozenQaOutput);
}
// A rejected script run is finished before this is called. Retire only its
// regenerable QA tag copies; retain the script/project, diagnostics, admission,
// recovery inputs and both independently checked playable stage maps.
async function retireRejectedQaNativeInputs(a,jobId){
  expect(jobId).toMatch(/^[0-9a-f-]{36}$/);
  const session=await a.call('community_server_status');expect(session.pendingJobId).toBeNull();
  const boot=await a.call('bootstrap');expect(boot.logs.some(row=>row.projectId===a.id&&row.jobId===jobId&&row.phase==='logic-script'&&row.message.includes('gs_qa_missing_function'))).toBe(true);
  const job=path.join(a.data,'jobs',jobId),snapshot=path.join(job,'workspace/project.gsproject'),snapshotHash=await fileHash(snapshot);
  const originalMap=path.join(receipt.nativeDedicated.start.sessionDirectory,'data/maps_ce',receipt.nativeDedicated.start.map.replace(/@ce$/,'')+'.map');
  expect(await fileHash(originalMap)).toBe(receipt.nativeDedicated.start.mapSha256);
  const project=(await a.call('open_project',{id:a.id})).project,active=project.builds.find(build=>build.id===session.compiledBuildId);
  expect(active?.status).toBe('validated');expect(await fileHash(active.output)).toBe(session.compiledSha256);
  const staging=JSON.parse(await fs.readFile(path.join(job,'staging-plan.json'),'utf8'));
  const source=await fs.realpath(staging.source),parts=path.relative(path.join(a.data,'studio-native'),source).split(path.sep);
  expect(parts).toHaveLength(3);expect(parts[0]).toMatch(/^[0-9a-f-]{36}$/);expect(parts[1]).toMatch(/^build-[0-9a-f-]{36}$/);expect(parts[2]).toBe('tags');
  const preparation=JSON.parse(await fs.readFile(path.join(path.dirname(source),'prepared.json'),'utf8'));
  expect(preparation[2]).toEqual(JSON.parse(await fs.readFile(path.join(job,'input-tags.json'),'utf8')));
  expect(source).not.toBe(await fs.realpath(a.nativeAdmission.tags));
  const removed=[];
  for(const target of [path.join(job,'workspace/tags'),source]){
    for(const profile of project.buildTargets??[])if(profile.tagsDirectory){const relative=path.relative(await fs.realpath(profile.tagsDirectory),await fs.realpath(target));expect(relative===''||(!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep))).toBe(false);}
    removed.push(await disposeQaScratch(root,await sealQaScratch(root,target),{ownerFinished:true}));
  }
  expect(await fileHash(snapshot)).toBe(snapshotHash);expect(await fileHash(active.output)).toBe(session.compiledSha256);expect(await fileHash(originalMap)).toBe(receipt.nativeDedicated.start.mapSha256);
  await mark('rejectedQaNativeInputsRetired',{jobId,removed,sourceSnapshotSha256:snapshotHash,diagnosticsAndBothPlayableMapsPreserved:true,qaOnly:true});
}
async function uiBuild(a){
  const seen=new Set((await a.call('bootstrap')).logs.map(row=>row.jobId).filter(Boolean));
  const button=a.page.getByRole('button',{name:'Build & check playtest',exact:true,includeHidden:true});
  await revealPagedControl(button);await expect(button).toBeEnabled();const began=performance.now();await button.click();
  let job;
  // Native admitted content is first materialized into a checked private
  // source fork. This precedes the compiler job; keep its own bounded wait
  // and measured duration, without relaxing compiler/readback acceptance.
  await expect.poll(async()=>{job=(await a.call('bootstrap')).logs.find(row=>row.projectId===a.id&&row.jobId&&!seen.has(row.jobId))?.jobId;return job;},{timeout:sharedNativeContent?120000:15000}).toBeTruthy();
  if(sharedNativeContent)await mark('nativeContentBuildPreparation',{actor:a.slug,jobId:job,milliseconds:performance.now()-began});
  return job;
}
async function uiMoveStarts(a,delta){
  await chooseTool(a.page,'Level editor');
  if(await a.page.getByLabel('Native BSP Workshop').isVisible())await a.page.getByRole('button',{name:'Objects & gameplay',exact:true}).click();
  for(let i=0;i<4;i++){
    const before=(await view(a)).document.spawns[i].position[0];
    await openDrawer(a.page,'Build tools');await a.page.locator('.forge-tree-select').filter({hasText:new RegExp('^Player '+(i+1)+'$')}).click();
    await openDrawer(a.page,'Inspector');await a.page.getByRole('button',{name:'Properties',exact:true}).click();
    const x=a.page.getByRole('spinbutton',{name:'Position X',exact:true});await x.fill(String(before+delta));await x.evaluate(node=>node.blur());
    await expect.poll(async()=>(await view(a)).document.spawns[i].position[0]).toBeCloseTo(before+delta,5);
  }
  const close=a.page.getByRole('button',{name:'Close Inspector',exact:true});if(await close.isVisible())await close.click();
  await a.page.getByRole('button',{name:'BSP Workshop',exact:true}).click();
  return view(a);
}
async function save(a, expected) {
  const local=await localProjection(a,expected);
  await a.page.keyboard.press('Control+s');
  await expect
    .poll(async () => JSON.stringify((await a.call('open_project', { id: a.id })).project.quickForge))
    .toBe(JSON.stringify(local));
  await expect.poll(async()=>(await a.call('read_workspace_history',{projectId:a.id})).history?.head.dirty).toBe(false);
}
async function select(a, index) {
  await a.page.locator('.bsp-source-list button').nth(index).click();
}
async function uiName(a, index, name) {
  const close = a.page.getByRole('button', { name: 'Close SparkLink', exact: true });
  if (await close.isVisible()) await close.click();
  await select(a, index);
  const input = a.page.locator('.bsp-source-fields').getByRole('textbox', { name: 'Volume name', exact: true });
  await input.fill(name);
  // Background native WebViews share one physical keyboard focus on this PC.
  // Trigger the real blur handler explicitly; no IPC/document mock is used.
  await input.evaluate((el) => el.blur());
  console.log(
    'ui-name',
    a.slug,
    name,
    await input.evaluate((el) => ({
      active: document.activeElement === el,
      value: el.value,
      focused: document.hasFocus(),
    })),
  );
  await expect(a.page.locator('.bsp-source-fields[aria-busy="false"]')).toBeVisible();
}
async function workshopControlAcceptance(a){
  const workshop=a.page.getByLabel('Native BSP Workshop',{exact:true});
  const focusState=async()=>Promise.all(actors.map(async actor=>({actor:actor.slug,native:await actor.call('plugin:window|is_focused',{label:'main'}),visible:await actor.call('plugin:window|is_visible',{label:'main'}),minimized:await actor.call('plugin:window|is_minimized',{label:'main'}),webview:await actor.page.evaluate(()=>({focused:document.hasFocus(),visibility:document.visibilityState,title:document.title,window:window.__TAURI_INTERNALS__.metadata.currentWindow.label,screen:{x:screenX,y:screenY},viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}}))})));
  await mark('nativeWorkshopFocusBefore',await focusState());
  // Put the isolated native test's keyboard owner through an actual window
  // restore. Other creators remain separate processes with their own documents.
  for(const actor of actors)await actor.call('plugin:window|minimize',{label:'main'});
  await a.call('plugin:window|unminimize',{label:'main'});
  await a.call('plugin:window|set_focus',{label:'main'});
  await mark('nativeWorkshopFocusRestored',await focusState());
  await mark('nativeWindowFocusRequest',{actor:'owner',reason:'Workshop input',authority:'nativeWindow',requestedAt:new Date().toISOString()});
  try{await expect.poll(()=>a.call('plugin:window|is_focused',{label:'main'}),{message:'Activate the exact private Workshop owner before native input'}).toBe(true);}
  catch(error){await mark('nativeWorkshopFocusFailure',await focusState());throw error;}
  await workshop.locator('.bsp-source-list').getByRole('button',{name:/Ramp/,exact:false}).click();
  await expect(workshop.getByRole('textbox',{name:'Volume name',exact:true})).toHaveValue('Ramp');
  await workshop.getByRole('button',{name:'Move',exact:true}).click();
  const position=workshop.getByRole('group',{name:'Position',exact:true});
  const source=async()=>(await a.call('open_project',{id:a.id})).project.quickForge;
  const ramp=async()=>(await source()).workshop.brushes.find(brush=>brush.id==='ramp');
  const original=clone(await ramp()),verified=[];
  for(const [view,axes]of [['top',['X','Y']],['front',['X','Z']],['side',['Y','Z']]]){
    const viewport=workshop.getByLabel(view+' orthographic editing view',{exact:true});
    for(const [at,axis]of axes.entries()){
      const handle=viewport.getByRole('button',{name:`${view} ${axis} movement axis`,exact:true}),index='XYZ'.indexOf(axis),before=clone(await ramp());
      await expect(handle).toBeVisible();const box=await handle.boundingBox();expect(box).toBeTruthy();
      const target=await handle.evaluate(node=>{const box=node.getBoundingClientRect(),hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);return {hit:!!hit&&(node===hit||node.contains(hit)),tag:hit?.tagName,label:hit?.getAttribute('aria-label'),nativeDocumentFocus:document.hasFocus()};});
      await mark('nativeWorkshopAxisInput',{view,axis,beforePosition:before.position,box,target,windowFocused:await a.call('plugin:window|is_focused',{label:'main'})});
      expect(target.hit,'The actual handle center must receive the native pointer').toBe(true);
      await a.page.mouse.move(box.x+box.width/2,box.y+box.height/2);await a.page.mouse.down();
      await a.page.mouse.move(box.x+box.width/2+(at===0?12:0),box.y+box.height/2-(at===0?0:12),{steps:8});await a.page.mouse.up();
      await expect.poll(async()=>(await ramp()).position[index]).toBeGreaterThan(before.position[index]);
      const moved=await ramp();for(let k=0;k<3;k++)if(k!==index)expect(moved.position[k]).toBe(before.position[k]);
      await handle.focus();await a.page.keyboard.press('Control+z');await expect.poll(ramp).toEqual(before);
      await handle.focus();await a.page.keyboard.press('ArrowRight');await expect.poll(async()=>(await ramp()).position[index]).toBeCloseTo(before.position[index]+.5,6);
      await handle.focus();await a.page.keyboard.press('Control+z');await expect.poll(ramp).toEqual(before);
      verified.push({view,axis,actualMouseDrag:true,keyboardNudge:true,unrelatedAxesUnchanged:true,singleActionUndo:true});
    }
  }
  const z=position.getByRole('spinbutton',{name:'Z',exact:true});await z.fill('3');await z.press('Tab');
  await expect.poll(async()=>(await ramp()).position[2]).toBe(3);
  const report=await a.call('quickforge_validate',{document:await source()});await expect(workshop).toHaveAttribute('data-source-sha',report.sourceSha256);
  await z.focus();await a.page.keyboard.press('End');expect((await ramp()).position[2]).toBe(3);
  await workshop.getByRole('button',{name:'Move',exact:true}).focus();await a.page.keyboard.press('End');
  await expect.poll(async()=>(await ramp()).position[2]).toBeCloseTo(.5,6);
  await a.page.keyboard.press('Control+s');await expect.poll(async()=>(await a.call('read_workspace_history',{projectId:a.id})).history?.head.dirty).toBe(false);
  await a.page.keyboard.press('Control+z');await expect.poll(async()=>(await ramp()).position[2]).toBe(3);
  await a.page.keyboard.press('Control+y');await expect.poll(async()=>(await ramp()).position[2]).toBeCloseTo(.5,6);
  await a.page.keyboard.press('Control+s');await expect.poll(async()=>(await a.call('read_workspace_history',{projectId:a.id})).history?.head.dirty).toBe(false);
  const snapped=await ramp();expect(Math.min(...snapped.vertices.map(vertex=>vertex[2]*snapped.scale[2]+snapped.position[2]))).toBeCloseTo(0,6);
  await a.page.screenshot({path:path.join(root,'native-workshop-axis-floor.png')});
  await mark('nativeWorkshopAxisAndFloor',{axes:verified,originalPosition:original.position,snappedPosition:snapped.position,minimumSourceZ:0,typedEndIgnored:true,immediateSave:true,undoRedo:true,sharedFloorSnapImplementation:true,nativeCompilePending:true});
}
async function continuousWorkspaceAcceptance(a){
  const source=async()=>(await a.call('open_project',{id:a.id})).project.quickForge;
  const before=hash(JSON.stringify(await source()));
  await a.call('plugin:window|set_size',{label:'main',value:{Logical:{width:800,height:600}}});
  await chooseTool(a.page,'Settings & tools');await a.page.getByRole('tab',{name:'Interface Studio',exact:true}).click();
  const surface=a.page.locator('[data-surface="settings-interface"]'),viewport=surface.locator(':scope > .gs-page-viewport');
  await expect(surface).toHaveAttribute('data-navigation','scroll');await expect(surface).toHaveAttribute('data-pages','1');
  const layout=await auditPagedSurface(surface);
  const top=await viewport.evaluate(node=>node.scrollTop),maximum=await viewport.evaluate(node=>node.scrollHeight-node.clientHeight);
  await a.page.screenshot({path:path.join(root,'native-workspace-scroll.png')});
  await chooseTool(a.page,'Level editor');await chooseTool(a.page,'Settings & tools');
  await a.page.getByRole('tab',{name:'Interface Studio',exact:true}).click();
  await expect.poll(()=>viewport.evaluate((node,expected)=>Math.abs(node.scrollTop-expected),top)).toBeLessThan(2);
  await chooseTool(a.page,'Level editor');await expect(a.page.getByLabel('Native BSP Workshop',{exact:true})).toBeVisible();
  expect(hash(JSON.stringify(await source()))).toBe(before);
  await a.call('plugin:window|set_size',{label:'main',value:{Logical:{width:1500,height:950}}});
  await mark('nativeWorkspaceScrolling',{logicalWindow:{width:800,height:600},navigation:'scroll',maximumScroll:maximum,retainedScroll:top,layout,sourceUnchanged:true,workspaceNavigationRestored:true,webviewRestartTested:false});
}
async function memory(label) {
  const samples = [];
  for (const a of actors) {
    const cdp = await a.page.context().newCDPSession(a.page);
    await cdp.send('Performance.enable');
    await cdp.send('HeapProfiler.collectGarbage');
    const m = await cdp.send('Performance.getMetrics');
    samples.push({
      actor: a.slug,
      ...Object.fromEntries(
        m.metrics
          .filter((v) =>
            [
              'JSHeapUsedSize',
              'JSHeapTotalSize',
              'Nodes',
              'Documents',
              'TaskDuration',
              'LayoutDuration',
            ].includes(v.name),
          )
          .map((v) => [v.name, v.value]),
      ),
    });
    await cdp.detach();
  }
  receipt.memory.push({ label, elapsedMs: performance.now() - receipt.begin, samples });
}
async function crash(a) {
  const gone = new Promise((r) => a.child.once('exit', r));
  a.child.kill();
  await gone;
  await a.browser.close().catch(() => {});
  a.browser = null;
  a.child = null;
}
try {
  receipt.begin = performance.now();
  const a = await actor('owner'),
    b = await actor('editor-b'),
    c = await actor('editor-c');
  expect(new Set(actors.map((x) => x.child.pid)).size).toBe(3);
  expect(new Set(actors.map((x) => x.data)).size).toBe(3);
  await a.page.getByRole('button', { name: 'BSP Workshop', exact: true }).click();
  await a.page.getByRole('button', { name: 'Two rooms + corridor + ramp', exact: true }).click();
  await expect(a.page.locator('.bsp-workshop footer')).toContainText('4 editable volumes');
  const details = a.page
    .locator('.bsp-source-fields details')
    .filter({ has: a.page.locator('summary', { hasText: 'Halo material paths & player starts' }) });
  await details.locator(':scope > summary').click();
  const shader = a.page.getByRole('textbox', { name: 'Shader path surface', exact: true });
  let nativeSource,nativeRecovery;
  if(chupathingyTrial){
    const originals=await Promise.all([ceSource,...['bitmaps.map','sounds.map','loc.map'].map(name=>path.join(path.dirname(ceSource),name))].map(async file=>({file,sha256:await fileHash(file)})));
    [nativeSource]=await a.call('import_paths',{paths:[ceSource]});expect(nativeSource.inspection.header.version).toBe(609);
    const scenario=nativeSource.inspection.tags.find(tag=>tag.class==='scnr');expect(scenario).toBeTruthy();
    nativeRecovery=await a.call('extract_selected_tag_tree',{projectId:nativeSource.project.id,tagId:scenario.id});
    expect(nativeRecovery.sourceSha256).toBe(originals[0].sha256);receipt.ceSource={originals,sourceSha256:nativeRecovery.sourceSha256,version:nativeRecovery.sourceVersion};
  }
  if(sharedNativeContent&&!chupathingyTrial){
    const sha256=await fileHash(nativeSourceMap);[nativeSource]=await a.call('import_paths',{paths:[nativeSourceMap]});
    expect(nativeSource.inspection.header.version).toBe(cacheVersion);expect(nativeSource.inspection.sha256).toBe(sha256);
    receipt.mccSource={originals:[{file:nativeSourceMap,sha256}],sourceSha256:sha256,version:cacheVersion};
  }
  const metal=chupathingyTrial?(nativeSource.inspection.tags.find(tag=>tag.class==='senv'&&/metal.*plate.*floor/i.test(tag.path))??nativeSource.inspection.tags.find(tag=>tag.class==='senv'&&/metal.*flat/i.test(tag.path)))?.path:'levels/test/tutorial/shaders/example_tutorial_metal_floor';expect(metal).toBeTruthy();
  await shader.fill(metal);
  await shader.press('Tab');
  await expect(a.page.locator('.bsp-source-fields[aria-busy="false"]')).toBeVisible();
  // The deliberately minimal owned native tag set supplies the tutorial metal
  // shader. Explicitly author ALL surface definitions with it, including the
  // unused grass preview default; keep both material identities/dependencies.
  const grassShader = a.page.getByRole('textbox', { name: 'Shader path grass', exact: true });
  if (await grassShader.count()) {
    await grassShader.fill(metal);
    await grassShader.press('Tab');
    await expect(a.page.locator('.bsp-source-fields[aria-busy="false"]')).toBeVisible();
  }
  const sky = details.getByRole('textbox').last();
  const skyPath=chupathingyTrial?nativeSource.inspection.tags.find(tag=>tag.class.trimEnd()==='sky')?.path:'levels/test/bloodgulch/bloodgulch';expect(skyPath).toBeTruthy();
  await sky.fill(skyPath);
  await sky.press('Tab');
  await expect(a.page.locator('.bsp-source-fields[aria-busy="false"]')).toBeVisible();
  await details.locator(':scope > summary').click();
  const portals = a.page
    .locator('.bsp-source-fields details')
    .filter({ has: a.page.locator('summary', { hasText: 'Doorway portal' }) });
  await portals.locator('summary').click();
  await a.page.getByRole('button', { name: 'Add exact doorway portal', exact: true }).click();
  await expect(a.page.locator('.bsp-workshop footer')).toContainText('1 authored portals');
  const door = a.page.getByRole('spinbutton', { name: 'Doorway X', exact: true });
  await door.fill('20');
  await door.press('Tab');
  await a.page.getByRole('button', { name: 'Add exact doorway portal', exact: true }).click();
  await expect(a.page.locator('.bsp-workshop footer')).toContainText('2 authored portals');
  await portals.locator('summary').click();
  await a.page.keyboard.press('Control+s');
  if(chupathingyTrial){
    const configured=await configureNativeCeTarget({page:a.page,kit,invader,sourceRoot:nativeRecovery.tagRoot,current:async()=>(await a.call('open_project',{id:a.id})).project,save:async()=>{await a.page.keyboard.press('Control+s');await expect.poll(async()=>(await a.call('read_workspace_history',{projectId:a.id})).history?.head.dirty).toBe(false);},hash:fileHash,expect});receipt.ceSource.reviewedRecovery=configured.recovery;
  }
  await workshopControlAcceptance(a);
  await continuousWorkspaceAcceptance(a);
  for(const actor of actors.slice(1))await actor.call('plugin:window|unminimize',{label:'main'});
  let nativeAdmission;
  if(sharedNativeContent)nativeAdmission=await prepareSharedNativeContent({actors,source:nativeSource,sourcePath:nativeSourceMap,cacheVersion,templateTags:chupathingyTrial?receipt.ceSource.reviewedRecovery.tagsDirectory:tags,kit,invader,expect,hash:fileHash,panel,uiBuild,save,retire:retireQaTagIntermediates,mark});
  const networks = await a.call('forge_session_networks');
  const lan = networks.find((n) => n.networkScope === 'private' && n.address !== '127.0.0.1'),
    vpn = networks.find((n) => n.networkScope === 'radminVpn');
  if (!lan || !vpn)
    throw Error("This acceptance requires this machine's active LAN and real Radmin adapters");
  receipt.networks = networks;
  await host(a, lan.address);
  const text = await invitation(a, lan.address);
  await join(b, text);
  await join(c, text);
  let current = await view(a);
  await converge(current);
  if(sharedNativeContent)current=await exerciseSharedNativeContent({actors,admission:nativeAdmission,expect,hash:fileHash,panel,view,converge,update,root,mark});
  await mark('threeIndependentWorkshopEditors', {
    tls: true,
    durable: true,
    network: 'actual private LAN interface',
    participants: current.participants.length,
  });
  // A real native-window focus transfer must cancel a held numeric scrub;
  // an inactive creator must not later publish that abandoned gesture.
  await select(c,0);await c.page.getByRole('button',{name:'Select',exact:true}).click();
  const positionX=c.page.locator('.bsp-source-fields').getByRole('spinbutton',{name:'X',exact:true}).first();
  await revealPagedControl(positionX);await c.call('plugin:window|set_focus',{label:'main'});
  await mark('nativeWindowFocusRequest',{actor:'editor-c',authority:'nativeWindow',requestedAt:new Date().toISOString()});
  await expect.poll(()=>c.call('plugin:window|is_focused',{label:'main'}),{message:'Activate the exact private editor-c native window'}).toBe(true);
  const initialPosition=Number(await positionX.inputValue()),scrubBounds=await positionX.boundingBox();expect(scrubBounds).toBeTruthy();
  // Observe real native input before changing production behavior. Retain a
  // bounded event trace on failure; it never drives or synthesizes input.
  await positionX.evaluate((input,bounds)=>{
    const events=[];
    const record=event=>{
      const target=event.target,rect=input.getBoundingClientRect();
      events.push({kind:event.type,time:performance.now(),trusted:event.isTrusted,target:target instanceof HTMLElement?(target.getAttribute('aria-label')||target.tagName):null,x:event.clientX,y:event.clientY,buttons:event.buttons,pointer:event.pointerId,captured:typeof event.pointerId==='number'&&input.hasPointerCapture(event.pointerId),value:input.value,focused:document.activeElement===input,documentFocused:document.hasFocus(),bounds:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}});
      if(events.length>64)events.shift();
    };
    const kinds=['pointerdown','pointermove','pointerup','pointercancel','gotpointercapture','lostpointercapture','dragstart','dragend','select','focusin','focusout','blur','focus'];
    for(const kind of kinds)window.addEventListener(kind,record,true);
    const hit=document.elementFromPoint(bounds.x+20,bounds.y+bounds.height/2);
    window.__sparkQaReadScrubTrace=()=>({events,value:input.value,connected:input.isConnected,disabled:input.disabled,focused:document.activeElement===input,documentFocused:document.hasFocus(),hitWasInput:hit===input,hitLabel:hit instanceof HTMLElement?(hit.getAttribute('aria-label')||hit.tagName):null,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},screen:{x:screenX,y:screenY}});
    window.__sparkQaEndScrubTrace=()=>{for(const kind of kinds)window.removeEventListener(kind,record,true);delete window.__sparkQaReadScrubTrace;delete window.__sparkQaEndScrubTrace;};
  },scrubBounds);
  const scrubTrace=async phase=>({phase,nativeFocused:await c.call('plugin:window|is_focused',{label:'main'}),...await c.page.evaluate(()=>window.__sparkQaReadScrubTrace())});
  try{
    await c.page.mouse.move(scrubBounds.x+20,scrubBounds.y+scrubBounds.height/2);await c.page.mouse.down();
    await c.page.mouse.move(scrubBounds.x+50,scrubBounds.y+scrubBounds.height/2,{steps:8});
    await expect.poll(async()=>Number(await positionX.inputValue())).not.toBe(initialPosition);
    await a.call('plugin:window|set_focus',{label:'main'});
    await mark('nativeWindowFocusRequest',{actor:'owner',authority:'nativeWindow',requestedAt:new Date().toISOString()});
    const focus=async()=>({owner:{native:await a.call('plugin:window|is_focused',{label:'main'}),webview:await a.page.evaluate(()=>document.hasFocus())},editor:{native:await c.call('plugin:window|is_focused',{label:'main'}),webview:await c.page.evaluate(()=>document.hasFocus())},displayed:await positionX.inputValue()});
    try{
      await expect.poll(async()=>{const state=await focus();return state.owner.native&&!state.editor.native;},{message:'Native window authority must leave the scrub owner; WebView focus is diagnostic only'}).toBe(true);
      await expect(positionX).toHaveValue(String(initialPosition));
    }catch(error){await mark('nativeScrubFocusFailure',await focus());throw error;}
    await mark('nativeScrubInputTrace',await scrubTrace('cancelled-by-native-window-transfer'));
  }catch(error){
    await mark('nativeScrubInputTrace',await scrubTrace('failed-before-acceptance'));throw error;
  }finally{await c.page.mouse.up();await c.page.evaluate(()=>window.__sparkQaEndScrubTrace?.());}
  await c.call('plugin:window|set_focus',{label:'main'});await c.page.getByRole('button',{name:'Select',exact:true}).click();
  await converge(current);expect((await view(a)).revision).toBe(current.revision);
  expect(await c.call('forge_studio_pending',{projectId:c.id})).toBeNull();
  await c.page.screenshot({path:path.join(root,'native-interrupted-number-field.png')});
  await mark('nativeInterruptedNumericScrub',{actualNativeWindowFocusTransfer:true,sourceRevisionUnchanged:current.revision,positionRestored:initialPosition,pendingOperationAbsent:true,noAbandonedScrubCommitted:true});
  // Each creator makes a simultaneous genuine GUI edit to a different brush.
  const began = performance.now();
  await Promise.all([
    uiName(a, 0, 'Room A by owner'),
    uiName(b, 1, 'Room B by B'),
    uiName(c, 3, 'Ramp by C'),
  ]);
  await expect
    .poll(
      async () => {
        const v = await view(a);
        return [
          v.document.workshop.brushes[0].name,
          v.document.workshop.brushes[1].name,
          v.document.workshop.brushes[3].name,
        ];
      },
      { intervals: [600] },
    )
    .toEqual(['Room A by owner', 'Room B by B', 'Ramp by C']);
  current = await view(a);
  await converge(current);
  receipt.latencies.push({ kind: 'simultaneous actual UI edits', ms: performance.now() - began });
  await mark('simultaneousUiBrushEdits');
  // Ctrl+Z reverses only B, and Ctrl+Y restores B; A/C and portals survive.
  await b.page.getByLabel('top orthographic editing view').click({ position: { x: 25, y: 25 } });
  await b.page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await view(a)).document.workshop.brushes[1].name, { intervals: [650] })
    .not.toBe('Room B by B');
  current = await view(a);
  expect(current.document.workshop.brushes[0].name).toBe('Room A by owner');
  expect(current.document.workshop.brushes[3].name).toBe('Ramp by C');
  await b.page.keyboard.press('Control+y');
  await expect
    .poll(async () => (await view(a)).document.workshop.brushes[1].name, { intervals: [650] })
    .toBe('Room B by B');
  current = await view(a);
  await converge(current);
  await mark('participantSpecificBspUndoRedo');
  // Real source recipes cross three independent native processes. This phase
  // checks collaboration, not radiosity or gameplay (accepted separately).
  const lightingBase=await view(a),recipe={skyPath:lightingBase.document.skyPath,quality:'draft',environment:{previewEnabled:true,skyColor:[0.05,0.1,0.13],ambientColor:[0.7,0.8,0.9],ambientIntensity:0.5,sunColor:[1,0.9,0.8],sunIntensity:2,sunAzimuth:-35,sunElevation:50,fogEnabled:false,fogColor:[0.3,0.4,0.5],fogNear:25,fogFar:180}};
  expect(recipe.skyPath).toBe(skyPath);
  current=(await update(a,lightingBase,d=>{d.nativeLighting=recipe;})).next;
  const acceptedLighting=clone(current.document.nativeLighting);
  await converge(current);
  current=(await update(b,current,d=>{d.workshop.brushes[1].name='Room B after lighting';})).next;
  const peerBrush=clone(current.document.workshop.brushes[1]);
  current=await a.call('forge_session_reverse',{projectId:a.id,sessionId:a.session,operationId:crypto.randomUUID(),redo:false});
  expect(current.document.nativeLighting).toBeUndefined();
  expect(current.document.workshop.brushes[1]).toEqual(peerBrush);await converge(current);
  current=await a.call('forge_session_reverse',{projectId:a.id,sessionId:a.session,operationId:crypto.randomUUID(),redo:true});
  expect(current.document.nativeLighting).toEqual(acceptedLighting);
  expect(current.document.workshop.brushes[1]).toEqual(peerBrush);await converge(current);
  const beforeCompeting=current;
  current=(await update(c,current,d=>{d.nativeLighting.environment.ambientIntensity=0.75;})).next;
  await expect(update(a,beforeCompeting,d=>{delete d.nativeLighting;})).rejects.toThrow(/nativeLighting|conflict/i);
  expect((await view(a)).document).toEqual(current.document);await converge(current);
  current=(await update(a,current,d=>{delete d.nativeLighting;})).next;
  expect(current.document.nativeLighting).toBeUndefined();await converge(current);
  await Promise.all(actors.map(x=>save(x,current.document)));
  for(const x of actors){
    await expect.poll(async()=>(await x.call('read_workspace_history',{projectId:x.id})).history?.head.dirty).toBe(false);
    const savedHistory=(await x.call('read_workspace_history',{projectId:x.id})).history;
    for(const snapshot of savedHistory.snapshots){const doc=snapshot.project.quickForge;if(doc?.nativeLighting)expect(doc.nativeLighting.skyPath).toBe(doc.skyPath);}
    expect((await x.page.locator('[role="alert"]').allTextContents()).join(' ')).not.toMatch(/History snapshot.*refused/i);
  }
  await mark('nativeLightingRecipeAuthorUndoAndConflict',{independentProcesses:3,optionalRemoval:true,peerBrushPreserved:true,competingRecipeRefused:true,validSavedUndoSnapshots:true,nativeBakeTestedInThisStage:false});

  // A real held orthographic mouse drag emits wire ghosts without journal commits.
  await panel(b); // Close SparkLink overlay again if it covered the view.
  await openStudioMenu(b.page);await b.page.getByRole('button', { name: /Live Studio ·/ }).click();
  await b.page.getByRole('button', { name: 'Move', exact: true }).click();
  const top = b.page.getByLabel('top orthographic editing view'),
    bounds = await top.boundingBox();
  // The corridor ceiling is exposed. The ramp is behind Room A's source
  // ceiling in top view and must not be selected through that nearer face.
  const target = top.locator('[data-brush="corridor"][data-face="face-1"]');
  const pt = await target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const beforePreview = await view(a);
  await b.page.mouse.move(pt.x, pt.y);
  await b.page.mouse.down();
  await b.page.mouse.move(pt.x + bounds.width / 144, pt.y, { steps: 8 });
  await expect(a.page.getByLabel('Native BSP Workshop')).toHaveAttribute('data-workshop-preview-count', '1');
  await expect(c.page.getByLabel('Native BSP Workshop')).toHaveAttribute('data-workshop-preview-count', '1');
  const preview = await view(a);
  expect(preview.revision).toBe(beforePreview.revision);
  expect(preview.acknowledgedOperations).toBe(beforePreview.acknowledgedOperations);
  expect(preview.workshopPreviews).toHaveLength(1);
  expect(preview.workshopPreviews[0].brush.brushId).toBe('corridor');
  await expect(a.page.locator('svg [data-workshop-preview="corridor"]')).toHaveCount(3);
  await a.page.screenshot({ path: path.join(root, 'peer-drag-preview.png') });
  await b.page.mouse.up();
  await expect(a.page.getByLabel('Native BSP Workshop')).toHaveAttribute('data-workshop-preview-count', '0');
  await expect(c.page.getByLabel('Native BSP Workshop')).toHaveAttribute('data-workshop-preview-count', '0');
  await expect
    .poll(
      async () => (await view(a)).document.workshop.brushes.find((brush) => brush.id === 'corridor').position[0],
      { intervals: [500] },
    )
    .toBe(beforePreview.document.workshop.brushes.find((brush) => brush.id === 'corridor').position[0] + 0.5);
  current = await view(a);
  expect(current.revision).toBe(beforePreview.revision + 1);
  await converge(current);
  // Restore the source with its actual author Undo before frozen compilation.
  await b.page.keyboard.press('Control+z');
  await expect.poll(async()=>(await view(a)).document.workshop.brushes.find(brush=>brush.id==='corridor').position[0]).toBe(beforePreview.document.workshop.brushes.find(brush=>brush.id==='corridor').position[0]);
  current=await view(a);await converge(current);
  await mark('actualMouseDragGhosts', {
    originalGeometryRestoredByAuthorUndo:true,
    perspectiveAndOrthographic: true,
    uncommittedRevisionUnchanged: true,
    clearedAfterGesture: true,
    actualGeometryCommittedAndRenderedByAllEditors: true,
  });
  // Concurrent shape/material conflicts are rejected; idempotent replay remains exactly once.
  let base = await view(a);
  const accepted = await update(b, base, (d) => {
    d.workshop.brushes[0].faces[0].uvOffset[0] = 0.125;
  });
  const duplicate = await b.call('forge_session_update', {
    projectId: b.id,
    sessionId: b.session,
    revision: accepted.revision,
    document: accepted.document,
    operationId: accepted.operationId,
  });
  expect(duplicate.revision).toBe(accepted.next.revision);
  await expect(
    update(c, base, (d) => {
      for (const vertex of d.workshop.brushes[0].vertices) vertex[0] *= 1.05;
    }),
  ).rejects.toThrow(/conflict|another creator owns/i);
  await expect(
    update(c, base, (d) => {
      d.workshop.brushes = d.workshop.brushes.filter((x) => x.id !== 'room-a');
    }),
  ).rejects.toThrow(/conflict|another creator owns/i);
  await a.call('forge_session_role', {
    projectId: a.id,
    sessionId: a.session,
    participantId: c.author,
    role: 'viewer',
    revoke: false,
  });
  await expect.poll(async () => (await view(c)).role).toBe('viewer');
  await expect(c.page.locator('.bsp-source-fields > fieldset')).toHaveAttribute('disabled', '');
  await expect(
    c.page.locator('.bsp-source-fields').getByRole('textbox', { name: 'Volume name', exact: true }),
  ).toBeDisabled();
  await expect(
    c.call('forge_session_preview', {
      projectId: c.id,
      sessionId: c.session,
      revision: duplicate.revision,
      brush: { brushId: 'room-a', position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    }),
  ).rejects.toThrow(/view(?:er|ing permission)/i);
  await expect(c.call('quickforge_build', { projectId: c.id })).rejects.toThrow(/owner/i);
  await a.call('forge_session_role', {
    projectId: a.id,
    sessionId: a.session,
    participantId: c.author,
    role: 'editor',
    revoke: false,
  });
  await mark('conflictsReplayViewerAndBuildPermissions');
  // Suspend only the isolated editor's JS. Its native identity/source remain
  // genuine; this tests lease expiry, not a real network or VPN outage.
  const paused = await c.page.context().newCDPSession(c.page);
  await paused.send('Debugger.enable');
  const didPause = new Promise((r) => paused.once('Debugger.paused', r));
  await paused.send('Debugger.pause');
  await didPause;
  await sleep(11500);
  await expect
    .poll(async () => (await view(a)).participants.find((p) => p.id === c.author)?.online)
    .toBe(false);
  await paused.send('Debugger.resume');
  await paused.detach();
  await expect
    .poll(async () => (await view(a)).participants.find((p) => p.id === c.author)?.online, {
      intervals: [650],
    })
    .toBe(true);
  expect((await status(c)).view.authorId).toBe(c.author);
  expect((await view(a)).participants).toHaveLength(3);
  await mark('expiredEditorLeaseReauthenticatesSameIdentity', {
    pausedNativeEditorJavaScriptMs: 11500,
    networkOutageSimulated: false,
  });
  current = await view(a);
  await converge(current);
  await Promise.all(actors.map((x) => save(x, current.document)));
  await memory('before sustained edits');
  const durationStart = performance.now();
  for (let i = 0; i < 240; i++) {
    const creator = actors[i % 3],
      brush = i % 3,
      src = await view(a),
      started = performance.now();
    const moved = await update(creator, src, (d) => {
      d.workshop.brushes[brush].name = `C48 ${creator.slug} ${i}`;
    });
    current = moved.next;
    if (i < 12 || i >= 228) {
      await converge(current);
      receipt.latencies.push({
        kind: i < 12 ? 'early sustained commits' : 'late sustained commits',
        ms: performance.now() - started,
      });
    } else if (i % 20 === 19) await converge(current);
    // Exercise a realistic steady source cadence, not a rate-limit bypass.
    await sleep(Math.max(0, 200 - (performance.now() - started)));
    if (i === 119) await memory('mid sustained edits');
  }
  await converge(current);
  await memory('after sustained edits');
  const sessionRoot = path.join(a.data, 'studio-sessions', a.directory);
  const head = JSON.parse(await fs.readFile(path.join(sessionRoot, 'head.json'), 'utf8')),
    journal = JSON.parse(await fs.readFile(path.join(sessionRoot, `state-${head.slot}.json`), 'utf8'));
  expect(journal.transactions.length).toBe(100);
  expect(journal.revision).toBe(current.revision);
  expect(Object.keys(journal.acknowledged).length).toBe(current.acknowledgedOperations);
  await mark('sustainedNativeBspEditing', {
    commits: 240,
    durationMs: performance.now() - durationStart,
    history: journal.transactions.length,
    revision: current.revision,
    acknowledgedOperations: current.acknowledgedOperations,
    journalBytes: (await fs.stat(path.join(sessionRoot, `state-${head.slot}.json`))).size,
  });
  // Frozen source native compilation while another creator continues editing.
  current = await view(a);
  await converge(current);
  await save(a, current.document);
  const buildStart = performance.now(),
    jobId = await uiBuild(a);
  const frozen = current;
  await sleep(200);
  current = (
    await update(c, current, (d) => {
      d.workshop.brushes[3].name = 'Changed during frozen native BSP build';
    })
  ).next;
  if(chupathingyTrial)current=await uiMoveStarts(c,.25);
  await converge(current);
  await save(a, current.document);
  let built;
  await expect
    .poll(
      async () => {
        const boot = await a.call('bootstrap'),
          failed = boot.logs.find((l) => l.jobId === jobId && ['failed', 'blocked'].includes(l.phase));
        if (failed) throw Error(failed.message);
        built = (await a.call('open_project', { id: a.id })).project.builds.find((x) => x.id === jobId);
        return built?.status;
      },
      { timeout: 300000, intervals: [1500, 3000] },
    )
    .toBe('validated');
  const binding = JSON.parse(
    await fs.readFile(path.join(a.data, 'jobs', jobId, 'studio-binding.json'), 'utf8'),
  );
  expect(binding.sessionRevision).toBe(frozen.revision);
  expect(binding.sessionId).toBe(a.session);
  const snapshot = JSON.parse(
    await fs.readFile(path.join(a.data, 'jobs', jobId, 'workspace', 'project.gsproject'), 'utf8'),
  );
  expect(snapshot.quickForge.workshop).toEqual(frozen.document.workshop);
  const reopened = await a.call('open_built_map', { projectId: a.id, buildId: jobId });
  expect(reopened.inspection.header.version).toBe(chupathingyTrial?609:13);
  expect(reopened.inspection.mesh.indices.length).toBeGreaterThan(0);
  expect(reopened.inspection.tags.some((tag) => tag.class === 'sbsp')).toBe(true);
  await mark('frozenSharedBspNativeBuild', {
    jobId,
    durationMs: performance.now() - buildStart,
    sessionRevision: binding.sessionRevision,
    newerRevision: current.revision,
    cacheVersion: chupathingyTrial?609:13,
    compiledCollisionTriangles: reopened.inspection.mesh.indices.length / 3,
    cacheSha256: await fileHash(built.output),
    cacheBytes: (await fs.stat(built.output)).size,
    output: built.output,
    portals: snapshot.quickForge.workshop.portals.length,
    readbackTags: reopened.inspection.tags.length,
  });
  if(receipt.stages.nativeWorkshopAxisAndFloor){
    const ramp=frozen.document.workshop.brushes.find(brush=>brush.id==='ramp');
    expect(ramp.rotation).toEqual([0,0,0]);expect(ramp.scale).toEqual([1,1,1]);
    const highest=Math.max(...ramp.vertices.map(vertex=>vertex[2]));
    const upper=ramp.vertices.filter(vertex=>vertex[2]===highest).map(vertex=>vertex.map((value,axis)=>value+ramp.position[axis]));
    const positions=reopened.inspection.mesh.positions;
    for(const point of upper){
      let found=false;for(let index=0;index<positions.length;index+=3)if(point.every((value,axis)=>Math.abs(value-positions[index+axis])<.0001)){found=true;break;}
      expect(found,'The actual native collision must contain the floor-snapped ramp upper edge').toBe(true);
    }
    await mark('nativeWorkshopAxisAndFloor',{...receipt.stages.nativeWorkshopAxisAndFloor,nativeCompilePending:false,compiledCollisionUpperEdge:upper,compiledCacheSha256:await fileHash(built.output),compiledBuildId:jobId});
  }
  async function independentReadback(build,label){
      const directory=await finishStorage.createScratch('independent-'+cacheVersion+'-'+label);
      const options={windowsHide:true,timeout:30000,maxBuffer:1024*1024};
      const inspected=await a.call('open_built_map',{projectId:a.id,buildId:build.id});const tag=inspected.inspection.tags.find(row=>row.class==='scnr');expect(tag).toBeTruthy();const nativePath=tag.path+'.scenario';
      const crc=(await runNative(path.join(invader,'invader-info.exe'),['-T','crc32_mismatched',build.output],options)).stdout.trim();expect(crc).toBe('0');
      const extracted=await runNative(path.join(invader,'invader-extract.exe'),['-s',nativePath,'-t',directory,build.output],options);expect(extracted.stdout+'\n'+extracted.stderr).not.toMatch(/Failed to extract|ERROR:/i);
      const count=Number((await runNative(path.join(invader,'invader-edit.exe'),['-t',directory,'-C','player_starting_locations',nativePath],options)).stdout.trim());expect(count).toBe(4);
      const positions=[];for(let i=0;i<count;i++){const values=(await runNative(path.join(invader,'invader-edit.exe'),['-t',directory,'-G',`player_starting_locations[${i}].position`,nativePath],options)).stdout.trim().split(',').map(Number);expect(values).toHaveLength(3);expect(values.every(Number.isFinite)).toBe(true);positions.push(values);}
      let nativeContent;
      if(sharedNativeContent){
       const snapshot=JSON.parse(await fs.readFile(path.join(a.data,'jobs',build.id,'workspace/project.gsproject'),'utf8'));
       nativeContent=await readbackSharedNativeContent({actor:a,build,document:snapshot.quickForge,directory,invader,runNative,expect,hash:fileHash});
      }
      return {sha256:await fileHash(build.output),positions,crcMismatch:0,independentNativeReadback:true,...(nativeContent?{nativeContent}:{})};
    }
  if(chupathingyTrial||sharedNativeContent){
    receipt.frozenNativeReadback=await independentReadback(built,'frozen');
    if(chupathingyTrial)receipt.frozenCeReadback=receipt.frozenNativeReadback;
    if(sharedNativeContent){
      await retireNativeSeeds({actors,root,hash:fileHash,expect,mark});
      if(nativeRecovery){
        const retired=await disposeQaScratch(root,await sealQaScratch(root,nativeRecovery.tagRoot),{ownerFinished:true});
        await mark('unusedQaRawExtractionRetired',{logicalBytes:retired.bytes,files:retired.files,correctedProfileAndOriginalMapPreserved:true,qaOnly:true});
      }
      if(!chupathingyTrial)await retireQaTagIntermediates(a,built);
    }
  }
  if(chupathingyTrial){
    if(process.env.SPARK_QA_SHARED_CHUPATHINGY_REBUILD==='1')await retireQaTagIntermediates(a,built);
    const stale=await a.call('quickforge_build_report',{projectId:a.id});expect(stale.current).toBe(false);
    const gameRevision=current;await Promise.all(actors.map(x=>save(x,current.document)));
    const nextJob=await uiBuild(a);let gameBuild;
    await expect.poll(async()=>{const boot=await a.call('bootstrap'),failed=boot.logs.find(row=>row.jobId===nextJob&&['failed','blocked'].includes(row.phase));if(failed)throw Error(failed.message);gameBuild=(await a.call('open_project',{id:a.id})).project.builds.find(row=>row.id===nextJob);return gameBuild?.status;},{timeout:300000,intervals:[1500,3000]}).toBe('validated');
    const gameBinding=JSON.parse(await fs.readFile(path.join(a.data,'jobs',nextJob,'studio-binding.json'),'utf8'));expect(gameBinding.sessionRevision).toBe(gameRevision.revision);
    receipt.currentCeReadback=await independentReadback(gameBuild,'game');
    if(process.env.SPARK_QA_SHARED_CHUPATHINGY_REBUILD==='1')await retireQaTagIntermediates(a,gameBuild);
    for(let i=0;i<4;i++)expect(receipt.currentCeReadback.positions[i][0]).toBeCloseTo(receipt.frozenCeReadback.positions[i][0]+.25,5);
    const ready=await a.call('quickforge_build_report',{projectId:a.id});expect(ready.current).toBe(true);expect(ready.build.id).toBe(nextJob);
    receipt.sharedGameRevision={sessionId:a.session,sessionRevision:gameRevision.revision,buildId:nextJob,sha256:gameBuild.sha256,frozenOlderBuildRetained:await fileHash(built.output)===receipt.frozenCeReadback.sha256};
    if(process.env.SPARK_QA_SHARED_CHUPATHINGY_REBUILD==='1')await retireFrozenQaMap(a,built,gameBuild);
    const hostPage=async()=>{await chooseTool(a.page,'Online');await a.page.getByRole('button',{name:'Host game',exact:true}).click();};
    let retainedInvader;
    async function selectQaInvader(folder){
      await chooseTool(a.page,'Level editor');await openDrawer(a.page,'Project setup');
      const panel=a.page.getByRole('region',{name:'Project setup panel',exact:true});
      for(const details of [panel.locator('.gs-map-tools'),panel.locator('.gs-build-targets')])if(await details.getAttribute('open')===null){const summary=details.locator(':scope > summary');await revealPagedControl(summary);await summary.click();}
      const input=panel.locator('.gs-build-targets').getByRole('textbox',{name:/Invader folder/,includeHidden:true});await revealPagedControl(input);await input.fill(folder);await input.evaluate(node=>node.blur());
      await a.page.getByRole('button',{name:'Close Project setup',exact:true}).click();await hostPage();
    }
    const liveRebuild=process.env.SPARK_QA_SHARED_CHUPATHINGY_REBUILD==='1'?{
      async edit(){current=await uiMoveStarts(b,.25);await chooseTool(a.page,'Level editor');if(!await a.page.getByLabel('Native BSP Workshop').isVisible())await a.page.getByRole('button',{name:'BSP Workshop',exact:true}).click();await converge(current);await hostPage();receipt.sharedRebuildRevision={sessionId:a.session,sessionRevision:current.revision,documentSha256:(await validateForActor(a,current.document)).sourceSha256,realPeerInspectorEdits:true};return {revision:current.revision,positions:current.document.spawns.map(spawn=>[...spawn.position])};},
      async editDuringBuild(){current=await uiMoveStarts(b,.25);await chooseTool(a.page,'Level editor');if(!await a.page.getByLabel('Native BSP Workshop').isVisible())await a.page.getByRole('button',{name:'BSP Workshop',exact:true}).click();await converge(current);await save(a,current.document);await hostPage();return {revision:current.revision,positions:current.document.spawns.map(spawn=>[...spawn.position]),sourceSha256:(await validateForActor(a,current.document)).sourceSha256};},
      async reviewUnadoptedBuild(job,frozen){
        const project=(await a.call('open_project',{id:a.id})).project,build=project.builds.find(row=>row.id===job);expect(build?.status).toBe('validated');
        const native=await independentReadback(build,'unadopted-source-race');expect(native.positions).toEqual(frozen.positions);
        const snapshot=path.join(a.data,'jobs',job,'workspace','project.gsproject'),snapshotHash=await fileHash(snapshot),binding=JSON.parse(await fs.readFile(path.join(a.data,'jobs',job,'studio-binding.json'),'utf8'));
        expect(binding.sessionRevision).toBe(frozen.revision);expect(current.revision).toBeGreaterThan(frozen.revision);
        await retireQaTagIntermediates(a,build);expect(await fileHash(build.output)).toBe(native.sha256);
        // This QA candidate was independently read back and explicitly refused;
        // it is neither the running nor retained rollback map. Keep its source receipt.
        expect(build.id).not.toBe(gameBuild.id);expect(await fileHash(gameBuild.output)).toBe(gameBuild.sha256);
        const seal=await sealQaScratch(root,build.output),removed=await disposeQaScratch(root,seal,{ownerFinished:true});
        expect(await fileHash(snapshot)).toBe(snapshotHash);expect(await fileHash(gameBuild.output)).toBe(gameBuild.sha256);
        return {...native,sessionRevision:binding.sessionRevision,sourceSnapshotSha256:snapshotHash,retiredQaOnlyAfterReadback:true,retiredLogicalBytes:removed.bytes,currentGameOutputPreserved:true};
      },
      async readback(adopted){
        const project=(await a.call('open_project',{id:a.id})).project,build=project.builds.find(row=>row.id===adopted.sourceBuildId);expect(build?.status).toBe('validated');
        const readback=await independentReadback(build,'dedicated-rebuilt');
        for(let i=0;i<4;i++)for(let axis=0;axis<3;axis++)expect(readback.positions[i][axis]).toBeCloseTo(current.document.spawns[i].position[axis],5);
        const binding=JSON.parse(await fs.readFile(path.join(a.data,'jobs',build.id,'studio-binding.json'),'utf8'));expect(binding.sessionRevision).toBe(current.revision);expect(binding.sessionId).toBe(a.session);
        receipt.sharedRebuildRevision.buildId=build.id;receipt.sharedRebuildRevision.sha256=readback.sha256;
        await retireQaTagIntermediates(a,build);
        return readback;
      },
      async breakBuild(){
        if(sharedNativeContent){
          await chooseTool(a.page,'Level editor');
          if(await a.page.getByLabel('Native BSP Workshop').isVisible())await a.page.getByRole('button',{name:'Objects & gameplay',exact:true}).click();
          await openDrawer(a.page,'Inspector');await a.page.getByRole('button',{name:'Properties',exact:true}).click();
          const logic=a.page.locator('.forge-logic-events'),summary=logic.locator(':scope>summary');await revealPagedControl(summary);if(!await logic.evaluate(node=>node.open))await summary.click();
          const handwritten=logic.locator('.forge-handwritten-sources'),sourceSummary=handwritten.locator(':scope>summary');await revealPagedControl(sourceSummary);if(!await handwritten.evaluate(node=>node.open))await sourceSummary.click();
          await handwritten.getByLabel('Import handwritten HaloScript').setInputFiles({name:'gs_qa_failure.hsc',mimeType:'text/plain',buffer:Buffer.from('(script startup gs_qa_failure (gs_qa_missing_function))\n')});
          await expect.poll(async()=>(await view(a)).document.logic?.handwrittenSources?.[0]?.filename).toBe('gs_qa_failure.hsc');current=await view(a);
          await a.page.getByRole('button',{name:'Close Inspector',exact:true}).click();await a.page.getByRole('button',{name:'BSP Workshop',exact:true}).click();await converge(current);await hostPage();return;
        }
        await chooseTool(a.page,'Level editor');await openDrawer(a.page,'Project setup');
        const panel=a.page.getByRole('region',{name:'Project setup panel',exact:true}),mapTools=panel.locator('.gs-map-tools'),targets=panel.locator('.gs-build-targets');
        for(const details of [mapTools,targets])if(await details.getAttribute('open')===null){const summary=details.locator(':scope>summary');await revealPagedControl(summary);await summary.click();}
        const tags=targets.getByRole('textbox',{name:/Editable Halo Tags folder/,includeHidden:true});await revealPagedControl(tags);await tags.fill(nativeRecovery.tagRoot);await tags.evaluate(node=>node.blur());
        await a.page.getByRole('button',{name:'Close Project setup',exact:true}).click();await hostPage();
      },
      async restoreBuild(){
        if(sharedNativeContent){
          const diagnostics=(await a.call('bootstrap')).logs.filter(row=>row.projectId===a.id&&row.phase==='logic-script').slice(-120);
          const rejected=diagnostics.find(row=>row.message.includes('gs_qa_missing_function'));expect(rejected).toBeTruthy();
          await retireRejectedQaNativeInputs(a,rejected.jobId);
          await chooseTool(a.page,'Level editor');await panel(a);const undo=a.panel.getByRole('button',{name:'Undo my shared edit',exact:true,includeHidden:true});await revealPagedControl(undo);await undo.click();
          await expect.poll(async()=>(await view(a)).document.logic?.handwrittenSources?.length??0).toBe(0);current=await view(a);await converge(current);await save(a,current.document);
          await a.page.getByRole('button',{name:'Close SparkLink',exact:true}).click();await hostPage();return diagnostics;
        }
        const diagnostics=(await a.call('bootstrap')).logs.filter(row=>row.projectId===a.id&&row.phase==='compile').slice(-300);
        expect(diagnostics.some(row=>row.message.includes('ActorVariant::grenade_type is out of range'))).toBe(true);
        await chooseTool(a.page,'Level editor');await a.page.locator('.runtime-dock-heading').click();await a.page.keyboard.press('Control+z');await save(a,current.document);
        const project=(await a.call('open_project',{id:a.id})).project;expect(project.buildTargets.find(target=>target.id===project.activeBuildTarget).tagsDirectory).toBe(receipt.ceSource.reviewedRecovery.tagsDirectory);
        await hostPage();return diagnostics;
      },
    }:undefined;
    if(sharedNativeContent&&liveRebuild)liveRebuild.prerequisiteFailure={
      uiPreflightError:/The system cannot find the file specified\. \(os error 2\)/,
      async breakBuild(){const project=(await a.call('open_project',{id:a.id})).project;retainedInvader=project.buildTargets.find(target=>target.id===project.activeBuildTarget).invaderDirectory;expect(retainedInvader).toBeTruthy();await selectQaInvader(path.join(a.dir,'missing-qa-invader'));},
      async restoreBuild(){await selectQaInvader(retainedInvader);await a.page.keyboard.press('Control+s');await expect.poll(async()=>(await a.call('read_workspace_history',{projectId:a.id})).history?.head.dirty).toBe(false);const project=(await a.call('open_project',{id:a.id})).project;expect(project.buildTargets.find(target=>target.id===project.activeBuildTarget).invaderDirectory).toBe(retainedInvader);return {actualUiToolPathRestored:true,missingPrerequisiteNotCompilerSuccess:true};},
    };
    if(sharedNativeContent)await mark('retiredQaWebviewInstallers',await Promise.all(actors.map(async actor=>({actor:actor.slug,...await finishStorage.retireWebviewInstallers(actor.slug)}))));
    await nativeDedicatedServer({page:a.page,root,call:a.call,expect,receipt,compiled:ready,projectId:a.id,expectedSpawns:receipt.currentCeReadback.positions,liveRebuild,compilerFailureBeforeRebuild:sharedNativeContent,verifyLifecycleFaults:dedicatedFaults,ownerProcessId:a.child.pid,checkpoint:async phase=>{
      await qaFootprint(phase);
      const history=await a.call('read_workspace_history',{projectId:a.id});
      const saveState={phase,historyDirty:history?.history?.head?.dirty,historyHead:history?.history?.head?.current,visibleSaveChanges:await a.page.getByRole('button',{name:'Save changes',exact:true}).count()};
      (receipt.nativeSaveIndicators??=[]).push(saveState);
      if(['live-rebuild-compiling-with-two-peers','new-revision-adopted-and-independent-readback','new-revision-readback-and-two-rejoined-clients','native-compiler-failure-kept-two-peers'].includes(phase)){
        expect(saveState.historyDirty,'Live Rebuild must acknowledge the actual saved history before compiling').toBe(false);
        expect(saveState.visibleSaveChanges,'Saved source must not remain marked as an unsaved draft').toBe(0);
      }
      await mark('dedicatedProgress',{phase});
    },trackProcess:child=>finishStorage.trackProcess(child),createScratch:name=>finishStorage.createScratch(name)});
    receipt.gameLaunched=true;expect(receipt.nativeDedicated.twoClients).toBe(true);expect(receipt.nativeDedicated.start.mapSha256).toBe(gameBuild.sha256);
    receipt.ceSource.originalsUnchanged=(await Promise.all(receipt.ceSource.originals.map(async row=>await fileHash(row.file)===row.sha256))).every(Boolean);expect(receipt.ceSource.originalsUnchanged).toBe(true);
    await chooseTool(a.page,'Level editor');if(!await a.page.getByLabel('Native BSP Workshop').isVisible())await a.page.getByRole('button',{name:'BSP Workshop',exact:true}).click();await converge(current);
    await mark('sharedCeBuildPrivateTwoGameClients',{...receipt.sharedGameRevision,twoClients:true,gameplayAccepted:false,aiAccepted:false,physicalMachines:1});
  }
  // Edit through the real UI after owner death, then edit again while the first
  // operation is unacknowledged. Rejoining must retain BOTH drafts and apply
  // each exactly once with the original author and operation identity.
  await Promise.all(actors.map((x) => save(x, current.document)));
  const priorAuthor = b.author,
    priorSession = a.session,
    beforeCrashRevision = current.revision;
  await crash(a);
  await uiName(b, 2, 'Recovered pending BSP source');
  let pending;
  await expect
    .poll(async () => {
      pending = await b.call('forge_studio_pending', { projectId: b.id });
      return pending?.document.workshop.brushes[2].name;
    })
    .toBe('Recovered pending BSP source');
  expect(pending.revision).toBe(beforeCrashRevision);
  expect(pending.sessionId).toBe(priorSession);
  await uiName(b, 3, 'Newer local draft kept during reconnect');
  const newerLocal = clone(pending.document);
  newerLocal.workshop.brushes[3].name = 'Newer local draft kept during reconnect';
  const localReport = await validateForActor(b,newerLocal);
  await expect(b.page.getByLabel('Native BSP Workshop')).toHaveAttribute(
    'data-source-sha',
    localReport.sourceSha256,
  );
  expect(await b.call('forge_studio_pending', { projectId: b.id })).toEqual(pending);
  await save(b, newerLocal);
  await mark('twoGenuineOfflineUiEditsRetained', {
    operationId: pending.operationId,
    baseline: pending.revision,
    pendingSourceSha256: (await validateForActor(b,pending.document)).sourceSha256,
    newerDraftSourceSha256: localReport.sourceSha256,
  });
  await start(a, true);
  await panel(a);
  const recovered = await a.call('forge_studio_recover', {
    projectId: a.id,
    directoryId: a.directory,
    address: lan.address,
    displayName: a.slug,
    transport: 'lan',
  });
  a.session = recovered.sessionId;
  expect(a.session).toBe(priorSession);
  expect(recovered.view.document).toEqual(current.document);
  expect(recovered.view.revision).toBe(current.revision);
  await a.page.reload();
  await a.page
    .locator('.map-card')
    .filter({ has: a.page.getByRole('heading', { name: a.title, exact: true }) })
    .click();
  await a.call('claim_project_document', { id: a.id });
  for (const x of [b, c]) await leave(x);
  const recoveredInvite = await invitation(a, lan.address);
  await join(b, recoveredInvite);
  await join(c, recoveredInvite);
  expect(b.author).toBe(priorAuthor);
  await expect
    .poll(async () => {
      const next = await view(a);
      return [next.document.workshop.brushes[2].name, next.document.workshop.brushes[3].name];
    })
    .toEqual(['Recovered pending BSP source', 'Newer local draft kept during reconnect']);
  current = await view(a);
  expect(current.revision).toBe(beforeCrashRevision + 2);
  await converge(current);
  if(sharedNativeContent){
    await verifyRetainedNativePreviews({actors,hash:fileHash,expect,mark});
    for(const editor of actors){
      const close=editor.page.getByRole('button',{name:'Close SparkLink',exact:true});if(await close.isVisible())await close.click();
      await editor.page.getByRole('button',{name:'Objects & gameplay',exact:true}).click();
      await expect.poll(()=>editor.page.locator('.forge-model-evidence').getAttribute('data-placement-models')).toBe('1');
      expect(Number(await editor.page.locator('.forge-model-evidence').getAttribute('data-model-triangles'))).toBeGreaterThan(0);
      await editor.page.screenshot({path:path.join(root,'native-shared-recovered-'+editor.slug+'.png')});
      await editor.page.getByRole('button',{name:'BSP Workshop',exact:true}).click();await panel(editor);
    }
    await mark('nativePreviewAfterOwnerProcessRestart',{actualModelInAllThreeEditors:true,sourceIdentityRetained:true,sourceMapsNotCopied:true});
  }
  await expect.poll(() => b.call('forge_studio_pending', { projectId: b.id })).toBe(null);
  const again = await b.call('forge_session_update', {
    projectId: b.id,
    sessionId: b.session,
    revision: pending.revision,
    document: pending.document,
    operationId: pending.operationId,
  });
  expect(again.acknowledgedOperationId).toBe(pending.operationId);
  expect(again.revision).toBe(current.revision);
  expect(again.document).toEqual(current.document);
  const recoveryHead = JSON.parse(await fs.readFile(path.join(sessionRoot, 'head.json'), 'utf8'));
  const recoveredJournal = JSON.parse(
    await fs.readFile(path.join(sessionRoot, `state-${recoveryHead.slot}.json`), 'utf8'),
  );
  const originalRows = recoveredJournal.transactions.filter((row) => row.id === pending.operationId);
  expect(originalRows).toHaveLength(1);
  expect(originalRows[0].author).toBe(priorAuthor);
  await mark('ownerProcessDeathRecoversSourceHistoryAndPendingIdentity', {
    originalOperationId: pending.operationId,
    author: priorAuthor,
    beforeRevision: beforeCrashRevision,
    afterRevision: current.revision,
    genuineOfflineUiEdits: 2,
    originalOperationAppliedOnce: true,
    newerLocalDraftPreserved: true,
  });
  // C59: roll a converged durable authority forward through the real UI. Fresh
  // invitations reset the bounded operation log; the old journal stays intact.
  await Promise.all(actors.map((x) => save(x, current.document)));
  const sealedSession=a.session,sealedDirectory=a.directory,sealedHead=await fs.readFile(path.join(sessionRoot,'head.json'));
  const rolloverBegan=performance.now();
  await panel(a);
  await a.page.evaluate(()=>{window.c59RolloverClicks=0;document.addEventListener('click',event=>{if(event.target.closest?.('button')?.textContent==='New session from this revision')window.c59RolloverClicks++;});});
  await expect(a.panel.getByRole('button',{name:'New session from this revision',exact:true})).toBeEnabled();
  await a.panel.getByRole('button',{name:'New session from this revision',exact:true}).click();
  await expect.poll(async()=> (await status(a)).sessionId).not.toBe(sealedSession);
  const rolled=await status(a);a.session=rolled.sessionId;a.directory=rolled.directoryId;
  expect(rolled.view.document).toEqual(current.document);expect(rolled.view.revision).toBe(0);expect(rolled.view.acknowledgedOperations).toBe(0);
  expect(await fs.readFile(path.join(sessionRoot,'head.json'))).toEqual(sealedHead);
  await expect(a.call('forge_session_invite',{projectId:a.id,sessionId:sealedSession,address:lan.address,viewer:false})).rejects.toThrow();
  const lineage=await a.call('forge_studio_history',{projectId:a.id});
  expect(lineage.find(row=>row.directoryId===a.directory)).toMatchObject({previousSessionId:sealedSession,previousRevision:current.revision});
  await expect(a.call('forge_studio_recover',{projectId:a.id,directoryId:sealedDirectory,address:lan.address,displayName:a.slug,transport:'lan'})).rejects.toThrow(/rolled over/i);
  await a.page.getByRole('button',{name:'Close SparkLink',exact:true}).click();
  for(const x of [b,c])await leave(x);
  const freshInvite=await invitation(a,lan.address);await join(b,freshInvite);await join(c,freshInvite);
  await converge(rolled.view);
  for(const x of actors)expect((await view(x)).canUndo).toBe(false);
  base=await view(a);
  await Promise.all([
    update(a,base,d=>{d.workshop.brushes[0].name='Rollover owner';}),
    update(b,base,d=>{d.workshop.brushes[1].name='Rollover editor B';}),
    update(c,base,d=>{d.workshop.brushes[2].name='Rollover editor C';}),
  ]);
  current=await view(a);expect(current.revision).toBe(3);await converge(current);
  await mark('durableRolloverReinvitesThreeProcessesWithoutChangingThePreviousJournal',{
    elapsedMs:performance.now()-rolloverBegan,previousSession:sealedSession,previousRevision:lineage.find(row=>row.directoryId===a.directory).previousRevision,
    session:rolled.sessionId,newBaselineRevision:0,convergedRevision:current.revision,oldJournalPreserved:true,newInvitationsRequired:true,sharedUndoStartsFresh:true,
  });
  await Promise.all(actors.map((x) => save(x, current.document)));
  for (const x of [b, c, a]) await leave(x);
  // Repeat actual endpoint traffic using the OS-identified Radmin interface.
  const hosted = await host(a, vpn.address);
  expect(hosted.networkScope).toBe('radminVpn');
  const vpnInvite = await invitation(a, vpn.address);
  await join(b, vpnInvite);
  await join(c, vpnInvite);
  base = await view(a);
  await Promise.all([
    update(a, base, (d) => {
      d.workshop.brushes[0].name = 'Radmin owner';
    }),
    update(b, base, (d) => {
      d.workshop.brushes[1].name = 'Radmin B';
    }),
    update(c, base, (d) => {
      d.workshop.brushes[2].name = 'Radmin C';
    }),
  ]);
  current = await view(a);
  await converge(current);
  expect(current.revision).toBe(3);
  await mark('radminInterfaceThreeProcessConvergence', {
    scope: 'Radmin adapter, same physical machine',
    crossComputer: false,
    remoteVpnTunnelTested: false,
    revision: current.revision,
  });
  await a.call('forge_session_role', {
    projectId: a.id,
    sessionId: a.session,
    participantId: c.author,
    role: 'viewer',
    revoke: true,
  });
  await expect(view(c)).rejects.toThrow(/revoked/i);
  await mark('revokedParticipantCannotReconnect');
  for (const x of actors) await x.page.screenshot({ path: path.join(x.dir, 'final.png') });
  expect(errors).toEqual([]);
  if(dedicatedFaults){
    expect(receipt.nativeDedicated?.unexpectedServerExit).toMatchObject({onlyExactOwnedProcessTerminated:true,previousGoodMapUnchanged:true,existingPrivateProfilesRejoined:true});
    expect(receipt.nativeDedicated.unexpectedServerExit.spawnReadback.agreed).toBe(true);
    await mark('requestedDedicatedCrashRollbackAccepted',{realOwnedProcessExit:true,previousGoodMapAndTwoPeersRecovered:true});
  }
  if(receipt.mccSource){receipt.mccSource.originalsUnchanged=(await Promise.all(receipt.mccSource.originals.map(async row=>await fileHash(row.file)===row.sha256))).every(Boolean);expect(receipt.mccSource.originalsUnchanged).toBe(true);await mark('mccOriginalSourcePreserved',{sourceSha256:receipt.mccSource.sourceSha256,originalsUnchanged:true});}
  receipt.pageErrors = errors;
  receipt.elapsedMs = performance.now() - receipt.begin;
  delete receipt.begin;
  receipt.complete = true;
  receipt.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
  console.log(
    'PASS actual three-process shared Workshop editing, ghosts, sustained revisions, native compile and recovery',
  );
} catch (e) {
  receipt.error = String(e);
  receipt.stack = e.stack;
  await qaFootprint('failure-before-owned-cleanup').catch(problem=>{receipt.footprintError=String(problem);});
  receipt.pageErrors = errors;
  for (const a of actors) {
    receipt.uiAlerts??={};
    receipt.uiAlerts[a.slug]=await a.page?.locator('[role="alert"]').allTextContents().catch(()=>[]);
    receipt.uiAlerts[a.slug+':notices']=await a.page?.locator('.notice.error').allTextContents().catch(()=>[]);
    receipt.uiAlerts[a.slug+':rolloverClicks']=await a.page?.evaluate(()=>window.c59RolloverClicks).catch(()=>null);
    await a.page?.screenshot({ path: path.join(a.dir, 'failure.png') }).catch(() => {});
  }
  await fs.writeFile(path.join(root, 'failure.json'), JSON.stringify(receipt, null, 2));
  throw e;
} finally {
  for (const a of actors) {
    for(const name of ['final.png','failure.png']){const source=path.join(a.dir,name),info=await fs.stat(source).catch(()=>null);if(info?.isFile()&&info.size<=4*1024**2){await fs.copyFile(source,path.join(root,`native-sparklink-${a.slug}.png`));break;}}
    await a.browser?.close().catch(() => {});
    a.child?.kill();
    if (a.child) await waitForQaExit(a.child);
  }
  try{if(receipt.complete){
    // The terminal receipt contains every progress stage. Keep one canonical
    // diagnostic, rather than a second full copy of the finished checkpoint.
    const terminal=path.join(root,'acceptance.json'),progress=path.join(root,'progress.json');
    const final=JSON.parse(await fs.readFile(terminal,'utf8')),prior=JSON.parse(await fs.readFile(progress,'utf8'));
    expect(final.complete).toBe(true);expect(final.appSha256).toBe(prior.appSha256);
    expect(final.harnessSha256).toBe(prior.harnessSha256);expect(final.stages).toEqual(prior.stages);
    for(const [key,value] of Object.entries(prior))if(!['begin','complete'].includes(key))expect(final[key]).toEqual(value);
    const terminalSha256=await fileHash(terminal);
    await disposeQaScratch(root,await sealQaScratch(root,progress),{ownerFinished:true});
    expect(await fileHash(terminal)).toBe(terminalSha256);
  }
  }catch(problem){
    // A failed receipt comparison must still close its owned storage lease.
    // Keep both failures if cleanup also refuses; never report a false pass.
    try{await finishStorage('failed');}catch(cleanup){throw new AggregateError([problem,cleanup],'Native receipt preservation and owned cleanup failed');}
    throw problem;
  }
  await finishStorage(receipt.complete?'passed':'failed');
}
