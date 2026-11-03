// Real native event/IPC and owned process counters. No mocked replies or game files.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chromium,expect as assertion} from '@playwright/test';
import {chooseTool} from '../tests/ui/helpers/navigation.ts';
const [application,output,label]=process.argv.slice(2);
if(!application||!output||!label)throw Error('profile-library-refresh-native <embedded exe> <fresh directory> <label>');
const expect=assertion.configure({timeout:45000}),root=path.resolve(output),exec=promisify(execFile);
await fs.mkdir(root);
const app=path.join(root,'GuiltySpark-refresh.exe');await fs.copyFile(path.resolve(application),app,fs.constants.COPYFILE_EXCL);
const report={schemaVersion:1,label,appSha256:crypto.createHash('sha256').update(await fs.readFile(app)).digest('hex'),mockedIpc:false,complete:false,bursts:[],memory:[],errors:[]};
const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
const child=spawn(app,[],{windowsHide:true,stdio:'ignore',env:{...process.env,GUILTY_SPARK_DATA_DIR:path.join(root,'library'),WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
let browser,main;
const pages=()=>browser.contexts().flatMap(c=>c.pages()).filter(p=>p.url().includes('tauri.localhost'));
const invoke=(page,command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
const memory=async name=>report.memory.push({name,...JSON.parse((await exec('pwsh.exe',['-NoProfile','-File',path.resolve('scripts/profile-process-tree.ps1'),'-RootProcessId',String(child.pid)])).stdout)});
try{
  await expect.poll(()=>fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.ok,()=>false)).toBe(true);
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);await expect.poll(()=>pages().length).toBeGreaterThan(0);main=pages()[0];main.on('pageerror',e=>report.errors.push(String(e)));
  const boot=await invoke(main,'bootstrap');await invoke(main,'save_settings',{settings:{...boot.settings,onboardingCompleted:true,autoBuild:false}});
  const created=await invoke(main,'create_quickforge_project',{title:'Refresh and window profiling',template:'smallIndoorArena',target:'haloCustomEdition'}),id=created.project.id;
  await main.reload();await chooseTool(main,'Map library');await main.locator('.map-card').filter({has:main.getByRole('heading',{name:created.project.title,exact:true})}).click();await expect(main.locator('.forge-viewport canvas')).toBeVisible();
  await main.evaluate(()=>{globalThis.__GS_PROFILE__=true;});
  // Each burst uses real native notifications. The final serialized barrier
  // below only waits for quiescence; it does not replace any app IPC response.
  for(let trial=0;trial<3;trial++){
    await main.waitForTimeout(1500);await main.evaluate(()=>performance.clearMeasures());const start=performance.now();
    await main.evaluate(async()=>{await Promise.all(Array.from({length:40},()=>window.__TAURI_INTERNALS__.invoke('plugin:event|emit',{event:'spark:library-changed',payload:null})));});
    await expect.poll(()=>main.evaluate(()=>performance.getEntriesByName('spark.ipc.bootstrap').length)).toBeGreaterThan(0);
    let last=-1,quiet=0;
    for(let n=0;n<120&&quiet<5;n++){await main.waitForTimeout(100);const count=await main.evaluate(()=>performance.getEntriesByName('spark.ipc.bootstrap').length+performance.getEntriesByName('spark.ipc.open_project').length);quiet=count===last?quiet+1:0;last=count;}
    if(quiet<5)throw Error('Native refresh never became quiescent');
    const entries=await main.evaluate(()=>performance.getEntriesByType('measure').filter(e=>['spark.ipc.bootstrap','spark.ipc.open_project'].includes(e.name)).map(e=>({name:e.name,startTime:e.startTime,duration:e.duration})));
    report.bursts.push({trial:trial+1,notifications:40,observedToQuietMs:performance.now()-start,bootstrapReads:entries.filter(e=>e.name==='spark.ipc.bootstrap').length,projectReads:entries.filter(e=>e.name==='spark.ipc.open_project').length,entries});
    const current=await invoke(main,'open_project',{id});expect(current.project.quickForge.geometry).toEqual(created.project.quickForge.geometry);
  }
  await memory('one-window');
  for(let n=0;n<2;n++){
    const prior=new Set(pages());await invoke(main,'open_project_window',{id,workspace:'world',observe:true});let childPage;
    await expect.poll(()=>{childPage=pages().find(p=>!prior.has(p));return !!childPage;}).toBe(true);childPage.on('pageerror',e=>report.errors.push(String(e)));
    await expect(childPage.locator('.forge-viewport canvas')).toBeVisible();
  }
  await main.waitForTimeout(2000);await memory('three-windows');
  for(const page of pages().filter(p=>p!==main)){await page.getByRole('button',{name:'Close window',exact:true}).click();await expect.poll(()=>page.isClosed()).toBe(true);}
  await main.waitForTimeout(2000);await memory('returned-one-window');
  report.nativeGeometryUnchanged=true;
  if(report.errors.length)throw Error(report.errors.join('\n'));
  report.complete=true;console.log(JSON.stringify({label,bursts:report.bursts.map(({entries,...row})=>row),memory:report.memory.map(m=>({name:m.name,workingSetMiB:m.workingSetBytes/1048576,privateMiB:m.privateBytes/1048576,gpuProbeError:m.gpuProbeError}))}));
}finally{await fs.writeFile(path.join(root,'profile.json'),JSON.stringify(report,null,2));await browser?.close().catch(()=>{});child.kill();}
