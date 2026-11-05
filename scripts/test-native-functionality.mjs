import { assertQaOutputPath } from './native-qa-storage.mjs';
import {openStudioMenu} from '../tests/ui/helpers/navigation.ts';
// Opt-in packaged Windows application test. Real IPC, owned source files and
// native WebView rendering. No game-file writes, external downloads or mocks.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,expect as assertion} from '@playwright/test';
const [appArg,rootArg,configurationArg]=process.argv.slice(2);
if(!configurationArg)throw Error('test-native-functionality <packaged.exe> <fresh-output> <owned-inputs.json>');
const root=path.resolve(rootArg),configuration=JSON.parse(await fs.readFile(configurationArg,'utf8'));
const expect=assertion.configure({timeout:120000});
await fs.mkdir(await assertQaOutputPath(root));const exe=path.join(root,'GuiltySpark-native-functionality.exe');await fs.copyFile(path.resolve(appArg),exe,fs.constants.COPYFILE_EXCL);
const hash=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const report={schemaVersion:1,complete:false,mockedIpc:false,appSha256:await hash(exe),maps:[],checks:{},errors:[],limitations:['No game visual parity, physical speaker listening, secondary physical display or Halo gameplay acceptance.']};
const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const child=spawn(exe,[],{windowsHide:true,stdio:'ignore',env:{...process.env,GUILTY_SPARK_DATA_DIR:path.join(root,'library'),WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
await fs.writeFile(path.join(root,'process.json'),JSON.stringify({pid:child.pid,port}));
let browser,page;
const invoke=(p,command,args={})=>p.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
const call=(command,args={})=>invoke(page,command,args);
async function choose(name,p=page){const nav=p.locator('.gs-navigation-drawer');if(!await nav.isVisible())await p.getByRole('button',{name:'Toggle workspace navigation',exact:true}).click();await nav.getByRole('button',{name,exact:true}).click();}
async function selectTag(open,tag){await choose('Tag editor');await page.getByPlaceholder('Search paths or classes…',{exact:true}).fill(tag.path);
 const group=page.locator('.tag-class-group').filter({has:page.getByRole('button',{name:new RegExp(`class \\(${tag.class.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\)`)} )});
 const toggle=group.locator('.tag-class-toggle');if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
 const short=tag.path.split(/[\\/]/).at(-1);await group.locator('.tag-row').filter({has:page.getByText(short,{exact:true})}).first().click();
}
/** Tauri's invoke property is immutable. Observe the real function through CDP;
 * a failed assignment is never allowed to masquerade as a zero-call trace. */
async function observeNativeInvokes(p){
 const session=await p.context().newCDPSession(p),commands=[],errors=[],pending=new Set();
 session.on('Debugger.paused',event=>{
  const task=(async()=>{try{
   const value=await session.send('Debugger.evaluateOnCallFrame',{callFrameId:event.callFrames[0].callFrameId,expression:'arguments[0]',returnByValue:true});
   if(typeof value.result.value!=='string'||commands.length>=10000)throw Error('Native invocation trace is invalid or exceeds its bound');commands.push(value.result.value);
  }catch(error){errors.push(String(error));}finally{await session.send('Debugger.resume').catch(error=>errors.push(String(error)));}})();
  pending.add(task);void task.finally(()=>pending.delete(task));
 });
 await session.send('Debugger.enable');
 const fn=await session.send('Runtime.evaluate',{expression:'window.__TAURI_INTERNALS__.invoke'});
 if(!fn.result.objectId)throw Error('The actual native invocation function is unavailable');
 const {breakpointId}=await session.send('Debugger.setBreakpointOnFunctionCall',{objectId:fn.result.objectId});
 return {commands,async stop(){await session.send('Debugger.removeBreakpoint',{breakpointId});await Promise.all([...pending]);await session.send('Debugger.disable');await session.detach();if(errors.length)throw Error(errors.join(' | '));}};
}
async function visibleModelPixels(png){
 return page.evaluate(async data=>{
  const image=new Image();image.src=`data:image/png;base64,${data}`;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
  const {data:p}=ctx.getImageData(0,0,canvas.width,canvas.height),at=(x,y)=>(y*canvas.width+x)*4;
  const b=at(Math.floor(canvas.width*.05),Math.floor(canvas.height*.1)),background=[p[b],p[b+1],p[b+2]];let visible=0,samples=0;
  // Exclude toolbar/caption text. Metadata/triangle counts alone can pass a
  // completely black viewport; the rendered subject must occupy real pixels.
  for(let y=Math.floor(canvas.height*.2);y<canvas.height*.85;y++)for(let x=Math.floor(canvas.width*.2);x<canvas.width*.85;x++){
   const i=at(x,y);samples++;if(Math.max(...background.map((v,c)=>Math.abs(v-p[i+c])))>12)visible++;
  }
  return {visible,samples,background};
 },png.toString('base64'));
}
try{
 await expect.poll(()=>fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.ok,()=>false)).toBe(true);
 browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
 await expect.poll(()=>browser.contexts().flatMap(c=>c.pages()).some(p=>p.url().includes('tauri.localhost'))).toBe(true);
 page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('tauri.localhost'));page.on('pageerror',e=>report.errors.push(String(e)));
 const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
 const boot=await call('bootstrap');await call('save_settings',{settings:{...boot.settings,onboardingCompleted:true,autoBuild:false,preferredHalo:'mccSteam'}});
 const opened=[];
 for(const entry of configuration.sources){
  if(entry.sameHashFirst){const folder=path.join(root,'originally-downloaded');await fs.mkdir(folder,{recursive:true});const copy=path.join(folder,`cache-${opened.length}.map`);await fs.copyFile(entry.path,copy,fs.constants.COPYFILE_EXCL);await call('import_paths',{paths:[copy]});}
  const before=await hash(entry.path),began=performance.now(),o=(await call('import_paths',{paths:[entry.path]}))[0];
  await call('claim_project_document',{id:o.project.id});o.project.title=entry.name;await call('save_project',{project:o.project});
  report.maps.push({name:entry.name,path:entry.path,sourceSha256:before,importMs:performance.now()-began,version:o.inspection.header.version,models:[],samples:[]});opened.push(o);
 }
 await page.reload();await call('plugin:window|maximize',{label:'main'});await call('plugin:window|set_focus',{label:'main'});
 for(let i=0;i<opened.length;i++){
  const o=opened[i],entry=configuration.sources[i],result=report.maps[i];await choose('Map library');
  await page.locator('.map-card').filter({has:page.getByRole('heading',{name:entry.name,exact:true})}).click();
  const world=page.locator('.world-layout:visible');await expect(world).toBeVisible();const began=performance.now();
  await expect.poll(()=>world.getAttribute('data-material-loading')).toBe('false');await expect.poll(()=>world.getAttribute('data-pending-materials')).toBe('0');
  await expect.poll(()=>world.getAttribute('data-reflection-loading')).toBe('false');
  result.worldMs=performance.now()-began;result.world=await world.evaluate(e=>({...e.dataset}));
  if(entry.reflectionCubes)expect(Number(result.world.sourceCubes)).toBe(entry.reflectionCubes);
  await page.screenshot({path:path.join(root,`world-${i}.png`)});
  const worldCanvas=world.locator('canvas');await worldCanvas.evaluate(e=>e.dataset.qaRetained='native-c53');
  // Authored player starts can place a biped directly in front of the camera.
  // Click visible wall/floor candidates instead of treating an object hit as a
  // failed BSP pick. These are real pointer events, never injected selection.
  const picked=world.locator('[data-native-surface]'),surfaceClicks=[];
  for(const [x,y] of [[.15,.3],[.4,.15],[.75,.25],[.3,.9],[.9,.9]]){
   const bounds=await worldCanvas.boundingBox();await worldCanvas.click({position:{x:bounds.width*x,y:bounds.height*y}});surfaceClicks.push([x,y]);await page.waitForTimeout(200);if(await picked.count())break;
  }
  await expect(picked).toHaveAttribute('data-source-hash',o.inspection.sha256);
  result.surfaceSelection={...await picked.evaluate(e=>({...e.dataset})),pointerClicks:surfaceClicks};
  const selectedSurface=await page.evaluate(id=>JSON.parse(localStorage.getItem('guilty-spark-map-session-v1:'+id))['world.surface-selection'],o.project.id);
  const surfaceShader=o.inspection.tags.find(tag=>tag.id===selectedSurface.shaderTagId);expect(surfaceShader).toBeTruthy();
  await picked.getByRole('button',{name:'Surface shader',exact:true}).click();
  const tagDrawer=page.getByRole('region',{name:'Object tags panel',exact:true}).locator('.viewport-tags');
  await expect(tagDrawer).toHaveAttribute('data-history-project',o.project.id);await expect(tagDrawer.locator('.viewport-tag-path')).toHaveText(surfaceShader.path);
  result.surfaceSelection.shaderTagId=surfaceShader.id;result.surfaceSelection.shaderTagPath=surfaceShader.path;
  await page.getByRole('button',{name:'Close Object tags',exact:true}).click();
  await picked.getByRole('button',{name:'Connect / tunnel',exact:true}).click();
  const construction=page.getByRole('region',{name:'Construction panel',exact:true});
  await expect(construction.getByRole('status').filter({hasText:'Reshaping compiled landscape faces is still in development'})).toBeVisible();
  await page.getByRole('button',{name:'Close Construction',exact:true}).click();
  await picked.getByRole('button',{name:'Deselect surface',exact:true}).click();
  const observer=await observeNativeInvokes(page);await call('startup_status');expect(observer.commands).toContain('startup_status');
  const beforeMaterials=await world.getAttribute('data-source-shaders');
  try{for(const runtime of ['haloCustomEdition','openCe','chupathingyCe','mccSteam']){await openStudioMenu(page);await page.getByLabel('Active Halo runtime',{exact:true}).selectOption(runtime);await page.waitForTimeout(250);await expect(world).toHaveAttribute('data-material-loading','false');await expect(worldCanvas).toHaveAttribute('data-qa-retained','native-c53');}}finally{await observer.stop();}
  result.hostingSwitchObservation={method:'CDP function-call breakpoint',positiveControl:'startup_status',observedCommands:observer.commands};
  result.hostingSwitchReads=observer.commands.filter(command=>/preview_owned_(?:cache_bitmap|object_model|reflection_cube)/.test(command));expect(result.hostingSwitchReads).toEqual([]);expect(await world.getAttribute('data-source-shaders')).toBe(beforeMaterials);
  const wanted=entry.models.map(pattern=>{const tag=o.inspection.tags.find(t=>['scen','vehi','bipd','eqip','itmc','mod2','mode'].includes(t.class)&&new RegExp(pattern,'i').test(t.path));expect(tag,`Missing requested native model ${pattern}`).toBeTruthy();return tag;});
  for(const tag of wanted){
   await selectTag(o,tag);const preview=page.locator('.tag-model-preview .native-model-preview');await expect(preview).toHaveAttribute('data-model-tag',String(tag.id));
   await expect(preview).toHaveAttribute('data-model-ready','true');await expect(preview).toHaveAttribute('data-model-lighting-ready','true');const canvas=preview.locator('canvas');await expect(canvas).toBeVisible();
   const observation={path:tag.path,id:tag.id,...await preview.evaluate(e=>({...e.dataset}))};
   await expect.poll(async()=>Number(await preview.getAttribute('data-model-textures')),'Representative native models must have actual source textures').toBeGreaterThan(0);
   await expect(preview).toHaveAttribute('data-model-material-gaps','0');
   Object.assign(observation,await preview.evaluate(e=>({...e.dataset})));
   const info=await page.locator('.tag-properties-pane').boundingBox(),modelBounds=await preview.boundingBox();
   expect(modelBounds.x).toBeGreaterThanOrEqual(info.x+info.width-1);expect(modelBounds.height).toBeGreaterThan(350);
   observation.layout={info,model:modelBounds};
   const pose=await canvas.getAttribute('data-gs-preview-camera'),rect=await canvas.boundingBox();
   await page.mouse.move(rect.x+rect.width*.55,rect.y+rect.height*.55);await page.mouse.down();await page.mouse.move(rect.x+rect.width*.55+75,rect.y+rect.height*.55+20,{steps:10});await page.mouse.up();
   await expect.poll(()=>canvas.getAttribute('data-gs-preview-camera')).not.toBe(pose);observation.orbit=true;
   const orbit=await canvas.getAttribute('data-gs-preview-camera');await page.mouse.wheel(0,-300);await expect.poll(()=>canvas.getAttribute('data-gs-preview-camera')).not.toBe(orbit);observation.zoom=true;
   await page.getByRole('button',{name:'Fit / Reset',exact:true}).click();observation.fitted=JSON.parse(await canvas.getAttribute('data-gs-preview-camera'));
   const image=await preview.screenshot({path:path.join(root,`model-${i}-${tag.id}.png`)});observation.gpuPixels=await visibleModelPixels(image);expect(observation.gpuPixels.visible,'Actual model pixels must be visible, not only decoded material metadata').toBeGreaterThan(2000);
   await page.screenshot({path:path.join(root,`tag-workspace-${i}-${tag.id}.png`)});result.models.push(observation);
  }
  await choose('Level editor');await expect(page.locator('.world-layout:visible canvas')).toHaveAttribute('data-qa-retained','native-c53');result.worldRetained=true;
  if(entry.sound){
   const tag=o.inspection.tags.find(t=>t.class==='snd!'&&new RegExp(entry.sound,'i').test(t.path));expect(tag,'An actual requested source sound is required').toBeTruthy();
   await selectTag(o,tag);const sound=page.locator('.sound-inspector');await expect(sound.getByRole('button',{name:'Play sample',exact:true})).toBeVisible();
   const compact=await page.locator('.tag-selection-layout.is-sound').evaluate(e=>{const pane=e.querySelector('.tag-properties-pane'),sound=e.querySelector('.sound-inspector'),lineage=e.querySelector('.gs-tag-lineage'),migration=e.querySelector('.gs-tag-migration');return{soundTop:sound.getBoundingClientRect().top-pane.getBoundingClientRect().top,lineageHeight:lineage.getBoundingClientRect().height,migrationHeight:migration.getBoundingClientRect().height,scroll:pane.scrollHeight-pane.clientHeight};});
   expect(compact.soundTop).toBeLessThan(200);expect(compact.lineageHeight).toBeLessThanOrEqual(44);expect(compact.migrationHeight).toBeLessThanOrEqual(44);expect(compact.scroll).toBeLessThanOrEqual(1);result.soundLayout=compact;
   const lineage=page.locator('.gs-lineage-disclosure');await lineage.locator(':scope > summary').click();await expect(lineage.getByRole('button',{name:'Export audit',exact:true})).toBeVisible();await lineage.locator(':scope > summary').click();
   await sound.locator('details summary').click();await sound.getByLabel('Repeat sample',{exact:true}).check();await sound.locator('details summary').click();
   const reportSound=await call('inspect_sound',{projectId:o.project.id,tagId:tag.id});expect(reportSound.permutations.some(p=>p.available)).toBe(true);
   const meterFile=path.join(root,`audio-output-${i}.json`);const meter=spawn(path.resolve(configuration.audioMeter),[String(child.pid),meterFile,'8'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
   let meterErrors='';meter.stderr.on('data',b=>meterErrors+=b.toString());const done=new Promise(resolve=>meter.once('exit',code=>resolve(code)));
   await sound.getByRole('button',{name:'Play sample',exact:true}).click();await expect(sound.locator('[data-audition-state]')).toHaveAttribute('data-audition-state','playing');
   await page.waitForTimeout(5500);await sound.getByRole('button',{name:'Stop sound preview',exact:true}).click();await expect(sound.locator('[data-audition-state]')).toHaveAttribute('data-audition-state','idle');
   const meterExit=await done;result.samples.push({path:tag.path,playingThenStopped:true,nativeSamples:reportSound.permutations,meterExit,meterErrors});
   if(meterExit===0){const measured=JSON.parse((await fs.readFile(meterFile,'utf8')).replace(/^\uFEFF/,''));result.samples.at(-1).windowsMaximumPeak=Math.max(0,...measured.readings.flatMap(r=>r.sessions.map(s=>s.Peak)));}
   expect(meterExit,`Windows audio meter: ${meterErrors}`).toBe(0);expect(result.samples.at(-1).windowsMaximumPeak).toBeGreaterThan(.0001);
   await sound.screenshot({path:path.join(root,`sound-${i}.png`)});
   await page.screenshot({path:path.join(root,`sound-workspace-${i}.png`)});
  }
  expect(await hash(entry.path)).toBe(result.sourceSha256);
 }
 expect(report.errors).toEqual([]);report.complete=true;
}catch(error){report.error=String(error);report.stack=error.stack;process.exitCode=1;await page?.screenshot({path:path.join(root,'failure.png')}).catch(()=>{});}
finally{await fs.writeFile(path.join(root,'acceptance.json'),JSON.stringify(report,null,2));await browser?.close().catch(()=>{});if(child.exitCode===null)child.kill();console.log(JSON.stringify({complete:report.complete,maps:report.maps.map(m=>({name:m.name,models:m.models.length,samples:m.samples.length})),error:report.error}));}
