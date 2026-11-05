import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { assertQaOutputPath, beginQaStorage, disposeQaScratch, admitCargoOutput } from './native-qa-storage.mjs';
import { safeQaCopy } from './qa-safe-copy.mjs';

async function fixture(run) {
  const temporaryParent = await fs.realpath(os.tmpdir());
  const root = await fs.mkdtemp(path.join(temporaryParent, 'spark-qa-storage-'));
  try { await run(root); }
  finally {
    assert.equal(await fs.realpath(root), root);
    assert.ok(root.startsWith(path.join(temporaryParent, 'spark-qa-storage-')));
    // Only this test's independent, explicitly resolved small temporary root.
    await fs.rm(root, { recursive: true });
  }
}
const options = root => ({ workflow:'contract', appSha256:'a'.repeat(64), reservationBytes:512*1024, totalBytes:4*1024*1024, minimumFreeBytes:0, storageRoot:path.join(root,'catalog') });
const mkdir = async directory => { await fs.mkdir(directory); return directory; };

test('shared Cargo admission reuses one cache and refuses growth without deleting accepted output', () => fixture(async parent => {
  const cache=await mkdir(path.join(parent,'target'));
  await fs.writeFile(path.join(cache,'accepted.exe'),'valid');
  for(let i=0;i<3;i++)assert.equal((await admitCargoOutput(cache,{budget:20,reserve:10,minimumFree:0})).bytes,5);
  await assert.rejects(admitCargoOutput(cache,{budget:10,reserve:10,minimumFree:0}),/budget exhausted/);
  assert.equal(await fs.readFile(path.join(cache,'accepted.exe'),'utf8'),'valid');
  assert.deepEqual(await fs.readdir(cache),['accepted.exe']);
  const alias=path.join(parent,'target-alias');await fs.symlink(cache,alias,process.platform==='win32'?'junction':'dir');
  await assert.rejects(admitCargoOutput(alias,{budget:20,reserve:10,minimumFree:0}),/links|junctions/);
  await assert.rejects(admitCargoOutput(path.resolve('src'),{budget:20,reserve:10,minimumFree:0}),/overlap/);
}));

test('QA run records native source identity and outcome; removes only sealed scratch', () => fixture(async parent => {
  const root=await mkdir(path.join(parent,'run')), finish=await beginQaStorage(root, options(parent));
  let record=JSON.parse(await fs.readFile(path.join(root,'storage-run.json'),'utf8'));
  assert.equal(record.active,true);
  assert.match(record.sourceCommit,/^[a-f0-9]{40}$/);
  const scratch=path.join(root,'temporary.exe'), source=path.join(root,'unique.map');
  await fs.writeFile(scratch,'regenerable application copy');
  await fs.writeFile(source,'irreplaceable source evidence');
  const seal=await finish.registerDisposable(scratch);
  await assert.rejects(disposeQaScratch(root,seal),/Active QA/);
  await assert.rejects(finish('unknown'),/explicit/);
  await finish('failed');
  record=JSON.parse(await fs.readFile(path.join(root,'storage-run.json'),'utf8'));
  assert.equal(record.status,'failed');
  assert.equal(record.active,false);
  assert.equal(record.disposedBytes,28);
  assert.equal(await fs.readFile(source,'utf8'),'irreplaceable source evidence');
  await assert.rejects(fs.stat(scratch),{code:'ENOENT'});
}));

test('changed, unrelated, replaced and linked scratch cannot be disposed', () => fixture(async parent => {
  const root=await mkdir(path.join(parent,'run')), finish=await beginQaStorage(root,options(parent));
  const file=path.join(root,'changed.bin');await fs.writeFile(file,'before');
  const seal=await finish.registerDisposable(file);
  await fs.writeFile(file,'after!');
  await assert.rejects(finish('passed'),/changed/);
  assert.equal(await fs.readFile(file,'utf8'),'after!');
  await assert.rejects(disposeQaScratch(path.join(parent,'other'),seal,{ownerFinished:true}),/ownership/);
  await fs.unlink(file);await fs.writeFile(file,'before');
  await assert.rejects(disposeQaScratch(root,seal,{ownerFinished:true}),/changed|identity/);
  const folder=await mkdir(path.join(root,'folder')), link=path.join(root,'alias');
  await fs.symlink(folder,link,process.platform==='win32'?'junction':'dir');
  await assert.rejects(finish.registerDisposable(link),/link|junction/);
  assert.equal(await fs.readFile(file,'utf8'),'before');
}));

test('interrupted runs keep reservations and block growth instead of silently evicting evidence', () => fixture(async parent => {
  const root=await mkdir(path.join(parent,'interrupted'));
  await beginQaStorage(root,{...options(parent),totalBytes:640*1024});
  const next=await mkdir(path.join(parent,'next'));
  await assert.rejects(beginQaStorage(next,{...options(parent),totalBytes:640*1024}),/budget/);
  assert.equal(JSON.parse(await fs.readFile(path.join(root,'storage-run.json'),'utf8')).active,true);
  await assert.rejects(fs.stat(path.join(next,'storage-run.json')),{code:'ENOENT'});
}));

test('an unknown or interrupted admission lock is preserved rather than deleted by another run', () => fixture(async parent => {
  const root=await mkdir(path.join(parent,'run')),storageRoot=await mkdir(path.join(parent,'catalog'));
  const leases=await mkdir(path.join(storageRoot,'.leases')),lock=path.join(leases,'admission.lock');
  await fs.writeFile(lock,'unresolved owner checkpoint');
  await assert.rejects(beginQaStorage(root,options(parent)),/active or interrupted/);
  assert.equal(await fs.readFile(lock,'utf8'),'unresolved owner checkpoint');
  await assert.rejects(fs.stat(path.join(root,'storage-run.json')),{code:'ENOENT'});
}));

test('repeated equivalent QA fixtures dispose copied inputs; only bounded receipts accumulate', () => fixture(async parent => {
  const counts=[];
  for(let n=0;n<4;n++) {
    const root=await mkdir(path.join(parent,'repeat-'+n)),finish=await beginQaStorage(root,options(parent));
    const scratch=await mkdir(path.join(root,'scratch'));
    await fs.writeFile(path.join(scratch,'small.weapon'),Buffer.alloc(64*1024,7));
    await finish.registerDisposable(scratch);
    await fs.writeFile(path.join(root,'readback.json'),JSON.stringify({sameNativeInput:true}));
    await finish('passed');
    const report=JSON.parse(await fs.readFile(path.join(root,'storage-run.json'),'utf8'));
    assert.equal(report.disposedBytes,64*1024);
    assert.ok(report.logicalBytes<8192);
    counts.push(report.files);
    await assert.rejects(fs.stat(scratch),{code:'ENOENT'});
  }
  assert.equal(new Set(counts).size,1);
}));

test('obsolete .local outputs and linked output ancestors are rejected before creation', () => fixture(async parent => {
  const obsolete=path.join(parent,'.local','next');
  await assert.rejects(assertQaOutputPath(obsolete),/Obsolete/);
  await assert.rejects(fs.stat(path.join(parent,'.local')),{code:'ENOENT'});
  const real=await mkdir(path.join(parent,'real')), alias=path.join(parent,'alias');
  await fs.symlink(real,alias,process.platform==='win32'?'junction':'dir');
  await assert.rejects(assertQaOutputPath(path.join(alias,'run')),/links|junctions/);
  const result=spawnSync(process.execPath,['scripts/cargo.mjs','--version'],{cwd:path.resolve('.'),env:{...process.env,CARGO_TARGET_DIR:obsolete},encoding:'utf8',windowsHide:true});
  assert.notEqual(result.status,0);assert.match(result.stderr,/obsolete .local/i);
  const desktop=spawnSync(process.execPath,['scripts/desktop.mjs','info'],{cwd:path.resolve('.'),env:{...process.env,CARGO_TARGET_DIR:obsolete},encoding:'utf8',windowsHide:true});
  assert.notEqual(desktop.status,0);assert.match(desktop.stderr,/obsolete .local/i);
  await assert.rejects(fs.stat(path.join(parent,'.local')),{code:'ENOENT'});
}));

test('copy admission rejects self copy, generated descendants, links and quota before invoking native helper', () => fixture(async parent => {
  const source=await mkdir(path.join(parent,'source'));await fs.writeFile(path.join(source,'small.weapon'),'tiny fixture');
  await assert.rejects(safeQaCopy(source,path.join(source,'nested')),/contain/);
  const alias=path.join(parent,'alias');await fs.symlink(source,alias,process.platform==='win32'?'junction':'dir');
  await assert.rejects(safeQaCopy(alias,path.join(parent,'copied')) ,/linked/);
  await fs.mkdir(path.join(source,'artifacts'));await fs.writeFile(path.join(source,'artifacts','copy'),'no');
  await assert.rejects(safeQaCopy(source,path.join(parent,'copied')),/generated/);
  await fs.rm(path.join(source,'artifacts'),{recursive:true});
  const prior=process.env.SPARK_QA_COPY_BUDGET_BYTES;process.env.SPARK_QA_COPY_BUDGET_BYTES='4';
  try { await assert.rejects(safeQaCopy(source,path.join(parent,'copied')),/above its/); }
  finally { if(prior===undefined)delete process.env.SPARK_QA_COPY_BUDGET_BYTES;else process.env.SPARK_QA_COPY_BUDGET_BYTES=prior; }
  await assert.rejects(fs.stat(path.join(parent,'copied')),{code:'ENOENT'});
}));
