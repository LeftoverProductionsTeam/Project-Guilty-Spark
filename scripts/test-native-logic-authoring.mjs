import { assertQaOutputPath } from './native-qa-storage.mjs';
// Opt-in desktop acceptance against real native IPC and owner-selected Halo tools.
// Gameplay and third-party GUI interaction remain separate acceptance gates.
import { chromium, expect as assertion } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { PerspectiveCamera, Vector3 } from 'three';
import { openDrawer, chooseTool } from '../tests/ui/helpers/navigation.ts';
const expect=assertion.configure({timeout:45000}),a=process.argv.slice(2),resume=a.length===7&&a[6]==='--resume-build';
if(a.length!==6&&!resume)throw Error('test-native-logic-authoring <Spark exe> <fresh root> <H1A kit> <owned tags> <Invader> <owned MCC source map with a device_machine> [--resume-build]');
const [app,root,kit,tags,invader,cache]=a.slice(0,6).map(p=>path.resolve(p));
if(!resume)await fs.mkdir(await assertQaOutputPath(root),{recursive:false});const data=path.join(root,'library');if(!resume)await fs.mkdir(data);
const hash=async p=>crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');
const receipt={schemaVersion:1,appSha256:await hash(app),sourceCacheSha256:await hash(cache),mockedIpc:false,gameplayVerified:false,externalGuiEdited:false,complete:false};
if(resume){const previous=JSON.parse(await fs.readFile(path.join(root,'failure.json'),'utf8'));if(previous.mockedIpc!==false||!previous.oneActionConnectionUndoRedo||!previous.saveReopenPreservesLogic||!previous.triggerTransformUndo||previous.sourceCacheSha256!==receipt.sourceCacheSha256||previous.appSha256!==receipt.appSha256)throw Error('Resume requires the same executable/source and recorded genuine UI authoring checks');Object.assign(receipt,previous,{error:undefined,stack:undefined,resumedBuild:true,authoringEvidence:'failure.json',complete:false});}
const errors=[],socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const exe=path.join(root,'GuiltySpark-logic-qa.exe');if(!resume)await fs.copyFile(app,exe,fs.constants.COPYFILE_EXCL);else expect(await hash(exe)).toBe(receipt.appSha256);
const child=spawn(exe,[],{windowsHide:true,stdio:'ignore',env:{...process.env,GUILTY_SPARK_DATA_DIR:data,WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
await fs.writeFile(path.join(root,'owned-process.json'),JSON.stringify({pid:child.pid,port},null,2));
let browser,page,call;
try {
 await expect.poll(()=>fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.ok,()=>false)).toBe(true);
 browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
 await expect.poll(()=>browser.contexts().flatMap(c=>c.pages()).some(p=>p.url().includes('tauri.localhost'))).toBe(true);
 page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('tauri.localhost'));
 page.setDefaultTimeout(120000);
 page.on('pageerror',e=>errors.push(String(e)));
 call=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
 const boot=await call('bootstrap');await call('save_settings',{settings:{...boot.settings,onboardingCompleted:true,autoBuild:false,preferredHalo:'mccSteam',hekDirectory:kit,hekTagsDirectory:tags,invaderDirectory:invader,hekFlavor:'h1aEk'}});
 const [source]=resume?[null]:await call('import_paths',{paths:[cache]});
 const created=resume?await call('open_project',{id:receipt.projectId}):await call('create_quickforge_project',{title:'C63 native Logic benchmark',template:'customBlank',target:'mccSteam'});receipt.projectId=created.project.id;
 const closeDrawers=async()=>{for(const label of ['Inspector','Build tools','Asset library']){const panel=page.getByRole('region',{name:`${label} panel`,exact:true});if(await panel.isVisible())await panel.getByRole('button',{name:`Close ${label}`,exact:true}).click();}};
 const open=async()=>{await page.reload();await page.locator('.map-card').filter({has:page.locator('h3',{hasText:created.project.title})}).click();await closeDrawers();};
 const state=async()=>(await call('open_project',{id:created.project.id})).project.quickForge;
 const save=async()=>{await page.keyboard.press('Control+s');await expect(page.getByText('Saved',{exact:true}).last()).toBeVisible();};
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
 await page.getByRole('tab',{name:created.project.title,exact:true}).click();await chooseTool(page,'Level editor');
 await openDrawer(page,'Asset library');const assets=page.getByRole('region',{name:'Asset library panel',exact:true});
 await assets.getByRole('combobox',{name:'Asset library map',exact:true}).selectOption(source.project.id);
 await assets.getByRole('combobox',{name:'Asset library type',exact:true}).selectOption('doors');
 const paletteDoor=assets.getByRole('button',{name:'Add door small at view',exact:true});
 // The example's origin is inside the ramp. Use a genuine pointer drag to an
 // observed clear floor point instead of treating a refused origin click as a placement.
 receipt.nativeAssetPointerDrop=await dragTo(paletteDoor,[6,2,0.05]);
 await expect.poll(async()=>(await state()).placements.length,{timeout:180000}).toBe(1);await save();await expect(page.getByRole('textbox',{name:'Selected object name',exact:true})).toHaveValue('door small');
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
 await page.getByRole('button',{name:'Build & check playtest',exact:true}).click();
 const began=performance.now(),phases=[];let lastPhase='';
 await expect.poll(async()=>{const b=await call('bootstrap'),log=b.logs.findLast(l=>l.projectId===created.project.id);if(log?.phase!==lastPhase){lastPhase=log?.phase??'';phases.push({phase:lastPhase,elapsedMs:performance.now()-began,message:log?.message});console.log('NATIVE_PHASE',JSON.stringify(phases.at(-1)));}const failed=b.logs.find(l=>l.projectId===created.project.id&&l.phase==='failed');if(failed)throw Error(failed.message);return (await call('quickforge_build_report',{projectId:created.project.id}))?.status;},{timeout:900000,intervals:[1000,2500]}).toBe('validated');
 receipt.nativeBuildMs=performance.now()-began;receipt.nativePhases=phases;
 receipt.nativeBuild=await call('quickforge_build_report',{projectId:created.project.id});
 const [built]=await call('import_paths',{paths:[receipt.nativeBuild.build.output]});expect(built.inspection.scripts).toHaveLength(2);expect(built.inspection.tags.some(t=>t.class==='mach')).toBe(true);
 receipt.nativeOutputSha256=await hash(receipt.nativeBuild.build.output);receipt.nativeScriptNames=built.inspection.scripts.map(s=>s.name);
 receipt.originalCacheUnchanged=(await hash(cache))===receipt.sourceCacheSha256;expect(receipt.originalCacheUnchanged).toBe(true);
 expect(errors).toEqual([]);receipt.pageErrors=errors;receipt.complete=true;
 await fs.writeFile(path.join(root,'acceptance.json'),JSON.stringify(receipt,null,2));console.log('PASS real desktop door placement, visual event, native HSC, Undo, reopen and MCC Tool build. Gameplay remains a separate gate.');
}catch(e){receipt.error=String(e);receipt.stack=e.stack;receipt.pageErrors=errors;const name=resume?`failure-resume-${Date.now()}`:'failure';await page?.screenshot({path:path.join(root,`${name}.png`)}).catch(()=>{});await fs.writeFile(path.join(root,`${name}.json`),JSON.stringify(receipt,null,2));throw e;}
finally{await browser?.close();child.kill();}
