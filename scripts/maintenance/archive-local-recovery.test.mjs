import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
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

const recoveryPython=process.env.SPARK_RECOVERY_PYTHON;
const providerTest={skip:!recoveryPython?'Requires explicit SPARK_RECOVERY_PYTHON for genuine provider acceptance':false};
async function providerFixture(t){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'spark-indexed-recovery-')),workspace=path.join(base,'workspace'),root=path.join(workspace,'preserved'),zip=path.join(root,'recovery-archives/fixture/payload.zip');
  t.after(async()=>{assert.equal(path.dirname(base),path.resolve(os.tmpdir()));assert(path.basename(base).startsWith('spark-indexed-recovery-'));await fs.rm(base,{recursive:true,force:true});});
  await fs.mkdir(path.dirname(zip),{recursive:true});const payload=Buffer.from('genuine archive provider fixture; no Halo gameplay claim'),hash=crypto.createHash('sha256').update(payload).digest('hex');
  await promisify(execFile)(recoveryPython,['-I','-c','import sys,zipfile,base64\nwith zipfile.ZipFile(sys.argv[1],"x",zipfile.ZIP_DEFLATED) as z:z.writestr(sys.argv[2],base64.b64decode(sys.argv[3]))',zip,hash,payload.toString('base64')],{windowsHide:true});
  const zipBytes=await fs.readFile(zip),indexFile=path.join(root,'recovery-metadata/preservation-index.json');await fs.mkdir(path.dirname(indexFile),{recursive:true});
  const index={schemaVersion:1,kind:'spark-preservation-index',workspace,root,objects:{[hash]:{kind:'zip-member',path:'recovery-archives/fixture/payload.zip',member:hash,bytes:payload.length,containerBytes:zipBytes.length,containerSha256:crypto.createHash('sha256').update(zipBytes).digest('hex')}},files:{},legacyVaults:{}};
  const indexBytes=Buffer.from(JSON.stringify(index));await fs.writeFile(indexFile,indexBytes);const catalog={schemaVersion:1,kind:'spark-local-recovery-catalog',workspace,files:[],directories:[],links:[]};
  return {base,workspace,root,zip,zipBytes,payload,hash,catalog,index,indexFile,options:{preservationIndex:indexFile,indexSha256:crypto.createHash('sha256').update(indexBytes).digest('hex'),pythonExecutable:recoveryPython}};
}
test('an absent external CAS object and historical ZIP recover through one explicitly pinned native provider',providerTest,async t=>{
  const f=await providerFixture(t),relative='.local/historical/original.weapon',externalFiles=[{relative,sha256:f.hash,bytes:f.payload.length}],externalObjects={[f.hash]:path.join(f.root,'immutable-assets/blobs',f.hash.slice(0,2),f.hash)};
  const one=path.join(f.base,'one-café-世界');assert.equal((await restoreRecovery({catalog:f.catalog,destination:one,relative,name:'chosen-世界.weapon',externalFiles,externalObjects,...f.options})).files,1);assert.deepEqual(await fs.readFile(path.join(one,'chosen-世界.weapon')),f.payload);assert.equal((await fs.lstat(path.join(one,'chosen-世界.weapon'))).nlink,1);
  const row={relative,sha256:f.hash,bytes:f.payload.length,object:`objects/${f.hash.slice(0,2)}/${f.hash}`},catalog={...f.catalog,files:[row,{...row,relative:'.local/historical/alias.weapon'}]},all=path.join(f.base,'all');
  assert.equal((await restoreRecovery({archive:path.join(f.root,'retired.zip'),catalog,destination:all,all:true,...f.options})).files,2);
  const first=path.join(all,'legacy-local/historical/original.weapon'),alias=path.join(all,'legacy-local/historical/alias.weapon');await fs.writeFile(first,'edit restored bytes');assert.deepEqual(await fs.readFile(alias),f.payload);assert.deepEqual(await fs.readFile(f.zip),f.zipBytes);await assert.rejects(fs.lstat(path.join(all,'.local')),/ENOENT/);
  await assert.rejects(restoreRecovery({catalog:f.catalog,destination:one,relative,externalFiles,...f.options}),/EEXIST/);
  const prefix=f.zipBytes.subarray(0,48),prefixSha=crypto.createHash('sha256').update(prefix).digest('hex'),indexFile=path.join(f.root,'recovery-metadata/range-index.json');
  const provider=f.index.objects[f.hash],indexBytes=Buffer.from(JSON.stringify({...f.index,objects:{[prefixSha]:{kind:'range',path:provider.path,offset:0,bytes:prefix.length,containerBytes:provider.containerBytes,containerSha256:provider.containerSha256}}}));await fs.writeFile(indexFile,indexBytes);
  const range=path.join(f.base,'range');assert.equal((await restoreRecovery({catalog:f.catalog,destination:range,relative:'.local/incomplete.zip',externalFiles:[{relative:'.local/incomplete.zip',sha256:prefixSha,bytes:prefix.length}],preservationIndex:indexFile,indexSha256:crypto.createHash('sha256').update(indexBytes).digest('hex'),pythonExecutable:recoveryPython})).files,1);assert.deepEqual(await fs.readFile(path.join(range,'incomplete.zip')),prefix);
});
test('indexed recovery rejects wrong pins, corrupt containers and reparse-backed providers',providerTest,async t=>{
  const f=await providerFixture(t),relative='.local/source.weapon',externalFiles=[{relative,sha256:f.hash,bytes:f.payload.length}];
  const options={catalog:f.catalog,relative,externalFiles,...f.options};
  await assert.rejects(restoreRecovery({...options,destination:path.join(f.base,'bad-pin'),indexSha256:'a'.repeat(64)}),/index SHA-256 differs/);
  const broken=Buffer.from(f.zipBytes);broken[0]^=1;await fs.writeFile(f.zip,broken);
  await assert.rejects(restoreRecovery({...options,destination:path.join(f.base,'corrupt')}),/hash|SHA|container|changed|differs|CRC/i);await fs.writeFile(f.zip,f.zipBytes);
  if(process.platform==='win32'){
    const parent=path.dirname(f.zip);await fs.rename(parent,parent+'.held');await fs.symlink(parent+'.held',parent,'junction');
    await assert.rejects(restoreRecovery({...options,destination:path.join(f.base,'reparse')}),/link|reparse|alias/i);assert.deepEqual(await fs.readFile(path.join(parent+'.held','payload.zip')),f.zipBytes);
  }
});
