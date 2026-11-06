// Shared real UI authoring steps from the accepted C63 workflow. The existing
// CLI and owned lifecycle runner use the same implementation.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {PerspectiveCamera,Vector3} from 'three';
import {openDrawer,chooseTool} from '../tests/ui/helpers/navigation.ts';
export async function nativeLogicRoundTrip({page,root,kit,tags,invader,cache,call,receipt,expect,resume=false,run,verifyEditedAsset=false}){
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
 await expect.poll(async()=>{const b=await call('bootstrap'),log=b.logs.findLast(l=>l.projectId===created.project.id);if(log?.phase!==lastPhase){lastPhase=log?.phase??'';phases.push({phase:lastPhase,elapsedMs:performance.now()-began,message:log?.message});console.log('NATIVE_PHASE',JSON.stringify(phases.at(-1)));}const failed=b.logs.find(l=>l.projectId===created.project.id&&l.phase==='failed');if(failed)throw Error(failed.message);return (await call('quickforge_build_report',{projectId:created.project.id}))?.status;},{timeout:900000,intervals:[1000,2500]}).toBe('validated');
 receipt.nativeBuildMs=performance.now()-began;receipt.nativePhases=phases;
 receipt.nativeBuild=await call('quickforge_build_report',{projectId:created.project.id});
 const [built]=await call('import_paths',{paths:[receipt.nativeBuild.build.output]});expect(built.inspection.scripts).toHaveLength(2);expect(built.inspection.tags.some(t=>t.class==='mach')).toBe(true);
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
