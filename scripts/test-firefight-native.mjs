// Real embedded Windows application + owner-installed native Halo toolchain.
// Fixture setup is source authoring. Preparation, history, Save, restart and
// Build actions use visible controls; IPC below reads state, not simulated game.
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {createReadStream} from 'node:fs';
import {spawn,execFile} from 'node:child_process';
import {chromium,expect as assertion} from '@playwright/test';
import {chooseTool,openMissionBeats,openStudioMenu,openDrawer,revealPagedControl} from '../tests/ui/helpers/navigation.ts';
import {assertQaOutputPath,withDevelopmentWorkspace,waitForQaExit,stopQaProcess} from './native-qa-storage.mjs';
import {nativeStandaloneBaseline} from './native-standalone-baseline.mjs';
import {campaignEncounterStarts} from '../src/nativeOperations.ts';
import {sameCinematicData} from '../src/haloScript.ts';
const [appArg,outputArg,kitArg,archiveArg,invaderArg]=process.argv.slice(2);
if(!invaderArg)throw Error('test-firefight-native <source-matched app> <fresh output> <owned H1A kit> <owned SDK archive> <Invader>');
const app=path.resolve(appArg),output=path.resolve(outputArg),kit=path.resolve(kitArg),archive=path.resolve(archiveArg),invader=path.resolve(invaderArg);
const ceMissionReview=process.env.SPARK_NATIVE_CE_MISSION_REVIEW==='1';
const ceMissionHudReview=process.env.SPARK_NATIVE_CE_MISSION_HUD_REVIEW==='1';
const cePatrolReview=process.env.SPARK_NATIVE_CE_MISSION_PATROL_REVIEW==='1';
const ceVolumeReview=process.env.SPARK_NATIVE_CE_MISSION_VOLUME_REVIEW==='1';
const ceDeviceReview=process.env.SPARK_NATIVE_CE_MISSION_DEVICE_REVIEW==='1';
if(ceDeviceReview&&(!ceMissionReview||ceMissionHudReview||ceVolumeReview||cePatrolReview||process.env.SPARK_NATIVE_CE_MISSION_CAMERA_REVIEW==='1'||process.env.SPARK_NATIVE_CE_MISSION_COMMAND_REVIEW==='1'||process.env.SPARK_NATIVE_CE_MISSION_CINEMATIC_REVIEW==='1'||process.env.SPARK_NATIVE_CE_MISSION_RESUME))throw Error('Device placement requires a fresh isolated CE source workflow');
if(ceVolumeReview&&(!ceMissionReview||ceMissionHudReview||cePatrolReview||process.env.SPARK_NATIVE_CE_MISSION_CAMERA_REVIEW==='1'||process.env.SPARK_NATIVE_CE_MISSION_COMMAND_REVIEW==='1'||process.env.SPARK_NATIVE_CE_MISSION_CINEMATIC_REVIEW==='1'))throw Error('Trigger geometry uses its isolated CE source variant');
const ceCameraReview=process.env.SPARK_NATIVE_CE_MISSION_CAMERA_REVIEW==='1';
const ceCinematicReview=process.env.SPARK_NATIVE_CE_MISSION_CINEMATIC_REVIEW==='1';
const ceCinematicTriggerReview=process.env.SPARK_NATIVE_CE_MISSION_CINEMATIC_TRIGGER_REVIEW==='1';
if(ceCinematicTriggerReview&&(!ceCinematicReview||process.env.SPARK_NATIVE_CE_MISSION_RESUME))throw Error('Cinematic area trigger acceptance requires the fresh isolated cinematic source workflow');
if(ceCinematicReview&&(!ceMissionReview||ceCameraReview||ceMissionHudReview||cePatrolReview||process.env.SPARK_NATIVE_CE_MISSION_COMMAND_REVIEW==='1'))throw Error('Timed cinematic requires its isolated CE source variant');
if(ceCameraReview&&(!ceMissionReview||ceMissionHudReview||cePatrolReview||process.env.SPARK_NATIVE_CE_MISSION_COMMAND_REVIEW==='1'))throw Error('Recovered camera review requires its isolated CE source variant');
const ceCommandReview=process.env.SPARK_NATIVE_CE_MISSION_COMMAND_REVIEW==='1';
const ceCommandContentReview=process.env.SPARK_NATIVE_CE_MISSION_COMMAND_CONTENT_REVIEW==='1';
if(ceCommandContentReview&&!ceCommandReview)throw Error('Command contents require a fresh isolated command binding workflow');
if(ceCommandReview&&(!ceMissionReview||ceMissionHudReview||cePatrolReview))throw Error('Recovered command binding requires its isolated CE source variant');
if(cePatrolReview&&(!ceMissionReview||ceMissionHudReview))throw Error('Recovered patrol review uses its isolated CE source variant');
if(ceMissionHudReview&&!ceMissionReview)throw Error('Campaign HUD native UI requires the CE mission review');
const ceMissionHudSteps=[
 {
  "title": "Deployment",
  "marker": "awaiting deployment terminal",
  "text": "Use the deployment terminal to begin Operation Black Echo."
 },
 {
  "title": "Marine rescue",
  "marker": "native hostile encounter active",
  "text": "Reach the Marines and eliminate the facility defenders."
 },
 {
  "title": "Technology recovery",
  "marker": "collect classified technology",
  "text": "Recover the classified technology. Keep the Marines alive."
 },
 {
  "title": "Flood outbreak",
  "marker": "optional flood outbreak active",
  "text": "Contain the Flood outbreak before evacuation."
 },
 {
  "title": "Extraction defense",
  "marker": "defend extraction",
  "text": "Defend the extraction point."
 },
 {
  "title": "Return to hub",
  "marker": "activate extraction and return to hub",
  "text": "Activate extraction and return all survivors to the hub."
 },
 {
  "title": "Operation complete",
  "marker": "equipment banked and survivors returned",
  "text": "Equipment banked. Survivors extracted. Redeployment is available."
 }
];
const blackEchoReview=process.env.SPARK_NATIVE_BLACK_ECHO_REVIEW==='1',marineTag='characters/marine_armored/marine_armored assault rifle',floodTag='characters/floodcombat_human/floodcombat_human assault rifle';
const blackEchoCombatReview=process.env.SPARK_NATIVE_BLACK_ECHO_COMBAT_REVIEW==='1';
if(ceMissionReview&&(blackEchoReview||process.env.SPARK_FIREFIGHT_GAME_REVIEW==='1'||process.env.SPARK_NATIVE_AI_START_REVIEW==='1'))throw Error('CE source mission review is isolated and never launches a game');
if(blackEchoCombatReview&&!blackEchoReview)throw Error('Native combat authoring requires Black Echo workflow');
const blackEchoPatrolReview=process.env.SPARK_NATIVE_BLACK_ECHO_PATROL_REVIEW==='1';
if(blackEchoPatrolReview&&!blackEchoReview)throw Error('Native patrol authoring requires Black Echo workflow');
const blackEchoStartReview=process.env.SPARK_NATIVE_BLACK_ECHO_START_REVIEW==='1';
if(blackEchoStartReview&&!blackEchoReview)throw Error('Native authored poses require the Black Echo workflow');
const blackEchoDifficultyReview=process.env.SPARK_NATIVE_BLACK_ECHO_DIFFICULTY_REVIEW==='1';
if(blackEchoDifficultyReview&&!blackEchoReview)throw Error('Native campaign population review requires the Black Echo workflow');
const blackEchoIntroReview=process.env.SPARK_NATIVE_BLACK_ECHO_INTRO_REVIEW==='1';
const blackEchoSceneReview=process.env.SPARK_NATIVE_BLACK_ECHO_SCENE_REVIEW==='1';
const blackEchoStoryReview=blackEchoIntroReview||blackEchoSceneReview;
const blackEchoCameraReview=process.env.SPARK_NATIVE_BLACK_ECHO_CAMERA_REVIEW==='1'||blackEchoStoryReview;
if(blackEchoCameraReview&&!blackEchoReview)throw Error('The native camera variant requires the Black Echo native authoring workflow.');
const saveOnly=process.env.SPARK_NATIVE_WORKSHOP_SAVE_ONLY==='1',terminalReview=process.env.SPARK_NATIVE_TERMINAL_REVIEW==='1',controlTag='levels/b40/devices/holo control/b40_holo control';
if(blackEchoReview&&(terminalReview||saveOnly||process.env.SPARK_NATIVE_AI_START_RESUME||process.env.SPARK_FIREFIGHT_ENCOUNTER_REVIEW==='1'||process.env.SPARK_FIREFIGHT_GAME_REVIEW==='1'))throw Error('Run Black Echo native authoring separately from other feature variants.');
if(process.env.SPARK_NATIVE_AI_START_REVIEW==='1'&&(blackEchoReview||terminalReview||process.env.SPARK_FIREFIGHT_ENCOUNTER_REVIEW==='1'||process.env.SPARK_FIREFIGHT_GAME_REVIEW==='1'))throw Error('Run the recovered-start UI variant separately from terminal, append and game variants.');
const aiBehaviorReview=process.env.SPARK_NATIVE_AI_BEHAVIOR_REVIEW==='1';
if(aiBehaviorReview&&process.env.SPARK_NATIVE_AI_START_REVIEW!=='1')throw Error('Native behavior review requires the recovered-source workflow');
const aiCombatReview=process.env.SPARK_NATIVE_AI_COMBAT_REVIEW==='1';
if(aiCombatReview&&process.env.SPARK_NATIVE_AI_START_REVIEW!=='1')throw Error('Native firing/tactics review requires the recovered-source workflow');
const aiFacingReview=process.env.SPARK_NATIVE_AI_FACING_REVIEW==='1';
if(aiFacingReview&&process.env.SPARK_NATIVE_AI_START_REVIEW!=='1')throw Error('Native facing review requires the original AI start source workflow');
const expect=assertion.configure({timeout:60000});
const hash=async file=>{const digest=crypto.createHash('sha256');for await(const b of createReadStream(file))digest.update(b);return digest.digest('hex');};
await fs.mkdir(await assertQaOutputPath(output));
const missionSaveStress=process.env.SPARK_NATIVE_MISSION_SAVE_STRESS==='1';
if(missionSaveStress&&(!saveOnly||ceMissionReview))throw Error('Mission Save stress requires the isolated no-SDK Save workflow');
const report={scope:missionSaveStress?'native-seven-objective-save-stress':saveOnly?'native-workshop-immediate-save-only':'native-solo-creator',schemaVersion:1,complete:false,mockedIpc:false,gameplayVerified:false,appSha256:await hash(app),sourcePreparation:{},errors:[],normalRestarts:0};
let browser,page,child,call;
try{await withDevelopmentWorkspace('firefight-native-ui',async context=>{
 const fixtureRoot=path.join(output,'native-fixture');await fs.mkdir(fixtureRoot);
 const exercise=async ({root:sourceRoot,drive,run,tags})=>{
   const resumeFile=ceMissionReview?process.env.SPARK_NATIVE_CE_MISSION_RESUME:process.env.SPARK_NATIVE_AI_START_RESUME;
   let prior;
   if(resumeFile){
    if((!ceMissionReview&&process.env.SPARK_NATIVE_AI_START_REVIEW!=='1')||saveOnly)throw Error('Resume requires its matching native source workflow');
    await assertQaOutputPath(resumeFile,{reservationBytes:0});const info=await fs.lstat(resumeFile);
    if(!info.isFile()||info.isSymbolicLink()||info.size>2*1024**2)throw Error('Invalid recovered-start continuation receipt');
    prior=JSON.parse(await fs.readFile(resumeFile,'utf8'));
    if(ceMissionReview){const mission=prior.ceMission,commandRecovery=ceCommandContentReview&&mission?.stage==='edit native command contents'&&mission.nativeCommandContents?.restoreReaccept===true&&mission.nativeCommandContents.afterSha256===mission.acceptedSourceSha256,compiledStage=mission?.stage==='compile reviewed mission and accepted AI',cinematicRecovery=ceCinematicReview&&mission?.stage==='compile timed cinematic first'&&(prior.normalRestarts>=3||mission?.cinematic?.first?.compiledIndependentReadback===true)&&typeof prior.failedNativeJobId==='string',hudRecovery=ceMissionHudReview&&mission?.stage==='author campaign HUD through Creator Studio'&&(prior.saveFailure?.projectId===mission.projectId||!prior.saveFailure&&mission.hud?.messages?.length===7&&String(prior.error).includes('native-script-attachment'));if(prior.complete||prior.errors?.length||(!commandRecovery&&!compiledStage&&!hudRecovery&&!cinematicRecovery&&mission?.stage!=='edit reviewed mission module')||!mission?.acceptedSourceSha256||mission.parent?.status!=='validated'||prior.normalRestarts<1||(compiledStage&&(!mission.saveRestart||prior.normalRestarts<2||! /^[a-f0-9]{64}$/.test(mission.projectDraftSha256??''))))throw Error('CE continuation lacks its actual saved edit, successful restart and complete source build');}
    else if(prior.complete||prior.errors?.length||prior.originalAiStart?.stage!=='build accepted native starts'||!prior.sourcePreparation?.originalInputsUnchanged||prior.normalRestarts<2)throw Error('Continuation lacks the completed UI/source/restart gate');
   }
   const resumedRoot=prior?.ceMission?.resumedFrom?path.dirname(prior.ceMission.resumedFrom):prior?path.dirname(resumeFile):output;await assertQaOutputPath(resumedRoot,{reservationBytes:0});const library=path.join(resumedRoot,'library'),webview=path.join(resumedRoot,'webview');
   async function start(){
    const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
    const log=await fs.open(path.join(output,'native-ipc-'+report.normalRestarts+'.log'),'wx');
    try{child=spawn(app,[],{windowsHide:true,stdio:['ignore',log.fd,log.fd],env:{...context.env,SPARK_DIAGNOSTICS_IPC_TIMING:'1',GUILTY_SPARK_DATA_DIR:library,WEBVIEW2_USER_DATA_FOLDER:webview,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port='+port}});}finally{await log.close();}
    await context.trackProcess(child);
    await expect.poll(()=>fetch('http://127.0.0.1:'+port+'/json/version').then(r=>r.ok,()=>false)).toBe(true);
    browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
    await expect.poll(()=>browser.contexts().flatMap(c=>c.pages()).some(p=>p.url().includes('tauri.localhost'))).toBe(true);
    page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('tauri.localhost'));
    page.on('pageerror',error=>report.errors.push(String(error)));
    call=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
   }
   async function close(){
    await page.getByRole('button',{name:'Close window',exact:true}).click();
    const saveChanges=page.getByRole('dialog',{name:'Save changes before closing?',exact:true}).getByRole('button',{name:'Save changes',exact:true});await expect.poll(async()=>child.exitCode!==null||child.signalCode!==null?'exited':await saveChanges.isVisible().catch(()=>false)?'save':'waiting').not.toBe('waiting');if(child.exitCode===null&&child.signalCode===null&&await saveChanges.isVisible())await saveChanges.click();
    await waitForQaExit(child);expect(child.exitCode).toBe(0);await browser.close();browser=null;child=null;report.normalRestarts++;
   }
   const state=async id=>{const status=await call('read_workspace_history',{projectId:id});return {...status,project:status.history?.snapshots.find(snapshot=>snapshot.key===status.history.head.current)?.project};};
   const save=async (id,afterRevision)=>{
    await page.evaluate(()=>{const began=performance.now();window.__sparkSaveFrame={ran:false};requestAnimationFrame(()=>{window.__sparkSaveFrame.ran=true;window.__sparkSaveFrame.milliseconds=performance.now()-began;});});
    try{await page.keyboard.press('Control+s');await expect.poll(async()=>{const head=(await state(id)).history?.head;return !!head&&!head.dirty&&(afterRevision===undefined||head.current!==afterRevision);}).toBe(true);}
    catch(error){
     const current=await state(id),stored=await call('open_project',{id});
     report.saveFailure={projectId:id,head:current.history?.head,history:current.project?.history?.slice(-5),currentMaterials:current.project?.quickForge?.materials,storedMaterials:stored.project?.quickForge?.materials,
      controls:await page.evaluate(()=>({hasFocus:document.hasFocus(),visibility:document.visibilityState,animationFrame:window.__sparkSaveFrame,focus:document.activeElement?.outerHTML.slice(0,500),dialogs:[...document.querySelectorAll('[role="dialog"]')].map(e=>e.textContent?.slice(0,500))})),statuses:(await page.getByRole('status').allTextContents()).map(text=>text.slice(-700)).slice(-8)};
     console.log('NATIVE_SAVE_FAILURE',JSON.stringify(report.saveFailure));throw error;
    }
   };
   // Reuse the same42-edit native workflow without preparing an SDK when
   // investigating Save/history responsiveness independently of compilation.
   const exerciseMissionSave=async(fork,record)=>{
     await chooseTool(page,'Creator Studio');await openMissionBeats(page);
     // Reproduce the rapid multi-field load that exposed the original timeout,
     // retaining each authored Undo snapshot and restoring every saved value.
     for(const [i,step]of ceMissionHudSteps.entries()){
      const item=page.locator('.studio-record').filter({has:page.getByRole('button',{name:'Remove beat '+(i+1),exact:true})});
      for(const [name,value]of [['Title',step.title],['Objective / direction',step.text]]){const field=item.getByRole('textbox',{name,exact:true});await revealPagedControl(field);await field.fill(value+' review');await field.fill(value);}
      const panel=item.locator('.studio-native-objective');if(await panel.getAttribute('open')===null){const summary=panel.locator('> summary');await revealPagedControl(summary);await summary.click();}const field=item.getByRole('textbox',{name:'HUD objective '+(i+1),exact:true});await revealPagedControl(field);await field.fill(step.text+' Review.');await field.fill(step.text);await field.blur();
     }
     record.hud.rapidFieldEdits=42;
     const beatRows=page.locator('.studio-mission-record');
     for(let i=0;i<await beatRows.count();i++){const item=beatRows.nth(i);if(await item.getAttribute('open')!==null){const summary=item.locator(':scope > summary');await revealPagedControl(summary);await summary.click();}}
     await expect(page.locator('.studio-beat-body')).toHaveCount(0);
     record.hud.compactBeatList=await beatRows.evaluateAll(rows=>rows.map(row=>({height:row.getBoundingClientRect().height,width:row.clientWidth,scrollWidth:row.scrollWidth})));
     for(const row of record.hud.compactBeatList){expect(row.height).toBeLessThanOrEqual(40);expect(row.scrollWidth).toBeLessThanOrEqual(row.width+1);}
     await page.screenshot({path:path.join(output,'campaign-beat-list.png')});
     const seventh=beatRows.nth(6).locator(':scope > summary');await revealPagedControl(seventh);await seventh.focus();await page.keyboard.press('Enter');await expect(page.locator('.studio-beat-body')).toHaveCount(1);

     const row=page.locator('.studio-record').filter({has:page.getByRole('button',{name:'Remove beat 7',exact:true})});const completion=row.getByText('Native objective & completion',{exact:true});await revealPagedControl(completion);if(await row.locator('.studio-native-objective').getAttribute('open')===null)await completion.click();
     const text=row.getByRole('textbox',{name:'HUD objective 7',exact:true});await revealPagedControl(text);await text.fill(ceMissionHudSteps[6].text+' Ready.');await text.blur();await page.keyboard.press('Control+z');await expect(text).toHaveValue(ceMissionHudSteps[6].text);await page.keyboard.press('Control+y');await expect(text).toHaveValue(ceMissionHudSteps[6].text+' Ready.');await page.keyboard.press('Control+z');await expect(text).toHaveValue(ceMissionHudSteps[6].text);
     const saving=save(fork.id),latency=[];
     const responsiveness=(async()=>{for(let i=0;i<3;i++){const started=Date.now();await Promise.race([call('startup_status'),new Promise((_,reject)=>setTimeout(()=>reject(Error('Windows command loop stopped responding during Save')),5000))]);latency.push(Date.now()-started);}})();
     // Preserve a failed responsiveness gate, but collect the actual Save result
     // before closing its app. Do not abandon a pending Save on a timer rejection.
     const settled=await Promise.allSettled([saving,responsiveness]);
     record.hud.nativeCommandLatencyMs=latency;record.hud.saveSettled=settled[0].status;
     report.saveIpcTraceFile='native-ipc-'+report.normalRestarts+'.log';
     for(const result of settled)if(result.status==='rejected')throw result.reason;
     record.hud.objectiveUndoRedo=true;record.hud.recoverySave=true;record.hud.nativeCommandLatencyMs=latency;
     record.hud.nativePaint=await page.evaluate(()=>window.__sparkSaveFrame);expect(record.hud.nativePaint.ran).toBe(true);expect(record.hud.nativePaint.milliseconds).toBeLessThan(5000);
     const panel=row.locator('.studio-native-objective');record.hud.compactPanel=await panel.evaluate(el=>({height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width,clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,checkboxes:[...el.querySelectorAll('input[type=checkbox]')].length}));expect(record.hud.compactPanel.checkboxes).toBe(3);expect(record.hud.compactPanel.height).toBeLessThan(210);expect(record.hud.compactPanel.scrollWidth).toBeLessThanOrEqual(record.hud.compactPanel.clientWidth+1);await panel.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'campaign-hud-compact.png')});
   };
   const open=async title=>{await page.locator('.map-card').filter({has:page.getByRole('heading',{name:title,exact:true})}).click();};
   async function dragYawRing(canvas){
    await expect.poll(()=>canvas.evaluate(element=>JSON.parse(element.dataset.gsGizmo).mode)).toBe('rotate');
    const ring=await canvas.evaluate(element=>{const r=element.getBoundingClientRect(),g=JSON.parse(element.dataset.gsGizmo);return {rect:{x:r.x,y:r.y,width:r.width,height:r.height},points:g.rotationHandles.Z,origin:g.origin,gizmo:g};});
    expect(ring.points?.length).toBeGreaterThan(2);let selected;const trials=[];
    for(const point of ring.points){const x=ring.rect.x+(point[0]+1)*ring.rect.width/2,y=ring.rect.y+(1-point[1])*ring.rect.height/2;if(x<ring.rect.x||y<ring.rect.y||x>ring.rect.x+ring.rect.width||y>ring.rect.y+ring.rect.height)continue;await page.mouse.move(x,y);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const axis=await canvas.evaluate(element=>JSON.parse(element.dataset.gsGizmo).axis);trials.push({x,y,axis});if(axis==='Z'){selected={x,y};break;}}
    (report.gizmoPicking??=[]).push({ring,trials});expect(selected,'the actual projected Z rotation picker must be selectable').toBeTruthy();await page.mouse.down();const cx=ring.rect.x+(ring.origin[0]+1)*ring.rect.width/2,cy=ring.rect.y+(1-ring.origin[1])*ring.rect.height/2,dx=selected.x-cx,dy=selected.y-cy;
    for(let step=1;step<=12;step++){const angle=step*Math.PI/36;await page.mouse.move(cx+dx*Math.cos(angle)-dy*Math.sin(angle),cy+dx*Math.sin(angle)+dy*Math.cos(angle));}await page.mouse.up();
   }
   async function compileAiStart(fork,record,scenario,map,parent,proposal,acceptedHash,squad,point){
    const beforeBuilds=(await call('open_project',{id:fork.id})).project.builds.map(row=>row.id);
    await openStudioMenu(page);const runtime=page.getByRole('combobox',{name:'Active Halo runtime',exact:true,includeHidden:true});await revealPagedControl(runtime);await runtime.selectOption('mccSteam');await page.keyboard.press('Escape');
    await page.locator('.runtime-dock').getByRole('button',{name:'Runtime and tool details',exact:true}).click();
    record.stage='build accepted native starts';await page.getByRole('button',{name:'Build working tag edits',exact:true}).click();
    let changed,compileIssue;await expect.poll(async()=>{changed=(await call('open_project',{id:fork.id})).project.builds.find(row=>!beforeBuilds.includes(row.id));if(changed)report.failedNativeJobId=changed.id;if(!changed)compileIssue=(await page.locator('.toast.error').allTextContents()).find(text=>text.trim())?.slice(-1800);return !!compileIssue||['validated','failed','blocked'].includes(changed?.status);},{timeout:300000,intervals:[1000,2000]}).toBe(true);
    if(compileIssue){record.compilerIssue=compileIssue;throw Error(compileIssue);}expect(changed.status).toBe('validated');
    const folder=path.join(output,'ai-start-independent-readback');await fs.mkdir(folder);await run(path.join(invader,'invader-extract.exe'),['-s',scenario+'.scenario','-t',folder,changed.output]);
    const startKey='encounters['+squad.encounter+'].squads['+squad.squad+'].starting_locations['+point.index+']',key=startKey+'.position';
    const query=await run(path.join(invader,'invader-edit.exe'),['-t',folder,'-G',key,scenario+'.scenario']);const compiledPosition=query.stdout.trim().split(',').map(Number);
    proposal.forEach((value,index)=>expect(compiledPosition[index]).toBeCloseTo(value,5));
    if(record.proposedFacingRadians!==undefined){const result=await run(path.join(invader,'invader-edit.exe'),['-t',folder,'-G',startKey+'.facing',scenario+'.scenario']);const degrees=Number(result.stdout.trim()),radians=degrees*Math.PI/180;expect(Math.abs(Math.atan2(Math.sin(radians-record.proposedFacingRadians),Math.cos(radians-record.proposedFacingRadians)))).toBeLessThan(.000002);record.compiledFacingDegrees=degrees;record.compiledFacingRadians=radians;}expect(await hash(map)).toBe(record.originalCacheSha256);expect(await hash(parent.output)).toBe(record.parentCacheSha256);
    if(record.nativeCombat){const c=record.nativeCombat,prefix='encounters['+c.encounter+']',firing=prefix+'.firing_positions['+c.point+']';const position=(await run(path.join(invader,'invader-edit.exe'),['-t',folder,'-G',firing+'.position',scenario+'.scenario'])).stdout.trim().split(',').map(Number);c.position.forEach((v,i)=>expect(position[i]).toBeCloseTo(v,5));expect((await run(path.join(invader,'invader-edit.exe'),['-t',folder,'-G',firing+'.group_index',scenario+'.scenario'])).stdout.trim()).toBe(c.group);const args=['-t',folder],fields=['attacking','attackingSearch','attackingGuard','defending','defendingSearch','defendingGuard'];for(const field of fields)for(let i=0;i<26;i++)args.push('-G',prefix+'.squads['+c.squad+'].'+field.replace(/[A-Z]/g,c=>'_'+c.toLowerCase())+'.'+String.fromCharCode(97+i));args.push(scenario+'.scenario');const bits=(await run(path.join(invader,'invader-edit.exe'),args)).stdout.trim().split(/\r?\n/).map(Number);expect(bits).toHaveLength(156);fields.forEach((f,k)=>{for(let i=0;i<26;i++)expect(bits[k*26+i]).toBe(Number(c.groups[f].includes(String.fromCharCode(97+i))));});const snapshot=JSON.parse(await fs.readFile(path.join(library,'jobs',changed.id,'working-tags-receipt.json'),'utf8')).scenarioSquadReadback;expect(snapshot.combat).toHaveLength(2+(record.nativeBehavior?1:0));expect(snapshot.includeStarts).toBe(true);expect(snapshot.combat.every(op=>op.sourceSha256===snapshot.sourceSha256)).toBe(true);c.compiled={position,group:c.group,masks:fields.map(f=>c.groups[f].reduce((m,g)=>m+(1<<(g.charCodeAt(0)-97)),0)),readbackTargets:snapshot.combat.length};}
    if(record.nativeBehavior){const b=record.nativeBehavior,prefix='encounters['+b.encounter+'].squads['+b.squad+']';const read=async key=>(await run(path.join(invader,'invader-edit.exe'),['-t',folder,'-G',key,scenario+'.scenario'])).stdout.trim();expect(await read(prefix+'.initial_state')).toBe(b.source.initialState);expect(await read(prefix+'.return_state')).toBe(b.source.returnState);const values=[];for(const p of b.source.starts){const key=prefix+'.starting_locations['+p.index+']';const initialState=await read(key+'.initial_state'),returnState=await read(key+'.return_state');expect(initialState).toBe(p.initialState);expect(returnState).toBe(p.returnState);values.push({index:p.index,initialState,returnState});}const snapshot=JSON.parse(await fs.readFile(path.join(library,'jobs',changed.id,'working-tags-receipt.json'),'utf8')).scenarioSquadReadback;expect(snapshot.combat).toHaveLength((record.nativeCombat?2:0)+1);expect(snapshot.combat.some(op=>op.kind==='encounterSquadBehavior')).toBe(true);b.compiled={initialState:b.source.initialState,returnState:b.source.returnState,starts:values};}
    Object.assign(record,{stage:'passed',complete:true,realUi:true,mouseAxisDrag:true,flightReleased:true,reviewNavigation:true,previewAcceptRestore:true,saveRestart:true,beforePosition:record.beforePosition,proposal,compiledPosition,sourceTagSha256:acceptedHash,cacheSha256:await hash(changed.output),scenarioSha256:await hash(path.join(folder,scenario+'.scenario')),originalAndPreviousGoodUnchanged:true});
    await page.screenshot({path:path.join(output,'ai-start-accepted.png')});await save(fork.id);console.log('ORIGINAL_AI_START_NATIVE',JSON.stringify(record));
   }
   try{
   await start();
   const boot=await call('bootstrap');await call('save_settings',{settings:{...boot.settings,onboardingCompleted:true,walkthroughEnabled:false,autoBuild:false,hekDirectory:kit,hekTagsDirectory:tags,invaderDirectory:invader,hekFlavor:ceMissionReview?'legacyHek':'h1aEk',preferredHalo:ceMissionReview?'chupathingyCe':boot.settings.preferredHalo}});
   if(ceMissionReview){
    const source=path.resolve(process.env.SPARK_NATIVE_CE_MISSION_SOURCE??'');
    if(!process.env.SPARK_NATIVE_CE_MISSION_SOURCE||!tags)throw Error('Select an owned CE mission source and prepared matching tags');
    const originalSha=await hash(source),scenario='levels/forerunner/be_native/be_native';
    let fork,record,parent,flood,safe;
    const context=()=>call('native_tag_context',{projectId:fork.id});
    const waitBuild=async(previous)=>{let build;await expect.poll(async()=>{build=(await call('project_build_history',{id:fork.id})).builds.find(row=>!previous.includes(row.id));if(build)report.failedNativeJobId=build.id;if(['failed','blocked','cancelled'].includes(build?.status))throw Error(build.message);const admission=(await page.locator('.runtime-details-dialog > [role=alert]').allTextContents()).find(text=>text.trim());const issue=admission??(await page.locator('.toast.error,.toast.warning').allTextContents()).find(text=>/blocked compilation|Error:|refused|changed after/i.test(text));if(issue)throw Error(issue);return build?.status;},{timeout:300000,intervals:[1000,2000]}).toBe('validated');return build;};

    if(!prior){
    const [imported]=await call('import_paths',{paths:[source]});expect(imported.inspection.header.version).toBe(609);expect(imported.inspection.header.scenarioType).toBe(0);expect(imported.inspection.scenarioPath.replaceAll('\\','/')).toBe(scenario);
    fork=imported.project;const target=crypto.randomUUID();fork.title='Black Echo CE mission source acceptance';fork.activeBuildTarget=null;
    fork.buildTargets=[{id:target,name:'Reviewed Black Echo CE source',runtimeId:'chupathingyCe',builder:'invader-ce',hekDirectory:null,hekFlavor:null,tagsDirectory:tags,invaderDirectory:invader,ceCompatibleTagset:true,openSauce:false}];
    await call('save_project',{project:fork});await page.reload();await chooseTool(page,'Map library');await open(fork.title);
    record=report.ceMission={projectId:fork.id,originalSha,stage:'select CE source target',gameplayVerified:false};
    await chooseTool(page,'Build & playtest');const targets=page.locator('.build-conversion .gs-build-targets');await targets.locator('> summary').click();await targets.getByRole('button',{name:'Use this target',exact:true}).click();await save(fork.id);
    expect((await state(fork.id)).project.activeBuildTarget).toBe(target);
    await page.getByRole('button',{name:'Build for Chupathingy',exact:true}).click();parent=await waitBuild([]);expect(parent.target).toBe('gbx-custom');record.parent=parent;
    const before=await context();expect(before.startEditIssue).toBeNull();
    flood=before.scenarioStartSquads.find(row=>row.encounterName==='be_flood');expect(flood?.starts?.[0]).toBeTruthy();
    // Current admitted candidates may already have the old Covenant position.
    // Move to another actual native start; never invent a position or turn
    // this into an accepted no-op source-edit/readback test.
    const sourceTarget=['be_covenant','be_defense','be_marines'].flatMap(name=>before.scenarioStartSquads.filter(row=>row.encounterName===name).flatMap(row=>(row.starts??[]).map(point=>({row,point})))).find(({point})=>point.position.some((value,axis)=>Math.abs(value-flood.starts[0].position[axis])>1e-5));
    expect(sourceTarget,'The source fixture needs a distinct existing encounter start').toBeTruthy();safe=sourceTarget.point;expect(safe.position).not.toEqual(flood.starts[0].position);
    record.stage='edit native Flood start';record.beforeFlood=flood.starts[0].position;record.safeSourcePoint=safe.position;record.safeSourceBinding={encounter:sourceTarget.row.encounter,squad:sourceTarget.row.squad,encounterName:sourceTarget.row.encounterName,start:sourceTarget.point.index};
    await chooseTool(page,'Tag editor');await page.getByRole('combobox',{name:'Filter tag class',exact:true}).selectOption('scnr');await page.locator('.tag-row').click();await page.getByRole('tab',{name:'Native Output',exact:true}).click();
    const panel=page.locator('.native-tag-operations');await panel.locator('> summary').click();await panel.locator('.native-ai-starts > summary').click();await panel.getByRole('combobox',{name:'AI starting-position squad',exact:true}).selectOption(flood.encounter+':'+flood.squad);
    for(const [i,axis]of ['X','Y','Z'].entries())await panel.getByRole('spinbutton',{name:'AI start '+axis,exact:true}).fill(String(safe.position[i]));
    await panel.getByRole('button',{name:'Preview AI starting position',exact:true}).click();const accept=panel.getByRole('button',{name:'Accept as new source revision',exact:true});await expect(accept).toBeEnabled();expect((await context()).tagSha256).toBe(before.tagSha256);await accept.click();
    let accepted;await expect.poll(async()=>{accepted=await context();return accepted.tagSha256;},{timeout:180000}).not.toBe(before.tagSha256);record.acceptedSourceSha256=accepted.tagSha256;
    expect(accepted.scenarioStartSquads.find(row=>row.encounter===flood.encounter&&row.squad===flood.squad).starts[0].position).toEqual(safe.position);await save(fork.id);
    if(ceDeviceReview){
     record.stage='edit native control placement';const original=await context();expect(original.deviceEditIssue).toBeNull();const device=original.scenarioDevices.find(row=>row.class==='ctrl'&&row.name==='extraction_loadout');expect(device).toBeTruthy();const scene=JSON.stringify((await state(fork.id)).project.scene);
     await chooseTool(page,'Creator Studio');await page.getByRole('button',{name:'Add beat',exact:true}).click();const beat=page.locator('.studio-mission-record').last();await beat.getByRole('textbox',{name:'Title',exact:true}).fill('Recovered native loadout terminal');await beat.getByRole('combobox',{name:'Trigger',exact:true}).selectOption('deviceActivated');const controls=page.locator('.studio-native-areas');await controls.locator('> summary').click();await controls.getByRole('button',{name:'Read native controls',exact:true}).click();await beat.getByRole('combobox',{name:'Mission terminal 1',exact:true}).selectOption(device.name);await save(fork.id);
     await beat.getByRole('button',{name:'Select objective terminal in Level Editor',exact:true}).click();await expect(page.getByRole('button',{name:'Frame native device',exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'Scale (R)',exact:true})).toBeDisabled();await expect(page.locator('.viewport-object-actions:visible')).toHaveCount(1);expect(await page.locator('.native-device-actions').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);const canvas=page.locator('canvas[data-gs-gizmo]');await expect.poll(()=>canvas.getAttribute('data-gs-gizmo').then(v=>v?JSON.parse(v).mode:null)).toBe('translate');
     const h=await canvas.evaluate(e=>{const r=e.getBoundingClientRect(),g=JSON.parse(e.dataset.gsGizmo);return{x:r.x+(g.handles.X[0]+1)*r.width/2,y:r.y+(1-g.handles.X[1])*r.height/2,dx:(g.handles.X[0]-g.origin[0])*r.width/2,dy:-(g.handles.X[1]-g.origin[1])*r.height/2};});const length=Math.hypot(h.dx,h.dy);expect(length).toBeGreaterThan(1);await page.mouse.move(h.x,h.y);await page.mouse.down();await page.mouse.move(h.x+h.dx/length*45,h.y+h.dy/length*45,{steps:12});await page.mouse.up();await page.keyboard.press('e');await dragYawRing(canvas);await page.screenshot({path:path.join(output,'native-device-model.png')});
     expect(JSON.stringify((await state(fork.id)).project.scene)).toBe(scene);expect((await context()).tagSha256).toBe(original.tagSha256);await page.getByRole('button',{name:'Review device source',exact:true}).click();const form=page.locator('.native-device-placements:visible');await expect(form.getByRole('spinbutton',{name:'Device position X',exact:true})).toBeFocused();expect(Number(await form.getByRole('spinbutton',{name:'Device position X',exact:true}).inputValue())).not.toBe(device.position[0]);expect(Number(await form.getByRole('spinbutton',{name:'Device yaw',exact:true}).inputValue())).not.toBe(device.rotationRadians[0]*180/Math.PI);await form.getByRole('button',{name:'Preview device placement',exact:true}).click();const accept=page.getByRole('button',{name:'Accept as new source revision',exact:true});await expect(accept).toBeEnabled();await accept.click();let revised;await expect.poll(async()=>{revised=await context();return revised.tagSha256;}).not.toBe(original.tagSha256);
     const selected=revised.scenarioDevices.find(row=>row.class===device.class&&row.index===device.index);expect({...selected,position:device.position,rotationRadians:device.rotationRadians}).toEqual(device);await page.getByRole('button',{name:'Restore before-edit tag',exact:true}).click();await expect.poll(async()=>(await context()).tagSha256).toBe(original.tagSha256);await accept.click();await expect.poll(async()=>(await context()).tagSha256).toBe(revised.tagSha256);record.nativeDevice={original,device:selected,beforeSha256:original.tagSha256,afterSha256:revised.tagSha256,realMouseMoveRotate:true,cacheSceneUnchanged:true,restoreReaccept:true,gameplayVerified:false};record.acceptedSourceSha256=revised.tagSha256;await save(fork.id);
    }
    if(ceVolumeReview){
     record.stage='edit native trigger geometry';const original=await context();expect(original.triggerEditIssue).toBeNull();const index=original.scenarioVolumes.findIndex(v=>v.name==='be_containment'),point=original.scenarioVolumes[index];expect(index).toBeGreaterThanOrEqual(0);expect(point.geometry).toBeTruthy();
     await chooseTool(page,'Creator Studio');const add=page.getByRole('button',{name:'Add beat',exact:true});await revealPagedControl(add);await add.click();const beat=page.locator('.studio-mission-record').last();await beat.getByRole('textbox',{name:'Title',exact:true}).fill('Native containment area');await beat.getByRole('combobox',{name:'Trigger',exact:true}).selectOption('triggerVolume');
     const areas=page.locator('.studio-native-areas');await areas.locator('> summary').click();await areas.getByRole('button',{name:'Read native scenario areas',exact:true}).click();await expect(areas).toContainText(original.scenarioVolumes.length+' native areas');await beat.getByLabel('Scenario trigger-volume identifier',{exact:true}).fill(point.name);await save(fork.id);await page.screenshot({path:path.join(output,'campaign-native-areas.png')});
     await beat.getByRole('button',{name:'Select objective area in Level Editor',exact:true}).click();await expect(page.getByRole('button',{name:'Frame trigger area',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Review trigger source',exact:true}).click();let form=page.locator('.native-trigger-volumes:visible');await expect(form.getByRole('combobox',{name:'Native trigger area',exact:true})).toHaveValue(String(index));record.missionNativeAreaRoute=true;

     const oldSize=Number(await form.getByRole('spinbutton',{name:'Trigger size X',exact:true}).inputValue());await form.getByRole('spinbutton',{name:'Trigger size X',exact:true}).fill(String(oldSize+2));await form.getByRole('spinbutton',{name:'Trigger rotation Z',exact:true}).fill('15');await form.getByRole('button',{name:'Show trigger area in Level Editor',exact:true}).click();await expect(page.getByRole('button',{name:'Frame trigger area',exact:true})).toBeEnabled();
     const canvas=page.locator('canvas[data-gs-gizmo]');await expect.poll(()=>canvas.getAttribute('data-gs-gizmo').then(s=>s?JSON.parse(s).mode:null)).toBe('translate');const dragAxis=async(pixels)=>{const frame=await canvas.evaluate(e=>{const r=e.getBoundingClientRect(),g=JSON.parse(e.dataset.gsGizmo);return{x:r.x,y:r.y,w:r.width,h:r.height,handle:g.handles.X,origin:g.origin};});const px=frame.x+(frame.handle[0]+1)*frame.w/2,py=frame.y+(1-frame.handle[1])*frame.h/2,dx=(frame.handle[0]-frame.origin[0])*frame.w/2,dy=-(frame.handle[1]-frame.origin[1])*frame.h/2,len=Math.hypot(dx,dy);expect(len).toBeGreaterThan(1);await page.mouse.move(px,py);await page.mouse.down();await page.mouse.move(px+dx/len*pixels,py+dy/len*pixels,{steps:12});await page.mouse.up();};await dragAxis(45);
     await page.keyboard.press('e');await dragYawRing(canvas);await page.keyboard.press('r');await expect.poll(()=>canvas.getAttribute('data-gs-gizmo').then(s=>s?JSON.parse(s).mode:null)).toBe('scale');await dragAxis(24);await page.keyboard.press('w');expect((await context()).tagSha256).toBe(original.tagSha256);await page.getByRole('button',{name:'Review trigger source',exact:true}).click();form=page.locator('.native-trigger-volumes');await expect(form.getByRole('spinbutton',{name:'Trigger center X',exact:true})).toBeFocused();const scaledSize=Number(await form.getByRole('spinbutton',{name:'Trigger size X',exact:true}).inputValue());expect(scaledSize).toBeGreaterThan(0);expect(Math.abs(scaledSize-(oldSize+2))).toBeGreaterThan(.001);await form.getByRole('button',{name:'Preview trigger geometry',exact:true}).click();const accept=page.getByRole('button',{name:'Accept as new source revision',exact:true});await expect(accept).toBeEnabled();expect((await context()).tagSha256).toBe(original.tagSha256);await accept.click();let after;await expect.poll(async()=>{after=await context();return after.tagSha256;}).not.toBe(original.tagSha256);expect(after.scenarioVolumes[index].geometry.dimensions[0]).toBeCloseTo(scaledSize,4);expect(after.scenarioVolumes[index].geometry.corner).not.toEqual(point.geometry.corner);
     await page.getByRole('button',{name:'Restore before-edit tag',exact:true}).click();await expect.poll(async()=>(await context()).tagSha256).toBe(original.tagSha256);await accept.click();await expect.poll(async()=>(await context()).tagSha256).toBe(after.tagSha256);record.nativeVolume={index,name:point.name,geometry:after.scenarioVolumes[index].geometry,beforeSha256:original.tagSha256,afterSha256:after.tagSha256,realMouseMoveRotateScale:true,restoreReaccept:true,gameplayVerified:false};record.acceptedSourceSha256=after.tagSha256;await save(fork.id);await page.screenshot({path:path.join(output,'native-trigger-source.png')});
    }
    if(ceCameraReview){
     record.stage='edit recovered native camera';const before=await context();expect(before.cameraEditIssue).toBeNull();const original=before.scenarioCameras.find(p=>p.name==='gs_camera_fixture_b');expect(original).toBeTruthy();let staleError;try{await call('native_operation_preview',{projectId:fork.id,tagId:null,operation:{kind:'cutsceneCamera',point:{...original,position:[original.position[0]+.5,...original.position.slice(1)]},sourceSha256:'0'.repeat(64)}});}catch(error){staleError=String(error);}expect(staleError).toContain('Native source changed after selection');expect((await context()).tagSha256).toBe(before.tagSha256);record.cameraStalePreviewRefused=true;let cameras=panel.locator('.native-cutscene-cameras');await cameras.locator('> summary').click();await cameras.getByRole('combobox',{name:'Native cutscene camera',exact:true}).selectOption(String(original.index));
     await cameras.getByRole('spinbutton',{name:'Cutscene camera X',exact:true}).fill(String(original.position[0]+.5));for(const [axis,value]of [['yaw',60],['pitch',-10],['roll',15],['FOV',80]])await cameras.getByRole('spinbutton',{name:'Cutscene camera '+axis,exact:true}).fill(String(value));await cameras.getByRole('button',{name:'View cutscene camera in Level Editor',exact:true}).click();
     const canvas=page.locator('canvas[data-gs-camera-pose]');await expect.poll(()=>canvas.getAttribute('data-gs-camera-pose').then(s=>s?JSON.parse(s).fov:null)).toBeCloseTo(80,3);let pose=JSON.parse(await canvas.getAttribute('data-gs-camera-pose'));expect(pose.position[0]).toBeCloseTo(original.position[0]+.5,4);record.nativeCamera={index:original.index,name:original.name,beforeSha256:before.tagSha256,viewportBefore:pose,gameplayVerified:false};
     const rect=await canvas.boundingBox();await page.mouse.move(rect.x+rect.width*.55,rect.y+rect.height*.55);await page.mouse.down({button:'right'});await page.keyboard.down('w');try{await expect.poll(()=>canvas.getAttribute('data-gs-camera-pose').then(s=>Math.hypot(...JSON.parse(s).position.map((v,i)=>v-pose.position[i])))).toBeGreaterThan(.1);}finally{await page.keyboard.up('w');await page.mouse.up({button:'right'});}
     record.nativeCamera.viewportAfter=JSON.parse(await canvas.getAttribute('data-gs-camera-pose'));await page.getByRole('button',{name:'Review cutscene camera source',exact:true}).click();cameras=page.locator('.native-cutscene-cameras');await expect(cameras.getByRole('spinbutton',{name:'Cutscene camera X',exact:true})).toBeFocused();await cameras.getByRole('button',{name:'Use Level Editor camera',exact:true}).click();
     const position=[];for(const axis of ['X','Y','Z'])position.push(Number(await cameras.getByRole('spinbutton',{name:'Cutscene camera '+axis,exact:true}).inputValue()));const orientationRadians=[];for(const axis of ['yaw','pitch','roll'])orientationRadians.push(Number(await cameras.getByRole('spinbutton',{name:'Cutscene camera '+axis,exact:true}).inputValue())*Math.PI/180);const fovRadians=Number(await cameras.getByRole('spinbutton',{name:'Cutscene camera FOV',exact:true}).inputValue())*Math.PI/180;expect(Math.hypot(...position.map((v,i)=>v-pose.position[i]))).toBeGreaterThan(.1);expect((await context()).tagSha256).toBe(before.tagSha256);
     await cameras.getByRole('button',{name:'Preview native camera edit',exact:true}).click();const accept=panel.getByRole('button',{name:'Accept as new source revision',exact:true});await expect(accept).toBeEnabled();await accept.click();await expect.poll(async()=>(await context()).tagSha256).not.toBe(before.tagSha256);const after=await context();await panel.getByRole('button',{name:'Restore before-edit tag',exact:true}).click();await expect.poll(async()=>(await context()).tagSha256).toBe(before.tagSha256);await accept.click();await expect.poll(async()=>(await context()).tagSha256).toBe(after.tagSha256);record.nativeCamera={...record.nativeCamera,afterSha256:after.tagSha256,position,orientationRadians,fovRadians,restoreReaccept:true,realMouseKeyboardCamera:true};record.acceptedSourceSha256=after.tagSha256;await save(fork.id);
    }
    if(ceCommandReview){
     record.stage='bind native starting command list';const original=await context();expect(original.commandListIssue).toBeNull();const list=original.scenarioCommandLists.find(list=>list.name==='gs_command_fixture_b');expect(list).toBeTruthy();
     const starts=panel.locator('.native-ai-starts'),binding=starts.getByRole('combobox',{name:'AI start command list',exact:true});await expect(binding).toHaveValue('-1');await binding.selectOption(String(list.index));await starts.getByRole('button',{name:'Preview AI start command binding',exact:true}).click();const accept=panel.getByRole('button',{name:'Accept as new source revision',exact:true});await expect(accept).toBeEnabled();expect((await context()).tagSha256).toBe(original.tagSha256);await accept.click();await expect.poll(async()=>(await context()).tagSha256).not.toBe(original.tagSha256);const after=await context();expect(after.scenarioStartSquads.find(row=>row.encounter===flood.encounter&&row.squad===flood.squad).starts[0].commandList).toBe(list.index);expect(after.scenarioCommandLists).toEqual(original.scenarioCommandLists);
     await panel.getByRole('button',{name:'Restore before-edit tag',exact:true}).click();await expect.poll(async()=>(await context()).tagSha256).toBe(original.tagSha256);await accept.click();await expect.poll(async()=>(await context()).tagSha256).toBe(after.tagSha256);record.nativeCommand={encounter:flood.encounter,squad:flood.squad,start:0,index:list.index,name:list.name,beforeSha256:original.tagSha256,afterSha256:after.tagSha256,restoreReaccept:true,gameplayVerified:false};record.acceptedSourceSha256=after.tagSha256;await save(fork.id);
    }
    if(ceCommandContentReview){
     record.stage='edit native command contents';const original=await context();expect(original.commandSourceIssue).toBeNull();const list=original.commandSource.lists.find(list=>list.name==='gs_command_fixture_b');expect(list.commands).toHaveLength(2);expect(list.points).toHaveLength(2);
     const form=panel.locator('.native-command-lists');await form.locator(':scope > summary').click();await form.getByRole('combobox',{name:'Native command source list',exact:true}).selectOption(String(list.index));await form.getByRole('combobox',{name:'Native command action',exact:true}).selectOption('go_to');await form.getByRole('spinbutton',{name:'Command Parameter 1',exact:true}).fill('1.25');await form.getByRole('spinbutton',{name:'Command point X',exact:true}).fill(String(safe.position[0]+.25));await form.getByRole('checkbox',{name:'Allow targeting',exact:true}).check();await form.getByText('Native references',{exact:true}).click();await form.getByRole('spinbutton',{name:'Command Point 1',exact:true}).fill('0');await form.getByRole('button',{name:'Preview command list',exact:true}).click();const accept=panel.getByRole('button',{name:'Accept as new source revision',exact:true});await expect(accept).toBeEnabled();expect((await context()).tagSha256).toBe(original.tagSha256);await accept.click();await expect.poll(async()=>(await context()).tagSha256).not.toBe(original.tagSha256);const after=await context(),revised=after.commandSource.lists[list.index];expect(revised.commands[0]).toMatchObject({atom:'go_to',parameters:[1.25,0],point1:0});expect(revised.flags[1]).toBe(true);expect(revised.points[0][0]).toBeCloseTo(safe.position[0]+.25,4);expect(after.scenarioStartSquads).toEqual(original.scenarioStartSquads);
     await panel.getByRole('button',{name:'Restore before-edit tag',exact:true}).click();await expect.poll(async()=>(await context()).tagSha256).toBe(original.tagSha256);await accept.click();await expect.poll(async()=>(await context()).tagSha256).toBe(after.tagSha256);record.nativeCommandContents={list:revised,beforeSha256:original.tagSha256,afterSha256:after.tagSha256,restoreReaccept:true,gameplayVerified:false};record.acceptedSourceSha256=after.tagSha256;await save(fork.id);await page.screenshot({path:path.join(output,'native-command-source.png')});
    }
    if(cePatrolReview){
     record.stage='edit recovered native patrol';const original=await context(),encounter=original.scenarioCombat.find(r=>r.name==='be_covenant'),member=encounter?.squads[0];expect(member?.patrol).toBeTruthy();expect(member.patrolIssue??null).toBeNull();
     const difficulty=panel.locator('.native-squad-difficulty');await difficulty.locator('> summary').click();await difficulty.getByRole('combobox',{name:'Native source squad',exact:true}).selectOption(encounter.encounter+':'+member.index);
     let patrol=panel.locator('.native-squad-patrol');await patrol.locator('> summary').click();
     for(let i=member.patrol.points.length;i<2;i++)await patrol.getByRole('button',{name:'Add patrol point',exact:true}).click();
     for(let point=0;point<2;point++){await patrol.getByRole('combobox',{name:'Native patrol point',exact:true}).selectOption(String(point));for(const [i,axis]of ['X','Y','Z'].entries())await patrol.getByRole('spinbutton',{name:'Native patrol '+axis,exact:true}).fill(String(safe.position[i]+(i===0?point*.25:0)));}
     await patrol.getByRole('combobox',{name:'Native patrol point',exact:true}).selectOption('0');
     await patrol.getByRole('button',{name:'Duplicate patrol point',exact:true}).click();await patrol.getByRole('button',{name:'Move point earlier',exact:true}).click();
     await patrol.getByRole('spinbutton',{name:'Native patrol weight',exact:true}).fill('2.5');await patrol.getByRole('spinbutton',{name:'Native patrol minimum wait',exact:true}).fill('0.25');await patrol.getByRole('spinbutton',{name:'Native patrol maximum wait',exact:true}).fill('1.5');await patrol.getByRole('spinbutton',{name:'Native patrol facing degrees',exact:true}).fill('45');
     await patrol.getByRole('button',{name:'Show patrol handles in Level Editor',exact:true}).click();await expect(page.getByRole('button',{name:'Frame AI patrol point',exact:true})).toBeEnabled();
     const canvas=page.locator('canvas[data-gs-gizmo]');await expect.poll(()=>canvas.getAttribute('data-gs-gizmo').then(s=>s?JSON.parse(s).mode:null)).toBe('translate');
     const frame=await canvas.evaluate(e=>{const r=e.getBoundingClientRect(),g=JSON.parse(e.dataset.gsGizmo);return{x:r.x,y:r.y,w:r.width,h:r.height,handle:g.handles.X,origin:g.origin};});const px=frame.x+(frame.handle[0]+1)*frame.w/2,py=frame.y+(1-frame.handle[1])*frame.h/2,dx=(frame.handle[0]-frame.origin[0])*frame.w/2,dy=-(frame.handle[1]-frame.origin[1])*frame.h/2,len=Math.hypot(dx,dy);expect(len).toBeGreaterThan(1);
     await page.mouse.move(px,py);await page.mouse.down();await page.mouse.move(px+dx/len*40,py+dy/len*40,{steps:12});await page.mouse.up();expect((await context()).tagSha256).toBe(original.tagSha256);await page.screenshot({path:path.join(output,'native-patrol-viewport.png')});
     await page.getByRole('button',{name:'Review AI patrol source',exact:true}).click();patrol=page.locator('.native-squad-patrol');await expect(patrol.getByRole('spinbutton',{name:'Native patrol X',exact:true})).toBeFocused();expect(Math.abs(Number(await patrol.getByRole('spinbutton',{name:'Native patrol X',exact:true}).inputValue())-safe.position[0])).toBeGreaterThan(.001);
     await patrol.getByRole('button',{name:'Preview native patrol',exact:true}).click();const accept=page.getByRole('button',{name:'Accept as new source revision',exact:true});await expect(accept).toBeEnabled();expect((await context()).tagSha256).toBe(original.tagSha256);await accept.click();await expect.poll(async()=>(await context()).tagSha256).not.toBe(original.tagSha256);const after=await context();
     await page.getByRole('button',{name:'Restore before-edit tag',exact:true}).click();await expect.poll(async()=>(await context()).tagSha256).toBe(original.tagSha256);await accept.click();await expect.poll(async()=>(await context()).tagSha256).toBe(after.tagSha256);
     record.nativePatrol={encounter:encounter.encounter,squad:member.index,source:after.scenarioCombat.find(r=>r.encounter===encounter.encounter).squads.find(r=>r.index===member.index).patrol,beforeSha256:original.tagSha256,afterSha256:after.tagSha256,realMouseViewport:true,restoreReaccept:true,gameplayVerified:false};record.acceptedSourceSha256=after.tagSha256;await save(fork.id);
    }
    if(ceMissionHudReview){
     record.stage='author campaign HUD through Creator Studio';await chooseTool(page,'Creator Studio');await openMissionBeats(page);
     for(const [i,step]of ceMissionHudSteps.entries()){
      const add=page.getByRole('button',{name:'Add beat',exact:true});await revealPagedControl(add);await add.click();
      const row=page.locator('.studio-record').filter({has:page.getByRole('button',{name:'Remove beat '+(i+1),exact:true})});
      const title=row.getByRole('textbox',{name:'Title',exact:true});await revealPagedControl(title);await title.fill(step.title);
      const direction=row.getByRole('textbox',{name:'Objective / direction',exact:true});await revealPagedControl(direction);await direction.fill(step.text);
      const completion=row.getByText('Native objective & completion',{exact:true});await revealPagedControl(completion);await completion.click();
      await row.getByRole('checkbox',{name:'Author native HUD objective text for this beat',exact:true}).check();
      const text=row.getByRole('textbox',{name:'HUD objective '+(i+1),exact:true});await revealPagedControl(text);await text.fill(step.text);await text.blur();
     }
     const last=page.getByRole('textbox',{name:'HUD objective 7',exact:true});await page.keyboard.press('Control+z');await expect(last).not.toHaveValue(ceMissionHudSteps[6].text);await page.keyboard.press('Control+y');await expect(last).toHaveValue(ceMissionHudSteps[6].text);await save(fork.id);
     record.hud={messages:ceMissionHudSteps.map((step,i)=>({name:'gs_mission_obj_'+(i+1),text:step.text})),objectiveUndoRedo:true};
    }
    }else{
     record=report.ceMission={...prior.ceMission,resumedFrom:resumeFile};parent=record.parent;fork=(await call('open_project',{id:record.projectId})).project;
     expect(await hash(source)).toBe(record.originalSha);expect(await hash(parent.output)).toBe(parent.sha256);await chooseTool(page,'Map library');await open(fork.title);
     const current=await context();if(ceCinematicReview&&prior.ceMission.cinematic?.first){const first=prior.ceMission.cinematic.first;expect(current.buildId).toBe(first.built.id);expect(first.built.status).toBe('validated');expect(await hash(first.built.output)).toBe(first.mapSha256);}else expect(current.tagSha256).toBe(record.acceptedSourceSha256);flood=current.scenarioStartSquads.find(row=>row.encounterName==='be_flood');safe={position:record.safeSourcePoint};expect(flood.starts[0].position).toEqual(safe.position);
    }
    if(ceCinematicReview){
     record.stage='author existing-camera cinematic take';
     const originalCameras=(await context()).scenarioCameras;
     const points=['gs_camera_fixture_a','gs_camera_fixture_b'].map(name=>originalCameras.find(p=>p.name===name));points.forEach(point=>expect(point).toBeTruthy());
     const takePanel=async()=>{
      const dialog=page.locator('[role=dialog].runtime-details-dialog');if(!await dialog.isVisible())await page.getByRole('button',{name:'Runtime and tool details',exact:true}).click();
      const editor=page.locator('.native-script-attachment');await revealPagedControl(editor.locator('> summary'));if(await editor.getAttribute('open')===null)await editor.locator('> summary').click();
      const take=editor.locator('.native-cinematic-source');await revealPagedControl(take.locator('> summary'));if(await take.getAttribute('open')===null)await take.locator('> summary').click();
      const read=take.getByRole('button',{name:'Read native cameras & modules',exact:true});await read.click();await expect(read).toBeEnabled();await expect(take.getByRole('combobox',{name:'Existing cinematic camera',exact:true})).toBeVisible();return {editor,take};
     };
     let take;if(!prior){({take}=await takePanel());
     for(const point of points){await take.getByRole('combobox',{name:'Existing cinematic camera',exact:true}).selectOption(String(point.index));await take.getByRole('button',{name:'Add native camera to take',exact:true}).click();}
     await expect.poll(async()=>(await state(fork.id)).project.studio?.shots?.length).toBe(2);
     await page.keyboard.press('Control+z');await expect.poll(async()=>(await state(fork.id)).project.studio?.shots?.length).toBe(1);
     await page.keyboard.press('Control+y');await expect.poll(async()=>(await state(fork.id)).project.studio?.shots?.length).toBe(2);await save(fork.id);}
     const setDuration=async(seconds)=>{
      ({take}=await takePanel());await take.getByRole('button',{name:'Edit take timing in Machinima',exact:true}).click();
      await expect(page.locator('[role=dialog].runtime-details-dialog')).toHaveCount(0);
      await page.getByRole('button',{name:points[1].name,exact:true}).click();await openDrawer(page,'Lens & composition');
      const duration=page.getByRole('spinbutton',{name:'Key duration (seconds)',exact:true});await revealPagedControl(duration);await duration.fill(String(seconds));await duration.press('Tab');
      await expect.poll(async()=>(await state(fork.id)).project.studio.shots[1].durationMs).toBe(seconds*1000);
      return duration;
     };
     if(!prior){await setDuration(3);await page.keyboard.press('Control+z');await expect.poll(async()=>(await state(fork.id)).project.studio.shots[1].durationMs).toBe(2000);
     await page.keyboard.press('Control+y');await expect.poll(async()=>(await state(fork.id)).project.studio.shots[1].durationMs).toBe(3000);await save(fork.id);
     await close();await start();await chooseTool(page,'Map library');await open(fork.title);expect((await state(fork.id)).project.studio.shots[1].durationMs).toBe(3000);}
     const prepare=async()=>{const panels=await takePanel();const button=panels.take.getByRole('button',{name:'Prepare timed cinematic source',exact:true});await revealPagedControl(button);await button.click();await expect.poll(async()=>(await state(fork.id)).project.scenarioScriptDraft?.filename).toBe('gs_cinematic.hsc');return panels;};
     let panels;if(!prior){panels=await prepare();await save(fork.id);const savedDraft=(await state(fork.id)).project.scenarioScriptDraft;
     await close();await start();await chooseTool(page,'Map library');await open(fork.title);expect((await state(fork.id)).project.scenarioScriptDraft).toEqual(savedDraft);
     panels=await prepare();await save(fork.id);}
     const compile=async(panels,ticks,label)=>{
      const draft=(await state(fork.id)).project.scenarioScriptDraft;expect(draft.content).toContain('(camera_set '+points[1].name+' '+ticks+')');if(!ceCinematicTriggerReview||label==='first')expect(draft.content).not.toContain('(script startup');else expect(draft.content).toContain('(script startup gs_cinematic_start');
      const review=panels.editor.getByRole('checkbox',{name:'I reviewed this source and its native scenario references.',exact:true});await revealPagedControl(review);await review.check();
      const button=panels.editor.getByRole('button',{name:label==='first'?'Attach source & compile':'Build reviewed script revision',exact:true});await revealPagedControl(button);await expect(button).toBeEnabled();
      const beforeBuilds=(await call('project_build_history',{id:fork.id})).builds.map(row=>row.id);record.stage='compile timed cinematic '+label;await button.click();const built=await waitBuild(beforeBuilds);const currentMessage=page.locator('.build-history').getByText(built.message,{exact:true});await revealPagedControl(page.locator('.build-history > summary'));if(await page.locator('.build-history').getAttribute('open')===null)await page.locator('.build-history > summary').click();await expect(currentMessage).toBeVisible();await save(fork.id);
      const receiptPath=path.join(library,'jobs',built.id,'working-tags-receipt.json'),receipt=JSON.parse(await fs.readFile(receiptPath,'utf8'));
      expect(receipt.scenarioSquadReadback.cameras).toEqual(originalCameras);
      const readback=path.join(output,'cinematic-readback-'+label);await fs.mkdir(readback);await run(path.join(invader,'invader-extract.exe'),['-t',readback,'-s',scenario+'.scenario',built.output]);
      const data=path.join(readback,'data');await fs.mkdir(data);await run(path.join(invader,'invader-recover.exe'),['-t',readback,'-d',data,'-b',scenario+'.scenario']);
      const hsc=path.join(data,'levels/forerunner/be_native/scripts/extracted.hsc'),compiled=await fs.readFile(hsc,'utf8');expect(compiled).toContain('(camera_set '+points[1].name+' '+ticks+')');expect(compiled).toContain('(player_enable_input 1)');expect(compiled).toContain('(script static void gs_cinematic');expect(compiled).toContain('(script dormant forerunner_extraction_complete');expect(compiled).toContain('(unit_has_weapon');
      if(ceCinematicTriggerReview&&label!=='first'){const controller=compiled.slice(compiled.indexOf('(script startup gs_cinematic_start'));expect(controller.startsWith('(script startup gs_cinematic_start')).toBe(true);if(label==='disabled'){expect(controller).toContain('(sleep_until 0 15)');expect(controller).not.toContain('(gs_cinematic)');expect(controller).not.toContain('(volume_test_objects');}else{expect(controller).toContain('(volume_test_objects be_containment (players))');expect(controller).toContain('(gs_cinematic)');}}
      const read=async key=>(await run(path.join(invader,'invader-edit.exe'),['-t',readback,'-G',key,scenario+'.scenario'])).stdout.trim();
      for(const point of points){const key='cutscene_camera_points['+point.index+']';expect(await read(key+'.name')).toBe(point.name);const position=(await read(key+'.position')).split(',').map(Number);point.position.forEach((v,i)=>expect(position[i]).toBeCloseTo(v,5));}
      expect(await hash(built.output)).toBe(built.sha256);await save(fork.id);return {built,ticks,mapSha256:built.sha256,receiptSha256:await hash(receiptPath),scenarioSha256:await hash(path.join(readback,scenario+'.scenario')),recoveredSourceSha256:await hash(hsc),compiledIndependentReadback:true};
     };
     if(prior){expect(prior.appSha256).toBe(report.appSha256);expect(fork.studio.shots.map(s=>s.cameraMarker)).toEqual(points.map(p=>p.name));expect(fork.studio.shots[1].durationMs).toBe(prior.ceMission.cinematic?.first?4000:3000);record.priorCinematicUiEvidence={receiptSha256:await hash(resumeFile),appSha256:prior.appSha256,normalRestarts:prior.normalRestarts,scope:prior.ceMission.cinematic?.first?'Earlier actual native take/history/Save/restarts and first compiled readback are linked by the prior receipt; its changed-draft confirmation was automatically dismissed. This run accepts that explicit confirmation, reviews/rebuilds the timing revision, reads it back and restarts.':'Earlier Add/timing Undo/Redo, Save/three restarts and native compile passed; independent Invader boolean-encoding assertion failed before explicit build Save. Saved source is verified unchanged; this continuation reprepares and compiles its saved take, then saves the result before readback.'};if(!prior.ceMission.cinematic?.first){panels=await prepare();await save(fork.id);}}
     record.cinematic=prior?.ceMission.cinematic??{first:await compile(panels,90,'first'),takeUndoRedo:true,timingUndoRedo:true,takeAndDraftRestart:true,gameplayVerified:false};
     await setDuration(4);await save(fork.id);if(ceCinematicTriggerReview){panels=await takePanel();const activation=panels.take.getByRole('combobox',{name:'Cinematic activation',exact:true});await activation.selectOption('area');await panels.take.getByRole('combobox',{name:'Cinematic trigger area',exact:true}).selectOption('be_containment');await page.keyboard.press('Control+z');await page.keyboard.press('Control+y');await expect(panels.take.getByRole('combobox',{name:'Cinematic trigger area',exact:true})).toHaveValue('be_containment');await panels.take.getByRole('button',{name:'Save take settings',exact:true}).click();await expect.poll(async()=>(await state(fork.id)).history.head.dirty).toBe(false);}page.once('dialog',async dialog=>{expect(dialog.type()).toBe('confirm');expect(dialog.message()).toContain('Replace the current project script draft');await dialog.accept();});panels=await prepare();const originalModule=panels.take.getByText('Original module retained for review',{exact:true});await revealPagedControl(originalModule);await originalModule.click();await expect(panels.take.getByRole('textbox',{name:'Original cinematic module',exact:true})).toHaveValue(/camera_set gs_camera_fixture_b 90/);
     expect((await state(fork.id)).project.scenarioScriptDraft.replaceExisting).toBe(true);await save(fork.id);record.cinematic.revision=await compile(panels,120,'revision');
     await close();await start();await chooseTool(page,'Map library');await open(fork.title);const restored=(await state(fork.id)).project;expect(restored.builds.find(b=>b.id===record.cinematic.revision.built.id)).toEqual(record.cinematic.revision.built);expect((await context()).buildId).toBe(record.cinematic.revision.built.id);expect(restored.studio.shots[1].durationMs).toBe(4000);expect(restored.scenarioScriptDraft.content).toContain('(camera_set '+points[1].name+' 120)');
     if(ceCinematicTriggerReview){expect(restored.studio.cinematicTriggerVolume).toBe('be_containment');record.cinematic.areaTrigger={volume:'be_containment',history:true,saveRestart:true};panels=await takePanel();await panels.take.getByRole('combobox',{name:'Cinematic activation',exact:true}).selectOption('manual');await panels.take.getByRole('button',{name:'Save take settings',exact:true}).click();await expect.poll(async()=>(await state(fork.id)).history.head.dirty).toBe(false);page.once('dialog',async dialog=>{expect(dialog.type()).toBe('confirm');expect(dialog.message()).toContain('Replace the current project script draft');await dialog.accept();});panels=await prepare();const original=panels.take.getByText('Original module retained for review',{exact:true});await revealPagedControl(original);await original.click();await expect(panels.take.getByRole('textbox',{name:'Original cinematic module',exact:true})).toHaveValue(/volume_test_objects be_containment/);await save(fork.id);record.cinematic.disabled=await compile(panels,120,'disabled');await close();await start();await chooseTool(page,'Map library');await open(fork.title);const disabled=(await state(fork.id)).project;expect(disabled.studio.cinematicTriggerVolume??null).toBeNull();expect(disabled.builds.find(b=>b.id===record.cinematic.disabled.built.id)).toEqual(record.cinematic.disabled.built);expect((await context()).buildId).toBe(record.cinematic.disabled.built.id);expect(await hash(record.cinematic.revision.built.output)).toBe(record.cinematic.revision.mapSha256);record.cinematic.areaTrigger.disabledSaveRestart=true;}
     expect(await hash(source)).toBe(originalSha);expect(await hash(parent.output)).toBe(parent.sha256);expect(await hash(record.cinematic.first.built.output)).toBe(record.cinematic.first.mapSha256);expect(report.errors).toEqual([]);
     panels=await takePanel();await page.screenshot({path:path.join(output,'native-cinematic-take.png')});Object.assign(record,{stage:'passed',complete:true,realUi:true,originalAndPreviousGoodUnchanged:true});await close();return;
    }
    const compileResume=!!prior&&prior.ceMission.stage==='compile reviewed mission and accepted AI';
    const hudRecovery=!!prior&&ceMissionHudReview&&prior.ceMission.stage==='author campaign HUD through Creator Studio';
    if(hudRecovery){
     expect(fork.studio.missions.map(beat=>beat.hudText)).toEqual(ceMissionHudSteps.map(step=>step.text));
     record.hud={messages:ceMissionHudSteps.map((step,i)=>({name:'gs_mission_obj_'+(i+1),text:step.text})),recoveredFromSaveTimeout:!!prior.saveFailure,continuedAfterSourcePanelTimeout:!prior.saveFailure};
    }
    if(ceMissionHudReview&&!compileResume)await exerciseMissionSave(fork,record);

    if(compileResume){const draft=(await state(fork.id)).project.scenarioScriptDraft;expect(draft).toBeTruthy();expect(crypto.createHash('sha256').update(draft.content).digest('hex')).toBe(record.projectDraftSha256);}
    await openStudioMenu(page);const runtime=page.getByRole('combobox',{name:'Active Halo runtime',exact:true,includeHidden:true});await revealPagedControl(runtime);await runtime.selectOption('chupathingyCe');await page.keyboard.press('Escape');
    await page.locator('.runtime-dock').getByRole('button',{name:'Runtime and tool details',exact:true}).click();const editor=page.locator('.native-script-attachment');await expect(editor).toBeVisible();await editor.locator('> summary').click();if(!prior||hudRecovery||ceCommandContentReview){await expect(editor.getByRole('button',{name:'List recovered modules',exact:true})).toBeEnabled();await editor.getByRole('button',{name:'List recovered modules',exact:true}).click();await editor.getByRole('button',{name:'Edit selected module',exact:true}).click();}
    if(!compileResume){
    const text=editor.getByRole('textbox',{name:'Edit source',exact:true});await expect(text).toBeVisible();
    // Optimistic UI may render before its serialized native history commit.
    // Require the exact displayed source (textarea LF line endings) in the
    // journal before reading it; the original native bytes stay untouched.
    const displayed=await text.inputValue();await expect.poll(async()=>(await state(fork.id)).project?.scenarioScriptDraft?.content.replaceAll('\r\n','\n')).toBe(displayed);
    const original=(await state(fork.id)).project.scenarioScriptDraft.content;expect(await text.inputValue()).toBe(original.replaceAll('\r\n','\n')); expect(original).toContain('(unit_has_weapon');expect(original).toContain('(script dormant forerunner_extraction_complete');
    const needle='    (ai_place be_defense)';expect(original.split(needle)).toHaveLength(2);let revised=original.replaceAll('\r\n','\n').replace(needle,'    ; Spark-authored three-second evacuation-defense preparation.\n    (sleep 90)\n'+needle);
    if(ceMissionHudReview){for(const [i,step]of ceMissionHudSteps.entries()){const marker='(print '+JSON.stringify('be stage: '+step.marker)+')';expect(revised.split(marker)).toHaveLength(2);revised=revised.replace(marker,marker+'\n  (hud_set_objective_text gs_mission_obj_'+(i+1)+')');}}
    record.stage='edit reviewed mission module';await text.fill(revised);await editor.locator('> summary').click();await page.keyboard.press('Control+z');await expect.poll(async()=>(await state(fork.id)).project.scenarioScriptDraft?.content).toBe(original);await page.keyboard.press('Control+y');await expect.poll(async()=>(await state(fork.id)).project.scenarioScriptDraft?.content).toBe(revised);await save(fork.id);
    record.projectDraftSha256=crypto.createHash('sha256').update(revised).digest('hex');await close();await start();await chooseTool(page,'Map library');await open(fork.title);expect((await state(fork.id)).project.scenarioScriptDraft.content).toBe(revised);expect((await context()).tagSha256).toBe(record.acceptedSourceSha256);record.saveRestart=true;if(ceMissionHudReview){expect((await state(fork.id)).project.studio.missions.map(beat=>beat.hudText)).toEqual(ceMissionHudSteps.map(step=>step.text));record.hud.objectiveSaveRestart=true;await chooseTool(page,'Creator Studio');const rows=page.locator('.studio-mission-record');await expect(rows).toHaveCount(7);await expect(rows.first()).not.toHaveAttribute('open');await expect(rows.nth(6)).toHaveAttribute('open');await expect(page.locator('.studio-beat-body')).toHaveCount(1);record.hud.compactExpansionRestart=true;}
    }
    if(!compileResume){await page.locator('.runtime-dock').getByRole('button',{name:'Runtime and tool details',exact:true}).click();await page.locator('.native-script-attachment > summary').click();}
    await page.locator('.native-script-attachment').getByRole('checkbox',{name:'I reviewed this source and its native scenario references.',exact:true}).check();
    const beforeBuilds=(await call('open_project',{id:fork.id})).project.builds.map(row=>row.id);record.stage='compile reviewed mission and accepted AI';
    if(ceMissionHudReview){
     const hud=page.locator('.native-mission-hud');await revealPagedControl(hud.locator('> summary'));await hud.locator('> summary').click();await hud.getByRole('button',{name:'Prepare mission HUD messages',exact:true}).click();
     const list=hud.getByRole('list',{name:'Campaign HUD message review',exact:true});await expect(list.getByRole('listitem')).toHaveCount(7);for(const step of ceMissionHudSteps)await expect(list).toContainText(step.text);
     const build=hud.getByRole('button',{name:'Build script & mission HUD',exact:true});await expect(build).toBeDisabled();const review=hud.getByRole('checkbox',{name:'I reviewed the mission messages and their HaloScript references.',exact:true});await revealPagedControl(review);await review.check();await expect(build).toBeEnabled();await page.screenshot({path:path.join(output,'campaign-hud-native-review.png')});await build.click();record.hud.reviewedNativeUi=true;
    }else await page.getByRole('button',{name:'Build reviewed script revision',exact:true}).click();
    const built=await waitBuild(beforeBuilds);record.build=built;
    record.stage='save and reopen compiled source revision';await save(fork.id);await close();await start();await chooseTool(page,'Map library');await open(fork.title);
    const reopenedBuilds=(await call('project_build_history',{id:fork.id})).builds;expect(reopenedBuilds.find(row=>row.id===built.id)).toEqual(built);record.compiledBuildRestart=true;
    const readback=path.join(output,'ce-mission-readback');await fs.mkdir(readback);await run(path.join(invader,'invader-extract.exe'),['-t',readback,'-s',scenario+'.scenario',built.output]);
    const position=(await run(path.join(invader,'invader-edit.exe'),['-t',readback,'-G','encounters['+flood.encounter+'].squads['+flood.squad+'].starting_locations[0].position',scenario+'.scenario'])).stdout.trim().split(',').map(Number);safe.position.forEach((v,i)=>expect(position[i]).toBeCloseTo(v,5));
    if(ceDeviceReview){const p=record.nativeDevice,d=p.device,key=(d.class==='ctrl'?'controls':'machines')+'['+d.index+']',get=async field=>(await run(path.join(invader,'invader-edit.exe'),['-t',readback,'-G',key+'.'+field,scenario+'.scenario'])).stdout.trim();(await get('position')).split(',').map(Number).forEach((v,i)=>expect(v).toBeCloseTo(d.position[i],4));(await get('rotation')).split(',').map(v=>Number(v)*Math.PI/180).forEach((v,i)=>expect(Math.abs(Math.atan2(Math.sin(v-d.rotationRadians[i]),Math.cos(v-d.rotationRadians[i])))).toBeLessThan(.000002));expect(Number(await get('name'))).toBe(d.nameIndex);const receipt=JSON.parse(await fs.readFile(path.join(library,'jobs',built.id,'working-tags-receipt.json'),'utf8'));expect(receipt.scenarioSquadReadback.devices.find(row=>row.class===d.class&&row.index===d.index)).toEqual(d);expect((await state(fork.id)).project.studio.missions[0].triggerRef).toBe(d.name);p.compiledIndependentReadback=true;p.referenceSaveRestart=true;}
    if(ceVolumeReview){const p=record.nativeVolume,key='trigger_volumes['+p.index+']',field=async name=>(await run(path.join(invader,'invader-edit.exe'),['-t',readback,'-G',key+'.'+name,scenario+'.scenario'])).stdout.trim();expect(await field('name')).toBe(p.name);expect(await field('type')).toBe('rotational');for(const [name,expected]of [['rotation_vector_forward',p.geometry.forward],['rotation_vector_up',p.geometry.up],['starting_corner',p.geometry.corner],['ending_corner_offset',p.geometry.dimensions]])(await field(name)).split(',').map(Number).forEach((v,i)=>expect(v).toBeCloseTo(expected[i],4));const receipt=JSON.parse(await fs.readFile(path.join(library,'jobs',built.id,'working-tags-receipt.json'),'utf8'));expect(receipt.scenarioSquadReadback.volumes[p.index]).toEqual({name:p.name,kind:1,geometry:p.geometry});p.compiledIndependentReadback=true;}
    if(ceCameraReview){const p=record.nativeCamera,key='cutscene_camera_points['+p.index+']',read=async field=>(await run(path.join(invader,'invader-edit.exe'),['-t',readback,'-G',key+'.'+field,scenario+'.scenario'])).stdout.trim();expect(await read('name')).toBe(p.name);const position=(await read('position')).split(',').map(Number),orientationRadians=(await read('orientation')).split(',').map(n=>Number(n)*Math.PI/180),fovRadians=Number(await read('field_of_view'))*Math.PI/180;p.position.forEach((v,i)=>expect(position[i]).toBeCloseTo(v,4));p.orientationRadians.forEach((v,i)=>expect(Math.abs(Math.atan2(Math.sin(v-orientationRadians[i]),Math.cos(v-orientationRadians[i])))).toBeLessThan(.000002));expect(fovRadians).toBeCloseTo(p.fovRadians,5);record.nativeCamera.compiledIndependentReadback={position,orientationRadians,fovRadians};}
    if(ceCommandReview){const p=record.nativeCommand,key='encounters['+p.encounter+'].squads['+p.squad+'].starting_locations['+p.start+'].command_list';const index=Number((await run(path.join(invader,'invader-edit.exe'),['-t',readback,'-G',key,scenario+'.scenario'])).stdout.trim());expect(index).toBe(p.index);const name=(await run(path.join(invader,'invader-edit.exe'),['-t',readback,'-G','command_lists['+index+'].name',scenario+'.scenario'])).stdout.trim();expect(name).toBe(p.name);const commands=Number((await run(path.join(invader,'invader-edit.exe'),['-t',readback,'-C','command_lists['+index+'].commands',scenario+'.scenario'])).stdout.trim());expect(commands).toBe(ceCommandContentReview?2:0);record.nativeCommand.compiledIndependentReadback={index,name,commands};}
    if(ceCommandContentReview){const p=record.nativeCommandContents,l=p.list,prefix='command_lists['+l.index+']',get=async field=>(await run(path.join(invader,'invader-edit.exe'),['-t',readback,'-G',prefix+'.'+field,scenario+'.scenario'])).stdout.trim();expect(await get('commands[0].atom_type')).toBe(l.commands[0].atom);expect(Number(await get('commands[0].parameter1'))).toBeCloseTo(l.commands[0].parameters[0],5);expect(Number(await get('commands[0].point_1'))).toBe(0);expect(Number(await get('flags.allow_targeting'))).toBe(1);(await get('points[0].position')).split(',').map(Number).forEach((v,i)=>expect(v).toBeCloseTo(l.points[0][i],4));const receipt=JSON.parse(await fs.readFile(path.join(library,'jobs',built.id,'working-tags-receipt.json'),'utf8'));expect(receipt.scenarioSquadReadback.commandLists[l.index]).toEqual(l);p.compiledIndependentReadback=true;}
    if(cePatrolReview){const p=record.nativePatrol,key='encounters['+p.encounter+'].squads['+p.squad+'].move_positions';const field=async name=>(await run(path.join(invader,'invader-edit.exe'),['-t',readback,'-G',name,scenario+'.scenario'])).stdout.trim();
     const count=Number((await run(path.join(invader,'invader-edit.exe'),['-t',readback,'-C',key,scenario+'.scenario'])).stdout.trim());expect(count).toBe(p.source.points.length);
     for(const [i,point]of p.source.points.entries()){const prefix=key+'['+i+']',position=(await field(prefix+'.position')).split(',').map(Number),wait=(await field(prefix+'.time')).split(',').map(Number);point.position.forEach((v,j)=>expect(position[j]).toBeCloseTo(v,4));expect(Number(await field(prefix+'.weight'))).toBeCloseTo(point.weight,5);wait.forEach((v,j)=>expect(v).toBeCloseTo(point.waitSeconds[j],5));expect(Number(await field(prefix+'.facing'))).toBeCloseTo(point.facingRadians*180/Math.PI,3);const animation=Number(await field(prefix+'.animation'));expect(animation>32767?animation-65536:animation).toBe(point.animation);expect(Number(await field(prefix+'.sequence_id'))).toBe(point.sequenceId);}
     const receipt=JSON.parse(await fs.readFile(path.join(library,'jobs',built.id,'working-tags-receipt.json'),'utf8'));expect(receipt.scenarioSquadReadback.combat.some(op=>op.kind==='encounterSquadPatrol')).toBe(true);p.compiledIndependentReadback=true;
    }
    const recovered=path.join(readback,'data');await fs.mkdir(recovered);await run(path.join(invader,'invader-recover.exe'),['-t',readback,'-d',recovered,'-b',scenario+'.scenario']);const compiledSource=await fs.readFile(path.join(recovered,'levels/forerunner/be_native/scripts/extracted.hsc'),'utf8');expect(compiledSource).toMatch(/\(sleep 90\)\s*\(ai_place be_defense\)/);expect(compiledSource).toContain('(unit_has_weapon');expect(compiledSource).toContain('(script dormant forerunner_extraction_complete');
    if(ceMissionHudReview){
     const receipt=JSON.parse(await fs.readFile(path.join(library,'jobs',built.id,'working-tags-receipt.json'),'utf8')),hud=receipt.generatedMissionHud;expect(hud.messages).toHaveLength(7);expect(hud.ownedNames).toEqual(record.hud.messages.map(row=>row.name));
     await run(path.join(invader,'invader-extract.exe'),['-t',readback,'-s','gs_hud*',built.output]);const nativeHud=path.join(readback,hud.tagPath+'.hud_message_text');expect(await hash(nativeHud)).toBe(hud.tagSha256);
     for(const [i,step]of ceMissionHudSteps.entries()){expect(compiledSource).toContain('(hud_set_objective_text gs_mission_obj_'+(i+1)+')');expect(hud.messages[i]).toEqual({name:'gs_mission_obj_'+(i+1),panels:[{kind:'text',value:step.text}]});}
     record.hud.nativeTagSha256=await hash(nativeHud);record.hud.compiledIndependentReadback=true;record.hud.compiledSaveRestart=true;
    }
    expect(await hash(source)).toBe(originalSha);expect(await hash(parent.output)).toBe(parent.sha256);record.compiledFloodPosition=position;record.outputSha256=await hash(built.output);expect(record.outputSha256).toBe(built.sha256);record.independentScenarioSha256=await hash(path.join(readback,scenario+'.scenario'));record.independentSourceSha256=await hash(path.join(recovered,'levels/forerunner/be_native/scripts/extracted.hsc'));
    const nativeLog=await fs.readFile(path.join(library,'logs',built.id+'.jsonl'),'utf8');expect(Buffer.byteLength(nativeLog)).toBeLessThan(16*1024**2);const nativeEvents=nativeLog.trim().split(/\r?\n/).map(JSON.parse).filter(row=>row.jobId===built.id);expect(nativeEvents.some(row=>row.phase==='validated')).toBe(true);expect(nativeEvents.some(row=>row.severity==='tool')).toBe(true);record.nativeWarnings=nativeEvents.filter(row=>row.severity==='warning'||/^WARNING\b|Built successfully with .* warnings/.test(row.message)).map(row=>row.message);expect(nativeEvents.map(row=>row.message).join('\n')).not.toMatch(/be_flood.*outside|outside.*be_flood|starting location\[0-0\]/i);
    await chooseTool(page,'Build & playtest');await expect(page.locator('.build-target')).toContainText('Ready to build');await expect(page.getByRole('button',{name:'Build for Chupathingy',exact:true})).toBeEnabled();const history=page.locator('.build-history');await revealPagedControl(history.locator('> summary'));if(await history.getAttribute('open')===null)await history.locator('> summary').click();const message=history.getByText(built.message,{exact:true});await expect(message).toBeVisible();await message.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'ce-mission-built.png')});Object.assign(record,{stage:'passed',complete:true,realUi:true,sourceUnchangedUntilAccept:true,scriptUndoRedo:true,originalAndPreviousGoodUnchanged:true});await close();return;
   }
   if(prior){
    const original=prior.originalAiStart;await chooseTool(page,'Map library');await open('Recovered native AI start acceptance');
    const fork=(await call('open_project',{id:original.sourceProjectId})).project;
    const context=await call('native_tag_context',{projectId:fork.id});
    const squad=context.scenarioStartSquads.find(row=>row.encounterName==='gs_w01_g01'),point=squad?.starts?.[0];expect(point).toBeTruthy();
    expect(context.tagSha256).toBe(original.sourceTagSha256);const proposal=original.proposal;expect(proposal).toHaveLength(3);proposal.forEach((v,i)=>expect(point.position[i]).toBeCloseTo(v,5));
    if(original.nativeCombat){const c=original.nativeCombat,row=context.scenarioCombat.find(r=>r.encounter===c.encounter),p=row?.points.find(p=>p.index===c.point);expect(p?.group).toBe(c.group);c.position.forEach((v,i)=>expect(p.position[i]).toBeCloseTo(v,5));expect(row.squads.find(s=>s.index===c.squad).groups).toEqual(c.groups);}
    if(original.nativeBehavior){const b=original.nativeBehavior,row=context.scenarioCombat.find(r=>r.encounter===b.encounter)?.squads.find(r=>r.index===b.squad);expect(row?.behavior).toEqual(b.source);}
    const beforePosition=original.beforePosition??prior.independentReadback.nativePositions[0];expect(proposal).not.toEqual(beforePosition);
    report.priorUiEvidence={sha256:await hash(resumeFile),appSha256:prior.appSha256,scope:'Earlier actual handle/accept/Restore/reapply/Save/restart actions; this run resumes the retained source build without repeating SDK/project preparation'};
    const record=report.originalAiStart={...original,beforePosition,proposal,sourceTagSha256:context.tagSha256,previewAcceptRestore:true,saveRestart:true};
    const map=prior.nativeBuild.build.output,parent=prior.nativeSourceForkBuild;
    expect(await hash(map)).toBe(record.originalCacheSha256);expect(await hash(parent.output)).toBe(record.parentCacheSha256);
    const scenario=prior.nativeBuild.sources.scenarioPath.replaceAll('\\','/');
    await compileAiStart(fork,record,scenario,map,parent,proposal,context.tagSha256,squad,point);
    await close();return;
   }
   // A fresh project from the existing creator API, then the actual Workshop
   // example button. These are not recovered proprietary scenario/tag bytes.
   const created=await call('create_quickforge_project',{title:'Native solo Firefight fixture',template:'customBlank',target:'mccSteam'});
   await page.reload();await open(created.project.title);
   await page.getByRole('button',{name:'BSP Workshop',exact:true}).click();
   const beforeWorkshop=(await state(created.project.id)).history.head.current;
   await page.getByRole('button',{name:'Two rooms + corridor + ramp',exact:true}).click();await save(created.project.id,beforeWorkshop);
   const p=(await state(created.project.id)).project;
   expect(p.quickForge.workshop.brushes).toHaveLength(4);
   report.immediateWorkshopSave={realUi:true,brushes:p.quickForge.workshop.brushes.length,dirty:(await state(created.project.id)).history.head.dirty};
   if(saveOnly){
    report.sourcePreparation={scope:'No SDK/tag staging or native compilation required for this Save reproduction'};
    if(missionSaveStress){
     const record=report.missionSaveStress={hud:{},actualControls:true,gameplayVerified:false};
     await chooseTool(page,'Creator Studio');
     for(const [i,step]of ceMissionHudSteps.entries()){
      const add=page.getByRole('button',{name:'Add beat',exact:true});await revealPagedControl(add);await add.click();
      const row=page.locator('.studio-mission-record').nth(i);
      for(const [name,value]of [['Title',step.title],['Objective / direction',step.text]]){const field=row.getByRole('textbox',{name,exact:true});await revealPagedControl(field);await field.fill(value);}
      const summary=row.locator('.studio-native-objective > summary');await revealPagedControl(summary);await summary.click();
      const show=row.getByRole('checkbox',{name:'Show native HUD objective while this beat is active',exact:true});await revealPagedControl(show);await show.check();
      const text=row.getByRole('textbox',{name:'HUD objective '+(i+1),exact:true});await revealPagedControl(text);await text.fill(step.text);
     }
     await exerciseMissionSave(created.project,record);
     const saved=await state(created.project.id);expect(saved.history.head.dirty).toBe(false);expect(saved.history.head.past.length).toBeGreaterThan(0);
     const previous=saved.history.snapshots.find(row=>row.key===saved.history.head.past.at(-1)).project;
     record.savedHead=saved.history.head;record.savedStudioSha256=crypto.createHash('sha256').update(JSON.stringify(saved.project.studio)).digest('hex');
     await close();await start();await chooseTool(page,'Map library');await open(created.project.title);await chooseTool(page,'Creator Studio');await openMissionBeats(page);
     const resumed=await state(created.project.id);expect(resumed.history.head).toEqual(saved.history.head);expect(resumed.project.studio).toEqual(saved.project.studio);
     for(const [i,step]of ceMissionHudSteps.entries()){
      const row=page.locator('.studio-mission-record').nth(i);await expect(row.getByRole('textbox',{name:'Title',exact:true})).toHaveValue(step.title);await expect(row.getByRole('textbox',{name:'Objective / direction',exact:true})).toHaveValue(step.text);
      const summary=row.locator('.studio-native-objective > summary');if(await row.locator('.studio-native-objective').getAttribute('open')===null){await revealPagedControl(summary);await summary.click();}await expect(row.getByRole('textbox',{name:'HUD objective '+(i+1),exact:true})).toHaveValue(step.text);
     }
     const tab=page.getByRole('tab',{name:'Mission director',exact:true});await tab.focus();await page.keyboard.press('Control+z');await expect.poll(async()=>(await state(created.project.id)).project.studio).toEqual(previous.studio);
     await tab.focus();await page.keyboard.press('Control+y');await expect.poll(async()=>(await state(created.project.id)).project.studio).toEqual(saved.project.studio);await save(created.project.id);
     record.fullProcessRestart=true;record.retainedUndoRedo=true;record.savedStateRestored=true;record.recoveredNativeMissionAcceptance=false;
     await page.screenshot({path:path.join(output,'mission-save-restarted.png')});console.log('NATIVE_MISSION_SAVE_STRESS',JSON.stringify(record));
    }
    await page.screenshot({path:path.join(output,'workshop-save.png')});await close();return;
   }
   p.title='Native solo Firefight acceptance';p.quickForge.name=p.title;p.quickForge.gameMode='firefight';
   p.quickForge.materials[0].shaderPath='levels/test/tutorial/shaders/example_tutorial_metal_floor';p.quickForge.skyPath='levels/test/bloodgulch/bloodgulch';
   p.quickForge.spawns=p.quickForge.spawns.slice(0,1);p.quickForge.spawns[0].position=[-5,-4,0.1];p.quickForge.placements=[];p.quickForge.objectives=[];
   p.firefight={schemaVersion:1,title:'Native solo round',sourceSha256:null,seed:1,playerCount:2,teamLives:5,allowRevives:false,rounds:1,endless:false,preparationMs:1000,countdownMs:1000,intermissionMs:1000,spawnIntervalMs:500,spawnTimeoutMs:5000,stuckTimeoutMs:60000,maxSpawnAttempts:3,maxAlive:4,maxTotalPerWave:4,difficultyStepPercent:25,extraPlayerCountPercent:50,startingEquipment:[],replenishAmmoEachWave:false,supplyDropTags:[],
    enemies:[{id:'grunt',name:'Grunt',actorVariantPath:'characters/grunt/grunt minor plasma pistol',points:100}],spawnZones:[{id:'enemy-zone',position:[4,3,0.1],radius:2,enabled:true}],
    waves:[{id:'first',name:'First wave',boss:false,scoreMultiplierMilli:1000,groups:[{enemyId:'grunt',count:1}]},{id:'second',name:'Second wave',boss:false,scoreMultiplierMilli:1000,groups:[{enemyId:'grunt',count:2}]}]};
   const seed=path.join(output,'authored-round.gsproject');await fs.writeFile(seed,JSON.stringify(p),{flag:'wx'});
   await page.getByRole('button',{name:'Close map '+created.project.title,exact:true}).click();
   const [imported]=await call('import_paths',{paths:[seed]});const id=imported.project.id,title=imported.project.title;
   await page.reload();await open(title);await chooseTool(page,'Firefight rules');
   const prepare=()=>page.getByRole('button',{name:'Prepare native solo round',exact:true});
   await page.getByRole('button',{name:'Use solo native rules',exact:true}).click();
   await expect.poll(async()=>(await state(id)).project.firefight.maxSpawnAttempts).toBe(1);
   await page.getByText('Player loadout',{exact:true}).click();
   const reserve=page.getByRole('spinbutton',{name:'Primary rounds reserved',exact:true});
   await reserve.fill('72');await reserve.press('Tab');
   await expect.poll(async()=>(await state(id)).project.firefight.nativePlayerProfile.primaryReserved).toBe(72);
   await page.keyboard.press('Control+z');await expect.poll(async()=>(await state(id)).project.firefight.nativePlayerProfile.primaryReserved).toBe(60);
   await page.keyboard.press('Control+y');await expect.poll(async()=>(await state(id)).project.firefight.nativePlayerProfile.primaryReserved).toBe(72);
   await prepare().click();await expect(page.getByRole('status').filter({hasText:'Native solo source attached'})).toBeVisible();
   const source=async()=>(await state(id)).project?.quickForge.logic?.handwrittenSources?.find(source=>source.filename==='gs_firefight.hsc')?.content;
   await expect.poll(source).toContain('(script startup gs_ff_bootstrap');
   const expected=await source();await page.keyboard.press('Control+z');await expect.poll(source).toBeUndefined();
   await page.keyboard.press('Control+y');await expect.poll(source).toBe(expected);await save(id);
   report.preparation={realUi:true,undo:true,redo:true,sourceSha256:crypto.createHash('sha256').update(expected).digest('hex'),scriptBytes:Buffer.byteLength(expected)};
   await page.screenshot({path:path.join(output,'firefight-prepared.png')});
   await close();await start();
   await chooseTool(page,'Map library');await open(title);
   await expect.poll(source).toBe(expected);const rules=(await state(id)).project.firefight;expect(rules.playerCount).toBe(1);expect(rules.teamLives).toBe(1);expect(rules.waves).toEqual(p.firefight.waves);expect(rules.spawnZones).toEqual(p.firefight.spawnZones);
   report.savedRestart=true;report.savedProjectReopenedThroughLibrary=true;
   await chooseTool(page,'Level editor');
   const button=page.getByRole('button',{name:'Build & check playtest',exact:true});await expect(button).toBeEnabled();await button.click();
   const toolbar=page.locator('.forge-build-toolbar');await expect(toolbar).toBeVisible();
   report.buildPanelLayout=await toolbar.evaluate(element=>{const box=element.getBoundingClientRect(),panel=element.closest('.forge-build-panel').getBoundingClientRect();return {viewport:[innerWidth,innerHeight],toolbarHeight:box.height,panelHeight:panel.height,horizontalOverflow:element.scrollWidth>element.clientWidth+1,pathsCollapsed:!document.querySelector('.forge-build-details').open};});
   expect(report.buildPanelLayout.toolbarHeight).toBeLessThan(120);expect(report.buildPanelLayout.horizontalOverflow).toBe(false);expect(report.buildPanelLayout.pathsCollapsed).toBe(true);
   await page.screenshot({path:path.join(output,'firefight-build-controls.png')});
   let compiled;await expect.poll(async()=>{compiled=await call('quickforge_build_report',{projectId:id});if(compiled)report.nativeBuild=compiled;if(compiled&&['failed','blocked'].includes(compiled.status))throw Error('Native round rejected: '+JSON.stringify(compiled.blockers));return compiled?.status;},{timeout:300000,intervals:[1000,2000]}).toBe('validated');
   report.nativeBuild=compiled;
   const map=compiled.build.output;expect(await hash(map)).toBe(compiled.build.sha256);
   const readback=path.join(output,'independent-readback');await fs.mkdir(readback);
   const scenario=compiled.sources.scenarioPath.replaceAll('\\','/');
   const extract=await run(path.join(invader,'invader-extract.exe'),['-s',scenario+'.scenario','-t',readback,map]);
   expect(extract.stdout+'\n'+extract.stderr).not.toMatch(/ERROR:|Failed to extract/i);
   const query=await run(path.join(invader,'invader-edit.exe'),['-t',readback,'-G','encounters[*].name','-G','encounters[*].squads[*].normal_diff_count','-G','encounters[*].squads[*].starting_locations[*].position','-G','scripts[*].name',scenario+'.scenario']);
   const text=query.stdout.trim();expect(text).toContain('gs_w01_g01');expect(text).toContain('gs_w02_g01');expect(text).toContain('gs_ff_bootstrap');expect(text).toContain('gs_firefight');
   const field=async(key,flag='-G')=>(await run(path.join(invader,'invader-edit.exe'),['-t',readback,flag,key,scenario+'.scenario'])).stdout.trim();
   // Report the standard singleplayer loadout independently of successful
   // encounter compilation. An empty profile is not a playable round.
   const profileCount=Number(await field('player_starting_profile','-C'));
   expect(Number.isSafeInteger(profileCount)&&profileCount>=0&&profileCount<=256).toBe(true);
   const playerProfiles=[];
   for(let i=0;i<profileCount;i++){
    const prefix='player_starting_profile['+i+']';
    playerProfiles.push({name:await field(prefix+'.name'),primaryWeapon:await field(prefix+'.primary_weapon'),
     primaryLoaded:Number(await field(prefix+'.primary_rounds_loaded')),primaryReserved:Number(await field(prefix+'.primary_rounds_reserved')),
     secondaryWeapon:await field(prefix+'.secondary_weapon'),secondaryLoaded:Number(await field(prefix+'.secondary_rounds_loaded')),
     secondaryReserved:Number(await field(prefix+'.secondary_rounds_reserved'))});
   }
   report.playerLoadout={nativeReadback:true,profileCount,profiles:playerProfiles,gameplayVerified:false};
   expect(profileCount).toBe(1);expect(playerProfiles[0]).toMatchObject({name:'gs_firefight_start',primaryWeapon:'weapons\\pistol\\pistol.weapon',primaryLoaded:12,primaryReserved:72,secondaryLoaded:0,secondaryReserved:0});
   expect(Number(await field('player_starting_profile[0].starting_health_modifier'))).toBe(1);
   expect(Number(await field('player_starting_profile[0].starting_shield_modifier'))).toBe(1);
   const nativeCounts=[],nativePositions=[];
   for(let i=0;i<2;i++){
    const prefix='encounters['+i+']';
    expect(Number(await field(prefix+'.flags.not_initially_created'))).toBe(1);
    expect(Number(await field(prefix+'.flags.respawn_enabled'))).toBe(0);
    expect(Number(await field(prefix+'.squads[0].normal_diff_count'))).toBe(i+1);
    expect(Number(await field(prefix+'.squads[0].insane_diff_count'))).toBe(i+1);
    expect(Number(await field(prefix+'.squads[0].starting_locations','-C'))).toBe(i+1);
    expect(Number(await field(prefix+'.firing_positions','-C'))).toBe(i+1);
    nativeCounts.push(i+1);
    for(let j=0;j<=i;j++){
      const position=(await field(prefix+'.squads[0].starting_locations['+j+'].position')).split(',').map(Number);
      const expected=i===0?[4,3,0.1]:[3.625+j*0.75,2.625,0.1];
      expect(position).toHaveLength(3);position.forEach((value,k)=>expect(value).toBeCloseTo(expected[k],5));nativePositions.push(position);
    }
   }
   expect((await field('actor_palette[0].reference')).replaceAll('\\','/')).toBe('characters/grunt/grunt minor plasma pistol.actor_variant');
   const [opened]=await call('import_paths',{paths:[map]});expect(opened.inspection.header.scenarioType).toBe(0);expect(opened.inspection.encounters.map(e=>e.name)).toEqual(['gs_w01_g01','gs_w02_g01']);
   report.independentReadback={nativeCounts,nativePositions,scenarioSha256:await hash(path.join(readback,scenario+'.scenario')),text,cacheSha256:await hash(map),encounters:opened.inspection.encounters,scripts:opened.inspection.scripts,originalSdkUnchanged:true};
   // The actual stale-rules guard must retain the previous-good compiled cache.
   await chooseTool(page,'Firefight rules');const rulesTitle=page.getByRole('textbox',{name:'Rules title',exact:true});await rulesTitle.fill('Changed after prepare');await rulesTitle.press('Tab');await save(id);
   await chooseTool(page,'Level editor');await button.click();
   let refused;await expect.poll(async()=>{refused=await call('quickforge_build_report',{projectId:id});return refused?.status;},{timeout:60000}).toBe('blocked');
   expect(refused.blockers.join(' ')).toContain('rules changed after');expect(refused.toolIdentities).toEqual({});expect(await hash(map)).toBe(compiled.build.sha256);
   report.staleConfig={blocked:true,noCompilerStarted:true,previousGoodMapUnchanged:true,blockers:refused.blockers};
   await chooseTool(page,'Firefight rules');await page.keyboard.press('Control+z');await save(id);
   expect((await state(id)).project.firefight.title).toBe(p.firefight.title);
   await page.screenshot({path:path.join(output,'firefight-built.png')});
   if(process.env.SPARK_NATIVE_AI_START_REVIEW==='1'){
    // Reopen an owned compiled map as separate source. Its original authoring
    // project/recipes stay intact; no ownership metadata or guard is removed.
    const fork=opened.project,originalCacheSha256=await hash(map),targetId=crypto.randomUUID();
    fork.title='Recovered native AI start acceptance';fork.activeBuildTarget=targetId;
    fork.buildTargets=[{id:targetId,name:'Matching owned MCC source',runtimeId:'mccSteam',builder:'h1a-tool',hekDirectory:kit,hekFlavor:'h1aEk',tagsDirectory:path.join(compiled.sources.directory,'tags'),invaderDirectory:invader,ceCompatibleTagset:false,openSauce:false}];
    await call('save_project',{project:fork});await page.reload();await open(fork.title);
    const record=report.originalAiStart={stage:'rebuild recovered source',scope:'Existing native starts in a separately imported owned test cache, not stock campaign or gameplay acceptance',sourceProjectId:fork.id,originalCacheSha256,gameplayVerified:false};
    await chooseTool(page,'Build & playtest');const rebuild=page.getByRole('button',{name:'Convert map to MCC',exact:true});await expect(rebuild).toBeEnabled();await rebuild.click();
    let parent;await expect.poll(async()=>{parent=(await call('open_project',{id:fork.id})).project.builds.at(-1);if(parent)report.failedNativeJobId=parent.id;if(parent?.status==='failed')throw Error('Recovered source rebuild failed: '+JSON.stringify(parent));return parent?.status;},{timeout:300000,intervals:[1000,2000]}).toBe('validated');
    report.nativeSourceForkBuild=parent;record.parentCacheSha256=await hash(parent.output);
    const context=()=>call('native_tag_context',{projectId:fork.id});const baseline=await context();
    record.beforeSourceTagSha256=baseline.tagSha256;expect(baseline.startEditIssue).toBeNull();expect(baseline.protectedSquadEncounters).not.toContain('gs_w01_g01');
    const squad=baseline.scenarioStartSquads.find(row=>row.encounterName==='gs_w01_g01'),point=squad?.starts?.[0];expect(point).toBeTruthy();
    record.stage='show handles from Tags while flight is enabled';
    await chooseTool(page,'Level editor');await page.getByRole('button',{name:'RMB flight · orbit on',exact:true}).click();
    await chooseTool(page,'Tag editor');await page.getByRole('combobox',{name:'Filter tag class',exact:true}).selectOption('scnr');
    await page.locator('.tag-row').click();await page.getByRole('tab',{name:'Native Output',exact:true}).click();
    let panel=page.locator('.native-tag-operations');await panel.locator('> summary').click();
    await panel.locator('.native-ai-starts > summary').click();await panel.getByRole('combobox',{name:'AI starting-position squad',exact:true}).selectOption(squad.encounter+':'+squad.squad);
    await panel.getByRole('button',{name:'Show handles in Level Editor',exact:true}).click();
    await expect(page.getByRole('button',{name:'Frame AI start',exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'RMB flight · orbit on',exact:true})).toBeVisible();
    const canvas=page.locator('canvas[data-gs-gizmo]');await expect(canvas).toHaveCount(1);
    const geometry=await canvas.evaluate(element=>{const r=element.getBoundingClientRect();return {rect:{x:r.x,y:r.y,width:r.width,height:r.height},gizmo:JSON.parse(element.dataset.gsGizmo)};});
    expect(geometry.gizmo.mode).toBe('translate');const handle=geometry.gizmo.handles.X,origin=geometry.gizmo.origin;expect(handle).toBeTruthy();
    const x=geometry.rect.x+(handle[0]+1)*geometry.rect.width/2,y=geometry.rect.y+(1-handle[1])*geometry.rect.height/2;
    const dx=(handle[0]-origin[0])*geometry.rect.width/2,dy=-(handle[1]-origin[1])*geometry.rect.height/2,length=Math.hypot(dx,dy);expect(length).toBeGreaterThan(1);
    record.stage='drag native X handle';await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx/length*55,y+dy/length*55,{steps:12});await page.mouse.up();
    if(aiFacingReview){
     expect(Number.isFinite(point.facingRadians)).toBe(true);record.beforeFacingRadians=point.facingRadians;record.stage='rotate native Z facing handle';
     await page.keyboard.press('e');await dragYawRing(canvas);record.mouseRotation=true;
    }
    expect((await context()).tagSha256).toBe(baseline.tagSha256);
    await page.screenshot({path:path.join(output,'ai-start-dragged.png')});await page.getByRole('button',{name:'Review AI start source',exact:true}).click();
    panel=page.locator('.native-tag-operations');const input=panel.getByRole('spinbutton',{name:aiFacingReview?'AI start facing degrees':'AI start X',exact:true});await expect(input).toBeFocused();
    if(aiFacingReview){record.proposedFacingRadians=Number(await input.inputValue())*Math.PI/180;expect(Math.abs(Math.atan2(Math.sin(record.proposedFacingRadians-point.facingRadians),Math.cos(record.proposedFacingRadians-point.facingRadians)))).toBeGreaterThan(.01);}
    const proposal=await Promise.all(['X','Y','Z'].map(axis=>panel.getByRole('spinbutton',{name:'AI start '+axis,exact:true}).inputValue().then(Number)));
    expect(Math.abs(proposal[0]-point.position[0])).toBeGreaterThan(.001);expect(proposal[1]).toBeCloseTo(point.position[1],5);expect(proposal[2]).toBeCloseTo(point.position[2],5);
    record.stage='review accept restore and reaccept';await panel.getByRole('button',{name:aiFacingReview?'Preview AI starting pose':'Preview AI starting position',exact:true}).click();
    const accept=()=>panel.getByRole('button',{name:'Accept as new source revision',exact:true});await expect(accept()).toBeEnabled();await accept().click();
    await expect.poll(async()=>(await context()).tagSha256).not.toBe(baseline.tagSha256);const accepted=await context();
    await panel.getByRole('button',{name:'Restore before-edit tag',exact:true}).click();await expect.poll(async()=>(await context()).tagSha256).toBe(baseline.tagSha256);
    await expect(accept()).toBeEnabled();await accept().click();await expect.poll(async()=>(await context()).tagSha256).toBe(accepted.tagSha256);await save(fork.id);
    let finalAccepted=accepted;
    if(aiCombatReview){
     record.stage='original firing source handles';const source=await context(),encounter=source.scenarioCombat.find(r=>r.encounter===squad.encounter),original=encounter?.points?.[0];expect(original).toBeTruthy();expect(source.combatEditIssue).toBeNull();const form=panel.locator('.native-ai-firing');await form.locator(':scope > summary').click();await form.getByRole('combobox',{name:'AI firing-position encounter',exact:true}).selectOption(encounter.encounter+':-1');await form.getByRole('button',{name:'Show handles in Level Editor',exact:true}).click();await expect(page.getByRole('button',{name:'Frame AI firing position',exact:true})).toBeEnabled();const viewport=page.locator('canvas[data-gs-gizmo]');await expect.poll(()=>viewport.getAttribute('data-gs-gizmo').then(raw=>raw?JSON.parse(raw).mode:null)).toBe('translate');const frame=await viewport.evaluate(e=>{const r=e.getBoundingClientRect(),g=JSON.parse(e.dataset.gsGizmo);return {x:r.x,y:r.y,w:r.width,h:r.height,handle:g.handles.X,origin:g.origin};});const px=frame.x+(frame.handle[0]+1)*frame.w/2,py=frame.y+(1-frame.handle[1])*frame.h/2,dx=(frame.handle[0]-frame.origin[0])*frame.w/2,dy=-(frame.handle[1]-frame.origin[1])*frame.h/2,len=Math.hypot(dx,dy);expect(len).toBeGreaterThan(1);await page.mouse.move(px,py);await page.mouse.down();await page.mouse.move(px+dx/len*55,py+dy/len*55,{steps:12});await page.mouse.up();await page.keyboard.press('e');await expect(viewport).toHaveAttribute('data-gs-gizmo',/"mode":"translate"/);expect((await context()).tagSha256).toBe(source.tagSha256);await page.screenshot({path:path.join(output,'native-firing-dragged.png')});await page.getByRole('button',{name:'Review AI firing source',exact:true}).click();panel=page.locator('.native-tag-operations');const firing=panel.locator('.native-ai-firing');await expect(firing.getByRole('spinbutton',{name:'AI firing X',exact:true})).toBeFocused();const positions=await Promise.all(['X','Y','Z'].map(a=>firing.getByRole('spinbutton',{name:'AI firing '+a,exact:true}).inputValue().then(Number)));expect(Math.abs(positions[0]-original.position[0])).toBeGreaterThan(.001);positions.slice(1).forEach((v,i)=>expect(v).toBeCloseTo(original.position[i+1],5));await firing.getByRole('combobox',{name:'AI firing native group',exact:true}).selectOption('b');await firing.getByRole('button',{name:'Preview AI firing position',exact:true}).click();await expect(accept()).toBeEnabled();await accept().click();await expect.poll(async()=>(await context()).tagSha256).not.toBe(source.tagSha256);const afterFiring=await context();await panel.getByRole('button',{name:'Restore before-edit tag',exact:true}).click();await expect.poll(async()=>(await context()).tagSha256).toBe(source.tagSha256);await accept().click();await expect.poll(async()=>(await context()).tagSha256).toBe(afterFiring.tagSha256);
     const difficulty=panel.locator('.native-squad-difficulty');if(!await difficulty.getByRole('combobox',{name:'Native source squad',exact:true}).isVisible())await difficulty.locator(':scope > summary').click();await difficulty.getByRole('combobox',{name:'Native source squad',exact:true}).selectOption(squad.encounter+':'+squad.squad);const tactics=difficulty.locator('.native-tactical-groups');await tactics.locator(':scope > summary').click();const requested={attacking:['a','z'],attackingSearch:['b'],attackingGuard:['z'],defending:['a'],defendingSearch:[],defendingGuard:['b','z']};for(const[mode,enabled]of Object.entries(requested)){await tactics.getByRole('combobox',{name:'Native tactical context',exact:true}).selectOption(mode);const title=mode.replace(/[A-Z]/g,c=>' '+c.toLowerCase()).replace(/^./,c=>c.toUpperCase());for(let i=0;i<26;i++){const g=String.fromCharCode(97+i);await tactics.getByRole('checkbox',{name:'Native firing group '+g.toUpperCase()+' for '+title,exact:true}).setChecked(enabled.includes(g));}}await expect(tactics.getByRole('button',{name:'Preview native tactical groups',exact:true})).toBeDisabled();const review=tactics.locator('details').filter({has:page.locator('summary').filter({hasText:'MCC search-group compatibility'})});await review.locator(':scope > summary').click();await review.getByRole('button',{name:'Include attacking groups in both search contexts',exact:true}).click();const groups={...requested,attackingSearch:['a','b','z'],defendingSearch:['a','z']};await expect(tactics.getByRole('button',{name:'Preview native tactical groups',exact:true})).toBeEnabled();expect((await context()).tagSha256).toBe(afterFiring.tagSha256);await tactics.getByRole('button',{name:'Preview native tactical groups',exact:true}).click();await expect(accept()).toBeEnabled();await accept().click();await expect.poll(async()=>(await context()).tagSha256).not.toBe(afterFiring.tagSha256);finalAccepted=await context();await panel.getByRole('button',{name:'Restore before-edit tag',exact:true}).click();await expect.poll(async()=>(await context()).tagSha256).toBe(afterFiring.tagSha256);await accept().click();await expect.poll(async()=>(await context()).tagSha256).toBe(finalAccepted.tagSha256);record.nativeCombat={realMouseTranslation:true,rotationRefused:true,sourceUnchangedUntilAccept:true,previewAcceptRestore:true,explicitMccDraftReview:true,encounter:encounter.encounter,point:original.index,squad:squad.squad,position:positions,group:'b',groups,startsUnchanged:JSON.stringify(finalAccepted.scenarioStartSquads)===JSON.stringify(accepted.scenarioStartSquads)};expect(record.nativeCombat.startsUnchanged).toBe(true);await save(fork.id);
    }
    if(aiBehaviorReview){
     record.stage='native squad and starting behavior';const beforeBehavior=await context(),row=beforeBehavior.scenarioCombat.find(r=>r.encounter===squad.encounter)?.squads.find(r=>r.index===squad.squad);expect(row?.behaviorIssue??null).toBeNull();expect(row?.behavior).toBeTruthy();const difficulty=panel.locator('.native-squad-difficulty');if(!await difficulty.getByRole('combobox',{name:'Native source squad',exact:true}).isVisible())await difficulty.locator(':scope > summary').click();await difficulty.getByRole('combobox',{name:'Native source squad',exact:true}).selectOption(squad.encounter+':'+squad.squad);const editor=difficulty.locator('.native-squad-behavior');await editor.locator(':scope > summary').click();await editor.getByRole('combobox',{name:'Native squad initial state',exact:true}).selectOption('sleeping');await editor.getByRole('combobox',{name:'Native squad return state',exact:true}).selectOption('guarding');await editor.getByRole('button',{name:'Preview native behavior',exact:true}).click();await expect(accept()).toBeEnabled();expect((await context()).tagSha256).toBe(beforeBehavior.tagSha256);await editor.getByRole('button',{name:'Use squad behavior on all starts',exact:true}).click();await editor.getByRole('button',{name:'Preview native behavior',exact:true}).click();await expect(accept()).toBeEnabled();await accept().click();await expect.poll(async()=>(await context()).tagSha256).not.toBe(beforeBehavior.tagSha256);finalAccepted=await context();const behavior=finalAccepted.scenarioCombat.find(r=>r.encounter===squad.encounter).squads.find(r=>r.index===squad.squad).behavior;expect(behavior.initialState).toBe('sleeping');expect(behavior.returnState).toBe('guarding');expect(behavior.starts.length).toBe(row.behavior.starts.length);expect(behavior.starts.every(p=>p.initialState==='sleeping'&&p.returnState==='guarding')).toBe(true);await panel.getByRole('button',{name:'Restore before-edit tag',exact:true}).click();await expect.poll(async()=>(await context()).tagSha256).toBe(beforeBehavior.tagSha256);await accept().click();await expect.poll(async()=>(await context()).tagSha256).toBe(finalAccepted.tagSha256);record.nativeBehavior={encounter:squad.encounter,squad:squad.squad,source:behavior,separateStartReview:true,explicitAllStarts:true,previewAcceptRestore:true};await page.screenshot({path:path.join(output,'native-behavior-reviewed.png')});await save(fork.id);
    }
    record.stage='full restart';await close();await start();await chooseTool(page,'Map library');await open(fork.title);
    const restarted=await context();expect(restarted.tagSha256).toBe(finalAccepted.tagSha256);if(aiCombatReview||aiBehaviorReview)expect(restarted.scenarioCombat).toEqual(finalAccepted.scenarioCombat);expect(restarted.scenarioStartSquads).toEqual(accepted.scenarioStartSquads);
    Object.assign(record,{beforePosition:point.position,proposal,sourceTagSha256:restarted.tagSha256,previewAcceptRestore:true,saveRestart:true});
    await compileAiStart(fork,record,scenario,map,parent,proposal,restarted.tagSha256,squad,point);
   }
   if(blackEchoReview){
    const record=report.nativeBlackEcho={stage:'create source fixture',scope:'Actual native authoring/cache/readback; geometry/area fixture seeded, no gameplay or Forerunner acceptance',gameplayVerified:false};
    const base=(await state(id)).project,created=await call('create_quickforge_project',{title:'Black Echo native fixture',template:'customBlank',target:'mccSteam'}),seed=created.project,doc=seed.quickForge;
    seed.title='Operation Black Echo native acceptance';doc.name=seed.title;doc.gameMode='campaign';
    for(const field of ['workshop','geometry','materials','skyPath','spawns'])doc[field]=structuredClone(base.quickForge[field]);doc.startingProfile=structuredClone(base.firefight.nativePlayerProfile);doc.placements=[];doc.campaignEncounters=[];
    doc.logic={schemaVersion:1,triggers:[['be_insert',-5,-4],['be_survivors',3,-4],['be_artifact',24,-2],['be_containment',28,2],['be_extract',32,0]].map(([name,x,y])=>({id:crypto.randomUUID(),name,nativeName:name,position:[x,y,1.6],rotation:[0,0,0],dimensions:[2,2,3],visible:true,locked:false})),devices:[],rules:[]};
    const file=path.join(output,'black-echo-campaign.gsproject');await fs.writeFile(file,JSON.stringify(seed),{flag:'wx'});const [candidate]=await call('import_paths',{paths:[file]}),campaignId=candidate.project.id;
    await page.reload();await chooseTool(page,'Map library');await open(seed.title);await chooseTool(page,'Creator Studio');await openMissionBeats(page);
    const create=page.getByRole('button',{name:'Create Black Echo draft',exact:true,includeHidden:true});await revealPagedControl(create);await create.click();await expect(page.locator('.studio-record')).toHaveCount(7);
    const ai=page.locator('details.studio-handoff').filter({has:page.locator('summary').filter({hasText:/^Campaign AI encounters/})});await ai.locator(':scope > summary').click();
    const actors=[['be_marines',marineTag,[-4,-2,.1]],['be_covenant','characters/grunt/grunt minor plasma pistol',[4,3,.1]],['be_flood',floodTag,[26,2,.1]],['be_defense','characters/grunt/grunt minor plasma pistol',[30,-2,.1]]];
    record.stage='author actor groups';
    for(const [name,actor,position] of actors){
     await ai.getByRole('textbox',{name:'New campaign encounter name',exact:true}).fill(name);await ai.getByRole('combobox',{name:'New campaign actor tag',exact:true}).fill(actor);await ai.getByRole('button',{name:'Add encounter',exact:true}).click();
     const count=ai.getByRole('spinbutton',{name:'Campaign starting position count',exact:true});await count.fill('2');await count.press('Tab');
     for(const [index,axis] of ['X','Y','Z'].entries()){const input=ai.getByRole('spinbutton',{name:'Campaign encounter '+axis,exact:true});await input.fill(String(position[index]));await input.press('Tab');}
    }
    if(blackEchoDifficultyReview){
     record.stage='scale native campaign populations';const batch=ai.locator('.campaign-difficulty-batch');await batch.locator('summary').click();
     await batch.getByRole('spinbutton',{name:'Campaign normal population factor',exact:true}).fill('.5');
     await expect(batch.getByRole('table',{name:'Campaign population preview',exact:true})).toContainText('2 → 1');
     await batch.getByRole('button',{name:'Apply campaign population scaling',exact:true}).click();
     const counts=async()=>(await state(campaignId)).project.quickForge.campaignEncounters.map(entry=>entry.difficulty?.normal??entry.count);
     await expect.poll(counts).toEqual([1,1,1,1]);await page.keyboard.press('Control+z');await expect.poll(counts).toEqual([2,2,2,2]);await page.keyboard.press('Control+y');await expect.poll(counts).toEqual([1,1,1,1]);record.populationUndoRedo=true;
    }
    if(blackEchoStartReview){
     record.stage='author individual start source';await ai.getByRole('combobox',{name:'Campaign encounter',exact:true}).selectOption('be_marines');const poses=ai.locator('.campaign-start-poses');await poses.locator('summary').click();
     const input=poses.getByRole('spinbutton',{name:'Campaign start X',exact:true});await input.fill('-4.5');await input.press('Tab');const facing=poses.getByRole('spinbutton',{name:'Campaign start facing degrees',exact:true});await facing.fill('90');await facing.press('Tab');
     const current=async()=>campaignEncounterStarts((await state(campaignId)).project.quickForge.campaignEncounters.find(entry=>entry.name==='be_marines'));
     await expect.poll(async()=>(await current())[0].position[0]).toBe(-4.5);await poses.getByRole('button',{name:'Select AI start in Level Editor',exact:true}).click();
     const canvas=page.locator('canvas[data-gs-gizmo]');await expect(canvas).toHaveCount(1);await expect.poll(()=>canvas.evaluate(element=>JSON.parse(element.dataset.gsGizmo).mode)).toBe('translate');
     const geometry=await canvas.evaluate(element=>{const r=element.getBoundingClientRect();return {rect:{x:r.x,y:r.y,width:r.width,height:r.height},gizmo:JSON.parse(element.dataset.gsGizmo)};});const handle=geometry.gizmo.handles.X,origin=geometry.gizmo.origin;expect(handle).toBeTruthy();
     const x=geometry.rect.x+(handle[0]+1)*geometry.rect.width/2,y=geometry.rect.y+(1-handle[1])*geometry.rect.height/2,dx=(handle[0]-origin[0])*geometry.rect.width/2,dy=-(handle[1]-origin[1])*geometry.rect.height/2,length=Math.hypot(dx,dy);expect(length).toBeGreaterThan(1);
     record.stage='drag authored start X and Z yaw';await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx/length*55,y+dy/length*55,{steps:12});await page.mouse.up();await expect.poll(async()=>(await current())[0].position[0]).not.toBe(-4.5);
     const moved=await current();await page.keyboard.press('e');await dragYawRing(canvas);await expect.poll(async()=>Math.abs((await current())[0].facingRadians-Math.PI/2)).toBeGreaterThan(.01);const rotated=await current();
     await page.keyboard.press('Control+z');await expect.poll(async()=>(await current())[0].facingRadians).toBeCloseTo(moved[0].facingRadians,6);await page.keyboard.press('Control+y');await expect.poll(async()=>(await current())[0].facingRadians).toBeCloseTo(rotated[0].facingRadians,6);
     await page.screenshot({path:path.join(output,'black-echo-ai-poses.png')});await chooseTool(page,'Creator Studio');await openMissionBeats(page);if(!await poses.isVisible())await ai.locator(':scope > summary').click();if(!await facing.isVisible())await poses.locator('summary').click();
     await poses.getByRole('combobox',{name:'Campaign starting location',exact:true}).selectOption('grid-1');await poses.getByRole('checkbox',{name:'Show start marker (editor only)',exact:true}).uncheck();await poses.getByRole('checkbox',{name:'Lock start editing',exact:true}).check();await expect(input).toBeDisabled();await expect(poses.getByRole('button',{name:'Reset AI starts to grid',exact:true})).toBeDisabled();
     record.authoredStartPoses={realMouseTranslation:true,realMouseRotation:true,poseUndoRedo:true,hiddenLockedStartRetained:true,sourcePoses:await current()};
    }
    if(blackEchoPatrolReview){
     record.stage='author native patrol';await ai.getByRole('combobox',{name:'Campaign encounter',exact:true}).selectOption('be_covenant');const route=ai.locator('.campaign-patrol');await route.locator('summary').click();const add=route.getByRole('button',{name:'Add patrol point',exact:true});await add.click();
     const set=async(name,value)=>{const field=route.getByRole('spinbutton',{name,exact:true});await field.fill(String(value));await field.press('Tab');};await set('Campaign patrol X',3);await set('Campaign patrol Y',2);await set('Campaign patrol maximum wait',1.5);await set('Campaign patrol minimum wait',.25);await set('Campaign patrol weight',2.5);await add.click();await set('Campaign patrol X',5);await set('Campaign patrol facing degrees',90);
     const current=async()=>(await state(campaignId)).project.quickForge.campaignEncounters.find(e=>e.name==='be_covenant');await expect.poll(async()=>(await current()).patrol?.points?.[1]?.facingRadians).toBeCloseTo(Math.PI/2,6);await route.getByRole('button',{name:'Select patrol point in Level Editor',exact:true}).click();const canvas=page.locator('canvas[data-gs-gizmo]');await expect.poll(()=>canvas.evaluate(e=>JSON.parse(e.dataset.gsGizmo).mode)).toBe('translate');const handle=await canvas.evaluate(e=>{const r=e.getBoundingClientRect(),g=JSON.parse(e.dataset.gsGizmo);return {x:r.x+(g.handles.X[0]+1)*r.width/2,y:r.y+(1-g.handles.X[1])*r.height/2,dx:(g.handles.X[0]-g.origin[0])*r.width/2,dy:-(g.handles.X[1]-g.origin[1])*r.height/2};});const length=Math.hypot(handle.dx,handle.dy);expect(length).toBeGreaterThan(1);await page.mouse.move(handle.x,handle.y);await page.mouse.down();await page.mouse.move(handle.x+handle.dx/length*45,handle.y+handle.dy/length*45,{steps:10});await page.mouse.up();await expect.poll(async()=>(await current()).patrol.points[1].position[0]).not.toBe(5);const moved=(await current()).patrol.points;await page.keyboard.press('Control+z');await expect.poll(async()=>(await current()).patrol.points[1].position[0]).toBe(5);await page.keyboard.press('Control+y');await expect.poll(async()=>(await current()).patrol.points).toEqual(moved);await page.screenshot({path:path.join(output,'black-echo-patrol-viewport.png')});
     await chooseTool(page,'Creator Studio');await openMissionBeats(page);if(!await route.isVisible())await ai.locator(':scope > summary').click();if(!await add.isVisible())await route.locator('summary').click();await route.getByRole('button',{name:'Move patrol point earlier',exact:true}).click();await expect.poll(async()=>(await current()).patrol.points.map(p=>p.id)).toEqual(moved.map(p=>p.id).reverse());await page.keyboard.press('Control+z');await expect.poll(async()=>(await current()).patrol.points).toEqual(moved);await page.keyboard.press('Control+y');await ai.getByRole('combobox',{name:'Campaign initial AI state',exact:true}).selectOption('moving_loop');await ai.getByRole('combobox',{name:'Campaign return AI state',exact:true}).selectOption('moving_loop_back_and_forth');
     await route.getByRole('checkbox',{name:'Show patrol marker (editor only)',exact:true}).uncheck();await route.getByRole('checkbox',{name:'Lock patrol point editing',exact:true}).check();await expect(route.getByRole('spinbutton',{name:'Campaign patrol X',exact:true})).toBeDisabled();record.nativePatrol={realMouseTranslation:true,undoRedo:true,orderUndoRedo:true,source:(await current()).patrol,behavior:(await current()).behavior};
    }
    if(blackEchoCombatReview){
     record.stage='author firing positions';await ai.getByRole('combobox',{name:'Campaign encounter',exact:true}).selectOption('be_covenant');const combat=ai.locator('.campaign-combat');await combat.locator(':scope > summary').click();await combat.getByRole('button',{name:'Customize firing source',exact:true}).click();const set=async(name,value)=>{const field=combat.getByRole('spinbutton',{name,exact:true});await field.fill(String(value));await field.press('Tab');};await set('Campaign firing X',2);await set('Campaign firing Y',-1);await combat.getByRole('combobox',{name:'Campaign firing position',exact:true}).selectOption('grid-1');await set('Campaign firing X',4);await set('Campaign firing Y',-1);await combat.getByRole('combobox',{name:'Campaign firing group',exact:true}).selectOption('z');await combat.getByRole('button',{name:'Add firing position',exact:true}).click();await set('Campaign firing X',6);await combat.getByRole('combobox',{name:'Campaign firing group',exact:true}).selectOption('b');
     const current=async()=>(await state(campaignId)).project.quickForge.campaignEncounters.find(e=>e.name==='be_covenant');await expect.poll(async()=>(await current()).combat?.points?.[2]?.position[0]).toBe(6);const startsBefore=campaignEncounterStarts(await current());await combat.getByRole('button',{name:'Select firing position in Level Editor',exact:true}).click();const canvas=page.locator('canvas[data-gs-gizmo]');await expect.poll(()=>canvas.evaluate(e=>JSON.parse(e.dataset.gsGizmo).mode)).toBe('translate');const handle=await canvas.evaluate(e=>{const r=e.getBoundingClientRect(),g=JSON.parse(e.dataset.gsGizmo);return{x:r.x+(g.handles.X[0]+1)*r.width/2,y:r.y+(1-g.handles.X[1])*r.height/2,dx:(g.handles.X[0]-g.origin[0])*r.width/2,dy:-(g.handles.X[1]-g.origin[1])*r.height/2};});const length=Math.hypot(handle.dx,handle.dy);expect(length).toBeGreaterThan(1);await page.mouse.move(handle.x,handle.y);await page.mouse.down();await page.mouse.move(handle.x+handle.dx/length*35,handle.y+handle.dy/length*35,{steps:10});await page.mouse.up();await expect.poll(async()=>(await current()).combat.points[2].position[0]).not.toBe(6);const moved=(await current()).combat.points;await page.keyboard.press('Control+z');await expect.poll(async()=>(await current()).combat.points[2].position[0]).toBe(6);await page.keyboard.press('Control+y');await expect.poll(async()=>(await current()).combat.points).toEqual(moved);await page.keyboard.press('e');await expect.poll(()=>canvas.evaluate(e=>JSON.parse(e.dataset.gsGizmo).mode)).toBe('translate');await page.screenshot({path:path.join(output,'black-echo-firing-viewport.png')});
     await chooseTool(page,'Creator Studio');await openMissionBeats(page);if(!await combat.isVisible())await ai.locator(':scope > summary').click();if(!await combat.getByRole('combobox',{name:'Campaign firing group',exact:true}).isVisible())await combat.locator(':scope > summary').click();const groups={attacking:['a','z'],attackingSearch:['b'],attackingGuard:['z'],defending:['a'],defendingSearch:[],defendingGuard:['b','z']};for(const[mode,enabled]of Object.entries(groups)){await combat.getByRole('combobox',{name:'Campaign tactical context',exact:true}).selectOption(mode);const label=mode.replace(/[A-Z]/g,c=>' '+c.toLowerCase()).replace(/^./,c=>c.toUpperCase());for(const g of ['a','b','z'])await combat.getByRole('checkbox',{name:'Include firing group '+g.toUpperCase()+' for '+label,exact:true}).setChecked(enabled.includes(g));}await expect.poll(async()=>(await current()).combat.groups).toEqual(groups);await page.keyboard.press('Control+z');await expect.poll(async()=>(await current()).combat.groups.defendingGuard).toEqual(['b']);await page.keyboard.press('Control+y');await expect.poll(async()=>(await current()).combat.groups).toEqual(groups);
     const compatibility=combat.locator('details').filter({has:page.locator('summary').filter({hasText:'MCC search-group compatibility'})});await compatibility.locator(':scope > summary').click();await compatibility.getByRole('button',{name:'Include attacking groups in both search contexts',exact:true}).click();const compatible={...groups,attackingSearch:['a','b','z'],defendingSearch:['a','z']};await expect.poll(async()=>(await current()).combat.groups).toEqual(compatible);await page.keyboard.press('Control+z');await expect.poll(async()=>(await current()).combat.groups).toEqual(groups);await page.keyboard.press('Control+y');await expect.poll(async()=>(await current()).combat.groups).toEqual(compatible);
     await combat.getByRole('checkbox',{name:'Show firing marker (editor only)',exact:true}).uncheck();await combat.getByRole('checkbox',{name:'Lock firing position editing',exact:true}).check();await expect(combat.getByRole('spinbutton',{name:'Campaign firing X',exact:true})).toBeDisabled();await expect(combat.getByRole('button',{name:'Reset firing source to native defaults',exact:true})).toBeDisabled();await expect.poll(async()=>(await current()).combat.points[2].locked).toBe(true);expect(campaignEncounterStarts(await current())).toEqual(startsBefore);record.nativeCombat={realMouseTranslation:true,undoRedo:true,tacticalUndoRedo:true,compilerCompatibilityUndoRedo:true,startsUnchanged:true,source:(await current()).combat};
    }
    const rows=page.locator('.studio-record');await rows.nth(1).getByRole('combobox',{name:'On rescue failure 2',exact:true}).selectOption('continue');
    record.stage='author conditional routes';
    for(const index of [2,3,4,5,6]){const row=rows.nth(index);if(index!==4)await row.getByRole('checkbox',{name:/^Optional step/}).check();await row.getByRole('combobox',{name:'Mission condition source '+(index+1),exact:true}).selectOption(index===4?'both':'result');}
    await rows.nth(4).getByRole('combobox',{name:'Mission branch decision 5',exact:true}).selectOption('new');
    const add=page.getByRole('button',{name:'Add beat',exact:true,includeHidden:true});await revealPagedControl(add);await add.click();
    const fallback=rows.nth(7);await fallback.getByRole('textbox',{name:'Title',exact:true}).fill('Fall back to evacuation');await fallback.getByRole('combobox',{name:'Trigger',exact:true}).selectOption('triggerVolume');await fallback.getByLabel('Scenario trigger-volume identifier',{exact:true}).fill('be_extract');
    await fallback.getByRole('checkbox',{name:/^Optional step/}).check();await fallback.getByRole('combobox',{name:'Mission condition source 8',exact:true}).selectOption('result');await fallback.getByRole('combobox',{name:'Mission rescue outcome 8',exact:true}).selectOption('failure');
    await fallback.locator('summary').filter({hasText:'Native objective & completion'}).click();await fallback.getByRole('checkbox',{name:'Show native HUD objective while this beat is active',exact:true}).check();
    const review=page.locator('details.studio-handoff').filter({has:page.locator('summary').filter({hasText:/^Native mission build$/})});await revealPagedControl(review.locator(':scope > summary'));await review.locator(':scope > summary').click();await review.getByRole('combobox',{name:'Native mission activation',exact:true}).selectOption('startup');
    record.stage='prepare save and restart';await review.getByRole('button',{name:'Prepare mission for native build',exact:true}).click();
    const mission=async()=>(await state(campaignId)).project.quickForge.logic.handwrittenSources?.find(source=>source.filename==='gs_mission.hsc')?.content;
    await expect.poll(mission).toContain('(set gs_result_2_failed true)');let prepared=await mission();await page.keyboard.press('Control+z');await expect.poll(mission).toBeUndefined();await page.keyboard.press('Control+y');await expect.poll(mission).toBe(prepared);await save(campaignId);
    if(blackEchoCameraReview){
     record.stage='author shared camera take';await page.getByRole('tab',{name:'Cinematic timeline',exact:true}).click();
     for(const [index,position] of [[0,[0,-4,3]],[1,[25,0,3]]]){
      await page.getByRole('button',{name:'Add shot',exact:true}).click();const row=page.locator('.studio-record').nth(index);await row.getByRole('textbox',{name:'Name',exact:true}).fill('Black Echo camera '+(index+1));
      for(const [label,values] of [['Camera XYZ',position],['Look at XYZ',index===0?[4,0,1]:[29,0,1]]])for(const [axisIndex,axis] of ['X','Y','Z'].entries()){const input=row.getByRole('spinbutton',{name:label+' '+axis,exact:true});await input.fill(String(values[axisIndex]));await input.press('Tab');}
      const fov=row.getByRole('spinbutton',{name:'FOV',exact:true});await fov.fill(String(60+index*10));await fov.press('Tab');
     }
     await page.getByRole('button',{name:'Edit cameras visually',exact:true}).click();await openDrawer(page,'Lens & composition');await expect(page.getByRole('textbox',{name:'Camera key name',exact:true})).toHaveValue('Black Echo camera 1');
     const roll=page.getByRole('spinbutton',{name:'Camera roll (degrees)',exact:true});await roll.fill('12');await roll.press('Tab');await page.getByRole('button',{name:'Level editor',exact:true}).focus();await page.keyboard.press('Control+z');await expect(roll).toHaveValue('0');await page.keyboard.press('Control+y');await expect(roll).toHaveValue('12');
     if(blackEchoStoryReview){
      record.stage='prepare native story scenes';await chooseTool(page,'Creator Studio');await openMissionBeats(page);await page.getByRole('tab',{name:'Mission director',exact:true}).click();
      const intro=review.getByRole('checkbox',{name:'Play saved camera shots as the mission intro',exact:true});if(!await intro.isVisible())await review.locator(':scope > summary').click();await intro.setChecked(blackEchoIntroReview);
      if(blackEchoSceneReview){
       for(const [index,shot,phase] of [[1,0,'complete'],[4,1,'start']]){
        const scene=page.locator('.studio-record').nth(index).locator('details').filter({has:page.locator('summary').filter({hasText:/^Camera scene$/})});await revealPagedControl(scene.locator(':scope > summary'));await scene.locator(':scope > summary').click();
        await scene.getByRole('checkbox',{name:'Play a camera scene for this objective',exact:true}).check();await scene.getByRole('combobox',{name:'Mission first shot '+(index+1),exact:true}).selectOption({index:shot});await scene.getByRole('combobox',{name:'Mission last shot '+(index+1),exact:true}).selectOption({index:shot});await scene.getByRole('combobox',{name:'Mission scene timing '+(index+1),exact:true}).selectOption(phase);
       }
      }
      const old=prepared;await review.getByRole('button',{name:'Prepare mission for native build',exact:true}).click();await expect.poll(mission).toContain('(camera_set gs_cs_001 0)');prepared=await mission();
      await review.getByRole('button',{name:'Prepare mission for native build',exact:true}).focus();await page.keyboard.press('Control+z');await expect.poll(mission).toBe(old);await page.keyboard.press('Control+y');await expect.poll(mission).toBe(prepared);
     }else{await openDrawer(page,'In-game recording');await page.getByRole('checkbox',{name:'Include native engine camera controls in the next MCC build',exact:true}).check();await page.getByRole('combobox',{name:'Engine playback',exact:true}).selectOption('sequence');}
     await save(campaignId);
    }
    const frozen=(await state(campaignId)).project;expect(frozen.studio.missions).toHaveLength(8);expect(frozen.studio.missions[4].conditionVolume).toBe('be_containment');expect(frozen.studio.missions[4].conditionResult.failed).toBe(false);
    await page.screenshot({path:path.join(output,'black-echo-prepared.png')});await close();await start();await chooseTool(page,'Map library');await open(seed.title);expect((await state(campaignId)).project.studio).toEqual(frozen.studio);if(blackEchoStartReview||blackEchoPatrolReview||blackEchoCombatReview)expect((await state(campaignId)).project.quickForge.campaignEncounters).toEqual(frozen.quickForge.campaignEncounters);await expect.poll(mission).toBe(prepared);
    if(blackEchoStoryReview){await chooseTool(page,'Creator Studio');await openMissionBeats(page);await page.getByRole('tab',{name:'Mission director',exact:true}).click();const currentReview=page.locator('details.studio-handoff').filter({has:page.locator('summary').filter({hasText:/^Native mission build$/})});const intro=currentReview.getByRole('checkbox',{name:'Play saved camera shots as the mission intro',exact:true});if(!await intro.isVisible())await currentReview.locator(':scope > summary').click();if(blackEchoIntroReview)await expect(intro).toBeChecked();else await expect(intro).not.toBeChecked();if(blackEchoSceneReview){const reopened=(await state(campaignId)).project;expect(reopened.studio.missions[1].cinematicCue.phase).toBe('complete');expect(reopened.studio.missions[4].cinematicCue.phase).toBe('start');}}
    if(blackEchoCameraReview&&!blackEchoStoryReview){await chooseTool(page,'Machinima');await openDrawer(page,'In-game recording');await expect(page.getByRole('checkbox',{name:'Include native engine camera controls in the next MCC build',exact:true})).toBeChecked();await expect(page.getByRole('combobox',{name:'Engine playback',exact:true})).toHaveValue('sequence');}
    record.stage='native compile';await chooseTool(page,'Level editor');await page.getByRole('button',{name:'Build & check playtest',exact:true}).click();
    let build;await expect.poll(async()=>{build=await call('quickforge_build_report',{projectId:campaignId});report.nativeBlackEchoBuild=build;if(build?.jobId)report.failedNativeJobId=build.jobId;return ['validated','failed','blocked'].includes(build?.status);},{timeout:300000,intervals:[1000,2000]}).toBe(true);expect(build.status,JSON.stringify(build.blockers)).toBe('validated');
    record.stage='independent compiled readback';const map=build.build.output,scenario=build.sources.scenarioPath.replaceAll('\\','/'),folder=path.join(output,'black-echo-readback');await fs.mkdir(folder);await run(path.join(invader,'invader-extract.exe'),['-s',scenario+'.scenario','-t',folder,map]);
    const read=async(key,root=folder)=>(await run(path.join(invader,'invader-edit.exe'),['-t',root,'-G',key,scenario+'.scenario'])).stdout.trim();
    expect(await read('type')).toBe('singleplayer');const groups=[];
    for(const [index,[name,actor]] of actors.entries()){
     const prefix='encounters['+index+'].squads[0]';expect(await read('encounters['+index+'].name')).toBe(name);expect(Number(await read(prefix+'.normal_diff_count'))).toBe(blackEchoDifficultyReview?1:2);expect(Number(await read(prefix+'.insane_diff_count'))).toBe(2);
     const actorIndex=Number(await read(prefix+'.actor_type'));expect((await read('actor_palette['+actorIndex+'].reference')).replaceAll('\\','/')).toBe(actor+'.actor_variant');
     const expectedGroup=frozen.quickForge.campaignEncounters[index];if(expectedGroup.combat){const fields=['attacking','attackingSearch','attackingGuard','defending','defendingSearch','defendingGuard'],args=['-t',folder];for(const key of fields)for(let i=0;i<26;i++)args.push('-G',prefix+'.'+key.replace(/[A-Z]/g,c=>'_'+c.toLowerCase())+'.'+String.fromCharCode(97+i));args.push(scenario+'.scenario');const flags=(await run(path.join(invader,'invader-edit.exe'),args)).stdout.trim().split(/\r?\n/).map(Number);expect(flags).toHaveLength(156);fields.forEach((key,k)=>{for(let i=0;i<26;i++)expect(flags[k*26+i]).toBe(Number(expectedGroup.combat.groups[key].includes(String.fromCharCode(97+i))));});const points=[];expect(Number((await run(path.join(invader,'invader-edit.exe'),['-t',folder,'-C','encounters['+index+'].firing_positions',scenario+'.scenario'])).stdout.trim())).toBe(expectedGroup.combat.points.length);for(const[i,p]of expectedGroup.combat.points.entries()){const root='encounters['+index+'].firing_positions['+i+']',position=(await read(root+'.position')).split(',').map(Number),group=await read(root+'.group_index');p.position.forEach((v,a)=>expect(position[a]).toBeCloseTo(v,4));expect(group).toBe(p.group);points.push({position,group});}record.nativeCombat.compiled=points;record.nativeCombat.groupMasks=fields.map(key=>expectedGroup.combat.groups[key].reduce((mask,g)=>mask+(1<<(g.charCodeAt(0)-97)),0));}
     expect(await read(prefix+'.initial_state')).toBe(expectedGroup.behavior?.initialState??'alert');expect(await read(prefix+'.return_state')).toBe(expectedGroup.behavior?.returnState??'alert');const movement=[];if(expectedGroup.patrol){expect(Number(await run(path.join(invader,'invader-edit.exe'),['-t',folder,'-C',prefix+'.move_positions',scenario+'.scenario']).then(v=>v.stdout.trim()))).toBe(expectedGroup.patrol.points.length);for(const [i,p]of expectedGroup.patrol.points.entries()){const root=prefix+'.move_positions['+i+']',position=(await read(root+'.position')).split(',').map(Number),facing=Number(await read(root+'.facing'))*Math.PI/180,wait=(await read(root+'.time')).split(',').map(Number),weight=Number(await read(root+'.weight'));p.position.forEach((v,a)=>expect(position[a]).toBeCloseTo(v,4));expect(Math.abs(Math.atan2(Math.sin(facing-p.facingRadians),Math.cos(facing-p.facingRadians)))).toBeLessThan(.000002);expect(weight).toBeCloseTo(p.weight,4);p.waitSeconds.forEach((v,a)=>expect(wait[a]).toBeCloseTo(v,4));expect(Number(await read(root+'.sequence_id'))).toBe(0);expect([-1,65535]).toContain(Number(await read(root+'.animation')));movement.push({position,facing,wait,weight,sequenceId:0});}if(blackEchoPatrolReview)record.nativePatrol.compiled=movement;}
     const positions=await read(prefix+'.starting_locations[*].position');expect(positions).toBe(await read(prefix+'.starting_locations[*].position',path.join(build.sources.directory,'tags')));const expectedPoses=campaignEncounterStarts(frozen.quickForge.campaignEncounters[index]),compiledPoses=[];for(const [start,expected]of expectedPoses.entries()){const point=prefix+'.starting_locations['+start+']';const position=(await read(point+'.position')).split(',').map(Number),degrees=Number(await read(point+'.facing')),radians=degrees*Math.PI/180;expected.position.forEach((value,axis)=>expect(position[axis]).toBeCloseTo(value,4));expect(Math.abs(Math.atan2(Math.sin(radians-expected.facingRadians),Math.cos(radians-expected.facingRadians)))).toBeLessThan(.000002);compiledPoses.push({position,facingRadians:radians});}groups.push({name,actor,positions,compiledPoses,normalCount:Number(await read(prefix+'.normal_diff_count')),insaneCount:Number(await read(prefix+'.insane_diff_count'))});
    }
    const globals=(await read('globals[*].name')).split(/\r?\n/),scripts=(await read('scripts[*].name')).split(/\r?\n/);for(const name of ['gs_result_2_done','gs_result_2_failed','gs_branch_1_ready','gs_branch_1_inside'])expect(globals).toContain(name);for(const name of ['gs_mission','gs_mission_bootstrap','gs_complete_4','gs_complete_7'])expect(scripts).toContain(name);
    const hud=(await read('hud_messages')).replaceAll('\\','/');await run(path.join(invader,'invader-extract.exe'),['-s',hud,'-t',folder,map]);const names=(await run(path.join(invader,'invader-edit.exe'),['-t',folder,'-G','messages[*].name',hud])).stdout.trim().split(/\r?\n/);for(const name of ['gs_mission_fail_2',...Array.from({length:8},(_,i)=>'gs_mission_obj_'+(i+1))])expect(names).toContain(name);
    if(blackEchoCameraReview){
     record.stage='independent camera and mission readback';const camera=record.nativeCamera={complete:false,gameplayVerified:false,launchTested:false};
     let meta,metaFile,cameraNames;
     if(blackEchoStoryReview){if(blackEchoIntroReview)expect(scripts).toContain('gs_cinematic');else expect(scripts).not.toContain('gs_cinematic');if(blackEchoSceneReview)for(const name of ['gs_scene_2','gs_scene_5'])expect(scripts).toContain(name);expect(scripts).not.toContain('gs_record_start');const binding=JSON.parse(prepared.split('\n')[0].slice('; Spark native mission configuration: '.length));expect(binding.cinematicIntro??true).toBe(blackEchoIntroReview);expect(sameCinematicData(binding.cinematic,frozen.studio.shots)).toBe(true);cameraNames=frozen.studio.shots.map((shot,i)=>shot.cameraMarker||'gs_cs_'+String(i+1).padStart(3,'0'));}
     else{
      for(const name of ['gs_record_start','gs_record_stop','gs_mc_initialize','gs_mc_controls','gs_mc_sequence'])expect(scripts).toContain(name);for(const name of ['gs_mc_active','gs_mc_ready','gs_mc_flash'])expect(globals).toContain(name);
      metaFile=path.join(build.sources.directory,'engine-machinima.json');meta=JSON.parse(await fs.readFile(metaFile,'utf8'));expect(meta.sourceMode).toBe('authored');expect(meta.sourceRecoveryToolSha256).toBeNull();expect(meta.projectFingerprint).toBe(build.projectFingerprint);expect(meta.inheritedScripts).toEqual(expect.arrayContaining(['gs_logic_init','gs_mission','gs_mission_bootstrap','gs_complete_4','gs_complete_7']));cameraNames=meta.cameras;
     }
     expect(cameraNames).toHaveLength(2);const points=[];
     for(const [index,shot] of frozen.studio.shots.entries()){
      const prefix='cutscene_camera_points['+index+']';expect(await read(prefix+'.name')).toBe(cameraNames[index]);const position=(await read(prefix+'.position')).split(',').map(Number);shot.cameraPosition.forEach((value,axis)=>expect(position[axis]).toBeCloseTo(value,5));expect(Number(await read(prefix+'.field_of_view'))).toBeCloseTo(shot.fov,4);
      const delta=shot.lookAt.map((value,axis)=>value-shot.cameraPosition[axis]),length=Math.hypot(...delta),expected=[Math.atan2(delta[1],delta[0])*180/Math.PI,Math.asin(delta[2]/length)*180/Math.PI,shot.roll??0],orientation=(await read(prefix+'.orientation')).split(',').map(Number);expected.forEach((value,axis)=>expect(orientation[axis]).toBeCloseTo(value,4));points.push({name:cameraNames[index],position,orientation,fov:shot.fov});
     }
     const workbench=await call('runtime_workbench_report',{runtimeId:'mccSteam',projectId:campaignId});expect(workbench.sourceIssue).toBeNull();expect(await fs.realpath(workbench.workingSource.tagsDirectory)).toBe(await fs.realpath(path.join(build.sources.directory,'tags')));if(meta)expect(meta.scenarioSha256).toBe(await hash(path.join(workbench.workingSource.tagsDirectory,scenario+'.scenario')));
     Object.assign(camera,{complete:true,storyIntro:blackEchoIntroReview,objectiveScenes:blackEchoSceneReview,points,...(meta?{metadataSha256:await hash(metaFile),sourceHashes:meta.recoveredSourceHashes}:{}),verifiedSourceTags:workbench.workingSource.tagsDirectory});
    }
    expect(await hash(report.nativeBuild.build.output)).toBe(report.nativeBuild.build.sha256);const after=(await state(campaignId)).project;expect(after.studio).toEqual(frozen.studio);expect(await mission()).toBe(prepared);await save(campaignId);await page.screenshot({path:path.join(output,'black-echo-built.png')});
    Object.assign(record,{stage:'passed',complete:true,realUi:true,geometryAndAreasSeeded:true,actorGroupsAuthored:true,undoRedo:true,saveRestart:true,missionSourceSha256:crypto.createHash('sha256').update(prepared).digest('hex'),cacheSha256:await hash(map),scenarioSha256:await hash(path.join(folder,scenario+'.scenario')),groups,globals,scripts,hud,names,manualSettlementGates:[4,7],gameplayVerified:false});console.log('BLACK_ECHO_NATIVE',JSON.stringify(record));
   }
   if(terminalReview){
    // Fixture geometry/control placement reuses the verified source baseline.
    // The workflow under test authors/prepares/saves/builds through actual UI.
    const base=(await state(id)).project,created=await call('create_quickforge_project',{title:'Native terminal mission fixture',template:'customBlank',target:'mccSteam'});
    const seed=created.project,doc=seed.quickForge;seed.title='Native terminal mission acceptance';doc.name=seed.title;
    doc.gameMode='campaign';doc.workshop=structuredClone(base.quickForge.workshop);doc.geometry=structuredClone(base.quickForge.geometry);doc.materials=structuredClone(base.quickForge.materials);doc.skyPath=base.quickForge.skyPath;
    doc.spawns=structuredClone(base.quickForge.spawns);doc.startingProfile=structuredClone(base.firefight.nativePlayerProfile);
    const placementId=crypto.randomUUID();doc.placements=[{id:placementId,name:'Mission terminal',tagClass:'ctrl',tagPath:controlTag,position:[0,0,.1],rotation:[0,0,0],team:0,respawnSeconds:0,visible:true,locked:false}];
    doc.logic={schemaVersion:1,triggers:[],devices:[{placementId,nativeName:'mission_terminal',initialPosition:0,powered:true}],rules:[]};
    const seedPath=path.join(output,'terminal-campaign.gsproject');await fs.writeFile(seedPath,JSON.stringify(seed),{flag:'wx'});
    const [candidate]=await call('import_paths',{paths:[seedPath]});const campaignId=candidate.project.id,campaignTitle=candidate.project.title;
    await page.reload();await chooseTool(page,'Map library');await open(campaignTitle);await chooseTool(page,'Creator Studio');await openMissionBeats(page);
    const add=page.getByRole('button',{name:'Add beat',exact:true,includeHidden:true});await revealPagedControl(add);await add.click();
    const beat=page.locator('.studio-record').first();await beat.getByRole('textbox',{name:'Title',exact:true}).fill('Restore communications');
    await beat.getByRole('combobox',{name:'Trigger',exact:true}).selectOption('deviceActivated');
    await beat.getByRole('combobox',{name:'Mission terminal 1',exact:true}).selectOption('mission_terminal');
    const review=page.locator('details.studio-handoff').filter({has:page.locator('summary').filter({hasText:/^Native mission build$/})});await revealPagedControl(review.locator(':scope > summary'));await review.locator(':scope > summary').click();
    await review.getByRole('combobox',{name:'Native mission activation',exact:true}).selectOption('startup');
    await review.getByRole('button',{name:'Prepare mission for native build',exact:true}).click();
    const mission=async()=>(await state(campaignId)).project.quickForge.logic.handwrittenSources?.find(source=>source.filename==='gs_mission.hsc')?.content;
    await expect.poll(mission).toContain('(device_get_position mission_terminal)');const prepared=await mission();
    await page.keyboard.press('Control+z');await expect.poll(mission).toBeUndefined();await page.keyboard.press('Control+y');await expect.poll(mission).toBe(prepared);await save(campaignId);
    await close();await start();await chooseTool(page,'Map library');await open(campaignTitle);await expect.poll(mission).toBe(prepared);
    await chooseTool(page,'Creator Studio');await openMissionBeats(page);const select=page.getByRole('button',{name:'Select objective terminal in Level Editor',exact:true,includeHidden:true});await revealPagedControl(select);await select.click();
    await expect(page.getByRole('button',{name:'Build & check playtest',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Build & check playtest',exact:true}).click();
    let build;await expect.poll(async()=>{build=await call('quickforge_build_report',{projectId:campaignId});report.nativeTerminalBuild=build;if(build&&['failed','blocked'].includes(build.status))throw Error('Terminal campaign native build rejected: '+JSON.stringify(build.blockers));return build?.status;},{timeout:300000,intervals:[1000,2000]}).toBe('validated');
    const compiledMap=build.build.output,scenarioPath=build.sources.scenarioPath,folder=path.join(output,'terminal-independent-readback');await fs.mkdir(folder);
    const cacheHash=await hash(compiledMap);expect(cacheHash).toBe(build.build.sha256);
    await run(path.join(invader,'invader-extract.exe'),['-s',scenarioPath+'.scenario','-t',folder,compiledMap]);
    const read=async(key,flag='-G')=>(await run(path.join(invader,'invader-edit.exe'),['-t',folder,flag,key,scenarioPath+'.scenario'])).stdout.trim();
    expect(await read('type')).toBe('singleplayer');expect(Number(await read('controls','-C'))).toBe(1);
    expect(await read('object_names[0].name')).toBe('mission_terminal');expect(await read('controls[0].name')).toBe('0');
    const palette=Number(await read('controls[0].type'));expect(Number.isInteger(palette)&&palette>=0).toBe(true);
    expect((await read('control_palette['+palette+'].name')).replaceAll('\\','/')).toBe(controlTag+'.device_control');
    const count=Number(await read('scripts','-C')),scriptNames=[];for(let i=0;i<count;i++)scriptNames.push(await read('scripts['+i+'].name'));
    expect(scriptNames).toContain('gs_mission');expect(scriptNames).toContain('gs_mission_bootstrap');
    const afterBuild=await state(campaignId),validatedAfterBuild=await call('quickforge_validate',{document:afterBuild.project.quickForge});
    const expectedSource=build.sourceDocumentSha256??build.sources.sourceSha256;
    report.terminalSourceAfterBuild={dirty:afterBuild.history.head.dirty,expectedSource,actualSource:validatedAfterBuild.sourceSha256,history:afterBuild.project.history.slice(-5).map(entry=>entry.description)};
    console.log('TERMINAL_SOURCE_AFTER_BUILD',JSON.stringify(report.terminalSourceAfterBuild));
    expect(validatedAfterBuild.sourceSha256,'Compilation must not silently change the authored document').toBe(expectedSource);
    await save(campaignId);expect(await mission()).toBe(prepared);
    expect((await call('quickforge_validate',{document:(await state(campaignId)).project.quickForge})).sourceSha256).toBe(expectedSource);
    await page.screenshot({path:path.join(output,'terminal-built.png')});
    report.nativeTerminalMission={scope:'Owned fixture placement; actual mission objective selection/preparation/Undo/Redo/Save/full restart/native build/independent readback',realUi:true,placementSeeded:true,sourceRestart:true,sourceSha256:crypto.createHash('sha256').update(prepared).digest('hex'),cacheSha256:cacheHash,scenarioSha256:await hash(path.join(folder,scenarioPath+'.scenario')),controlPath:controlTag,controlCount:1,scriptNames,gameplayVerified:false};
   }
   if(process.env.SPARK_FIREFIGHT_ENCOUNTER_REVIEW==='1'){
    await page.evaluate(()=>{window.__sparkEncounterClicks=[];window.addEventListener('click',event=>{
      const control=event.target instanceof Element?event.target.closest('button,summary,a'):null;
      window.__sparkEncounterClicks.push({target:control?.getAttribute('aria-label')??control?.textContent?.trim().slice(0,100),
        workspace:document.querySelector('[aria-label="Current workspace"]')?.textContent});
      if(window.__sparkEncounterClicks.length>32)window.__sparkEncounterClicks.shift();
    },true);});
    // Exercise the existing native source UI on a real authored singleplayer
    // parent. Only read state through IPC; preview/accept/restore/build are clicks.
    await chooseTool(page,'Tag editor');
    const panel=page.locator('.native-tag-operations');await panel.locator('> summary').click();
    await expect(panel.locator('.native-encounter-authoring')).toBeVisible();
    await panel.locator('.native-encounter-authoring > summary').click();
    const context=()=>call('native_tag_context',{projectId:id});
    const baseline=await context();expect(baseline.canAppendEncounter).toBe(true);
    await panel.getByRole('textbox',{name:'Native encounter name',exact:true}).fill('gs_native_review');
    await panel.getByRole('combobox',{name:'Native encounter actor',exact:true}).selectOption('characters/grunt/grunt minor plasma pistol');
    await panel.getByRole('spinbutton',{name:'Native squad actor count',exact:true}).fill('2');
    for(const [axis,value] of [['X','2'],['Y','-2'],['Z','0.1']])await panel.getByRole('spinbutton',{name:'Native actor '+axis,exact:true}).fill(value);
    await panel.getByRole('button',{name:'Preview encounter append',exact:true}).click();
    const accept=()=>panel.getByRole('button',{name:'Accept as new source revision',exact:true});
    await expect(accept()).toBeEnabled();await accept().click();
    await expect.poll(async()=>(await context()).scenarioStartSquads.some(row=>row.encounterName==='gs_native_review'),{timeout:180000,intervals:[1000,2000]}).toBe(true);
    const appended=await context(),squad=appended.scenarioStartSquads.find(row=>row.encounterName==='gs_native_review');
    expect(squad.starts).toHaveLength(2);
    // Manually appended groups retain a source recipe. Direct start/count
    // edits must remain blocked until that recipe can be reconciled; this is
    // not an original-campaign coordinate-edit acceptance fixture.
    await panel.locator('.native-ai-starts > summary').click();
    await panel.getByRole('combobox',{name:'AI starting-position squad',exact:true}).selectOption(squad.encounter+':'+squad.squad);
    await expect(panel.getByRole('spinbutton',{name:'AI start X',exact:true})).toBeDisabled();
    await expect(panel.getByRole('button',{name:'Show handles in Level Editor',exact:true})).toBeDisabled();
    await panel.getByRole('button',{name:'Restore before-edit tag',exact:true}).click();
    await expect.poll(async()=>(await context()).tagSha256,{timeout:180000,intervals:[1000,2000]}).toBe(baseline.tagSha256);
    await expect(accept()).toBeEnabled();await accept().click();
    await expect.poll(async()=>(await context()).tagSha256,{timeout:180000,intervals:[1000,2000]}).toBe(appended.tagSha256);
    const selected=await context();await save(id);await close();await start();await chooseTool(page,'Map library');await open(title);
    const restarted=await context();expect(restarted.tagSha256).toBe(selected.tagSha256);expect(restarted.scenarioStartSquads).toEqual(selected.scenarioStartSquads);
    const previousBuilds=(await call('open_project',{id})).project.builds.map(build=>build.id);
    await openStudioMenu(page);const activeRuntime=page.getByRole('combobox',{name:'Active Halo runtime',exact:true,includeHidden:true});await revealPagedControl(activeRuntime);await activeRuntime.selectOption('mccSteam');await page.keyboard.press('Escape');
    const dock=page.locator('.runtime-dock');await dock.getByRole('button',{name:'Runtime and tool details',exact:true}).click();
    await page.getByRole('button',{name:'Build working tag edits',exact:true}).click();
    let changed;await expect.poll(async()=>{changed=(await call('open_project',{id})).project.builds.find(build=>!previousBuilds.includes(build.id));if(changed?.status==='failed')throw Error('Encounter native build failed: '+JSON.stringify(changed));return changed?.status;},{timeout:300000,intervals:[1000,2000]}).toBe('validated');
    const folder=path.join(output,'encounter-independent-readback');await fs.mkdir(folder);
    await run(path.join(invader,'invader-extract.exe'),['-s',scenario+'.scenario','-t',folder,changed.output]);
    const query=async key=>(await run(path.join(invader,'invader-edit.exe'),['-t',folder,'-G',key,scenario+'.scenario'])).stdout.trim();
    const prefix='encounters['+squad.encounter+'].squads['+squad.squad+']';
    expect(Number(await query(prefix+'.normal_diff_count'))).toBe(2);expect(Number(await query(prefix+'.insane_diff_count'))).toBe(2);
    const compiledPosition=(await query(prefix+'.starting_locations[0].position')).split(',').map(Number);
    selected.scenarioStartSquads.find(row=>row.encounterName==='gs_native_review').starts[0].position.forEach((value,index)=>expect(compiledPosition[index]).toBeCloseTo(value,5));
    expect(await hash(map)).toBe(compiled.build.sha256); // previous-good cache remains untouched
    report.nativeEncounterReview={scope:'manual encounter append, recovery, source persistence, native build and independent readback',realUi:true,sourceRestore:true,sourceRestart:true,recipeGuardPreserved:true,originalCoordinateWorkflow:'not exercised; manually appended recipes require reconciliation',sourceTagSha256:selected.tagSha256,cacheSha256:await hash(changed.output),compiledPosition,normalCount:2,insaneCount:2,gameplayVerified:false};
   }
   if(process.env.SPARK_FIREFIGHT_GAME_REVIEW==='1'){
    await chooseTool(page,'Level editor');await openStudioMenu(page);
    const runtime=page.getByRole('combobox',{name:'Active Halo runtime',exact:true,includeHidden:true});await revealPagedControl(runtime);await runtime.selectOption('mccSteam');await page.keyboard.press('Escape');
    const testScene=page.locator('.runtime-dock').getByRole('button',{name:/^Test Scene/});await expect(testScene).toContainText('Ready');await testScene.click();
    const dialog=page.getByRole('dialog',{name:'Open Standalone scene test',exact:true});await expect(dialog).toBeVisible();
    const tagsPath=(await dialog.locator('dt').filter({hasText:/^Working tags$/}).locator('+dd').innerText()).trim();
    const realTags=(await fs.realpath(tagsPath)).toLowerCase(),realRoot=(await fs.realpath(context.directory)).toLowerCase();
    expect(realTags.startsWith(realRoot+path.sep)).toBe(true);
    await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Open tool',exact:true}).click();
    let game;await expect.poll(async()=>{game=(await call('runtime_tool_processes')).find(p=>p.projectId===id&&p.actionId==='testScene');return !!game;}).toBe(true);
    report.nativeGame={projectId:id,processId:game.processId,executable:game.executable,executableSha256:game.executableSha256,tagsDirectory:game.tagsDirectory,startedAt:new Date().toISOString(),gameLoaded:null,gameplayVerified:false};
    console.log('FIREFIGHT_NATIVE_GAME_REVIEW',JSON.stringify(report.nativeGame));
    const reviewSeconds=Number(process.env.SPARK_FIREFIGHT_REVIEW_SECONDS??180);
    if(!Number.isSafeInteger(reviewSeconds)||reviewSeconds<10||reviewSeconds>900)throw Error('Native review requires a bounded10-900second window');
    report.nativeGame.reviewSeconds=reviewSeconds;
    try{await expect.poll(async()=>{game=(await call('runtime_tool_processes')).find(p=>p.processId===report.nativeGame.processId);return game?.status;},{timeout:reviewSeconds*1000,intervals:[1000,2000]}).not.toBe('running');}
    finally{
     report.nativeGame.status=game?.status??'unknown';report.nativeGame.exitCode=game?.exitCode??null;report.nativeGame.diagnostics=[];
     for(const name of ['debug.txt','reports/debug.txt','exception.txt','reports/exception.txt']){
      const file=path.join(path.dirname(tagsPath),name),info=await fs.lstat(file).catch(()=>null);
      if(info?.isFile()&&!info.isSymbolicLink()&&info.size<4*1024**2){const bytes=await fs.readFile(file);report.nativeGame.diagnostics.push({file:name,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),tail:bytes.subarray(-65536).toString('utf8')});}
     }
    }
    expect(report.nativeGame.exitCode).toBe(0);
   }
   expect(report.errors).toEqual([]);await close();
   }catch(error){
    report.error=String(error);report.stack=error.stack;
    // Capture while the owned app is alive; shutdown below closes its IPC.
    const failedJob=report.failedNativeJobId??report.nativeTerminalBuild?.jobId??report.nativeBuild?.jobId;
    if(call&&failedJob){const boot=await call("bootstrap").catch(()=>null);report.nativeCompilerEvents=boot?.logs?.filter(row=>row.jobId===failedJob).slice(-300);}
    report.nativeInputTrace=await page?.evaluate(()=>window.__sparkEncounterClicks??[]).catch(()=>[]);
    report.nativePanelDiagnostic=await page?.locator('.native-tag-operations').innerText().then(text=>text.slice(-16384),()=>null);
    await page?.screenshot({path:path.join(output,'firefight-failure.png')}).catch(()=>{});
    throw error;
   }finally{
    // Close the owned app BEFORE the source/storage callbacks unwind. Its
    // normal window shutdown releases the exact Standalone child and alias.
    // Killing only the app here would orphan its game and leave active writers
    // behind while the parent attempts to dispose the native tag workspace.
    if(child&&child.exitCode===null&&child.signalCode===null){
     try{await close();report.shutdown={normal:true,ownedPreviewClosedWithApp:true};}
     catch(error){report.shutdown={normal:false,error:String(error),ownedProcessTreeStopped:true};await stopQaProcess(child);child=null;}
    }
    if(report.nativeGame){
     const reports=path.join(path.dirname(report.nativeGame.tagsDirectory),'reports');
     const dirs=await fs.readdir(reports,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
     if(dirs.length>128)throw Error('Native report directory exceeds its diagnostic bound');
     for(const dir of dirs.filter(row=>row.isDirectory()&&!row.isSymbolicLink()&&/^reports_[0-9]{2}$/.test(row.name))){
      const file=path.join(reports,dir.name,'debug_primary.txt'),info=await fs.lstat(file).catch(()=>null);
      if(info?.isFile()&&!info.isSymbolicLink()&&info.size<4*1024**2){const bytes=await fs.readFile(file);(report.nativeGame.diagnostics??=[]).push({file:'reports/'+dir.name+'/debug_primary.txt',bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),tail:bytes.subarray(-65536).toString('utf8')});}
     }
    }
    await browser?.close().catch(()=>{});browser=null;
   }
  };
 if(ceMissionReview){
  const tags=path.resolve(process.env.SPARK_NATIVE_CE_MISSION_TAGS??'');if(!process.env.SPARK_NATIVE_CE_MISSION_TAGS)throw Error('Prepared CE tags required');await assertQaOutputPath(tags,{reservationBytes:0});
  const globals=await fs.lstat(path.join(tags,'globals','globals.globals')).catch(()=>null);if(!globals?.isFile()||globals.isSymbolicLink())throw Error('Prepared CE source requires its matching globals/globals.globals. Singleplayer cache extraction skips it by default; explicitly review and extract it with Invader --non-mp-globals. No source was replaced.');
  report.sourcePreparation={scope:'Reuse prepared matching CE tags; no SDK copy/extraction, no game launch'};
  const run=async(binary,args)=>{const result=await new Promise((resolve,reject)=>{const process=execFile(binary,args,{windowsHide:true,maxBuffer:4*1024**2,timeout:120000},(error,stdout,stderr)=>error?reject(Object.assign(error,{stdout,stderr})):resolve({stdout,stderr}));context.trackProcess(process).catch(reject);});return result;};
  if((ceCameraReview||ceCinematicReview)&&!process.env.SPARK_NATIVE_CE_MISSION_RESUME){const scenario='levels/forerunner/be_native/be_native.scenario',file=path.join(tags,scenario),beforeSha256=await hash(file),count=Number((await run(path.join(invader,'invader-edit.exe'),['-t',tags,'-C','cutscene_camera_points',scenario])).stdout.trim());if(count>510)throw Error('No safe camera fixture slots');const args=['-t',tags,'-I','cutscene_camera_points','2','end'];for(const [i,name]of ['gs_camera_fixture_a','gs_camera_fixture_b'].entries())for(const [field,value]of [['name',name],['position','58.84561,-89.47212,2.5'],['orientation','0.7853982,-0.1,0.2'],['field_of_view',String(70*Math.PI/180)]])args.push('-S','cutscene_camera_points['+(count+i)+'].'+field,value);args.push(scenario);await run(path.join(invader,'invader-edit.exe'),args);report.sourcePreparation.cameraFixture={beforeSha256,afterSha256:await hash(file),firstIndex:count};}
  if(ceCommandReview&&!process.env.SPARK_NATIVE_CE_MISSION_RESUME){const scenario='levels/forerunner/be_native/be_native.scenario',file=path.join(tags,scenario);const beforeSha256=await hash(file),count=Number((await run(path.join(invader,'invader-edit.exe'),['-t',tags,'-C','command_lists',scenario])).stdout.trim());if(count>254)throw Error('No safe fixture command slots');await run(path.join(invader,'invader-edit.exe'),['-t',tags,'-I','command_lists','2','end','-S','command_lists['+count+'].name','gs_command_fixture_a','-S','command_lists['+(count+1)+'].name','gs_command_fixture_b',scenario]);if(ceCommandContentReview){const prefix='command_lists['+(count+1)+']';await run(path.join(invader,'invader-edit.exe'),['-t',tags,'-I',prefix+'.commands','2','end','-I',prefix+'.points','2','end','-S',prefix+'.commands[1].atom_type','loop','-S',prefix+'.commands[1].command','0','-S',prefix+'.points[0].position','58.845612,-89.472122,0.078429','-S',prefix+'.points[1].position','59.845612,-89.472122,0.078429',scenario]);}report.sourcePreparation.commandListFixture={beforeSha256,afterSha256:await hash(file),firstIndex:count,emptyLists:!ceCommandContentReview,gameplayVerified:false};}
  await exercise({root:fixtureRoot,tags,run});
 }
 else if(saveOnly)await exercise({root:fixtureRoot,tags:null});
 else await nativeStandaloneBaseline({context:{...context,directory:fixtureRoot},archive,kit,invader,report:report.sourcePreparation,prepareOnly:true,
  additionalRoots:['characters/grunt/grunt minor plasma pistol.actor_variant','ui/ui_tags_loaded_solo_scenario_type.tag_collection',...(terminalReview?[controlTag+'.device_control']:[]),...(blackEchoReview?[marineTag+'.actor_variant',floodTag+'.actor_variant']:[])],onPrepared:exercise});
 report.complete=true;
});}catch(error){report.error=String(error);report.stack=error.stack;if(call){const boot=await call('bootstrap').catch(()=>null);report.failedSaveDocuments=boot?.entries?.map(entry=>({id:entry.id,title:entry.title}));}
 const failedJob=report.failedNativeJobId??report.nativeTerminalBuild?.jobId??report.nativeBuild?.jobId;
 if(call&&failedJob&&!report.nativeCompilerEvents){const boot=await call('bootstrap').catch(()=>null);report.nativeCompilerEvents=boot?.logs?.filter(row=>row.jobId===failedJob).slice(-300);}
 await page?.screenshot({path:path.join(output,'firefight-failure.png')}).catch(()=>{});throw error;}
finally{if(child&&child.exitCode===null&&child.signalCode===null){await stopQaProcess(child);}await browser?.close().catch(()=>{});await fs.writeFile(path.join(output,'acceptance.json'),JSON.stringify(report,null,2));}
