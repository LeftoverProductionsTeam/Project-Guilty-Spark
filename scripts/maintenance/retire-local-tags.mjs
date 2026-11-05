/** Lossless private native-tag preservation. Planning NEVER deletes source.
 * Retirement is a separate explicitly reviewed operation: close writers and
 * revalidate each source identity/hash and its vault blob before exact removal.
 * Restores are independent regular files in a new owned tree, never hardlinks.
 */
import fs from 'node:fs/promises';
import {constants, createReadStream} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {createInterface} from 'node:readline';
import {trustedScriptInvocation} from './windows-trusted-script.mjs';
const MiB=1024**2,GiB=1024**3;
const nativeExtensions=new Set(('actor actor_variant antenna biped bitmap camera_track color_table continuous_damage_effect contrail damage_effect decal detail_object_collection device device_control device_light_fixture device_machine dialogue effect equipment flag fog font garbage gbxmodel globals glow grenade_hud_interface hud_globals hud_message_text hud_number input_device_defaults item item_collection lens_flare light light_volume lightning material_effects meter model model_animations model_collision_geometry multiplayer_scenario_description object particle particle_system physics placeholder point_physics preferences_network_game projectile scenario scenario_structure_bsp scenery shader shader_environment shader_model shader_transparent_chicago shader_transparent_chicago_extended shader_transparent_generic shader_transparent_glass shader_transparent_meter shader_transparent_plasma shader_transparent_water sky sound sound_environment sound_looping sound_scenery spheroid string_list tag_collection ui_widget_collection ui_widget_definition unicode_string_list unit unit_hud_interface vehicle virtual_keyboard weapon weapon_hud_interface weather_particle_system wind').split(' '));
const normal=p=>process.platform==='win32'?p.toLowerCase():p;
function inside(root,p){const rel=path.relative(root,p);return rel!==''&&!rel.startsWith(`..${path.sep}`)&&rel!=='..'&&!path.isAbsolute(rel);}
function relativeName(value){
  if(typeof value!=='string'||!value||value.includes('\\')||value.includes(':')||/[\x00-\x1f]/.test(value)||value.split('/').some(p=>!p||p==='.'||p==='..'||p.endsWith('.')||p.endsWith(' ')||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))throw Error('Unsafe relative path');
  return value;
}
function sourcePath(workspace,relative){
  relativeName(relative);
  if(!relative.startsWith('.local/')||!relative.endsWith('/tags')||relative.split('/').some(p=>['.git','node_modules','.toolchain'].includes(p)||p.endsWith('.git')))throw Error('Only explicit native tags trees beneath the obsolete .local root are eligible');
  const full=path.resolve(workspace,...relative.split('/'));
  if(!inside(path.join(workspace,'.local'),full))throw Error('Source tree leaves the obsolete local root');
  return full;
}
async function ordinaryPath(full,{missing=false,cache=null}={}){
  const absolute=path.resolve(full),parts=[];
  for(let p=absolute;;p=path.dirname(p)){parts.push(p);if(p===path.dirname(p))break;}
  for(const p of parts.reverse()){
    if(cache?.has(p))continue;
    let info;try{info=await fs.lstat(p);}catch(e){if(missing&&e.code==='ENOENT')return;throw e;}
    if(info.isSymbolicLink())throw Error(`Linked/reparse path refused: ${p}`);
    const actual=await fs.realpath(p);
    if(normal(path.resolve(actual))!==normal(p))throw Error(`Aliased/reparse path refused: ${p}`);
    if(p!==absolute&&!info.isDirectory())throw Error(`Non-directory ancestor: ${p}`);
    if(cache&&info.isDirectory())cache.set(p,identity(await fs.lstat(p,{bigint:true})));
  }
}
const identity=stat=>({dev:String(stat.dev),ino:String(stat.ino),bytes:Number(stat.size),mtimeNs:String(stat.mtimeNs),ctimeNs:String(stat.ctimeNs)});
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.bytes===b.bytes&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
async function fingerprint(full,maxBytes=512*MiB,checkedParents=false){
  if(!checkedParents)await ordinaryPath(full);
  const before=await fs.lstat(full,{bigint:true});
  if(!before.isFile()||before.size>BigInt(maxBytes))throw Error(`Not a bounded ordinary file: ${full}`);
  const handle=await fs.open(full,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try{
    if(!same(identity(before),identity(await handle.stat({bigint:true}))))throw Error(`File replaced before read: ${full}`);
    const hash=crypto.createHash('sha256');let bytes=0;
    for await(const chunk of createReadStream('',{fd:handle.fd,autoClose:false})){bytes+=chunk.length;if(bytes>maxBytes)throw Error(`File grew beyond bound: ${full}`);hash.update(chunk);}
    const after=await handle.stat({bigint:true});
    if(!same(identity(before),identity(after))||bytes!==Number(after.size)||!same(identity(after),identity(await fs.lstat(full,{bigint:true}))))throw Error(`File changed during read: ${full}`);
    return {sha256:hash.digest('hex'),...identity(after)};
  }finally{await handle.close();}
}
function blobPath(vault,sha){if(!/^[a-f0-9]{64}$/.test(sha))throw Error('Invalid blob hash');return path.join(vault,'blobs',sha.slice(0,2),sha);}
async function atomicJson(file,value){
  await ordinaryPath(path.dirname(file),{missing:true});await fs.mkdir(path.dirname(file),{recursive:true});await ordinaryPath(path.dirname(file));
  await ordinaryPath(file,{missing:true});const tmp=path.join(path.dirname(file),`.native-tags-${crypto.randomUUID()}.tmp`);
  const handle=await fs.open(tmp,'wx');try{await handle.writeFile(JSON.stringify(value,null,2)+'\n');await handle.sync();}finally{await handle.close();}
  await fs.rename(tmp,file);return (await fingerprint(file,256*MiB)).sha256;
}
async function ownedVault(workspace,vault,maxVaultBytes){
  if(normal(path.resolve(vault))!==normal(path.join(workspace,'preserved','native-tags')))throw Error('Vault must be canonical preserved/native-tags');
  await ordinaryPath(vault,{missing:true});
  try{await fs.mkdir(vault,{recursive:false});}catch(e){if(e.code!=='ENOENT'&&e.code!=='EEXIST')throw e;if(e.code==='ENOENT'){await fs.mkdir(path.dirname(vault),{recursive:true});await fs.mkdir(vault);}}
  const marker=path.join(vault,'ownership.json');
  try{
    await ordinaryPath(marker);const owner=JSON.parse(await fs.readFile(marker,'utf8'));
    if(owner.kind!=='spark-private-native-tags'||normal(owner.workspace)!==normal(workspace)||owner.schemaVersion!==1)throw Error('Unknown existing tag vault ownership');
  }catch(e){
    if(e.code!=='ENOENT')throw e;
    if((await fs.readdir(vault)).length)throw Error('Nonempty unowned tag vault refused');
    await fs.writeFile(marker,JSON.stringify({schemaVersion:1,kind:'spark-private-native-tags',workspace,maxVaultBytes},null,2)+'\n',{flag:'wx'});
  }
}
async function countExistingBlobs(vault){
  const root=path.join(vault,'blobs');await ordinaryPath(root,{missing:true});let bytes=0;const files=new Map();
  try{for(const dir of await fs.readdir(root,{withFileTypes:true})){
    if(!/^[a-f0-9]{2}$/.test(dir.name)||!dir.isDirectory())throw Error('Unexpected vault entry');const folder=path.join(root,dir.name);await ordinaryPath(folder);
    for(const entry of await fs.readdir(folder,{withFileTypes:true})){
      if(/^\.pending-[a-f0-9-]+$/.test(entry.name)&&entry.isFile()){bytes+=(await fs.lstat(path.join(folder,entry.name))).size;continue;}
      if(!/^[a-f0-9]{64}$/.test(entry.name)||!entry.name.startsWith(dir.name)||!entry.isFile())throw Error('Unexpected vault blob');
      const full=path.join(folder,entry.name);const stat=await fs.lstat(full);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Linked vault blob');bytes+=stat.size;files.set(entry.name,{bytes:stat.size,verified:false});
    }
  }}catch(e){if(e.code!=='ENOENT')throw e;}return {bytes,pendingBytes:0,files};
}
async function preserveBlob(vault,source,record,known,maxVaultBytes){
  const destination=blobPath(vault,record.sha256);let old=known.files.get(record.sha256);
  if(old){if(old.bytes!==record.bytes)throw Error('Vault hash/length collision');if(!old.verified){const actual=await fingerprint(destination,512*MiB,true);if(actual.sha256!==record.sha256)throw Error(`Corrupt vault blob: ${destination}`);old.verified=true;}return false;}
  if(known.bytes+known.pendingBytes+record.bytes>maxVaultBytes)throw Error('Unique native tag bytes exceed the preservation budget; no source was removed');
  known.pendingBytes+=record.bytes;
  await ordinaryPath(path.dirname(destination),{missing:true});await fs.mkdir(path.dirname(destination),{recursive:true});
  const temp=path.join(path.dirname(destination),`.pending-${crypto.randomUUID()}`);
  await fs.copyFile(source,temp,constants.COPYFILE_EXCL);
  const copied=await fingerprint(temp,512*MiB,true);if(copied.sha256!==record.sha256||copied.bytes!==record.bytes)throw Error(`Copy changed; retained partial blob for review: ${temp}`);
  const after=await fingerprint(source,512*MiB,true);if(after.sha256!==record.sha256||!same(after,record))throw Error(`Source changed before preservation completed: ${source}`);
  // The destination is never overwritten. This process owns the only vault lock.
  try{await fs.lstat(destination);throw Error('Unexpected concurrently created blob');}catch(e){if(e.code!=='ENOENT')throw e;}
  await fs.rename(temp,destination);await fs.chmod(destination,0o444);
  const verified=await fingerprint(destination,512*MiB,true);if(verified.sha256!==record.sha256||verified.bytes!==record.bytes)throw Error('Published blob readback failed');
  known.pendingBytes-=record.bytes;known.bytes+=record.bytes;known.files.set(record.sha256,{bytes:record.bytes,verified:true});return true;
}
export function rootsFromInventory(inventory,workspace){
  if(normal(path.resolve(inventory.canonicalDirectory??inventory.storage?.root??''))!==normal(path.resolve(workspace)))throw Error('Inventory belongs to another workspace');
  const candidates=(inventory.storage?.directories??[]).map(d=>d.relative).filter(r=>typeof r==='string'&&r.startsWith('.local/')&&r.endsWith('/tags')&&!r.split('/').some(p=>['.git','node_modules','.toolchain'].includes(p)||p.endsWith('.git')));
  return [...new Set(candidates)].filter(r=>!candidates.some(p=>p!==r&&r.startsWith(p+'/'))).sort();
}
export async function preserveTagTrees({workspace,vault=path.join(workspace,'preserved','native-tags'),journal,roots,maxFiles=600000,maxInputBytes=64*GiB,maxVaultBytes=8*GiB,onProgress=()=>{},onFile=()=>{}}){
  workspace=path.resolve(workspace);vault=path.resolve(vault);journal=path.resolve(journal);
  await ordinaryPath(workspace);await ordinaryPath(path.join(workspace,'.local'));
  if(normal(vault)!==normal(path.join(workspace,'preserved','native-tags')))throw Error('Vault must be canonical preserved/native-tags');
  if(!roots?.length||roots.length>512)throw Error('One to 512 explicit tag trees required');
  if(inside(path.join(workspace,'.local'),journal)||normal(journal)===normal(path.join(workspace,'.local')))throw Error('Journal must be outside obsolete .local');
  await ordinaryPath(journal,{missing:true});await fs.mkdir(journal,{recursive:true});
  await fs.mkdir(path.dirname(vault),{recursive:true});await ownedVault(workspace,vault,maxVaultBytes);
  const lock=await fs.open(path.join(vault,'preserve.lock'),'wx');await lock.writeFile(JSON.stringify({pid:process.pid,at:new Date().toISOString()}));
  const plan={schemaVersion:1,operation:'preserve-native-tag-trees',workspace,vault,at:new Date().toISOString(),complete:false,sourceDeletionPerformed:false,deletionAuthorized:false,requiresClosedWritersAndFreshSourceAndBlobChecks:true,trees:[],excluded:[],totals:{files:0,inputBytes:0,uniqueFiles:0,uniqueBytes:0,duplicateFiles:0,duplicateBytes:0,newVaultBytes:0}};
  let known;
  try{
    known=await countExistingBlobs(vault);const unique=new Map(),pendingBlobs=new Map();let nextProgress=1000;
    const normalized=[...new Set(roots.map(relativeName))].sort();for(const relative of normalized)if(normalized.some(other=>other!==relative&&relative.startsWith(other+'/')))throw Error('Overlapping native tree roots refused');
    for(const relative of normalized){
      const tree=sourcePath(workspace,relative);await ordinaryPath(tree);const treeStat=await fs.lstat(tree,{bigint:true});if(!treeStat.isDirectory())throw Error('Native tree root is not a directory');
      const entries=[],directories=[],files=[],ancestors=new Map();const scan=async(folder,prefix='')=>{
        await ordinaryPath(folder,{cache:ancestors});const before=await fs.lstat(folder,{bigint:true});
        const names=await fs.readdir(folder,{withFileTypes:true});names.sort((a,b)=>a.name.localeCompare(b.name));
        for(const entry of names){
          const item=relativeName(prefix+entry.name),full=path.join(folder,entry.name);const info=await fs.lstat(full,{bigint:true});
          if(info.isSymbolicLink()){plan.excluded.push({tree:relative,relative:item,reason:'Linked/reparse path retained'});continue;}
          if(info.isDirectory()){if(['.git','node_modules','.toolchain'].includes(entry.name)){plan.excluded.push({tree:relative,relative:item,reason:'Non-tag/source directory retained'});continue;}await scan(full,item+'/');continue;}
          if(!info.isFile()||!nativeExtensions.has(path.extname(entry.name).slice(1).toLowerCase())){plan.excluded.push({tree:relative,relative:item,reason:'Not a recognized ordinary Halo 1 native tag; retained'});continue;}
          files.push({full,relative:item});if(files.length>20000)throw Error('One native tag tree exceeds 20,000 files');
        }
        if(!same(identity(before),identity(await fs.lstat(folder,{bigint:true}))))throw Error(`Directory changed during inventory: ${folder}`);
        directories.push({relative:prefix?prefix.slice(0,-1):'',identity:identity(before)});
      };
      await scan(tree);
      // Eight bounded readers hash every byte. Ancestors are checked once per
      // directory and checked again before publishing a tree manifest; every
      // file handle/path identity is checked before and after its content read.
      let next=0,failed=null;
      await Promise.all(Array.from({length:Math.min(8,files.length)},async()=>{
        while(next<files.length&&!failed){const item=files[next++];try{
          const record=await fingerprint(item.full,512*MiB,true);if(++plan.totals.files>maxFiles||(plan.totals.inputBytes+=record.bytes)>maxInputBytes)throw Error('Native tag scan exceeds file/input budget');
          let preservation=pendingBlobs.get(record.sha256);if(!preservation){preservation=preserveBlob(vault,item.full,record,known,maxVaultBytes).then(added=>{if(added)plan.totals.newVaultBytes+=record.bytes;});pendingBlobs.set(record.sha256,preservation);}await preservation;
          const old=unique.get(record.sha256);if(old!==undefined){if(old!==record.bytes)throw Error('Hash/length collision');plan.totals.duplicateFiles++;plan.totals.duplicateBytes+=record.bytes;}else{unique.set(record.sha256,record.bytes);plan.totals.uniqueFiles++;plan.totals.uniqueBytes+=record.bytes;}
          const entry={relative:item.relative,...record};entries.push(entry);await onFile({tree:relative,entry,totals:plan.totals});
          if(plan.totals.files>=nextProgress){nextProgress=plan.totals.files+1000;onProgress({...plan.totals,tree:relative});}
        }catch(error){failed=error;}}
      }));if(failed)throw failed;
      for(const [folder,original]of ancestors){const current=await fs.lstat(folder,{bigint:true}),now=identity(current);if(!current.isDirectory()||now.dev!==original.dev||now.ino!==original.ino||((folder===tree||inside(tree,folder))&&!same(now,original)))throw Error(`Ancestor replaced/changed during preservation: ${folder}`);}
      entries.sort((a,b)=>a.relative.localeCompare(b.relative));
      const treeId=crypto.createHash('sha256').update(relative).digest('hex');const file=path.join(journal,'trees',`${treeId}.json`);
      const manifest={schemaVersion:1,kind:'native-tag-tree',workspace,sourceRelative:relative,vault,treeIdentity:identity(treeStat),entries,directories,complete:!plan.excluded.some(e=>e.tree===relative)};
      const sha256=await atomicJson(file,manifest);plan.trees.push({sourceRelative:relative,manifest:file,manifestSha256:sha256,files:entries.length,bytes:entries.reduce((n,e)=>n+e.bytes,0),complete:manifest.complete});
      await atomicJson(path.join(journal,'progress.json'),plan);onProgress({...plan.totals,completedTrees:plan.trees.length,trees:normalized.length});
    }
    plan.complete=true;await atomicJson(path.join(journal,'plan.json'),plan);return plan;
  }catch(error){await atomicJson(path.join(journal,'interrupted.json'),{...plan,error:String(error)});throw error;}
  finally{await lock.close();await fs.unlink(path.join(vault,'preserve.lock'));}
}
async function readManifest(file,expected){
  const actual=await fingerprint(file,256*MiB);if(!/^[a-f0-9]{64}$/.test(expected)||actual.sha256!==expected)throw Error('Manifest identity/hash mismatch');
  const manifest=JSON.parse(await fs.readFile(file,'utf8'));
  if(manifest.schemaVersion!==1||manifest.kind!=='native-tag-tree'||!Array.isArray(manifest.entries)||manifest.entries.length>600000)throw Error('Invalid native tag manifest');
  return manifest;
}
const directoryIndexes=new WeakMap();
async function checkDirectoryOwners(manifest,relative,cache=null){
  const tree=sourcePath(manifest.workspace,manifest.sourceRelative);await ordinaryPath(tree,{cache});
  const parents=[''];let value='';for(const part of path.posix.dirname(relative).split('/'))if(part!=='.'){value=value?value+'/'+part:part;parents.push(value);}
  let indexed=directoryIndexes.get(manifest);if(!indexed){indexed=new Map(manifest.directories.map(d=>[d.relative,d.identity]));directoryIndexes.set(manifest,indexed);}
  for(const parent of parents){const expected=indexed.get(parent);if(!expected)throw Error('Missing preserved directory ownership');const folder=parent?path.join(tree,...parent.split('/')):tree;await ordinaryPath(folder,{cache});
    // Read-only preflight is cached for this bounded batch. The native worker
    // still freshly checks and holds every source ancestor before hashing and
    // deleting its exclusive source handle; this cache grants no deletion.
    const observed=cache?.get(folder)??identity(await fs.lstat(folder,{bigint:true}));if(observed.dev!==expected.dev||observed.ino!==expected.ino)throw Error('Source directory replaced; retain contents');}
  return tree;
}
/** Fresh per-file gate for a separate, explicitly reviewed deletion operation. */
export async function verifyDeletionCandidate({manifest:manifestFile,manifestSha256,relative,closedWriters=false}){
  if(closedWriters!==true)throw Error('Close all relevant game/editor/compiler writers before revalidation');
  const manifest=await readManifest(manifestFile,manifestSha256);const entry=manifest.entries.find(e=>e.relative===relativeName(relative));if(!entry)throw Error('File is not in the preserved manifest');
  const tree=await checkDirectoryOwners(manifest,relative);const current=await fingerprint(path.join(tree,...relative.split('/')));
  if(current.sha256!==entry.sha256||!same(current,entry))throw Error('Source changed/replaced since preservation; retain it');
  const blob=await fingerprint(blobPath(manifest.vault,entry.sha256));if(blob.sha256!==entry.sha256||blob.bytes!==entry.bytes)throw Error('Preserved blob changed; retain source');
  return {path:path.join(tree,...relative.split('/')),sha256:entry.sha256,bytes:entry.bytes,sourceDeletionPerformed:false};
}
export async function captureQuiescence(workspace){
  workspace=path.resolve(workspace);await ordinaryPath(workspace);
  if(process.platform!=='win32')throw Error('Real process quiescence currently requires the Windows process inventory');
  const command='Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine,WorkingSetSize | ConvertTo-Json -Compress';
  const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,timeout:15000,maxBuffer:8*MiB});
  const result=JSON.parse(stdout),processes=Array.isArray(result)?result:[result],local=normal(path.join(workspace,'.local'));
  const nativeWriters=processes.filter(p=>p.ProcessId!==process.pid&&(/^(?:guiltyspark.*|halo.*|mcc.*|sapien|guerilla|tool(?:_fast)?|invader.*|baboon|blender|assembly|mozzarilla|refinery|reclaimer|excession|osoyoos|hmt|sparkedit|swordedit|eschaton|mantle|opence.*|chupathingy.*)\.exe$/i.test(p.Name??'')||normal(`${p.ExecutablePath??''} ${p.CommandLine??''}`).includes(local))).map(p=>({pid:p.ProcessId,name:p.Name,executable:p.ExecutablePath??null}));
  const owned=processes.filter(p=>p.ProcessId===process.pid||p.ParentProcessId===process.pid);
  return {schemaVersion:1,workspace,observedAt:new Date().toISOString(),observer:'Win32_Process',nativeWriters,observedProcessCount:processes.length,ownedMemoryBytes:owned.reduce((sum,p)=>sum+Number(p.WorkingSetSize??0),0),ownedProcessCount:owned.length};
}
function checkQuiescence(snapshot,workspace){
  if(snapshot?.schemaVersion!==1||normal(path.resolve(snapshot.workspace??''))!==normal(workspace)||snapshot.observer!=='Win32_Process'||!Array.isArray(snapshot.nativeWriters)||snapshot.nativeWriters.length||!Number.isFinite(Date.parse(snapshot.observedAt))||Math.abs(Date.now()-Date.parse(snapshot.observedAt))>120000)throw Error('Recent quiescent native-process evidence is required; close relevant writers');
  if(snapshot.ownedMemoryBytes!==undefined&&(!Number.isSafeInteger(snapshot.ownedMemoryBytes)||snapshot.ownedMemoryBytes>2*GiB))throw Error('Owned retirement workers exceeded their 2 GiB memory budget; checkpoint before continuing');
}
async function durableLines(handle,records){if(records.length){await handle.write(records.map(record=>JSON.stringify(record)+'\n').join(''));await handle.sync();}}
async function sealedWorkers(plan,planSha256){
  if(process.platform!=='win32')throw Error('Sealed native-tag retirement requires the Windows handle worker');
  const script=fileURLToPath(new URL('./retire-native-tags.ps1',import.meta.url)),helper=fileURLToPath(new URL('./windows-sealed-files.cs',import.meta.url));await ordinaryPath(script);await ordinaryPath(helper);
  const launch=await trustedScriptInvocation(script,helper,{Plan:plan,PlanSha256:planSha256});
  const count=Number(process.env.SPARK_TAG_RETIRE_WORKERS??8);if(!Number.isInteger(count)||count<1||count>8)throw Error('Native tag retirement requires one to eight bounded workers');
  const workers=[];let sequence=0,cursor=0;
  const close=async()=>{await Promise.all(workers.map(async worker=>{worker.child.stdin.end();await Promise.race([worker.closed,new Promise(resolve=>{const timer=setTimeout(()=>{worker.child.kill();resolve();},10000);timer.unref();})]);}));};
  try{
    for(let index=0;index<count;index++){
      const child=spawn('powershell.exe',launch.args,{env:launch.env,windowsHide:true,stdio:['pipe','pipe','pipe']}),pending=new Map();let stderr='',readyResolve,readyReject;
      const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;}),closed=new Promise(resolve=>child.once('close',resolve));
      const failed=error=>{error.sealedWorkerUnavailable=true;readyReject(error);for(const item of pending.values())item.reject(error);pending.clear();};
      child.on('error',failed);child.stdin.on('error',failed);child.stderr.on('data',chunk=>{if(stderr.length<65536)stderr+=String(chunk);});
      child.once('close',code=>failed(Error(`Sealed tag worker exited ${code}: ${stderr.slice(-3000)}`)));
      createInterface({input:child.stdout,crlfDelay:Infinity}).on('line',line=>{try{const response=JSON.parse(line.replace(/^\uFEFF/,''));if(response.type==='ready'){if(response.planSha256!==planSha256)throw Error('Sealed worker reviewed-plan mismatch');readyResolve();}else if(response.type==='fatal')throw Error(response.error??'Sealed worker failed');else{const item=pending.get(response.id);if(!item)throw Error('Unexpected sealed-worker response identity');pending.delete(response.id);item.resolve(response);}}catch(error){failed(error);}});
      workers.push({child,pending,ready,closed});
    }
    await Promise.race([Promise.all(workers.map(worker=>worker.ready)),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Sealed tag workers did not become ready')),30000);timer.unref();})]);
    return {retire:(request,routeSha256)=>{const bucket=/^[a-f0-9]{64}$/.test(routeSha256??'')?Number.parseInt(routeSha256.slice(0,2),16):cursor++,worker=workers[bucket%workers.length],id=String(++sequence);return new Promise((resolve,reject)=>{worker.pending.set(id,{resolve,reject});worker.child.stdin.write(JSON.stringify({id,...request})+'\n',error=>{if(error){worker.pending.delete(id);reject(error);}});});},close};
  }catch(error){await close();throw error;}
}
/** Explicitly reviewed retirement, separate from preservation. Files are never
 * selected from a directory wildcard: each unlink has an exact preserved tag
 * manifest entry, fresh identity/hash checks, and a durable intent journal.
 */
export async function retireTagPlan({plan:planFile,reviewedPlanSha256,processSnapshot,journal,capture=captureQuiescence,createSealed=sealedWorkers,onBeforeUnlink=async()=>{},onProgress=()=>{}}){
  const planHash=await fingerprint(planFile,256*MiB);if(planHash.sha256!==reviewedPlanSha256)throw Error('Exact reviewed complete-plan hash required');
  const plan=JSON.parse(await fs.readFile(planFile,'utf8')),workspace=path.resolve(plan.workspace??'');
  if(plan.schemaVersion!==1||plan.operation!=='preserve-native-tag-trees'||plan.complete!==true||plan.sourceDeletionPerformed!==false||!Array.isArray(plan.trees)||plan.trees.length>512)throw Error('Retirement requires a complete preservation plan');
  if(normal(path.resolve(plan.vault??''))!==normal(path.join(workspace,'preserved/native-tags')))throw Error('Unowned content vault');
  journal=path.resolve(journal);if(inside(path.join(workspace,'.local'),journal)||normal(journal)===normal(path.join(workspace,'.local')))throw Error('Retirement journal must be outside .local');
  await ordinaryPath(journal,{missing:true});await fs.mkdir(journal,{recursive:true});
  await ordinaryPath(processSnapshot);checkQuiescence(JSON.parse(await fs.readFile(processSnapshot,'utf8')),workspace);
  let lastProcessCheck=0,processCheck=null,peakOwnedMemoryBytes=0;const processGate=async()=>{if(Date.now()-lastProcessCheck>30000){processCheck??=(async()=>{const snapshot=await capture(workspace);checkQuiescence(snapshot,workspace);peakOwnedMemoryBytes=Math.max(peakOwnedMemoryBytes,snapshot.ownedMemoryBytes??0);lastProcessCheck=Date.now();})().finally(()=>{processCheck=null;});await processCheck;}};await processGate();
  const vault=plan.vault;await ordinaryPath(vault);try{await fs.lstat(path.join(vault,'preserve.lock'));throw Error('Preservation is still active; no retirement');}catch(e){if(e.code!=='ENOENT')throw e;}
  const lock=await fs.open(path.join(vault,'retire.lock'),'wx');await lock.writeFile(JSON.stringify({pid:process.pid,reviewedPlanSha256,at:new Date().toISOString()}));await lock.sync();
  const file=path.join(journal,`retirement-${reviewedPlanSha256}.jsonl`),intended=new Set(),done=new Set(),allocationKnown=new Set(),allocationUnknown=new Set();let output,sealed,recordedAllocationReleasedBytes=0;
  const totals={filesRemoved:0,bytesRemoved:0,alreadyRetired:0,retained:0,errors:[]};
  try{
    await ordinaryPath(file,{missing:true});
    try{const stream=createReadStream(file,{encoding:'utf8'});for await(const line of createInterface({input:stream,crlfDelay:Infinity})){if(line.length>128*1024)throw Error('Oversized retirement journal record');const entry=JSON.parse(line);if(entry.type==='header'&&entry.planSha256!==reviewedPlanSha256)throw Error('Retirement journal belongs to another plan');if(entry.type==='unlink-intent')intended.add(entry.key);if(entry.type==='unlinked'||entry.type==='absent-after-intent'){done.add(entry.key);if(entry.type==='unlinked'&&Number.isSafeInteger(entry.allocationReleased)&&entry.allocationReleased>=0&&!allocationKnown.has(entry.key)){recordedAllocationReleasedBytes+=entry.allocationReleased;allocationKnown.add(entry.key);allocationUnknown.delete(entry.key);}else if(!allocationKnown.has(entry.key))allocationUnknown.add(entry.key);}}}catch(e){if(e.code!=='ENOENT')throw e;}
    output=await fs.open(file,'a');await durableLines(output,[{type:'header',planSha256:reviewedPlanSha256,workspace,at:new Date().toISOString(),quiescence:processSnapshot}]);
    sealed=await createSealed(planFile,reviewedPlanSha256);
    const checkedBlobs=new Map();
    for(const tree of plan.trees){
      const manifest=await readManifest(tree.manifest,tree.manifestSha256);if(manifest.workspace!==plan.workspace||manifest.vault!==vault||manifest.sourceRelative!==tree.sourceRelative)throw Error('Tree receipt escaped the reviewed plan');sourcePath(workspace,manifest.sourceRelative);
      const keys=new Set();for(const entry of manifest.entries){relativeName(entry.relative);if(keys.has(normal(entry.relative))||!nativeExtensions.has(path.extname(entry.relative).slice(1).toLowerCase())||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||entry.bytes>512*MiB||!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('Invalid/duplicate native tag manifest entry');keys.add(normal(entry.relative));}
      for(let offset=0;offset<manifest.entries.length;offset+=128){
        await processGate();const directoryCache=new Map(),ready=[],records=[];
        const batch=manifest.entries.slice(offset,offset+128);let next=0;
        await Promise.all(Array.from({length:Math.min(8,batch.length)},async()=>{
          while(next<batch.length){const entry=batch[next++],key=tree.manifestSha256+':'+entry.relative;try{
            const root=await checkDirectoryOwners(manifest,entry.relative,directoryCache),source=path.join(root,...entry.relative.split('/'));
            const blobFile=blobPath(vault,entry.sha256);await ordinaryPath(path.dirname(blobFile),{cache:directoryCache});const blobStat=identity(await fs.lstat(blobFile,{bigint:true})),prior=checkedBlobs.get(entry.sha256);
            if(!prior||!same(prior,blobStat)){const blob=await fingerprint(blobFile,512*MiB,true);if(blob.sha256!==entry.sha256||blob.bytes!==entry.bytes)throw Error('Vault blob changed; retain source');checkedBlobs.set(entry.sha256,blob);}
            let present;try{present=await fs.lstat(source);}catch(e){if(e.code!=='ENOENT')throw e;}
            if(!present){if(!intended.has(key))throw Error('Source missing without durable retirement intent');totals.alreadyRetired++;if(!allocationKnown.has(key))allocationUnknown.add(key);records.push({type:'absent-after-intent',key});continue;}
            if(done.has(key))throw Error('Previously retired path was recreated; retain replacement');
            const current=await fs.lstat(source,{bigint:true});if(!current.isFile()||!same(identity(current),entry))throw Error('Source changed/replaced; retain it');
            ready.push({source,entry,key,blobFile,blobIdentity:checkedBlobs.get(entry.sha256)});records.push({type:'unlink-intent',key,path:source,sha256:entry.sha256,bytes:entry.bytes,identity:entry});
          }catch(error){totals.retained++;totals.errors.push({tree:tree.sourceRelative,relative:entry.relative,error:String(error)});records.push({type:'retained',key,error:String(error)});}}
        }));
        // One fsynced intent batch precedes every exact-path unlink. Originals
        // remain present if interruption occurs before this durability gate.
        await durableLines(output,records);for(const row of ready)intended.add(row.key);
        const completed=[];let unlinkIndex=0,interruption=null;
        await Promise.all(Array.from({length:Math.min(8,ready.length)},async()=>{
        while(unlinkIndex<ready.length&&!interruption){const row=ready[unlinkIndex++];
          try{await onBeforeUnlink(row);await processGate();}catch(error){interruption=error;break;}
          try{
            await checkDirectoryOwners(manifest,row.entry.relative,directoryCache);
            const blobNow=await fs.lstat(row.blobFile,{bigint:true});if(!blobNow.isFile()||!same(identity(blobNow),row.blobIdentity))throw Error('Vault blob replaced before unlink; retain source');
            const named=await fs.lstat(row.source,{bigint:true});if(!named.isFile()||!same(identity(named),row.entry))throw Error('Source replaced/changed before native handoff; retain it');
            // The native worker independently resolves the exact sealed plan,
            // holds source/ancestor/blob handles against replacement, hashes
            // the source and deletes that same exclusive handle. No Node
            // path-based source unlink is permitted here.
            const result=await sealed.retire({manifestSha256:tree.manifestSha256,relative:row.entry.relative},row.entry.sha256);
            if(result.ok!==true||result.removed!==true||result.sha256!==row.entry.sha256||result.bytes!==row.entry.bytes)throw Error(result.error??'Native handle retirement was not confirmed');
            totals.filesRemoved++;totals.bytesRemoved+=row.entry.bytes;done.add(row.key);if(Number.isSafeInteger(result.allocationReleased)&&result.allocationReleased>=0){recordedAllocationReleasedBytes+=result.allocationReleased;allocationKnown.add(row.key);allocationUnknown.delete(row.key);}else allocationUnknown.add(row.key);completed.push({type:'unlinked',key:row.key,bytes:row.entry.bytes,allocationReleased:result.allocationReleased});
          }catch(error){totals.retained++;totals.errors.push({tree:tree.sourceRelative,relative:row.entry.relative,error:String(error)});completed.push({type:'retained',key:row.key,error:String(error)});if(error.sealedWorkerUnavailable)interruption=error;}
        }
        }));
        await durableLines(output,completed);if(interruption)throw interruption;onProgress({...totals,errors:totals.errors.length,tree:tree.sourceRelative,peakOwnedMemoryBytes,recordedAllocationReleasedBytes,allocationUnacknowledgedFiles:allocationUnknown.size});
      }
    }
    const result={schemaVersion:1,planSha256:reviewedPlanSha256,journal:file,complete:totals.retained===0,sourceDeletionPerformed:totals.filesRemoved>0,peakOwnedMemoryBytes,recordedAllocationReleasedBytes,allocationUnacknowledgedFiles:allocationUnknown.size,...totals};await atomicJson(path.join(journal,'retirement-result.json'),result);return result;
  }finally{await sealed?.close();await output?.close();await lock.close();await fs.unlink(path.join(vault,'retire.lock'));}
}
export async function restoreTagTree({manifest:manifestFile,manifestSha256,destination,preservationIndex=null,indexSha256=null,pythonExecutable=null}){
  const manifest=await readManifest(manifestFile,manifestSha256);const workspace=path.resolve(manifest.workspace),root=path.join(workspace,'preserved','restored-native-tags');destination=path.resolve(destination);
  if(!inside(root,destination)||path.basename(destination)!=='tags')throw Error('Restore requires a new preserved/restored-native-tags/<name>/tags tree');
  await ordinaryPath(destination,{missing:true});await fs.mkdir(path.dirname(destination),{recursive:true});await fs.mkdir(destination);
  const marker=path.join(destination,'.spark-restored-native-tags.json');await fs.writeFile(marker,JSON.stringify({schemaVersion:1,manifest:manifestFile,manifestSha256,complete:false}),{flag:'wx'});
  for(const directory of manifest.directories??[])if(directory.relative){relativeName(directory.relative);const target=path.join(destination,...directory.relative.split('/'));await ordinaryPath(target,{missing:true});await fs.mkdir(target,{recursive:true});}
  let provider,staging,stagingIdentity;
  try{
    if(preservationIndex||indexSha256||pythonExecutable){
      const {openPreservationProvider}=await import('./archive-local-recovery.mjs');
      provider=await openPreservationProvider({workspace,preservationIndex,indexSha256,pythonExecutable});
    }
    for(const entry of manifest.entries){
      if(!Number.isSafeInteger(entry.bytes)||entry.bytes<0||entry.bytes>512*MiB)throw Error('Native restore object exceeds its 512 MiB bound within the 2 GiB temporary budget');
      relativeName(entry.relative);const blob=blobPath(manifest.vault,entry.sha256);let before;
      try{before=await fingerprint(blob);}catch(error){if(error.code!=='ENOENT'||!provider)throw error;}
      if(before&&(before.sha256!==entry.sha256||before.bytes!==entry.bytes))throw Error('Restore blob verification failed');
      const target=path.join(destination,...entry.relative.split('/'));await ordinaryPath(path.dirname(target),{missing:true});await fs.mkdir(path.dirname(target),{recursive:true});await ordinaryPath(path.dirname(target));
      if(before)await fs.copyFile(blob,target,constants.COPYFILE_EXCL);
      else {
        // The provider never writes inside protected preservation roots.
        // Keep one bounded object in fresh owned TEMP, then use the existing
        // exclusive independent-copy path into this new editable tag tree.
        if(!staging){const tempRoot=path.resolve(os.tmpdir());await ordinaryPath(tempRoot);staging=await fs.mkdtemp(path.join(tempRoot,'spark-native-tag-restore-'));stagingIdentity=identity(await fs.lstat(staging,{bigint:true}));}
        const staged=path.join(staging,'object');
        try{await provider.restore({sha256:entry.sha256,bytes:entry.bytes,destination:staged});await fs.copyFile(staged,target,constants.COPYFILE_EXCL);}
        finally{await ordinaryPath(staging);const current=identity(await fs.lstat(staging,{bigint:true}));if(current.dev!==stagingIdentity.dev||current.ino!==stagingIdentity.ino)throw Error('Owned recovery staging directory changed');await ordinaryPath(staged,{missing:true});await fs.unlink(staged).catch(error=>{if(error.code!=='ENOENT')throw error;});}
      }
      await fs.chmod(target,0o600);const result=await fingerprint(target);if(result.sha256!==entry.sha256||result.bytes!==entry.bytes||(await fs.lstat(target)).nlink!==1)throw Error('Restored independent file verification failed');
    }
  }finally{try{await provider?.close();}finally{if(staging){await ordinaryPath(staging);const current=identity(await fs.lstat(staging,{bigint:true}));if(current.dev!==stagingIdentity.dev||current.ino!==stagingIdentity.ino)throw Error('Owned recovery staging directory changed');await fs.rmdir(staging);}}}
  await atomicJson(marker,{schemaVersion:1,manifest:manifestFile,manifestSha256,complete:true,files:manifest.entries.length});return {destination,files:manifest.entries.length,complete:true};
}
async function main(){
  const [operation,...args]=process.argv.slice(2);const options={};for(let i=0;i<args.length;i+=2){if(!args[i]?.startsWith('--')||!args[i+1])throw Error('Expected named path arguments');options[args[i].slice(2)]=args[i+1];}
  if(operation==='plan'){
    if(!options.workspace||!options.inventory||!options.journal)throw Error('plan --workspace <root> --inventory <existing storage JSON> --journal <outside .local>');
    const inventory=JSON.parse(await fs.readFile(options.inventory,'utf8')),roots=rootsFromInventory(inventory,options.workspace);
    const result=await preserveTagTrees({workspace:options.workspace,roots,journal:options.journal,onProgress:value=>console.log(JSON.stringify({progress:true,...value}))});console.log(JSON.stringify({complete:result.complete,trees:result.trees.length,excluded:result.excluded.length,...result.totals}));
  }else if(operation==='restore')console.log(JSON.stringify(await restoreTagTree({manifest:options.manifest,manifestSha256:options.sha256,destination:options.destination,preservationIndex:options['preservation-index']??null,indexSha256:options['index-sha256']??null,pythonExecutable:options.python??null})));
  else if(operation==='quiescence'){if(!options.workspace||!options.output)throw Error('quiescence --workspace <root> --output <private snapshot>');const snapshot=await captureQuiescence(options.workspace);await atomicJson(path.resolve(options.output),snapshot);console.log(JSON.stringify(snapshot));}
  else if(operation==='retire'){if(!options.plan||!options['reviewed-plan-sha256']||!options['process-snapshot']||!options.journal)throw Error('retire --plan <complete plan> --reviewed-plan-sha256 <explicitly reviewed hash> --process-snapshot <recent quiescence JSON> --journal <outside .local>');const result=await retireTagPlan({plan:options.plan,reviewedPlanSha256:options['reviewed-plan-sha256'],processSnapshot:options['process-snapshot'],journal:options.journal,onProgress:value=>console.log(JSON.stringify({progress:true,...value}))});console.log(JSON.stringify(result));if(!result.complete)process.exitCode=2;}
  else throw Error('Use plan, restore, quiescence, or separately approved retire');
}
// Shared read/identity primitives for the separately owned asset-preservation
// mode. Content-vault ownership, budgets and deletion remain operation-specific.
export const TagNodeIO=Object.freeze({ordinaryPath,fingerprint,same,identity,relativeName,blobPath,atomicJson,inside,
  isNativeTagPath:relative=>{try{return nativeExtensions.has(path.posix.extname(relativeName(relative)).slice(1).toLowerCase());}catch{return false;}},
});
// Finish module initialization before a CLI restore dynamically opens the
// archive provider, which imports these shared read/identity primitives.
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.stack);process.exitCode=1;});
