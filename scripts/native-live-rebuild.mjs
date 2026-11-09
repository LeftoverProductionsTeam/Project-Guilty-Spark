// Real Windows UI/native IPC acceptance inside the existing owned lifecycle runner.
// No mocked native replies, synthetic gameplay, original writes or separate launcher.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createMultiplayerMap,openDrawer,openStudioMenu,revealPagedControl} from '../tests/ui/helpers/navigation.ts';
export async function nativeLiveRebuild({page,root,kit,invader,cache,call,receipt,expect,run,afterInitialCompile}) {
 const hash=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
 const runtime=path.resolve(process.env.SPARK_TEST_CHUPATHINGY_ROOT??'');
 if(!process.env.SPARK_TEST_CHUPATHINGY_ROOT)throw Error('Select the owner-installed Chupathingy package');
 const original=[cache,path.join(runtime,'chupathingy.exe'),path.join(runtime,'SDL3.dll'),path.join(runtime,'maps/ui.map'),...['bitmaps.map','sounds.map','loc.map'].map(name=>path.join(path.dirname(cache),name))];
 const originalConfig=path.join(runtime,'config.toml'),configExists=!!await fs.stat(originalConfig).catch(()=>null);if(configExists)original.push(originalConfig);
 receipt.originalConfigExisted=configExists;
 receipt.originals=await Promise.all(original.map(async file=>({file,sha256:await hash(file)})));
 const bootstrap=await call('bootstrap');await call('save_settings',{settings:{...bootstrap.settings,onboardingCompleted:true,autoBuild:false,invaderDirectory:invader,hekDirectory:kit,hekFlavor:'h1aEk',preferredHalo:'chupathingyCe'}});
 await call('register_runtime',{registration:{id:'native-rebuild-chupathingy',runtimeId:'chupathingyCe',root:runtime,executable:path.join(runtime,'chupathingy.exe'),dataRoot:runtime,version:'v0.9.0c'}});
 const [source]=await call('import_paths',{paths:[cache]});expect(source.inspection.header.version).toBe(609);
 const scenario=source.inspection.tags.find(tag=>tag.class==='scnr');
 let recovered;
 try {recovered=await call('extract_selected_tag_tree',{projectId:source.project.id,tagId:scenario.id});}
 catch(problem){
  const exchanges=path.join(root,'library','tag-exchanges');
  receipt.extractionFailure={message:String(problem),stages:[]};
  for(const name of await fs.readdir(exchanges).catch(()=>[])){
   if(!/^\.pending-[a-f0-9-]{36}$|^[a-f0-9-]{36}$/.test(name))continue;
   const metadata=[];for(const file of ['extraction-receipt.json','extraction-inputs.json']){const info=await fs.stat(path.join(exchanges,name,file)).catch(()=>null);metadata.push({file,exists:!!info,bytes:info?.size});}
   receipt.extractionFailure.stages.push({name,metadata});
  }
  console.log('LIVE_REBUILD_EXTRACTION_FAILURE',JSON.stringify(receipt.extractionFailure));throw problem;
 }
 expect(recovered.sourceSha256).toBe(receipt.originals[0].sha256);
 console.log('LIVE_REBUILD_NATIVE',JSON.stringify({phase:'source-recovered',sourceVersion:recovered.sourceVersion}));
 receipt.recovery={sourceSha256:recovered.sourceSha256,sourceVersion:recovered.sourceVersion,tagRoot:recovered.tagRoot};
 await createMultiplayerMap(page,'Native live rebuild','chupathingyCe');
 const boot=await call('bootstrap'),id=boot.entries.find(row=>row.title==='Native live rebuild').id;
 const current=async()=>(await call('open_project',{id})).project;
 const save=async()=>{await page.getByLabel('File menu',{exact:true}).click();await page.getByRole('menu',{name:'File commands',exact:true}).getByRole('menuitem',{name:'Save',exact:true}).click();await expect.poll(async()=>(await call('read_workspace_history',{projectId:id})).history?.head.dirty).toBe(false);};
 const use=async(scope,role,name)=>{const item=scope.getByRole(role,{name,exact:typeof name==='string',includeHidden:true});await revealPagedControl(item);return item;};
 await page.getByRole('button',{name:'BSP Workshop',exact:true}).click();await page.getByRole('button',{name:'Two rooms + corridor + ramp',exact:true}).click();
 const materialDetails=page.locator('.bsp-source-fields details').filter({has:page.locator('summary',{hasText:'Halo material paths & player starts'})});await materialDetails.locator(':scope > summary').click();
 const shader=source.inspection.tags.find(tag=>tag.class==='senv'&&/metal.*plate.*floor/i.test(tag.path))??source.inspection.tags.find(tag=>tag.class==='senv'&&/metal.*flat/i.test(tag.path));
 expect(shader,'Use the source-native structural metal shader, never the map landscape atlas').toBeTruthy();
 const materials=await materialDetails.getByRole('textbox',{name:/^Shader path /}).all();
 for(const field of materials){await field.fill(shader.path);await field.press('Tab');await expect(page.locator('.bsp-source-fields[aria-busy="false"]')).toBeVisible();}
 const sky=source.inspection.tags.find(tag=>tag.class.trimEnd()==='sky');if(sky){const field=materialDetails.getByRole('textbox',{name:'Halo sky tag',exact:true});await field.fill(sky.path);await field.press('Tab');}
 await expect(page.locator('.bsp-source-fields[aria-busy="false"]')).toBeVisible();await save();
 const {targets,mapTools,summary,recovery}=await configureNativeCeTarget({page,kit,invader,sourceRoot:recovered.tagRoot,current,save,hash,expect});receipt.reviewedCeRecovery=recovery;
 const firstBuildStart=performance.now();let lastPhase='';
 const lighting=page.locator('.gs-native-bsp-lighting');await lighting.locator(':scope>summary').click();
 const ambient=lighting.getByRole('spinbutton',{name:'Ambient brightness',exact:true});await ambient.fill('0.6');await ambient.press('Tab');
 await expect(page.locator('.bsp-source-fields[aria-busy="false"]')).toBeVisible();
 const bakeQuality=process.env.SPARK_QA_NATIVE_LIGHTING_QUALITY??'draft';if(!['draft','final'].includes(bakeQuality))throw Error('Choose a real native lighting bake quality');
 await lighting.getByRole('combobox',{name:'Native lighting bake quality',exact:true}).selectOption(bakeQuality);
 await lighting.getByRole('button',{name:'Bake lighting & rebuild',exact:true}).click();
 await expect.poll(async()=>{const report=await call('quickforge_build_report',{projectId:id});const logs=(await call('bootstrap')).logs.filter(row=>row.projectId===id),latest=logs.at(-1);if(latest?.phase!==lastPhase){lastPhase=latest?.phase??'';console.log('LIVE_REBUILD_PHASE',JSON.stringify({phase:lastPhase,message:latest?.message}));}const failed=logs.findLast(row=>['failed','blocked'].includes(row.phase));if(failed){receipt.firstBuildFailure=logs.filter(row=>row.phase==='compile'||['failed','blocked'].includes(row.phase)).slice(-300);console.log('LIVE_REBUILD_BUILD_FAILURE',JSON.stringify(receipt.firstBuildFailure));throw Error(failed.message);}if(report?.status==='failed')throw Error(report.warnings?.join('\n'));return report?.current&&report.status;},{timeout:900000,intervals:[1000,2500]}).toBe('validated');
 console.log('LIVE_REBUILD_NATIVE',JSON.stringify({phase:'initial-native-build-validated'}));
 const first=await call('quickforge_build_report',{projectId:id});expect(first.build.target).toBe('gbx-custom');receipt.firstBuild=first;receipt.firstBuildMs=performance.now()-firstBuildStart;
 const readOutput=async(report,label)=>{
  const directory=path.toNamespacedPath(path.join(root,'independent-native-tags',label));await fs.mkdir(directory);
  const scenario=report.sources.scenarioPath+'.scenario',output=report.build.output,originalHash=await hash(output);
  const options={windowsHide:true,timeout:30000,maxBuffer:1024*1024};
  expect((await run(path.join(invader,'invader-info.exe'),['-T','crc32_mismatched',output],options)).stdout.trim()).toBe('0');
  const extracted=await run(path.join(invader,'invader-extract.exe'),['-s',scenario,'-t',directory,output],options);
  expect(extracted.stdout+'\n'+extracted.stderr).not.toMatch(/Failed to extract|ERROR:/i);
  const count=Number((await run(path.join(invader,'invader-edit.exe'),['-t',directory,'-C','player_starting_locations',scenario],options)).stdout.trim());expect(count).toBe(4);
  const positions=[];for(let start=0;start<count;start++){const position=(await run(path.join(invader,'invader-edit.exe'),['-t',directory,'-G',`player_starting_locations[${start}].position`,scenario],options)).stdout.trim().split(',').map(Number);expect(position).toHaveLength(3);expect(position.every(Number.isFinite)).toBe(true);positions.push(position);}
  const read=async(tag,field)=>(await run(path.join(invader,'invader-edit.exe'),['-t',directory,'-G',field,tag],options)).stdout.trim();
  const normalize=value=>value.replaceAll('\\','/').toLowerCase();
  const skyTag=await read(scenario,'skies[0].sky'),bspTag=await read(scenario,'structure_bsps[0].structure_bsp');
  expect(normalize(skyTag)).toBe(`levels/guilty_spark_lighting/${id.replaceAll('-','')}/sky.sky`);
  for(const tag of [skyTag,bspTag]){const result=await run(path.join(invader,'invader-extract.exe'),['-s',tag,'-t',directory,output],options);expect(result.stdout+'\n'+result.stderr).not.toMatch(/Failed to extract|ERROR:/i);}
  const env=(await current()).quickForge.nativeLighting.environment,values={};
  const fields=[];for(const prefix of ['indoor','outdoor'])fields.push([`${prefix}_ambient_radiosity_power`,[env.ambientIntensity]],[`${prefix}_ambient_radiosity_color`,env.ambientColor],[`${prefix}_fog_maximum_density`,[1]],[`${prefix}_fog_start_distance`,[env.fogEnabled?env.fogNear:0]],[`${prefix}_fog_opaque_distance`,[env.fogEnabled?env.fogFar:0]],[`${prefix}_fog_color`,env.fogColor]);
  fields.push(['lights[0].power',[env.sunIntensity]],['lights[0].color',env.sunColor],['lights[0].direction',[env.sunAzimuth,env.sunElevation]]);
  for(const [field,wanted]of fields){const actual=(await read(skyTag,field)).split(',').map(Number);expect(actual).toHaveLength(wanted.length);for(let i=0;i<wanted.length;i++)expect(actual[i]).toBeCloseTo(wanted[i],4);values[field]=actual;}
  const maps=Number((await run(path.join(invader,'invader-edit.exe'),['-t',directory,'-C','lightmaps',bspTag],options)).stdout.trim());expect(maps).toBeGreaterThan(0);
  const materials=[];for(let lm=0;lm<maps;lm++){const count=Number((await run(path.join(invader,'invader-edit.exe'),['-t',directory,'-C',`lightmaps[${lm}].materials`,bspTag],options)).stdout.trim());for(let material=0;material<count;material++){const binding=await read(bspTag,`lightmaps[${lm}].materials[${material}].shader`);expect(normalize(binding)).toBe(normalize(shader.path+'.shader_environment'));materials.push(binding);}}
  expect(materials.length).toBeGreaterThan(0);expect(await hash(output)).toBe(originalHash);
  return {position:positions[0],positions,sha256:originalHash,crcMismatch:0,independentScenarioReadback:true,externalSkyReadback:{tag:skyTag,values},externalBspReadback:{tag:bspTag,lightmapGroups:maps,materials}};
 };
 receipt.firstReadback=await readOutput(first,'first');
 const authored=(await current()).quickForge.nativeLighting;expect(authored.environment.ambientIntensity).toBe(.6);expect(authored.skyPath).toBe(sky.path);expect(authored.quality).toBe(bakeQuality);
 receipt.nativeLighting={request:authored,actualBakeControls:true,compiledCacheSkyReadbackValidated:true,previewIsApproximate:true};
 const afterBakeHistory=await call('read_workspace_history',{projectId:id});receipt.nativeLighting.savedHistoryAfterBake=afterBakeHistory?.history?.head;
 const historyProject=afterBakeHistory?.history?.snapshots.find(snapshot=>snapshot.key===afterBakeHistory.history.head.current)?.project;const savedProject=await current();
 receipt.nativeLighting.savedSourceComparison={historyFound:!!historyProject,dirty:afterBakeHistory?.history?.head.dirty,historyRecipe:historyProject?.quickForge?.nativeLighting,savedRecipe:savedProject.quickForge.nativeLighting,differentDocumentFields:historyProject?Object.keys({...historyProject.quickForge,...savedProject.quickForge}).filter(key=>JSON.stringify(historyProject.quickForge?.[key])!==JSON.stringify(savedProject.quickForge[key])):[]};
 await expect.poll(async()=>(await call('read_workspace_history',{projectId:id})).history?.head.dirty,{message:'Baking must leave the explicitly saved source acknowledged; no new author edit occurred',timeout:15000}).toBe(false);
 expect((await call('quickforge_build_report',{projectId:id})).current).toBe(true);
 await page.screenshot({path:path.join(root,'logic-inspector.png')});
 if(afterInitialCompile){receipt.projectId=id;await afterInitialCompile({id,compiled:first});receipt.originalsUnchanged=(await Promise.all(receipt.originals.map(async row=>await hash(row.file)===row.sha256))).every(Boolean);expect(receipt.originalsUnchanged).toBe(true);return;}



 await openStudioMenu(page);await(await use(page,'combobox','Active Halo runtime')).selectOption('chupathingyCe');await openDrawer(page,'Game connection');
 const controls=page.getByRole('region',{name:'Chupathingy Live Rebuild',exact:true});
 await(await use(controls,'button','Start compiled playtest')).click();
 await expect.poll(async()=>{const session=await call('runtime_rebuild_status');if(session?.error||session?.phase==='failed')throw Error(session.error||session.detail);return session;},{timeout:180000,intervals:[1000,2000]}).toMatchObject({phase:'running',gameBuildId:first.build.id});
 console.log('LIVE_REBUILD_NATIVE',JSON.stringify({phase:'initial-game-ticks'}));
 const enginePosition=session=>{const line=session.consoleTail.split('\n').findLast(line=>line.includes('network test: tick ')&&line.includes(' player 0: '));if(!line)throw Error('Real player telemetry is unavailable');const match=line.match(/player 0: \((-?[\d.]+) (-?[\d.]+) (-?[\d.]+)\)/);if(!match)throw Error('Unsupported native player-position message');return {line,position:match.slice(1).map(Number)};};
 const verifySpawn=(telemetry,positions)=>{expect(telemetry.position.every(Number.isFinite)).toBe(true);expect(Math.min(...positions.map(point=>Math.hypot(point[0]-telemetry.position[0],point[1]-telemetry.position[1])))).toBeLessThan(.02);};
 receipt.firstSession=await call('runtime_rebuild_status');
 for(const name of ['bitmaps.map','sounds.map','loc.map'])expect(receipt.firstSession.ceResourceSha256[name]).toBe(receipt.originals.find(pin=>pin.file===path.join(path.dirname(cache),name)).sha256);
 expect(Number.isSafeInteger(receipt.firstSession.processId)&&receipt.firstSession.processId>0).toBe(true);
 const launched=(await run('pwsh.exe',['-NoProfile','-Command','(Get-Process -Id '+receipt.firstSession.processId+').Path'],{windowsHide:true,timeout:15000})).stdout.trim();
 const relativeEngine=path.relative(path.join(root,'library','runtime-playtests'),launched);expect(relativeEngine).not.toMatch(/^\.\.|^[A-Za-z]:/);expect(path.basename(path.dirname(launched))).toBe('engine');expect(await hash(launched)).toBe(receipt.originals.find(pin=>pin.file===path.join(runtime,'chupathingy.exe')).sha256);
 receipt.isolatedEngine={path:launched,sha256:await hash(launched),ceResources:receipt.firstSession.ceResourceSha256,originalConfigurationNotUsed:true};
 receipt.firstGamePosition=enginePosition(receipt.firstSession);verifySpawn(receipt.firstGamePosition,receipt.firstReadback.positions);await page.screenshot({path:path.join(root,'live-rebuild-first.png')});
 // Move a safe player-start coordinate, then native rebuild through the real control.
 await page.getByRole('button',{name:'Close Game connection',exact:true}).click();
 await page.getByRole('button',{name:'Objects & gameplay',exact:true}).click();
 for(let start=1;start<=4;start++){await openDrawer(page,'Build tools');await page.locator('.forge-tree-select').filter({hasText:new RegExp('^Player '+start+'$')}).click();await openDrawer(page,'Inspector');await page.getByRole('button',{name:'Properties',exact:true}).click();const x=page.getByRole('spinbutton',{name:'Position X',exact:true}),before=Number(await x.inputValue());await x.fill(String(before+.25));await x.press('Tab');}

 await openDrawer(page,'Game connection');const rebuildStart=performance.now();await(await use(controls,'button','Live Rebuild')).click();
 await expect.poll(async()=>{const session=await call('runtime_rebuild_status');if(session?.error)throw Error(session.error);return session?.phase==='running'&&session?.gameBuildId!==first.build.id&&session;},{timeout:900000,intervals:[1000,2500]}).toMatchObject({projectId:id});
 console.log('LIVE_REBUILD_NATIVE',JSON.stringify({phase:'rebuilt-game-ticks'}));
 receipt.rebuildAndLoadMs=performance.now()-rebuildStart;receipt.rebuiltSession=await call('runtime_rebuild_status');receipt.rebuiltReadback=await readOutput(await call('quickforge_build_report',{projectId:id}),'rebuilt');expect(receipt.rebuiltReadback.position[0]).toBeCloseTo(receipt.firstReadback.position[0]+.25,5);expect(receipt.rebuiltSession.processId).not.toBe(receipt.firstSession.processId);expect(receipt.rebuiltSession.gameSha256).not.toBe(receipt.firstSession.gameSha256);
 receipt.rebuiltGamePosition=enginePosition(receipt.rebuiltSession);verifySpawn(receipt.rebuiltGamePosition,receipt.rebuiltReadback.positions);
 for(let start=0;start<4;start++)expect(receipt.rebuiltReadback.positions[start][0]).toBeCloseTo(receipt.firstReadback.positions[start][0]+.25,5);
 expect(Math.min(...receipt.firstReadback.positions.map(point=>Math.abs(point[0]-receipt.rebuiltGamePosition.position[0])))).toBeGreaterThan(.1);
 receipt.nativeChangedSpawnObserved=true;
 const after=await current();receipt.builds=after.builds;expect(after.builds.some(build=>build.id===first.build.id&&build.sha256===first.build.sha256)).toBe(true);
 await page.screenshot({path:path.join(root,'live-rebuild-updated.png')});

 // Re-select the exact raw CE source whose Warthog actor is known invalid.
 // This must fail in the real compiler while the previous game keeps ticking.
 await page.getByRole('button',{name:'Close Game connection',exact:true}).click();
 await openDrawer(page,'Project setup');if(await mapTools.getAttribute('open')===null){const control=mapTools.locator(':scope>summary');await revealPagedControl(control);await control.click();}
 if(await targets.getAttribute('open')===null){await revealPagedControl(summary);await summary.click();}
 const rawTags=await use(targets,'textbox',/Editable Halo Tags folder/);await rawTags.fill(recovered.tagRoot);await rawTags.press('Tab');await save();
 await expect.poll(async()=>(await current()).buildTargets.find(target=>target.id===after.activeBuildTarget)?.tagsDirectory).toBe(recovered.tagRoot);
 await page.getByRole('button',{name:'Close Project setup',exact:true}).click();await openDrawer(page,'Game connection');await(await use(controls,'button','Live Rebuild')).click();
 await expect.poll(async()=>{const current=await call('runtime_rebuild_status');return current?.error||(await controls.getByRole('alert').allTextContents()).join(' ');},{timeout:900000,intervals:[1000,2500]}).not.toBe('');
 const rejected=await call('runtime_rebuild_status');expect(rejected.processId).toBe(receipt.rebuiltSession.processId);expect(rejected.gameSha256).toBe(receipt.rebuiltSession.gameSha256);expect(rejected.compiledBuildId).toBe(receipt.rebuiltSession.compiledBuildId);
 const diagnostics=(await call('bootstrap')).logs.filter(row=>row.projectId===id&&row.phase==='compile').slice(-300);
 expect(diagnostics.some(row=>row.message.includes('ActorVariant::grenade_type is out of range'))).toBe(true);
 receipt.failedBuild={rejected,previousGameUnchanged:true,nativeCompilerRejected:true,diagnostics};
 await page.getByRole('button',{name:'Close Game connection',exact:true}).click();await page.locator('.runtime-dock-heading').click();await page.keyboard.press('Control+z');await save();
 expect((await current()).buildTargets.find(target=>target.id===after.activeBuildTarget).tagsDirectory).toBe(receipt.reviewedCeRecovery.tagsDirectory);
 await openDrawer(page,'Game connection');
 await(await use(controls,'button','Stop playtest')).click();await expect.poll(()=>call('runtime_rebuild_status'),{timeout:15000}).toMatchObject({phase:'stopped',processId:null});
 receipt.stopped=await call('runtime_rebuild_status');
 for(const pin of receipt.originals)expect(await hash(pin.file)).toBe(pin.sha256);
 if(!configExists)expect(await fs.stat(originalConfig).catch(()=>null)).toBeNull();
 receipt.originalsUnchanged=true;receipt.actualControls=true;receipt.nativeGameTicksObserved=true;receipt.humanGameplayAccepted=false;receipt.projectId=id;
}

// Shared by the real Live Rebuild and MegaWorld native acceptance paths.
export async function configureNativeCeTarget({page,kit,invader,sourceRoot,current,save,hash,expect}){
 const use=async(scope,role,name)=>{const item=scope.getByRole(role,{name,exact:typeof name==='string',includeHidden:true});await revealPagedControl(item);return item;};
 await openDrawer(page,'Project setup');const panel=page.getByRole('region',{name:'Project setup panel',exact:true}),mapTools=panel.locator('.gs-map-tools'),targets=panel.locator('.gs-build-targets');
 if(await mapTools.getAttribute('open')===null){const control=mapTools.locator(':scope>summary');await revealPagedControl(control);await control.click();}
 const summary=targets.locator(':scope>summary');await revealPagedControl(summary);if(await targets.getAttribute('open')===null)await summary.click();
 await(await use(targets,'combobox','New engine target runtime')).selectOption('chupathingyCe');await(await use(targets,'button','Add runtime target')).click();
 await(await use(targets,'combobox','Authoring kit generation')).selectOption('h1aEk');
 for(const [label,value]of [[/Map Builder folder/,kit],[/Editable Halo Tags folder/,sourceRoot],[/Invader folder/,invader]]){const field=await use(targets,'textbox',label);await field.fill(value);await field.press('Tab');}
 await(await use(targets,'checkbox',/I selected a CE base tagset/)).check();await(await use(targets,'button','Use this target')).click();await save();
 const recovery=await reviewNativeCeSource({page,targets,use,current,save,hash,expect,sourceRoot:sourceRoot});
 console.log('LIVE_REBUILD_NATIVE',JSON.stringify({phase:'reviewed-stock-ce-source-corrected',tags:recovery.corrections.length}));
 await page.getByRole('button',{name:'Close Project setup',exact:true}).click();
 return {targets,mapTools,summary,recovery};
}

export async function reviewNativeCeSource({page,targets,use,current,save,hash,expect,sourceRoot}){
 // Use the existing explicit Source Guardian recovery. Raw CE extraction contains
 // three reviewed invalid stock tags; never silently repair or change originals.
 const recovery=targets.getByLabel('Stock CE source recovery',{exact:true});
 const recoverySummary=recovery.locator(':scope>summary');await revealPagedControl(recoverySummary);await recoverySummary.click();
 await(await use(recovery,'button','Review known CE corrections')).click();
 await(await use(recovery,'button','Create separate corrected CE tagset')).click();
 try {await expect(recovery.getByRole('status')).toContainText('Separate CE source ready',{timeout:120000});}
 catch(problem){
  const project=await current(),key='ce-recovery.'+project.activeBuildTarget;
  const job=await page.evaluate(({id,key})=>{const raw=localStorage.getItem('guilty-spark-map-session-v1:'+id);return raw?JSON.parse(raw)[key]:null;},{id:project.id,key});
  const status=job?await page.evaluate(({projectId,jobId})=>window.__TAURI_INTERNALS__.invoke('ce_source_recovery_status',{projectId,jobId}),{projectId:project.id,jobId:job}).catch(String):null;
  console.log('LIVE_REBUILD_RECOVERY_FAILURE',JSON.stringify({projectId:project.id,job,status,drawerVisible:await targets.isVisible(),workspace:await page.locator('[data-active-workspace]').getAttribute('data-active-workspace').catch(()=>null)}));
  throw problem;
 }
 const beforeRecovery=await current();
 await(await use(recovery,'button','Use corrected source for this CE target')).click();await expect.poll(async()=>await (await use(targets,'textbox',/Editable Halo Tags folder/)).inputValue()).not.toBe(sourceRoot);await save();
 const selected=(await current()).buildTargets.find(target=>target.id===beforeRecovery.activeBuildTarget);
 expect(selected.tagsDirectory).not.toBe(sourceRoot);
 const correctionFile=path.join(path.dirname(selected.tagsDirectory),'ce-source-recovery.json');
 const correction=JSON.parse(await fs.readFile(correctionFile,'utf8'));
 expect(correction.corrections).toHaveLength(3);expect(correction.lossless).toBe(false);
 for(const item of correction.corrections){expect(await hash(path.join(sourceRoot,item.tag))).toBe(item.beforeSha256);expect(await hash(path.join(selected.tagsDirectory,item.tag))).toBe(item.afterSha256);}
 return {tagsDirectory:selected.tagsDirectory,corrections:correction.corrections,lossless:false,sourceTagsUnchanged:true,nativeRecords:correction.nativeRecords};
}
