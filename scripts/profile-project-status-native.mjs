// Native build-status workload on a real owned map. The two explicit read
// contracts return the same build records; only open_project includes geometry.
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chromium,expect as assertion} from '@playwright/test';
import {chooseTool} from '../tests/ui/helpers/navigation.ts';
const [application,destination,input,command,label]=process.argv.slice(2);
if(!label||!['open_project','project_build_history'].includes(command))throw Error('profile-project-status-native <app> <fresh output> <owned map> <open_project|project_build_history> <label>');
const root=path.resolve(destination),file=path.resolve(input),expect=assertion.configure({timeout:90000}),exec=promisify(execFile),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
await fs.mkdir(root);const app=path.join(root,'GuiltySpark-project-status.exe');await fs.copyFile(path.resolve(application),app,fs.constants.COPYFILE_EXCL);
const report={schemaVersion:1,label,appSha256:hash(await fs.readFile(app)),sourceSha256:hash(await fs.readFile(file)),readCommand:command,roundTrips:[],bursts:[],memory:[],mockedIpc:false,gameplayVerified:false,complete:false,errors:[]};
const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const child=spawn(app,[],{windowsHide:true,stdio:'ignore',env:{...process.env,GUILTY_SPARK_DATA_DIR:path.join(root,'library'),WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
let browser,page;
const call=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
const memory=async name=>report.memory.push({name,...JSON.parse((await exec('pwsh.exe',['-NoProfile','-File',path.resolve('scripts/profile-process-tree.ps1'),'-RootProcessId',String(child.pid)])).stdout)});
try{
  await expect.poll(()=>fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.ok,()=>false)).toBe(true);browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await expect.poll(()=>{page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('tauri.localhost'));return !!page;}).toBe(true);page.on('pageerror',e=>report.errors.push(String(e)));
  const boot=await call('bootstrap');await call('save_settings',{settings:{...boot.settings,onboardingCompleted:true,autoBuild:false}});
  const imported=await page.evaluate(async file=>{const o=(await window.__TAURI_INTERNALS__.invoke('import_paths',{paths:[file]}))[0];o.project.title='Native status workload';await window.__TAURI_INTERNALS__.invoke('save_project',{project:o.project});return{id:o.project.id,sha256:o.project.source.sha256};},file);
  expect(imported.sha256).toBe(report.sourceSha256);await page.reload();await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Native status workload',exact:true})}).click();await chooseTool(page,'Preservation record');
  await page.waitForTimeout(2000);await page.evaluate(()=>{globalThis.__GS_PROFILE__=true;});
  for(let sample=0;sample<10;sample++){
    const row=await page.evaluate(async({command,id})=>{
      const began=performance.now(),value=await window.__TAURI_INTERNALS__.invoke(command,{id}),roundTripMs=performance.now()-began;
      const encodeAt=performance.now(),bytes=new TextEncoder().encode(JSON.stringify(value)).length,serializeMs=performance.now()-encodeAt;
      return{roundTripMs,serializeMs,bytes,projectId:value.projectId??value.project?.id,sourceSha256:value.sourceSha256??value.project?.source?.sha256,builds:value.builds??value.project?.builds,includesInspection:!!value.inspection};
    },{command,id:imported.id});
    expect(row.projectId).toBe(imported.id);expect(row.sourceSha256).toBe(report.sourceSha256);expect(Array.isArray(row.builds)).toBe(true);row.buildsSha256=hash(Buffer.from(JSON.stringify(row.builds)));delete row.builds;
    report.roundTrips.push({sample,warmup:sample<2,...row});
  }
  await memory('before-notifications');
  for(let trial=0;trial<3;trial++){
    await page.waitForTimeout(1000);await page.evaluate(()=>performance.clearMeasures());const began=performance.now();
    await page.evaluate(()=>Promise.all(Array.from({length:40},()=>window.__TAURI_INTERNALS__.invoke('plugin:event|emit',{event:'spark:library-changed',payload:null}))));
    await expect.poll(()=>page.evaluate(()=>performance.getEntriesByName('spark.ipc.bootstrap').length)).toBeGreaterThan(0);
    let last=-1,quiet=0;
    for(let n=0;n<150&&quiet<5;n++){await page.waitForTimeout(100);const count=await page.evaluate(()=>performance.getEntriesByType('measure').length);quiet=count===last?quiet+1:0;last=count;}
    if(quiet<5)throw Error('Project-status workload did not settle');
    const entries=await page.evaluate(()=>performance.getEntriesByType('measure').map(e=>({name:e.name,duration:e.duration})));
    report.bursts.push({trial:trial+1,notifications:40,observedToQuietMs:performance.now()-began,bootstrapReads:entries.filter(e=>e.name==='spark.ipc.bootstrap').length,fullProjectReads:entries.filter(e=>e.name==='spark.ipc.open_project').length,buildMetadataReads:entries.filter(e=>e.name==='spark.ipc.project_build_history').length});
  }
  await memory('after-notifications');
  expect(hash(await fs.readFile(file))).toBe(report.sourceSha256);report.originalMapUnchanged=true;
  if(report.errors.length)throw Error(report.errors.join('\n'));report.complete=true;
  console.log(JSON.stringify({complete:true,label,readCommand:command,roundTrips:report.roundTrips.map(({buildsSha256,...r})=>r),bursts:report.bursts}));
}finally{await fs.writeFile(path.join(root,'profile.json'),JSON.stringify(report,null,2));await browser?.close().catch(()=>{});child.kill();}
