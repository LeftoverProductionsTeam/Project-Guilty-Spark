// Opt-in Windows desktop checks with real owned map/collision/GPU/native windows.
// This does not launch Halo or certify gameplay, shader parity or game physics.
import {chromium,expect as assertion} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {spawn} from 'node:child_process';
const expect=assertion.configure({timeout:45000}),args=new Map();
for(let i=2;i<process.argv.length;i+=2){if(!['--app','--root','--map','--classic-map'].includes(process.argv[i])||!process.argv[i+1]||args.has(process.argv[i]))throw Error('Use unique named local file arguments');args.set(process.argv[i],path.resolve(process.argv[i+1]));}
if(!args.has('--app')||!args.has('--root')||!args.has('--map'))throw Error('app, root and owned MCC map are required');
const output=path.join(args.get('--root'),'run-'+new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(output,{recursive:true});const data=path.join(output,'library');await fs.mkdir(data);
const hash=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const originalHash=await hash(args.get('--map')),receipt={schemaVersion:1,mockedIpc:false,gameLaunched:false,gameplayTested:false,acceptanceComplete:false,appSha256:await hash(args.get('--app')),mapSha256:originalHash},errors=[];
const mark=async(key,value)=>{receipt[key]=value;await fs.writeFile(path.join(output,'partial-receipt.json'),JSON.stringify(receipt,null,2));console.log(key,JSON.stringify(value));};
const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
const exe=path.join(output,'GuiltySpark-editor-qa.exe');await fs.copyFile(args.get('--app'),exe,fs.constants.COPYFILE_EXCL);
const child=spawn(exe,[],{windowsHide:true,stdio:'ignore',env:{...process.env,GUILTY_SPARK_DATA_DIR:data,WEBVIEW2_USER_DATA_FOLDER:path.join(output,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
let browser,page,call;
async function navigate(name){const toggle=page.getByRole('button',{name:'Toggle workspace navigation',exact:true});if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();await page.locator('#gs-workspace-navigation').getByRole('button',{name,exact:true}).click();}
async function openedPage(previous,query){await expect.poll(()=>browser.contexts().flatMap(c=>c.pages()).filter(p=>!previous.includes(p)&&p.url().includes(query)).length).toBe(1);return browser.contexts().flatMap(c=>c.pages()).find(p=>!previous.includes(p)&&p.url().includes(query));}
try{
  await expect.poll(()=>fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.ok,()=>false)).toBe(true);
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await expect.poll(()=>browser.contexts().flatMap(c=>c.pages()).some(p=>p.url().includes('tauri.localhost'))).toBe(true);
  page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('tauri.localhost'));page.on('pageerror',e=>errors.push(String(e)));
  await expect.poll(()=>page.evaluate(()=>!!window.__TAURI_INTERNALS__?.invoke)).toBe(true);
  call=(command,a={})=>page.evaluate(({command,a})=>window.__TAURI_INTERNALS__.invoke(command,a),{command,a});
  const boot=await call('bootstrap');await call('save_settings',{settings:{...boot.settings,onboardingCompleted:true,autoBuild:false}});
  const imported=await call('import_paths',{paths:[args.get('--map')]}),owned=imported.find(open=>open.inspection.header.version===13);expect(owned).toBeTruthy();
  await page.reload();await page.locator('.map-card').filter({has:page.getByRole('heading',{name:owned.project.title,exact:true})}).click();
  await expect(page.locator('.world-layout')).toBeVisible();await expect(page.getByTestId('viewport').locator('canvas')).toBeVisible();
  const object=owned.project.scene.find(o=>owned.inspection.tags.some(t=>t.id===o.tagId&&t.class==='scen'&&t.path.replaceAll('\\','/')==='scenery/rocks/boulder/boulder'));expect(object).toBeTruthy();
  const collider=await call('preview_owned_object_collision',{projectId:owned.project.id,sourceSha256:owned.project.source.sha256,tagId:object.tagId});expect(collider.indices.length).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Toggle Objects',exact:true}).click();await page.locator('.object-list .object-row').nth(owned.project.scene.findIndex(o=>o.id===object.id)).locator('.object-name').click();
  await page.getByRole('button',{name:'Toggle Inspector',exact:true}).click();const z=page.locator('input[aria-label="position 2"]'),originalZ=Number(await z.inputValue()),raised=originalZ+12;
  await z.fill(String(raised));await z.press('Tab');await page.getByRole('button',{name:'Toggle Inspector',exact:true}).click();await page.keyboard.press('End');
  await expect.poll(async()=>Number(await z.inputValue())).toBeLessThan(raised-5);const snapped=Number(await z.inputValue());expect(Math.abs(snapped-originalZ)).toBeLessThan(5);
  await page.keyboard.press('Control+z');await expect.poll(async()=>Number(await z.inputValue())).toBeCloseTo(raised,5);
  await page.keyboard.press('Control+y');await expect.poll(async()=>Number(await z.inputValue())).toBeCloseTo(snapped,5);
  await page.keyboard.press('Control+z');await page.keyboard.press('Control+z');await expect.poll(async()=>Number(await z.inputValue())).toBeCloseTo(originalZ,5);
  await mark('endToFloorAndHistory',{nativeBspTriangles:owned.inspection.mesh.indices.length/3,nativeObjectCollisionTriangles:collider.indices.length/3,originalZ,raised,snapped,singleUndoRestoresRaised:true,redoRestoresSnapped:true});
  await page.getByRole('button',{name:'Toggle Inspector',exact:true}).click();await page.locator('.gs-render-features > summary').click();
  const scale=page.getByRole('slider',{name:'Viewport resolution scale',exact:true}),canvas=page.getByTestId('viewport').locator('canvas');
  await scale.focus();await scale.press('Home');await expect(scale).toHaveValue('0.5');const low=await canvas.evaluate(c=>({width:c.width,height:c.height,pose:c.dataset.gsCameraPose}));
  for(let i=0;i<10;i++)await scale.press('ArrowRight');await expect(scale).toHaveValue('1.5');await expect.poll(()=>canvas.evaluate(c=>c.width)).toBeGreaterThan(low.width*2);
  const high=await canvas.evaluate(c=>({width:c.width,height:c.height,pose:c.dataset.gsCameraPose,aa:(c.getContext('webgl2')??c.getContext('webgl')).getContextAttributes().antialias}));
  const previousCanvas=await canvas.elementHandle();
  await page.getByRole('checkbox',{name:'Anti-aliasing',exact:true}).uncheck();
  await expect.poll(()=>previousCanvas.evaluate(c=>c.isConnected)).toBe(false);
  // Wait for the application's own first frame. Calling getContext on a fresh
  // canvas earlier would create a default context and invalidate the test.
  await expect.poll(()=>canvas.getAttribute('data-gs-camera-pose')).not.toBeNull();
  expect(await canvas.evaluate(c=>(c.getContext('webgl2')??c.getContext('webgl')).getContextAttributes().antialias)).toBe(false);
  const poseAfter=JSON.parse(await canvas.getAttribute('data-gs-camera-pose'));const poseBefore=JSON.parse(high.pose);for(let i=0;i<3;i++)expect(poseAfter.position[i]).toBeCloseTo(poseBefore.position[i],3);
  await mark('nativeRendererControls',{low,high,antiAliasDisabledInRealContext:true,cameraRetained:true});
  await navigate('Modding Academy');let previous=browser.contexts().flatMap(c=>c.pages());await page.getByRole('button',{name:'Pop out lesson',exact:true}).click();
  const lesson=await openedPage(previous,'workspace=academy');await expect(lesson.locator('.gs-academy')).toBeVisible();await expect(lesson.getByRole('group',{name:'Window controls'}).getByRole('button')).toHaveCount(3);
  expect(await lesson.evaluate(()=>window.__TAURI_INTERNALS__.invoke('plugin:window|is_fullscreen'))).toBe(false);await lesson.getByRole('button',{name:'Close window',exact:true}).click();await expect.poll(()=>lesson.isClosed()).toBe(true);await expect(page.locator('.gs-academy')).toBeVisible();await mark('tutorialWindow',{separateWebview:true,nativeWindowControlsAllowed:true,parentWorkspaceRetained:true});
  await navigate('Level editor');await expect(page.locator('.world-layout')).toBeVisible();previous=browser.contexts().flatMap(c=>c.pages());await page.getByRole('button',{name:'Pop out workspace',exact:true}).click();
  const editor=await openedPage(previous,'project=');await expect(editor.locator('.world-layout')).toBeVisible();await expect(editor.getByRole('tab',{name:owned.project.title,exact:true})).toBeVisible();await expect(page.getByRole('tab',{name:owned.project.title,exact:true})).toHaveCount(0);
  await expect(call('claim_project_document',{id:owned.project.id})).rejects.toThrow(/another Spark window/i);await editor.getByRole('button',{name:'Close window',exact:true}).click();await expect.poll(()=>editor.isClosed()).toBe(true);await mark('mapWorkspacePopout',{savedBeforeMove:true,correctWorkspace:true,singleWriterOwnershipRetained:true});
  if(args.has('--classic-map')){
    const classicHash=await hash(args.get('--classic-map')),opens=await call('import_paths',{paths:[args.get('--classic-map')]});const classic=opens[0];await call('claim_project_document',{id:classic.project.id});
    const candidates=await call('bitmap_resource_candidates',{projectId:classic.project.id});const connected=await call('auto_connect_classic_textures',{projectId:classic.project.id});expect(connected?.project.source.resourceSha256['bitmaps.map']).toMatch(/^[a-f0-9]{64}$/);
    expect(await hash(args.get('--classic-map'))).toBe(classicHash);await mark('classicResourceDiscovery',{sourceSha256:classicHash,cacheVersion:classic.inspection.header.version,candidateCount:candidates.length,resourceSha256:connected.project.source.resourceSha256['bitmaps.map'],compatibleInstalledResourceFound:true});
    await page.reload();await navigate('Map library');
    const hero=page.locator('.library-hero'),heroBounds=await hero.boundingBox();for(const action of await hero.getByRole('button').all()){const bounds=await action.boundingBox();expect(bounds.y+bounds.height).toBeLessThanOrEqual(heroBounds.y+heroBounds.height);}
    await page.screenshot({path:path.join(output,'compact-library.png')});
    await page.locator('.map-card').filter({has:page.getByText(`CACHE ${classic.inspection.header.version}`,{exact:true})}).click();
    const world=page.locator('.world-layout');await expect(world).toBeVisible();
    const expected=[...new Set((classic.inspection.renderMesh?.materialRanges??[]).map(range=>range.shaderTagId))].filter(id=>classic.inspection.tags.find(tag=>tag.id===id)?.references.some(ref=>/^(base map|diffuse map)$/i.test(ref.label)&&ref.targetId!=null));
    expect(expected.length).toBeGreaterThan(0);
    await expect.poll(async()=>{const loaded=(await world.getAttribute('data-source-shader-ids')??'').split(',').map(Number);return expected.every(id=>loaded.includes(id));},{timeout:120000,intervals:[1000]}).toBe(true);
    await mark('classicRenderedTextures',{bspPrimaryShaderCount:expected.length,allExpectedBspPrimaryTexturesLoaded:true,totalShaderTextures:Number(await world.getAttribute('data-source-shaders')),lightmapPages:Number(await world.getAttribute('data-source-lightmaps')),detailTextures:Number(await world.getAttribute('data-source-details')),completeShaderParityClaimed:false});
  }
  expect(await hash(args.get('--map'))).toBe(originalHash);expect(errors).toEqual([]);receipt.pageErrors=errors;receipt.originalMapUnchanged=true;receipt.acceptanceComplete=true;
  await page.screenshot({path:path.join(output,'editor-controls.png')});await fs.writeFile(path.join(output,'editor-controls-native-receipt.json'),JSON.stringify(receipt,null,2));console.log('PASS real native editor controls and independent workspace windows');
}catch(error){receipt.error=String(error);receipt.stack=error.stack;receipt.pageErrors=errors;if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(output,'failure.json'),JSON.stringify(receipt,null,2));throw error;}
finally{if(child.exitCode===null)child.kill();if(browser)await browser.close().catch(()=>{});}
