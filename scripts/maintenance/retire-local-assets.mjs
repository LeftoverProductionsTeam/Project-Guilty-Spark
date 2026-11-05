// Lossless preservation of old QA map/snapshot/binary copies. Uses the existing
// native-tag path/hash primitives and Windows same-handle retirement worker.
// Planning never removes a source. Apply requires a separately reviewed SHA.
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { TagNodeIO } from './retire-local-tags.mjs';
import { trustedScriptInvocation } from './windows-trusted-script.mjs';
const { ordinaryPath, fingerprint, same, relativeName, blobPath, atomicJson, inside } = TagNodeIO;
const GiB=1024**3, maximumFile=512*1024**2;
const extensions=new Set(['.map','.yelo','.exe','.dll','.pdb','.dmp']);
const forbidden=new Set(['.git','node_modules','.toolchain','tools','archives','releases']);
const cacheParts=new Set(['cache','code cache','gpucache','shadercache','grshadercache','dawncache','dawngraphitecache','cache storage','cachestorage','browsermetrics']);
const normal=value=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value);
export function assetSourcePath(workspace,relative,{native=false}={}) {
  relativeName(relative);
  if(!relative.startsWith('.local/')||relative.split('/').some(part=>forbidden.has(part.toLowerCase()))||(!extensions.has(path.posix.extname(relative).toLowerCase())&&!(native&&TagNodeIO.isNativeTagPath(relative))))
    throw Error('Only explicit obsolete QA map, snapshot or binary files are eligible');
  const file=path.resolve(workspace,...relative.split('/'));
  if(!inside(path.join(workspace,'.local'),file))throw Error('Immutable asset leaves obsolete source root');
  return file;
}
export function cacheProfileRelative(relative) {
  relativeName(relative);const parts=relative.split('/');
  if(parts[0]!=='.local'||parts.some(part=>forbidden.has(part.toLowerCase())))return null;
  const profile=parts.findIndex(part=>/^(?:webview|ebwebview)$/i.test(part)||/\.exe\.webview2$/i.test(part));
  if(profile<1||!parts.slice(profile+1,-1).some(part=>cacheParts.has(part.toLowerCase()))||/\.(?:map|yelo|gsproject|sqlite3?|jms|obj|blend|weapon|scenario)$/i.test(parts.at(-1)))return null;
  return parts.slice(0,profile+1).join('/');
}
async function processGate(root) {
  if(process.platform!=='win32')return {blocking:[]};
  const command="$ErrorActionPreference='Stop';@(Get-CimInstance Win32_Process|Where-Object{$_.Name -match '^(GuiltySpark.*|Spark-.*|halo.*|standalone|tool|invader-.*|baboon|sapien|guerilla|chupathingy.*|OpenCE.*|msedgewebview2|msedge|chrome|crashpad_handler)\\.exe$'}|Select-Object ProcessId,Name,ExecutablePath,CommandLine)|ConvertTo-Json -Depth 3 -Compress";
  const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,maxBuffer:4*1024**2});
  const rows=stdout.trim()?JSON.parse(stdout):[],processes=Array.isArray(rows)?rows:[rows];
  return {processes,blocking:processes.filter(row=>`${row.ExecutablePath??''} ${row.CommandLine??''}`.toLowerCase().includes(root.toLowerCase()))};
}
export async function planImmutableAssets({workspace,journal,excludeManifests=[],maxVaultBytes=12*GiB,gate=processGate,onProgress=()=>{},mode='assets',existingOnly=false,includeNative=false}) {
  workspace=path.resolve(workspace);journal=path.resolve(journal);
  const obsolete=path.join(workspace,'.local'),vault=path.join(workspace,'preserved','immutable-assets');
  await ordinaryPath(workspace);await ordinaryPath(obsolete);
  if(!['assets','cache'].includes(mode)||typeof existingOnly!=='boolean'||typeof includeNative!=='boolean'||(existingOnly&&mode!=='assets')||(includeNative&&!existingOnly))throw Error('Use assets or cache mode; native tag preservation requires existing-CAS-only assets mode');
  if(inside(obsolete,journal)||normal(journal)===normal(obsolete)||!Number.isSafeInteger(maxVaultBytes)||maxVaultBytes<1||maxVaultBytes>12*GiB)throw Error('A bounded journal outside .local and a <=12GiB vault are required');
  const excluded=[];
  for(const file of excludeManifests) {
    await ordinaryPath(file);if((await fs.stat(file)).size>64*1024**2)throw Error('Exclusion manifest exceeds its bound');
    const document=JSON.parse(await fs.readFile(file,'utf8'));
    if(normal(document.workspace)!==normal(workspace)||!Array.isArray(document.trees))throw Error('Exclusion plan belongs to another workspace');
    for(const tree of document.trees) {relativeName(tree.sourceRelative);if(!tree.sourceRelative.startsWith('.local/'))throw Error('Invalid excluded source');excluded.push(path.resolve(workspace,...tree.sourceRelative.split('/')));}
  }
  const processCheck=await gate(obsolete);if(processCheck.blocking?.length)throw Error('Active processes still reference obsolete asset sources');
  const skip=file=>excluded.some(root=>normal(root)===normal(file)||inside(root,file))||path.relative(obsolete,file).split(path.sep).some(part=>forbidden.has(part.toLowerCase()));
  const candidates=[],retained=[],pending=[obsolete],checkedDirectories=new Map();let visited=0,directories=0,inputBytes=0;
  while(pending.length) {
    const folder=pending.pop();if(skip(folder))continue;
    try{await ordinaryPath(folder,{cache:checkedDirectories});}catch(error){if(error.code==='ENOENT'){retained.push({path:path.relative(workspace,folder).split(path.sep).join('/'),reason:'directory disappeared during inventory or unresolved link; not eligible'});continue;}throw error;}
    if(++directories>50000||path.relative(obsolete,folder).split(path.sep).length>64)throw Error('Asset directory/depth inventory exceeds its bound');
    if(directories%1000===0)onProgress({phase:'inventory',directories,candidateFiles:candidates.length,inputBytes});
    for(const name of await fs.readdir(folder,{withFileTypes:true})) {
      const file=path.join(folder,name.name);if(skip(file))continue;
      let stat;try{stat=await fs.lstat(file);}catch(error){if(error.code==='ENOENT'){retained.push({path:path.relative(workspace,file).split(path.sep).join('/'),reason:'entry disappeared during inventory or unresolved link; not eligible'});continue;}throw error;}
      if(stat.isSymbolicLink()){retained.push({path:path.relative(workspace,file).split(path.sep).join('/'),reason:'link/reparse; never traversed'});continue;}
      if(stat.isDirectory()){pending.push(file);continue;}if(!stat.isFile())continue;
      const relative=path.relative(workspace,file).split(path.sep).join('/');
      if(mode==='assets'?(!extensions.has(path.extname(name.name).toLowerCase())&&!(includeNative&&TagNodeIO.isNativeTagPath(relative))):!cacheProfileRelative(relative))continue;
      if(++visited>(mode==='cache'||includeNative?100000:10000))throw Error('Retirement file count exceeds its bounded mode');
      if(mode==='assets')assetSourcePath(workspace,relative,{native:includeNative});
      if(stat.size>maximumFile){retained.push({path:relative,bytes:stat.size,reason:'file exceeds512MiB; source retained'});continue;}
      inputBytes+=stat.size;if(inputBytes>(mode==='cache'?4:80)*GiB)throw Error('Retirement input exceeds its bounded mode');
      candidates.push({file,relative});
    }
  }
  // Cached ancestor checks do not grant ownership: every recorded directory
  // must still be the same ordinary filesystem object after traversal.
  for(const [folder,before]of checkedDirectories){const current=await fs.lstat(folder,{bigint:true});if(!current.isDirectory()||current.isSymbolicLink()||String(current.dev)!==before.dev||String(current.ino)!==before.ino||normal(await fs.realpath(folder))!==normal(folder))throw Error('Immutable inventory ancestor changed or became a reparse alias');}
  if(!candidates.length)throw Error('No eligible immutable assets were found');
  if(mode==='cache')return planCaches({workspace,journal,processCheck,excluded,retained,candidates,checkedDirectories,onProgress});
  await ordinaryPath(vault,{missing:true});await fs.mkdir(vault,{recursive:true});await ordinaryPath(vault);
  const ownership=path.join(vault,'ownership.json');
  try {const owner=JSON.parse(await fs.readFile(ownership,'utf8'));if(owner.schemaVersion!==1||owner.kind!=='spark-private-immutable-assets'||normal(owner.workspace)!==normal(workspace))throw Error('Unknown immutable vault ownership');}
  catch(error){if(error.code!=='ENOENT')throw error;if((await fs.readdir(vault)).length)throw Error('Nonempty unowned vault refused');await fs.writeFile(ownership,JSON.stringify({schemaVersion:1,kind:'spark-private-immutable-assets',workspace,maxVaultBytes})+'\n',{flag:'wx'});}
  const nativeVault=path.join(workspace,'preserved','native-tags');
  if(includeNative){await ordinaryPath(nativeVault);const owner=JSON.parse(await fs.readFile(path.join(nativeVault,'ownership.json'),'utf8'));if(owner.schemaVersion!==1||owner.kind!=='spark-private-native-tags'||normal(owner.workspace)!==normal(workspace))throw Error('Unknown native-tag preservation owner');}
  const lock=await fs.open(path.join(vault,'preservation.lock'),'wx'),known=new Map();
  await lock.writeFile(JSON.stringify({schemaVersion:1,ownerPid:process.pid,startedAt:new Date().toISOString(),workspace}));await lock.sync();
  const manifest={schemaVersion:1,operation:'preserve-obsolete-immutable-assets',workspace,vault,existingVaultOnly:existingOnly,nativeTagsExistingOnly:includeNative,...(includeNative?{nativeVault}:{}),at:new Date().toISOString(),complete:false,sourceDeletionPerformed:false,processCheck,excludedRoots:excluded.map(p=>path.relative(workspace,p).split(path.sep).join('/')),retained,entries:[],totals:{files:0,inputBytes:0,uniqueFiles:0,uniqueBytes:0,newVaultBytes:0,duplicateBytes:0}};
  try {
    const blobs=path.join(vault,'blobs');await ordinaryPath(blobs,{missing:true});let existingBytes=0;
    for(const prefix of await fs.readdir(blobs,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error;})) {
      if(!prefix.isDirectory()||!/^[a-f0-9]{2}$/.test(prefix.name))throw Error('Unknown immutable blob directory');
      const directory=path.join(blobs,prefix.name);await ordinaryPath(directory);
      for(const name of await fs.readdir(directory)) {const file=path.join(directory,name);await ordinaryPath(file);const stat=await fs.lstat(file);if(!stat.isFile()||!/^[a-f0-9]{64}$/.test(name)||!name.startsWith(prefix.name))throw Error('Unfinished/unknown immutable blob remains protected');existingBytes+=stat.size;}
    }
    if(existingBytes>maxVaultBytes)throw Error('Existing immutable vault exceeds its preservation budget');
    for(const candidate of candidates.sort((a,b)=>a.relative.localeCompare(b.relative))) {
      await ordinaryPath(candidate.file,{cache:checkedDirectories});
      const record=await fingerprint(candidate.file,maximumFile,true),native=includeNative&&TagNodeIO.isNativeTagPath(candidate.relative),sourceVault=native?nativeVault:vault,key=`${native?'native':'immutable'}:${record.sha256}`;let saved=known.get(key);
      if(!saved) {
        const destination=blobPath(sourceVault,record.sha256);await ordinaryPath(destination,{missing:true});
        const exists=await fs.stat(destination).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
        if(!exists&&existingOnly){manifest.retained.push({path:candidate.relative,...record,reason:'No existing independently preserved blob; source retained without vault growth'});continue;}
        if(!exists) {
          if(existingBytes+record.bytes>maxVaultBytes)throw Error('Unique immutable assets exceed12GiB; all remaining sources retained');
          const volume=await fs.statfs(vault);if(Number(volume.bavail)*Number(volume.bsize)<record.bytes+4*GiB)throw Error('Immutable preservation would violate4GiB free-space reserve');
          await fs.mkdir(path.dirname(destination),{recursive:true});await ordinaryPath(path.dirname(destination));
          const temporary=path.join(path.dirname(destination),'.pending-'+crypto.randomUUID());await fs.copyFile(candidate.file,temporary,constants.COPYFILE_EXCL);
          const copy=await fingerprint(temporary,maximumFile);if(copy.sha256!==record.sha256||copy.bytes!==record.bytes)throw Error('Immutable preservation copy changed; partial blob retained');
          const fresh=await fingerprint(candidate.file,maximumFile,true);if(!same(record,fresh)||record.sha256!==fresh.sha256)throw Error('Immutable source changed during preservation');
          await fs.rename(temporary,destination);existingBytes+=record.bytes;manifest.totals.newVaultBytes+=record.bytes;
        }
        const verified=await fingerprint(destination,maximumFile);if(verified.sha256!==record.sha256||verified.bytes!==record.bytes||(await fs.lstat(destination)).nlink!==1)throw Error('Preserved immutable blob differs or shares writable hardlinks');
        saved=path.relative(workspace,destination).split(path.sep).join('/');known.set(key,saved);manifest.totals.uniqueFiles++;manifest.totals.uniqueBytes+=record.bytes;
      }else manifest.totals.duplicateBytes+=record.bytes;
      manifest.entries.push({sourceRelative:candidate.relative,...record,blobRelative:saved,...(native?{preservationKind:'native-tags'}:{})});manifest.totals.files++;manifest.totals.inputBytes+=record.bytes;
      if(manifest.totals.files%25===0) {onProgress(manifest.totals);await atomicJson(path.join(journal,'immutable-assets-progress.json'),manifest);}
    }
    for(const [folder,before]of checkedDirectories){const current=await fs.lstat(folder,{bigint:true});if(!current.isDirectory()||current.isSymbolicLink()||String(current.dev)!==before.dev||String(current.ino)!==before.ino||normal(await fs.realpath(folder))!==normal(folder))throw Error('Immutable source ancestor changed before manifest sealing');}
    manifest.guardSha256=(await fingerprint(fileURLToPath(new URL('./windows-sealed-files.cs',import.meta.url)),4*1024**2)).sha256;
    manifest.workerSha256=(await fingerprint(fileURLToPath(new URL('./retire-local-assets.ps1',import.meta.url)),2*1024**2)).sha256;
    manifest.complete=true;const file=path.join(journal,'immutable-assets-plan.json'),sha256=await atomicJson(file,manifest);return {file,sha256,totals:manifest.totals,retained:manifest.retained.length,excludedRoots:excluded.length};
  }catch(error){await atomicJson(path.join(journal,'immutable-assets-interrupted.json'),{...manifest,error:String(error)});throw error;}
  finally{await lock.close();await fs.unlink(path.join(vault,'preservation.lock'));}
}
async function planCaches({workspace,journal,processCheck,excluded,retained,candidates,checkedDirectories,onProgress}) {
  const owners=new Map(),ownerCache=new Map(),obsolete=path.join(workspace,'.local');
  const plan={schemaVersion:1,operation:'dispose-obsolete-webview-caches',workspace,at:new Date().toISOString(),complete:false,sourceDeletionPerformed:false,processCheck,excludedRoots:excluded.map(p=>path.relative(workspace,p).split(path.sep).join('/')),retained,cacheOwners:[],entries:[],totals:{files:0,inputBytes:0,uniqueFiles:0,uniqueBytes:0,newVaultBytes:0}};
  for(const candidate of candidates) {
    const profileRelative=cacheProfileRelative(candidate.relative);let owner=ownerCache.get(profileRelative);
    if(owner===undefined) {
      let folder=path.dirname(path.resolve(workspace,...profileRelative.split('/')));owner=null;
      for(let depth=0;depth<6&&inside(obsolete,folder);depth++,folder=path.dirname(folder)) {
        await ordinaryPath(folder,{cache:checkedDirectories});
        const apps=(await fs.readdir(folder,{withFileTypes:true})).filter(row=>row.isFile()&&/^(?:GuiltySpark|Spark[-_]).*\.exe$/i.test(row.name));
        if(apps.length) {const app=path.join(folder,apps[0].name),proof=await fingerprint(app,maximumFile);owner={profileRelative,applicationRelative:path.relative(workspace,app).split(path.sep).join('/'),...proof};owners.set(profileRelative,owner);break;}
      }
      ownerCache.set(profileRelative,owner);
    }
    if(!owner){retained.push({path:candidate.relative,reason:'No adjacent preserved Spark harness application proves QA profile ownership'});continue;}
    await ordinaryPath(candidate.file,{cache:checkedDirectories});const record=await fingerprint(candidate.file,maximumFile,true);
    plan.entries.push({sourceRelative:candidate.relative,...record,ownerProfileRelative:profileRelative,classification:'regenerable-owned-webview-cache'});plan.totals.files++;plan.totals.inputBytes+=record.bytes;
    if(plan.totals.files%500===0)onProgress({phase:'cache-hashing',...plan.totals});
  }
  for(const [folder,before]of checkedDirectories){const current=await fs.lstat(folder,{bigint:true});if(!current.isDirectory()||current.isSymbolicLink()||String(current.dev)!==before.dev||String(current.ino)!==before.ino||normal(await fs.realpath(folder))!==normal(folder))throw Error('Cache source ancestor changed before manifest sealing');}
  if(!plan.entries.length)throw Error('No proven owned QA cache files were eligible');
  plan.cacheOwners=[...owners.values()];plan.guardSha256=(await fingerprint(fileURLToPath(new URL('./windows-sealed-files.cs',import.meta.url)),4*1024**2)).sha256;plan.complete=true;
  const file=path.join(journal,'webview-cache-plan.json'),sha256=await atomicJson(file,plan);return {file,sha256,totals:plan.totals,retained:retained.length,profiles:owners.size,excludedRoots:excluded.length};
}
export async function purgeImmutableAssets({manifest,sha256,reviewedSha256,journal,gate=processGate}) {
  if(process.platform!=='win32')throw Error('Immutable source retirement requires the Windows same-handle worker');
  if(!/^[a-f0-9]{64}$/.test(sha256)||sha256!==reviewedSha256)throw Error('Explicit review of the exact immutable manifest SHA is required');
  await ordinaryPath(manifest);if((await fs.stat(manifest)).size>64*1024**2)throw Error('Reviewed immutable manifest exceeds64MiB');const bytes=await fs.readFile(manifest);
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==sha256)throw Error('Reviewed immutable manifest changed');
  const plan=JSON.parse(bytes);if(!['preserve-obsolete-immutable-assets','dispose-obsolete-webview-caches','retire-obsolete-recovery-archive'].includes(plan.operation)||!plan.complete||plan.sourceDeletionPerformed)throw Error('Invalid immutable plan');
  const nativeExtensions=[...new Set(plan.entries.filter(entry=>entry.preservationKind==='native-tags').map(entry=>{if(!plan.existingVaultOnly||!plan.nativeTagsExistingOnly||!TagNodeIO.isNativeTagPath(entry.sourceRelative))throw Error('Native-tag disposal requires a recognized class and existing-CAS-only plan');return path.posix.extname(entry.sourceRelative).toLowerCase();}))].sort().join('|');
  if((await gate(path.join(plan.workspace,'.local'))).blocking?.length)throw Error('Active immutable sources refused');
  const invocation=await trustedScriptInvocation(fileURLToPath(new URL('./retire-local-assets.ps1',import.meta.url)),fileURLToPath(new URL('./windows-sealed-files.cs',import.meta.url)),{Manifest:path.resolve(manifest),PlanSha256:sha256,Journal:path.resolve(journal),NativeTagExtensions:nativeExtensions});
  try {const {stdout}=await promisify(execFile)('powershell.exe',invocation.args,{env:invocation.env,windowsHide:true,maxBuffer:4*1024**2});return JSON.parse(stdout.trim());}
  catch(error){throw Error(error.stderr?.trim()||error.message);}
}
export async function sealImmutableSubset({interrupted,sha256,journal}) {
  await ordinaryPath(interrupted);const bytes=await fs.readFile(interrupted);
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==sha256)throw Error('Interrupted immutable checkpoint hash changed');
  const plan=JSON.parse(bytes);
  if(plan.operation!=='preserve-obsolete-immutable-assets'||plan.complete||plan.sourceDeletionPerformed||!plan.error?.includes('Unique immutable assets exceed12GiB')||!plan.entries?.length)throw Error('Only the completed entries of this bounded preservation checkpoint may be sealed');
  const unique=new Map(),totals={files:0,inputBytes:0,uniqueFiles:0,uniqueBytes:0,newVaultBytes:plan.totals.newVaultBytes,duplicateBytes:0};
  for(const entry of plan.entries){
    const source=assetSourcePath(plan.workspace,entry.sourceRelative),current=await fs.lstat(source,{bigint:true});
    if(!current.isFile()||current.isSymbolicLink()||!same(TagNodeIO.identity(current),entry))throw Error('Subset source identity changed; fresh inventory required');
    const saved=blobPath(plan.vault,entry.sha256);await ordinaryPath(saved);const stat=await fs.lstat(saved);
    if(!stat.isFile()||stat.nlink!==1||stat.size!==entry.bytes||path.relative(plan.workspace,saved).split(path.sep).join('/')!==entry.blobRelative)throw Error('Subset recovery blob no longer matches recorded identity');
    totals.files++;totals.inputBytes+=entry.bytes;if(unique.has(entry.sha256))totals.duplicateBytes+=entry.bytes;else{unique.set(entry.sha256,entry.bytes);totals.uniqueFiles++;totals.uniqueBytes+=entry.bytes;}
  }
  for(const field of ['files','inputBytes','uniqueFiles','uniqueBytes','duplicateBytes'])if(totals[field]!==plan.totals[field])throw Error('Interrupted subset totals do not agree');
  const output=path.join(path.resolve(journal),'immutable-assets-subset-plan.json');await fs.stat(output).then(()=>{throw Error('A reviewed subset plan must never be overwritten');},error=>{if(error.code!=='ENOENT')throw error;});
  const guardSha256=(await fingerprint(fileURLToPath(new URL('./windows-sealed-files.cs',import.meta.url)),4*1024**2)).sha256;
  const sealed={...plan,totals,complete:true,error:undefined,subsetOfOriginalInventory:true,subsetReason:'Unique preservation budget reached; only completed hash-verified entries are eligible',unretiredSourcesProtected:true,interruptedManifest:interrupted,interruptedManifestSha256:sha256,sealingDoesNotReplaceApplyReadback:true,guardSha256,sealedAt:new Date().toISOString()};
  const resultSha=await atomicJson(output,sealed);return{file:output,sha256:resultSha,totals,subsetOfOriginalInventory:true};
}
export async function sealImmutableRemainder({manifest,sha256,events,eventsSha256,journal}) {
  await ordinaryPath(manifest);await ordinaryPath(events);
  const bytes=await fs.readFile(manifest),eventBytes=await fs.readFile(events);
  if(bytes.length>64*1024**2||eventBytes.length>64*1024**2||crypto.createHash('sha256').update(bytes).digest('hex')!==sha256||crypto.createHash('sha256').update(eventBytes).digest('hex')!==eventsSha256)throw Error('Reviewed predecessor plan or journal changed');
  const previous=JSON.parse(bytes),log=eventBytes.toString('utf8').trim().split(/\r?\n/).map(line=>JSON.parse(line));
  if(previous.operation!=='preserve-obsolete-immutable-assets'||!previous.complete||previous.sourceDeletionPerformed||log[0]?.event!=='all-source-and-blob-hashes-verified'||log[0].manifestSha256!==sha256||log.at(-1)?.event!=='stopped')throw Error('Only an interrupted, fully verified native retirement can resume');
  const removed=log.filter(row=>row.event==='deleted-verified-duplicate');let removedBytes=0;
  for(let n=0;n<removed.length;n++){
    const row=removed[n],entry=previous.entries[n];if(!entry||row.sourceRelative!==entry.sourceRelative||row.sha256!==entry.sha256||row.blobRelative!==entry.blobRelative||row.bytes!==entry.bytes||row.filesRemoved!==n+1)throw Error('Durable retirement acknowledgement differs from the predecessor');
    await fs.lstat(assetSourcePath(previous.workspace,entry.sourceRelative)).then(()=>{throw Error('Acknowledged source has reappeared');},error=>{if(error.code!=='ENOENT')throw error;});removedBytes+=entry.bytes;
  }
  if(log.at(-1).filesRemoved!==removed.length||log.at(-1).logicalBytesRemoved!==removedBytes)throw Error('Stopped retirement totals differ');
  const entries=previous.entries.slice(removed.length),known=new Map(),totals={files:entries.length,inputBytes:0,uniqueFiles:0,uniqueBytes:0,newVaultBytes:0,duplicateBytes:0};
  for(const entry of entries){await ordinaryPath(assetSourcePath(previous.workspace,entry.sourceRelative));const current=await fs.lstat(assetSourcePath(previous.workspace,entry.sourceRelative),{bigint:true});if(!current.isFile()||!same(TagNodeIO.identity(current),entry))throw Error('Unretired source identity changed');const saved=blobPath(previous.vault,entry.sha256);await ordinaryPath(saved);const stat=await fs.lstat(saved);if(!stat.isFile()||stat.nlink!==1||stat.size!==entry.bytes)throw Error('Retirement recovery blob changed');totals.inputBytes+=entry.bytes;if(known.has(entry.sha256))totals.duplicateBytes+=entry.bytes;else{known.set(entry.sha256,entry.bytes);totals.uniqueFiles++;totals.uniqueBytes+=entry.bytes;}}
  const workerSha256=(await fingerprint(fileURLToPath(new URL('./retire-local-assets.ps1',import.meta.url)),2*1024**2)).sha256;
  const plan={...previous,entries,totals,workerSha256,resumeOfManifest:manifest,resumeOfManifestSha256:sha256,acknowledgementJournal:events,acknowledgementJournalSha256:eventsSha256,previouslyRemovedFiles:removed.length,previouslyRemovedBytes:removedBytes,sealedAt:new Date().toISOString()};
  const file=path.join(path.resolve(journal),'immutable-assets-remainder-plan.json');await fs.stat(file).then(()=>{throw Error('A reviewed remainder must never be overwritten');},error=>{if(error.code!=='ENOENT')throw error;});return {file,sha256:await atomicJson(file,plan),workerSha256,totals,previouslyRemovedFiles:removed.length,previouslyRemovedBytes:removedBytes};
}
export async function planArchiveRetirement({workspace,receipt,receiptSha256,journal,gate=processGate}) {
  workspace=path.resolve(workspace);receipt=path.resolve(receipt);await ordinaryPath(workspace);await ordinaryPath(receipt);
  const receiptBytes=await fs.readFile(receipt);if(receiptBytes.length>4*1024**2||crypto.createHash('sha256').update(receiptBytes).digest('hex')!==receiptSha256)throw Error('Recovery receipt identity changed');
  const proof=JSON.parse(receiptBytes),root=path.join(workspace,'preserved','recovery-metadata');
  if(proof.schemaVersion!==1||proof.kind!=='spark-local-recovery-copy-receipt'||!proof.complete||!proof.allObjectHashesVerified||!proof.regularMembersOnly||proof.linksFollowed!==0||proof.sourceDeletionPerformed||normal(proof.workspace)!==normal(workspace)||!inside(root,receipt)||path.dirname(proof.archive)!==path.dirname(receipt)||path.dirname(proof.catalog)!==path.dirname(receipt))throw Error('Recovery archive is not a complete, independently read-back owned preservation');
  const archive=await fingerprint(proof.archive,8*GiB+512*1024**2);if(archive.sha256!==proof.archiveSha256||archive.bytes!==proof.archiveBytes)throw Error('Recovery archive bytes changed');
  await ordinaryPath(proof.catalog);const catalogBytes=await fs.readFile(proof.catalog);if(catalogBytes.length>128*1024**2||crypto.createHash('sha256').update(catalogBytes).digest('hex')!==proof.catalogSha256)throw Error('Recovery catalog changed');
  const catalog=JSON.parse(catalogBytes);if(catalog.schemaVersion!==1||catalog.kind!=='spark-local-recovery-catalog'||normal(catalog.workspace)!==normal(workspace)||!Array.isArray(catalog.files)||catalog.files.length!==proof.files||catalog.sourceDeletionPerformed)throw Error('Recovery catalog does not match verified receipt');
  const processCheck=await gate(path.join(workspace,'.local'));if(processCheck.blocking?.length)throw Error('Active archive sources refused');
  const entries=[],seen=new Set();let inputBytes=0,externalIndexes=0;
  for(const entry of catalog.files){if(entry.namespace==='external-recovery-index'){externalIndexes++;continue;}if(entry.namespace)throw Error('Unknown recovery namespace');relativeName(entry.relative);if(!entry.relative.startsWith('.local/')||!inside(path.join(workspace,'.local'),path.resolve(workspace,...entry.relative.split('/')))||seen.has(entry.relative.toLowerCase()))throw Error('Recovery source namespace differs');seen.add(entry.relative.toLowerCase());
    if(!/^[a-f0-9]{64}$/.test(entry.sha256)||entry.object!==`objects/${entry.sha256.slice(0,2)}/${entry.sha256}`)throw Error('Recovery object mapping differs');const source=path.resolve(workspace,...entry.relative.split('/'));await ordinaryPath(source);const stat=await fs.lstat(source,{bigint:true});if(!stat.isFile()||!same(TagNodeIO.identity(stat),entry)||!Number.isSafeInteger(entry.links)||entry.links<1||entry.links!==Number(stat.nlink))throw Error('Recovery source changed before retirement planning');inputBytes+=entry.bytes;entries.push({sourceRelative:entry.relative,sha256:entry.sha256,dev:entry.dev,ino:entry.ino,bytes:entry.bytes,mtimeNs:entry.mtimeNs,ctimeNs:entry.ctimeNs,links:entry.links,object:entry.object});
  }
  if(!entries.length||entries.length>100000||inputBytes>16*GiB)throw Error('Recovery retirement exceeds its explicit bounds');
  const guardSha256=(await fingerprint(fileURLToPath(new URL('./windows-sealed-files.cs',import.meta.url)),4*1024**2)).sha256,workerSha256=(await fingerprint(fileURLToPath(new URL('./retire-local-assets.ps1',import.meta.url)),2*1024**2)).sha256;
  const plan={schemaVersion:1,operation:'retire-obsolete-recovery-archive',workspace,complete:true,hardlinkLifecycle:true,sourceDeletionPerformed:false,at:new Date().toISOString(),guardSha256,workerSha256,processCheck,excludedRoots:[],entries,archiveProof:{...proof,receipt:path.resolve(receipt),receiptSha256,localSourceCount:entries.length,externalIndexCount:externalIndexes},totals:{files:entries.length,inputBytes,uniqueFiles:0,uniqueBytes:0,newVaultBytes:0}};
  const file=path.join(path.resolve(journal),'archive-retirement-plan.json');await fs.stat(file).then(()=>{throw Error('Reviewed archive retirement plan must never be overwritten');},error=>{if(error.code!=='ENOENT')throw error;});return {file,sha256:await atomicJson(file,plan),workerSha256,totals:plan.totals,archiveSha256:archive.sha256,receiptSha256};
}
export async function resumeArchiveRetirement({manifest,sha256,acknowledgements,journal,gate=processGate}) {
  async function checkedJson(file,expected,max=128*1024**2){await ordinaryPath(file);const bytes=await fs.readFile(file);if(bytes.length>max||crypto.createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Recovery predecessor proof changed');return JSON.parse(bytes);}
  const previous=await checkedJson(manifest,sha256,64*1024**2);if(previous.operation!=='retire-obsolete-recovery-archive'||!previous.complete||previous.sourceDeletionPerformed||!Array.isArray(acknowledgements)||!acknowledgements.length||acknowledgements.length>8)throw Error('Invalid archive recovery continuation');
  const workspace=path.resolve(previous.workspace),targetCatalog=await checkedJson(previous.archiveProof.catalog,previous.archiveProof.catalogSha256),baselines=new Map(),removed=new Map(),ownUnlinks=new Map(),catalogs=new Map([[previous.archiveProof.catalog,targetCatalog]]);
  for(const proof of acknowledgements){
    const predecessor=await checkedJson(proof.manifest,proof.manifestSha256,64*1024**2);if(predecessor.operation!=='retire-obsolete-recovery-archive'||normal(predecessor.workspace)!==normal(workspace))throw Error('Acknowledged plan is outside this recovery owner');
    await ordinaryPath(proof.events);const bytes=await fs.readFile(proof.events);if(bytes.length>64*1024**2||crypto.createHash('sha256').update(bytes).digest('hex')!==proof.eventsSha256)throw Error('Acknowledgement journal changed');const events=bytes.toString('utf8').trim().split(/\r?\n/).map(JSON.parse),last=events.at(-1);
    if(events[0]?.event!=='all-source-and-blob-hashes-verified'||events[0].manifestSha256!==proof.manifestSha256||!['stopped','complete'].includes(last?.event))throw Error('No durable verified archive retirement acknowledgement');
    const deleted=events.filter(row=>row.event==='deleted-archive-preserved-source');let bytesRemoved=0;
    for(let n=0;n<deleted.length;n++){const event=deleted[n],entry=predecessor.entries[n];if(!entry||event.sourceRelative!==entry.sourceRelative||event.sha256!==entry.sha256||event.object!==entry.object||event.bytes!==entry.bytes||event.filesRemoved!==n+1||removed.has(entry.sourceRelative.toLowerCase()))throw Error('Archive acknowledgement sequence differs');const source=path.resolve(workspace,...entry.sourceRelative.split('/'));await fs.lstat(source).then(()=>{throw Error('Acknowledged archive source reappeared');},error=>{if(error.code!=='ENOENT')throw error;});removed.set(entry.sourceRelative.toLowerCase(),entry);const key=`${entry.dev}/${entry.ino}`;ownUnlinks.set(key,(ownUnlinks.get(key)??0)+1);bytesRemoved+=entry.bytes;}
    const result=last.event==='complete'?last.result:last;if(result.filesRemoved!==deleted.length||result.logicalBytesRemoved!==bytesRemoved)throw Error('Archive acknowledgement totals differ');
    if(!catalogs.has(predecessor.archiveProof.catalog))catalogs.set(predecessor.archiveProof.catalog,await checkedJson(predecessor.archiveProof.catalog,predecessor.archiveProof.catalogSha256));
  }
  for(const catalog of catalogs.values())for(const row of catalog.files){if(row.namespace)continue;if(!Number.isSafeInteger(row.links)||row.links<1)throw Error('Archived native link baseline is missing');const key=`${row.dev}/${row.ino}`,known=baselines.get(key);if(known&&(known.sha256!==row.sha256||known.bytes!==row.bytes||known.mtimeNs!==row.mtimeNs))throw Error('Conflicting original recovery inode');if(!known||row.links>known.links)baselines.set(key,row);}
  const receipt=await checkedJson(previous.archiveProof.receipt,previous.archiveProof.receiptSha256,4*1024**2);const archive=await fingerprint(receipt.archive,8*GiB+512*1024**2);if(archive.sha256!==receipt.archiveSha256||archive.bytes!==receipt.archiveBytes||!receipt.allObjectHashesVerified||!receipt.regularMembersOnly||!receipt.complete)throw Error('Recovery archive proof changed');
  if((await gate(path.join(workspace,'.local'))).blocking?.length)throw Error('Active recovery sources refused');
  const entries=[],checkedDirectories=new Map();let bytes=0,priorRetired=0,rebased=0,externalIndexes=0;
  for(const row of targetCatalog.files){if(row.namespace==='external-recovery-index'){externalIndexes++;continue;}if(row.namespace)throw Error('Unknown recovery namespace');const key=`${row.dev}/${row.ino}`,ack=removed.get(row.relative.toLowerCase());if(ack){if(ack.sha256!==row.sha256||ack.dev!==row.dev||ack.ino!==row.ino)throw Error('Retired row differs from archived original');priorRetired++;continue;}
    relativeName(row.relative);if(!row.relative.startsWith('.local/'))throw Error('Recovery source leaves old local root');const file=path.resolve(workspace,...row.relative.split('/'));await ordinaryPath(file,{cache:checkedDirectories});const stat=await fs.lstat(file,{bigint:true}),current=await fingerprint(file,8*GiB,true),baseline=baselines.get(key),own=ownUnlinks.get(key)??0,after=await fs.lstat(file,{bigint:true});
    if(!same(TagNodeIO.identity(stat),current)||!same(TagNodeIO.identity(after),current)||stat.nlink!==after.nlink||!baseline||Number(stat.nlink)!==baseline.links-own||current.dev!==row.dev||current.ino!==row.ino||current.bytes!==row.bytes||current.mtimeNs!==row.mtimeNs||current.sha256!==row.sha256||(current.ctimeNs!==row.ctimeNs&&own===0))throw Error(`Recovery source changed outside proven own-unlink lifecycle: ${row.relative}`);
    if(current.ctimeNs!==row.ctimeNs)rebased++;entries.push({sourceRelative:row.relative,...current,links:Number(stat.nlink),object:row.object,archivedOriginalCtimeNs:row.ctimeNs,originalNativeLinks:baseline.links,acknowledgedPriorOwnUnlinks:own});bytes+=current.bytes;
  }
  for(const [folder,before]of checkedDirectories){const after=await fs.lstat(folder,{bigint:true});if(!after.isDirectory()||after.isSymbolicLink()||String(after.dev)!==before.dev||String(after.ino)!==before.ino)throw Error('Recovery source ancestor changed');}
  if(!entries.length||entries.length>100000||bytes>16*GiB)throw Error('Recovery continuation exceeds bounds');
  const workerSha256=(await fingerprint(fileURLToPath(new URL('./retire-local-assets.ps1',import.meta.url)),2*1024**2)).sha256,guardSha256=(await fingerprint(fileURLToPath(new URL('./windows-sealed-files.cs',import.meta.url)),4*1024**2)).sha256;
  const plan={...previous,entries,hardlinkLifecycle:true,workerSha256,guardSha256,at:new Date().toISOString(),resumeOfManifest:manifest,resumeOfManifestSha256:sha256,acknowledgementProofs:acknowledgements,priorRetiredLocalSources:priorRetired,metadataOnlyHardlinkRebases:rebased,archiveProof:{...previous.archiveProof,localSourceCount:entries.length,priorRetiredLocalSourceCount:priorRetired,externalIndexCount:externalIndexes},totals:{files:entries.length,inputBytes:bytes,uniqueFiles:0,uniqueBytes:0,newVaultBytes:0}};
  const file=path.join(path.resolve(journal),'archive-retirement-remainder-plan.json');await fs.stat(file).then(()=>{throw Error('Archive continuation must never overwrite a reviewed plan');},error=>{if(error.code!=='ENOENT')throw error;});return{file,sha256:await atomicJson(file,plan),workerSha256,totals:plan.totals,priorRetiredLocalSources:priorRetired,metadataOnlyHardlinkRebases:rebased};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=new Map();for(let n=2;n<process.argv.length;n+=2)args.set(process.argv[n],process.argv[n+1]);
  if(!args.get('--workspace')||!args.get('--journal')||[...args.keys()].some(key=>!['--workspace','--journal','--exclude-native','--exclude-cargo','--mode'].includes(key)))throw Error('Use --workspace canonical-root --journal fresh-external-journal --exclude-native plan.json --exclude-cargo plan.json [--mode cache]');
  const result=await planImmutableAssets({workspace:args.get('--workspace'),journal:args.get('--journal'),mode:args.get('--mode')??'assets',excludeManifests:['--exclude-native','--exclude-cargo'].flatMap(key=>args.has(key)?[args.get(key)]:[]),onProgress:counts=>console.log(JSON.stringify({progress:true,...counts}))});console.log(JSON.stringify({complete:true,...result}));
}
