// Shared real UI authoring steps from the accepted C63 workflow. The existing
// CLI and owned lifecycle runner use the same implementation.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {PerspectiveCamera,Vector3} from 'three';
import {openDrawer,chooseTool} from '../tests/ui/helpers/navigation.ts';
export async function nativeLogicRoundTrip({page,root,kit,tags,invader,cache,call,receipt,expect,resume=false,run,verifyEditedAsset=false,reviewControl}){
 const hash=async p=>crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');
 const boot=await call('bootstrap');await call('save_settings',{settings:{...boot.settings,onboardingCompleted:true,autoBuild:false,preferredHalo:'mccSteam',hekDirectory:kit,hekTagsDirectory:tags,invaderDirectory:invader,hekFlavor:'h1aEk'}});
 let [source]=resume?[null]:await call('import_paths',{paths:[cache]});
 const created=resume?await call('open_project',{id:receipt.projectId}):await call('create_quickforge_project',{title:'C63 native Logic benchmark',template:'customBlank',target:'mccSteam'});receipt.projectId=created.project.id;
 const closeDrawers=async()=>{for(const label of ['Inspector','Build tools','Asset library']){const panel=page.getByRole('region',{name:`${label} panel`,exact:true});if(await panel.isVisible())await panel.getByRole('button',{name:`Close ${label}`,exact:true}).click();}};
 const open=async()=>{await page.reload();await page.locator('.map-card').filter({has:page.locator('h3',{hasText:created.project.title})}).click();await closeDrawers();};
 const state=async()=>(await call('open_project',{id:created.project.id})).project.quickForge;
 const save=async()=>{
   await page.keyboard.press('Control+s');
   // Undo and Save can be requested in the same frame. Let their real UI
   // callbacks run before checking acknowledgment; another map's Saved label
   // or the previous toast does not prove this document's new save completed.
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await expect(page.locator('.runtime-dock').getByText('Saved',{exact:true})).toBeVisible();
   await expect.poll(async()=>(await call('read_workspace_history',{projectId:created.project.id})).history?.head.dirty).toBe(false);
 };
 const field=async(label,value)=>{const scale=label.startsWith('Scale ');const input=scale?page.getByRole('group',{name:'Scale',exact:true}).getByRole('spinbutton',{name:label.slice(6),exact:true}):page.getByRole('spinbutton',{name:label,exact:true});await input.fill(String(value));await input.press('Tab');if(scale)await expect(page.locator('.bsp-source-fields[aria-busy="false"]')).toBeVisible();};
 const dragTo=async(button,point)=>{
   await button.scrollIntoViewIfNeeded();await expect(button).toBeInViewport();
   const canvas=page.locator('.forge-viewport canvas');await expect(canvas).toHaveAttribute('data-gs-camera-pose',/position/);
   const rect=await canvas.boundingBox(),pose=JSON.parse(await canvas.getAttribute('data-gs-camera-pose'));
   const camera=new PerspectiveCamera(55,rect.width/rect.height,0.03,20000);camera.position.fromArray(pose.position);camera.quaternion.fromArray(pose.quaternion);camera.zoom=pose.zoom;camera.updateMatrixWorld(true);camera.updateProjectionMatrix();
   const projected=new Vector3(...point).project(camera),drop={x:rect.x+(projected.x+1)*rect.width/2,y:rect.y+(1-projected.y)*rect.height/2};
   const from=await button.boundingBox();await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(drop.x,drop.y,{steps:12});await page.mouse.up();return{from,drop,pose};
 };
 if(!resume){
 expect(source.inspection.header.version).toBe(13);
 expect(source.inspection.tags.some(t=>t.class==='mach'&&t.path.replaceAll('\\','/').endsWith('door small/door small'))).toBe(true);
 await open();await page.getByRole('button',{name:'BSP Workshop',exact:true}).click();await page.getByRole('button',{name:'Two rooms + corridor + ramp',exact:true}).click();
 await page.locator('.bsp-source-list button').filter({hasText:'Corridor'}).click();await field('Scale Y',0.3375);await field('Scale Z',0.35);
 const details=page.locator('.bsp-source-fields details').filter({has:page.locator('summary',{hasText:'Halo material paths & player starts'})});await details.locator('summary').click();
 const shader=page.getByRole('textbox',{name:'Shader path surface',exact:true});await shader.fill('levels/test/tutorial/shaders/example_tutorial_metal_floor');await shader.press('Tab');
 const sky=details.getByRole('textbox').last();await sky.fill('levels/test/bloodgulch/bloodgulch');await sky.press('Tab');
 await page.getByRole('combobox',{name:'Workshop texture source',exact:true}).selectOption(source.project.id);
 await expect.poll(async()=>Number(await page.getByLabel('Native BSP Workshop').getAttribute('data-textures')),{timeout:60000}).toBeGreaterThan(0);
 receipt.authoredMaterialTextures=Number(await page.getByLabel('Native BSP Workshop').getAttribute('data-textures'));
 await expect(page.locator('.bsp-source-fields[aria-busy="false"]')).toBeVisible();await save();
 await page.getByRole('button',{name:'Objects & gameplay',exact:true}).click();await openDrawer(page,'Build tools');
 for(let i=0;i<4;i++){await openDrawer(page,'Build tools');await page.locator('.forge-tree-select').filter({hasText:new RegExp(`^Player ${i+1}$`)}).click();await openDrawer(page,'Inspector');await page.getByRole('button',{name:'Properties',exact:true}).click();await field('Position X',4+i);await field('Position Y',0);}
 await save();
 if(typeof reviewControl==='function'){
   // Equivalent source geometry, starts, SDK, compiler and launcher. A
   // compiler-valid control never asserts game loading or human gameplay.
   await closeDrawers();await page.getByRole('button',{name:'Build & check playtest',exact:true}).click();
   await expect.poll(async()=>{const result=await call('quickforge_build_report',{projectId:created.project.id});return result?.current&&result?.status;},{timeout:900000,intervals:[1000,2500]}).toBe('validated');
   receipt.controlBuild=await call('quickforge_build_report',{projectId:created.project.id});
   receipt.controlSource=await state();receipt.controlTrial=await reviewControl(created.project.id);
 }
 await expect(page.getByLabel('Active Halo runtime',{exact:true})).toHaveCount(1);await expect(page.locator('.runtime-dock select')).toHaveCount(0);
 await chooseTool(page,'Map library');await page.locator('.map-card').filter({has:page.locator('h3',{hasText:source.project.title})}).click();
 if(verifyEditedAsset){
   if(typeof run!=='function')throw Error('Edited-asset acceptance requires the owning tracked tool runner');
   const door=source.inspection.tags.find(t=>t.class==='mach'&&t.path.replaceAll('\\','/').endsWith('door small/door small'));
   await chooseTool(page,'Tag editor');await page.getByRole('textbox',{name:'Search tags',exact:true}).fill(door.path);await page.getByRole('combobox',{name:'Filter tag class',exact:true}).selectOption('mach');await page.locator('.tag-row').click();
   const radius=page.getByRole('spinbutton',{name:'Bounding radius',exact:true}),prior=await radius.inputValue();
   await radius.fill('0.75');await radius.press('Tab');await save();
   await page.keyboard.press('Control+z');await save();await expect(radius).toHaveValue(prior);
   await page.keyboard.press('Control+y');await save();await expect(radius).toHaveValue('0.75');
   expect((await call('open_project',{id:source.project.id})).project.tagEdits.find(e=>e.tagId===door.id&&e.fieldKey==='bounding-radius')?.value).toBe(.75);
   receipt.sourcePropertyEdit={tagId:door.id,original:Number(prior),requested:.75,undoRedoSave:true};
 }
 await chooseTool(page,'Map library');await page.locator(`.map-card[data-project-id="${created.project.id}"]`).click();await chooseTool(page,'Level editor');
 await openDrawer(page,'Asset library');const assets=page.getByRole('region',{name:'Asset library panel',exact:true});
 await assets.getByRole('combobox',{name:'Asset library map',exact:true}).selectOption(source.project.id);
 await assets.getByRole('combobox',{name:'Asset library type',exact:true}).selectOption('doors');
 const paletteDoor=assets.getByRole('button',{name:'Add door small at view',exact:true});
 // The example's origin is inside the ramp. Use a genuine pointer drag to an
 // observed clear floor point instead of treating a refused origin click as a placement.
 receipt.nativeAssetPointerDrop=await dragTo(paletteDoor,[6,2,0.05]);
 if(verifyEditedAsset){
   await expect(page.getByText(/This source has tag changes that are not in its native map yet/)).toBeVisible();
   expect((await state()).placements).toHaveLength(0);
   expect(((await call('open_project',{id:created.project.id})).project.nativeAssetImports??[])).toHaveLength(0);
   const imports=await fs.readdir(path.join(root,'library/asset-imports')).catch(error=>{if(error.code==='ENOENT')return[];throw error;});expect(imports).toEqual([]);
   receipt.draftImportRefusedWithoutPlacement=true;
   await chooseTool(page,'Map library');await page.locator(`.map-card[data-project-id="${source.project.id}"]`).click();await chooseTool(page,'Tag editor');
   await page.getByRole('tab',{name:'Properties',exact:true}).click();
   const smart=page.locator('.smart-edit:visible').first();if(!await smart.evaluate(element=>element.open))await smart.locator('summary').first().click();
   await smart.getByRole('button',{name:'Review save plan',exact:true}).click();await expect(smart.locator('.smart-edit-plan>strong')).toHaveText('Direct map copy');
   await smart.getByRole('button',{name:'Save validated map copy',exact:true}).click();await expect(smart.locator('.smart-edit-result>strong')).toHaveText('Validated copy ready');
   const beforeIds=new Set((await call('bootstrap')).entries.map(p=>p.id));
   await smart.getByRole('button',{name:/Open edited copy in a new tab|Add edited copy to map library/}).click();
   let copy;await expect.poll(async()=>{copy=(await call('bootstrap')).entries.find(p=>!beforeIds.has(p.id));return!!copy;}).toBe(true);
   source=await call('open_project',{id:copy.id});expect(source.project.tagEdits).toEqual([]);
   const copiedDoor=source.inspection.tags.find(t=>t.class==='mach'&&t.path.replaceAll('\\','/').endsWith('door small/door small'));
   expect(copiedDoor.fields.find(f=>f.key==='bounding-radius').value).toBeCloseTo(.75,6);
   receipt.sourcePropertyNativeCopy={sha256:source.project.source.sha256,originalUnchanged:await hash(cache)===receipt.sourceCacheSha256};
   await chooseTool(page,'Map library');await page.locator(`.map-card[data-project-id="${source.project.id}"]`).click();await chooseTool(page,'Level editor');
   await chooseTool(page,'Map library');await page.locator(`.map-card[data-project-id="${created.project.id}"]`).click();await chooseTool(page,'Level editor');
   await openDrawer(page,'Asset library');await assets.getByRole('combobox',{name:'Asset library map',exact:true}).selectOption(source.project.id);await assets.getByRole('combobox',{name:'Asset library type',exact:true}).selectOption('doors');
   receipt.validatedNativeAssetPointerDrop=await dragTo(paletteDoor,[6,2,0.05]);
 }
 await expect.poll(async()=>(await state()).placements.length,{timeout:180000}).toBe(1);await save();await expect(page.getByRole('textbox',{name:'Selected object name',exact:true})).toHaveValue('door small');
 if(verifyEditedAsset){
   const current=(await call('open_project',{id:created.project.id})).project,binding=current.nativeAssetImports.find(b=>b.sourceProjectId===source.project.id&&b.tagClass==='mach');
   expect(binding).toBeTruthy();const nativeTags=path.join(root,'library/asset-imports',created.project.id,binding.id,'tags');
   const readableTags=process.platform==='win32'?path.toNamespacedPath(nativeTags):nativeTags;
   const value=Number((await run(path.join(invader,'invader-edit.exe'),['-t',readableTags,'-G','bounding_radius',binding.nativePath+'.device_machine'],{windowsHide:true,timeout:30000})).stdout.trim());
   receipt.importedPropertyReadback={value,expected:.75,sourceSha256:source.project.source.sha256,receiptSha256:binding.receiptSha256};
   expect(value,'Dragging the edited asset must not silently use the original property').toBeCloseTo(.75,6);
 }
 await page.getByRole('button',{name:'Properties',exact:true}).click();
 for(const [axis,value] of [['X',14],['Y',0],['Z',0]])await field(`Position ${axis}`,value);
 await field('Rotation Z',0);
 await page.getByRole('textbox',{name:'Selected object name',exact:true}).fill('Corridor door');await page.getByRole('textbox',{name:'Selected object name',exact:true}).press('Tab');
 await expect(page.locator('.forge-viewport canvas')).toBeVisible();await save();
 let d=await state();expect(d.placements).toHaveLength(1);expect(d.placements[0].tagClass).toBe('mach');receipt.placedDoor=d.placements[0];
 await openDrawer(page,'Asset library');receipt.triggerPointerDrop=await dragTo(assets.getByRole('button',{name:'Trigger volume',exact:true}),[11,0,0.05]);
 await expect(page.getByRole('spinbutton',{name:'Trigger width',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Cover both sides',exact:true}).click();
 await page.getByRole('button',{name:'Enter → Open',exact:true}).click();await save();
 d=await state();expect(d.logic.rules).toHaveLength(1);expect(d.logic.triggers).toHaveLength(1);expect(d.logic.devices[0].placementId).toBe(d.placements[0].id);
 const volumeId=d.logic.triggers[0].id;expect(d.logic.triggers[0].position).toEqual([14,0,1.5]);expect(d.logic.triggers[0].dimensions).toEqual([6,3,3]);expect(d.logic.rules[0].once).toBe(false);
 await page.keyboard.press('Control+z');await save();expect((await state()).logic.rules).toHaveLength(0);
 await page.keyboard.press('Control+y');await save();expect((await state()).logic.rules).toHaveLength(1);receipt.oneActionConnectionUndoRedo=true;
 const sourceDetails=page.locator('.forge-logic-content details').filter({has:page.locator('summary',{hasText:'Native HaloScript'})});await sourceDetails.locator('summary').click();
 const hsc=page.getByRole('textbox',{name:'Native logic HaloScript',exact:true});await expect(hsc).toHaveValue(/volume_test_objects/);receipt.generatedHsc=await hsc.inputValue();
 await page.screenshot({path:path.join(root,'logic-inspector.png')});await save();const saved=d=await state();
 await open();const objects=page.getByRole('button',{name:'Objects & gameplay',exact:true});if(!(await objects.getAttribute('class'))?.includes('selected'))await objects.click();await openDrawer(page,'Build tools');await page.locator('.forge-tree-select').filter({hasText:'Trigger 1'}).click();await openDrawer(page,'Inspector');await page.getByRole('button',{name:'Properties',exact:true}).click();
 expect((await state()).logic).toEqual(saved.logic);receipt.saveReopenPreservesLogic=true;
 await field('Trigger width',8);await save();expect((await state()).logic.triggers.find(t=>t.id===volumeId).dimensions[0]).toBe(8);
 await page.keyboard.press('Control+z');await save();expect((await state()).logic.triggers.find(t=>t.id===volumeId).dimensions[0]).toBe(6);receipt.triggerTransformUndo=true;
 }else{await open();const d=await state();expect(d.placements).toEqual([receipt.placedDoor]);expect(d.logic.rules).toHaveLength(1);expect(d.logic.triggers).toHaveLength(1);expect(d.logic.devices[0].placementId).toBe(receipt.placedDoor.id);}
 // Build is in the shared bottom strip; an unpinned right drawer can cover it.
 for(const label of ['Inspector','Build tools']) {const panel=page.getByRole('region',{name:`${label} panel`,exact:true});if(await panel.isVisible())await panel.getByRole('button',{name:`Close ${label}`,exact:true}).click();}
 const authored=await state();receipt.nativeMaterialPaths=authored.materials.map(m=>({id:m.id,shaderPath:m.shaderPath}));receipt.nativeSkyPath=authored.skyPath;
 await page.getByRole('button',{name:'Build & check playtest',exact:true}).click();
 const began=performance.now(),phases=[];let lastPhase='';
 await expect.poll(async()=>{const b=await call('bootstrap'),log=b.logs.findLast(l=>l.projectId===created.project.id);if(log?.phase!==lastPhase){lastPhase=log?.phase??'';phases.push({phase:lastPhase,elapsedMs:performance.now()-began,message:log?.message});console.log('NATIVE_PHASE',JSON.stringify(phases.at(-1)));}const failed=b.logs.find(l=>l.projectId===created.project.id&&l.phase==='failed');if(failed)throw Error(failed.message);const result=await call('quickforge_build_report',{projectId:created.project.id});return result?.current&&result?.status;},{timeout:900000,intervals:[1000,2500]}).toBe('validated');
 receipt.nativeBuildMs=performance.now()-began;receipt.nativePhases=phases;
 receipt.nativeBuild=await call('quickforge_build_report',{projectId:created.project.id});
 // Follow the real Open built map workflow so its verified matching editable
 // tagset stays bound; importing only the cache path cannot reconstruct MCC resources.
 const built=await call('open_built_map',{projectId:created.project.id,buildId:receipt.nativeBuild.build.id});expect(built.inspection.scripts).toHaveLength(2);expect(built.inspection.tags.some(t=>t.class==='mach')).toBe(true);
 receipt.nativeOutputSha256=await hash(receipt.nativeBuild.build.output);receipt.nativeScriptNames=built.inspection.scripts.map(s=>s.name);
 if(verifyEditedAsset){
   const target=(await call('open_project',{id:created.project.id})).project,binding=target.nativeAssetImports.find(b=>b.sourceProjectId===source.project.id&&b.tagClass==='mach');
   const directory=path.toNamespacedPath(path.join(root,'independent-native-tags')),tool=name=>path.join(invader,name+'.exe'),output=receipt.nativeBuild.build.output;
   const scenario=built.inspection.tags.find(t=>t.class==='scnr').path+'.scenario',machine=binding.nativePath+'.device_machine';
   expect((await run(tool('invader-info'),['-T','crc32_mismatched',output],{windowsHide:true,timeout:30000})).stdout.trim()).toBe('0');
   for(const tag of [scenario,machine])await run(tool('invader-extract'),['-s',tag,'-t',directory,output],{windowsHide:true,timeout:30000});
   const read=async(tag,field)=> (await run(tool('invader-edit'),['-t',directory,'-G',field,tag],{windowsHide:true,timeout:30000})).stdout.trim();
   const radius=Number(await read(machine,'bounding_radius'));expect(radius).toBeCloseTo(.75,6);
   const triggerDimensions=(await read(scenario,'trigger_volumes[0].ending_corner_offset')).split(',').map(Number);expect(triggerDimensions).toEqual([6,3,3]);
   const automatic=await read(scenario,'machines[0].machine_flags.does_not_operate_automatically');expect(automatic).toBe('1');
   const names=await Promise.all([0,1].map(index=>read(scenario,`scripts[${index}].name`)));expect(names).toEqual(expect.arrayContaining(receipt.nativeScriptNames));
   receipt.independentNativeReadback={boundingRadius:radius,triggerDimensions,scriptNames:names,deviceManualControl:true,crcMismatch:0,standardMachineTag:true,standardScenarioTag:true};
 }
 receipt.originalCacheUnchanged=(await hash(cache))===receipt.sourceCacheSha256;expect(receipt.originalCacheUnchanged).toBe(true);
}

// Genuine imported-cache World authoring, separate from QuickForge's source
// writer and from game loading. All inputs/outputs belong to the caller's job.
export async function nativeWorldMachineRoundTrip({page,root,cache,compiled,donorProjectId,call,receipt,expect,run,invader}){
 const hash=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
 const original=await hash(compiled),donor=donorProjectId?await call('open_project',{id:donorProjectId}):(await call('import_paths',{paths:[cache]}))[0],[target]=await call('import_paths',{paths:[compiled]});
 expect(donor.project.tagEdits).toEqual([]);expect(donor.project.source.sha256).toBe(donor.inspection.sha256);
 expect(donor.project.id).not.toBe(target.project.id);const id=target.project.id,base=target.project.scene.length;
 Object.assign(receipt,{stage:'native inputs imported',projectId:id,donorProjectId:donor.project.id});
 // Setup imports are native calls; reload bootstrap before exercising visible controls.
 await page.reload();
 const project=async()=>{
  // World edits are owned by the current durable Undo head until explicit Save;
  // open_project deliberately reads the independently saved descriptor.
  const view=(await call('read_workspace_history',{projectId:id})).history;
  return view?.snapshots.find(snapshot=>snapshot.key===view.head.current)?.project??(await call('open_project',{id})).project;
 };
 const save=async()=>{await page.keyboard.press('Control+s');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await expect.poll(async()=>(await call('read_workspace_history',{projectId:id})).history.head.dirty).toBe(false);};
 // The asset catalog intentionally includes open maps; open the donor through the UI first.
 await chooseTool(page,'Map library');await page.locator(`.map-card[data-project-id="${donor.project.id}"]`).click();await expect(page.locator('.busy-indicator')).toBeHidden({timeout:90000});await chooseTool(page,'Level editor');
 await chooseTool(page,'Map library');await page.locator(`.map-card[data-project-id="${id}"]`).click();await expect(page.locator('.busy-indicator')).toBeHidden({timeout:90000});await chooseTool(page,'Level editor');
 receipt.stage='donor and target opened in the editor';
 await page.getByRole('combobox',{name:'View from player start',exact:true}).selectOption('');
 await openDrawer(page,'Asset library');const assets=page.getByRole('region',{name:'Asset library panel',exact:true});
 await assets.getByRole('combobox',{name:'Asset library map',exact:true}).selectOption(donor.project.id);await assets.getByRole('combobox',{name:'Asset library type',exact:true}).selectOption('doors');
 const button=assets.getByRole('button',{name:/^Add .*door.* at view$/i}).first();await expect(button).toBeVisible();await button.scrollIntoViewIfNeeded();
 const canvas=page.locator('.world-layout:visible .viewport canvas:visible');await expect(canvas).toHaveAttribute('data-gs-camera-pose',/position/);
 const rect=await canvas.boundingBox(),pose=JSON.parse(await canvas.getAttribute('data-gs-camera-pose'));const camera=new PerspectiveCamera(55,rect.width/rect.height,.03,20000);camera.position.fromArray(pose.position);camera.quaternion.fromArray(pose.quaternion);camera.zoom=pose.zoom;camera.updateMatrixWorld(true);camera.updateProjectionMatrix();
 const point=new Vector3(6,2,.05).project(camera),to={x:rect.x+(point.x+1)*rect.width/2,y:rect.y+(1-point.y)*rect.height/2},from=await button.boundingBox();
 expect(point.z).toBeGreaterThan(-1);expect(point.z).toBeLessThan(1);expect(to.x).toBeGreaterThan(rect.x);expect(to.x).toBeLessThan(rect.x+rect.width);expect(to.y).toBeGreaterThan(rect.y);expect(to.y).toBeLessThan(rect.y+rect.height);receipt.pointerDrop={from,to,pose};
 await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});await page.mouse.up();
 await expect.poll(async()=>(await project()).scene.length,{timeout:180000}).toBe(base+1);receipt.stage='native door pointer drop';
 await openDrawer(page,'Inspector');const inspector=page.getByRole('region',{name:'Inspector panel',exact:true});
 for(let index=0;index<3;index++){const field=inspector.getByRole('spinbutton',{name:`position ${index}`,exact:true});await field.fill(String([8,2,.05][index]));await field.press('Tab');}
 for(let index=0;index<3;index++){const field=inspector.getByRole('spinbutton',{name:`rotation ${index}`,exact:true});await field.fill(String([35,10,-5][index]));await field.press('Tab');}
 await inspector.getByText('Transform',{exact:true}).click();await save();await page.keyboard.press('Control+c');await page.keyboard.press('Control+v');
 await expect.poll(async()=>(await project()).scene.length).toBe(base+2);await save();
 await page.keyboard.press('Control+z');await save();expect((await project()).scene).toHaveLength(base+1);
 await page.keyboard.press('Control+y');await save();expect((await project()).scene).toHaveLength(base+2);
 receipt.stage='copied placement Undo/Redo and Save';
 const authored=await project(),placements=authored.scene.filter(object=>object.sourceModel);expect(placements).toHaveLength(2);expect(new Set(placements.map(object=>object.id)).size).toBe(2);expect(authored.nativeAssetImports).toHaveLength(1);
 await chooseTool(page,'Map library');await page.locator(`.map-card[data-project-id="${id}"]`).click();await chooseTool(page,'Build & playtest');
 receipt.stage='native conversion readiness';
 const buildButton=page.getByRole('button',{name:'Convert map to MCC',exact:true});await expect(buildButton).toBeEnabled({timeout:90000});await buildButton.click();
 let built;await expect.poll(async()=>{const p=await project();built=p.builds.find(value=>value.status==='validated'&&value.output);const boot=await call('bootstrap');const failed=boot.logs.findLast(log=>log.projectId===id&&log.phase==='failed');if(failed)throw Error(failed.message);return!!built;},{timeout:900000,intervals:[1000,2500]}).toBe(true);
 const [opened]=await call('import_paths',{paths:[built.output]}),binding=authored.nativeAssetImports[0],tag=opened.inspection.tags.find(value=>value.class==='mach'&&value.path.split(String.fromCharCode(92)).join('/').toLowerCase()===binding.nativePath.toLowerCase());expect(tag).toBeTruthy();
 const placed=opened.inspection.objects.filter(object=>object.kind==='Machine'&&object.tagId===tag.id);expect(placed).toHaveLength(2);
 for(const wanted of placements)expect(placed.some(object=>object.position.every((value,index)=>Math.abs(value-wanted.position[index])<.0001)&&object.rotation.every((value,index)=>Math.abs(value-wanted.rotation[index])<.0001))).toBe(true);
 Object.assign(receipt,{stage:'native cache machine placements verified',nativeBuild:{id:built.id,target:built.target,status:built.status,projectFingerprint:built.projectFingerprint},nativeMachineCount:placed.length,outputSha256:await hash(built.output),authoredPlacements:placements.map(({id,position,rotation})=>({id,position,rotation}))});
 // The preceding QuickForge readback has the same scenario path. Use a fresh
 // owned directory so Invader cannot retain that earlier scenario unchanged.
 const directory=path.toNamespacedPath(path.join(root,'independent-native-tags','world-rebuilt')),scenario=opened.inspection.tags.find(value=>value.class==='scnr').path+'.scenario';
 await fs.mkdir(directory);
 const extracted=await run(path.join(invader,'invader-extract.exe'),['-s',scenario,'-t',directory,built.output],{windowsHide:true,timeout:30000});
 expect(extracted.stdout+'\n'+extracted.stderr).not.toMatch(/Failed to extract|ERROR:/i);
 const read=async field=>(await run(path.join(invader,'invader-edit.exe'),['-t',directory,'-G',field,scenario],{windowsHide:true,timeout:30000})).stdout.trim();
 const count=Number((await run(path.join(invader,'invader-edit.exe'),['-t',directory,'-C','machines',scenario],{windowsHide:true,timeout:30000})).stdout.trim());
 expect(count).toBe(opened.inspection.objects.filter(object=>object.kind==='Machine').length);expect(count).toBeGreaterThanOrEqual(2);
 const groups=[];for(let index=count-2;index<count;index++)groups.push({power:await read(`machines[${index}].power_group`),position:await read(`machines[${index}].position_group`)});
 // Invader HEK Index is uint16_t; NULL_INDEX is0xFFFF. Its CLI reads
 // the same unassigned -1 bit pattern back as unsigned65535.
 Object.assign(receipt,{independentScenarioMachineCount:count,groups});
 expect(groups).toEqual([{power:'65535',position:'65535'},{power:'65535',position:'65535'}]);expect(await hash(compiled)).toBe(original);
 Object.assign(receipt,{stage:'native compilation and independent readback passed',projectId:id,sourceSha256:original,donorSha256:donor.project.source.sha256,outputSha256:await hash(built.output),authoredPlacements:placements.map(({id,position,rotation})=>({id,position,rotation})),nativeBuild:{id:built.id,target:built.target,status:built.status,projectFingerprint:built.projectFingerprint},nativeMachineCount:placed.length,groups,realPointerDrop:true,copyPaste:true,oneActionUndoRedoSave:true,dependencyBindings:authored.nativeAssetImports.length,sourceUnchanged:true,gameplayVerified:false});
}


// Two distinct, real CE donors through the existing QuickForge and imported-map
// World writers. Setup IPC only opens owned fixtures; all authored edits/drop,
// history and builds below use visible controls and the actual native backend.
export async function nativeCrossRuntimeAssetRoundTrip({page,root,kit,tags,invader,cache,donors,call,receipt,expect,run,retain}) {
 const hash=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
 const tool=name=>path.join(invader,name+'.exe'), normalize=value=>value.replaceAll('\\','/').toLowerCase();
 const originalFiles=[...new Set([cache,...donors,...donors.flatMap(file=>['bitmaps.map','sounds.map','loc.map'].map(name=>path.join(path.dirname(file),name)))])];
 const originalInputs=await Promise.all(originalFiles.map(async file=>({file,sha256:await hash(file)})));
 const boot=await call('bootstrap');await call('save_settings',{settings:{...boot.settings,onboardingCompleted:true,autoBuild:false,preferredHalo:'mccSteam',hekDirectory:kit,hekTagsDirectory:tags,invaderDirectory:invader,hekFlavor:'h1aEk'}});
 const [material]=await call('import_paths',{paths:[cache]});expect(material.inspection.header.version).toBe(13);
 const sources=[];for(const [index,donor]of donors.entries()){
  // Memory-first Spark deliberately borrows source maps. Only the negative
  // corruption fixture needs its own byte-identical map; banks remain borrowed
  // read-only and are resolved by the source edition, never the hosting choice.
  let input=donor;if(index===0){input=path.join(root,'donor-inputs','bloodgulch.map');await fs.copyFile(donor,input,fs.constants.COPYFILE_EXCL);expect(await hash(input)).toBe(await hash(donor));}
  const [opened]=await call('import_paths',{paths:[input]});expect(opened.inspection.header.version).toBe(609);
  const resourceDirectory=path.dirname(donor),resourceSha256=Object.fromEntries(['bitmaps.map','sounds.map','loc.map'].map(name=>[name,originalInputs.find(value=>value.file===path.join(resourceDirectory,name)).sha256]));
  // Fixture setup chooses the real owned CE resource set explicitly. A copied
  // map has no adjacent banks; selecting MCC must never supply fake CE banks.
  // Generic project updates intentionally cannot change protected source pins.
  // Use the existing verified resource-connection operation, as the setup UI does.
  const connected=await call('connect_halo_textures',{projectId:opened.project.id,mode:'path',path:resourceDirectory});
  expect(connected.project.source.resourceSha256).toEqual(resourceSha256);sources.push(connected);
 }
 const created=await call('create_quickforge_project',{title:'CE scenery to MCC authoring',template:'customBlank',target:'mccSteam'});
 await page.reload();
 const open=async id=>{
  await chooseTool(page,'Map library');await expect(page.locator('.gs-workspace-shell')).toHaveAttribute('data-workspace','library');
  await page.locator(`.map-card[data-project-id="${id}"]`).click();
  await expect(page.locator(`.map-tab[data-map-tab-id="${id}"] [role="tab"]`)).toHaveAttribute('aria-selected','true',{timeout:90000});
  await expect(page.locator('.busy-indicator')).toBeHidden({timeout:90000});
  if(await page.locator('.gs-workspace-shell').getAttribute('data-workspace')!=='level')await chooseTool(page,'Level editor');
  await expect(page.locator('.gs-workspace-shell')).toHaveAttribute('data-workspace','level');
 };
 const project=async id=>{const view=(await call('read_workspace_history',{projectId:id})).history;return view?.snapshots.find(value=>value.key===view.head.current)?.project??(await call('open_project',{id})).project;};
 const save=async id=>{await page.keyboard.press('Control+s');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await expect.poll(async()=>(await call('read_workspace_history',{projectId:id})).history?.head.dirty).toBe(false);};
 const closeDrawers=async()=>{for(const name of ['Inspector','Build tools','Asset library','Object tags']){const panel=page.getByRole('region',{name:`${name} panel`,exact:true});if(await panel.isVisible())await panel.getByRole('button',{name:`Close ${name}`,exact:true}).click();}};
 const field=async(input,value)=>{await input.fill(String(value));await input.press('Tab');};
 for(const source of [material,...sources])await open(source.project.id);
 await open(created.project.id);await page.getByRole('button',{name:'BSP Workshop',exact:true}).click();await page.getByRole('button',{name:'Two rooms + corridor + ramp',exact:true}).click();
 const details=page.locator('.bsp-source-fields details').filter({has:page.locator('summary',{hasText:'Halo material paths & player starts'})});await details.locator('summary').click();
 await field(page.getByRole('textbox',{name:'Shader path surface',exact:true}),'levels/test/tutorial/shaders/example_tutorial_metal_floor');
 await field(details.getByRole('textbox').last(),'levels/test/bloodgulch/bloodgulch');
 await page.getByRole('combobox',{name:'Workshop texture source',exact:true}).selectOption(material.project.id);
 await expect.poll(async()=>Number(await page.getByLabel('Native BSP Workshop').getAttribute('data-textures')),{timeout:90000}).toBeGreaterThan(0);
 await expect(page.locator('.bsp-source-fields[aria-busy="false"]')).toBeVisible();await save(created.project.id);
 await page.getByRole('button',{name:'Objects & gameplay',exact:true}).click();
 receipt.pairs=[];receipt.originalInputs=originalInputs;receipt.sourceProjectIds=sources.map(value=>value.project.id);
 let target=created;
 for(const [index,spec] of [
  {source:sources[0],class:'scen',category:'scen',path:'scenery/rocks/boulder/boulder',name:'boulder'},
  {source:sources[1],class:'vehi',category:'vehi',path:'vehicles/warthog/mp_warthog',name:'mp_warthog'},
 ].entries()){
  const id=target.project.id,quick=!!target.project.quickForge;
  const tag=spec.source.inspection.tags.find(tag=>tag.class===spec.class&&normalize(tag.path)===spec.path);expect(tag).toBeTruthy();
  const record={sourceProjectId:spec.source.project.id,targetProjectId:id,sourceVersion:609,targetVersion:13,assetClass:spec.class,sourceTagPath:tag.path,sourceSha256:spec.source.project.source.sha256,stage:'source and target opened',gameplayVerified:false};receipt.pairs.push(record);
  console.log('CROSS_RUNTIME_PAIR',JSON.stringify(record));
  const resourceReview=await call('review_bitmap_resource_candidates',{projectId:spec.source.project.id});
  const resource=resourceReview.candidates.find(value=>value.sha256===spec.source.project.source.resourceSha256['bitmaps.map']);
  record.nativeResourceCoverage=resource?.coverage;record.resourceAdmissionErrors=resourceReview.candidates.filter(value=>value.error).map(value=>value.error);
  expect(resource?.coverage,'The actual CE source bank must prove its native ranges, including volumes').toBeTruthy();
  expect(resource.coverage.missingOrMismatchedImages).toBe(0);expect(resource.coverage.unsupportedImages).toBe(0);
  if(index===0)expect(resource.coverage.volumeImages).toBeGreaterThan(0);
  console.log('CROSS_NATIVE_RESOURCES',JSON.stringify({pair:index+1,coverage:record.nativeResourceCoverage}));
  await open(id);await closeDrawers();
  await page.evaluate(()=>{window.__crossInput=[];for(const type of ['pointerdown','pointerup','click','keydown','keyup'])window.addEventListener(type,event=>{const target=event.target;if(!(target instanceof Element))return;const row={type,detail:event.detail,key:event.key,ctrl:event.ctrlKey,alt:event.altKey,shift:event.shiftKey,x:event.clientX,y:event.clientY,target:target.closest('button,input')?.getAttribute('aria-label')??target.className,at:performance.now()};window.__crossInput.push(row);if(window.__crossInput.length>100)window.__crossInput.shift();},true);});
  const trace=async stage=>{const value=await project(id);const data={stage,history:value.history.at(-1),placements:(quick?value.quickForge.placements:value.scene.filter(object=>object.sourceModel)).map(({id,position})=>({id,position})),inputs:await page.evaluate(()=>window.__crossInput.splice(0))};(record.inputSteps??=[]).push(data);console.log('CROSS_INPUT',JSON.stringify(data));};
  if(!quick)await page.getByRole('combobox',{name:'View from player start',exact:true}).selectOption('');
  await openDrawer(page,'Asset library');const library=page.getByRole('region',{name:'Asset library panel',exact:true});
  await library.getByRole('combobox',{name:'Asset library map',exact:true}).selectOption(spec.source.project.id);
  await library.getByRole('combobox',{name:'Asset library type',exact:true}).selectOption(spec.category);
  await library.getByRole('searchbox',{name:'Search loaded assets',exact:true}).fill(spec.path.replaceAll('/','\\'));
  const button=library.getByRole('button',{name:`Add ${spec.name} at view`,exact:true}),article=button.locator('..');await expect(button).toBeEnabled({timeout:90000});
  await expect(article.getByAltText('Actual textured Halo model: '+spec.name)).toBeVisible({timeout:120000});
  record.preview={realNativeModel:true,origin:await article.locator('small').last().innerText(),imageBytes:(await article.locator('img').getAttribute('src')).length};
  await page.screenshot({path:path.join(root,`cross-runtime-${index+1}-preview.png`)});
  const canvas=page.locator(quick?'.forge-viewport canvas':'.world-layout:visible .viewport canvas:visible');await expect(canvas).toHaveAttribute('data-gs-camera-pose',/position/);
  const rect=await canvas.boundingBox(),pose=JSON.parse(await canvas.getAttribute('data-gs-camera-pose'));
  const camera=new PerspectiveCamera(55,rect.width/rect.height,.03,20000);camera.position.fromArray(pose.position);camera.quaternion.fromArray(pose.quaternion);camera.zoom=pose.zoom;camera.updateMatrixWorld(true);camera.updateProjectionMatrix();
  const requested=index===0?[6,2,.05]:[26,2,.05],projected=new Vector3(...requested).project(camera),to={x:rect.x+(projected.x+1)*rect.width/2,y:rect.y+(1-projected.y)*rect.height/2},from=await button.boundingBox();
  expect(projected.z).toBeGreaterThan(-1);expect(projected.z).toBeLessThan(1);expect(to.x).toBeGreaterThan(rect.x);expect(to.x).toBeLessThan(rect.x+rect.width);expect(to.y).toBeGreaterThan(rect.y);expect(to.y).toBeLessThan(rect.y+rect.height);
  const placements=value=>quick?value.quickForge.placements:value.scene.filter(object=>object.sourceModel),baseline=placements(await project(id)).length;
  const drag=async()=>{await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:16});};
  await drag();await expect(page.locator('.viewport-asset-drop-hint:visible')).toBeVisible();await page.keyboard.press('Escape');await page.mouse.up();
  expect(placements(await project(id))).toHaveLength(baseline);
  await drag();await page.mouse.move(rect.x+rect.width/2,10,{steps:6});await page.mouse.up();expect(placements(await project(id))).toHaveLength(baseline);
  await trace('after Escape and outside release');record.escapeAndOutsideDropCancelled=true;
  if(index===0){
    // Corrupt one byte only in Spark's disposable preserved donor copy. The
    // user's original cache and resource banks are never opened for writing.
    const originalPath=spec.source.project.source.preservedPath;
    const owned=originalPath.startsWith(String.fromCharCode(92,92,63,92))?originalPath.slice(4):originalPath,relative=path.relative(root,owned);
    if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('Corruption fixture escaped its owned QA library');
    const handle=await fs.open(owned,'r+'),byte=Buffer.alloc(1);await handle.read(byte,0,1,2048);
    try{
      await handle.write(Buffer.from([byte[0]^1]),0,1,2048);await handle.sync();
      await drag();await page.mouse.up();
      await expect(page.getByText(/Preserved source.*changed|Original source.*changed|Source checksum.*changed|Source changed|Inspection is not the preserved source cache/i)).toBeVisible({timeout:45000});
      // A renderer warning can arrive before the independent import promise.
      // Keep the bad bytes in place until that UI transaction has settled;
      // restoring early would turn the negative test into a valid import.
      await expect(button).toBeEnabled({timeout:45000});
      expect(placements(await project(id))).toHaveLength(baseline);
      expect((await project(id)).nativeAssetImports??[]).toEqual([]);
      record.corruptedOwnedDonorRejectedWithoutPlacement=true;
    }finally{await handle.write(byte,0,1,2048);await handle.sync();await handle.close();}
    expect(await hash(owned)).toBe(spec.source.project.source.sha256);
    await expect(button).toBeEnabled();
  }
  await drag();await page.screenshot({path:path.join(root,`cross-runtime-${index+1}-drag.png`)});const dropStarted=Date.now();await page.mouse.up();
  await expect.poll(async()=>{const current=await project(id);if(placements(current).length===baseline){const log=(await call('bootstrap')).logs.findLast(value=>value.projectId===id&&value.phase==='asset-import-failed'&&Date.parse(value.timestamp)>=dropStarted);if(log)throw Error('Native asset preparation rejected the valid donor: '+log.message);}return placements(current).length;},{timeout:180000}).toBe(baseline+1);record.stage='native import and pointer placement';
  const afterDrop=await project(id),placed=placements(afterDrop).at(-1),binding=afterDrop.nativeAssetImports.find(binding=>binding.sourceProjectId===spec.source.project.id&&binding.tagId===tag.id);
  expect(binding).toBeTruthy();expect(binding.fileCount).toBeGreaterThan(4);
  expect(placed.position[0]).toBeCloseTo(requested[0],0);expect(placed.position[1]).toBeCloseTo(requested[1],0);expect(placed.position[2]).toBeGreaterThanOrEqual(-.01);
  record.pointer={from,to,pose,requested,actual:placed.position};record.binding=binding;await expect(button).toBeEnabled();await trace('valid drop admitted');
  await openDrawer(page,'Inspector');const inspector=page.getByRole('region',{name:'Inspector panel',exact:true});
  if(quick)await inspector.getByRole('button',{name:'Properties',exact:true}).click();
  for(let axis=0;axis<3;axis++){await field(inspector.getByRole('spinbutton',{name:quick?`Position ${['X','Y','Z'][axis]}`:`position ${axis}`,exact:true}),(index===0?[-5,0,.05]:[25,-2,.05])[axis]);await trace('Inspector axis '+axis);}
  await page.locator('.runtime-dock-heading').click();await save(id);
  const historyStep=async stage=>{const history=(await call('read_workspace_history',{projectId:id})).history;const current=history.snapshots.find(value=>value.key===history.head.current).project;const step={stage,revision:history.revision,head:history.head,placements:placements(current).map(({id,position})=>({id,position}))};(record.historySteps??=[]).push(step);console.log('CROSS_HISTORY',JSON.stringify(step));};
  await expect.poll(async()=>placements(await project(id)).at(-1).position).toEqual(index===0?[-5,0,.05]:[25,-2,.05]);
  await trace('before copy');expect(placements(await project(id))).toHaveLength(baseline+1);await historyStep('transformed and saved before copy');await page.keyboard.press('Control+c');await page.keyboard.press('Control+v');
  await expect.poll(async()=>placements(await project(id)).length,{timeout:180000}).toBe(baseline+2);await save(id);await historyStep('pasted and saved');
  await page.keyboard.press('Control+z');await save(id);await historyStep('immediate Undo and Save');
  await expect.poll(async()=>placements(await project(id)).length).toBe(baseline+1);
  await page.keyboard.press('Control+y');await save(id);
  await expect.poll(async()=>placements(await project(id)).length).toBe(baseline+2);await historyStep('Redo and Save');
  await openDrawer(page,'Inspector');
  if(quick)await inspector.getByRole('button',{name:'Properties',exact:true}).click();
  for(let axis=0;axis<3;axis++)await field(inspector.getByRole('spinbutton',{name:quick?`Position ${['X','Y','Z'][axis]}`:`position ${axis}`,exact:true}),(index===0?[5,-3,.05]:[32,2,.05])[axis]);
  await page.locator('.runtime-dock-heading').click();await save(id);
  record.copyPasteUndoRedoSaved=true;record.authoredPlacements=placements(await project(id)).slice(-2);expect(new Set(record.authoredPlacements.map(value=>value.id)).size).toBe(2);
  await page.screenshot({path:path.join(root,`cross-runtime-${index+1}-placed.png`)});
  const importRoot=path.join(root,'library/asset-imports',id,binding.id),manifest=JSON.parse(await fs.readFile(path.join(importRoot,'import.json'),'utf8'));
  record.nativeDependencyClasses=[...new Set(manifest.files.map(value=>path.extname(value.path)))].sort();record.nativeDependencyFiles=manifest.files.length;
  expect(record.nativeDependencyClasses).toEqual(expect.arrayContaining(['.gbxmodel','.shader_model','.bitmap','.model_collision_geometry']));
  if(spec.class==='vehi')expect(record.nativeDependencyClasses).toEqual(expect.arrayContaining(['.physics','.model_animations','.sound']));
  record.stage='visible edit/history saved; building native MCC output';await closeDrawers();
  if(!quick)await chooseTool(page,'Build & playtest');
  const build=page.getByRole('button',{name:quick?'Build & check playtest':'Convert map to MCC',exact:true});await expect(build).toBeEnabled({timeout:90000});await build.click();
  const began=performance.now();let result;
  await expect.poll(async()=>{const current=await project(id);result=quick?(await call('quickforge_build_report',{projectId:id}))?.build:current.builds.findLast(value=>value.status==='validated'&&value.output);const log=(await call('bootstrap')).logs.findLast(value=>value.projectId===id);if(log?.phase==='failed')throw Error(log.message);return result?.status;},{timeout:900000,intervals:[1000,2500]}).toBe('validated');
  record.buildMs=Math.round(performance.now()-began);record.build={id:result.id,status:result.status,target:result.target};record.outputSha256=await hash(result.output);
  const output=await call('open_built_map',{projectId:id,buildId:result.id});expect(output.inspection.header.version).toBe(13);
  const nativeTag=output.inspection.tags.find(value=>value.class===spec.class&&normalize(value.path)===normalize(binding.nativePath));expect(nativeTag).toBeTruthy();
  const objects=output.inspection.objects.filter(value=>value.tagId===nativeTag.id);expect(objects).toHaveLength(2);
  for(const wanted of record.authoredPlacements)expect(objects.some(value=>value.position.every((n,axis)=>Math.abs(n-wanted.position[axis])<.0001))).toBe(true);
  const directory=path.toNamespacedPath(path.join(root,'independent-native-tags',`cross-${index+1}`));await fs.mkdir(directory);
  const scenario=output.inspection.tags.find(value=>value.class==='scnr').path+'.scenario',nativePath=binding.nativePath+(spec.class==='scen'?'.scenery':'.vehicle');
  for(const name of [scenario,nativePath]){const extracted=await run(tool('invader-extract'),['-s',name,...(name===nativePath?['-r']:[]),'-t',directory,result.output],{windowsHide:true,timeout:90000});expect(extracted.stdout+'\n'+extracted.stderr).not.toMatch(/Failed to extract|ERROR:/i);}
  const read=async(tag,field)=>(await run(tool('invader-edit'),['-t',directory,'-G',field,tag],{windowsHide:true,timeout:30000})).stdout.trim();
  const palette=spec.class==='scen'?'scenery_palette':'vehicle_palette',block=spec.class==='scen'?'scenery':'vehicles';
  const count=Number((await run(tool('invader-edit'),['-t',directory,'-C',block,scenario],{windowsHide:true,timeout:30000})).stdout.trim());expect(count).toBeGreaterThanOrEqual(2);
  const roots=(await run(tool('invader-edit'),['-t',directory,'-C',palette,scenario],{windowsHide:true,timeout:30000})).stdout.trim();expect(Number(roots)).toBeGreaterThanOrEqual(1);
  const palettePaths=[];for(let n=0;n<Number(roots);n++)palettePaths.push(await read(scenario,`${palette}[${n}].name`));
  // Standard scenarios may have multiple palette entries for one tag. Follow
  // every matching entry; do not mistake a valid second index for a lost copy.
  const nativeIndices=new Set(palettePaths.flatMap((value,index)=>normalize(value)===normalize(nativePath)?[index]:[]));expect(nativeIndices.size).toBeGreaterThan(0);
  const nativePositions=[];for(let n=0;n<count;n++)if(nativeIndices.has(Number(await read(scenario,`${block}[${n}].type`)))){const position=(await read(scenario,`${block}[${n}].position`)).split(/[,\s]+/).map(Number);expect(position).toHaveLength(3);expect(position.every(Number.isFinite)).toBe(true);nativePositions.push(position);}
  expect(nativePositions).toHaveLength(2);for(const wanted of record.authoredPlacements)expect(nativePositions.some(position=>position.every((value,axis)=>Math.abs(value-wanted.position[axis])<.0001))).toBe(true);
  const dependencies=await run(tool('invader-dependency'),['-t',directory,'-r',nativePath],{windowsHide:true,timeout:30000});expect(dependencies.stdout+'\n'+dependencies.stderr).not.toMatch(/ERROR:|Failed to/i);
  const dependencyPaths=dependencies.stdout.trim().split(/\r?\n/).filter(Boolean);expect(dependencyPaths.length).toBeGreaterThan(3);
  const radius=Number(await read(nativePath,'bounding_radius'));expect(radius).toBeGreaterThan(0);
  const crc=Number((await run(tool('invader-info'),['-T','crc32_mismatched',result.output],{windowsHide:true,timeout:30000})).stdout.trim());expect(crc).toBe(0);
  // Retain one independently verified authored cache, never an SDK,
  // extracted library, user map or executable. Parent exports them explicitly.
  // The owner requests one independently checked native output. Keep the
  // first only within the existing256MiB fixture budget; the second cache is
  // reproducible and its full dependency/position/hash receipt is sufficient.
  if(index===0){const retained=path.join(root,'native-output','cross-runtime-1.map');await fs.copyFile(result.output,retained,fs.constants.COPYFILE_EXCL);expect(await hash(retained)).toBe(record.outputSha256);await retain(retained,'Owner-requested first independently extracted CE-to-MCC native asset output');record.retainedOutput='native-output/cross-runtime-1.map';record.outputBytes=(await fs.stat(retained)).size;}
  record.independentNativeReadback={scenario,nativePath,placementCount:count,paletteEntries:Number(roots),palettePaths,nativePositions,dependencyPaths,boundingRadius:radius,crcMismatch:crc};record.stage='MCC native compile and independent readback passed';
  const saved=await project(id);record.savedProject=saved;record.savedHistory=(await call('read_workspace_history',{projectId:id})).history;
  console.log('CROSS_RUNTIME_PASS',JSON.stringify({pair:index+1,assetClass:spec.class,files:binding.fileCount,outputSha256:record.outputSha256,buildMs:record.buildMs}));
  if(index===0){target=output;await open(spec.source.project.id);await open(target.project.id);}
 }
 for(const input of originalInputs)expect(await hash(input.file)).toBe(input.sha256);
 receipt.originalInputsUnchanged=true;receipt.realPointerDrops=true;receipt.mockedIpc=false;receipt.gameplayVerified=false;
}
