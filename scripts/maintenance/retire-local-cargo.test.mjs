import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import crypto from 'node:crypto';
import {planCargoCaches,verifyCargoPlan,rootsFromInventory,purgeCargoPlan} from './retire-local-cargo.mjs';
const quiet=async()=>({blocking:[],processes:[],reparseChecked:true});
async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'spark-cargo-rescue-'));
  t.after(async()=>{assert(path.isAbsolute(root)&&path.dirname(root)===path.resolve(os.tmpdir())&&path.basename(root).startsWith('spark-cargo-rescue-'));await fs.rm(root,{recursive:true});});
  const source=path.join(root,'.local','build','cargo');await fs.mkdir(path.join(source,'release','deps'),{recursive:true});
  await fs.writeFile(path.join(source,'CACHEDIR.TAG'),'Signature: 8a477f597d28d172789f06886806bc55\n');
  await fs.writeFile(path.join(source,'release','GuiltySpark.exe'),'MZ fixture app');
  await fs.writeFile(path.join(source,'release','deps','same-app.exe'),'MZ fixture app');
  await fs.writeFile(path.join(source,'release','GuiltySpark.pdb'),'debug fixture');
  await fs.writeFile(path.join(source,'release','deps','spark_core.rlib'),'regenerable');
  await fs.writeFile(path.join(source,'release','authored.gsproject'),'unclassified source must survive');
  await fs.mkdir(path.join(source,'release','.fingerprint','user-content'),{recursive:true});
  await fs.writeFile(path.join(source,'release','.fingerprint','user-content','original.map'),'unique map must survive even in a cache');
  await fs.mkdir(path.join(root,'target'),{recursive:true});await fs.writeFile(path.join(root,'target','active'),'active build');
  return {root,source,options:{workspace:root,roots:['.local/build/cargo'],journal:path.join(root,'journal'),processGate:quiet}};
}
test('rescues executable/debug bytes independently, deduplicates them, and never changes cache or active target',async t=>{
  const {root,source,options}=await fixture(t),result=await planCargoCaches(options);
  assert.equal(result.plan.totals.files,7);assert.equal(result.plan.totals.rescueFiles,5);assert.equal(result.plan.totals.rescueUniqueFiles,4);assert.equal(result.plan.sourceDeletionPerformed,false);
  assert.equal(await fs.readFile(path.join(source,'release','GuiltySpark.exe'),'utf8'),'MZ fixture app');assert.equal(await fs.readFile(path.join(root,'target','active'),'utf8'),'active build');
  for(const e of result.plan.trees[0].entries.filter(e=>e.rescued)){const saved=path.join(root,...e.rescued.path.split('/'));assert.equal((await fs.lstat(saved)).nlink,1);assert.notEqual((await fs.lstat(saved,{bigint:true})).ino,(await fs.lstat(path.join(source,...e.relative.split('/')),{bigint:true})).ino);}
  assert.equal((await verifyCargoPlan({manifest:result.file,sha256:result.sha256,processGate:quiet})).files,7);
});
test('changed generated source refuses a reviewed plan',async t=>{
  const {source,options}=await fixture(t),result=await planCargoCaches(options);await fs.writeFile(path.join(source,'release','deps','spark_core.rlib'),'changed!!!!');
  await assert.rejects(verifyCargoPlan({manifest:result.file,sha256:result.sha256,processGate:quiet}),/changed/i);
});
test('changed rescued binary refuses a reviewed plan',async t=>{
  const {root,options}=await fixture(t),result=await planCargoCaches(options),entry=result.plan.trees[0].entries.find(e=>e.rescued);await fs.writeFile(path.join(root,...entry.rescued.path.split('/')),'changed saved binary');
  await assert.rejects(verifyCargoPlan({manifest:result.file,sha256:result.sha256,processGate:quiet}),/changed/i);
  if(process.platform==='win32'){
    await assert.rejects(purgeCargoPlan({manifest:result.file,sha256:result.sha256,reviewedSha256:result.sha256,journal:path.join(root,'purge'),processGate:quiet}),/changed/i);
    for(const e of result.plan.trees[0].entries)assert.equal((await fs.lstat(path.join(root,'.local','build','cargo',...e.relative.split('/')))).isFile(),true);
  }
});
test('active target, unrelated sources, missing markers and active processes cannot be admitted',async t=>{
  const {root,source,options}=await fixture(t);
  await assert.rejects(planCargoCaches({...options,roots:['target']}),/obsolete Cargo/);
  await assert.rejects(planCargoCaches({...options,roots:['.local/not-a-cache']}),/obsolete Cargo/);
  await assert.rejects(planCargoCaches({...options,processGate:async()=>({blocking:[{pid:1}]})}),/Active/);
  await fs.writeFile(path.join(source,'CACHEDIR.TAG'),'not cargo');await assert.rejects(planCargoCaches(options),/marker/);
  assert.deepEqual(rootsFromInventory({canonicalDirectory:root,storage:{directories:[{relative:'target'},{relative:'.local/build/cargo'}]}},root),['.local/build/cargo']);
});
test('junction or symlink traversal is refused',async t=>{
  const {root,source,options}=await fixture(t),outside=path.join(root,'user-source');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'unique.map'),'keep');
  try{await fs.symlink(outside,path.join(source,'linked'),process.platform==='win32'?'junction':'dir');}catch(e){if(e.code==='EPERM'){t.skip('Host cannot create a junction fixture');return;}throw e;}
  await assert.rejects(planCargoCaches(options),/Linked/);assert.equal(await fs.readFile(path.join(outside,'unique.map'),'utf8'),'keep');
});
test('reviewed purge removes only cached files and empty directories while keeping unique source copies and active target',{skip:process.platform!=='win32'},async t=>{
  const {root,source,options}=await fixture(t),result=await planCargoCaches(options);
  const receipt=await purgeCargoPlan({manifest:result.file,sha256:result.sha256,reviewedSha256:result.sha256,journal:path.join(root,'purge'),processGate:quiet});
  assert.equal(receipt.complete,true);assert.equal(receipt.filesRemoved,7);assert.equal(receipt.logicalBytesRemoved,result.plan.totals.inputBytes);assert.equal(receipt.rootTargetTouched,false);
  await assert.rejects(fs.lstat(source),{code:'ENOENT'});assert.equal(await fs.readFile(path.join(root,'target','active'),'utf8'),'active build');
  for(const entry of result.plan.trees[0].entries.filter(e=>e.rescued))assert.equal((await fs.lstat(path.join(root,...entry.rescued.path.split('/')))).nlink,1);
  const map=result.plan.trees[0].entries.find(e=>e.relative.endsWith('original.map'));assert.equal(await fs.readFile(path.join(root,...map.rescued.path.split('/')),'utf8'),'unique map must survive even in a cache');
});
test('purge refuses changed content before deleting any other reviewed file',{skip:process.platform!=='win32'},async t=>{
  const {root,source,options}=await fixture(t),result=await planCargoCaches(options),file=path.join(source,'release','deps','spark_core.rlib');await fs.writeFile(file,'changed!!!!');
  // A metadata-only plan would accept this deliberately stale content hash.
  // The native preflight must reject it before deleting any reviewed file.
  const current=await fs.lstat(file,{bigint:true}),entry=result.plan.trees[0].entries.find(e=>e.relative==='release/deps/spark_core.rlib');entry.mtimeNs=String(current.mtimeNs);entry.ctimeNs=String(current.ctimeNs);
  const bytes=JSON.stringify(result.plan);await fs.writeFile(result.file,bytes);const sha=crypto.createHash('sha256').update(bytes).digest('hex');
  await assert.rejects(purgeCargoPlan({manifest:result.file,sha256:sha,reviewedSha256:sha,journal:path.join(root,'purge'),processGate:quiet}),/changed/i);
  for(const entry of result.plan.trees[0].entries)assert.equal((await fs.lstat(path.join(source,...entry.relative.split('/')))).isFile(),true);
});
test('purge refuses a replaced same-content file and requires the exact reviewed hash',{skip:process.platform!=='win32'},async t=>{
  const {root,source,options}=await fixture(t),result=await planCargoCaches(options),file=path.join(source,'release','GuiltySpark.exe');await fs.unlink(file);await fs.writeFile(file,'MZ fixture app');
  await assert.rejects(purgeCargoPlan({manifest:result.file,sha256:result.sha256,reviewedSha256:'0'.repeat(64),journal:path.join(root,'purge'),processGate:quiet}),/reviewed/i);
  await assert.rejects(purgeCargoPlan({manifest:result.file,sha256:result.sha256,reviewedSha256:result.sha256,journal:path.join(root,'purge'),processGate:quiet}),/changed/i);
  assert.equal(await fs.readFile(file,'utf8'),'MZ fixture app');
});
test('a real running helper in the cache prevents purge',{skip:process.platform!=='win32'},async t=>{
  const {root,source,options}=await fixture(t),executable=path.join(source,'release','qa_cargo_fixture.exe');await fs.copyFile(process.env.ComSpec??'C:\\Windows\\System32\\cmd.exe',executable);
  const result=await planCargoCaches(options),child=spawn(executable,['/d','/c','set /p SPARK_CARGO_FIXTURE_HOLD='],{stdio:['pipe','ignore','ignore'],windowsHide:true});
  await once(child,'spawn');
  try{await assert.rejects(purgeCargoPlan({manifest:result.file,sha256:result.sha256,reviewedSha256:result.sha256,journal:path.join(root,'purge')}),/Active|active/);assert.equal((await fs.lstat(executable)).isFile(),true);}
  finally{child.stdin.end('\r\n');if(child.exitCode===null)await once(child,'exit');}
});
