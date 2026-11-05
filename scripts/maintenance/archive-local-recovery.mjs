/** Copy-only recovery of the obsolete local tree. Never removes source files.
 * Standard ZIP64 contains ASCII SHA objects and a UTF-8 original-path catalog;
 * this avoids Windows bsdtar's Unicode/deep-path filesystem traversal defects.
 */
import fs from 'node:fs/promises';
import {createReadStream, constants} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {createInterface} from 'node:readline';
import {TagNodeIO} from './retire-local-tags.mjs';

const {ordinaryPath,fingerprint,identity,same,relativeName,inside}=TagNodeIO;
const GiB=1024**3, MAX_FILES=150000, MAX_UNIQUE=8*GiB;
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const tarTool=process.platform==='win32'?'C:\\Windows\\System32\\tar.exe':'tar';
const objectName=hash=>`objects/${hash.slice(0,2)}/${hash}`;
const slash=p=>p.split(path.sep).join('/');

function source(workspace,relative){
  relativeName(relative);
  if(!relative.startsWith('.local/'))throw Error('Only explicit obsolete local files can be archived');
  const full=path.resolve(workspace,...relative.split('/'));
  if(!inside(path.join(workspace,'.local'),full))throw Error('Source leaves the obsolete local root');
  return full;
}
function archiveSource(workspace,row,indexRoot){
  if(row.namespace!=='external-recovery-index')return source(workspace,row.relative);
  if(!indexRoot||!row.indexRelative||row.relative!==`.local/_recovery-indexes/${row.indexRelative}`)throw Error('Invalid external recovery index binding');
  relativeName(row.indexRelative);const full=path.resolve(indexRoot,...row.indexRelative.split('/'));
  if(!inside(path.resolve(indexRoot),full))throw Error('Recovery index leaves its explicit evidence root');return full;
}
async function exclusiveJson(file,value){
  const h=await fs.open(file,'wx');
  try{await h.writeFile(JSON.stringify(value,null,2)+'\n');await h.sync();}finally{await h.close();}
}
function boundedInteger(n,label,max=Number.MAX_SAFE_INTEGER){
  if(!Number.isSafeInteger(n)||n<0||n>max)throw Error(`Invalid ${label}`);
  return n;
}
function validateCatalog(catalog){
  if(catalog.schemaVersion!==1||catalog.kind!=='spark-local-recovery-catalog'||!Array.isArray(catalog.files)||catalog.files.length>MAX_FILES)throw Error('Unknown or excessive recovery catalog');
  const seen=new Set(),objects=new Map();
  for(const row of catalog.files){
    relativeName(row.relative);
    if(!row.relative.startsWith('.local/'))throw Error('Invalid original source prefix');
    const key=row.relative.toLowerCase();if(seen.has(key))throw Error('Duplicate catalog path');seen.add(key);
    boundedInteger(row.bytes,'file size',MAX_UNIQUE);
    if(!/^[a-f0-9]{64}$/.test(row.sha256))throw Error('Invalid payload hash');
    if(row.object!==objectName(row.sha256))throw Error('Unsafe payload object');
    if(objects.has(row.object)&&objects.get(row.object).bytes!==row.bytes)throw Error('Conflicting payload size');
    objects.set(row.object,{...row});
  }
  if([...objects.values()].reduce((n,r)=>n+r.bytes,0)>MAX_UNIQUE)throw Error('Unique payload budget exceeded');
  for(const row of [...(catalog.directories??[]),...(catalog.links??[])]){
    relativeName(row.relative);if(row.relative!=='.local'&&!row.relative.startsWith('.local/'))throw Error('Invalid directory/link prefix');
  }
  return [...objects.values()].sort((a,b)=>a.object.localeCompare(b.object));
}

/** Fresh no-follow stat inventory. No payload reads and no broad exclusions. */
export async function inventoryLocal({workspace,maxBytes=32*GiB}){
  workspace=path.resolve(workspace);const root=path.join(workspace,'.local');await ordinaryPath(root);
  const files=[],directories=[],links=[],pending=[root];let bytes=0;
  while(pending.length){
    const dir=pending.pop();const stat=await fs.lstat(dir,{bigint:true});
    if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('Directory changed during inventory');
    directories.push({relative:slash(path.relative(workspace,dir)),...identity(stat)});
    if(directories.length>180000)throw Error('Directory inventory bound exceeded');
    for(const entry of await fs.readdir(dir,{withFileTypes:true})){
      const full=path.join(dir,entry.name),relative=slash(path.relative(workspace,full));relativeName(relative);
      const info=await fs.lstat(full,{bigint:true});
      if(info.isSymbolicLink()){links.push({relative,target:await fs.readlink(full),followed:false});continue;}
      if(info.isDirectory()){pending.push(full);continue;}
      if(!info.isFile())throw Error(`Unknown filesystem object: ${relative}`);
      files.push({relative,...identity(info),links:Number(info.nlink),readonly:(info.mode&0o200n)===0n});
      bytes+=Number(info.size);if(files.length>MAX_FILES||bytes>maxBytes)throw Error('Residual inventory budget exceeded');
    }
  }
  files.sort((a,b)=>a.relative.localeCompare(b.relative));
  return {schemaVersion:1,kind:'spark-local-recovery-inventory',workspace,at:new Date().toISOString(),readOnly:true,files,directories,links,totals:{files:files.length,bytes,directories:directories.length,links:links.length}};
}

function tarHeader(name,bytes){
  if(!/^[a-z0-9/.]+$/.test(name)||name.length>99)throw Error('Non-ASCII archive name refused');
  const block=Buffer.alloc(512);block.write(name,0,'ascii');
  const octal=(value,start,width)=>block.write(value.toString(8).padStart(width-1,'0')+'\0',start,'ascii');
  octal(0o600,100,8);octal(0,108,8);octal(0,116,8);octal(bytes,124,12);octal(0,136,12);
  block.fill(32,148,156);block[156]=48;block.write('ustar\0',257,'ascii');block.write('00',263,'ascii');
  const sum=block.reduce((a,b)=>a+b,0);block.write(sum.toString(8).padStart(6,'0')+'\0 ',148,'ascii');return block;
}
async function write(stream,bytes){if(!stream.write(bytes))await once(stream,'drain');}
async function finishChild(child){
  let errors='';child.stderr.on('data',b=>{if(errors.length<16384)errors+=b.toString();});
  const [code,signal]=await once(child,'close');if(code!==0)throw Error(`Archive tool failed (${code??signal}): ${errors}`);
}
async function writeArchive({workspace,catalog,catalogBytes,objects,output,indexRoot}){
  const child=spawn(tarTool,['-cf',output,'--format=zip','--options=zip:zip64','@-'],{stdio:['pipe','ignore','pipe'],windowsHide:true});
  const complete=finishChild(child);complete.catch(()=>{});child.stdin.on('error',()=>{});
  try{
    await write(child.stdin,tarHeader('catalog.json',catalogBytes.length));await write(child.stdin,catalogBytes);
    await write(child.stdin,Buffer.alloc((512-catalogBytes.length%512)%512));
    for(const row of objects){
      const full=archiveSource(workspace,row,indexRoot);await ordinaryPath(full);
      const h=await fs.open(full,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
      try{
        if(!same(row,identity(await h.stat({bigint:true}))))throw Error(`Source changed before archive stream: ${row.relative}`);
        await write(child.stdin,tarHeader(row.object,row.bytes));let count=0;const hash=crypto.createHash('sha256');
        for await(const bytes of createReadStream('',{fd:h.fd,autoClose:false})){count+=bytes.length;if(count>row.bytes)throw Error('Growing source');hash.update(bytes);await write(child.stdin,bytes);}
        if(count!==row.bytes||hash.digest('hex')!==row.sha256||!same(row,identity(await h.stat({bigint:true})))||!same(row,identity(await fs.lstat(full,{bigint:true}))))throw Error(`Source changed during archive stream: ${row.relative}`);
        await write(child.stdin,Buffer.alloc((512-row.bytes%512)%512));
      }finally{await h.close();}
    }
    child.stdin.end(Buffer.alloc(1024));await complete;
    const h=await fs.open(output,'r+');try{await h.sync();}finally{await h.close();}
  }catch(error){child.stdin.destroy();child.kill();await complete.catch(()=>{});throw error;}
}

async function capture(args,maxBytes=64*1024**2){
  const child=spawn(tarTool,args,{stdio:['ignore','pipe','pipe'],windowsHide:true});const complete=finishChild(child);complete.catch(()=>{});
  const chunks=[];let bytes=0;try{for await(const b of child.stdout){bytes+=b.length;if(bytes>maxBytes)throw Error('Archive listing budget exceeded');chunks.push(b);}await complete;return Buffer.concat(chunks);}catch(e){child.kill();await complete.catch(()=>{});throw e;}
}
/** Independent native decompression, hashing EVERY object at its exact boundary. */
export async function verifyArchive({archive,catalog,catalogBytes}){
  await ordinaryPath(archive);const objects=validateCatalog(catalog);
  const expected=[{object:'catalog.json',bytes:catalogBytes.length,sha256:sha(catalogBytes)},...objects];
  const names=(await capture(['-tf',archive])).toString('utf8').trimEnd().split(/\r?\n/);
  if(JSON.stringify(names)!==JSON.stringify(expected.map(r=>r.object)))throw Error('Archive members differ from exact catalog');
  const verbose=(await capture(['-tvf',archive])).toString('utf8').trimEnd().split(/\r?\n/);
  if(verbose.length!==expected.length||verbose.some(line=>!line.startsWith('-')))throw Error('Non-regular archive member refused');
  const child=spawn(tarTool,['-xOf',archive],{stdio:['ignore','pipe','pipe'],windowsHide:true});const complete=finishChild(child);complete.catch(()=>{});
  let index=0,used=0,total=0,hash=crypto.createHash('sha256');
  const advance=()=>{
    while(index<expected.length&&used===expected[index].bytes){
      if(hash.digest('hex')!==expected[index].sha256)throw Error(`Archive readback hash differs: ${expected[index].object}`);
      index++;used=0;hash=crypto.createHash('sha256');
    }
  };
  try{
    advance();for await(const chunk of child.stdout){let offset=0;while(offset<chunk.length){if(index>=expected.length)throw Error('Trailing archive data');const take=Math.min(chunk.length-offset,expected[index].bytes-used);hash.update(chunk.subarray(offset,offset+take));offset+=take;used+=take;total+=take;advance();}}
    await complete;advance();if(index!==expected.length)throw Error('Truncated archive readback');
    return {objects:objects.length,entries:expected.length,payloadBytes:objects.reduce((n,r)=>n+r.bytes,0),readbackBytes:total,allObjectHashesVerified:true,regularMembersOnly:true};
  }catch(e){child.kill();await complete.catch(()=>{});throw e;}
}

export async function sealRecovery({inventory,outDir,select='all',maxUniqueBytes=MAX_UNIQUE,onProgress=()=>{},indexManifest=null}){
  if(!['all','candidates'].includes(select))throw Error('Unknown file selection');
  const workspace=path.resolve(inventory.workspace);outDir=path.resolve(outDir);
  if(!inside(path.join(workspace,'preserved','recovery-metadata'),outDir))throw Error('Archive must be a fresh private recovery-metadata child');
  if(!inventory.files||inventory.files.length>MAX_FILES)throw Error('Excessive source file count');
  await ordinaryPath(path.dirname(outDir),{missing:true});await fs.mkdir(path.dirname(outDir),{recursive:true});await ordinaryPath(path.dirname(outDir));await fs.mkdir(outDir);await ordinaryPath(outDir);
  const selected=inventory.files.filter(r=>select==='all'||r.archiveCandidate===true),files=[],unique=new Map();let uniqueBytes=0,done=0,indexRoot=null;
  if(indexManifest){
    indexRoot=path.resolve(indexManifest.root);await ordinaryPath(indexRoot);
    if(!Array.isArray(indexManifest.files)||indexManifest.files.length>10000)throw Error('Excessive external recovery index count');
    let indexBytes=0;for(const relative of indexManifest.files){
      relativeName(relative);const full=path.resolve(indexRoot,...relative.split('/'));if(!inside(indexRoot,full))throw Error('Index escapes evidence root');
      await ordinaryPath(full);const info=await fs.lstat(full,{bigint:true});if(!info.isFile())throw Error('Recovery index must be ordinary file');
      indexBytes+=Number(info.size);if(indexBytes>2*GiB)throw Error('External index byte budget exceeded');
      selected.push({relative:`.local/_recovery-indexes/${relative}`,namespace:'external-recovery-index',indexRelative:relative,originalLocation:full,...identity(info)});
    }
  }
  if(selected.length>MAX_FILES)throw Error('Combined recovery file count exceeded');
  // Bound source I/O as well as unique stored bytes. A highly duplicated old
  // SDK must not cause an unbounded read merely because its compressed set fits.
  const logicalInputBytes=selected.reduce((n,row)=>n+boundedInteger(row.bytes,'input file size',MAX_UNIQUE),0);
  if(logicalInputBytes>16*GiB)throw Error('Logical input read budget exceeded; reduce the exact residual inventory first');
  const journal=await fs.open(path.join(outDir,'seal-journal.jsonl'),'wx');
  try{
    await journal.writeFile(JSON.stringify({event:'started',at:new Date().toISOString(),workspace,select,selected:selected.length,sourceDeletionPerformed:false})+'\n');await journal.sync();
    for(const row of selected){
      const full=archiveSource(workspace,row,indexRoot);const proof=await fingerprint(full,MAX_UNIQUE);
      if(!same(row,proof))throw Error(`Source identity changed since inventory: ${row.relative}`);
      const sealed={...row,...proof,object:objectName(proof.sha256)};files.push(sealed);
      if(!unique.has(sealed.object)){unique.set(sealed.object,sealed);uniqueBytes+=sealed.bytes;if(uniqueBytes>Math.min(maxUniqueBytes,MAX_UNIQUE))throw Error('Unique recovery input budget exceeded');}
      if(++done%256===0){await journal.writeFile(JSON.stringify({event:'hashed',files:done,unique:unique.size,uniqueBytes})+'\n');await journal.sync();onProgress({phase:'hash',files:done,total:selected.length,uniqueBytes});}
    }
    const included=new Set(files.map(r=>r.relative));
    const catalog={schemaVersion:1,kind:'spark-local-recovery-catalog',workspace,created:new Date().toISOString(),sourceRoot:'.local',restorePolicy:'fresh-explicit-destination-no-overwrite-no-links',files,directories:inventory.directories??[],links:(inventory.links??[]).map(r=>({...r,followed:false})),deferred:inventory.files.filter(r=>!included.has(r.relative)).map(r=>({relative:r.relative,...identityLike(r)})),selection:select,sourceDeletionPerformed:false};
    const objects=validateCatalog(catalog),catalogBytes=Buffer.from(JSON.stringify(catalog,null,2)+'\n');
    if(catalogBytes.length>128*1024**2)throw Error('Catalog byte budget exceeded');
    const catalogFile=path.join(outDir,'catalog.json'),archive=path.join(outDir,'recovery.zip');
    await exclusiveJson(catalogFile,catalog);onProgress({phase:'archive',files:files.length,unique:objects.length,uniqueBytes});
    await writeArchive({workspace,catalog,catalogBytes,objects,output:archive,indexRoot});
    const readback=await verifyArchive({archive,catalog,catalogBytes});const archiveProof=await fingerprint(archive,MAX_UNIQUE+512*1024**2);
    const receipt={schemaVersion:1,kind:'spark-local-recovery-copy-receipt',complete:true,at:new Date().toISOString(),workspace,archive,archiveSha256:archiveProof.sha256,archiveBytes:archiveProof.bytes,catalog:catalogFile,catalogSha256:sha(catalogBytes),files:files.length,logicalBytes:files.reduce((n,r)=>n+r.bytes,0),uniquePayloadBytes:uniqueBytes,linksRecorded:catalog.links.length,linksFollowed:0,directoriesRecorded:catalog.directories.length,deferredFiles:catalog.deferred.length,sourceDeletionPerformed:false,readyForDeletion:false,requiresExactOwnerReviewedPlan:true,...readback};
    await exclusiveJson(path.join(outDir,'copy-receipt.json'),receipt);await journal.writeFile(JSON.stringify({event:'complete',receipt:'copy-receipt.json'})+'\n');await journal.sync();return receipt;
  }catch(error){await journal.writeFile(JSON.stringify({event:'failed-source-retained',error:String(error.message)})+'\n').catch(()=>{});await journal.sync().catch(()=>{});throw error;}finally{await journal.close();}
}
function identityLike(r){return {dev:r.dev,ino:r.ino,bytes:r.bytes,mtimeNs:r.mtimeNs,ctimeNs:r.ctimeNs};}

function providerRequested({preservationIndex,indexSha256,pythonExecutable}){
  if(!preservationIndex&&!indexSha256&&!pythonExecutable)return false;
  if(typeof preservationIndex!=='string'||typeof pythonExecutable!=='string'||!/^[a-f0-9]{64}$/.test(indexSha256??''))throw Error('Provider recovery requires an explicit preservation index, its SHA-256 and Python executable');
  return true;
}
async function absentOrdinary(file){
  if(typeof file!=='string'||!file)throw Error('An explicit original recovery path is required');
  await ordinaryPath(file,{missing:true});try{await fs.lstat(file);return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}
}
/** Optional compatibility transport for the existing verified qa-vault reader.
 * Only an explicit pinned index can replace an absent historical location.
 * This does not register, relocate or delete any preserved content. */
export async function openPreservationProvider({workspace,preservationIndex,indexSha256,pythonExecutable}){
  providerRequested({preservationIndex,indexSha256,pythonExecutable});
  if(typeof workspace!=='string'||!path.isAbsolute(workspace)||!path.isAbsolute(pythonExecutable))throw Error('Provider recovery requires absolute source-workspace and Python paths');
  workspace=path.resolve(workspace);preservationIndex=path.resolve(preservationIndex);pythonExecutable=path.resolve(pythonExecutable);
  const indexProof=await fingerprint(preservationIndex,256*1024**2),indexBytes=await fs.readFile(preservationIndex);
  if(indexProof.sha256!==indexSha256||sha(indexBytes)!==indexSha256)throw Error('Preservation index SHA-256 differs');
  const index=JSON.parse(indexBytes),equal=(a,b)=>process.platform==='win32'?path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase():path.resolve(a)===path.resolve(b);
  if(index.schemaVersion!==1||index.kind!=='spark-preservation-index'||typeof index.root!=='string'||!path.isAbsolute(index.root)||!equal(index.root,path.join(workspace,'preserved'))||!index.objects||Array.isArray(index.objects))throw Error('Preservation index source identity differs');
  await ordinaryPath(index.root);await ordinaryPath(pythonExecutable);
  const script=fileURLToPath(new URL('./qa-vault.py',import.meta.url));const scriptProof=await fingerprint(script,2*1024**2);
  const probe=await promisify(execFile)(pythonExecutable,['-I','-X','utf8','-c','import json,sys;print(json.dumps({"executable":sys.executable,"implementation":sys.implementation.name,"version":list(sys.version_info[:2])}))'],{windowsHide:true,timeout:15000,maxBuffer:65536});
  const interpreter=JSON.parse(probe.stdout);if(interpreter.implementation!=='cpython'||interpreter.version?.[0]!==3||interpreter.version?.[1]<10||typeof interpreter.executable!=='string'||!equal(interpreter.executable,pythonExecutable))throw Error('Selected executable is not the expected Python 3 interpreter');
  const child=spawn(pythonExecutable,['-I','-X','utf8',script,'--workspace',workspace,'recover-object',preservationIndex,'--index-sha256',indexSha256,'--requests','-'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const pending=new Map();let sequence=0,stderr='',closing=false,readyResolve,readyReject,settledReady=false,requestFailed=false;
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  const closed=new Promise(resolve=>child.once('close',code=>{fail(Error(`Preservation reader exited ${code}: ${stderr.slice(-3000)}`));resolve(code);}));
  function fail(error){if(!settledReady){settledReady=true;readyReject(error);}for(const item of pending.values()){clearTimeout(item.timer);item.reject(error);}pending.clear();}
  child.on('error',fail);child.stdin.on('error',fail);child.stderr.on('data',bytes=>{if(stderr.length<65536)stderr+=bytes.toString();});
  const reader=createInterface({input:child.stdout,crlfDelay:Infinity});
  reader.on('line',line=>{try{
    if(line.length>1024**2)throw Error('Preservation reader response exceeds its bound');const response=JSON.parse(line);
    if(response.type==='ready'){if(settledReady||response.indexSha256!==indexSha256)throw Error('Preservation reader index acknowledgement differs');settledReady=true;readyResolve();return;}
    const item=pending.get(response.id);if(!item)throw Error('Unexpected preservation-reader response');pending.delete(response.id);clearTimeout(item.timer);item.resolve(response);
  }catch(error){fail(error);child.kill();}});
  const stop=async()=>{if(closing)return closed;closing=true;child.stdin.end();const timer=setTimeout(()=>child.kill(),5000);try{return await closed;}finally{clearTimeout(timer);reader.close();}};
  const startTimer=setTimeout(()=>{fail(Error('Preservation reader startup timed out'));child.kill();},30000);
  try{await ready;}catch(error){await stop();throw error;}finally{clearTimeout(startTimer);}
  return {
    async restore({sha256,bytes,destination}){
      try{
      if(closing||!/^[a-f0-9]{64}$/.test(sha256)||!Number.isSafeInteger(bytes)||bytes<0||bytes>MAX_UNIQUE)throw Error('Invalid bounded recovery object');
      const provider=index.objects[sha256];if(!provider||provider.bytes!==bytes||!['raw','zip-member','range'].includes(provider.kind))throw Error('Expected object is absent from the pinned preservation index');
      relativeName(provider.path);if(provider.kind!=='raw'){if(!/^[a-f0-9]{64}$/.test(provider.containerSha256??'')||!Number.isSafeInteger(provider.containerBytes)||provider.containerBytes<0)throw Error('Invalid pinned archive provider');}
      if(provider.kind==='zip-member')relativeName(provider.member);
      if(provider.kind==='range'&&(!Number.isSafeInteger(provider.offset)||provider.offset<0||provider.offset+bytes>provider.containerBytes))throw Error('Invalid pinned range provider');
      destination=path.resolve(destination);await ordinaryPath(path.dirname(destination));await ordinaryPath(destination,{missing:true});try{await fs.lstat(destination);throw Error('Recovery output already exists');}catch(error){if(error.code!=='ENOENT')throw error;}
      const id=String(++sequence),response=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Preservation object read timed out'));child.kill();},300000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,sha256,destination})+'\n',error=>{if(error){pending.delete(id);clearTimeout(timer);reject(error);}});});
      if(response.ok!==true)throw Error(response.error??'Preservation object read failed');
      if(response.sha256!==sha256||response.sourceSha256!==sha256||response.bytes!==bytes||response.indexSha256!==indexSha256||!equal(response.destination,destination)||response.fullReadback!==true||response.independentRegularFile!==true||response.provider?.kind!==provider.kind||response.provider?.path!==provider.path||(provider.kind!=='raw'&&(response.provider.containerSha256!==provider.containerSha256||response.provider.containerBytes!==provider.containerBytes))||(provider.kind==='zip-member'&&(response.crcVerified!==true||response.provider.member!==provider.member))||(provider.kind==='range'&&response.provider.offset!==provider.offset))throw Error('Preservation object acknowledgement differs from the pinned request');
      const actual=await fingerprint(destination,MAX_UNIQUE);if(actual.sha256!==sha256||actual.bytes!==bytes||(await fs.lstat(destination)).nlink!==1)throw Error('Recovered provider bytes differ');await fs.chmod(destination,0o600);return response;
      }catch(error){requestFailed=true;throw error;}
    },
    async close(){const code=await stop();if(code!==0&&!requestFailed)throw Error(`Preservation reader failed to finish (${code}): ${stderr.slice(-3000)}`);if((await fingerprint(script,2*1024**2)).sha256!==scriptProof.sha256||(await fingerprint(preservationIndex,256*1024**2)).sha256!==indexSha256)throw Error('Preservation reader source or index changed during recovery');},
  };
}

/** Restore ordinary independent files, never links or original .local paths. */
export async function restoreRecovery({archive,catalog,destination,relative=null,all=false,name=null,externalObjects={},externalFiles=[],preservationIndex=null,indexSha256=null,pythonExecutable=null}){
  const objects=validateCatalog(catalog);destination=path.resolve(destination);
  const providerOptions={workspace:catalog.workspace,preservationIndex,indexSha256,pythonExecutable},hasProvider=providerRequested(providerOptions);
  if(relative===null&&!all)throw Error('Choose one catalog file, or explicitly request whole artifact recovery');
  if(name!==null){relativeName(name);if(name.includes('/'))throw Error('Single-file recovery name must be a basename');if(relative===null)throw Error('Recovery name requires one explicit file');}
  if(catalog.workspace&&(destination.toLowerCase()===path.resolve(catalog.workspace).toLowerCase()||inside(path.resolve(catalog.workspace),destination)))throw Error('Restore into canonical workspace refused');
  if(externalFiles.length&&relative===null)throw Error('External manifest restore requires one explicit original relative path');
  const allRows=[...catalog.files,...externalFiles.map(r=>({...r,object:objectName(r.sha256)}))];
  const rows=relative===null?catalog.files:allRows.filter(r=>r.relative===relative);
  if(relative!==null&&rows.length!==1)throw Error('Requested file absent or ambiguous');
  validateCatalog({...catalog,files:rows});
  await ordinaryPath(path.dirname(destination));await fs.mkdir(destination);await ordinaryPath(destination);
  const byObject=new Map();for(const row of rows){const list=byObject.get(row.object)??[];list.push(row);byObject.set(row.object,list);}
  const result=[];
  const restorePath=async row=>{
    // Raw original paths remain in the catalog. Never recreate a live .local.
    const rel=relative===null?`legacy-local/${row.relative.slice('.local/'.length)}`:(name??path.posix.basename(row.relative));relativeName(rel);const full=path.resolve(destination,...rel.split('/'));if(!inside(destination,full))throw Error('Restore path escapes destination');
    await fs.mkdir(path.dirname(full),{recursive:true});await ordinaryPath(path.dirname(full));return full;
  };
  const finishAliases=async(object,primary)=>{
    for(const row of byObject.get(object.object)){
      const full=await restorePath(row);if(full!==primary)await fs.copyFile(primary,full,constants.COPYFILE_EXCL);
      const proof=await fingerprint(full,MAX_UNIQUE);if(proof.sha256!==object.sha256||proof.bytes!==object.bytes||(await fs.lstat(full)).nlink!==1)throw Error('Restored independent file differs');
      result.push({relative:row.relative,bytes:proof.bytes,sha256:proof.sha256});
    }
  };
  const external=rows.length===1?externalObjects[rows[0].sha256]:null;
  const externalMissing=external?await absentOrdinary(external):false;
  const foreign=rows.some(r=>!catalog.files.some(f=>f.relative===r.relative));
  const providerNeeded=hasProvider&&(external?externalMissing:(foreign||await absentOrdinary(archive)));
  if(providerNeeded){
    const provider=await openPreservationProvider(providerOptions);
    try{for(const [object,list]of byObject){const row=list[0],full=await restorePath(row);await provider.restore({sha256:row.sha256,bytes:row.bytes,destination:full});await finishAliases({object,sha256:row.sha256,bytes:row.bytes},full);}}finally{await provider.close();}
  }else if(external){
    const row=rows[0],proof=await fingerprint(external,MAX_UNIQUE);if(proof.sha256!==row.sha256||proof.bytes!==row.bytes)throw Error('External CAS reference differs');
    const full=await restorePath(row);await fs.copyFile(external,full,constants.COPYFILE_EXCL);await finishAliases(row,full);
  }else{
    if(foreign)throw Error('Explicit verified external object mapping required');
    const catalogBytes=Buffer.from(JSON.stringify(catalog,null,2)+'\n');
    await verifyArchive({archive,catalog,catalogBytes});
    const expected=[{object:'catalog.json',bytes:catalogBytes.length,sha256:sha(catalogBytes)},...objects];
    const child=spawn(tarTool,['-xOf',archive],{stdio:['ignore','pipe','pipe'],windowsHide:true});const complete=finishChild(child);complete.catch(()=>{});
    let index=0,used=0,hash=crypto.createHash('sha256'),handle=null,primary=null;
    const open=async()=>{
      const row=expected[index];if(row&&byObject.has(row.object)){primary=await restorePath(byObject.get(row.object)[0]);handle=await fs.open(primary,'wx');}
    };
    const advance=async()=>{
      while(index<expected.length&&used===expected[index].bytes){
        const row=expected[index];if(hash.digest('hex')!==row.sha256)throw Error('Restore stream differs');
        if(handle){await handle.sync();await handle.close();handle=null;await finishAliases(row,primary);primary=null;}
        index++;used=0;hash=crypto.createHash('sha256');await open();
      }
    };
    try{
      await open();await advance();for await(const chunk of child.stdout){let offset=0;while(offset<chunk.length){if(index>=expected.length)throw Error('Trailing restore stream');const take=Math.min(chunk.length-offset,expected[index].bytes-used),bytes=chunk.subarray(offset,offset+take);hash.update(bytes);if(handle)await handle.write(bytes);used+=take;offset+=take;await advance();}}
      await complete;await advance();if(index!==expected.length)throw Error('Truncated restore stream');
    }catch(e){child.kill();await complete.catch(()=>{});throw e;}finally{if(handle)await handle.close();}
  }
  return {files:result.length,verified:result,linksRestored:0,sourceDeletionPerformed:false,destination};
}

async function main(){
  const [command,...args]=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2){if(!args[i]?.startsWith('--')||!args[i+1])throw Error('Expected named arguments');options[args[i].slice(2)]=args[i+1];}
  if(command==='inventory'){const data=await inventoryLocal({workspace:options.workspace});await exclusiveJson(options.output,data);console.log(JSON.stringify(data.totals));}
  else if(command==='seal'){const inventory=JSON.parse(await fs.readFile(options.inventory,'utf8'));const indexManifest=options['index-manifest']?JSON.parse(await fs.readFile(options['index-manifest'],'utf8')):null;console.log(JSON.stringify(await sealRecovery({inventory,outDir:options.output,select:options.select??'all',indexManifest,onProgress:r=>console.log(JSON.stringify(r))})));}
  else if(command==='verify'){const catalogBytes=await fs.readFile(options.catalog),catalog=JSON.parse(catalogBytes);console.log(JSON.stringify(await verifyArchive({archive:options.archive,catalog,catalogBytes})));}
  else if(command==='restore'){const catalog=JSON.parse(await fs.readFile(options.catalog,'utf8'));const externalObjects=options['external-objects']?JSON.parse(await fs.readFile(options['external-objects'],'utf8')):{};const externalFiles=options['external-files']?JSON.parse(await fs.readFile(options['external-files'],'utf8')):[];console.log(JSON.stringify(await restoreRecovery({archive:options.archive,catalog,destination:options.destination,relative:options.relative??null,all:options.all==='yes',name:options.name??null,externalObjects,externalFiles,preservationIndex:options['preservation-index']??null,indexSha256:options['index-sha256']??null,pythonExecutable:options.python??null})));}
  else throw Error('Use inventory, seal, verify, or restore; this tool has no source deletion command');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.stack);process.exitCode=1;});
