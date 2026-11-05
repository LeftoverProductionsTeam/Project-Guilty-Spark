import { assertQaOutputPath } from './native-qa-storage.mjs';
// Explicit owned Windows acceptance: actual IPC, registered runtimes and native
// map imports. No mock bridge, original game writes or gameplay-success claim.
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {chromium,expect} from '@playwright/test';
import {chooseTool,openDrawer} from '../tests/ui/helpers/navigation.ts';

const args=new Map();
for(let i=2;i<process.argv.length;i+=2){
  if(!['--app','--data','--output','--mcc','--ce','--opence','--chupa','--kit','--invader','--sdk','--scene-lifecycle'].includes(process.argv[i])||!process.argv[i+1]||args.has(process.argv[i]))throw Error('Provide each named argument once');
  args.set(process.argv[i],process.argv[i]==='--scene-lifecycle'?process.argv[i+1]:path.resolve(process.argv[i+1]));
}
if(args.size!==(args.has('--scene-lifecycle')?11:10)||args.has('--scene-lifecycle')&&args.get('--scene-lifecycle')!=='true')throw Error('Required: --app --data --output --mcc --ce --opence --chupa --kit --invader --sdk; optional --scene-lifecycle true launches an owned Standalone preview');
const output=args.get('--output'),data=args.get('--data');
await fs.mkdir(await assertQaOutputPath(output));
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const hash=async file=>digest(await fs.readFile(file));
const executable=path.join(output,'GuiltySpark-source-contract.exe');
await fs.copyFile(args.get('--app'),executable,fs.constants.COPYFILE_EXCL);
const endpoint=net.createServer();await new Promise(resolve=>endpoint.listen(0,'127.0.0.1',resolve));
const port=endpoint.address().port;await new Promise(resolve=>endpoint.close(resolve));
const child=spawn(executable,[],{windowsHide:true,stdio:'ignore',env:{...process.env,GUILTY_SPARK_DATA_DIR:data,WEBVIEW2_USER_DATA_FOLDER:path.join(output,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
const result={schemaVersion:1,kind:'native-runtime-source-contract',appSha256:await hash(executable),mockBridge:false,originalFilesUnchanged:false,gameplayVerified:false,maps:[],errors:[]};
let browser,page;
const invoke=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
const originals=[];
try{
  await expect.poll(()=>fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.ok,()=>false),{timeout:60000}).toBe(true);
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await expect.poll(()=>{page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('tauri.localhost'));return !!page;},{timeout:30000}).toBe(true);
  page.setDefaultTimeout(60000);page.on('pageerror',error=>result.errors.push(String(error)));
  const boot=await invoke('bootstrap');
  await invoke('save_settings',{settings:{...boot.settings,onboardingCompleted:true,autoBuild:false,preferredHalo:'mccSteam',mccDirectory:args.get('--mcc'),hekFlavor:'h1aEk',hekDirectory:args.get('--kit'),hekTagsDirectory:args.get('--sdk'),invaderDirectory:args.get('--invader'),resourceDirectory:null}});
  for(const [runtimeId,key,name] of [['haloCustomEdition','--ce','haloce.exe'],['openCe','--opence','halo.exe'],['chupathingyCe','--chupa','halo.exe']]){
    const root=args.get(key);
    await invoke('register_runtime',{registration:{id:crypto.randomUUID(),runtimeId,root,executable:path.join(root,name),dataRoot:root,version:null,networkVersion:null}});
  }
  // A genuine CE cache in an isolated OpenCE custom_maps directory proves
  // installation provenance is independent of its native CE format. It also
  // exercises the same folder list used by normal runtime inventory.
  const customRoot=path.join(output,'owned-opence-custom');
  await fs.mkdir(path.join(customRoot,'custom_maps'),{recursive:true});
  await fs.copyFile(path.join(args.get('--opence'),'halo.exe'),path.join(customRoot,'halo.exe'),fs.constants.COPYFILE_EXCL);
  const customMap=path.join(customRoot,'custom_maps','bloodgulch.map');
  await fs.copyFile(path.join(args.get('--ce'),'maps/bloodgulch.map'),customMap,fs.constants.COPYFILE_EXCL);
  let catalog=await invoke('discover_asset_sources');
  await fs.writeFile(path.join(output,'asset-catalog.json'),JSON.stringify(catalog,null,2));
  if(!Array.isArray(catalog.maps))throw Error('Native asset catalog shape changed');
  const cases=[['mccSteam',path.join(args.get('--mcc'),'halo1/maps/bloodgulch.map'),13],['haloCustomEdition',path.join(args.get('--ce'),'maps/bloodgulch.map'),609],['openCe',path.join(args.get('--opence'),'maps/a10.map'),5],['chupathingyCe',path.join(args.get('--chupa'),'maps/a10.map'),5],['custom_maps',customMap,609]];
  for(const [runtimeId,file,version] of cases){
    if(runtimeId==='custom_maps'){
      await invoke('register_runtime',{registration:{id:crypto.randomUUID(),runtimeId:'openCe',root:customRoot,executable:path.join(customRoot,'halo.exe'),dataRoot:customRoot,version:null,networkVersion:null}});
      catalog=await invoke('discover_asset_sources');
      await fs.writeFile(path.join(output,'custom-asset-catalog.json'),JSON.stringify(catalog,null,2));
    }
    const before=await hash(file);originals.push({file,sha256:before});
    const canonical=await fs.realpath(file),native=canonical.startsWith('\\\\?\\')?canonical:'\\\\?\\'+canonical;
    const ids=[canonical,native].map(value=>digest(Buffer.from(value.toLowerCase())));
    const candidate=catalog.maps.find(item=>ids.includes(item.id));
    if(!candidate)throw Error('Registered runtime map was absent from discovery: '+file);
    const [open]=await invoke('open_asset_source',{sourceId:candidate.id,preparePreviewResources:false});
    const facts=await invoke('inspect_map_source',{projectId:open.project.id});
    expect(facts.source.sha256).toBe(before);expect(facts.source.cacheVersion).toBe(version);
    expect(facts.contract.cacheVersion).toBe(version);expect(open.inspection.header.version).toBe(version);
    expect(facts.runtimeInstallations.find(item=>item.runtimeId==='mccSteam').cacheFamilyMatches).toBe(version===13);
    expect(facts.contract.compilationTargets[0].status).toBe(version===5?'unsupported':'requiresPreflight');
    const descriptor=await invoke('open_project',{id:open.project.id});
    expect(descriptor.project.source.sha256).toBe(before);
    // Changing all four hosting preferences cannot retarget a native parser.
    for(const selected of ['mccSteam','haloCustomEdition','openCe','chupathingyCe']){
      // Exercise the production store's cross-window storage notification.
      await page.evaluate(({id,selected})=>{const key='guilty-spark-map-session-v1:'+id,oldValue=localStorage.getItem(key),value=JSON.parse(oldValue??'{}');value['hosting.runtime']=selected;const newValue=JSON.stringify(value);localStorage.setItem(key,newValue);window.dispatchEvent(new StorageEvent('storage',{key,oldValue,newValue,storageArea:localStorage}));},{id:open.project.id,selected});
      const next=await invoke('inspect_map_source',{projectId:open.project.id});
      expect(next.source).toEqual(facts.source);expect(next.contract).toEqual(facts.contract);
    }
    result.maps.push({runtimeId,file,projectId:open.project.id,sourceSha256:before,cacheVersion:version,contract:facts.contract,origin:facts.runtimeOrigin,installations:facts.runtimeInstallations,readback:facts.readback,resources:facts.source.resourceSha256,hostingIndependent:true});
  }
  const custom=result.maps.find(item=>item.runtimeId==='custom_maps');
  // Hash-based import reuse intentionally retains the first original path.
  // Open the custom candidate in a separate fresh library to test origin;
  // this run instead checks that reuse never relabels the CE source as Xbox.
  expect(custom.contract.edition).toBe('Halo Custom Edition cache');
  expect(custom.installations.some(item=>item.runtimeId==='openCe'&&item.cacheFamilyMatches)).toBe(true);
  result.customFolderDiscovered=true;
  const fixture=JSON.parse(await fs.readFile(path.join(data,'spark-conversion-ui-fixture.json'),'utf8'));
  result.conversionSource=await invoke('inspect_map_source',{projectId:fixture.projectId});
  result.workbench=await invoke('runtime_workbench_report',{runtimeId:'mccSteam',projectId:fixture.projectId});
  result.readiness=await invoke('launch_readiness',{id:fixture.projectId});
  result.metadataTemplate=await invoke('inspect_template',{id:fixture.projectId}).catch(error=>({blocked:String(error)}));
  await page.reload();await page.waitForLoadState('domcontentloaded');
  const mapCard=page.locator('.map-card').filter({has:page.getByRole('heading',{name:fixture.title,exact:true})}).filter({has:page.getByText('CACHE 609',{exact:true})}).first();
  await mapCard.click();
  await expect(page.locator('.runtime-dock-heading>span').first()).toHaveText(fixture.title);
  await expect(page.locator('.runtime-dock-save')).not.toHaveText('Working…');
  await chooseTool(page,'Tag editor');
  await expect(page.locator('.tag-browser')).toBeVisible();
  await openDrawer(page,'Project setup');
  const tools=page.locator('.gs-map-tools');
  if(await tools.getAttribute('open')===null)await tools.locator(':scope>summary').click();
  const identity=page.locator('.gs-source-identity');
  if(await identity.getAttribute('open')===null)await identity.locator(':scope>summary').click();
  await expect(identity).toContainText(fixture.sourceSha256);
  await expect(identity).toContainText('Halo Custom Edition cache');
  result.sourcePanelVerified=true;
  await page.screenshot({path:path.join(output,'native-tag-workspace.png')});
  if(args.get('--scene-lifecycle')==='true'){
    const plan=await invoke('prepare_runtime_tool',{runtimeId:'mccSteam',projectId:fixture.projectId,actionId:'testScene'});
    expect(plan.resources.map(r=>r.relativePath)).toEqual(['shaders/fx.bin','shaders/psh.bin','shaders/vsh.bin']);
    const preview=await invoke('launch_runtime_tool',{planId:plan.id,confirmed:true});
    const alive=()=>{try{process.kill(preview.processId,0);return true;}catch{return false;}};
    await expect.poll(alive).toBe(true);
    for(const pin of plan.resources)expect(await hash(path.join(plan.workingDirectory,pin.relativePath))).toBe(pin.sha256);
    await invoke('plugin:window|close',{label:'main'}).catch(()=>{});
    await expect.poll(alive,{timeout:15000}).toBe(false);
    result.sceneLifecycle={executableSha256:preview.executableSha256,resources:plan.resources,launched:true,stoppedWhenOwningWindowClosed:true,gameplayVerified:false};
  }
  for(const input of originals)expect(await hash(input.file)).toBe(input.sha256);
  result.originalFilesUnchanged=true;
}catch(error){result.errors.push(String(error));if(browser)result.browserTargets=browser.contexts().flatMap(c=>c.pages()).map(p=>p.url());process.exitCode=1;}finally{
  result.completedAt=new Date().toISOString();
  await fs.writeFile(path.join(output,'acceptance.json'),JSON.stringify(result,null,2));
  if(browser)await browser.close().catch(()=>{});
  if(child.exitCode===null)child.kill();
}
console.log(JSON.stringify({maps:result.maps.length,originalFilesUnchanged:result.originalFilesUnchanged,gameplayVerified:false,errors:result.errors}));
