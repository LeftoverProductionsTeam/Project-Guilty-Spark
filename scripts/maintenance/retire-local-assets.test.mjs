import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { assetSourcePath, cacheProfileRelative, planImmutableAssets, purgeImmutableAssets, planArchiveRetirement, resumeArchiveRetirement, preservedSourcePath, planPreservedConsolidation } from './retire-local-assets.mjs';
import { inventoryLocal, sealRecovery } from './archive-local-recovery.mjs';
import {TagNodeIO} from './retire-local-tags.mjs';
const quiet=async()=>({blocking:[]});
async function fixture(t) {
  const temporary=await fs.realpath(os.tmpdir()),root=await fs.mkdtemp(path.join(temporary,'spark-assets-retire-'));
  t.after(async()=>{assert.equal(await fs.realpath(root),root);assert.equal(path.dirname(root),temporary);assert.ok(path.basename(root).startsWith('spark-assets-retire-'));await fs.rm(root,{recursive:true});});
  const source=path.join(root,'.local','trial');await fs.mkdir(source,{recursive:true});
  await fs.writeFile(path.join(source,'first.map'),'native snapshot fixture');await fs.writeFile(path.join(source,'second.map'),'native snapshot fixture');await fs.writeFile(path.join(source,'old.exe'),'MZ unique previous-good bytes');await fs.writeFile(path.join(source,'project.gsproject'),'unique authoring metadata');
  return {root,source,options:{workspace:root,journal:path.join(root,'journal'),gate:quiet}};
}
test('immutable planning preserves independent bytes once and retains every old source mapping without removal',async t=>{
  const f=await fixture(t),p=await planImmutableAssets(f.options),plan=JSON.parse(await fs.readFile(p.file,'utf8'));
  assert.equal(plan.entries.length,3);assert.equal(plan.totals.uniqueFiles,2);assert.equal(plan.sourceDeletionPerformed,false);assert.equal(plan.totals.duplicateBytes,23);
  for(const entry of plan.entries){const source=path.join(f.root,...entry.sourceRelative.split('/')),blob=path.join(f.root,...entry.blobRelative.split('/'));assert.deepEqual(await fs.readFile(source),await fs.readFile(blob));assert.equal((await fs.lstat(blob)).nlink,1);assert.notEqual((await fs.lstat(blob,{bigint:true})).ino,(await fs.lstat(source,{bigint:true})).ino);}
  assert.equal(await fs.readFile(path.join(f.source,'project.gsproject'),'utf8'),'unique authoring metadata');
});
test('repeat preservation reuses unchanged blobs and excludes separately owned plans and installed tools',async t=>{
  const f=await fixture(t);await fs.mkdir(path.join(f.root,'.local','tools'));await fs.writeFile(path.join(f.root,'.local','tools','tool.exe'),'separate installed tool');
  const excluded=path.join(f.root,'.local','other-plan');await fs.mkdir(excluded);await fs.writeFile(path.join(excluded,'owned.map'),'other owner');
  const manifest=path.join(f.root,'excluded.json');await fs.writeFile(manifest,JSON.stringify({workspace:f.root,trees:[{sourceRelative:'.local/other-plan'}]}));
  const first=await planImmutableAssets({...f.options,excludeManifests:[manifest]}),again=await planImmutableAssets({...f.options,journal:path.join(f.root,'second-journal'),excludeManifests:[manifest]});
  assert.equal(first.totals.files,3);assert.equal(again.totals.files,3);assert.equal(again.totals.newVaultBytes,0);assert.equal(again.totals.uniqueBytes,first.totals.uniqueBytes);assert.equal(await fs.readFile(path.join(excluded,'owned.map'),'utf8'),'other owner');
});
test('unsafe paths, active sources, junction traversal and preservation overbudget never authorize removal',async t=>{
  const f=await fixture(t);
  for(const p of ['target/a.map','.local/tools/a.exe','.local/trial/../outside.map','.local/trial/project.gsproject'])assert.throws(()=>assetSourcePath(f.root,p));
  await assert.rejects(planImmutableAssets({...f.options,gate:async()=>({blocking:[{pid:1}]})}),/Active/);
  await assert.rejects(planImmutableAssets({...f.options,maxVaultBytes:1}),/exceed/);assert.equal(await fs.readFile(path.join(f.source,'first.map'),'utf8'),'native snapshot fixture');
  const outside=path.join(f.root,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'original.map'),'outside source');await fs.symlink(outside,path.join(f.source,'linked'),process.platform==='win32'?'junction':'dir');
  // Clear only the owned failed-empty journal/vault lock has already closed;
  // reuse the verified first blob if it exists, never remove it here.
  const p=await planImmutableAssets({...f.options,journal:path.join(f.root,'linked-journal')});const plan=JSON.parse(await fs.readFile(p.file,'utf8'));assert.equal(plan.entries.length,3);assert.ok(plan.retained.some(row=>row.reason.includes('never traversed')));assert.equal(await fs.readFile(path.join(outside,'original.map'),'utf8'),'outside source');
});
test('reviewed Windows retirement deletes only sealed duplicates and leaves metadata and independent recovery blobs',{skip:process.platform!=='win32'},async t=>{
  const f=await fixture(t),p=await planImmutableAssets(f.options),plan=JSON.parse(await fs.readFile(p.file,'utf8'));
  await assert.rejects(purgeImmutableAssets({manifest:p.file,sha256:p.sha256,reviewedSha256:'0'.repeat(64),journal:path.join(f.root,'bad-review'),gate:quiet}),/Explicit/);
  const result=await purgeImmutableAssets({manifest:p.file,sha256:p.sha256,reviewedSha256:p.sha256,journal:path.join(f.root,'purge'),gate:quiet});assert.equal(result.complete,true);assert.equal(result.filesRemoved,3);assert.equal(result.directoriesRemoved,0);assert.equal(result.existingMetadataTouched,false);
  for(const entry of plan.entries){await assert.rejects(fs.stat(path.join(f.root,...entry.sourceRelative.split('/'))),{code:'ENOENT'});const bytes=await fs.readFile(path.join(f.root,...entry.blobRelative.split('/')));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),entry.sha256);}
  assert.equal(await fs.readFile(path.join(f.source,'project.gsproject'),'utf8'),'unique authoring metadata');
});
test('changed source, replaced source and corrupt blobs stop native retirement before any file is deleted',{skip:process.platform!=='win32'},async t=>{
  const f=await fixture(t),p=await planImmutableAssets(f.options),plan=JSON.parse(await fs.readFile(p.file,'utf8')),file=path.join(f.source,'first.map');
  await fs.writeFile(file,'changed snapshot bytes!');
  await assert.rejects(purgeImmutableAssets({manifest:p.file,sha256:p.sha256,reviewedSha256:p.sha256,journal:path.join(f.root,'changed'),gate:quiet}),/changed|replaced/i);
  for(const entry of plan.entries)assert.equal((await fs.stat(path.join(f.root,...entry.sourceRelative.split('/')))).isFile(),true);
  await fs.writeFile(file,'native snapshot fixture');await fs.unlink(file);await fs.writeFile(file,'native snapshot fixture');
  await assert.rejects(purgeImmutableAssets({manifest:p.file,sha256:p.sha256,reviewedSha256:p.sha256,journal:path.join(f.root,'replaced'),gate:quiet}),/changed|replaced/i);
  const next=await planImmutableAssets({...f.options,journal:path.join(f.root,'next')}),newPlan=JSON.parse(await fs.readFile(next.file,'utf8'));await fs.writeFile(path.join(f.root,...newPlan.entries[0].blobRelative.split('/')),'corrupt original recovery');
  await assert.rejects(purgeImmutableAssets({manifest:next.file,sha256:next.sha256,reviewedSha256:next.sha256,journal:path.join(f.root,'corrupt'),gate:quiet}),/blob changed/i);
  for(const entry of newPlan.entries)assert.equal((await fs.stat(path.join(f.root,...entry.sourceRelative.split('/')))).isFile(),true);
});
test('owned WebView caches are disposable without deleting project data, preferences, source maps or native assets',{skip:process.platform!=='win32'},async t=>{
  const f=await fixture(t),profile=path.join(f.source,'webview'),cache=path.join(profile,'EBWebView','Default','Code Cache');
  await fs.rename(path.join(f.source,'old.exe'),path.join(f.source,'GuiltySpark-fixture.exe'));await fs.mkdir(cache,{recursive:true});await fs.writeFile(path.join(cache,'generated-script'),'generated browser cache');
  await fs.writeFile(path.join(cache,'protected.map'),'source file in suspicious place');await fs.writeFile(path.join(profile,'Preferences'),'saved UI settings');
  assert.equal(cacheProfileRelative('.local/trial/webview/EBWebView/Default/Code Cache/generated-script'),'.local/trial/webview');assert.equal(cacheProfileRelative('.local/trial/library/projects/a/source.map'),null);assert.equal(cacheProfileRelative('.local/trial/webview/EBWebView/Default/Local Storage/data'),null);
  const p=await planImmutableAssets({...f.options,mode:'cache'}),plan=JSON.parse(await fs.readFile(p.file,'utf8'));
  assert.equal(plan.entries.length,1);assert.equal(plan.cacheOwners.length,1);assert.equal(plan.totals.newVaultBytes,0);await assert.rejects(fs.stat(path.join(f.root,'preserved','immutable-assets')),{code:'ENOENT'});
  const result=await purgeImmutableAssets({manifest:p.file,sha256:p.sha256,reviewedSha256:p.sha256,journal:path.join(f.root,'cache-purge'),gate:quiet});assert.equal(result.filesRemoved,1);assert.equal(result.preservedUniqueBytes,0);await assert.rejects(fs.stat(path.join(cache,'generated-script')),{code:'ENOENT'});
  for(const [file,value]of [[path.join(cache,'protected.map'),'source file in suspicious place'],[path.join(profile,'Preferences'),'saved UI settings'],[path.join(f.source,'project.gsproject'),'unique authoring metadata']])assert.equal(await fs.readFile(file,'utf8'),value);
});
test('same-handle retirement supports a genuine parent directory beyond Windows MAX_PATH',{skip:process.platform!=='win32'},async t=>{
  const f=await fixture(t);let folder=f.source;for(let n=0;n<7;n++)folder=path.join(folder,'native-asset-source-component-'+n+'x'.repeat(16));await fs.mkdir(folder,{recursive:true});const source=path.join(folder,'long.map');await fs.writeFile(source,'long native asset fixture');assert.ok(folder.length>260);
  const p=await planImmutableAssets(f.options),result=await purgeImmutableAssets({manifest:p.file,sha256:p.sha256,reviewedSha256:p.sha256,journal:path.join(f.root,'long-purge'),gate:quiet});assert.equal(result.complete,true);assert.equal(result.filesRemoved,4);await assert.rejects(fs.stat(source),{code:'ENOENT'});
});

test('read-only sources retire through their verified handle without changing other source attributes',{skip:process.platform!=='win32'},async t=>{
  const f=await fixture(t),file=path.join(f.source,'first.map'),protectedMetadata=path.join(f.source,'project.gsproject');await fs.chmod(file,0o444);await fs.chmod(protectedMetadata,0o444);
  const p=await planImmutableAssets(f.options),plan=JSON.parse(await fs.readFile(p.file,'utf8'));
  const result=await purgeImmutableAssets({manifest:p.file,sha256:p.sha256,reviewedSha256:p.sha256,journal:path.join(f.root,'readonly-purge'),gate:quiet});assert.equal(result.complete,true);assert.equal(result.filesRemoved,3);await assert.rejects(fs.stat(file),{code:'ENOENT'});assert.equal((await fs.stat(protectedMetadata)).mode&0o200,0);
  for(const entry of plan.entries)assert.equal(crypto.createHash('sha256').update(await fs.readFile(path.join(f.root,...entry.blobRelative.split('/')))).digest('hex'),entry.sha256);
});

test('existing-CAS-only planning protects unknown bytes and never creates another preservation blob',async t=>{
  const f=await fixture(t);await planImmutableAssets(f.options);await fs.writeFile(path.join(f.source,'unknown.map'),'unique not previously preserved');const p=await planImmutableAssets({...f.options,journal:path.join(f.root,'cas-only'),existingOnly:true});const plan=JSON.parse(await fs.readFile(p.file,'utf8'));
  assert.equal(plan.existingVaultOnly,true);assert.equal(plan.totals.files,3);assert.equal(plan.totals.newVaultBytes,0);assert.ok(plan.retained.some(row=>row.path.endsWith('unknown.map')&&row.reason.includes('without vault growth')));assert.equal(await fs.readFile(path.join(f.source,'unknown.map'),'utf8'),'unique not previously preserved');
});

test('native-class leftovers require the existing native vault and preserve unknown native data',async t=>{
  const f=await fixture(t);await planImmutableAssets(f.options);
  const vault=path.join(f.root,'preserved','native-tags'),bytes=Buffer.from('independent recovered native tag'),sha=crypto.createHash('sha256').update(bytes).digest('hex');await fs.mkdir(path.join(vault,'blobs',sha.slice(0,2)),{recursive:true});await fs.writeFile(path.join(vault,'ownership.json'),JSON.stringify({schemaVersion:1,kind:'spark-private-native-tags',workspace:f.root,maxVaultBytes:8*1024**3}));await fs.writeFile(path.join(vault,'blobs',sha.slice(0,2),sha),bytes);
  await fs.writeFile(path.join(f.source,'known.bitmap'),bytes);await fs.writeFile(path.join(f.source,'unknown.sound'),'never independently preserved');await fs.writeFile(path.join(f.source,'project.rs'),'unrelated source');
  await assert.rejects(planImmutableAssets({...f.options,journal:path.join(f.root,'wrong-mode'),includeNative:true}),/requires existing-CAS-only/);
  const p=await planImmutableAssets({...f.options,journal:path.join(f.root,'native-cas-only'),existingOnly:true,includeNative:true}),plan=JSON.parse(await fs.readFile(p.file,'utf8'));
  assert.equal(plan.nativeTagsExistingOnly,true);assert.equal(plan.totals.files,4);assert.equal(plan.totals.newVaultBytes,0);assert.equal(plan.entries.find(row=>row.sourceRelative.endsWith('known.bitmap')).blobRelative,`preserved/native-tags/blobs/${sha.slice(0,2)}/${sha}`);assert.ok(plan.retained.some(row=>row.path.endsWith('unknown.sound')));assert.ok(!plan.entries.some(row=>row.sourceRelative.endsWith('project.rs')));
  if(process.platform==='win32'){const result=await purgeImmutableAssets({manifest:p.file,sha256:p.sha256,reviewedSha256:p.sha256,journal:path.join(f.root,'native-cas-purge'),gate:quiet});assert.equal(result.filesRemoved,4);await assert.rejects(fs.stat(path.join(f.source,'known.bitmap')),{code:'ENOENT'});assert.equal(await fs.readFile(path.join(f.source,'unknown.sound'),'utf8'),'never independently preserved');assert.deepEqual(await fs.readFile(path.join(vault,'blobs',sha.slice(0,2),sha)),bytes);}
});

test('genuine read-back ZIP recovery retires only its exact local catalog sources and keeps external indexes',{skip:process.platform!=='win32'},async t=>{
  const f=await fixture(t),external=path.join(f.root,'recovery-indexes');await fs.mkdir(external);await fs.writeFile(path.join(external,'source-manifest.json'),'external source evidence');await fs.chmod(path.join(f.source,'project.gsproject'),0o444);
  const out=path.join(f.root,'preserved','recovery-metadata','fixture'),proof=await sealRecovery({inventory:await inventoryLocal({workspace:f.root}),outDir:out,indexManifest:{root:external,files:['source-manifest.json']}}),receipt=path.join(out,'copy-receipt.json'),receiptSha256=crypto.createHash('sha256').update(await fs.readFile(receipt)).digest('hex');
  assert.equal(proof.allObjectHashesVerified,true);const p=await planArchiveRetirement({workspace:f.root,receipt:receipt.replaceAll('\\','/'),receiptSha256,journal:path.join(f.root,'archive-plan'),gate:quiet});assert.equal(p.totals.files,4);
  const result=await purgeImmutableAssets({manifest:p.file,sha256:p.sha256,reviewedSha256:p.sha256,journal:path.join(f.root,'archive-purge'),gate:quiet});assert.equal(result.filesRemoved,4);assert.equal(result.protectedArchiveSha256,proof.archiveSha256);assert.equal(result.externalRecoveryIndexesRetired,0);assert.equal(await fs.readFile(path.join(external,'source-manifest.json'),'utf8'),'external source evidence');assert.equal(crypto.createHash('sha256').update(await fs.readFile(proof.archive)).digest('hex'),proof.archiveSha256);await assert.rejects(fs.stat(path.join(f.source,'project.gsproject')),{code:'ENOENT'});
});

test('changed original bytes or a corrupted recovery ZIP prevent any archived source retirement',{skip:process.platform!=='win32'},async t=>{
  const f=await fixture(t),out=path.join(f.root,'preserved','recovery-metadata','fixture'),proof=await sealRecovery({inventory:await inventoryLocal({workspace:f.root}),outDir:out}),receipt=path.join(out,'copy-receipt.json'),receiptSha256=crypto.createHash('sha256').update(await fs.readFile(receipt)).digest('hex'),p=await planArchiveRetirement({workspace:f.root,receipt,receiptSha256,journal:path.join(f.root,'archive-plan'),gate:quiet}),file=path.join(f.source,'first.map');
  await fs.writeFile(file,'changed original');await assert.rejects(purgeImmutableAssets({manifest:p.file,sha256:p.sha256,reviewedSha256:p.sha256,journal:path.join(f.root,'changed-archive-source'),gate:quiet}),/source changed|replaced/i);for(const name of ['first.map','second.map','old.exe','project.gsproject'])assert.equal((await fs.stat(path.join(f.source,name))).isFile(),true);
  await fs.writeFile(proof.archive,'corrupted ZIP payload');await assert.rejects(purgeImmutableAssets({manifest:p.file,sha256:p.sha256,reviewedSha256:p.sha256,journal:path.join(f.root,'corrupt-archive'),gate:quiet}),/recovery artifact changed/i);for(const name of ['first.map','second.map','old.exe','project.gsproject'])assert.equal((await fs.stat(path.join(f.source,name))).isFile(),true);
});

test('reviewed archive hardlinks track only their own unlink count and preserve an external alias',{skip:process.platform!=='win32'},async t=>{
  const f=await fixture(t),outside=path.join(f.root,'external-alias.map');for(const name of ['a-alias.map','b-alias.map','c-alias.map'])await fs.link(path.join(f.source,'first.map'),path.join(f.source,name));await fs.link(path.join(f.source,'first.map'),outside);
  const out=path.join(f.root,'preserved','recovery-metadata','linked'),proof=await sealRecovery({inventory:await inventoryLocal({workspace:f.root}),outDir:out}),receipt=path.join(out,'copy-receipt.json'),p=await planArchiveRetirement({workspace:f.root,receipt,receiptSha256:crypto.createHash('sha256').update(await fs.readFile(receipt)).digest('hex'),journal:path.join(f.root,'linked-plan'),gate:quiet});
  const result=await purgeImmutableAssets({manifest:p.file,sha256:p.sha256,reviewedSha256:p.sha256,journal:path.join(f.root,'linked-purge'),gate:quiet});assert.equal(result.filesRemoved,7);assert.equal(await fs.readFile(outside,'utf8'),'native snapshot fixture');assert.equal((await fs.stat(outside)).nlink,1);assert.equal(crypto.createHash('sha256').update(await fs.readFile(proof.archive)).digest('hex'),proof.archiveSha256);
});

test('real writes during an archive hardlink sequence are rejected even after an acknowledged unlink',{skip:process.platform!=='win32'},async t=>{
  const f=await fixture(t),outside=path.join(f.root,'external-alias.map');for(let n=0;n<64;n++)await fs.link(path.join(f.source,'first.map'),path.join(f.source,`alias-${String(n).padStart(3,'0')}.map`));await fs.link(path.join(f.source,'first.map'),outside);
  const out=path.join(f.root,'preserved','recovery-metadata','linked'),proof=await sealRecovery({inventory:await inventoryLocal({workspace:f.root}),outDir:out}),receipt=path.join(out,'copy-receipt.json'),p=await planArchiveRetirement({workspace:f.root,receipt,receiptSha256:crypto.createHash('sha256').update(await fs.readFile(receipt)).digest('hex'),journal:path.join(f.root,'linked-plan'),gate:quiet}),journal=path.join(f.root,'linked-purge');
  const running=purgeImmutableAssets({manifest:p.file,sha256:p.sha256,reviewedSha256:p.sha256,journal,gate:quiet});running.catch(()=>{});let changed=false;
  for(let n=0;n<5000&&!changed;n++){const log=await fs.readFile(path.join(journal,'immutable-events.jsonl'),'utf8').catch(()=> '');if(log.includes('deleted-archive-preserved-source')){try{await fs.writeFile(outside,'externally corrupted source');changed=true;}catch(error){if(!['EPERM','EBUSY','EACCES'].includes(error.code))throw error;}}if(!changed)await new Promise(resolve=>setTimeout(resolve,1));}
  assert.equal(changed,true);await assert.rejects(running,/changed outside acknowledged hardlink lifecycle|source changed|replaced|cannot seal exclusive source access/i);const log=(await fs.readFile(path.join(journal,'immutable-events.jsonl'),'utf8')).trim().split(/\r?\n/).map(JSON.parse);assert.ok(log.at(-1).filesRemoved>0&&log.at(-1).filesRemoved<68);assert.equal(crypto.createHash('sha256').update(await fs.readFile(proof.archive)).digest('hex'),proof.archiveSha256);
});

test('an interrupted strict hardlink pass resumes only from exact durable own-unlink proofs',{skip:process.platform!=='win32'},async t=>{
  const f=await fixture(t),outside=path.join(f.root,'external-alias.map');for(const name of ['a-alias.map','b-alias.map','c-alias.map'])await fs.link(path.join(f.source,'first.map'),path.join(f.source,name));await fs.link(path.join(f.source,'first.map'),outside);
  const out=path.join(f.root,'preserved','recovery-metadata','linked');await sealRecovery({inventory:await inventoryLocal({workspace:f.root}),outDir:out});const receipt=path.join(out,'copy-receipt.json'),p=await planArchiveRetirement({workspace:f.root,receipt,receiptSha256:crypto.createHash('sha256').update(await fs.readFile(receipt)).digest('hex'),journal:path.join(f.root,'first-plan'),gate:quiet}),plan=JSON.parse(await fs.readFile(p.file,'utf8'));plan.hardlinkLifecycle=false;await fs.writeFile(p.file,JSON.stringify(plan)+'\n');const predecessorSha=crypto.createHash('sha256').update(await fs.readFile(p.file)).digest('hex'),journal=path.join(f.root,'first-apply');
  await assert.rejects(purgeImmutableAssets({manifest:p.file,sha256:predecessorSha,reviewedSha256:predecessorSha,journal,gate:quiet}),/source changed immediately/i);
  const events=path.join(journal,'immutable-events.jsonl'),eventsSha256=crypto.createHash('sha256').update(await fs.readFile(events)).digest('hex'),next=await resumeArchiveRetirement({manifest:p.file,sha256:predecessorSha,acknowledgements:[{manifest:p.file,manifestSha256:predecessorSha,events,eventsSha256}],journal:path.join(f.root,'continued-plan'),gate:quiet});assert.equal(next.priorRetiredLocalSources,1);assert.ok(next.metadataOnlyHardlinkRebases>0);
  const result=await purgeImmutableAssets({manifest:next.file,sha256:next.sha256,reviewedSha256:next.sha256,journal:path.join(f.root,'continued-apply'),gate:quiet});assert.equal(result.filesRemoved,6);assert.equal(await fs.readFile(outside,'utf8'),'native snapshot fixture');assert.equal((await fs.stat(outside)).nlink,1);
});

async function providerFixture(t,kind='zip-member'){
  const f=await fixture(t),out=path.join(f.root,'preserved','recovery-metadata','provider'),proof=await sealRecovery({inventory:await inventoryLocal({workspace:f.root}),outDir:out}),data=await fs.readFile(path.join(f.source,'first.map')),sha=crypto.createHash('sha256').update(data).digest('hex'),source=path.join(f.root,'preserved','duplicate.map');await fs.writeFile(source,data);
  let provider,retained;
  if(kind==='zip-member'){assert.equal(proof.allObjectHashesVerified,true);retained=proof.archive;provider={kind,path:path.relative(path.join(f.root,'preserved'),retained).split(path.sep).join('/'),member:`objects/${sha.slice(0,2)}/${sha}`,bytes:data.length,containerSha256:proof.archiveSha256,containerBytes:proof.archiveBytes};}
  else{retained=path.join(f.root,'preserved','retained.payload');await fs.writeFile(retained,kind==='range'?Buffer.concat([Buffer.from('header'),data,Buffer.from('tail')]):data);const parent=await TagNodeIO.fingerprint(retained);provider={kind,path:'retained.payload',bytes:data.length,...(kind==='range'?{offset:6,containerSha256:parent.sha256,containerBytes:parent.bytes}:{})};}
  for(const name of ['first.map','second.map','old.exe','project.gsproject'])await fs.unlink(path.join(f.source,name));await fs.rmdir(f.source);await fs.rmdir(path.join(f.root,'.local'));
  const index=path.join(f.root,'provider-index.json'),receipt=path.join(f.root,'provider-readback.json'),locator={schemaVersion:1,kind:'spark-preservation-index',root:path.join(f.root,'preserved'),objects:{[sha]:provider},files:{},legacyVaults:{}};await fs.writeFile(index,JSON.stringify(locator)+'\n');const indexSha256=crypto.createHash('sha256').update(await fs.readFile(index)).digest('hex'),container=await TagNodeIO.fingerprint(retained);
  const verification={schemaVersion:1,kind:'spark-provider-verification',indexPath:index,indexSha256,complete:true,fullReadback:true,objects:[{sha256:sha,sourceSha256:sha,bytes:data.length,provider,providerRef:{table:'objects',key:sha},fullReadback:true,crcVerified:kind==='zip-member'}],containers:[{path:provider.path,...container}]};await fs.writeFile(receipt,JSON.stringify(verification)+'\n');const receiptSha256=crypto.createHash('sha256').update(await fs.readFile(receipt)).digest('hex');
  return {...f,source,retained,data,sha,index,receipt,provider,options:{workspace:f.root,index,indexSha256,receipt,receiptSha256,sources:['preserved/duplicate.map'],journal:path.join(f.root,'consolidation-plan'),gate:quiet}};
}

test('preserved consolidation uses verified native ZIP, raw and exact-range providers without recreating .local',{skip:process.platform!=='win32'},async t=>{
  for(const kind of ['zip-member','raw','range']){const f=await providerFixture(t,kind);await fs.chmod(f.source,0o444);const p=await planPreservedConsolidation(f.options),plan=JSON.parse(await fs.readFile(p.file,'utf8'));assert.equal(plan.scopeMode,'preserved-consolidation');assert.equal(plan.totals.files,1);
    const result=await purgeImmutableAssets({manifest:p.file,sha256:p.sha256,reviewedSha256:p.sha256,journal:path.join(f.root,'consolidation-apply'),gate:quiet});assert.equal(result.filesRemoved,1);assert.equal(result.retainedProviderContainers,1);assert.equal(result.providerIndexSha256,f.options.indexSha256);assert.match(result.allocatedBytesMethod,/FileStandardInfo/);await assert.rejects(fs.stat(f.source),{code:'ENOENT'});assert.equal((await fs.stat(f.retained)).isFile(),true);await assert.rejects(fs.stat(path.join(f.root,'.local')),{code:'ENOENT'});assert.equal(crypto.createHash('sha256').update(await fs.readFile(f.index)).digest('hex'),f.options.indexSha256);}
});

test('preserved planning rejects foreign roots, provider sources, aliases and incomplete readback',{skip:process.platform!=='win32'},async t=>{
  const f=await providerFixture(t,'raw');for(const name of ['.local/test.map','preserved/../outside.map','outside.map'])assert.throws(()=>preservedSourcePath(f.root,name));
  await assert.rejects(planPreservedConsolidation({...f.options,sources:['preserved/retained.payload']}),/provider/);await assert.rejects(planPreservedConsolidation({...f.options,journal:path.join(f.root,'preserved','bad-evidence')}),/outside preserved/);
  await fs.unlink(f.source);await fs.link(f.retained,f.source);await assert.rejects(planPreservedConsolidation(f.options),/independent/);await fs.unlink(f.source);await fs.writeFile(f.source,f.data);
  const receipt=JSON.parse(await fs.readFile(f.receipt,'utf8'));receipt.fullReadback=false;await fs.writeFile(f.receipt,JSON.stringify(receipt));await assert.rejects(planPreservedConsolidation({...f.options,receiptSha256:crypto.createHash('sha256').update(await fs.readFile(f.receipt)).digest('hex')}),/incomplete/);assert.equal((await fs.stat(f.source)).isFile(),true);
});

test('changed provider index, receipt, container or source prevents preserved retirement',{skip:process.platform!=='win32'},async t=>{
  for(const target of ['index','receipt','retained','source']){const f=await providerFixture(t),p=await planPreservedConsolidation(f.options);await fs.appendFile(f[target],'changed');await assert.rejects(purgeImmutableAssets({manifest:p.file,sha256:p.sha256,reviewedSha256:p.sha256,journal:path.join(f.root,'changed-provider'),gate:quiet}),/changed|replaced|projection/);assert.equal((await fs.stat(f.source)).isFile(),true);}
});

test('preserved scope cannot be smuggled into an obsolete-local plan',{skip:process.platform!=='win32'},async t=>{
  const f=await providerFixture(t),p=await planPreservedConsolidation(f.options),plan=JSON.parse(await fs.readFile(p.file,'utf8'));delete plan.scopeMode;await fs.writeFile(p.file,JSON.stringify(plan));const sha256=crypto.createHash('sha256').update(await fs.readFile(p.file)).digest('hex');await assert.rejects(purgeImmutableAssets({manifest:p.file,sha256,reviewedSha256:sha256,journal:path.join(f.root,'bad-scope'),gate:quiet}),/explicit operation and scope/);assert.equal((await fs.stat(f.source)).isFile(),true);
});
