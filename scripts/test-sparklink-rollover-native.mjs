import { assertQaOutputPath } from './native-qa-storage.mjs';
// Three independent desktop processes, separate libraries, real TLS authority.
// The application's existing opt-in profiler records IPC timing without replacing IPC.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,expect as assertion} from '@playwright/test';
import {openDrawer,openStudioMenu} from '../tests/ui/helpers/navigation.ts';
const [source,destination]=process.argv.slice(2),expect=assertion.configure({timeout:30000});
if(!source||!destination)throw Error('Use test-sparklink-rollover-native <embedded exe> <fresh directory>');
const root=path.resolve(destination);await fs.mkdir(await assertQaOutputPath(root));const actors=[];
const report={schemaVersion:1,physicalMachines:1,nativeProcesses:3,separateLibraries:3,mockedIpc:false,applicationIpcTiming:true,crossComputerTested:false,gameReplicationTested:false,complete:false,cases:[],errors:[]};
const invoke=(a,command,args={})=>a.page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
async function start(name){
  const dir=path.join(root,name);await fs.mkdir(dir);const exe=path.join(dir,'GuiltySpark-rollover.exe');await fs.copyFile(path.resolve(source),exe,fs.constants.COPYFILE_EXCL);
  const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
  const a={name,dir,exe};actors.push(a);a.child=spawn(exe,[],{windowsHide:true,stdio:'ignore',env:{...process.env,GUILTY_SPARK_DATA_DIR:path.join(dir,'library'),WEBVIEW2_USER_DATA_FOLDER:path.join(dir,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
  await expect.poll(()=>fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.ok,()=>false)).toBe(true);a.browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await expect.poll(()=>a.browser.contexts().flatMap(c=>c.pages()).some(p=>p.url().includes('tauri.localhost'))).toBe(true);a.page=a.browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('tauri.localhost'));a.page.on('pageerror',e=>report.errors.push(String(e)));
  const boot=await invoke(a,'bootstrap');await invoke(a,'save_settings',{settings:{...boot.settings,onboardingCompleted:true,autoBuild:false}});
  const created=await invoke(a,'create_quickforge_project',{title:`C59 ${name}`,template:'smallIndoorArena',target:'haloCustomEdition'});a.id=created.project.id;
  await a.page.reload();await a.page.locator('.map-card').filter({has:a.page.getByRole('heading',{name:`C59 ${name}`,exact:true})}).click();await expect(a.page.locator('.runtime-dock-heading>span').first()).toHaveText(`C59 ${name}`);
  await a.page.evaluate(()=>{window.__GS_PROFILE__=true;});
  return a;
}
async function panel(a){
  if(!await a.page.getByRole('button',{name:'Close SparkLink',exact:true}).isVisible())await openStudioMenu(a.page);await a.page.getByRole('button',{name:/Live Studio ·/}).click();
  const panel=a.page.locator('.studio-panel');await expect(panel).toBeVisible();if(!await panel.evaluate(el=>el.open))await panel.locator(':scope>summary').click();return panel;
}
const status=a=>invoke(a,'forge_session_status',{projectId:a.id});
async function join(a,invite){const p=await panel(a);await p.getByLabel('Studio display name',{exact:true}).fill(a.name);await p.getByLabel('Private Spark invite',{exact:true}).fill(invite);await p.getByRole('button',{name:'Join private invite',exact:true}).click();await expect.poll(async()=>!!(await status(a))?.sessionId).toBe(true);}
const view=a=>invoke(a,'forge_session_poll',{projectId:a.id,sessionId:a.session});
function step(name,details={}){report.cases.push({name,...details});console.log(JSON.stringify({passed:name,...details}));}
try{
  const a=await start('owner'),b=await start('editor-b'),c=await start('editor-c');report.appSha256=crypto.createHash('sha256').update(await fs.readFile(a.exe)).digest('hex');
  const p=await panel(a);await p.getByLabel('Studio display name',{exact:true}).fill(a.name);await p.getByLabel('Session network',{exact:true}).selectOption('127.0.0.1');await p.getByRole('button',{name:'Host editing session',exact:true}).click();
  await expect.poll(async()=>!!(await status(a))?.view?.durable).toBe(true);const initial=await status(a);a.session=initial.sessionId;
  const invite=await invoke(a,'forge_session_invite',{projectId:a.id,sessionId:a.session,address:'127.0.0.1',viewer:false});await join(b,invite);await join(c,invite);b.session=c.session=a.session;
  const base=await view(a),next=structuredClone(base.document);next.geometry[0].name='Acknowledged before rollover';
  let committed=await invoke(b,'forge_session_update',{projectId:b.id,sessionId:b.session,revision:base.revision,document:next,operationId:crypto.randomUUID()});
  await expect.poll(async()=> (await Promise.all(actors.map(view))).every(v=>v.revision===committed.revision&&JSON.stringify(v.document)===JSON.stringify(committed.document))).toBe(true);
  await expect.poll(()=>a.page.locator('.studio-panel').innerText()).toContain(`shared revision ${committed.revision}`);
  step('Three actual processes converge on an acknowledged source revision',{revision:committed.revision});
  // Exercise collaboration and detachment together: move the actual host's
  // writer/controller to its Inspector WebView, edit there, then return it.
  const origin=a.page,priorPages=new Set(a.browser.contexts().flatMap(c=>c.pages()));
  await openDrawer(origin,'Build tools');await origin.getByRole('region',{name:'Build tools panel',exact:true}).locator('.forge-tree-select').first().click();
  await openDrawer(origin,'Inspector');const inspector=origin.getByRole('region',{name:'Inspector panel',exact:true});await inspector.getByRole('button',{name:'Properties',exact:true}).click();
  await inspector.getByRole('button',{name:'Detach Inspector',exact:true}).click();
  let detached;await expect.poll(()=>!!(detached=a.browser.contexts().flatMap(c=>c.pages()).find(page=>!priorPages.has(page)&&page.url().includes('tauri.localhost')))).toBe(true);
  detached.on('pageerror',error=>report.errors.push(String(error)));a.page=detached;
  await expect.poll(async()=>(await status(a))?.owned).toBe(true);expect((await invoke({...a,page:origin},'forge_session_status',{projectId:a.id})).owned).toBe(false);
  const properties=detached.getByRole('region',{name:'Inspector panel',exact:true});await properties.getByRole('button',{name:'Properties',exact:true}).click();
  const position=properties.getByRole('spinbutton',{name:'Position X',exact:true}).first();await position.fill('1.75');await position.press('Tab');
  await expect.poll(async()=>(await Promise.all(actors.map(view))).every(v=>v.document.geometry[0].position[0]===1.75)).toBe(true);
  committed=await view(a);await expect.poll(()=>invoke(a,'forge_studio_pending',{projectId:a.id})).toBe(null);
  await detached.getByRole('button',{name:'Return panel to workspace',exact:true}).click();await expect.poll(()=>detached.isClosed()).toBe(true);a.page=origin;
  await expect.poll(async()=>(await status(a))?.owned).toBe(true);await expect.poll(async()=>(await Promise.all(actors.map(view))).every(v=>v.sessionId===a.session&&v.revision===committed.revision&&JSON.stringify(v.document)===JSON.stringify(committed.document))).toBe(true);
  step('An active host detaches its native Inspector, publishes an actual transform to both peer processes and returns the same authority',{nativeProcesses:3,nativeWindowsAtPeak:4,sessionUnchanged:true,revision:committed.revision});
  const button=(await panel(a)).getByRole('button',{name:'New session from this revision',exact:true});await expect(button).toBeEnabled();
  const pending={sessionId:a.session,operationId:crypto.randomUUID(),revision:committed.revision,document:committed.document};
  await invoke(a,'forge_studio_save_pending',{projectId:a.id,pending});await button.click();
  const rejected=a.page.locator('.studio-panel .notice.error').filter({hasText:'Resolve the retained unacknowledged edit'});await expect(rejected).toBeVisible();
  await expect.poll(()=>a.page.evaluate(()=>performance.getEntriesByName('spark.ipc.forge_session_poll').length)).toBeGreaterThan(1);
  await expect(rejected).toBeVisible();expect((await status(a)).sessionId).toBe(initial.sessionId);expect(await invoke(a,'forge_studio_pending',{projectId:a.id})).toEqual(pending);
  await invoke(a,'forge_studio_clear_pending',{projectId:a.id,operationId:pending.operationId});
  step('Rejected rollover retains its pending operation and old authority; successful polls do not erase the actionable error');
  const began=performance.now();await button.click();
  await expect.poll(async()=>(await status(a))?.sessionId).not.toBe(initial.sessionId);
  const rolled=await status(a);expect(rolled.sessionId).not.toBe(initial.sessionId);expect(rolled.view.revision).toBe(0);expect(rolled.view.document).toEqual(committed.document);a.session=rolled.sessionId;
  const rows=await invoke(a,'forge_studio_history',{projectId:a.id});expect(rows.find(row=>row.sessionId===a.session)).toMatchObject({previousSessionId:initial.sessionId,previousRevision:committed.revision});
  for(const guest of [b,c]){await invoke(guest,'forge_session_leave',{projectId:guest.id,sessionId:guest.session});await guest.page.reload();await guest.page.locator('.map-card').filter({has:guest.page.getByRole('heading',{name:`C59 ${guest.name}`,exact:true})}).click();}
  const fresh=await invoke(a,'forge_session_invite',{projectId:a.id,sessionId:a.session,address:'127.0.0.1',viewer:false});await join(b,fresh);await join(c,fresh);b.session=c.session=a.session;
  await expect.poll(async()=> (await Promise.all(actors.map(view))).every(v=>v.sessionId===a.session&&v.revision===0&&JSON.stringify(v.document)===JSON.stringify(committed.document))).toBe(true);
  const recovered=await view(c);expect(recovered.canUndo).toBe(false);expect(recovered.acknowledgedOperations).toBe(0);
  step('UI rollover rotates the authority and three native processes rejoin its exact source',{elapsedMs:performance.now()-began,oldSession:initial.sessionId,session:a.session,oldRevision:committed.revision,newRevision:0,oldHistoryRetained:true,sharedUndoStartsFresh:true});
  expect(report.errors).toEqual([]);report.complete=true;
}catch(error){
  report.error=String(error);report.stack=error.stack;process.exitCode=1;
  // A failed UI run stays failed. Record a direct native error separately to
  // identify whether the rejection is in the UI or the actual authority.
  const owner=actors[0];
  if(owner?.session)report.failedUiNativeDiagnostic=await status(owner).then(current=>invoke(owner,'forge_session_rollover',{projectId:owner.id,sessionId:current.sessionId,revision:current.view.revision,displayName:owner.name})).then(info=>({session:info.sessionId}),reason=>({error:String(reason)}));
}
finally{
  for(const a of actors){if(a.page&&!a.page.isClosed()){await a.page.screenshot({path:path.join(a.dir,report.complete?'accepted.png':'failure.png')}).catch(()=>{});await fs.writeFile(path.join(a.dir,'command-trace.json'),JSON.stringify(await a.page.evaluate(()=>({commands:performance.getEntriesByType('measure').filter(row=>/^spark.ipc.(save_project|commit_workspace_history|forge_session_rollover)$/.test(row.name)).map(row=>({name:row.name,start:row.startTime,duration:row.duration})),notices:[...document.querySelectorAll('.notice.error,.studio-panel>[role="status"]')].map(el=>el.textContent)})).catch(()=>({})),null,2));}await a.browser?.close().catch(()=>{});if(a.child?.exitCode===null)a.child.kill();}
  await fs.writeFile(path.join(root,'acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({complete:report.complete,cases:report.cases.length,error:report.error}));
}
