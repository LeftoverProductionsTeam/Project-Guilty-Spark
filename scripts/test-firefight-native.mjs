// Real embedded Windows application + owner-installed native Halo toolchain.
// Fixture setup is source authoring. Preparation, history, Save, restart and
// Build actions use visible controls; IPC below reads state, not simulated game.
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {createReadStream} from 'node:fs';
import {spawn} from 'node:child_process';
import {chromium,expect as assertion} from '@playwright/test';
import {chooseTool,openStudioMenu,revealPagedControl} from '../tests/ui/helpers/navigation.ts';
import {assertQaOutputPath,withDevelopmentWorkspace,waitForQaExit,stopQaProcess} from './native-qa-storage.mjs';
import {nativeStandaloneBaseline} from './native-standalone-baseline.mjs';
const [appArg,outputArg,kitArg,archiveArg,invaderArg]=process.argv.slice(2);
if(!invaderArg)throw Error('test-firefight-native <source-matched app> <fresh output> <owned H1A kit> <owned SDK archive> <Invader>');
const app=path.resolve(appArg),output=path.resolve(outputArg),kit=path.resolve(kitArg),archive=path.resolve(archiveArg),invader=path.resolve(invaderArg);
const saveOnly=process.env.SPARK_NATIVE_WORKSHOP_SAVE_ONLY==='1',terminalReview=process.env.SPARK_NATIVE_TERMINAL_REVIEW==='1',controlTag='levels/b40/devices/holo control/b40_holo control';
if(process.env.SPARK_NATIVE_AI_START_REVIEW==='1'&&(terminalReview||process.env.SPARK_FIREFIGHT_ENCOUNTER_REVIEW==='1'||process.env.SPARK_FIREFIGHT_GAME_REVIEW==='1'))throw Error('Run the recovered-start UI variant separately from terminal, append and game variants.');
const expect=assertion.configure({timeout:60000});
const hash=async file=>{const digest=crypto.createHash('sha256');for await(const b of createReadStream(file))digest.update(b);return digest.digest('hex');};
await fs.mkdir(await assertQaOutputPath(output));
const report={scope:saveOnly?'native-workshop-immediate-save-only':'native-solo-creator',schemaVersion:1,complete:false,mockedIpc:false,gameplayVerified:false,appSha256:await hash(app),sourcePreparation:{},errors:[],normalRestarts:0};
let browser,page,child,call;
try{await withDevelopmentWorkspace('firefight-native-ui',async context=>{
 const fixtureRoot=path.join(output,'native-fixture');await fs.mkdir(fixtureRoot);
 const exercise=async ({root:sourceRoot,drive,run,tags})=>{
   const resumeFile=process.env.SPARK_NATIVE_AI_START_RESUME;
   let prior;
   if(resumeFile){
    if(process.env.SPARK_NATIVE_AI_START_REVIEW!=='1'||saveOnly)throw Error('Recovered-start resume is a separate native rebuild continuation');
    await assertQaOutputPath(resumeFile,{reservationBytes:0});const info=await fs.lstat(resumeFile);
    if(!info.isFile()||info.isSymbolicLink()||info.size>2*1024**2)throw Error('Invalid recovered-start continuation receipt');
    prior=JSON.parse(await fs.readFile(resumeFile,'utf8'));
    if(prior.complete||prior.errors?.length||prior.originalAiStart?.stage!=='build accepted native starts'||!prior.sourcePreparation?.originalInputsUnchanged||prior.normalRestarts<2)throw Error('Continuation lacks the completed UI/source/restart gate');
   }
   const library=path.join(prior?path.dirname(resumeFile):output,'library'),webview=path.join(prior?path.dirname(resumeFile):output,'webview');
   async function start(){
    const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
    child=spawn(app,[],{windowsHide:true,stdio:'ignore',env:{...context.env,GUILTY_SPARK_DATA_DIR:library,WEBVIEW2_USER_DATA_FOLDER:webview,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port='+port}});
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
    await waitForQaExit(child);expect(child.exitCode).toBe(0);await browser.close();browser=null;child=null;report.normalRestarts++;
   }
   const state=async id=>{const status=await call('read_workspace_history',{projectId:id});return {...status,project:status.history?.snapshots.find(snapshot=>snapshot.key===status.history.head.current)?.project};};
   const save=async id=>{
    await page.evaluate(()=>{window.__sparkSaveFrame={ran:false};requestAnimationFrame(()=>{window.__sparkSaveFrame.ran=true;});});
    try{await page.keyboard.press('Control+s');await expect.poll(async()=>(await state(id)).history?.head.dirty).toBe(false);}
    catch(error){
     const current=await state(id),stored=await call('open_project',{id});
     report.saveFailure={projectId:id,head:current.history?.head,history:current.project?.history?.slice(-5),currentMaterials:current.project?.quickForge?.materials,storedMaterials:stored.project?.quickForge?.materials,
      controls:await page.evaluate(()=>({hasFocus:document.hasFocus(),visibility:document.visibilityState,animationFrame:window.__sparkSaveFrame,focus:document.activeElement?.outerHTML.slice(0,500),dialogs:[...document.querySelectorAll('[role="dialog"]')].map(e=>e.textContent?.slice(0,500))})),statuses:(await page.getByRole('status').allTextContents()).map(text=>text.slice(-700)).slice(-8)};
     console.log('NATIVE_SAVE_FAILURE',JSON.stringify(report.saveFailure));throw error;
    }
   };
   const open=async title=>{await page.locator('.map-card').filter({has:page.getByRole('heading',{name:title,exact:true})}).click();};
   async function compileAiStart(fork,record,scenario,map,parent,proposal,acceptedHash,squad,point){
    const beforeBuilds=(await call('open_project',{id:fork.id})).project.builds.map(row=>row.id);
    await openStudioMenu(page);const runtime=page.getByRole('combobox',{name:'Active Halo runtime',exact:true,includeHidden:true});await revealPagedControl(runtime);await runtime.selectOption('mccSteam');await page.keyboard.press('Escape');
    await page.locator('.runtime-dock').getByRole('button',{name:'Runtime and tool details',exact:true}).click();
    record.stage='build accepted native starts';await page.getByRole('button',{name:'Build working tag edits',exact:true}).click();
    let changed,compileIssue;await expect.poll(async()=>{changed=(await call('open_project',{id:fork.id})).project.builds.find(row=>!beforeBuilds.includes(row.id));if(changed)report.failedNativeJobId=changed.id;if(!changed)compileIssue=(await page.locator('.toast').allTextContents()).find(text=>text.includes('Native tag integrity check blocked compilation:'))?.slice(-1800);return !!compileIssue||['validated','failed','blocked'].includes(changed?.status);},{timeout:300000,intervals:[1000,2000]}).toBe(true);
    if(compileIssue){record.compilerIssue=compileIssue;throw Error(compileIssue);}expect(changed.status).toBe('validated');
    const folder=path.join(output,'ai-start-independent-readback');await fs.mkdir(folder);await run(path.join(invader,'invader-extract.exe'),['-s',scenario+'.scenario','-t',folder,changed.output]);
    const key='encounters['+squad.encounter+'].squads['+squad.squad+'].starting_locations['+point.index+'].position';
    const query=await run(path.join(invader,'invader-edit.exe'),['-t',folder,'-G',key,scenario+'.scenario']);const compiledPosition=query.stdout.trim().split(',').map(Number);
    proposal.forEach((value,index)=>expect(compiledPosition[index]).toBeCloseTo(value,5));expect(await hash(map)).toBe(record.originalCacheSha256);expect(await hash(parent.output)).toBe(record.parentCacheSha256);
    Object.assign(record,{stage:'passed',complete:true,realUi:true,mouseAxisDrag:true,flightReleased:true,reviewNavigation:true,previewAcceptRestore:true,saveRestart:true,beforePosition:record.beforePosition,proposal,compiledPosition,sourceTagSha256:acceptedHash,cacheSha256:await hash(changed.output),scenarioSha256:await hash(path.join(folder,scenario+'.scenario')),originalAndPreviousGoodUnchanged:true});
    await page.screenshot({path:path.join(output,'ai-start-accepted.png')});await save(fork.id);console.log('ORIGINAL_AI_START_NATIVE',JSON.stringify(record));
   }
   try{
   await start();
   const boot=await call('bootstrap');await call('save_settings',{settings:{...boot.settings,onboardingCompleted:true,walkthroughEnabled:false,autoBuild:false,hekDirectory:kit,hekTagsDirectory:tags,invaderDirectory:invader,hekFlavor:'h1aEk'}});
   if(prior){
    const original=prior.originalAiStart;await chooseTool(page,'Map library');await open('Recovered native AI start acceptance');
    const fork=(await call('open_project',{id:original.sourceProjectId})).project;
    const context=await call('native_tag_context',{projectId:fork.id});
    const squad=context.scenarioStartSquads.find(row=>row.encounterName==='gs_w01_g01'),point=squad?.starts?.[0];expect(point).toBeTruthy();
    const review=context.history.find(row=>row.currentState==='after'&&row.actorPositions?.length===1);expect(review).toBeTruthy();
    const proposal=review.actorPositions[0];expect(point.position).toEqual(proposal);
    const beforePosition=prior.independentReadback.nativePositions[0];expect(proposal).not.toEqual(beforePosition);
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
   await page.getByRole('button',{name:'Two rooms + corridor + ramp',exact:true}).click();await save(created.project.id);
   const p=(await state(created.project.id)).project;
   expect(p.quickForge.workshop.brushes).toHaveLength(4);
   report.immediateWorkshopSave={realUi:true,brushes:p.quickForge.workshop.brushes.length,dirty:(await state(created.project.id)).history.head.dirty};
   if(saveOnly){report.sourcePreparation={scope:'No SDK/tag staging or native compilation required for this Save reproduction'};await page.screenshot({path:path.join(output,'workshop-save.png')});await close();return;}
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
    expect(baseline.startEditIssue).toBeNull();expect(baseline.protectedSquadEncounters).not.toContain('gs_w01_g01');
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
    expect((await context()).tagSha256).toBe(baseline.tagSha256);
    await page.screenshot({path:path.join(output,'ai-start-dragged.png')});await page.getByRole('button',{name:'Review AI start source',exact:true}).click();
    panel=page.locator('.native-tag-operations');const input=panel.getByRole('spinbutton',{name:'AI start X',exact:true});await expect(input).toBeFocused();
    const proposal=await Promise.all(['X','Y','Z'].map(axis=>panel.getByRole('spinbutton',{name:'AI start '+axis,exact:true}).inputValue().then(Number)));
    expect(Math.abs(proposal[0]-point.position[0])).toBeGreaterThan(.001);expect(proposal[1]).toBeCloseTo(point.position[1],5);expect(proposal[2]).toBeCloseTo(point.position[2],5);
    record.stage='review accept restore and reaccept';await panel.getByRole('button',{name:'Preview AI starting position',exact:true}).click();
    const accept=()=>panel.getByRole('button',{name:'Accept as new source revision',exact:true});await expect(accept()).toBeEnabled();await accept().click();
    await expect.poll(async()=>(await context()).tagSha256).not.toBe(baseline.tagSha256);const accepted=await context();
    await panel.getByRole('button',{name:'Restore before-edit tag',exact:true}).click();await expect.poll(async()=>(await context()).tagSha256).toBe(baseline.tagSha256);
    await expect(accept()).toBeEnabled();await accept().click();await expect.poll(async()=>(await context()).tagSha256).toBe(accepted.tagSha256);await save(fork.id);
    record.stage='full restart';await close();await start();await chooseTool(page,'Map library');await open(fork.title);
    const restarted=await context();expect(restarted.tagSha256).toBe(accepted.tagSha256);expect(restarted.scenarioStartSquads).toEqual(accepted.scenarioStartSquads);
    Object.assign(record,{beforePosition:point.position,proposal,sourceTagSha256:restarted.tagSha256,previewAcceptRestore:true,saveRestart:true});
    await compileAiStart(fork,record,scenario,map,parent,proposal,restarted.tagSha256,squad,point);
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
    await page.reload();await chooseTool(page,'Map library');await open(campaignTitle);await chooseTool(page,'Creator Studio');
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
    await chooseTool(page,'Creator Studio');const select=page.getByRole('button',{name:'Select objective terminal in Level Editor',exact:true,includeHidden:true});await revealPagedControl(select);await select.click();
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
 if(saveOnly)await exercise({root:fixtureRoot,tags:null});
 else await nativeStandaloneBaseline({context:{...context,directory:fixtureRoot},archive,kit,invader,report:report.sourcePreparation,prepareOnly:true,
  additionalRoots:['characters/grunt/grunt minor plasma pistol.actor_variant','ui/ui_tags_loaded_solo_scenario_type.tag_collection',...(terminalReview?[controlTag+'.device_control']:[])],onPrepared:exercise});
 report.complete=true;
});}catch(error){report.error=String(error);report.stack=error.stack;if(call){const boot=await call('bootstrap').catch(()=>null);report.failedSaveDocuments=boot?.entries?.map(entry=>({id:entry.id,title:entry.title}));}
 const failedJob=report.failedNativeJobId??report.nativeTerminalBuild?.jobId??report.nativeBuild?.jobId;
 if(call&&failedJob){const boot=await call('bootstrap').catch(()=>null);report.nativeCompilerEvents=boot?.logs?.filter(row=>row.jobId===failedJob).slice(-300);}
 await page?.screenshot({path:path.join(output,'firefight-failure.png')}).catch(()=>{});throw error;}
finally{if(child&&child.exitCode===null&&child.signalCode===null){await stopQaProcess(child);}await browser?.close().catch(()=>{});await fs.writeFile(path.join(output,'acceptance.json'),JSON.stringify(report,null,2));}
