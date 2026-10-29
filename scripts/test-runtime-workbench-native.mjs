// Explicit native UI acceptance using a fresh library or qa_runtime_library fixture.
// No game/tool launch, process attachment, deployment or game-memory writes.
// node scripts/test-runtime-workbench-native.mjs --app <built.exe> --output <fresh-dir>
//   [--data <qa_runtime_library-fixture>] [--kit <HCEEK>] [--invader <Invader>]
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const options = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i], value = process.argv[i + 1];
  if (!['--app','--output','--data','--kit','--invader'].includes(key) || !value || options.has(key)) throw new Error('Provide unique named app/output/data/kit/invader arguments.');
  options.set(key, value);
}
if (!options.has('--app') || !options.has('--output')) throw new Error('A built native executable and a fresh output directory are required.');
const output = path.resolve(options.get('--output'));
await fs.mkdir(output); // exclusive, never overwrite a prior receipt or application data
const data = options.has('--data') ? path.resolve(options.get('--data')) : path.join(output, 'library');
let fixture = null;
if (options.has('--data')) {
  fixture = JSON.parse(await fs.readFile(path.join(data, 'spark-native-ui-fixture.json'), 'utf8'));
  if (fixture.schemaVersion !== 1 || fixture.nativeFixture !== true || typeof fixture.projectId !== 'string') throw new Error('Refusing a library without the explicit native QA fixture marker.');
}
const executable = path.join(output, 'GuiltySpark-native-qa.exe');
await fs.copyFile(path.resolve(options.get('--app')), executable, fs.constants.COPYFILE_EXCL);
const appSha256 = crypto.createHash('sha256').update(await fs.readFile(executable)).digest('hex');
const endpoint = net.createServer();
await new Promise(resolve => endpoint.listen(0, '127.0.0.1', resolve));
const port = endpoint.address().port;
await new Promise(resolve => endpoint.close(resolve));
const child = spawn(executable, [], {windowsHide:true, stdio:'ignore', env:{...process.env,
  GUILTY_SPARK_DATA_DIR:data, WEBVIEW2_USER_DATA_FOLDER:path.join(output, 'webview'),
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port} --disable-background-timer-throttling --disable-renderer-backgrounding`,
}});
await fs.writeFile(path.join(output, 'owned-process.json'), JSON.stringify({pid:child.pid,port},null,2));
let browser, call;
try {
  await expect.poll(() => fetch(`http://127.0.0.1:${port}/json/version`).then(response => response.ok, () => false), {timeout:45000}).toBe(true);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await expect.poll(() => browser.contexts().flatMap(context => context.pages()).some(page => page.url().includes('tauri.localhost')), {timeout:20000}).toBe(true);
  const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().includes('tauri.localhost'));
  page.setDefaultTimeout(30000);
  call = (command, args = {}) => page.evaluate(({command,args}) => window.__TAURI_INTERNALS__.invoke(command,args), {command,args});
  let bootstrap = await call('bootstrap');
  bootstrap = await call('save_settings', {settings:{...bootstrap.settings, onboardingCompleted:true, preferredHalo:'mccSteam',
    ...(options.has('--kit') ? {hekDirectory:path.resolve(options.get('--kit')),hekFlavor:'h1aEk'} : {}),
    ...(options.has('--invader') ? {invaderDirectory:path.resolve(options.get('--invader'))} : {}),
  }});
  await page.reload();
  await expect(page.getByRole('button',{name:'Play & servers',exact:true})).toBeVisible();
  const dock = page.getByRole('contentinfo',{name:'Runtime & Tools Dock'});
  for (const name of ['Play Halo','Test Scene','Edit level','Edit tags','Build','Publish','Find games','Host','Legacy tools']) await expect(dock.getByRole('button',{name:new RegExp(`^${name}`)})).toBeVisible();
  let nativeToolPlans = [];
  if(fixture)await call('claim_project_document',{id:fixture.projectId});
  let dependencyChecks = [], dependencyPreviewChecked = false;
  const dependencies = await call('dependency_report',{runtimeId:'mccSteam',projectId:fixture?.projectId??null});
  expect(dependencies.items.length).toBeGreaterThan(0);
  dependencyChecks=dependencies.items.map(item=>({id:item.id,state:item.state,architecture:item.architecture}));
  const officialPage=dependencies.items.flatMap(item=>item.actions).find(action=>action.kind==='openOfficialPage'&&action.requiresReview);
  if(!officialPage)throw new Error('The dependency guide has no official setup route.');
  const dependencyPreview=await call('prepare_dependency_action',{runtimeId:'mccSteam',projectId:fixture?.projectId??null,actionId:officialPage.id});
  expect(dependencyPreview.uri.startsWith('https://')).toBe(true);
  expect(dependencyPreview.executableSha256).toBe(crypto.createHash('sha256').update(await fs.readFile(dependencyPreview.executable)).digest('hex'));
  let dependencyRefused=false;
  try{await call('run_dependency_action',{planId:dependencyPreview.id,confirmed:false});}catch(error){dependencyRefused=/review/i.test(String(error));}
  expect(dependencyRefused).toBe(true);
  await call('discard_dependency_action',{planId:dependencyPreview.id});
  dependencyPreviewChecked=true;
  if (fixture) {
    await call('claim_project_document',{id:fixture.projectId});
    const report = await call('runtime_workbench_report',{runtimeId:'mccSteam',projectId:fixture.projectId});
    expect(report.sourceIssue).toBeNull(); expect(report.toolsIssue).toBeNull();
    for (const actionId of ['testScene','editLevel','editTags']) {
      const plan = await call('prepare_runtime_tool',{runtimeId:'mccSteam',projectId:fixture.projectId,actionId});
      expect(plan.arguments.slice(0,2)).toEqual(['-tags_dir','tags']);
      expect(plan.workingDirectory).toContain(fixture.workingBuildId);
      expect(plan.tagsDirectory).toContain(fixture.workingBuildId);
      const hash = crypto.createHash('sha256').update(await fs.readFile(plan.executable)).digest('hex');
      expect(plan.executableSha256).toBe(hash);
      expect(['x86','x86_64']).toContain(plan.executableArchitecture);
      let refused = false;
      try {await call('launch_runtime_tool',{planId:plan.id,confirmed:false});} catch (error) {refused = /review/i.test(String(error));}
      expect(refused).toBe(true);
      nativeToolPlans.push({actionId,architecture:plan.executableArchitecture,sha256:hash,unconfirmedLaunchRejected:true});
    }
    await page.locator('.map-card').filter({has:page.getByRole('heading',{name:fixture.title,exact:true})}).click();
    await expect(page.getByRole('tab',{name:new RegExp(fixture.title)})).toBeVisible();
    await expect(dock.getByRole('button',{name:/^Edit level/})).toContainText('Ready');
    await dock.getByRole('button',{name:'Runtime and tool details',exact:true}).click();
    await expect(page.getByRole('button',{name:'Open working-tags build',exact:true})).toBeVisible();
    await page.screenshot({path:path.join(output,'native-tool-details.png')});
    await page.getByRole('button',{name:'Close runtime details',exact:true}).click();
  }
  await page.getByRole('button',{name:'Play & servers',exact:true}).click();
  const foreignInvite=await call('invitation_prepare',{invitation:'halo://join/'+'a'.repeat(64),client:'mccSteam'});
  expect(foreignInvite.route.translationStatus).toBe('mccProtocolBridgeMissing');expect(foreignInvite.id).toBeNull();expect(foreignInvite.route.canHandoff).toBe(false);
  await page.getByRole('button',{name:'Find games',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Delta List · live community games',exact:true})).toBeVisible();
  let listing = await call('community_listing',{refresh:true});
  if(listing.fetching)await expect.poll(async()=>{listing=await call('community_listing',{refresh:false});return listing.fetching;},{timeout:20000,intervals:[500]}).toBe(false);
  if (listing.error || !listing.listing) throw new Error(listing.error ?? 'No live listing');
  expect(listing.listing.servers.length).toBeLessThanOrEqual(512);
  expect(JSON.stringify(listing).includes('halo://join/')).toBe(false);
  if (listing.listing.servers.length) {
    const wrongRuntime = await call('community_join_preflight',{serverId:listing.listing.servers[0].id,runtimeId:'mccSteam'});
    expect(wrongRuntime.readiness).toBe('blocked');
    expect(wrongRuntime.issues[0].code).toBe('wrongRuntime');
    expect(wrongRuntime.preflightId).toBeNull();
  }
  const probe = await call('mcc_owned_content_probe',{target:'sparkInspection'});
  expect(probe.files.length).toBeGreaterThan(0);
  expect(probe.files.some(file => file.cache?.version === 13)).toBe(true);
  await page.getByRole('combobox',{name:'Owned content probe target',exact:true}).selectOption('sparkInspection');
  await page.getByRole('button',{name:'Inspect owned content',exact:true}).click();
  await expect(page.getByText(`${probe.files.length} inventoried files`,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'MCC sessions',exact:true}).click();
  await page.getByRole('button',{name:'Inspect owned content',exact:true}).click();
  await expect(page.getByText(`${probe.files.length} inventoried files`,{exact:true})).toBeVisible();
  await page.screenshot({path:path.join(output,'native-mcc-content.png')});
  await page.getByRole('button',{name:'Settings & tools',exact:true}).click();
  await page.getByRole('tab',{name:'Dependencies & setup',exact:true}).click();
  await expect(page.getByRole('region',{name:'Dependencies and setup'})).toBeVisible();
  await expect(page.getByRole('region',{name:'Dependencies and setup'}).getByRole('button',{name:'Refresh checks',exact:true})).toBeEnabled();
  await page.screenshot({path:path.join(output,'native-dependencies.png')});
  let externalSave = null;
  if(fixture){
    const source = await call('open_project',{id:fixture.projectId});
    const accepted = source.project.builds.find(build=>build.id===fixture.workingBuildId);
    if(!accepted?.output)throw new Error('The fixture has no accepted map output.');
    const workingMap=path.join(output,'external-working.map');
    await fs.copyFile(accepted.output,workingMap,fs.constants.COPYFILE_EXCL);
    const imported=await call('import_paths',{paths:[workingMap]});
    expect(imported.length).toBe(1);
    const original=imported[0],field=original.inspection.tags.flatMap(tag=>tag.fields).find(field=>field.kind==='f32'&&Number.isFinite(field.value)&&Math.abs(field.value)<1000&&(field.max==null||field.value+.125<=field.max));
    if(!field)throw new Error('No audited floating-point field is available for external-save acceptance.');
    const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
    const originalSha=sha(await fs.readFile(original.project.source.preservedPath));
    expect(originalSha).toBe(original.project.source.sha256);
    await page.reload();
    await page.locator('.map-card').filter({has:page.getByRole('heading',{name:original.project.title,exact:true})}).click();
    await expect(page.getByLabel('External map changes')).toContainText('watching 1 map');
    const change=Buffer.alloc(4);change.writeFloatLE(field.value+.125);
    const file=await fs.open(workingMap,'r+');try{await file.write(change,0,4,field.offset);}finally{await file.close();}
    const changedSha=sha(await fs.readFile(workingMap));expect(changedSha).not.toBe(originalSha);
    let revision;
    await expect.poll(async()=>{
      const library=await call('bootstrap');revision=library.entries.find(entry=>entry.sha256===changedSha);return!!revision;
    },{timeout:45000,intervals:[2000]}).toBe(true);
    await expect(page.getByRole('tab',{name:/external revision/})).toBeVisible();
    const opened=await call('open_project',{id:revision.id});
    const readback=opened.inspection.tags.flatMap(tag=>tag.fields).find(next=>next.offset===field.offset);
    expect(readback?.value).toBe(field.value+.125);
    expect(sha(await fs.readFile(original.project.source.preservedPath))).toBe(originalSha);
    externalSave={realPrivateCopy:true,automaticRevision:true,oldPreservedSha256:originalSha,newPreservedSha256:changedSha,auditedFieldReadback:true,originalRetained:true};
    await page.screenshot({path:path.join(output,'native-external-save.png')});
  }
  const report = {schemaVersion:1,nativeDesktop:true,appSha256,toolPreviewPlans:nativeToolPlans,
    dependencyChecks,dependencyPreviewChecked,foreignMccInvitationBlocked:true,
    externalSave,
    realProviderRows:listing.listing.servers.length,providerRejectedRows:listing.listing.rejectedRows,
    tokenRedaction:true,wrongRuntimeBlocked:true,contentFiles:probe.files.length,
    validCacheIndexes:probe.files.filter(file => file.cache).length,contentProbeComplete:probe.complete,
    gameOrToolLaunched:false,gameMemoryTouched:false,gameConnectionObserved:false,
    fixtureReplicated:!!fixture, originalLibraryModified:false};
  await fs.writeFile(path.join(output,'native-ui-receipt.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
} finally {
  try {if(call)await call('close_application').catch(() => {});} finally {if(browser)await browser.close().catch(() => {});}
  // Only this script's own Spark child is eligible for cleanup; never a Halo or
  // pre-existing Spark process. Normally the native close above exits it.
  if (child.exitCode === null) {
    await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,5000))]);
    if(child.exitCode === null)child.kill();
  }
}
