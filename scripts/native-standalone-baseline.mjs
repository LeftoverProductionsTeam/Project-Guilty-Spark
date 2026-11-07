// Diagnostic stage of verify-source-only; publisher source is never authored here.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createReadStream} from 'node:fs';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),bs=String.fromCharCode(92);
const hash=async file=>{const h=crypto.createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');};
export function nativeTagPath(value){
  const normalized=value.replaceAll(bs,'/');
  if(!normalized||normalized.length>240||/[:\r\n\0]/.test(normalized)||normalized.startsWith('/')||normalized.split('/').some(s=>!s||s==='.'||s==='..')||!/[.][a-zA-Z_0-9]+$/.test(normalized))throw Error('Unsafe native dependency path: '+JSON.stringify(value).slice(0,256));
  return normalized;
}
// Same-path H1A mode/mod2 contract from native_staging::dependency_plan.
// This diagnostic resolves providers only: it never changes native tag bytes.
export function nextNativeDependencies(paths,archiveIndex,staged,bindings=new Map()){
 const result=new Map();for(const value of paths){
  const broken=value.endsWith(' [BROKEN]'),tag=nativeTagPath(broken?value.slice(0,-9):value),key=tag.toLowerCase();
  let archived=archiveIndex.get('tags/'+key),binding=false;
  if(!archived&&key.endsWith('.model')){const gbx=archiveIndex.get('tags/'+key.slice(0,-6)+'.gbxmodel');if(gbx){archived=gbx;binding=true;bindings.set(key,gbx.slice(5));}}
  if(!archived)throw Error('Required native SDK dependency is absent: '+tag);
  const canonical=archived.slice(5).toLowerCase();if(broken&&staged.has(canonical)&&!binding)throw Error('Staged native dependency remains broken: '+tag);
  if(!staged.has(canonical))result.set(canonical,archived);
 }return [...result.values()];
}

export async function nativeStandaloneBaseline({context,archive,kit,invader,report,scenario='levels/test/bloodgulch/bloodgulch.scenario',reviewSeconds=120}){
  report.scope='Unmodified owner-installed H1A SDK source baseline; setup/launch diagnostic, not Spark authoring or retail cache acceptance';
  report.visualAcceptance=false;report.gameplayAcceptance=false;report.complete=false;
  const spec=JSON.parse(await fs.readFile(new URL('../docs/fixtures/source-only-h1a-inputs.json',import.meta.url),'utf8'));
  const shell=JSON.parse(await fs.readFile(new URL('../docs/fixtures/h1a-standalone-shell-inputs.json',import.meta.url),'utf8'));
  archive=path.resolve(archive);kit=path.resolve(kit);invader=path.resolve(invader);scenario=nativeTagPath(scenario);
  if((await fs.stat(archive)).size!==spec.sourceArchive.bytes||await hash(archive)!==spec.sourceArchive.sha256)throw Error('Selected SDK archive differs from the verified owner-installed source');
  const root=path.join(context.directory,'standalone-baseline');await fs.mkdir(root);await fs.mkdir(path.join(root,'data'));
  const run=async(binary,args,options={})=>{const pending=exec(binary,args,{windowsHide:true,maxBuffer:2*1024**2,timeout:120000,...options});if(pending.child)await context.trackProcess(pending.child);return pending;};
  const listed=await run('tar.exe',['-tf',archive]);const archiveIndex=new Map();
  for(const line of listed.stdout.split(/\r?\n/).filter(value=>value.startsWith('tags/')&&!value.endsWith('/'))){nativeTagPath(line.slice(5));const key=line.toLowerCase();if(archiveIndex.has(key))throw Error('Ambiguous SDK archive path');archiveIndex.set(key,line);}
  if(JSON.stringify(shell.sourceArchive)!==JSON.stringify(spec.sourceArchive))throw Error('Native baseline fixtures use different SDK identities');
  const roots=[scenario,'globals/globals.globals',...shell.roots];
  // Reuse the already verified dependency-sized authoring/shell manifests.
  // Native recursive queries still discover and validate this scene's closure.
  let replayRows=[];
  if(process.env.SPARK_BASELINE_SEED_RECEIPT){
    const file=path.resolve(process.env.SPARK_BASELINE_SEED_RECEIPT),info=await fs.lstat(file);
    if(!info.isFile()||info.isSymbolicLink()||info.size>2*1024**2)throw Error('Invalid bounded SDK seed receipt');
    const prior=JSON.parse(await fs.readFile(file,'utf8')).standaloneBaseline?.source;
    if(prior?.archiveSha256!==spec.sourceArchive.sha256||!Array.isArray(prior.manifest)||prior.manifest.length>4096)throw Error('SDK seed belongs to another source');
    replayRows=prior.manifest;report.seedReceiptSha256=await hash(file);
  }
  const seeds=[...new Set([...spec.tagFiles,...shell.tagFiles,...replayRows].map(row=>nativeTagPath(row.path)))];
  report.pinnedSeedFiles=seeds.length;
  const staged=new Set(),bindings=new Map(),manifest=[],queries=[];let wave=nextNativeDependencies([...roots,...seeds],archiveIndex,staged,bindings),bytes=0,drive,child;
  const aliases=await run('subst.exe',[]);report.existingAliases=aliases.stdout.split(/\r?\n/).filter(Boolean).length;
  try{
    for(const letter of 'ZYXWVUTSRQP'){
      try{await fs.stat(letter+':/');continue;}catch(error){if(error.code!=='ENOENT')continue;}
      try{await run('subst.exe',[letter+':',root]);drive=letter+':';break;}catch{}
    }
    if(!drive)throw Error('No free owned short native workspace alias');
    const [real,alias]=await Promise.all([fs.stat(root),fs.stat(drive+'/')]);if(real.dev!==alias.dev||real.ino!==alias.ino)throw Error('Native workspace alias differs');
    report.alias={drive,owned:true};
    while(wave.length){
      if(staged.size+wave.length>4096||queries.length>4096)throw Error('Native baseline exceeds dependency file budget');
      const list=path.join(root,'extract-list.txt');await fs.writeFile(list,wave.join('\n')+'\n');await run('tar.exe',['-xf',archive,'-C',root,'-T',list]);
      const next=[];
      for(const entry of wave){const tag=entry.slice(5),file=path.join(root,entry),info=await fs.lstat(file);if(!info.isFile()||info.isSymbolicLink())throw Error('Native dependency is not an owned regular file');bytes+=info.size;if(bytes>384*1024**2)throw Error('Native baseline exceeds384MiB; full SDK staging is forbidden');manifest.push({path:tag,bytes:info.size,sha256:await hash(file)});staged.add(tag.toLowerCase());}
      const queryRoots=new Set([...roots,...bindings.values()]);
      for(const tag of queryRoots){
        if(!staged.has(tag.toLowerCase()))continue;
        const query=await run(path.join(invader,'invader-dependency.exe'),['-t',drive+bs+'tags','-r',tag.replaceAll('/',bs)]);
        if(/ERROR:|Failed to/i.test(query.stdout+'\n'+query.stderr))throw Error('Native dependency query failed: '+tag+' '+query.stderr.slice(0,512));
        queries.push(tag);const references=query.stdout.split(/\r?\n/).filter(Boolean);next.push(...references);
        nextNativeDependencies(references,archiveIndex,staged,bindings);
        // Invader cannot traverse a mode reference's H1A mod2 provider. Follow
        // that exact verified provider too; never omit its dependencies.
        for(const provider of bindings.values())queryRoots.add(provider);
      }
      wave=nextNativeDependencies(next,archiveIndex,staged,bindings);console.log('STANDALONE_BASELINE_DEPENDENCIES',JSON.stringify({files:staged.size,bytes,next:wave.length}));
    }
    for(const tag of [scenario,'globals/globals.globals',...shell.roots]){const verified=await run(path.join(invader,'invader-dependency.exe'),['-t',drive+bs+'tags','-r',tag.replaceAll('/',bs)]);if(/ERROR:|Failed to/i.test(verified.stdout+' '+verified.stderr)||nextNativeDependencies(verified.stdout.split(/\r?\n/).filter(Boolean),archiveIndex,staged,bindings).length)throw Error('Complete SDK dependency closure did not validate: '+tag);}
    for(const [requested,actual] of bindings){const header=Buffer.alloc(64),handle=await fs.open(path.join(root,'tags',actual));try{await handle.read(header,0,64,0);}finally{await handle.close();}if(header.toString('ascii',36,40)!=='mod2'||header.toString('ascii',60,64)!=='blam')throw Error('H1A provider is not the exact native GBX class: '+requested);}
    report.nativeModelClassBindings=Object.fromEntries(bindings);
    manifest.sort((a,b)=>a.path.localeCompare(b.path));report.source={scenario,archiveSha256:spec.sourceArchive.sha256,files:manifest.length,bytes,dependencyQueries:queries.length,manifestSha256:crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),fullSdkCopied:false,manifest};
    const nativeRead=await run(path.join(invader,'invader-edit.exe'),['-t',drive+bs+'tags','-G','type','-C','player_starting_locations',scenario.replaceAll('/',bs)]);report.scenarioReadback=nativeRead.stdout.trim();
    const resources=[];for(const relative of ['shaders/fx.bin','shaders/psh.bin','shaders/vsh.bin','steam_appid.txt']){const input=path.join(kit,relative),buffer=await fs.readFile(input);if(buffer.length>16*1024**2||!buffer.length)throw Error('Invalid native launch resource');if(relative==='steam_appid.txt'&&buffer.toString('utf8').trim()!=='1532190')throw Error('Unexpected official tool identity');await fs.mkdir(path.dirname(path.join(root,relative)),{recursive:true});await fs.writeFile(path.join(root,relative),buffer,{flag:'wx'});resources.push({relative,sha256:await hash(input),bytes:buffer.length});}
    const executable=path.join(kit,'halo_tag_test.exe');report.executable={sha256:await hash(executable),bytes:(await fs.stat(executable)).size};
    const script='; Unmodified publisher SDK control; not an authored map\r\ngame_variant slayer\r\nmap_name "'+scenario.replace(/[.]scenario$/,'').replaceAll('/',bs)+'"\r\n';await fs.writeFile(path.join(root,'spark-baseline.txt'),script,{flag:'wx'});
    const args=['-tags_dir','tags','-window','-data_dir','data','-exec','spark-baseline.txt'];report.launch={arguments:args,workingDirectory:'owned short alias',startupScript:script,resources,stdout:'owned diagnostic file',windowsHide:false,environment:'Inherited user environment; no security/profile/authentication changes'};
    const out=await fs.open(path.join(root,'native-process.txt'),'wx');child=spawn(executable,args,{cwd:drive+bs,windowsHide:false,stdio:['ignore',out.fd,out.fd],env:context.env});await context.trackProcess(child);await out.close();
    report.process={pid:child.pid,startedAt:new Date().toISOString(),exitCode:null,timedOut:false};console.log('STANDALONE_BASELINE_REVIEW',JSON.stringify({pid:child.pid,executable,sha256:report.executable.sha256,scenario,seconds:reviewSeconds}));
    const outcome=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>resolve({timedOut:true}),reviewSeconds*1000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',(code,signal)=>{clearTimeout(timer);resolve({code,signal,timedOut:false});});});
    if(outcome.timedOut){child.kill();await new Promise(resolve=>child.once('close',resolve));}
    Object.assign(report.process,{exitCode:outcome.code??null,signal:outcome.signal??null,timedOut:outcome.timedOut,finishedAt:new Date().toISOString()});
    report.diagnostics=[];for(const name of ['native-process.txt','debug.txt','reports/debug.txt','exception.txt','reports/exception.txt']){const file=path.join(root,name),info=await fs.lstat(file).catch(()=>null);if(!info?.isFile()||info.isSymbolicLink()||info.size>4*1024**2)continue;const b=await fs.readFile(file);report.diagnostics.push({file:name,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex'),tail:b.subarray(-65536).toString('utf8')});}
    for(const input of manifest)if(await hash(path.join(root,'tags',input.path))!==input.sha256)throw Error('Native scene changed its staged SDK input: '+input.path);
    for(const resource of resources)if(await hash(path.join(kit,resource.relative))!==resource.sha256)throw Error('Original kit resource changed');
    if(await hash(archive)!==spec.sourceArchive.sha256||await hash(executable)!==report.executable.sha256)throw Error('Original SDK/executable changed');report.originalInputsUnchanged=true;
    if(outcome.timedOut||outcome.code!==0)throw Error('Standalone SDK baseline did not close normally: '+JSON.stringify(outcome));report.complete=true;
  }finally{
    if(child&&child.exitCode===null&&child.signalCode===null){child.kill();await new Promise(resolve=>child.once('close',resolve));}
    if(drive){const [current,real]=await Promise.all([fs.stat(drive+'/'),fs.stat(root)]);if(current.dev!==real.dev||current.ino!==real.ino)throw Error('Owned native alias changed; leave unrelated mapping untouched');await run('subst.exe',[drive,'/d']);report.alias.removed=true;}
  }
}
