import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nativeTagPath,nextNativeDependencies,verifyPreparedSdk} from './native-standalone-baseline.mjs';
test('native SDK baseline admits only archive-backed tag paths and rejects traversal/streams',()=>{
 for(const value of ['../globals.globals','levels/../a.scenario','C:/x.scenario','/x.scenario','a:stream.bitmap','x\n.scenario','a//b.sound','x'])assert.throws(()=>nativeTagPath(value));
 assert.equal(nativeTagPath('levels\\test\\bloodgulch\\bloodgulch.scenario'),'levels/test/bloodgulch/bloodgulch.scenario');
});
test('dependency waves preserve exact publisher archive spelling and never restage a visited cycle',()=>{
 const index=new Map([['tags/a.scenario','tags/A.scenario'],['tags/b.bitmap','tags/B.bitmap']]);
 assert.deepEqual(nextNativeDependencies(['A.scenario','a.scenario','b.bitmap'],index,new Set()),['tags/A.scenario','tags/B.bitmap']);
 assert.deepEqual(nextNativeDependencies(['a.scenario','b.bitmap'],index,new Set(['a.scenario','b.bitmap'])),[]);
 assert.throws(()=>nextNativeDependencies(['missing.sound'],index,new Set()),/absent/);
});

test('JIT missing markers require a real archive provider; broken staged bytes are never accepted',()=>{const index=new Map([['tags/a.sky','tags/a.sky']]);assert.deepEqual(nextNativeDependencies(['a.sky [BROKEN]'],index,new Set()),['tags/a.sky']);assert.throws(()=>nextNativeDependencies(['a.sky [BROKEN]'],index,new Set(['a.sky'])),/remains broken/);assert.throws(()=>nextNativeDependencies(['missing.sky [BROKEN]'],index,new Set()),/absent/);});

test('H1A mode bindings use only the exact same native path and never require a duplicate tag',()=>{const index=new Map([['tags/sky/clear.gbxmodel','tags/sky/clear.gbxmodel']]),bindings=new Map();assert.deepEqual(nextNativeDependencies(['sky/clear.model [BROKEN]'],index,new Set(),bindings),['tags/sky/clear.gbxmodel']);assert.equal(bindings.get('sky/clear.model'),'sky/clear.gbxmodel');assert.deepEqual(nextNativeDependencies(['sky/clear.model [BROKEN]'],index,new Set(['sky/clear.gbxmodel']),bindings),[]);assert.throws(()=>nextNativeDependencies(['other/clear.model [BROKEN]'],index,new Set()),/absent/);});


test('prepared SDK reuse rehashes the exact owned set and refuses changed, extra or foreign inputs',async()=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path'),crypto=await import('node:crypto');
 const owner=await fs.mkdtemp(path.join(os.tmpdir(),'spark-sdk-reuse-')),tags=path.join(owner,'tags');
 try{
  await fs.mkdir(tags);const file=path.join(tags,'a.bitmap'),data=Buffer.from('Owned integrity fixture; not a native Halo asset');await fs.writeFile(file,data);
  const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
  const manifest=[{path:'a.bitmap',bytes:data.length,sha256:digest(data)}],source={archiveSha256:'a'.repeat(64),fullSdkCopied:false,files:1,bytes:data.length,manifest,manifestSha256:digest(JSON.stringify(manifest))};
  assert.equal(await verifyPreparedSdk(tags,source,owner,source.archiveSha256),await fs.realpath(tags));
  await assert.rejects(verifyPreparedSdk(tags,source,path.join(owner,'foreign'),source.archiveSha256));
  await assert.rejects(verifyPreparedSdk(tags,{...source,archiveSha256:'b'.repeat(64)},owner,source.archiveSha256),/identity/);
  await fs.writeFile(file,Buffer.alloc(data.length));await assert.rejects(verifyPreparedSdk(tags,source,owner,source.archiveSha256),/changed/);
  assert.deepEqual(await fs.readFile(file),Buffer.alloc(data.length));await fs.writeFile(file,data);
  await fs.writeFile(path.join(tags,'unique.bitmap'),'preserve this conflicting input');
  await assert.rejects(verifyPreparedSdk(tags,source,owner,source.archiveSha256),/Unexpected/);
  assert.equal(await fs.readFile(path.join(tags,'unique.bitmap'),'utf8'),'preserve this conflicting input');
 }finally{assert.ok(path.resolve(owner).startsWith(path.resolve(os.tmpdir())+path.sep+'spark-sdk-reuse-'));await fs.rm(owner,{recursive:true});}
});
