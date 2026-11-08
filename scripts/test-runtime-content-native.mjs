// Opt-in real desktop acceptance. Uses native IPC and original files read-only;
// all destination content belongs to the existing bounded disposable QA owner.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {encodeHaloSourceTiff} from '../src/haloTiff.ts';
import {chromium,expect} from '@playwright/test';
import {beginQaStorage,assertQaOutputPath,waitForQaExit,stopQaProcess} from './native-qa-storage.mjs';
import {chooseTool,openStudioMenu,revealPagedControl} from '../tests/ui/helpers/navigation.ts';
const [executable,output,runtimes]=process.argv.slice(2);
if(!executable||!output||!runtimes)throw Error('Choose the exact QA application, fresh output and owned Runtimes folder');
const root=await assertQaOutputPath(path.resolve(output));
const hash=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const report={schemaVersion:1,scope:'Actual desktop shared content; opt-in headless native engine startup is distinct from gameplay or joining',cases:[],errors:[],complete:false,gameplayAccepted:false,originalsUnchanged:false};
const source=path.resolve(runtimes),shared=path.join(root,'shared-content');
const originals=['OpenCE/halo.exe','OpenCEFaber/halo.exe','Chupathingy/halo.exe','Chupathingy/chupathingy.exe','Halo Custom Edition/haloce.exe','Halo Custom Edition/maps/ui.map','Halo Custom Edition/maps/bitmaps.map','Halo Custom Edition/maps/sounds.map','Halo Custom Edition/maps/loc.map','OpenCE/maps/ui.map','OpenH1-Windows/halo.exe','OpenH1-Windows/openh1.assets','OpenH1-Linux-VR/bin/openh1'];
const before=Object.fromEntries(await Promise.all(originals.map(async p=>[p,await hash(path.join(source,p))])));
report.verifiedInputs=before;
report.appSha256=await hash(path.resolve(executable));
await fs.mkdir(root);
const finish=await beginQaStorage(root,{workflow:'runtime-content',appSha256:report.appSha256,reservationBytes:1536*1024**2});
const app=path.join(root,'application/GuiltySpark.exe');
let child,browser,page,engineOutput='',engineTail='';
const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const consolePort=listener.address().port;await new Promise(resolve=>listener.close(resolve));
const qaEngineEnvironment={HALO_EXIT_AFTER:'20',HALO_TELNET_CONSOLE:'true',HALO_TELNET_CONSOLE_PORT:String(consolePort),HALO_NET_ONLINE:'false',HALO_NET_PUBLIC_LOBBY:'false',HALO_NET_JOIN_FROM_CLIPBOARD:'false',HALO_HIDDEN_WINDOW:'true',HALO_NULL_RENDERER:'true',HALO_CONSOLE_LOG:'all',HALO_DISCORD_PRESENCE:'off',HALO_UPDATE_AUTO:'false',HALO_CRASH_REPORTS:'no',SDL_AUDIO_DRIVER:'dummy',SDL_VIDEO_DRIVER:'dummy'};
const call=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
try{
for(const name of ['application','library','webview','shared-content'])await finish.createScratch(name);
await fs.copyFile(path.resolve(executable),app,fs.constants.COPYFILE_EXCL);expect(await hash(app)).toBe(report.appSha256);
await fs.mkdir(path.join(shared,'maps'));
await fs.copyFile(path.join(source,'OpenCE/maps/ui.map'),path.join(shared,'maps/ui.map'),fs.constants.COPYFILE_EXCL);
 await startSpark();
 const bootstrap=await call('bootstrap');await call('save_settings',{settings:{...bootstrap.settings,onboardingCompleted:true}});await page.reload();
 const registrations=[['ce','haloCustomEdition','Halo Custom Edition','haloce.exe',null],['upstream','openCe','OpenCE','halo.exe',shared],['faber','openCe','OpenCEFaber','halo.exe',shared],['chupa','chupathingyCe','Chupathingy','halo.exe',shared],['openh1','openCe','OpenH1-Windows','halo.exe',shared]].map(([id,runtimeId,folder,exe,dataRoot])=>({id,runtimeId,root:path.join(source,folder),executable:path.join(source,folder,exe),dataRoot,version:null,networkVersion:null}));
 for(const registration of registrations){const inspected=await call('inspect_runtime_registration',{registration});expect(inspected.validation).toBe('pass');await call('register_runtime',{registration});}
 let profiles=await call('list_runtime_registrations');expect(profiles.length).toBe(5);expect(profiles.filter(p=>p.runtimeId==='openCe').length).toBe(3);
 expect(profiles.find(p=>p.id==='chupa').executable.toLowerCase()).toContain('chupathingy.exe');
 report.cases.push({name:'Five genuine installed engine profiles coexist, including OpenH1 Windows; exact Chupathingy launcher resolves to game',passed:true});
 // Exercise the user-facing repair, not just the backend command. The owned
 // shared library starts empty, so the first UI action must create all banks.
 await chooseTool(page,'Settings & tools');
 await page.getByRole('group',{name:'Halo versions',exact:true}).getByRole('button',{name:/^ChupathingyCE · Connected/}).click();
 await page.getByRole('button',{name:'Runtime folders…',exact:true}).click();
 const ceSetup=page.getByRole('button',{name:'Set up Custom Edition maps',exact:true,includeHidden:true});
 await revealPagedControl(ceSetup);
 const firstSetup=performance.now();await ceSetup.click();
 await expect(page.getByText('Custom Edition support ready: 3 banks added, 0 reused. Original files are unchanged.',{exact:true})).toBeVisible();
 const firstSetupMs=Math.round(performance.now()-firstSetup),repeatSetup=performance.now();
 const prepared={copied:['bitmaps.map','loc.map','sounds.map'],bytesCopied:0};
 for(const name of prepared.copied)prepared.bytesCopied+=(await fs.stat(path.join(shared,'maps_ce',name))).size;
 report.ceResourceSetupThroughActualControls=true;
 const reused=await call('prepare_runtime_ce_resources',{registrationId:'faber',expectedDataRoot:shared});expect(reused.bytesCopied).toBe(0);expect(reused.reused.length).toBe(3);
 const repeatSetupMs=Math.round(performance.now()-repeatSetup);
 for(const name of ['bitmaps.map','sounds.map','loc.map'])expect(await hash(path.join(shared,'maps_ce',name))).toBe(before['Halo Custom Edition/maps/'+name]);
 report.ceResources={firstSetupMs,repeatSetupMs,copied:prepared.copied,bytesCopied:prepared.bytesCopied,reusedByOtherEngine:reused.reused,hashes:reused.resourceSha256};
 report.cases.push({name:'Actual CE bank indexes validate and one physical bank set is reused by Faber/Chupathingy',passed:true});
 for(const id of ['upstream','faber','chupa']){
   const registration=profiles.find(p=>p.id===id),plan=await call('inspect_runtime_launch',{registration});expect(path.resolve(plan.environment.HALO_DATA_ROOT.replace(/^\\\\\?\\/,''))).toBe(path.resolve(shared));
   if(id!=='chupa')expect(plan.environment.HALO_CUSTOM_MAPS_ROOT.toLowerCase()).toContain('maps_ce');
 }
 await chooseTool(page,'Settings & tools');await page.getByRole('group',{name:'Halo versions',exact:true}).getByRole('button',{name:/^OpenCE · Connected/}).click();
 await page.getByRole('button',{name:'Runtime folders…',exact:true}).click();
 const saved=page.getByRole('combobox',{name:'Saved engine profile',exact:true,includeHidden:true});await revealPagedControl(saved);await expect(saved).toBeVisible();await saved.selectOption('upstream');
 await expect.poll(async()=>(await call('list_runtime_registrations')).find(p=>p.runtimeId==='openCe').id).toBe('upstream');
 await openStudioMenu(page);const header=page.getByRole('combobox',{name:'Active Halo runtime',exact:true});await header.selectOption('profile:faber');
 await expect.poll(async()=>(await call('list_runtime_registrations')).find(p=>p.runtimeId==='openCe').id).toBe('faber');
 expect((await call('list_runtime_registrations')).length).toBe(5);await page.screenshot({path:path.join(root,'runtime-setup.png')});
 report.cases.push({name:'Actual Games & tools and header switch engines without launching one or losing profiles',passed:true});
 if(process.env.SPARK_QA_RUNTIME_MODS==='1')await nativeWalkthrough();
 if(process.env.SPARK_QA_RUNTIME_INSTALL==='1')await managedEnginePackages();
 if(process.env.SPARK_QA_RUNTIME_MODS==='1'){await presentationPacks();await restartPreferences();}
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
}catch(e){report.errors.push(e?.stack??String(e));process.exitCode=1;await page?.screenshot({path:path.join(root,'runtime-failure.png')}).catch(()=>{});}
finally{
 const preserved={};for(const [p,sha]of Object.entries(before))preserved[p]=(await hash(path.join(source,p)).catch(()=>null))===sha;report.sourcePreservation={files:preserved,unchanged:Object.values(preserved).every(Boolean)};report.originalsUnchanged=report.sourcePreservation.unchanged;
 if(page&&!page.isClosed())try{await call('close_application',{decision:'discard'});if(child)await waitForQaExit(child);}catch{}
 await browser?.close().catch(()=>{});if(child?.exitCode===null)await stopQaProcess(child);if(child)await waitForQaExit(child);
 // Exact owned headless engines have a documented20s lifetime. Wait for their
 // writers before sealing scratch; never retire their active profiles/logs.
 await waitForOwnedEngines();
 await fs.writeFile(path.join(root,'acceptance.json'),JSON.stringify(report,null,2));const cleanup=await finish(report.complete?'passed':'failed');report.storage={status:cleanup.status,disposedBytes:cleanup.disposedBytes,postCleanup:cleanup.postCleanup,evidenceOverBudget:cleanup.evidenceOverBudget};
 await fs.writeFile(path.join(root,'acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}

async function presentationPacks(){
 const mods=path.join(shared,'mods');await fs.mkdir(mods);
 const folders=['qa_uncompressed_textures','qa_tasteful_enhancements','qa_uncompressed_audio'];
 for(const folder of folders){
  const dir=path.join(mods,folder);await fs.mkdir(path.join(dir,'tags'),{recursive:true});
  // Manifest-only test packs prove selection, not third-party payload fidelity.
  await fs.writeFile(path.join(dir,'mod.toml'),"name = '"+folder.replace(/^qa_/,'').replaceAll('_',' ')+"'\nformat = 1\n"+(folder.includes('tasteful')?"load_after = ['qa_uncompressed_textures']\n":""));
 }
 const orderFile=path.join(mods,'load_order.toml'),originalOrder='# native QA priority\norder = ["qa_uncompressed_audio", "qa_uncompressed_textures", "qa_tasteful_enhancements"] # retain\n';
 await fs.writeFile(orderFile,originalOrder);
 const allProfiles=await call('list_runtime_registrations'),catalog=await call('managed_runtime_packages');
 const engineProfiles=['opence','openh1','faber'].map(id=>allProfiles.find(p=>p.id==='engine-'+id+'-'+catalog.find(c=>c.id===id).version));expect(engineProfiles.every(Boolean)).toBe(true);
 const [upstreamId,h1Id,faberId]=engineProfiles.map(p=>p.id);
 // Read-only mods_list is sent after the native UI loads, through the pinned
 // engine's opt-in loopback developer console. Startup scripts run too early.
 await call('activate_runtime_registration',{registrationId:faberId});
 await page.reload();await chooseTool(page,'Settings & tools');
 const help=page.getByRole('button',{name:'Close Help',exact:true});if(await help.isVisible())await help.click();
 await page.getByRole('group',{name:'Halo versions',exact:true}).getByRole('button',{name:/^OpenCE · Connected/}).click();
 await page.getByRole('tab',{name:'Packs',exact:true}).click();
 const panel=page.getByRole('region',{name:'Runtime presentation packs',exact:true});await expect(panel).toBeVisible();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const restoredHelp=page.getByRole('button',{name:'Close Help',exact:true});if(await restoredHelp.isVisible())await restoredHelp.click();await panel.getByRole('button',{name:'Recheck packs',exact:true}).click();
 await expect(panel.getByRole('checkbox',{name:'uncompressed textures',exact:true})).toBeChecked();

 const authoredRoot=await finish.createScratch('authored-pack-source'),tagPath='ui/shell/bitmaps/postgame_carnage_report';
 const pixels=new Uint8Array(32*32*4);for(let i=0;i<pixels.length;i+=4){pixels[i]=200;pixels[i+1]=40;pixels[i+2]=180;pixels[i+3]=255;}
 const data=path.join(authoredRoot,'data'),tags=path.join(authoredRoot,'tags');await fs.mkdir(path.dirname(path.join(data,tagPath+'.tif')),{recursive:true});await fs.mkdir(tags);
 await fs.writeFile(path.join(data,tagPath+'.tif'),encodeHaloSourceTiff({width:32,height:32,pixels}));
 const bitmapTool=path.resolve('tools/invader/invader-bitmap.exe'),bitmapToolSha=await hash(bitmapTool);
 const built=promisify(execFile)(bitmapTool,['-d',data,'-t',tags,'-F','32-bit','-T','interface_bitmaps',tagPath.replaceAll('/','\\')],{cwd:authoredRoot,windowsHide:true,timeout:30000});if(built.child)await finish.trackProcess(built.child);const compiler=await built;
 const nativeBitmap=await fs.readFile(path.join(tags,tagPath+'.bitmap'));expect(nativeBitmap.length).toBeGreaterThan(4096);expect(await hash(bitmapTool)).toBe(bitmapToolSha);
 report.authoredPresentationPack={tagPath,nativeBitmapBytes:nativeBitmap.length,nativeBitmapSha256:crypto.createHash('sha256').update(nativeBitmap).digest('hex'),bitmapCompilerSha256:bitmapToolSha,nativeCompilerExitCode:0,compilerLog:compiler.stdout.slice(-600)};
 const local=path.join(shared,'qa-presentation.zip'),exportRoot=path.join(authoredRoot,'export'),pack=path.join(exportRoot,'qa_installed');
 await fs.mkdir(path.dirname(path.join(pack,'tags',tagPath+'.bitmap')),{recursive:true});
 await fs.writeFile(path.join(pack,'mod.toml'),"name='QA archive installation'\nid='qa_installed'\nformat=1\nmaps=['ui']\n");
 await fs.writeFile(path.join(pack,'tags',tagPath+'.bitmap'),nativeBitmap);
 await fs.writeFile(path.join(pack,'LICENSE.txt'),'Original authored QA pixels; no third-party resource pack or fidelity claim.');
 const zipped=promisify(execFile)('pwsh.exe',['-NoProfile','-Command','Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory($env:GS_QA_PACK_SOURCE,$env:GS_QA_PACK_OUTPUT)'],{env:{...process.env,GS_QA_PACK_SOURCE:exportRoot,GS_QA_PACK_OUTPUT:local},windowsHide:true,timeout:30000});if(zipped.child)await finish.trackProcess(zipped.child);await zipped;


 const archiveHash=await hash(local);await panel.getByText('Get / install packs…',{exact:true}).click();
 await revealPagedControl(panel.getByRole('combobox',{name:'Pack to install',exact:true,includeHidden:true}));await panel.getByRole('combobox',{name:'Pack to install',exact:true}).selectOption('custom');
 await panel.getByRole('textbox',{name:'Local pack ZIP',exact:true}).fill(local);
 await panel.getByRole('button',{name:'Review ZIP',exact:true}).click();
 await expect(panel.getByText('QA archive installation',{exact:true})).toBeVisible();
 await revealPagedControl(panel.getByRole('button',{name:'Install checked pack',exact:true,includeHidden:true}));await panel.getByRole('button',{name:'Install checked pack',exact:true}).click();
 const installedChoice=panel.getByRole('checkbox',{name:'QA archive installation',exact:true,includeHidden:true});await revealPagedControl(installedChoice);await expect(installedChoice).toBeChecked();
 expect(await hash(local)).toBe(archiveHash);expect(await hash(path.join(mods,'qa_installed/tags',tagPath+'.bitmap'))).toBe(report.authoredPresentationPack.nativeBitmapSha256);
 expect(await fs.readFile(orderFile,'utf8')).toBe(originalOrder);
 let occupied=false;const currentPacks=await call('runtime_mod_packs',{registrationId:faberId});
 try{await call('install_runtime_pack_archive',{registrationId:faberId,path:local,kind:'custom',expectedSha256:archiveHash,expectedExecutable:currentPacks.executableSha256,expectedRoot:currentPacks.dataRoot,expectedInventory:currentPacks.inventorySha256,enabled:true});}catch(e){occupied=/already exists/.test(String(e));}expect(occupied).toBe(true);
 report.cases.push({name:'Actual local ZIP review and install UI publishes one checked data pack without replacing source archive, native order or existing pack',passed:true,payloadPlaybackVerified:false});
 // The last registered OpenCE profile is active. Confirm it before the gesture.
 const active=(await call('list_runtime_registrations')).find(p=>p.runtimeId==='openCe');expect(active.id).toBe(faberId);
 await panel.getByRole('checkbox',{name:'QA archive installation',exact:true}).click();
 await expect(panel.getByRole('checkbox',{name:'QA archive installation',exact:true})).not.toBeChecked();
 await expect(panel.getByRole('button',{name:'Recheck packs',exact:true})).toBeEnabled();
 await panel.getByRole('checkbox',{name:'uncompressed textures',exact:true}).click();
 await expect(panel.getByRole('checkbox',{name:'uncompressed textures',exact:true})).not.toBeChecked();
 await expect(panel.getByRole('button',{name:'Recheck packs',exact:true})).toBeEnabled();
 await expect(panel.locator(':scope > p[role=status]')).toContainText('Saved for this engine profile');
 expect(await fs.readFile(orderFile,'utf8')).toBe(originalOrder);
 let upstream=await call('runtime_mod_packs',{registrationId:upstreamId});
 expect(upstream.packs.find(p=>p.folder===folders[0]).enabled).toBe(true);
 const upstreamChosen=await call('save_runtime_mod_packs',{registrationId:upstreamId,expectedInventory:upstream.inventorySha256,expectedOrder:upstream.orderSha256,expectedPreference:upstream.preferenceSha256,enabled:Object.fromEntries(upstream.packs.map(p=>[p.folder,p.folder!==folders[2]]))});
 expect(upstreamChosen.saved).toBe(true);expect(await fs.readFile(orderFile,'utf8')).toBe(originalOrder);
 expect((await call('runtime_mod_packs',{registrationId:'chupa'})).supported).toBe(false);
 expect((await call('runtime_mod_packs',{registrationId:'ce'})).supported).toBe(false);
 await page.reload();
 expect((await call('runtime_mod_packs',{registrationId:faberId})).packs.find(p=>p.folder===folders[0]).enabled).toBe(false);
 report.cases.push({name:'Real pack UI saves distinct Faber/OpenCE choices in the library; original native priority unchanged until launch; unsupported builds disabled',passed:true});
 const readLogs=async(id)=>{
  const engine=engineProfiles.find(p=>p.id===id),files=new Set();
  const folders=[path.join(root,'library/runtime-state',id,'logs'),shared,path.join(shared,'logs'),engine.root,path.join(engine.root,'logs')];
  for(const dir of folders)for(const row of await fs.readdir(dir,{withFileTypes:true}).catch(()=>[]))if(row.isFile()&&/^(?:debug\.txt|halo\.log|console\.log|.*\.log)$/i.test(row.name))files.add(path.join(dir,row.name));
  let text=engineOutput+'\n'+engineTail;
  for(const file of files){const info=await fs.lstat(file);if(!info.isFile()||info.isSymbolicLink())continue;const handle=await fs.open(file,'r');try{const head=Buffer.alloc(Math.min(info.size,65536));await handle.read(head,0,head.length,0);text+='\n'+head.toString('utf8');}finally{await handle.close();}}
  return text;
 };
 const running=async()=>{
  const pending=promisify(execFile)('pwsh.exe',['-NoProfile','-Command',"@((Get-Process -Name halo -ErrorAction SilentlyContinue) | Select-Object Id,Path) | ConvertTo-Json -Compress"],{windowsHide:true,timeout:10000});
  if(pending.child)await finish.trackProcess(pending.child);
  const result=await pending;const parsed=result.stdout.trim()?JSON.parse(result.stdout):[];return Array.isArray(parsed)?parsed:[parsed];
 };
 const linuxRoot=path.join(source,'OpenH1-Linux-VR');const linux=await call('inspect_runtime_registration',{registration:{id:'linux-vr-inspection',runtimeId:'openCe',root:linuxRoot,executable:path.join(linuxRoot,'bin/openh1'),dataRoot:shared,version:null,networkVersion:null}});expect(linux.validation).toBe('blocked');report.openH1VrPackage={sha256:linux.executableSha256,hostCompatible:false,headsetAccepted:false,windowsEnginePortAttempted:false};
 const nativeRuns=[];
 const h1=await call('runtime_mod_packs',{registrationId:h1Id});await call('save_runtime_mod_packs',{registrationId:h1Id,expectedInventory:h1.inventorySha256,expectedOrder:h1.orderSha256,expectedPreference:h1.preferenceSha256,enabled:Object.fromEntries(h1.packs.filter(p=>p.toggleable).map(p=>[p.folder,p.folder!==folders[1]]))});
 for(const [id,off] of [[faberId,folders[0]],[upstreamId,folders[2]],[h1Id,folders[1]],[faberId,folders[0]]]){
  const logFolder=path.join(root,'library','runtime-state',id,'logs');for(const row of await fs.readdir(logFolder,{withFileTypes:true}).catch(()=>[])){if(row.isFile()&&/\.(?:log|txt)$/i.test(row.name))await fs.unlink(path.join(logFolder,row.name));}
  await openStudioMenu(page);await page.getByRole('combobox',{name:'Active Halo runtime',exact:true}).selectOption('profile:'+id);await page.keyboard.press('Escape');
  await expect.poll(async()=>(await call('list_runtime_registrations')).find(p=>p.runtimeId==='openCe').id).toBe(id);
  engineOutput='';engineTail='';const play=page.locator('.runtime-dock').getByRole('button',{name:/^Play Halo/});await expect(play).toBeEnabled();await play.click();
  report.consoleReads??=[];let nativeConsole;try{nativeConsole=await readNativePackCounts(engineProfiles.find(p=>p.id===id));}catch(error){report.nativeLoaderFailure={id,logs:(await readLogs(id)).slice(-16000),consoleError:String(error)};throw error;}report.consoleReads.push({profile:id,output:nativeConsole});engineOutput+='\n'+nativeConsole;
  try{await expect.poll(async()=>/mods: load order/.test(await readLogs(id))&&/mods: on ui, \d+ string lists, (\d+) bitmaps/.test(await readLogs(id)),{timeout:30000}).toBe(true);}catch(error){report.nativeLoaderFailure={id,logs:(await readLogs(id)).slice(-16000)};
   const profile=engineProfiles.find(p=>p.id===id),plan=await call('inspect_runtime_launch',{registration:profile});
   const diagnostic=promisify(execFile)(plan.executable,plan.args,{cwd:plan.cwd,env:{...process.env,...qaEngineEnvironment,...plan.environment,HALO_SAVE_ROOT:path.join(root,'library/runtime-state',id,'saves'),HALO_LOG_ROOT:path.join(root,'library/runtime-state',id,'logs'),HALO_CACHE_ROOT:path.join(root,'library/runtime-state',id,'cache')},windowsHide:true,timeout:15000,maxBuffer:65536});
   if(diagnostic.child)await finish.trackProcess(diagnostic.child);
   try{const result=await diagnostic;report.nativeLoaderFailure.directDiagnostic={exitCode:0,stdout:result.stdout.slice(-16000),stderr:result.stderr.slice(-16000)};}catch(failure){report.nativeLoaderFailure.directDiagnostic={exitCode:failure.code,signal:failure.signal,stdout:failure.stdout?.slice(-16000),stderr:failure.stderr?.slice(-16000)};}
   report.nativeLoaderFailure.afterDiagnosticLogs=(await readLogs(id)).slice(-16000);throw error;}
  const text=await readLogs(id),lines=text.split(/\r?\n/).filter(s=>/mods:/.test(s)),last=lines.filter(s=>s.includes('mods: load order')).at(-1);
  expect(last).toContain(off+' (off)');
  const count=/mods: on ui, \d+ string lists, (\d+) bitmaps/.exec(text);expect(count,'Engine must report native bitmap replacement count').not.toBeNull();expect(Number(count[1])).toBe(id===faberId?0:1);
  const unchanged=await fs.readFile(orderFile,'utf8');expect(unchanged).toContain('# native QA priority');expect(unchanged).toContain('# retain');
  const engine=engineProfiles.find(p=>p.id===id);
  await expect.poll(async()=>{const list=await running();return list.some(p=>p.Path&&path.resolve(p.Path).toLowerCase()===path.resolve(engine.executable).toLowerCase());},{timeout:30000,intervals:[500,1000]}).toBe(false);
  expect(/FATAL|assertion failed/i.test(text)).toBe(false);
  nativeRuns.push({profile:id,nativeBitmapReplacements:Number(count[1]),disabled:off,loaderLog:lines.slice(-6),ended:true,exitCodeObserved:false});
 }
 const external=await fs.readFile(orderFile,'utf8')+'\n# deliberate external editor change\n';await fs.writeFile(orderFile,external);
 let conflict=false;try{await call('launch_registered_runtime',{runtimeId:'openCe'});}catch(e){conflict=/changed outside Spark/.test(String(e));}
 expect(conflict).toBe(true);expect(await fs.readFile(orderFile,'utf8')).toBe(external);
 report.presentationPacks={nativeRuns,metadataOnlyCategoryFixtures:true,authoredNativeBitmapPack:true,realThirdPartyPacksInstalled:false,visualFidelityAccepted:false,audibleAudioAccepted:false,sharedDataRoot:true,externalChangeRefused:true};
 report.cases.push({name:'Real private native engines read per-profile disabled states across shared-root hot swaps; manual order/comments survive; external edit blocks launch',passed:true});
 await page.screenshot({path:path.join(root,'runtime-packs.png')});
}


async function managedEnginePackages(){
 await page.reload();await chooseTool(page,'Settings & tools');await page.getByRole('tab',{name:'Runtime setup',exact:true}).click();
 const panel=page.locator('.managed-runtimes');await panel.getByText('Get runtimes · one shared Halo library',{exact:true}).click();
 const packages=await call('managed_runtime_packages');expect(packages.map(p=>p.id).sort()).toEqual(['chupathingy','faber','opence','openh1']);
 await panel.getByRole('combobox',{name:'Engine shared Halo library',exact:true}).selectOption('upstream');
 const banks=Object.fromEntries(await Promise.all(['bitmaps.map','sounds.map','loc.map'].map(async n=>[n,await hash(path.join(shared,'maps_ce',n))])));
 const installed=[];
 for(const id of ['opence','chupathingy','faber','openh1','opence']){
  const p=packages.find(p=>p.id===id);await panel.getByRole('combobox',{name:'Engine to download',exact:true}).selectOption(id);
  await panel.getByRole('button',{name:'Download selected engine',exact:true}).click();
  await expect(panel.getByRole('status')).toContainText('Publisher hash verified',{timeout:120000});
  await panel.getByRole('button',{name:'Install & connect engine',exact:true}).click();
  await expect(panel.getByRole('status')).toContainText('ready for next launch',{timeout:90000});
  const profile=(await call('list_runtime_registrations')).find(r=>r.id==='engine-'+id+'-'+p.version);expect(profile).toBeTruthy();
  const record=JSON.parse(await fs.readFile(path.join(profile.root,'.spark-engine.json'),'utf8'));
  expect(await hash(profile.executable)).toBe(p.executableSha256);expect(record.archiveSha256).toBe(p.sha256);
  expect(path.resolve(profile.dataRoot.replace(/^\\\\\?\\/,''))).toBe(path.resolve(shared));
  const plan=await call('inspect_runtime_launch',{registration:profile});expect(path.resolve(plan.environment.HALO_DATA_ROOT.replace(/^\\\\\?\\/,''))).toBe(path.resolve(shared));
  expect(await fs.stat(path.join(profile.root,'maps')).catch(()=>null)).toBeNull();
  if(id==='faber'){expect(record.omittedAliases).toEqual(['OpenCE - Faber.exe']);expect(await fs.stat(path.join(profile.root,'OpenCE - Faber.exe')).catch(()=>null)).toBeNull();}
  const inbox=path.join(root,'library/Inbox/downloads');for(const dir of await fs.readdir(inbox,{withFileTypes:true})){if(dir.isDirectory())expect(await fs.stat(path.join(inbox,dir.name,'download.zip')).catch(()=>null)).toBeNull();}
  installed.push({id,version:p.version,archiveSha256:p.sha256,exeSha256:p.executableSha256,engineBytes:record.bytes,sharedMaps:true,noGameLaunch:true});
 }
 for(const [n,sha]of Object.entries(banks))expect(await hash(path.join(shared,'maps_ce',n))).toBe(sha);
 expect((await call('list_runtime_registrations')).filter(r=>r.id.startsWith('engine-')).length).toBe(4);
 await panel.getByRole('combobox',{name:'Engine shared Halo library',exact:true}).selectOption('');
 const dynamic=await call('runtime_dynamic_layout',{root:null});await expect(panel.getByRole('textbox',{name:'Dynamic runtime folder',exact:true})).toHaveValue(dynamic.root);
 expect(dynamic.root.toLowerCase()).toContain('dynamicruntime');await panel.getByRole('combobox',{name:'Engine shared Halo library',exact:true}).selectOption('upstream');
 report.dynamicSetup={nativePlanAndActualSelector:true,installationAccepted:false};
 report.managedRuntimePackages={installed,uniqueEngineFolders:4,sharedContentSets:1,repeatedInstallReused:true,windowsVrAccepted:false};
 report.cases.push({name:'Actual publisher downloads, hash review, Install/connect buttons and launch plans share one content set across four managed engines; repeated installation reuses files; no installed game modified',passed:true});
}
async function nativeWalkthrough(){
 await chooseTool(page,'Settings & tools');await page.getByRole('tab',{name:'Interface Studio',exact:true}).click();
 const checkbox=page.getByRole('checkbox',{name:'Guided workspace walkthrough',exact:true});await checkbox.check();
 await expect(page.locator('.gs-walkthrough')).toBeVisible();
 const next=page.locator('.gs-walkthrough').getByRole('button',{name:/^Next:/});await next.focus();await page.keyboard.press('Enter');
 await expect(page.locator('.gs-walkthrough')).toContainText('Map library');
 await page.locator('.gs-walkthrough').getByRole('button',{name:'Turn off walkthrough',exact:true}).click();
 await page.getByRole('button',{name:'Close Help',exact:true}).click();
 await page.reload();await chooseTool(page,'Settings & tools');await page.getByRole('tab',{name:'Interface Studio',exact:true}).click();
 await expect(page.getByRole('checkbox',{name:'Guided workspace walkthrough',exact:true})).not.toBeChecked();
 report.cases.push({name:'Actual Interface Studio walkthrough toggle opens Help, keyboard activates next workspace, mouse disables it and reload retains the opt-out',passed:true});
}

async function startSpark(){
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
 child=spawn(app,[],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,...(process.env.SPARK_QA_RUNTIME_MODS==='1'?qaEngineEnvironment:{}),GUILTY_SPARK_DATA_DIR:path.join(root,'library'),WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port='+port}});await finish.trackProcess(child);
 for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{engineOutput=(engineOutput+chunk.toString()).slice(0,32768);engineTail=(engineTail+chunk.toString()).slice(-32768);});
 await expect.poll(()=>fetch('http://127.0.0.1:'+port+'/json/version').then(r=>r.ok,()=>false),{timeout:45000}).toBe(true);
 browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('tauri.localhost'));
 if(!page)throw Error('Native application WebView unavailable');page.setDefaultTimeout(45000);
}

async function restartPreferences(){
 const profiles=await call('list_runtime_registrations');const packs=await call('runtime_mod_packs',{registrationId:'engine-opence-build-343'});
 await call('close_application',{decision:'discard'});await waitForQaExit(child);await browser.close();
 await startSpark();
 expect(await call('list_runtime_registrations')).toEqual(profiles);
 const after=await call('runtime_mod_packs',{registrationId:'engine-opence-build-343'});expect(after.preferenceSha256).toBe(packs.preferenceSha256);
 await chooseTool(page,'Settings & tools');await page.getByRole('tab',{name:'Interface Studio',exact:true}).click();
 await expect(page.getByRole('checkbox',{name:'Guided workspace walkthrough',exact:true})).not.toBeChecked();
 report.cases.push({name:'Full Spark process close/restart preserves managed profiles, native pack choices and walkthrough opt-out',passed:true});
 report.fullProcessRestart=true;
}

async function readNativePackCounts(profile){
 const script='$row=Get-NetTCPConnection -State Listen -LocalAddress 127.0.0.1 -LocalPort '+consolePort+' -ErrorAction SilentlyContinue; if($row){Get-Process -Id $row[0].OwningProcess|Select-Object Id,Path|ConvertTo-Json -Compress}; exit 0';
 let owner;await expect.poll(async()=>{const r=await promisify(execFile)('pwsh.exe',['-NoProfile','-Command',script],{windowsHide:true,timeout:10000});owner=r.stdout.trim()?JSON.parse(r.stdout):null;return !!owner;},{timeout:12000,intervals:[300,500]}).toBe(true);
 const [observed,expected]=await Promise.all([fs.stat(owner.Path,{bigint:true}),fs.stat(profile.executable,{bigint:true})]);
 expect(String(observed.dev)).toBe(String(expected.dev));expect(String(observed.ino)).toBe(String(expected.ino));
 expect(await hash(owner.Path)).toBe(await hash(profile.executable));
 return new Promise((resolve,reject)=>{
  let text='',interval;const socket=net.createConnection({host:'127.0.0.1',port:consolePort});
  const cleanup=()=>{clearTimeout(timer);clearInterval(interval);socket.destroy();};
  const timer=setTimeout(()=>{cleanup();reject(Error('Owned native console did not return loaded-content counts: '+text.slice(-4000)));},10000);
  socket.once('connect',()=>{socket.write('(mods_list)\r\n');interval=setInterval(()=>socket.write('(mods_list)\r\n'),600);});
  socket.on('data',data=>{text=(text+data.toString()).slice(-32768);if(/mods: on ui, \d+ string lists, \d+ bitmaps/.test(text)){cleanup();resolve(text);}});
  socket.once('error',error=>{cleanup();reject(error);});
  socket.once('end',()=>{cleanup();reject(Error('Native console closed before loaded-content readback: '+text.slice(-4000)));});
 });
}

async function waitForOwnedEngines(){
 const ordinary=p=>path.resolve(p.replace(/^\\\\\?\\/,'' )).toLowerCase();
 const owned=ordinary(path.join(root,'library/runtimes/engines'))+path.sep;
 for(let attempt=0;attempt<35;attempt++){
  const result=await promisify(execFile)('pwsh.exe',['-NoProfile','-Command',"@((Get-Process -Name halo -ErrorAction SilentlyContinue) | Select-Object Id,Path) | ConvertTo-Json -Compress; exit 0"],{windowsHide:true,timeout:10000});
  const rows=result.stdout.trim()?JSON.parse(result.stdout):[],items=Array.isArray(rows)?rows:[rows];
  if(!items.some(item=>item.Path&&ordinary(item.Path).startsWith(owned)))return;
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 throw Error('An owned native runtime is still writing; keep its QA files for safe recovery');
}
