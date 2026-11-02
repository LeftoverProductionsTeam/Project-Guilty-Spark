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
await fs.mkdir(root);const exe=path.join(root,'GuiltySpark-native-functionality.exe');await fs.copyFile(path.resolve(appArg),exe,fs.constants.COPYFILE_EXCL);
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
  result.worldMs=performance.now()-began;result.world=await world.evaluate(e=>({...e.dataset}));
  await page.screenshot({path:path.join(root,`world-${i}.png`)});
  const worldCanvas=world.locator('canvas');await worldCanvas.evaluate(e=>e.dataset.qaRetained='native-c53');
  const wanted=entry.models.map(pattern=>{const tag=o.inspection.tags.find(t=>['scen','vehi','bipd','eqip','itmc','mod2','mode'].includes(t.class)&&new RegExp(pattern,'i').test(t.path));expect(tag,`Missing requested native model ${pattern}`).toBeTruthy();return tag;});
  for(const tag of wanted){
   await selectTag(o,tag);const preview=page.locator('.tag-model-preview .native-model-preview');await expect(preview).toHaveAttribute('data-model-tag',String(tag.id));
   await expect(preview).toHaveAttribute('data-model-ready','true');const canvas=preview.locator('canvas');await expect(canvas).toBeVisible();
   const observation={path:tag.path,id:tag.id,...await preview.evaluate(e=>({...e.dataset}))};
   await expect.poll(async()=>Number(await preview.getAttribute('data-model-textures')),'Representative native models must have actual source textures').toBeGreaterThan(0);
   Object.assign(observation,await preview.evaluate(e=>({...e.dataset})));
   const info=await page.locator('.tag-properties-pane').boundingBox(),modelBounds=await preview.boundingBox();
   expect(modelBounds.x).toBeGreaterThanOrEqual(info.x+info.width-1);expect(modelBounds.height).toBeGreaterThan(350);
   observation.layout={info,model:modelBounds};
   const pose=await canvas.getAttribute('data-gs-preview-camera'),rect=await canvas.boundingBox();
   await page.mouse.move(rect.x+rect.width*.55,rect.y+rect.height*.55);await page.mouse.down();await page.mouse.move(rect.x+rect.width*.55+75,rect.y+rect.height*.55+20,{steps:10});await page.mouse.up();
   await expect.poll(()=>canvas.getAttribute('data-gs-preview-camera')).not.toBe(pose);observation.orbit=true;
   const orbit=await canvas.getAttribute('data-gs-preview-camera');await page.mouse.wheel(0,-300);await expect.poll(()=>canvas.getAttribute('data-gs-preview-camera')).not.toBe(orbit);observation.zoom=true;
   await page.getByRole('button',{name:'Fit / Reset',exact:true}).click();observation.fitted=JSON.parse(await canvas.getAttribute('data-gs-preview-camera'));
   await preview.screenshot({path:path.join(root,`model-${i}-${tag.id}.png`)});
   await page.screenshot({path:path.join(root,`tag-workspace-${i}-${tag.id}.png`)});result.models.push(observation);
  }
  await choose('Level editor');await expect(page.locator('.world-layout:visible canvas')).toHaveAttribute('data-qa-retained','native-c53');result.worldRetained=true;
  if(entry.sound){
   const tag=o.inspection.tags.find(t=>t.class==='snd!'&&new RegExp(entry.sound,'i').test(t.path));expect(tag,'An actual requested source sound is required').toBeTruthy();
   await selectTag(o,tag);const sound=page.locator('.sound-inspector');await expect(sound.getByRole('button',{name:'Play sample',exact:true})).toBeVisible();
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
  }
  expect(await hash(entry.path)).toBe(result.sourceSha256);
 }
 expect(report.errors).toEqual([]);report.complete=true;
}catch(error){report.error=String(error);report.stack=error.stack;process.exitCode=1;await page?.screenshot({path:path.join(root,'failure.png')}).catch(()=>{});}
finally{await fs.writeFile(path.join(root,'acceptance.json'),JSON.stringify(report,null,2));await browser?.close().catch(()=>{});if(child.exitCode===null)child.kill();console.log(JSON.stringify({complete:report.complete,maps:report.maps.map(m=>({name:m.name,models:m.models.length,samples:m.samples.length})),error:report.error}));}
