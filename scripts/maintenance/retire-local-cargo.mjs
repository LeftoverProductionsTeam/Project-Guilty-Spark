/** Bounded, content-verified rescue and explicitly reviewed Cargo retirement.
 * Sources are explicit Cargo-tagged caches below this repository's .local;
 * the active root target is never eligible. A plan requires separate review.
 */
import fs from 'node:fs/promises';
import {constants,createReadStream} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {trustedScriptInvocation} from './windows-trusted-script.mjs';
const run=promisify(execFile),GiB=1024**3;
const signature='Signature: 8a477f597d28d172789f06886806bc55';
const normal=p=>process.platform==='win32'?path.resolve(p).toLowerCase():path.resolve(p);
const inside=(root,p)=>{const r=path.relative(root,p);return r!==''&&r!=='..'&&!r.startsWith(`..${path.sep}`)&&!path.isAbsolute(r);};
const identity=s=>({dev:String(s.dev),ino:String(s.ino),bytes:Number(s.size),mtimeNs:String(s.mtimeNs),ctimeNs:String(s.ctimeNs)});
const same=(a,b)=>['dev','ino','bytes','mtimeNs','ctimeNs'].every(k=>a[k]===b[k]);
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function relativeName(value){
  if(typeof value!=='string'||!value||value.includes('\\')||value.includes(':')||/[\x00-\x1f]/.test(value)||value.split('/').some(p=>!p||p==='.'||p==='..'||p.endsWith('.')||p.endsWith(' ')))throw Error('Unsafe relative Cargo path');
  return value;
}
function sourcePath(workspace,relative){
  relativeName(relative);
  if(relative!=='.local/build/cargo'&&!(relative.startsWith('.local/')&&relative.endsWith('/target')))throw Error('Only explicit obsolete Cargo cache roots are allowed');
  if(relative.split('/').some(p=>['.git','.toolchain','node_modules'].includes(p)))throw Error('Protected source/dependency path refused');
  const full=path.resolve(workspace,...relative.split('/'));
  if(!inside(path.join(workspace,'.local'),full)||inside(path.join(workspace,'target'),full)||normal(full)===normal(path.join(workspace,'target')))throw Error('Source leaves obsolete .local or reaches active target');
  return full;
}
async function ordinary(full,{missing=false}={}){
  const parts=[];for(let p=path.resolve(full);;p=path.dirname(p)){parts.push(p);if(p===path.dirname(p))break;}
  for(const p of parts.reverse()){
    let s;try{s=await fs.lstat(p);}catch(e){if(missing&&e.code==='ENOENT')return;throw e;}
    if(s.isSymbolicLink()||normal(await fs.realpath(p))!==normal(p))throw Error(`Linked/aliased path refused: ${p}`);
  }
}
async function fingerprint(file,maxBytes=2*GiB){
  const before=await fs.lstat(file,{bigint:true});if(!before.isFile()||before.isSymbolicLink()||before.size>BigInt(maxBytes))throw Error(`Not a bounded ordinary file: ${file}`);
  const h=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try{
    if(!same(identity(before),identity(await h.stat({bigint:true}))))throw Error(`Replaced file: ${file}`);
    const hash=crypto.createHash('sha256');let bytes=0;
    for await(const chunk of createReadStream('',{fd:h.fd,autoClose:false})){bytes+=chunk.length;if(bytes>maxBytes)throw Error('File grew past bound');hash.update(chunk);}
    const after=identity(await h.stat({bigint:true}));
    if(!same(identity(before),after)||!same(after,identity(await fs.lstat(file,{bigint:true})))||bytes!==after.bytes)throw Error(`Changed file: ${file}`);
    return {...after,sha256:hash.digest('hex')};
  }finally{await h.close();}
}
async function jsonNew(file,value){await ordinary(path.dirname(file),{missing:true});await fs.mkdir(path.dirname(file),{recursive:true});await ordinary(file,{missing:true});const bytes=JSON.stringify(value,null,2)+'\n';await fs.writeFile(file,bytes,{flag:'wx'});return digest(bytes);}
export function rootsFromInventory(inventory,workspace){
  if(normal(inventory.canonicalDirectory??inventory.storage?.root??'')!==normal(workspace))throw Error('Inventory belongs to another workspace');
  return [...new Set((inventory.storage?.directories??[]).map(d=>d.relative).filter(r=>r==='.local/build/cargo'||typeof r==='string'&&r.startsWith('.local/')&&r.endsWith('/target')))].sort();
}
async function windowsGate(roots){
  if(process.platform!=='win32')return {reparseChecked:true,processes:[],blocking:[]};
  const script=`$ErrorActionPreference='Stop';$roots=ConvertFrom-Json $env:SPARK_OLD_CARGO_ROOTS; $count=0; foreach($root in $roots){$pending=[System.Collections.Generic.Stack[string]]::new();$pending.Push($root);while($pending.Count){$p=$pending.Pop();$i=Get-Item -LiteralPath $p -Force;if(($i.Attributes -band [IO.FileAttributes]::ReparsePoint)-ne 0){throw "Reparse point refused: $p"};if(++$count -gt 150000){throw 'Bounded Cargo preflight limit exceeded'};if($i.PSIsContainer){foreach($c in Get-ChildItem -LiteralPath $p -Force){$pending.Push($c.FullName)}}}};$rows=@(Get-CimInstance Win32_Process|Where-Object{$_.Name -match '^(cargo|rustc|rustup|cl|link|lld-link|rc|mt|GuiltySpark.*|Spark-workflows|qa_.*)\\.exe$'}|Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine);[pscustomobject]@{reparseChecked=$true;checkedPaths=$count;processes=$rows}|ConvertTo-Json -Depth 3 -Compress`;
  const {stdout}=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{env:{...process.env,SPARK_OLD_CARGO_ROOTS:JSON.stringify(roots)},maxBuffer:4*1024**2,windowsHide:true});
  const result=JSON.parse(stdout.trim());result.blocking=result.processes.filter(p=>roots.some(root=>`${p.ExecutablePath??''} ${p.CommandLine??''}`.toLowerCase().includes(root.toLowerCase())));
  if(result.blocking.length)throw Error(`Active processes reference obsolete Cargo: ${result.blocking.map(p=>p.ProcessId).join(',')}`);
  return result;
}
const rescueRequired=relative=>{
  if(/\.(exe|dll|pdb|msi|msix|appx|appxbundle|dmg|appimage|deb|rpm|zip|nupkg)$/i.test(relative)||relative.split('/').includes('bundle'))return true;
  const name=path.posix.basename(relative);
  if(relative.split('/').includes('.fingerprint')&&/^(?:(?:dep|output)-)?(?:bin|lib|test-bin|test-lib|test-integration-test|example|build-script|run-build-script)-/.test(name)&&['','.json'].includes(path.posix.extname(name)))return false;
  if(['CACHEDIR.TAG','.rustc_info.json','.cargo-lock','.cargo-build-lock','.cargo-artifact-lock','invoked.timestamp'].includes(name))return false;
  if(/\.(rlib|rmeta|obj|o|d|a|lib|exp|ilk|pch|res)$/i.test(name))return false;
  if(relative.split('/').includes('incremental')&&/\.(bin|cache|lock)$/i.test(name))return false;
  // Unrecognized source, maps, project data and generated source are retained
  // conservatively rather than inferred disposable merely from Cargo's marker.
  return true;
};
export async function planCargoCaches({workspace,roots,journal,processGate=windowsGate,onProgress=()=>{}}){
  workspace=path.resolve(workspace);journal=path.resolve(journal);await ordinary(workspace);
  if(!roots?.length||roots.length>64||inside(path.join(workspace,'.local'),journal)||normal(journal)===normal(path.join(workspace,'.local')))throw Error('Explicit bounded sources and a journal outside .local are required');
  const selected=[];for(const relative of [...new Set(roots)].sort()){
    const root=sourcePath(workspace,relative);try{await ordinary(root);const s=await fs.lstat(root);if(!s.isDirectory())throw Error('Cargo source is not a real directory');if(!(await fs.readFile(path.join(root,'CACHEDIR.TAG'),'utf8')).startsWith(signature))throw Error('Invalid Cargo cache marker');selected.push({relative,root});}catch(e){throw Error(`Cargo root refused (${relative}): ${e.message}`);}
  }
  if(selected.some(a=>selected.some(b=>a!==b&&inside(a.root,b.root))))throw Error('Overlapping Cargo roots refused');
  const gate=await processGate(selected.map(r=>r.root));if(gate.blocking?.length)throw Error('Active Cargo cache refused');
  const vault=path.join(workspace,'preserved','development-builds');await ordinary(vault,{missing:true});await fs.mkdir(vault,{recursive:true});await ordinary(vault);
  const ownership=path.join(vault,'ownership.json');
  try{const owner=JSON.parse(await fs.readFile(ownership,'utf8'));if(owner.kind!=='spark-preserved-development-builds'||normal(owner.workspace)!==normal(workspace))throw Error('Unknown binary preservation owner');}catch(e){if(e.code!=='ENOENT')throw e;if((await fs.readdir(vault)).length)throw Error('Nonempty unowned binary preservation folder');await jsonNew(ownership,{schemaVersion:1,kind:'spark-preserved-development-builds',workspace});}
  const lock=await fs.open(path.join(vault,'rescue.lock'),'wx');
  const plan={schemaVersion:1,operation:'rescue-obsolete-cargo',workspace,vault,at:new Date().toISOString(),sourceDeletionPerformed:false,deletionAuthorized:false,complete:false,processCheck:gate,trees:[],totals:{files:0,directories:0,inputBytes:0,rescueFiles:0,rescueUniqueFiles:0,rescueUniqueBytes:0,regenerableFiles:0,regenerableBytes:0}};
  const copies=new Map();let directories=0;
  try{
    for(const {relative,root} of selected){
      const entries=[],dirs=[],rootBefore=identity(await fs.lstat(root,{bigint:true}));
      const scan=async(folder,prefix='',depth=0)=>{
        await ordinary(folder);const before=identity(await fs.lstat(folder,{bigint:true}));if(++directories>50000||depth>64)throw Error('Cargo directory bound exceeded');
        const names=await fs.readdir(folder,{withFileTypes:true});names.sort((a,b)=>a.name.localeCompare(b.name));
        for(const name of names){const rel=relativeName(prefix+name.name),file=path.join(folder,name.name),s=await fs.lstat(file,{bigint:true});if(s.isSymbolicLink())throw Error(`Linked Cargo entry refused: ${file}`);
          if(s.isDirectory()){await scan(file,rel+'/',depth+1);continue;}if(!s.isFile())throw Error('Non-regular Cargo entry refused');
          const record=await fingerprint(file);if(++plan.totals.files>100000||(plan.totals.inputBytes+=record.bytes)>32*GiB)throw Error('Cargo input budget exceeded');
          const preserve=rescueRequired(rel);let rescued;
          if(preserve){plan.totals.rescueFiles++;rescued=copies.get(record.sha256);
            if(!rescued){if(plan.totals.rescueUniqueBytes+record.bytes>4*GiB)throw Error('Binary rescue exceeds 4 GiB; retain remaining source for review');const destination=path.join(vault,'cargo',digest(relative).slice(0,16),...rel.split('/'));await ordinary(path.dirname(destination),{missing:true});await fs.mkdir(path.dirname(destination),{recursive:true});await ordinary(path.dirname(destination));
              try{await fs.copyFile(file,destination,constants.COPYFILE_EXCL);}catch(e){if(e.code!=='EEXIST')throw e;}
              const actual=await fingerprint(destination);if(actual.sha256!==record.sha256||actual.bytes!==record.bytes||(await fs.lstat(destination)).nlink!==1)throw Error('Preserved binary verification failed');
              const current=await fingerprint(file);if(!same(current,record)||current.sha256!==record.sha256)throw Error('Binary source changed during rescue');
              rescued={path:path.relative(workspace,destination).split(path.sep).join('/'),sha256:actual.sha256,bytes:actual.bytes};copies.set(record.sha256,rescued);plan.totals.rescueUniqueFiles++;plan.totals.rescueUniqueBytes+=record.bytes;
            }
          }else{plan.totals.regenerableFiles++;plan.totals.regenerableBytes+=record.bytes;}
          entries.push({relative:rel,...record,classification:preserve?'preserved-binary-or-bundle':'cargo-regenerable-intermediate',rescued});
          if(plan.totals.files%1000===0)onProgress({...plan.totals,tree:relative});
        }
        if(!same(before,identity(await fs.lstat(folder,{bigint:true}))))throw Error(`Cargo directory changed during inventory: ${folder}`);
        dirs.push({relative:prefix?prefix.slice(0,-1):'',...before});
      };
      await scan(root);plan.totals.directories=directories;
      if(!same(rootBefore,identity(await fs.lstat(root,{bigint:true}))))throw Error('Cargo root changed during scan');
      plan.trees.push({sourceRelative:relative,rootIdentity:rootBefore,directories:dirs,entries});
    }
    plan.complete=true;const file=path.join(journal,'old-cargo-plan.json'),sha256=await jsonNew(file,plan);return {plan,file,sha256};
  }catch(error){await jsonNew(path.join(journal,`old-cargo-interrupted-${crypto.randomUUID()}.json`),{...plan,error:String(error)});throw error;}
  finally{await lock.close();await fs.unlink(path.join(vault,'rescue.lock'));}
}
export async function verifyCargoPlan({manifest,sha256,processGate=windowsGate}){
  await ordinary(manifest);const bytes=await fs.readFile(manifest);if(digest(bytes)!==sha256)throw Error('Reviewed Cargo plan hash changed');const plan=JSON.parse(bytes);
  if(plan.schemaVersion!==1||plan.operation!=='rescue-obsolete-cargo'||!plan.complete||plan.sourceDeletionPerformed||!Array.isArray(plan.trees)||plan.trees.length>64)throw Error('Invalid Cargo plan');
  const roots=plan.trees.map(t=>sourcePath(plan.workspace,t.sourceRelative));const gate=await processGate(roots);if(gate.blocking?.length)throw Error('Active Cargo cache refused');
  let files=0;for(const tree of plan.trees){const root=sourcePath(plan.workspace,tree.sourceRelative);await ordinary(root);
    if(!(await fs.readFile(path.join(root,'CACHEDIR.TAG'),'utf8')).startsWith(signature))throw Error('Cargo ownership marker changed');
    for(const dir of tree.directories){const folder=dir.relative?path.join(root,...relativeName(dir.relative).split('/')):root;await ordinary(folder);if(!same(identity(await fs.lstat(folder,{bigint:true})),dir))throw Error('Cargo directory changed since plan');}
    for(const entry of tree.entries){const file=path.join(root,...relativeName(entry.relative).split('/'));await ordinary(path.dirname(file));const current=await fingerprint(file);if(!same(current,entry)||current.sha256!==entry.sha256)throw Error(`Cargo source changed: ${file}`);
      if(entry.rescued){const destination=path.resolve(plan.workspace,...relativeName(entry.rescued.path).split('/'));if(!inside(path.join(plan.workspace,'preserved','development-builds'),destination))throw Error('Rescue path escapes ownership');await ordinary(destination);const saved=await fingerprint(destination);if(saved.sha256!==entry.sha256||saved.bytes!==entry.bytes||(await fs.lstat(destination)).nlink!==1)throw Error('Rescued binary changed');}
      files++;
    }
  }
  return {complete:true,files,sourceDeletionPerformed:false};
}
/** Refine an already hashed plan without rehashing all compiler intermediates.
 * Every newly protected file is freshly source/hash checked and copied. Final
 * deletion still requires verifyCargoPlan over the entire refined manifest.
 */
export async function rescueUnclassifiedCargoPlan({manifest,sha256,journal,processGate=windowsGate}){
  await ordinary(manifest);const bytes=await fs.readFile(manifest);if(digest(bytes)!==sha256)throw Error('Original Cargo plan hash changed');const plan=JSON.parse(bytes);
  if(plan.operation!=='rescue-obsolete-cargo'||!plan.complete||plan.sourceDeletionPerformed)throw Error('Invalid original Cargo plan');
  if(normal(plan.vault)!==normal(path.join(plan.workspace,'preserved','development-builds')))throw Error('Unowned Cargo rescue destination');await ordinary(plan.vault);
  const owner=JSON.parse(await fs.readFile(path.join(plan.vault,'ownership.json'),'utf8'));if(owner.kind!=='spark-preserved-development-builds'||normal(owner.workspace)!==normal(plan.workspace))throw Error('Cargo rescue ownership changed');
  const gate=await processGate(plan.trees.map(t=>sourcePath(plan.workspace,t.sourceRelative)));if(gate.blocking?.length)throw Error('Active Cargo cache refused');
  const copies=new Map(plan.trees.flatMap(t=>t.entries).filter(e=>e.rescued).map(e=>[e.sha256,e.rescued]));
  const lock=await fs.open(path.join(plan.vault,'rescue.lock'),'wx');let additionalFiles=0,additionalUniqueBytes=0;
  try{
    for(const tree of plan.trees){const root=sourcePath(plan.workspace,tree.sourceRelative);await ordinary(root);
      for(const entry of tree.entries.filter(e=>!e.rescued&&rescueRequired(e.relative))){
        const file=path.join(root,...relativeName(entry.relative).split('/'));await ordinary(path.dirname(file));const current=await fingerprint(file);if(!same(current,entry)||current.sha256!==entry.sha256)throw Error('Unclassified Cargo source changed');
        let saved=copies.get(entry.sha256);if(!saved){if(plan.totals.rescueUniqueBytes+entry.bytes>4*GiB)throw Error('Binary/source rescue exceeds 4 GiB; retain source');const destination=path.join(plan.vault,'cargo',digest(tree.sourceRelative).slice(0,16),...entry.relative.split('/'));await ordinary(path.dirname(destination),{missing:true});await fs.mkdir(path.dirname(destination),{recursive:true});await ordinary(path.dirname(destination));try{await fs.copyFile(file,destination,constants.COPYFILE_EXCL);}catch(e){if(e.code!=='EEXIST')throw e;}
          const copy=await fingerprint(destination);if(copy.sha256!==entry.sha256||copy.bytes!==entry.bytes||(await fs.lstat(destination)).nlink!==1)throw Error('Unclassified Cargo rescue failed');const after=await fingerprint(file);if(!same(after,entry)||after.sha256!==entry.sha256)throw Error('Unclassified source changed during copy');
          saved={path:path.relative(plan.workspace,destination).split(path.sep).join('/'),sha256:copy.sha256,bytes:copy.bytes};copies.set(entry.sha256,saved);plan.totals.rescueUniqueFiles++;plan.totals.rescueUniqueBytes+=entry.bytes;additionalUniqueBytes+=entry.bytes;
        }
        entry.rescued=saved;entry.classification='preserved-unclassified-file';plan.totals.rescueFiles++;plan.totals.regenerableFiles--;plan.totals.regenerableBytes-=entry.bytes;additionalFiles++;
      }
    }
    plan.supersedes={manifest,sha256};plan.refinedAt=new Date().toISOString();plan.refinementProcessCheck=gate;
    const file=path.join(path.resolve(journal),'old-cargo-reviewed-plan.json'),newHash=await jsonNew(file,plan);return {plan,file,sha256:newHash,additionalFiles,additionalUniqueBytes};
  }finally{await lock.close();await fs.unlink(path.join(plan.vault,'rescue.lock'));}
}
export async function purgeCargoPlan({manifest,sha256,reviewedSha256,journal,processGate=windowsGate}){
  if(process.platform!=='win32')throw Error('Guarded Cargo retirement currently requires Windows native file handles');
  if(!/^[a-f0-9]{64}$/.test(sha256)||reviewedSha256!==sha256)throw Error('An explicitly reviewed immutable plan hash is required');
  await ordinary(manifest);const raw=await fs.readFile(manifest);if(raw.length>64*1024**2||digest(raw)!==sha256)throw Error('Reviewed Cargo plan hash changed');const plan=JSON.parse(raw);
  if(plan.schemaVersion!==1||plan.operation!=='rescue-obsolete-cargo'||!plan.complete||plan.sourceDeletionPerformed||!Array.isArray(plan.trees)||!plan.trees.length||plan.trees.length>64||plan.totals.files>100000||plan.totals.inputBytes>32*GiB)throw Error('Invalid bounded Cargo plan');
  const workspace=path.resolve(plan.workspace),vault=path.join(workspace,'preserved','development-builds');await ordinary(workspace);await ordinary(vault);
  if(normal(plan.vault)!==normal(vault))throw Error('Protected rescue path changed');
  journal=path.resolve(journal);if(inside(path.join(workspace,'.local'),journal)||normal(journal)===normal(path.join(workspace,'.local')))throw Error('Purge journal must be outside obsolete .local');
  await ordinary(journal,{missing:true});await fs.mkdir(journal,{recursive:true});await ordinary(journal);
  const roots=plan.trees.map(tree=>sourcePath(workspace,tree.sourceRelative)),gate=await processGate(roots);if(gate.blocking?.length)throw Error('Active Cargo cache refused');
  let files=0,bytes=0;
  for(const tree of plan.trees){const root=sourcePath(workspace,tree.sourceRelative);await ordinary(root);
    for(const dir of tree.directories){const folder=dir.relative?path.join(root,...relativeName(dir.relative).split('/')):root;await ordinary(folder);if(!same(identity(await fs.lstat(folder,{bigint:true})),dir))throw Error('Cargo directory changed since review');}
    for(const entry of tree.entries){const file=path.join(root,...relativeName(entry.relative).split('/')),s=await fs.lstat(file,{bigint:true});if(!s.isFile()||s.isSymbolicLink()||!same(identity(s),entry)||!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('Cargo file changed since review');
      if(!['preserved-binary-or-bundle','preserved-unclassified-file','cargo-regenerable-intermediate'].includes(entry.classification)||rescueRequired(entry.relative)&&!entry.rescued||entry.classification!=='cargo-regenerable-intermediate'&&!entry.rescued)throw Error('Unclassified or unpreserved Cargo data refused');
      if(entry.rescued){const saved=path.resolve(workspace,...relativeName(entry.rescued.path).split('/'));if(!inside(vault,saved)||entry.rescued.sha256!==entry.sha256||entry.rescued.bytes!==entry.bytes)throw Error('Cargo rescue identity changed');}
      if(++files>100000||(bytes+=entry.bytes)>32*GiB)throw Error('Cargo purge input bound exceeded');
    }
  }
  if(files!==plan.totals.files||bytes!==plan.totals.inputBytes)throw Error('Cargo plan totals changed');
  await jsonNew(path.join(journal,'reviewed-request.json'),{schemaVersion:1,manifest:path.resolve(manifest),sha256,reviewedSha256,roots,files,bytes,processCheck:gate,at:new Date().toISOString()});
  const helper=fileURLToPath(new URL('./retire-local-cargo.ps1',import.meta.url));
  const invocation=await trustedScriptInvocation(helper,fileURLToPath(new URL('./windows-sealed-files.cs',import.meta.url)),{Manifest:path.resolve(manifest),PlanSha256:sha256,Journal:journal});
  const {stdout}=await run('powershell.exe',invocation.args,{env:invocation.env,maxBuffer:16*1024**2,windowsHide:true});
  const result=JSON.parse(stdout.trim());if(!result.complete||result.manifestSha256!==sha256||result.filesRemoved!==files||result.rootTargetTouched!==false)throw Error('Cargo retirement did not complete its reviewed plan');return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [operation,...args]=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2){if(!args[i]?.startsWith('--')||!args[i+1])throw Error('Expected named arguments');options[args[i].slice(2)]=args[i+1];}
  if(operation==='plan'){const inventory=JSON.parse(await fs.readFile(options.inventory,'utf8'));const result=await planCargoCaches({workspace:options.workspace,roots:rootsFromInventory(inventory,options.workspace),journal:options.journal,onProgress:value=>console.log(JSON.stringify({progress:true,...value}))});console.log(JSON.stringify({complete:true,manifest:result.file,sha256:result.sha256,roots:result.plan.trees.map(t=>t.sourceRelative),...result.plan.totals}));}
  else if(operation==='verify')console.log(JSON.stringify(await verifyCargoPlan({manifest:options.manifest,sha256:options.sha256})));
  else if(operation==='refine'){const result=await rescueUnclassifiedCargoPlan({manifest:options.manifest,sha256:options.sha256,journal:options.journal});console.log(JSON.stringify({complete:true,manifest:result.file,sha256:result.sha256,additionalFiles:result.additionalFiles,additionalUniqueBytes:result.additionalUniqueBytes,...result.plan.totals}));}
  else if(operation==='purge')console.log(JSON.stringify(await purgeCargoPlan({manifest:options.manifest,sha256:options.sha256,reviewedSha256:options['reviewed-sha256'],journal:options.journal})));
  else throw Error('Use plan/refine, verify, or purge with the explicitly reviewed plan hash');
}
