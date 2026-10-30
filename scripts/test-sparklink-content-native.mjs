// Opt-in: three actual Windows Spark processes, three isolated owned libraries.
// The Halo compiler is real; game clients, peers and custom binary transfers are not simulated.
import { chromium, expect as pwExpect } from '@playwright/test';
import fs from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
const expect = pwExpect.configure({ timeout: 45000 });
const args = new Map();
for (let n = 2; n < process.argv.length; n += 2) {
  if (
    !['--app', '--root', '--kit', '--invader', '--map', '--template-tags'].includes(process.argv[n]) ||
    !process.argv[n + 1] ||
    args.has(process.argv[n])
  )
    throw Error('Use unique app/root/kit/invader/map arguments');
  args.set(process.argv[n], path.resolve(process.argv[n + 1]));
}
if (args.size !== 6) throw Error('All six named arguments are required');
const root = args.get('--root'),
  output = path.join(root, `run-${new Date().toISOString().replace(/[:.]/g,'-')}`);
await fs.mkdir(output); // Fresh evidence directory; never overwrite a previous attempt.
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const hashFile = async (f) => sha(await fs.readFile(f));
async function sourceInventory(root) {
  const hashes = {};
  async function visit(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw Error('Native QA source contains a link');
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(file);
      else {
        if (Object.keys(hashes).length >= 20000) throw Error('Native QA source inventory exceeds its bound');
        hashes[path.relative(root, file).replaceAll('\\', '/')] = await hashFile(file);
      }
    }
  }
  await visit(root);
  return hashes;
}
const clone = (x) => structuredClone(x);
const actors = [],
  errors = [],
  latencies = [];
const receipt = {
  schemaVersion: 1,
  nativeProcesses: 3,
  separateDataRoots: 3,
  physicalMachines: 1,
  transport: 'private TCP + TLS 1.3, invitation-pinned certificate',
  mockedIpc: false,
  gameLaunched: false,
  gameMemoryTouched: false,
  gamePeerReplicationTested: false,
  nativeTagSharingTested: false,
  binaryAssetTransferTested: false,
};
function mark(name, value = true) {
  receipt[name] = value;
  writeFileSync(path.join(output,'partial-receipt.json'),JSON.stringify({...receipt,acceptanceComplete:false},null,2));
  console.log(name, typeof value === 'object' ? JSON.stringify(value) : value);
}
async function freePort() {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
async function start(actor, restart = false) {
  const port = await freePort();
  const child = spawn(actor.exe, [], {
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      GUILTY_SPARK_DATA_DIR: actor.data,
      WEBVIEW2_USER_DATA_FOLDER: path.join(output, actor.slug, 'webview'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
  });
  actor.child = child;
  await fs.writeFile(
    path.join(output, actor.slug, restart ? 'restarted-process.json' : 'process.json'),
    JSON.stringify({ pid: child.pid, port }),
  );
  await expect
    .poll(() =>
      fetch(`http://127.0.0.1:${port}/json/version`).then(
        (r) => r.ok,
        () => false,
      ),
    )
    .toBe(true);
  actor.browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await expect
    .poll(() =>
      actor.browser
        .contexts()
        .flatMap((c) => c.pages())
        .some((p) => p.url().includes('tauri.localhost')),
    )
    .toBe(true);
  actor.page = actor.browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url().includes('tauri.localhost'));
  actor.page.setDefaultTimeout(30000);
  actor.page.on('pageerror', (e) => errors.push({ actor: actor.slug, error: String(e) }));
  actor.call = (command, a = {}) =>
    actor.page.evaluate(({ command, a }) => window.__TAURI_INTERNALS__.invoke(command, a), { command, a });
  const boot = await actor.call('bootstrap');
  await actor.call('save_settings', {
    settings: {
      ...boot.settings,
      onboardingCompleted: true,
      autoBuild: false,
      preferredHalo: 'mccSteam',
      hekDirectory: args.get('--kit'),
      hekFlavor: 'h1aEk',
      hekTagsDirectory: path.join(actor.data, 'jobs', actor.seed.jobId, 'workspace', 'tags'),
      invaderDirectory: args.get('--invader'),
    },
  });
  if (!restart) {
    const imported = await actor.call('import_paths', { paths: [args.get('--map')] });
    const own = imported.find((x) => x.inspection?.header.version === 13);
    if (!own) throw Error('A real owned MCC Halo 1 map is required');
    actor.map = {
      projectId: own.project.id,
      hash: own.project.source.sha256,
      scenery: own.inspection.tags.find(t=>t.class==='scen'&&t.path.replaceAll('\\','/').endsWith('scenery/rocks/boulder/boulder')),
      pistol:own.inspection.tags.find(t=>t.class==='weap'&&t.path.replaceAll('\\','/')==='weapons/pistol/pistol'),
      vehicle: own.inspection.tags.find(
        (t) => t.class === 'vehi' && t.path.replaceAll('\\', '/').endsWith('vehicles/warthog/mp_warthog'),
      ),
    };
    if (!actor.map.vehicle) throw Error('Owned map must contain the multiplayer Warthog');
  }
  await actor.page.reload();
  await actor.page
    .locator('.map-card')
    .filter({ has: actor.page.getByRole('heading', { name: actor.fixture.title, exact: true }) })
    .click();
  await actor.call('claim_project_document', { id: actor.id });
  await actor.page.getByRole('button', { name: /Live Studio ·/ }).click();
  await expect(actor.page.locator('.forge-workspace')).toBeVisible();
  await expect(actor.page.locator('.studio-panel')).toBeVisible();
  const summary = actor.page.locator('.studio-panel > summary');
  if (!(await actor.page.locator('.studio-panel').evaluate((el) => el.open))) await summary.click();
  actor.panel = actor.page.locator('.studio-panel');
  await expect(actor.page.locator('.forge-viewport canvas')).toBeVisible();
  console.log('started', actor.slug, child.pid);
}
async function loadActor(slug, name) {
  const data = path.join(root, slug),
    dir = path.join(output, slug);
  const fixture = JSON.parse(await fs.readFile(path.join(data, 'spark-native-ui-fixture.json'), 'utf8'));
  const seed = JSON.parse(await fs.readFile(path.join(data, 'qa-seed-receipt.json'), 'utf8'));
  if (!fixture.nativeFixture || fixture.projectId !== seed.projectId || path.resolve(seed.library) !== data)
    throw Error('Only explicit isolated owned QA libraries are accepted');
  await fs.mkdir(dir);
  const actor = {
    slug,
    name,
    data,
    fixture,
    seed,
    id: fixture.projectId,
    exe: path.join(dir, 'GuiltySpark-SparkLink-qa.exe'),
  };
  await fs.copyFile(args.get('--app'), actor.exe, fs.constants.COPYFILE_EXCL);
  actors.push(actor);
  await start(actor);
  return actor;
}
async function status(a) {
  return a.call('forge_session_status', { projectId: a.id });
}
async function view(a) {
  return a.call('forge_session_poll', { projectId: a.id, sessionId: a.session });
}
async function update(a, base, change, operationId = crypto.randomUUID()) {
  const document = clone(base.document);
  change(document);
  const result = await a.call('forge_session_update', {
    projectId: a.id,
    sessionId: a.session,
    revision: base.revision,
    document,
    operationId,
  });
  expect(result.acknowledgedOperationId).toBe(operationId);
  return { result, operationId, document, revision: base.revision };
}
async function converged(expected) {
  await expect
    .poll(
      async () => {
        const rows = await Promise.all(actors.map(view));
        return rows.every(
          (x) =>
            x.revision === expected.revision &&
            JSON.stringify(x.document) === JSON.stringify(expected.document),
        );
      },
      { intervals: [650] },
    )
    .toBe(true);
  // Confirm the rendered React editor has consumed the shared document, not only the transport cache.
  for (const a of actors)
    for (const b of expected.document.geometry)
      await expect(a.page.locator('.forge-tree-select').filter({ hasText: b.name })).toHaveCount(1);
}
async function joinUi(a, invitation) {
  await a.panel.getByRole('textbox', { name: 'Studio display name', exact: true }).fill(a.name);
  await a.panel.getByRole('textbox', { name: 'Private Spark invite', exact: true }).fill(invitation);
  await a.panel.getByRole('button', { name: 'Join private invite', exact: true }).click();
  await expect(a.page.getByRole('button', { name: 'Live Studio · Connected', exact: true })).toBeVisible();
  const info = await status(a);
  expect(info.view.encrypted).toBe(true);
  expect(info.view.durable).toBe(true);
  a.session = info.sessionId;
  a.author = info.view.authorId;
}
async function leave(a) {
  await a.panel.getByRole('button', { name: 'Leave session', exact: true }).click();
  await expect(a.panel.getByRole('button', { name: 'Join private invite', exact: true })).toBeVisible();
}
async function crash(a) {
  const gone = new Promise((r) => a.child.once('exit', r));
  a.child.kill();
  await gone;
  await a.browser.close().catch(() => {});
  a.browser = null;
  a.child = null;
}

async function contentConverged(expected) {
  await converged(expected);
  for (const x of actors) {
    await expect(x.panel.getByLabel('Shared native content')).toHaveAttribute('data-native-placement-state',JSON.stringify(expected.document.placements.filter(p=>p.publishedAssetId).map(({id,position,rotation})=>({id,position,rotation}))));
    await expect(x.panel.getByLabel('Committed pistol bounding radius')).toHaveText(String(expected.document.native.fields[0]?.boundingRadius??expected.document.native.source.boundingRadius));
    for(const asset of expected.document.native.assets) await expect(x.panel.getByRole('button',{name:`Place ${asset.name}`,exact:true})).toHaveCount(1);
    for(const object of expected.document.placements) await expect(x.page.locator('.forge-tree-select').filter({hasText:new RegExp(`^${object.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`)})).toHaveCount(1);
  }
}
async function saveRevision(x, document) {
  const p=(await x.call('open_project',{id:x.id})).project;
  p.quickForge=clone(document);
  p.quickForge.placements=p.quickForge.placements.map(p=>({...p,sourceProjectId:p.sourceSha256===x.map.hash?x.map.projectId:null}));
  await x.call('save_project',{project:p});
}
try {
  const a=await loadActor('owner','Native tag author A'),b=await loadActor('editor-b','Asset author B'),c=await loadActor('editor-c','World author C');
  expect(new Set(actors.map(x=>x.child.pid)).size).toBe(3);
  expect(new Set(actors.map(x=>x.data)).size).toBe(3);
  expect(new Set(await Promise.all(actors.map(x=>fs.realpath(path.join(x.data,'library.sqlite3')))))).toHaveProperty('size',3);
  for(const x of actors)await expect(x.page.getByRole('button',{name:'Toggle Game connection',exact:true})).toHaveCount(1);
  receipt.appSha256=await hashFile(a.exe);
  receipt.processes=actors.map(x=>({projectId:x.id,data:x.data,pid:x.child.pid}));
  const protectedInputs=await Promise.all(actors.map(async x=>{
    const tags=path.join(x.data,'jobs',x.seed.jobId,'workspace','tags');
    return {tags,hashes:await sourceInventory(tags)};
  }));
  // Three deliberate local native verifications. No remote request launches a utility.
  for(const x of actors) {
    await x.page.getByRole('button',{name:/Live Studio ·/}).click();
    await expect(x.panel).toBeVisible();
    if(!x.map.scenery||!x.map.pistol)throw Error('Owned map must contain the real boulder and pistol');
    await x.panel.getByRole('combobox',{name:'Native preview map',exact:true}).selectOption(x.map.projectId);
    await expect(x.panel.getByRole('combobox',{name:'Native scenery template',exact:true}).locator('option').filter({hasText:x.map.scenery.path})).toHaveCount(1);
    await x.panel.getByRole('combobox',{name:'Native scenery template',exact:true}).selectOption(String(x.map.scenery.id));
    await x.panel.getByRole('textbox',{name:'Native template tags folder',exact:true}).fill(args.get('--template-tags'));
    const recovery=x.panel.getByRole('button',{name:'Restore exact admitted source',exact:true});
    const retained=(await x.call('open_project',{id:x.id})).project.quickForge?.native;
    if(retained){
      const details=x.panel.locator('.studio-native-recovery');
      await expect(details).toHaveCount(1);
      if(!await details.evaluate(el=>el.open))await details.locator('summary').click();
      await expect(recovery).toBeVisible();
      await recovery.click();
      await expect(x.panel.getByText('Restored the exact admitted native source into a new full fork.',{exact:false})).toBeVisible({timeout:120000});
      console.log('retained source recovered',x.slug);
    }
    await x.panel.getByRole('button',{name:'Verify local native source',exact:true}).click();
    await expect(x.panel.getByRole('button',{name:'Verify local native source',exact:true})).toBeEnabled({timeout:120000});
    await expect(x.panel.locator('.notice.error')).toHaveCount(0);
    await expect(x.panel.getByText('Local native source verified.',{exact:true})).toBeVisible({timeout:120000});
    await expect(x.panel.getByLabel('Committed pistol bounding radius')).toBeVisible({timeout:120000});
    console.log('native source admitted',x.slug);
  }
  await a.panel.getByRole('textbox',{name:'Studio display name',exact:true}).fill(a.name);
  await a.panel.getByRole('textbox',{name:'Studio bind address',exact:true}).fill('127.0.0.1');
  await a.panel.getByRole('button',{name:'Host editing session',exact:true}).click();
  await expect(a.page.getByRole('button',{name:'Live Studio · Hosting',exact:true})).toBeVisible();
  const hosted=await status(a);a.session=hosted.sessionId;a.author='host';
  expect(hosted.view.encrypted&&hosted.view.durable).toBe(true);expect(hosted.view.revision).toBe(0);
  const invitation=await a.call('forge_session_invite',{projectId:a.id,sessionId:a.session,address:'127.0.0.1',viewer:false});
  await joinUi(b,invitation);await joinUi(c,invitation);
  await expect.poll(async()=>(await view(a)).peers,{intervals:[650]}).toBe(3);
  const initial=await view(a);await contentConverged(initial);
  const initialAssets=initial.document.native.assets.length,initialPlacements=initial.document.placements.length,initialFields=clone(initial.document.native.fields);
  const initialRadius=initialFields[0]?.boundingRadius??initial.document.native.source.boundingRadius;
  const authorRadius=initialRadius===0.225?0.25:0.225;
  console.log('starting native state',JSON.stringify({initialRadius,authorRadius,initialAssets,initialPlacements}));
  const assetName='B published native boulder '+crypto.randomUUID().slice(0,8);
  const localImport=path.join(output,'editor-b','B-owned-import.scenery');
  const nativeFile=path.join(args.get('--template-tags'),initial.document.native.source.templateTag);
  await fs.copyFile(nativeFile,localImport,fs.constants.COPYFILE_EXCL);
  const protectedTemplateHash=await hashFile(nativeFile);
  await a.panel.getByRole('spinbutton',{name:'Shared pistol bounding radius',exact:true}).fill(String(authorRadius));
  await b.panel.locator('.studio-native-import > summary').click();
  await b.panel.getByRole('textbox',{name:'Native asset import path',exact:true}).fill(localImport);
  await b.panel.getByRole('textbox',{name:'Published native asset name',exact:true}).fill(assetName);
  const began=performance.now();
  // Independent real React actions overlap; B's read/validation may complete after A's commit.
  await Promise.all([
    a.panel.getByRole('button',{name:'Share native field edit',exact:true}).click(),
    b.panel.getByRole('button',{name:'Validate & publish native asset',exact:true}).click(),
  ]);
  await expect.poll(async()=>{const v=await view(a);return v.document.native.fields[0]?.boundingRadius===authorRadius&&v.document.native.assets.length===initialAssets+1;},{timeout:90000,intervals:[500]}).toBe(true);
  let current=await view(a);await contentConverged(current);
  const asset=current.document.native.assets.find(x=>x.name===assetName);expect(asset).toBeTruthy();
  expect(Buffer.from(asset.bytes)).toEqual(await fs.readFile(localImport));
  expect(sha(Buffer.from(asset.bytes))).toBe(asset.sha256);
  await c.panel.getByRole('button',{name:`Place ${asset.name}`,exact:true}).click();
  await expect.poll(async()=>(await view(a)).document.placements.some(p=>p.publishedAssetId===asset.id),{intervals:[500]}).toBe(true);
  current=await view(a);await contentConverged(current);
  expect(current.revision).toBe(3);
  const place=current.document.placements.find(p=>p.publishedAssetId===asset.id);
  expect(current.history.map(t=>t.author).sort()).toEqual(['host',b.author,c.author].sort());
  expect(current.document.native.fields[0].boundingRadius).toBeCloseTo(authorRadius,6);
  for(const x of actors){
    await expect.poll(()=>x.page.locator('.forge-model-evidence').getAttribute('data-placement-models'),{intervals:[650]}).toBe(String(initialPlacements+1));
    expect(Number(await x.page.locator('.forge-model-evidence').getAttribute('data-model-triangles'))).toBeGreaterThan(0);
  }
  latencies.push(performance.now()-began);
  mark('nativeTagSharingTested',true);mark('binaryAssetTransferTested',true);
  mark('threeAuthorNativeAcceptance',{revision:current.revision,documentSha256:sha(Buffer.from(JSON.stringify(current.document))),nativeField:'weapons/pistol/pistol.weapon:bounding_radius',assetId:asset.id,assetBytes:asset.bytes.length,actualModelsInThreeViewports:true,simultaneousAuthorActions:true});
  // A's inverse leaves B's publication and C's placement intact.
  await a.panel.getByRole('button',{name:'Undo my shared edit',exact:true}).click();
  await expect.poll(async()=>(await view(a)).document.native.fields,{intervals:[500]}).toEqual(initialFields);
  current=await view(a);expect(current.document.native.assets).toHaveLength(initialAssets+1);expect(current.document.placements).toHaveLength(initialPlacements+1);
  await expect(b.call('forge_session_reverse',{projectId:b.id,sessionId:b.session,operationId:crypto.randomUUID(),redo:false})).rejects.toThrow(/still placed/);
  await a.panel.getByRole('button',{name:'Redo my shared edit',exact:true}).click();
  await expect.poll(async()=>(await view(a)).document.native.fields[0]?.boundingRadius,{intervals:[500]}).toBe(authorRadius);
  current=await view(a);await contentConverged(current);mark('participantUndoAndReferencedAssetConflict',true);
  const base=current;
  const accepted=await update(a,base,d=>{d.native.fields[0].boundingRadius=0.4;});
  await expect(update(c,base,d=>{d.native.fields[0].boundingRadius=0.45;})).rejects.toThrow(/conflict/);
  await expect(update(b,accepted.result,d=>{d.native.assets[0].bytes[0]^=1;})).rejects.toThrow(/hash|complete|asset/i);
  await expect(update(c,accepted.result,d=>{d.native.source.fieldTag='../../unsafe.weapon';})).rejects.toThrow(/admission|unsupported/i);
  const replay=await a.call('forge_session_update',{projectId:a.id,sessionId:a.session,revision:accepted.revision,document:accepted.document,operationId:accepted.operationId});
  expect(replay.revision).toBe(accepted.result.revision);mark('sameFieldConflictCorruptBytesAndDuplicateAck',true);
  current=await view(a);await contentConverged(current);
  const beforeRole=current.revision;
  await a.call('forge_session_role',{projectId:a.id,sessionId:a.session,participantId:c.author,role:'viewer',revoke:false});
  await expect(c.call('studio_native_import',{projectId:c.id,path:localImport,name:'Viewer must not import'})).rejects.toThrow(/viewer/i);
  await expect(update(c,current,d=>{d.native.fields[0].boundingRadius=0.7;})).rejects.toThrow(/viewer/i);
  await expect(c.call('quickforge_build',{projectId:c.id})).rejects.toThrow(/owner/i);
  expect((await view(a)).revision).toBe(beforeRole);
  await a.call('forge_session_role',{projectId:a.id,sessionId:a.session,participantId:c.author,role:'editor',revoke:false});mark('permissionsCoverNativeImportEditAndBuild',true);
  await expect(a.call('build_working_tags',{projectId:a.id})).rejects.toThrow(/SparkLink.*shared source revision/);
  // Read the application's selected admission, not an older recovery directory
  // with the same immutable source identity. This is a read-only QA observation.
  const database=new DatabaseSync(path.join(a.data,'library.sqlite3'),{readOnly:true});
  let ownedSource;
  try { ownedSource=JSON.parse(database.prepare('SELECT value FROM settings WHERE key=?').get(`studio-native-source-${a.id}`).value); }
  finally { database.close(); }
  expect(ownedSource.projectId).toBe(a.id);
  expect(ownedSource.source.inventorySha256).toBe(current.document.native.source.inventorySha256);
  expect(path.resolve(ownedSource.tags).startsWith(path.resolve(a.data,'studio-native')+path.sep)).toBe(true);
  const sourceTag=path.join(ownedSource.tags,current.document.native.source.fieldTag),recoverable=await fs.readFile(sourceTag);
  try{
    await fs.writeFile(sourceTag,recoverable.subarray(0,64));
    await expect(a.call('studio_native_import',{projectId:a.id,path:localImport,name:'Must refuse changed admitted source'})).rejects.toThrow(/source changed|corrupted/i);
    expect((await view(a)).revision).toBe(current.revision);
  }finally{
    const restored=await a.call('studio_native_recover_source',{projectId:a.id,templateTagsDirectory:args.get('--template-tags')});
    expect(restored.inventorySha256).toBe(current.document.native.source.inventorySha256);
    expect(await fs.readFile(path.join(restored.tagsDirectory,current.document.native.source.fieldTag))).toEqual(recoverable);
    expect((await fs.stat(sourceTag)).size).toBe(64);
  }
  mark('nativeSourceIntegrityAndIndependentToolBuildGuard',{truncatedAdmittedTagRejected:true,exactRecoveryBytesRetained:true,unsharedWorkingTagsBuildRefused:true});
  // Keep the synchronization controller alive while A actually visits the Tag editor.
  const navigation=a.page.getByRole('button',{name:'Toggle workspace navigation',exact:true});
  if(await navigation.getAttribute('aria-expanded')!=='true')await navigation.click();
  await a.page.getByRole('button',{name:'Tag editor',exact:true}).click();
  const outside=await update(c,await view(a),d=>{d.spawns[0].name='C edit while A uses Tag editor';d.native.fields[0].boundingRadius=0.275;});
  await expect(a.panel.getByLabel('Committed pistol bounding radius')).toHaveText(String(outside.result.document.native.fields[0].boundingRadius));
  await a.page.getByRole('button',{name:/Live Studio ·/}).click();
  await contentConverged(outside.result);await expect(a.page.locator('.forge-tree-select').filter({hasText:'C edit while A uses Tag editor'})).toHaveCount(1);mark('synchronizationSurvivesWorkspaceChange',true);
  current=await view(a);
  for(let n=0;n<6;n++){
    await new Promise(resolve=>setTimeout(resolve,1100)); // Separate measurements from the rate-bound verification reads.
    const origin=await view(a),t=performance.now();const sender=actors[n%3];
    const next=await update(sender,origin,d=>{d.placements[0].position[0]=2+n*0.2;});
    await contentConverged(next.result);latencies.push(performance.now()-t);
  }
  // A fresh generated namespace retains the parent's original BSP/scenario.
  await update(a,await view(a),d=>{d.name=`c39_native_${crypto.randomUUID().slice(0,8)}`;});
  current=await view(a);await contentConverged(current);
  for(const x of actors)await saveRevision(x,current.document);
  receipt.committedRevision={sessionId:a.session,revision:current.revision,documentSha256:sha(Buffer.from(JSON.stringify(current.document))),localProjects:actors.map(x=>x.id)};
  const buildBegan=performance.now(),jobId=await a.call('quickforge_build',{projectId:a.id});
  const during=await update(c,current,d=>{d.native.fields[0].boundingRadius=0.3;d.spawns[1].name='Later than frozen native build';});
  await saveRevision(a,during.result.document);
  let built;
  await expect.poll(async()=>{const boot=await a.call('bootstrap');const failed=boot.logs.find(e=>e.jobId===jobId&&e.phase==='failed');if(failed)throw Error(failed.message);built=(await a.call('open_project',{id:a.id})).project.builds.find(b=>b.id===jobId);return built?.status;},{timeout:300000,intervals:[1500,3000]}).toBe('validated');
  const binding=JSON.parse(await fs.readFile(path.join(a.data,'jobs',jobId,'studio-binding.json'),'utf8'));
  expect(binding.sessionRevision).toBe(current.revision);expect(binding.sessionId).toBe(a.session);
  const nativeBinding=JSON.parse(await fs.readFile(path.join(a.data,'jobs',jobId,'native-source-binding.json'),'utf8'));
  expect(nativeBinding[0]).toEqual(current.document.native);
  const compiled=await a.call('open_built_map',{projectId:a.id,buildId:jobId});
  expect(compiled.inspection.header.version).toBe(13);
  const compiledAsset=compiled.inspection.tags.find(t=>t.class==='scen'&&t.path.replaceAll('\\','/')===place.tagPath);
  expect(compiledAsset).toBeTruthy();
  const compiledModel=await a.call('preview_owned_object_model',{projectId:compiled.project.id,tagId:compiledAsset.id,sourceSha256:compiled.project.source.sha256});
  expect(compiledModel.mesh.indices.length).toBeGreaterThan(0);
  const compiledPlacement=compiled.inspection.objects.find(o=>o.tagId===compiledAsset.id);
  expect(compiledPlacement).toBeTruthy();
  const frozenPlacement=current.document.placements.find(p=>p.publishedAssetId===asset.id);
  for(let i=0;i<3;i++)expect(compiledPlacement.position[i]).toBeCloseTo(frozenPlacement.position[i],5);
  const weapon=compiled.inspection.tags.find(t=>t.class==='weap'&&t.path.replaceAll('\\','/')==='weapons/pistol/pistol');
  const radius=weapon?.fields.find(f=>f.label==='Bounding radius'||f.key==='bounding_radius')?.value;
  expect(Number(radius)).toBeCloseTo(0.275,6);
  mark('actualHaloToolchain',{jobId,revision:binding.sessionRevision,laterRevision:during.result.revision,nativeRadius:Number(radius),publishedAssetPath:compiledAsset.path,compiledModelTriangles:compiledModel.mesh.indices.length/3,placement:compiledPlacement.position,outputSha256:built.sha256,durationMs:performance.now()-buildBegan,gameplayTested:false});
  current=await view(a);await contentConverged(current);
  // Loss of an actual host process; full asset bytes, semantic state and author history must survive.
  const history=await a.call('forge_studio_history',{projectId:a.id}),beforeCrash=clone(current),recoveryBegan=performance.now();
  const recoveryRecord=history.find(row=>row.sessionId===a.session);
  expect(recoveryRecord).toBeTruthy();
  await crash(a);await start(a,true);
  const recovered=await a.call('forge_studio_recover',{projectId:a.id,directoryId:recoveryRecord.directoryId,address:'127.0.0.1',displayName:a.name});
  expect(recovered.view.document).toEqual(beforeCrash.document);expect(recovered.view.revision).toBe(beforeCrash.revision);expect(recovered.sessionId).toBe(a.session);
  const fresh=await a.call('forge_session_invite',{projectId:a.id,sessionId:a.session,address:'127.0.0.1',viewer:false});expect(fresh).not.toBe(invitation);
  await a.page.reload();await a.page.locator('.map-card').filter({has:a.page.getByRole('heading',{name:a.fixture.title,exact:true})}).click();await a.call('claim_project_document',{id:a.id});await a.page.getByRole('button',{name:/Live Studio ·/}).click();a.panel=a.page.locator('.studio-panel');
  for(const x of [b,c]){const identity=x.author;await leave(x);await joinUi(x,fresh);expect(x.author).toBe(identity);}
  await contentConverged(recovered.view);
  const replayAfter=await a.call('forge_session_update',{projectId:a.id,sessionId:a.session,revision:accepted.revision,document:accepted.document,operationId:accepted.operationId});expect(replayAfter.revision).toBe(beforeCrash.revision);
  mark('durableNativeRecovery',{revision:beforeCrash.revision,assetBytesIdentical:true,semanticFieldIntact:true,authorIdentitiesAndHistoryRetained:true,newInvitation:true,replayDeduplicated:true,durationMs:performance.now()-recoveryBegan});
  await a.call('forge_session_role',{projectId:a.id,sessionId:a.session,participantId:c.author,role:'viewer',revoke:true});await expect(view(c)).rejects.toThrow(/revok|participant|credential/i);expect((await view(b)).document).toEqual(beforeCrash.document);mark('revocationRetainsOtherParticipants',true);
  for(const x of protectedInputs)expect(await sourceInventory(x.tags)).toEqual(x.hashes);
  expect(await hashFile(nativeFile)).toBe(protectedTemplateHash);expect(await hashFile(localImport)).toBe(protectedTemplateHash);
  mark('originalSourcesUnchanged',{separateNativeTrees:3,filesPerTree:Object.keys(protectedInputs[0].hashes).length,templateUnchanged:true,importUnchanged:true});
  mark('synchronizationMeasurements',{samples:latencies.length,valuesMs:latencies,physicalMachines:1,includesNativeIpcAndReactConsumption:true});
  for(const x of actors){await x.page.screenshot({path:path.join(output,`native-content-${x.slug}.png`)});}
  expect(errors).toEqual([]);receipt.pageErrors=errors;
  receipt.acceptanceComplete=true;
  await fs.writeFile(path.join(output,'sparklink-native-content-receipt.json'),JSON.stringify(receipt,null,2));
  console.log('PASS real three-process native tag, asset publication, placement, durability and Halo compilation');
} catch(error) {
  for(const x of actors)if(x.page)await x.page.screenshot({path:path.join(output,`failure-${x.slug}.png`)}).catch(()=>{});
  await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({...receipt,error:String(error),stack:error.stack,pageErrors:errors},null,2));throw error;
} finally {
  for(const x of actors){if(x.call&&x.child)await Promise.race([x.call('request_close_window').catch(()=>{}),new Promise(r=>setTimeout(r,1500))]);if(x.child?.exitCode===null)x.child.kill();if(x.browser)await Promise.race([x.browser.close().catch(()=>{}),new Promise(r=>setTimeout(r,1500))]);}
}
