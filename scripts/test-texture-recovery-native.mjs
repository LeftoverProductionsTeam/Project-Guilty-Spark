// Opt-in, real WebView2 / native IPC test. Uses owned files read-only and
// changes only a fresh QA library and private resource copies beneath --output.
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium,expect as baseExpect} from '@playwright/test';
import {PerspectiveCamera,Vector3} from 'three';
const expect=baseExpect.configure({timeout:60000}),args=new Map();
for(let i=2;i<process.argv.length;i+=2)args.set(process.argv[i],process.argv[i+1]);
if(!args.get('--app')||!args.get('--output')||!args.get('--map')||[...args.keys()].some(k=>!['--app','--output','--map'].includes(k)))throw Error('Required: --app built.exe --output fresh-directory --map owned-classic.map');
const output=path.resolve(args.get('--output')),input=path.resolve(args.get('--map'));
await fs.mkdir(output);
const exe=path.join(output,'GuiltySpark-texture-recovery.exe');
await fs.copyFile(path.resolve(args.get('--app')),exe,fs.constants.COPYFILE_EXCL);
const canonical=value=>JSON.parse(JSON.stringify(value));
const hash=async(file)=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const originalFolder=path.dirname(input),before={};
for(const file of [input,...['bitmaps.map','sounds.map','loc.map'].map(n=>path.join(originalFolder,n))]){
  try{before[file]=await hash(file);}catch(e){if(e.code!=='ENOENT')throw e;}
}
if(before[input]!=='b38f35508188872b2535888193de80f766d92d3b8d53a8ada7be4fc9808a996d')throw Error('This challenge requires the exact owned Zombie Apocalypse Demo source.');
const receipt={schemaVersion:1,appSha256:await hash(exe),sourceSha256:before[input],inputs:before,complete:false,errors:[],limitations:['Editor/native texture evidence only. No Halo gameplay, multiplayer replication or full shader/audio parity is claimed.']};
let child,browser,page;
async function launch(){
  const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
  child=spawn(exe,[],{windowsHide:true,stdio:'ignore',env:{...process.env,GUILTY_SPARK_DATA_DIR:path.join(output,'library'),WEBVIEW2_USER_DATA_FOLDER:path.join(output,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
  await expect.poll(()=>fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.ok,()=>false)).toBe(true);
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await expect.poll(()=>browser.contexts().flatMap(c=>c.pages()).some(p=>p.url().includes('tauri.localhost'))).toBe(true);
  page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('tauri.localhost'));
  page.on('pageerror',e=>receipt.errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error'&&/THREE|WebGL|shader/i.test(m.text()))receipt.errors.push(m.text());});
}
async function stop(){
  await browser?.close();browser=null;
  if(child&&child.exitCode===null){const closed=once(child,'exit');child.kill();await closed;}
  child=null;
}
const call=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
async function chooseLibrary(){
  const drawer=page.locator('.gs-navigation-drawer');
  if(!await drawer.isVisible())await page.getByRole('button',{name:'Toggle workspace navigation',exact:true}).click();
  await drawer.getByRole('button',{name:'Map library',exact:true}).click();
}
async function materials(){
  const world=page.locator('.world-layout');
  await expect(world).toBeVisible();
  await expect.poll(()=>world.getAttribute('data-source-shaders'),{timeout:120000}).toBe('132');
  await expect.poll(()=>world.getAttribute('data-material-loading'),{timeout:120000}).toBe('false');
  await expect.poll(()=>world.getAttribute('data-pending-materials'),{timeout:120000}).toBe('0');
  await expect.poll(async()=>Number(await world.getAttribute('data-source-reflections')),{timeout:120000}).toBeGreaterThan(0);
  const data=await world.evaluate(e=>({...e.dataset}));
  return Object.fromEntries(Object.entries(data).filter(([k])=>k!=='sourceShaderIds'));
}
try{
  await launch();console.log('phase: isolated native app started');
  const boot=await call('bootstrap');
  await call('save_settings',{settings:{...boot.settings,onboardingCompleted:true,autoBuild:false,preferredHalo:'mccSteam'}});
  let [open]=await call('import_paths',{paths:[input]});
  const id=open.project.id,projectFile=path.join(output,'library/projects',id,'project.gsproject');
  await call('claim_project_document',{id});
  open.project.title='Texture recovery native QA';
  const tag=open.inspection.tags.find(t=>t.fields?.some(f=>f.key==='bounding-radius'));
  open.project.tagEdits=[{tagId:tag.id,fieldKey:'bounding-radius',value:0.9}];
  const moved=open.project.scene.find(o=>o.tagId!==null&&o.sourceOffset!==null);
  moved.position[2]+=0.25;
  await call('save_project',{project:open.project});
  // Compare the actual saved native state, including its f32 quantization.
  const saved=(await call('open_project',{id})).project;
  const pins=structuredClone(saved.source.resourceSha256),scene=canonical(saved.scene),edits=canonical(saved.tagEdits);
  expect(path.isAbsolute(open.project.source.resourceDirectory)).toBe(true);
  const pose=new PerspectiveCamera();pose.up.set(0,0,1);pose.position.set(31,-96,2.1);pose.lookAt(new Vector3(35.6,-90.8,1.8));
  await page.evaluate(({id,quaternion})=>localStorage.setItem('guilty-spark-map-session-v1:'+id,JSON.stringify({'world.playerView':false,'world.grid':false,'camera.world.PerspectiveCamera':{type:'PerspectiveCamera',position:[31,-96,2.1],quaternion,target:[35.6,-90.8,1.8],zoom:1}})),{id,quaternion:pose.quaternion.toArray()});
  await stop();
  // Simulate a saved legacy project opened from a different current directory.
  const legacy=JSON.parse(await fs.readFile(projectFile));
  legacy.source.resourceDirectory=path.join('Pyros Zombie Apocolypse Mod Versions','Zombie Apocalypse','maps');
  await fs.writeFile(projectFile,JSON.stringify(legacy,null,2));
  await launch();
  await call('plugin:window|maximize',{label:'main'});
  await page.reload();
  await chooseLibrary();
  const started=performance.now();
  await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Texture recovery native QA',exact:true})}).click();
  await expect.poll(async()=>path.isAbsolute((await call('open_project',{id})).project.source.resourceDirectory)).toBe(true);
  const recovered=await call('open_project',{id});
  expect(recovered.project.source.resourceSha256).toEqual(pins);
  expect(canonical(recovered.project.scene)).toEqual(scene);
  expect(recovered.project.tagEdits).toEqual(edits);
  expect(recovered.project.source.sha256).toBe(receipt.sourceSha256);
  console.log('phase: exact pins and native saved edits survived legacy-path recovery');
  receipt.recovery={elapsedMs:performance.now()-started,pinsUnchanged:true,sceneAndTagEditsPreserved:true,resourceDirectory:recovered.project.source.resourceDirectory,viewport:await materials()};
  await page.screenshot({path:path.join(output,'recovered-original-textures.png')});console.log('phase: recovered native GPU textures rendered');
  const reviewStarted=performance.now();
  const reviewed=await call('review_bitmap_resource_candidates',{projectId:id});
  receipt.reviewElapsedMs=performance.now()-reviewStarted;
  receipt.candidates=reviewed.candidates;console.log('phase: candidate resource coverage checked');
  const original=reviewed.candidates.find(c=>c.sha256===pins['bitmaps.map']);
  expect(original.coverage.verifiedImages).toBeGreaterThan(400);
  const partial=reviewed.candidates.find(c=>c.coverage?.verifiedImages===1&&c.coverage?.missingOrMismatchedImages>100);
  expect(partial).toBeTruthy();
  // Same exact pixels, different location: every dependent preview must retry.
  const relocated=path.join(output,'private-resource-copy');await fs.mkdir(relocated);
  for(const name of Object.keys(pins))await fs.copyFile(path.join(originalFolder,name),path.join(relocated,name),fs.constants.COPYFILE_EXCL);
  await page.getByLabel('Visible BSP',{exact:true}).selectOption('-1');
  const canvas=page.getByTestId('viewport').locator('canvas');
  const cameraBefore=JSON.parse(await canvas.getAttribute('data-gs-camera-pose'));
  await page.getByRole('button',{name:'Toggle Inspector',exact:true}).click();
  const connection=page.getByRole('region',{name:'Halo Textures',exact:true});
  await connection.getByText('Found resources',{exact:false}).click();
  await connection.getByRole('button',{name:'Check image coverage',exact:true}).click();
  await expect(connection.getByRole('button',{name:'Recheck image coverage',exact:true})).toBeVisible();
  await page.screenshot({path:path.join(output,'resource-image-coverage.png')});
  await connection.getByText('Paste a resource path',{exact:true}).click();
  await connection.getByLabel('Halo Textures path').fill(relocated);
  await page.locator('.world-layout').evaluate(e=>{window.textureTransitions=[];new MutationObserver(()=>window.textureTransitions.push({shaders:e.dataset.sourceShaders,lightmaps:e.dataset.sourceLightmaps})).observe(e,{attributes:true});});
  const rebindStarted=performance.now();
  await connection.getByRole('button',{name:'Verify Halo Textures',exact:true}).click();
  await page.getByLabel('Viewport display mode',{exact:true}).selectOption('wireframe');
  await expect.poll(async()=>((await call('open_project',{id})).project.source.resourceDirectory.replace(/^\\\\\?\\/,''))).toBe(relocated);
  receipt.relocation={viewport:await materials(),elapsedMs:performance.now()-rebindStarted,transitions:await page.evaluate(()=>window.textureTransitions)};
  expect(receipt.relocation.transitions.some(e=>e.shaders==='0')).toBe(true);
  expect(await page.getByLabel('Visible BSP',{exact:true}).inputValue()).toBe('-1');
  const cameraAfter=JSON.parse(await canvas.getAttribute('data-gs-camera-pose'));
  expect(cameraAfter).toEqual(cameraBefore);
  expect(await page.getByLabel('Viewport display mode',{exact:true}).inputValue()).toBe('wireframe');
  receipt.relocation.cameraBspAndDisplayModePreserved=true;console.log('phase: same-pin relocation redrew textures without resetting the view');
  const settled=(await call('open_project',{id})).project;
  expect(settled.tagEdits).toEqual(edits);expect(canonical(settled.scene)).toEqual(scene);expect(settled.source.resourceSha256).toEqual(pins);
  // Wrong sound pin must prevent a seemingly matching bitmap-only recovery.
  const wrong=structuredClone(settled);wrong.source.resourceDirectory=path.join(output,'absent');wrong.source.resourceSha256['sounds.map']='0'.repeat(64);
  await call('save_project',{project:wrong});
  expect((await call('open_project',{id})).project.source.resourceSha256).toEqual(pins);
  receipt.editorSaveCannotOverwritePins=true;
  await stop();await fs.writeFile(projectFile,JSON.stringify(wrong,null,2));await launch();
  expect(await call('auto_connect_classic_textures',{projectId:id})).toBe(null);
  expect((await call('open_project',{id})).project.source.resourceSha256).toEqual(wrong.source.resourceSha256);
  receipt.wrongSoundPinRefused=true;console.log('phase: wrong sound pin refused');
  // The detected MCC file supplies 1/500 external images: never auto bind it.
  const unpinned=structuredClone(settled);unpinned.source.resourceDirectory=path.dirname(partial.path);unpinned.source.resourceSha256={};
  await stop();await fs.writeFile(projectFile,JSON.stringify(unpinned,null,2));await launch();
  expect(await call('auto_connect_classic_textures',{projectId:id})).toBe(null);
  expect((await call('open_project',{id})).project.source.resourceSha256).toEqual({});
  receipt.partialRuntimeAutoSelectionRefused=true;console.log('phase: partial runtime automatic selection refused');
  await stop();await fs.writeFile(projectFile,JSON.stringify(settled,null,2));await launch();
  // Corrupt only the owned QA copy. Embedded images still come from source.
  const copiedBitmap=path.join(relocated,'bitmaps.map');await fs.chmod(copiedBitmap,0o600);
  const handle=await fs.open(copiedBitmap,'r+');const last=(await handle.stat()).size-1,byte=Buffer.alloc(1);await handle.read(byte,0,1,last);byte[0]^=1;await handle.write(byte,0,1,last);await handle.sync();await handle.close();
  const batch=await call('preview_owned_cache_bitmap_batch',{projectId:id,requests:[{bitmapTagId:3793551529,imageIndex:0},{bitmapTagId:3867149580,imageIndex:0}]});
  const external=batch.items.find(e=>e.bitmapTagId===3793551529),embedded=batch.items.find(e=>e.bitmapTagId===3867149580);
  expect(external.preview).toBeFalsy();expect(external.error).toBeTruthy();expect(embedded.preview?.sourceKind).toBe('internal-cache');
  receipt.corruptCopy={externalRefused:true,error:external.error,embeddedImageStillVerified:true};
  // Leave the isolated library bound to its unchanged, genuine original pack.
  await call('connect_halo_textures',{projectId:id,mode:'path',path:path.join(originalFolder,'bitmaps.map')});
  for(const [file,expected] of Object.entries(before))expect(await hash(file)).toBe(expected);
  expect(await hash(recovered.project.source.preservedPath)).toBe(receipt.sourceSha256);
  expect(receipt.errors).toEqual([]);
  receipt.originalInputsAndPreservedMapUnchanged=true;receipt.complete=true;
  await fs.writeFile(path.join(output,'acceptance.json'),JSON.stringify(receipt,null,2));
  console.log(JSON.stringify({complete:true,sourceSha256:receipt.sourceSha256,recovery:receipt.recovery.viewport,candidates:receipt.candidates.map(c=>({reason:c.reason,coverage:c.coverage,error:c.error})),wrongSoundPinRefused:true,partialRuntimeAutoSelectionRefused:true,corruptCopy:receipt.corruptCopy}));
}catch(error){
  if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});
  await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({error:String(error),receipt},null,2));
  throw error;
}finally{await stop();}
