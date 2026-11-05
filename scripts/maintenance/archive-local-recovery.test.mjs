import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {inventoryLocal,sealRecovery,verifyArchive,restoreRecovery} from './archive-local-recovery.mjs';

test('ZIP64 recovery preserves Unicode, deep paths, aliases, database sidecars and external single-file recovery', {skip:process.platform!=='win32'}, async()=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'spark-recovery-fixture-')),workspace=path.join(base,'workspace');
  const local=path.join(workspace,'.local');await fs.mkdir(local,{recursive:true});
  const deep=Array.from({length:12},(_,i)=>`directory-${i}-abcdefghijklmnopqrstuvwxyz`).join('/');
  const inputs=new Map([
    ['project.gsproject',Buffer.from('{"source":"tiny genuine recovery fixture"}')],
    ['unicode/café-世界.txt',Buffer.from('Unicode original path')],
    [`${deep}/source.rs`,Buffer.from('preserved deep source')],
    ['duplicate.txt',Buffer.from('preserved deep source')],
    ['history/project.sqlite',Buffer.from('SQLite format 3\0fixture-only')],
    ['history/project.sqlite-wal',Buffer.from('WAL fixture-only')],
    ['history/project.sqlite-shm',Buffer.from('SHM fixture-only')],
    ['empty.txt',Buffer.alloc(0)],
  ]);
  for(const [relative,bytes]of inputs){const full=path.join(local,...relative.split('/'));await fs.mkdir(path.dirname(full),{recursive:true});await fs.writeFile(full,bytes);}
  await fs.symlink(local,path.join(local,'record-only-link'),'junction');
  const inventory=await inventoryLocal({workspace});assert.equal(inventory.files.length,8);assert.equal(inventory.links.length,1);
  const evidence=path.join(base,'evidence');await fs.mkdir(evidence);await fs.writeFile(path.join(evidence,'refs.txt'),'refs fixture');
  const outDir=path.join(workspace,'preserved','recovery-metadata','fixture');
  const receipt=await sealRecovery({inventory,outDir,indexManifest:{root:evidence,files:['refs.txt']}});assert.equal(receipt.sourceDeletionPerformed,false);assert.equal(receipt.allObjectHashesVerified,true);assert.equal(receipt.objects,8);
  const catalogBytes=await fs.readFile(receipt.catalog),catalog=JSON.parse(catalogBytes);
  assert.equal((await verifyArchive({archive:receipt.archive,catalog,catalogBytes})).entries,9);
  assert.equal(catalog.files.filter(r=>r.namespace==='external-recovery-index').length,1);
  const restored=path.join(base,'restored');const result=await restoreRecovery({archive:receipt.archive,catalog,destination:restored,all:true});assert.equal(result.files,9);
  for(const [relative,bytes]of inputs){const full=path.join(restored,'legacy-local',...relative.split('/'));assert.deepEqual(await fs.readFile(full),bytes);assert.equal((await fs.stat(full)).nlink,1);}
  await assert.rejects(fs.lstat(path.join(restored,'.local')),/ENOENT/);
  await assert.rejects(fs.lstat(path.join(restored,'record-only-link')),/ENOENT/);
  await assert.rejects(restoreRecovery({archive:receipt.archive,catalog,destination:restored,all:true}),/EEXIST/);
  await assert.rejects(restoreRecovery({archive:receipt.archive,catalog,destination:path.join(workspace,'wrong'),all:true}),/canonical/);
  await assert.rejects(restoreRecovery({archive:receipt.archive,catalog,destination:path.join(base,'implicit')}),/Choose one catalog file/);
  const external=path.join(base,'external-object');const payload=Buffer.from('external native CAS object');await fs.writeFile(external,payload);const hash=crypto.createHash('sha256').update(payload).digest('hex');
  const one=await restoreRecovery({archive:receipt.archive,catalog,destination:path.join(base,'one-file'),relative:'.local/external/original.map',name:'chosen-original.map',externalFiles:[{relative:'.local/external/original.map',sha256:hash,bytes:payload.length}],externalObjects:{[hash]:external}});
  assert.equal(one.files,1);assert.deepEqual(await fs.readFile(path.join(base,'one-file','chosen-original.map')),payload);
  const corrupt=path.join(base,'truncated.zip');const zip=await fs.readFile(receipt.archive);await fs.writeFile(corrupt,zip.subarray(0,Math.floor(zip.length/2)));
  await assert.rejects(verifyArchive({archive:corrupt,catalog,catalogBytes}));
  assert.equal((await inventoryLocal({workspace})).files.length,8);
});

test('changed source and payload budget failure retain original files', {skip:process.platform!=='win32'},async()=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'spark-recovery-changed-')),workspace=path.join(base,'workspace');await fs.mkdir(path.join(workspace,'.local'),{recursive:true});
  const original=path.join(workspace,'.local','owned.txt');await fs.writeFile(original,'original');const inventory=await inventoryLocal({workspace});
  await fs.writeFile(original,'changed!');await assert.rejects(sealRecovery({inventory,outDir:path.join(workspace,'preserved','recovery-metadata','changed')}),/identity changed/);
  assert.equal(await fs.readFile(original,'utf8'),'changed!');
  const fresh=await inventoryLocal({workspace});await assert.rejects(sealRecovery({inventory:fresh,outDir:path.join(workspace,'preserved','recovery-metadata','budget'),maxUniqueBytes:1}),/budget/);
  assert.equal(await fs.readFile(original,'utf8'),'changed!');
});
