// Opt-in real desktop acceptance. Uses native IPC and original files read-only;
// all destination content belongs to the existing bounded disposable QA owner.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,expect} from '@playwright/test';
import {beginQaStorage,assertQaOutputPath,waitForQaExit,stopQaProcess} from './native-qa-storage.mjs';
import {chooseTool,openStudioMenu} from '../tests/ui/helpers/navigation.ts';
const [executable,output,runtimes]=process.argv.slice(2);
if(!executable||!output||!runtimes)throw Error('Choose the exact QA application, fresh output and owned Runtimes folder');
const root=await assertQaOutputPath(path.resolve(output));
const hash=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const report={schemaVersion:1,scope:'Actual desktop shared native content; no game launch or join',cases:[],errors:[],complete:false,gameplayAccepted:false,originalsUnchanged:false};
const source=path.resolve(runtimes),shared=path.join(root,'shared-content');
const originals=['OpenCE/halo.exe','OpenCEFaber/halo.exe','Chupathingy/halo.exe','Chupathingy/chupathingy.exe','Halo Custom Edition/haloce.exe','Halo Custom Edition/maps/ui.map','Halo Custom Edition/maps/bitmaps.map','Halo Custom Edition/maps/sounds.map','Halo Custom Edition/maps/loc.map','OpenCE/maps/ui.map'];
const before=Object.fromEntries(await Promise.all(originals.map(async p=>[p,await hash(path.join(source,p))])));
report.verifiedInputs=before;
report.appSha256=await hash(path.resolve(executable));
await fs.mkdir(root);
const finish=await beginQaStorage(root,{workflow:'runtime-content',appSha256:report.appSha256,reservationBytes:1536*1024**2});
const app=path.join(root,'application/GuiltySpark.exe');
let child,browser,page;
const call=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
try{
for(const name of ['application','library','webview','shared-content'])await finish.createScratch(name);
await fs.copyFile(path.resolve(executable),app,fs.constants.COPYFILE_EXCL);expect(await hash(app)).toBe(report.appSha256);
await fs.mkdir(path.join(shared,'maps'));
await fs.copyFile(path.join(source,'OpenCE/maps/ui.map'),path.join(shared,'maps/ui.map'),fs.constants.COPYFILE_EXCL);
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
 child=spawn(app,[],{windowsHide:true,stdio:'ignore',env:{...process.env,GUILTY_SPARK_DATA_DIR:path.join(root,'library'),WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port='+port}});await finish.trackProcess(child);
 await expect.poll(()=>fetch('http://127.0.0.1:'+port+'/json/version').then(r=>r.ok,()=>false),{timeout:45000}).toBe(true);
 browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('tauri.localhost'));
 if(!page)throw Error('Native application WebView unavailable');page.setDefaultTimeout(45000);
 const bootstrap=await call('bootstrap');await call('save_settings',{settings:{...bootstrap.settings,onboardingCompleted:true}});await page.reload();
 const registrations=[['ce','haloCustomEdition','Halo Custom Edition','haloce.exe',null],['upstream','openCe','OpenCE','halo.exe',shared],['faber','openCe','OpenCEFaber','halo.exe',shared],['chupa','chupathingyCe','Chupathingy','halo.exe',shared]].map(([id,runtimeId,folder,exe,dataRoot])=>({id,runtimeId,root:path.join(source,folder),executable:path.join(source,folder,exe),dataRoot,version:null,networkVersion:null}));
 for(const registration of registrations){const inspected=await call('inspect_runtime_registration',{registration});expect(inspected.validation).toBe('pass');await call('register_runtime',{registration});}
 let profiles=await call('list_runtime_registrations');expect(profiles.length).toBe(4);expect(profiles.filter(p=>p.runtimeId==='openCe').length).toBe(2);
 expect(profiles.find(p=>p.id==='chupa').executable.toLowerCase()).toContain('chupathingy.exe');
 report.cases.push({name:'Four genuine installed engine profiles coexist; exact Chupathingy launcher resolves to game',passed:true});
 const firstSetup=performance.now();
 const prepared=await call('prepare_runtime_ce_resources',{registrationId:'chupa',expectedDataRoot:shared});expect(prepared.copied.sort()).toEqual(['bitmaps.map','loc.map','sounds.map']);
 const firstSetupMs=Math.round(performance.now()-firstSetup),repeatSetup=performance.now();
 const reused=await call('prepare_runtime_ce_resources',{registrationId:'faber',expectedDataRoot:shared});expect(reused.bytesCopied).toBe(0);expect(reused.reused.length).toBe(3);
 const repeatSetupMs=Math.round(performance.now()-repeatSetup);
 for(const name of ['bitmaps.map','sounds.map','loc.map'])expect(await hash(path.join(shared,'maps_ce',name))).toBe(before['Halo Custom Edition/maps/'+name]);
 report.ceResources={firstSetupMs,repeatSetupMs,copied:prepared.copied,bytesCopied:prepared.bytesCopied,reusedByOtherEngine:reused.reused,hashes:prepared.resourceSha256};
 report.cases.push({name:'Actual CE bank indexes validate and one physical bank set is reused by Faber/Chupathingy',passed:true});
 for(const id of ['upstream','faber','chupa']){
   const registration=profiles.find(p=>p.id===id),plan=await call('inspect_runtime_launch',{registration});expect(path.resolve(plan.environment.HALO_DATA_ROOT.replace(/^\\\\\?\\/,''))).toBe(path.resolve(shared));
   if(id!=='chupa')expect(plan.environment.HALO_CUSTOM_MAPS_ROOT.toLowerCase()).toContain('maps_ce');
 }
 await chooseTool(page,'Settings & tools');await page.getByRole('group',{name:'Halo versions',exact:true}).getByRole('button',{name:/^OpenCE · Connected/}).click();
 await page.getByRole('button',{name:'Runtime folders…',exact:true}).click();
 const saved=page.getByRole('combobox',{name:'Saved engine profile',exact:true});await expect(saved).toBeVisible();await saved.selectOption('upstream');
 await expect.poll(async()=>(await call('list_runtime_registrations')).find(p=>p.runtimeId==='openCe').id).toBe('upstream');
 await openStudioMenu(page);const header=page.getByRole('combobox',{name:'Active Halo runtime',exact:true});await header.selectOption('profile:faber');
 await expect.poll(async()=>(await call('list_runtime_registrations')).find(p=>p.runtimeId==='openCe').id).toBe('faber');
 expect((await call('list_runtime_registrations')).length).toBe(4);await page.screenshot({path:path.join(root,'runtime-setup.png')});
 report.cases.push({name:'Actual Games & tools and header switch engines without launching one or losing profiles',passed:true});
 // A deliberately conflicting owned destination must not affect the original bank.
 await fs.writeFile(path.join(shared,'maps_ce/loc.map'),'deliberate QA conflict');
 let conflict=false;try{await call('prepare_runtime_ce_resources',{registrationId:'chupa',expectedDataRoot:shared});}catch(e){conflict=/not overwritten/.test(String(e));}expect(conflict).toBe(true);
 expect(await fs.readFile(path.join(shared,'maps_ce/loc.map'),'utf8')).toBe('deliberate QA conflict');
 report.cases.push({name:'Native setup refuses a different existing bank and preserves it',passed:true});
 // Read the real provider only; never hand an invitation to a game.
 let listing=await call('community_listing',{refresh:true});for(let i=0;i<30&&listing.fetching;i++){await new Promise(r=>setTimeout(r,500));listing=await call('community_listing',{refresh:false});}
 const match=listing.listing?.servers?.find(s=>s.map.family==='xbox'&&s.map.name==='bloodgulch'&&!s.map.pack);
 if(match){
  const map=path.join(source,'OpenCE/maps/bloodgulch.map'),originalHash=await hash(map);const [opened]=await call('import_paths',{paths:[map]});
  const selected=(await call('list_runtime_registrations')).find(p=>p.runtimeId==='openCe');
  const identity=await call('inspect_runtime_registration',{registration:selected});
  const installArgs={serverId:match.id,runtimeId:'openCe',projectId:opened.project.id,expectedRegistrationId:selected.id,expectedDataRoot:shared,expectedExecutableSha256:identity.executableSha256};
  let stale=false;try{await call('install_downloaded_community_map',{...installArgs,expectedRegistrationId:'upstream'});}catch(e){stale=/selected engine or content folder changed/.test(String(e));}expect(stale).toBe(true);
  expect(await fs.stat(path.join(shared,'maps/bloodgulch.map')).then(()=>true,()=>false)).toBe(false);
  report.cases.push({name:'Stale engine binding refuses map setup before publishing any map',passed:true});
  const result=await call('install_downloaded_community_map',installArgs);expect(result.sha256).toBe(originalHash);
  expect(await hash(path.join(shared,result.relativePath))).toBe(originalHash);expect(await hash(map)).toBe(originalHash);
  expect((await call('install_downloaded_community_map',installArgs)).reused).toBe(true);
  report.cases.push({name:'Real advertised map setup admits a native imported source and reuses identical bytes without joining',passed:true,sourceSha256:originalHash});
 }else report.providerMapSetup={status:'blocked',reason:'No compatible owned Blood Gulch map was in the current real listing; no server data was invented'};
 for(const [p,h]of Object.entries(before))expect(await hash(path.join(source,p))).toBe(h);
 report.originalsUnchanged=true;report.complete=true;
}catch(e){report.errors.push(String(e));process.exitCode=1;await page?.screenshot({path:path.join(root,'runtime-failure.png')}).catch(()=>{});}
finally{
 if(page&&!page.isClosed())try{await call('close_application',{decision:'discard'});if(child)await waitForQaExit(child);}catch{}
 await browser?.close().catch(()=>{});if(child?.exitCode===null)await stopQaProcess(child);if(child)await waitForQaExit(child);
 await fs.writeFile(path.join(root,'acceptance.json'),JSON.stringify(report,null,2));const cleanup=await finish(report.complete?'passed':'failed');report.storage={status:cleanup.status,disposedBytes:cleanup.disposedBytes,postCleanup:cleanup.postCleanup,evidenceOverBudget:cleanup.evidenceOverBudget};
 await fs.writeFile(path.join(root,'acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
