// Extend the existing three-process Workshop fixture with real CE source
// admission and user-facing semantic edits/publication. No mocked IPC/state.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {sealQaScratch,disposeQaScratch} from './native-qa-storage.mjs';
import {chooseTool,openDrawer,revealPagedControl} from '../tests/ui/helpers/navigation.ts';
import {configureNativeCeTarget} from './native-live-rebuild.mjs';

async function admittedFiles(actor,hash) {
 const db=new DatabaseSync(path.join(actor.data,'library.sqlite3'),{readOnly:true});let admission;
 try{admission=JSON.parse(db.prepare('SELECT value FROM settings WHERE key=?').get(`studio-native-source-${actor.id}`).value);}finally{db.close();}
 if(admission.projectId!==actor.id||!path.resolve(admission.tags).startsWith(path.resolve(actor.data,'studio-native')+path.sep))throw Error('Native admission escaped its isolated library');
 const files={};let entries=0;
 async function visit(directory){for(const entry of await fs.readdir(directory,{withFileTypes:true})){
  if(++entries>20000||entry.isSymbolicLink())throw Error('Native admission inventory bound/link violation');const file=path.join(directory,entry.name);
  if(entry.isDirectory())await visit(file);else if(entry.isFile())files[path.relative(admission.tags,file).replaceAll(path.sep,'/')]=await hash(file);else throw Error('Non-file native input');
 }}
 await visit(admission.tags);const ordered=Object.fromEntries(Object.keys(files).sort().map(name=>[name,files[name]]));
 if(crypto.createHash('sha256').update(JSON.stringify(ordered)).digest('hex')!==admission.source.inventorySha256)throw Error('Native admission inventory hash differs from its actual files');
 return {...admission,files:ordered};
}

export async function prepareSharedNativeContent({actors,source,templateTags,kit,invader,expect,hash,panel,uiBuild,save,retire,mark}) {
 const owner=actors[0],original=(await owner.call('open_project',{id:owner.id})).project;
 const scenery=source.inspection.tags.find(tag=>tag.class==='scen'&&/scenery[\\/]rocks[\\/]boulder_granite_small[\\/]boulder_granite_small$/i.test(tag.path));
 if(!scenery)throw Error('The owned CE fixture must supply the real boulder scenery template');
 const template=scenery.path.replaceAll('\\','/')+'.scenery';
 const templateHash=await hash(path.join(templateTags,template));
 const admissions=[];
 for(const actor of actors) {
  let preview=source;
  if(actor!==owner) {
   // Fixture setup: independent local saved recipes and read-only inputs, never
   // common mutable libraries or network-supplied executable/file operations.
   const project=(await actor.call('open_project',{id:actor.id})).project;
   project.quickForge=structuredClone(original.quickForge);project.title=`C48 Native Workshop ${actor.slug}`;
   const descriptor=path.join(actor.dir,'unshared-source.gsproject');
   await fs.writeFile(descriptor,JSON.stringify(project),{flag:'wx'});
   const [imported]=await actor.call('import_paths',{paths:[descriptor]});
   expect(imported.project.id).not.toBe(actor.id);actor.id=imported.project.id;actor.title=imported.project.title;
   [preview]=await actor.call('import_paths',{paths:[process.env.SPARK_TEST_CE_SOURCE_MAP]});
   await actor.page.reload();
   await actor.page.locator('.map-card').filter({has:actor.page.getByRole('heading',{name:actor.title,exact:true})}).click();
   await actor.call('claim_project_document',{id:actor.id});
   await configureNativeCeTarget({page:actor.page,kit,invader,sourceRoot:templateTags,current:async()=>(await actor.call('open_project',{id:actor.id})).project,save:async()=>{await actor.page.keyboard.press('Control+s');await expect.poll(async()=>(await actor.call('read_workspace_history',{projectId:actor.id})).history?.head.dirty).toBe(false);},hash,expect,reviewSource:false});
  }
  expect(preview.inspection.sha256).toBe(source.inspection.sha256);
  await mark('nativeAdmissionProgress',{actor:actor.slug,phase:'native-seed-build'});
  const job=await uiBuild(actor);let build;
  await expect.poll(async()=>{
   const boot=await actor.call('bootstrap'),failed=boot.logs.find(row=>row.jobId===job&&['failed','blocked'].includes(row.phase));if(failed)throw Error(failed.message);
   build=(await actor.call('open_project',{id:actor.id})).project.builds.find(row=>row.id===job);return build?.status;
  },{timeout:300000,intervals:[1000,2500]}).toBe('validated');
  await panel(actor);
  const use=async(role,name)=>{const node=actor.panel.getByRole(role,{name,exact:true,includeHidden:true});await revealPagedControl(node);return node;};
  await(await use('combobox','Native preview map')).selectOption(preview.project.id);
  const choice=preview.inspection.tags.find(tag=>tag.class==='scen'&&tag.path===scenery.path);expect(choice).toBeTruthy();
  await(await use('combobox','Native scenery template')).selectOption(String(choice.id));
  await(await use('textbox','Native template tags folder')).fill(templateTags);
  await mark('nativeAdmissionProgress',{actor:actor.slug,phase:'verify-native-source',build:job});
  await(await use('button','Verify local native source')).click();
  try{await expect(actor.panel.getByText('Local native source verified.',{exact:true})).toBeVisible({timeout:120000});}
  catch(problem){const diagnostic=(await actor.panel.locator('.notice.error').allTextContents()).join(' ').slice(0,3000);await mark('nativeAdmissionRejected',{actor:actor.slug,build:job,diagnostic});throw new Error('Native source admission failed: '+diagnostic,{cause:problem});}
  // Admission enters the same actual UI history; explicitly acknowledge Save.
  await actor.page.keyboard.press('Control+s');
  await expect.poll(async()=>(await actor.call('open_project',{id:actor.id})).project.quickForge.native?.source.cacheVersion).toBe(609);
  const document=(await actor.call('open_project',{id:actor.id})).project.quickForge;
  await save(actor,document);
  const saved=(await actor.call('open_project',{id:actor.id})).project.quickForge;
  expect(saved.native.source.cacheVersion).toBe(609);expect(saved.native.source.templateSha256).toBe(templateHash);
  const actual=await admittedFiles(actor,hash),contract=JSON.parse(await fs.readFile(path.join(actor.data,'jobs',job,'reuse-contract.json'),'utf8'));
  const expected=Object.fromEntries([...new Set([...Object.keys(contract.inputHashes),...Object.keys(contract.importedHashes??{})])].map(name=>[name,contract.compiledTags[name]]));
  Object.assign(expected,saved.native.source.dependencies,{[saved.native.source.templateTag]:saved.native.source.templateSha256});
  expect(actual.files).toEqual(expected);expect(Object.keys(actual.files).some(name=>name.startsWith('levels/quickforge/'))).toBe(false);
  actor.nativeAdmission=actual;admissions.push(saved.native.source);actor.preview=preview;actor.nativeSeedBuild=build;
  await retire(actor,build);
  await mark('nativeAdmissionProgress',{actor:actor.slug,phase:'verified-and-saved',build:job,files:Object.keys(actual.files).length});
 }
 for(const admitted of admissions)expect(admitted).toEqual(admissions[0]);
 expect(await hash(path.join(templateTags,template))).toBe(templateHash);
 await mark('independentCeNativeAdmissions',{cacheVersion:609,processes:actors.map(actor=>({pid:actor.child.pid,projectId:actor.id,library:actor.data})),source:admissions[0],helperSha256:crypto.createHash('sha256').update(await fs.readFile(new URL(import.meta.url))).digest('hex'),generatedGeometryExcluded:true,separateNativeTrees:true,readOnlySharedSeedInputs:true});
 return {template:path.join(templateTags,template),source:admissions[0]};
}

export async function exerciseSharedNativeContent({actors,admission,expect,hash,panel,view,converge,update,root,mark}) {
 const [a,b,c]=actors;
 for(const actor of actors)await panel(actor);
 const initial=await view(a),radius=initial.document.native.source.boundingRadius===.225?.25:.225;
 const file=path.join(root,'editor-b','owned-native-boulder.scenery');await fs.copyFile(admission.template,file,fs.constants.COPYFILE_EXCL);
 const assetName='Shared CE boulder';
 const use=async(actor,role,name)=>{const node=actor.panel.getByRole(role,{name,exact:true,includeHidden:true});await revealPagedControl(node);return node;};
 await(await use(a,'spinbutton','Shared pistol bounding radius')).fill(String(radius));
 const summary=b.panel.locator('.studio-native-import > summary');await revealPagedControl(summary);await summary.click();
 await(await use(b,'textbox','Native asset import path')).fill(file);await(await use(b,'textbox','Published native asset name')).fill(assetName);
 const began=performance.now();
 await Promise.all([(await use(a,'button','Share native field edit')).click(),(await use(b,'button','Validate & publish native asset')).click()]);
 await expect.poll(async()=>{const shared=await view(a);return shared.document.native.fields[0]?.boundingRadius===radius&&shared.document.native.assets.length===1;}).toBe(true);
 let current=await view(a);await converge(current);
 const asset=current.document.native.assets[0];expect(Buffer.from(asset.bytes)).toEqual(await fs.readFile(file));expect(asset.sha256).toBe(await hash(file));
 await(await use(c,'button',`Place ${assetName}`)).click();
 await expect.poll(async()=>(await view(a)).document.placements.some(placement=>placement.publishedAssetId===asset.id)).toBe(true);
 current=await view(a);await converge(current);
 expect(current.history.slice(-3).map(row=>row.author).sort()).toEqual(['host',b.author,c.author].sort());
 for(const actor of actors) {
  await expect(actor.panel.getByLabel('Committed pistol bounding radius')).toHaveText(String(radius));
  await expect(actor.panel.getByLabel('Shared native content')).toHaveAttribute('data-native-placement-state',JSON.stringify(current.document.placements.filter(p=>p.publishedAssetId).map(({id,position,rotation})=>({id,position,rotation}))));
  await actor.page.getByRole('button',{name:'Close SparkLink',exact:true}).click();
  await chooseTool(actor.page,'Level editor');
  if(await actor.page.getByLabel('Native BSP Workshop').isVisible())await actor.page.getByRole('button',{name:'Objects & gameplay',exact:true}).click();
  await expect.poll(()=>actor.page.locator('.forge-model-evidence').getAttribute('data-placement-models')).toBe('1');
  expect(Number(await actor.page.locator('.forge-model-evidence').getAttribute('data-model-triangles'))).toBeGreaterThan(0);
  await actor.page.screenshot({path:path.join(root,'native-shared-content-'+actor.slug+'.png')});
  await actor.page.getByRole('button',{name:'BSP Workshop',exact:true}).click();await panel(actor);
 }
 await c.page.getByRole('button',{name:'Close SparkLink',exact:true}).click();
 await c.page.getByRole('button',{name:'Objects & gameplay',exact:true}).click();
 await openDrawer(c.page,'Build tools');await c.page.locator('.forge-tree-select').filter({hasText:/^Shared CE boulder$/}).click();
 await openDrawer(c.page,'Inspector');await c.page.getByRole('button',{name:'Properties',exact:true}).click();
 const x=c.page.getByRole('spinbutton',{name:'Position X',exact:true});await x.fill('6');await x.evaluate(node=>node.blur());
 await expect.poll(async()=>(await view(a)).document.placements.find(placement=>placement.publishedAssetId===asset.id)?.position[0]).toBe(6);
 await c.page.getByRole('button',{name:'Close Inspector',exact:true}).click();await c.page.getByRole('button',{name:'BSP Workshop',exact:true}).click();await panel(c);
 current=await view(a);await converge(current);
 await(await use(a,'button','Undo my shared edit')).click();
 await expect.poll(async()=>(await view(a)).document.native.fields).toEqual([]);
 current=await view(a);expect(current.document.native.assets).toHaveLength(1);expect(current.document.placements).toHaveLength(1);
 await expect(b.call('forge_session_reverse',{projectId:b.id,sessionId:b.session,operationId:crypto.randomUUID(),redo:false})).rejects.toThrow(/still placed/);
 await(await use(a,'button','Redo my shared edit')).click();await expect.poll(async()=>(await view(a)).document.native.fields[0]?.boundingRadius).toBe(radius);
 current=await view(a);await converge(current);
 const committed=await update(a,current,doc=>{doc.native.fields[0].boundingRadius=.35;});
 await expect(update(c,current,doc=>{doc.native.fields[0].boundingRadius=.4;})).rejects.toThrow(/conflict/);
 await expect(update(b,committed.next,doc=>{doc.native.assets[0].bytes[0]^=1;})).rejects.toThrow(/hash|complete|asset/i);
 await expect(update(c,committed.next,doc=>{doc.runtimeId='mccSteam';doc.native.source.cacheVersion=13;})).rejects.toThrow(/admission|runtime|source/i);
 current=await view(a);await converge(current);
 const previousAdmission=a.nativeAdmission;
 const sourceFile=path.join(previousAdmission.tags,current.document.native.source.fieldTag),originalBytes=await fs.readFile(sourceFile);
 try {
  await fs.writeFile(sourceFile,originalBytes.subarray(0,64));
  await expect(a.call('studio_native_import',{projectId:a.id,path:file,name:'Reject corrupt source'})).rejects.toThrow(/source changed|corrupted/i);
  expect((await view(a)).revision).toBe(current.revision);
  const recovery=a.panel.locator('.studio-native-recovery');await revealPagedControl(recovery.locator('summary'));if(!await recovery.evaluate(node=>node.open))await recovery.locator('summary').click();
  await(await use(a,'button','Restore exact admitted source')).click();
  try{await expect(a.panel.getByText('Restored the exact admitted native source into a new full fork.',{exact:false})).toBeVisible({timeout:120000});}
  catch(problem){const diagnostic=(await a.panel.locator('.notice.error').allTextContents()).join(' ').slice(0,3000);await mark('nativeSourceRecoveryRejected',{revision:current.revision,diagnostic});throw new Error('Native source recovery failed: '+diagnostic,{cause:problem});}
  const restored=await admittedFiles(a,hash);expect(restored.source).toEqual(a.nativeAdmission.source);expect(restored.files).toEqual(a.nativeAdmission.files);expect(restored.tags).not.toBe(a.nativeAdmission.tags);
  expect(await fs.readFile(path.join(restored.tags,current.document.native.source.fieldTag))).toEqual(originalBytes);a.nativeAdmission=restored;
 } finally {await fs.writeFile(sourceFile,originalBytes);}
 // The old QA-only baseline now exactly duplicates its verified recovery fork.
 // Keep receipts; no user source or previous-good game cache is removed.
 const old=await admittedFiles({...a,data:a.data},hash);expect(old.tags).toBe(a.nativeAdmission.tags);
 const retired=await disposeQaScratch(root,await sealQaScratch(root,previousAdmission.tags),{ownerFinished:true});
 await mark('redundantQaAdmissionRetired',{logicalBytes:retired.bytes,files:retired.files,exactRecoveryVerified:true,originalBytesRestoredBeforeRetirement:true,qaOnly:true});
 for(const actor of actors){const close=actor.page.getByRole('button',{name:'Close SparkLink',exact:true});if(await close.isVisible())await close.click();}
 await mark('threeAuthorCeNativeContent',{revision:current.revision,documentSha256:crypto.createHash('sha256').update(JSON.stringify(current.document)).digest('hex'),convergenceMs:performance.now()-began,fieldTag:current.document.native.source.fieldTag,boundingRadius:.35,assetId:asset.id,assetPath:`${asset.id}.scenery`,assetBytes:asset.bytes.length,simultaneousFieldAndPublication:true,thirdAuthorPlacement:true,actualInspectorTransform:true,actualModelsInThreeViewports:true,authorUndoPreservesOtherAuthors:true,referencedAssetWithdrawalRefused:true,staleFieldConflict:true,corruptBytesRefused:true,sourceReinterpretationRefused:true,corruptSourceRefused:true,exactSourceRecoveryThroughUi:true});
 return current;
}

export async function readbackSharedNativeContent({actor,build,document,directory,invader,runNative,expect,hash}) {
 const options={windowsHide:true,timeout:30000,maxBuffer:1024*1024};
 const tag=document.native.source.fieldTag;
 const asset=document.native.assets[0],assetPath=`scenery/sparklink/${asset.id}.scenery`;
 for(const file of [tag,assetPath]) {
  const result=await runNative(path.join(invader,'invader-extract.exe'),['-s',file,'-t',directory,build.output],options);expect(result.stdout+'\n'+result.stderr).not.toMatch(/Failed to extract|ERROR:/i);
 }
 const radius=Number((await runNative(path.join(invader,'invader-edit.exe'),['-t',directory,'-G','bounding_radius',tag],options)).stdout.trim());
 expect(radius).toBeCloseTo(document.native.fields[0].boundingRadius,6);
 const model=(await runNative(path.join(invader,'invader-edit.exe'),['-t',directory,'-G','model',assetPath],options)).stdout.trim();expect(model).toMatch(/boulder/i);
 const opened=await actor.call('open_built_map',{projectId:actor.id,buildId:build.id});
 expect(opened.inspection.header.version).toBe(609);
 const nativeTag=opened.inspection.tags.find(tag=>tag.class==='scen'&&tag.path.replaceAll('\\','/')===`scenery/sparklink/${asset.id}`);expect(nativeTag).toBeTruthy();
 const placed=opened.inspection.objects.find(object=>object.tagId===nativeTag.id);
 if(!placed)throw Error('Independent cache inspection did not find the published scenery placement');
 const expected=document.placements.find(placement=>placement.publishedAssetId===asset.id).position;
 for(let axis=0;axis<3;axis++)expect(placed.position[axis]).toBeCloseTo(expected[axis],5);
 return {cacheSha256:await hash(build.output),radius,model,assetTag:assetPath,placement:placed.position,independentInvaderReadback:true};
}

export async function retireNativeSeeds({actors,root,hash,expect,mark}) {
 const records=[];
 for(const actor of actors){
  const build=actor.nativeSeedBuild;if(!build)throw Error('No reviewed native seed');
  const snapshot=path.join(actor.data,'jobs',build.id,'workspace/project.gsproject'),saved=JSON.parse(await fs.readFile(snapshot,'utf8'));
  expect(saved.quickForge.native??null).toBeNull();expect(await hash(build.output)).toBe(build.sha256);
  const sourceSha256=await hash(snapshot),retired=await disposeQaScratch(root,await sealQaScratch(root,build.output),{ownerFinished:true});
  expect(await hash(snapshot)).toBe(sourceSha256);
  records.push({actor:actor.slug,buildId:build.id,sha256:build.sha256,sourceSha256,logicalBytes:retired.bytes,qaOnly:true});
 }
 await mark('initialQaSeedMapsRetiredAfterJoinedContentReadback',records);
}
