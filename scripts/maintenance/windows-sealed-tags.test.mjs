import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {preserveTagTrees} from './retire-local-tags.mjs';
import {trustedScriptInvocation} from './windows-trusted-script.mjs';
const win={skip:process.platform!=='win32'},hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function fixture(t){
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'spark-sealed-tags-')),workers=[];
  t.after(async()=>{for(const worker of workers)await worker.close();assert(path.dirname(workspace)===path.resolve(os.tmpdir())&&path.basename(workspace).startsWith('spark-sealed-tags-'));await fs.rm(workspace,{recursive:true,force:true});});
  const root='.local/library/jobs/a/workspace/tags',source=path.join(workspace,root);await fs.mkdir(path.join(source,'weapons'),{recursive:true});
  await fs.writeFile(path.join(source,'weapons/first.weapon'),'same native tag bytes');await fs.writeFile(path.join(source,'weapons/second.weapon'),'same native tag bytes');
  await fs.writeFile(path.join(workspace,'original.weapon'),'unrelated original');
  const journal=path.join(workspace,'journal'),plan=await preserveTagTrees({workspace,roots:[root],journal}),file=path.join(journal,'plan.json');
  const tree=plan.trees[0],manifest=JSON.parse(await fs.readFile(tree.manifest,'utf8')),entry=manifest.entries[0],blob=path.join(plan.vault,'blobs',entry.sha256.slice(0,2),entry.sha256);
  return {workspace,source,plan,file,tree,manifest,blob,workers};
}
async function start(f){
  const sha=hash(await fs.readFile(f.file)),invocation=await trustedScriptInvocation('scripts/maintenance/retire-native-tags.ps1',process.env.SPARK_SEALED_NATIVE_HELPER??'scripts/maintenance/windows-sealed-files.cs',{Plan:f.file,PlanSha256:sha}),child=spawn('powershell.exe',invocation.args,{env:invocation.env,windowsHide:true,stdio:['pipe','pipe','pipe']});
  const queue=[],waiters=[];let stderr='',exit=null,closed=false;
  child.stderr.on('data',value=>stderr+=value);const reader=createInterface({input:child.stdout,crlfDelay:Infinity});
  reader.on('line',line=>{const value=JSON.parse(line);if(waiters.length)waiters.shift()(value);else queue.push(value);});
  child.on('exit',code=>{exit=code;for(const resolve of waiters.splice(0))resolve({type:'exited',code,stderr});});
  const next=()=>new Promise((resolve,reject)=>{if(queue.length)return resolve(queue.shift());if(exit!==null)return reject(Error(stderr||`Worker exited ${exit}`));const timer=setTimeout(()=>reject(Error(`Native worker timed out: ${stderr}`)),15000);waiters.push(value=>{clearTimeout(timer);resolve(value);});});
  const worker={async request(relative,manifestSha256=f.tree.manifestSha256){child.stdin.write(JSON.stringify({id:'fixture',manifestSha256,relative})+'\n');return next();},async close(){if(closed)return;closed=true;child.stdin.end();if(exit===null)await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},10000);child.once('exit',()=>{clearTimeout(timer);resolve();});});reader.close();}};
  f.workers.push(worker);const ready=await next();assert.equal(ready.type,'ready',JSON.stringify({ready,stderr}));assert.equal(ready.planSha256,sha);return worker;
}
test('genuine worker seals source deletion and freezes its verified independent vault blob',win,async t=>{
  const f=await fixture(t);await fs.chmod(f.blob,0o600);const worker=await start(f),result=await worker.request('weapons/first.weapon');
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.removed,true);assert.equal(result.sha256,f.manifest.entries[0].sha256);
  await assert.rejects(fs.lstat(path.join(f.source,'weapons/first.weapon')),{code:'ENOENT'});
  await assert.rejects(fs.writeFile(f.blob,'corrupt verified blob'),/EBUSY|EACCES|EPERM/);
  await assert.rejects(fs.rename(f.source,f.source+'.moved'),/EBUSY|EACCES|EPERM/);
  const other=await worker.request('../original.weapon');assert.equal(other.ok,false);assert.equal(await fs.readFile(path.join(f.workspace,'original.weapon'),'utf8'),'unrelated original');
  const second=await worker.request('weapons/second.weapon');assert.equal(second.ok,true,JSON.stringify(second));
});
test('genuine worker retains a same-byte replacement with a different native file identity',win,async t=>{
  const f=await fixture(t),file=path.join(f.source,'weapons/first.weapon');await fs.rename(file,file+'.retained');await fs.writeFile(file,'same native tag bytes');
  const worker=await start(f),result=await worker.request('weapons/first.weapon');assert.equal(result.ok,false);assert.match(result.error,/changed\/replaced/);
  assert.equal(await fs.readFile(file,'utf8'),'same native tag bytes');assert.equal(await fs.readFile(file+'.retained','utf8'),'same native tag bytes');
});
test('genuine worker hashes the sealed source rather than accepting matching size and current metadata',win,async t=>{
  const f=await fixture(t),file=path.join(f.source,'weapons/first.weapon');await fs.writeFile(file,'different tag content');const stat=await fs.lstat(file,{bigint:true});
  const entry=f.manifest.entries.find(e=>e.relative==='weapons/first.weapon');entry.bytes=Number(stat.size);entry.mtimeNs=String(stat.mtimeNs);entry.ctimeNs=String(stat.ctimeNs);
  assert.equal(entry.bytes,Buffer.byteLength('same native tag bytes'));
  const manifestBytes=JSON.stringify(f.manifest);await fs.writeFile(f.tree.manifest,manifestBytes);f.tree.manifestSha256=hash(manifestBytes);await fs.writeFile(f.file,JSON.stringify(f.plan));
  const worker=await start(f),result=await worker.request('weapons/first.weapon');assert.equal(result.ok,false);assert.match(result.error,/changed\/replaced/);assert.equal(await fs.readFile(file,'utf8'),'different tag content');
});
test('genuine worker refuses a corrupted preserved blob before removing original source',win,async t=>{
  const f=await fixture(t);await fs.chmod(f.blob,0o600);await fs.writeFile(f.blob,'invalid');const worker=await start(f),result=await worker.request('weapons/first.weapon');
  assert.equal(result.ok,false);assert.match(result.error,/blob changed/);assert.equal(await fs.readFile(path.join(f.source,'weapons/first.weapon'),'utf8'),'same native tag bytes');
});
test('genuine worker seals a native tag whose absolute file path exceeds MAX_PATH',win,async t=>{
  const f=await fixture(t),relative='weapons/long_native_'+ 'x'.repeat(180)+'.shader_environment',file=path.join(f.source,...relative.split('/'));
  assert(file.length>260);assert(path.dirname(file).length<260);await fs.writeFile(file,'long native path fixture bytes');
  f.plan=await preserveTagTrees({workspace:f.workspace,roots:[f.plan.trees[0].sourceRelative],journal:path.dirname(f.file)});f.tree=f.plan.trees[0];f.manifest=JSON.parse(await fs.readFile(f.tree.manifest,'utf8'));
  const worker=await start(f),result=await worker.request(relative);assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.removed,true);await assert.rejects(fs.lstat(file),{code:'ENOENT'});
});
test('genuine worker inspects and seals a tag beneath a directory longer than 400 characters',win,async t=>{
  const f=await fixture(t),relative=Array.from({length:11},(_,i)=>`native_directory_${i}_abcdefghijklmnop`).join('/')+'/deep.weapon',file=path.join(f.source,...relative.split('/'));
  assert(path.dirname(file).length>400);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'deep native directory fixture bytes');
  f.plan=await preserveTagTrees({workspace:f.workspace,roots:[f.plan.trees[0].sourceRelative],journal:path.dirname(f.file)});f.tree=f.plan.trees[0];f.manifest=JSON.parse(await fs.readFile(f.tree.manifest,'utf8'));
  const worker=await start(f),result=await worker.request(relative);assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.removed,true);await assert.rejects(fs.lstat(file),{code:'ENOENT'});
  assert.equal(await fs.readFile(path.join(f.workspace,'original.weapon'),'utf8'),'unrelated original');
});
