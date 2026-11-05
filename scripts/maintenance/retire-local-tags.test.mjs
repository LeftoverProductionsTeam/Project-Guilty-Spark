import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {preserveTagTrees,verifyDeletionCandidate,restoreTagTree,rootsFromInventory,retireTagPlan,captureQuiescence,TagNodeIO} from './retire-local-tags.mjs';
async function fixture(){
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'spark-native-tags-'));
  const roots=['.local/library/jobs/a/workspace/tags','.local/library/jobs/b/workspace/tags'];
  for(const root of roots){await fs.mkdir(path.join(workspace,root,'weapons'),{recursive:true});await fs.writeFile(path.join(workspace,root,'weapons/pistol.weapon'),'shared source bytes');}
  await fs.writeFile(path.join(workspace,roots[1],'weapons/custom.weapon'),'unique custom edit');
  const journal=path.join(workspace,'evidence'),options={workspace,roots,journal};
  return {workspace,roots,options,cleanup:async()=>{assert.ok(path.basename(workspace).startsWith('spark-native-tags-'));await fs.rm(workspace,{recursive:true,force:true});}};
}
test('duplicate and unique tags preserve exact trees; restore copies independent writable files',async()=>{
  const f=await fixture();try{
    const plan=await preserveTagTrees(f.options);assert.equal(plan.sourceDeletionPerformed,false);assert.equal(plan.deletionAuthorized,false);
    assert.equal(plan.totals.files,3);assert.equal(plan.totals.uniqueFiles,2);assert.equal(plan.totals.duplicateFiles,1);assert.equal(plan.totals.duplicateBytes,Buffer.byteLength('shared source bytes'));
    const tree=plan.trees[1],destination=path.join(f.workspace,'preserved/restored-native-tags/recovered/tags');
    assert.equal((await restoreTagTree({manifest:tree.manifest,manifestSha256:tree.manifestSha256,destination})).files,2);
    await fs.writeFile(path.join(destination,'weapons/pistol.weapon'),'changed restored file');
    assert.equal(await fs.readFile(path.join(f.workspace,f.roots[1],'weapons/pistol.weapon'),'utf8'),'shared source bytes');
    await assert.rejects(restoreTagTree({manifest:tree.manifest,manifestSha256:tree.manifestSha256,destination}),/EEXIST/);
    await assert.rejects(restoreTagTree({manifest:tree.manifest,manifestSha256:tree.manifestSha256,destination:path.join(f.workspace,'src/tags')}),/new preserved/);
    const result=await verifyDeletionCandidate({manifest:tree.manifest,manifestSha256:tree.manifestSha256,relative:'weapons/pistol.weapon',closedWriters:true});assert.equal(result.sourceDeletionPerformed,false);
  }finally{await f.cleanup();}
});
test('changed source, tampered manifest/blob, and absent quiescence never verify for deletion',async()=>{
  const f=await fixture();try{
    const plan=await preserveTagTrees(f.options),tree=plan.trees[0];const args={manifest:tree.manifest,manifestSha256:tree.manifestSha256,relative:'weapons/pistol.weapon'};
    await assert.rejects(verifyDeletionCandidate(args),/Close all/);
    const source=path.join(f.workspace,f.roots[0],args.relative);await fs.writeFile(source,'replaced source now');
    await assert.rejects(verifyDeletionCandidate({...args,closedWriters:true}),/changed\/replaced/);
    await assert.rejects(restoreTagTree({...args,destination:path.join(f.workspace,'preserved/restored-native-tags/tampered/tags'),manifestSha256:'a'.repeat(64)}),/Manifest identity/);
    const entry=JSON.parse(await fs.readFile(tree.manifest,'utf8')).entries[0];const blob=path.join(plan.vault,'blobs',entry.sha256.slice(0,2),entry.sha256);await fs.chmod(blob,0o600);await fs.writeFile(blob,'corrupt vault');
    await assert.rejects(restoreTagTree({...args,destination:path.join(f.workspace,'preserved/restored-native-tags/corrupt/tags')}),/blob verification/);
  }finally{await f.cleanup();}
});
test('linked roots and paths are refused; unknown source files are retained and excluded',async()=>{
  const f=await fixture();try{
    const target=path.join(f.workspace,'outside');await fs.mkdir(target);await fs.writeFile(path.join(target,'secret.weapon'),'untouched');
    await fs.symlink(target,path.join(f.workspace,f.roots[0],'linked'),process.platform==='win32'?'junction':'dir');
    await fs.writeFile(path.join(f.workspace,f.roots[0],'source.rs'),'legitimate source');
    const plan=await preserveTagTrees(f.options);assert.equal(plan.excluded.length,2);assert.equal(plan.trees[0].complete,false);
    assert.equal(await fs.readFile(path.join(target,'secret.weapon'),'utf8'),'untouched');assert.equal(await fs.readFile(path.join(f.workspace,f.roots[0],'source.rs'),'utf8'),'legitimate source');
    await assert.rejects(preserveTagTrees({...f.options,roots:['.local/library/jobs/a/workspace/tags/linked/tags']}),/ENOENT|Linked\/reparse/);
    await assert.rejects(preserveTagTrees({...f.options,roots:['../original-sdk/tags']}),/Unsafe|explicit native/);
  }finally{await f.cleanup();}
});
test('interrupted preservation resumes without duplicating blobs or deleting original tags',async()=>{
  const f=await fixture();try{
    let visits=0;await assert.rejects(preserveTagTrees({...f.options,onFile:()=>{if(++visits===1)throw Error('injected interruption');}}),/injected interruption/);
    assert.equal(JSON.parse(await fs.readFile(path.join(f.options.journal,'interrupted.json'),'utf8')).sourceDeletionPerformed,false);
    const resumed=await preserveTagTrees(f.options);assert.equal(resumed.complete,true);assert.equal(resumed.totals.uniqueFiles,2);assert.equal(resumed.totals.newVaultBytes,Buffer.byteLength('unique custom edit'));
    assert.equal(await fs.readFile(path.join(f.workspace,f.roots[0],'weapons/pistol.weapon'),'utf8'),'shared source bytes');
  }finally{await f.cleanup();}
});
test('inventory selects topmost tag trees and excludes Git/source dependency roots',()=>{
  const workspace=path.resolve('fixture'),directories=['.local/a/tags','.local/a/tags/nested/tags','.local/repo.git/refs/tags','.local/work/node_modules/tool/tags','.local/b/workspace/tags'].map(relative=>({relative}));
  assert.deepEqual(rootsFromInventory({canonicalDirectory:workspace,storage:{directories}},workspace),['.local/a/tags','.local/b/workspace/tags']);
  assert.throws(()=>rootsFromInventory({canonicalDirectory:path.resolve('another'),storage:{directories}},workspace),/another workspace/);
  for(const relative of ['weapons/pistol.weapon','world/metal.shader_environment','textures/tree.BITMAP'])assert.equal(TagNodeIO.isNativeTagPath(relative),true);
  for(const relative of ['source.rs','tool.dll','../foreign.weapon','D:/original.weapon'])assert.equal(TagNodeIO.isNativeTagPath(relative),false);
});
async function retirement(f){
  const plan=await preserveTagTrees(f.options),file=path.join(f.options.journal,'plan.json');
  const sha256=crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
  const quiet=()=>({schemaVersion:1,workspace:f.workspace,observedAt:new Date().toISOString(),observer:'Win32_Process',nativeWriters:[],syntheticFixture:true});
  const processSnapshot=path.join(f.options.journal,'synthetic-quiescence.json');await fs.writeFile(processSnapshot,JSON.stringify(quiet()));
  // Small orchestration fixtures use this boundary double. Actual Windows
  // replacement-proof handle deletion is tested by the shared native worker.
  const createSealed=async()=>({close:async()=>{},retire:async request=>{
    const tree=plan.trees.find(tree=>tree.manifestSha256===request.manifestSha256);if(!tree)throw Error('Unknown synthetic manifest');const manifest=JSON.parse(await fs.readFile(tree.manifest,'utf8')),entry=manifest.entries.find(entry=>entry.relative===request.relative);if(!entry)throw Error('Unknown synthetic native tag');
    const source=path.join(f.workspace,tree.sourceRelative,entry.relative),actual=await fs.lstat(source,{bigint:true});
    if(!actual.isFile()||String(actual.ino)!==entry.ino||String(actual.dev)!==entry.dev||crypto.createHash('sha256').update(await fs.readFile(source)).digest('hex')!==entry.sha256)return {ok:false,error:'Changed synthetic source'};
    await fs.unlink(source);return {ok:true,removed:true,bytes:entry.bytes,sha256:entry.sha256,allocationReleased:true};
  }});
  return {plan,file,quiet,args:{plan:file,reviewedPlanSha256:sha256,processSnapshot,journal:f.options.journal,capture:async()=>quiet(),createSealed}};
}
test('explicit retirement removes only preserved exact native files and restores their tree',async()=>{
  const f=await fixture();try{
    const r=await retirement(f),unrelated=path.join(f.workspace,'original.weapon');await fs.writeFile(unrelated,'owned original');
    const result=await retireTagPlan(r.args);assert.equal(result.complete,true);assert.equal(result.filesRemoved,3);assert.equal(result.bytesRemoved,r.plan.totals.inputBytes);
    assert.equal(await fs.readFile(unrelated,'utf8'),'owned original');await assert.rejects(fs.lstat(path.join(f.workspace,f.roots[0],'weapons/pistol.weapon')),/ENOENT/);
    const tree=r.plan.trees[0];assert.equal((await restoreTagTree({manifest:tree.manifest,manifestSha256:tree.manifestSha256,destination:path.join(f.workspace,'preserved/restored-native-tags/after-retirement/tags')})).files,1);
  }finally{await f.cleanup();}
});
test('unreviewed, incomplete, or non-quiescent plans cannot retire any source',async()=>{
  const f=await fixture();try{
    const r=await retirement(f);await assert.rejects(retireTagPlan({...r.args,reviewedPlanSha256:'0'.repeat(64)}),/reviewed complete-plan hash/);
    await assert.rejects(retireTagPlan({...r.args,capture:async()=>({...r.quiet(),nativeWriters:[{pid:123,name:'Synthetic writer'}]})}),/quiescent/);
    await assert.rejects(retireTagPlan({...r.args,capture:async()=>({...r.quiet(),ownedMemoryBytes:2*1024**3+1})}),/2 GiB memory/);
    await fs.writeFile(r.file,JSON.stringify({...r.plan,complete:false}));const sha=crypto.createHash('sha256').update(await fs.readFile(r.file)).digest('hex');
    await assert.rejects(retireTagPlan({...r.args,reviewedPlanSha256:sha}),/complete preservation plan/);
    assert.equal(await fs.readFile(path.join(f.workspace,f.roots[0],'weapons/pistol.weapon'),'utf8'),'shared source bytes');
  }finally{await f.cleanup();}
});
test('a replacement written after durable intent is retained instead of unlinked',async()=>{
  const f=await fixture();try{
    const r=await retirement(f);let replaced=null;
    const result=await retireTagPlan({...r.args,onBeforeUnlink:async row=>{if(replaced)return;replaced=row.source;await fs.rename(row.source,row.source+'.preserved');await fs.writeFile(row.source,'new unrelated replacement');}});
    assert.equal(result.complete,false);assert.equal(result.retained,1);assert.equal(await fs.readFile(replaced,'utf8'),'new unrelated replacement');assert.equal(await fs.readFile(replaced+'.preserved','utf8'),'shared source bytes');
  }finally{await f.cleanup();}
});
test('a source directory replaced by a junction is not traversed during retirement',async()=>{
  const f=await fixture();try{
    const r=await retirement(f),root=path.join(f.workspace,f.roots[0]),other=path.join(f.workspace,'outside-tags');await fs.mkdir(path.join(other,'weapons'),{recursive:true});await fs.writeFile(path.join(other,'weapons/pistol.weapon'),'outside original');
    await fs.rename(root,root+'-preserved');await fs.symlink(other,root,process.platform==='win32'?'junction':'dir');
    const result=await retireTagPlan(r.args);assert.equal(result.complete,false);assert.ok(result.retained>=1);assert.equal(await fs.readFile(path.join(other,'weapons/pistol.weapon'),'utf8'),'outside original');
  }finally{await f.cleanup();}
});
test('retirement interruption resumes from fsynced intents without touching unrelated paths',async()=>{
  const f=await fixture();try{
    const r=await retirement(f);let count=0;
    await assert.rejects(retireTagPlan({...r.args,onBeforeUnlink:async()=>{if(++count===2)throw Error('injected retirement interruption');}}),/injected retirement interruption/);
    const result=await retireTagPlan(r.args);assert.equal(result.complete,true);assert.ok(result.alreadyRetired>=1);assert.equal(result.filesRemoved+result.alreadyRetired,3);
    const journal=await fs.readFile(result.journal,'utf8');assert.match(journal,/unlink-intent/);assert.match(journal,/absent-after-intent/);
  }finally{await f.cleanup();}
});
test('actual Windows persistent workers retire the tiny preserved tree and restore independent files',{
  skip:process.platform!=='win32'||process.env.SPARK_TEST_SEALED_NATIVE_TAGS!=='1',
},async()=>{
  const f=await fixture();try{
    const r=await retirement(f),snapshot=await captureQuiescence(f.workspace);assert.deepEqual(snapshot.nativeWriters,[],'Close native editors before genuine worker acceptance');await fs.writeFile(r.args.processSnapshot,JSON.stringify(snapshot));
    const {createSealed,capture,...actual}=r.args;const result=await retireTagPlan(actual);assert.equal(result.complete,true);assert.equal(result.filesRemoved,3);assert.equal(result.bytesRemoved,r.plan.totals.inputBytes);
    const tree=r.plan.trees[1],destination=path.join(f.workspace,'preserved/restored-native-tags/actual-native-restore/tags');assert.equal((await restoreTagTree({manifest:tree.manifest,manifestSha256:tree.manifestSha256,destination})).files,2);assert.equal(await fs.readFile(path.join(destination,'weapons/custom.weapon'),'utf8'),'unique custom edit');
  }finally{await f.cleanup();}
});
