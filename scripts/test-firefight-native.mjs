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
import {chooseTool} from '../tests/ui/helpers/navigation.ts';
import {assertQaOutputPath,withDevelopmentWorkspace,waitForQaExit} from './native-qa-storage.mjs';
import {nativeStandaloneBaseline} from './native-standalone-baseline.mjs';
const [appArg,outputArg,kitArg,archiveArg,invaderArg]=process.argv.slice(2);
if(!invaderArg)throw Error('test-firefight-native <source-matched app> <fresh output> <owned H1A kit> <owned SDK archive> <Invader>');
const app=path.resolve(appArg),output=path.resolve(outputArg),kit=path.resolve(kitArg),archive=path.resolve(archiveArg),invader=path.resolve(invaderArg);
const expect=assertion.configure({timeout:60000});
const hash=async file=>{const digest=crypto.createHash('sha256');for await(const b of createReadStream(file))digest.update(b);return digest.digest('hex');};
await fs.mkdir(await assertQaOutputPath(output));
const report={schemaVersion:1,complete:false,mockedIpc:false,gameplayVerified:false,appSha256:await hash(app),sourcePreparation:{},errors:[],normalRestarts:0};
let browser,page,child,call;
try{await withDevelopmentWorkspace('firefight-native-ui',async context=>{
 await nativeStandaloneBaseline({context,archive,kit,invader,report:report.sourcePreparation,prepareOnly:true,
  additionalRoots:['characters/grunt/grunt minor plasma pistol.actor_variant','ui/ui_tags_loaded_solo_scenario_type.tag_collection'],
  onPrepared:async ({root:sourceRoot,drive,run,tags})=>{
   const library=path.join(output,'library'),webview=path.join(output,'webview');
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
   const save=async id=>{await page.keyboard.press('Control+s');await expect.poll(async()=>(await state(id)).history?.head.dirty).toBe(false);};
   const open=async title=>{await page.locator('.map-card').filter({has:page.getByRole('heading',{name:title,exact:true})}).click();};
   await start();
   const boot=await call('bootstrap');await call('save_settings',{settings:{...boot.settings,onboardingCompleted:true,walkthroughEnabled:false,autoBuild:false,hekDirectory:kit,hekTagsDirectory:tags,invaderDirectory:invader,hekFlavor:'h1aEk'}});
   // A fresh project from the existing creator API, then the actual Workshop
   // example button. These are not recovered proprietary scenario/tag bytes.
   const created=await call('create_quickforge_project',{title:'Native solo Firefight fixture',template:'customBlank',target:'mccSteam'});
   await page.reload();await open(created.project.title);
   await page.getByRole('button',{name:'BSP Workshop',exact:true}).click();
   await page.getByRole('button',{name:'Two rooms + corridor + ramp',exact:true}).click();await save(created.project.id);
   const p=(await state(created.project.id)).project;
   expect(p.quickForge.workshop.brushes).toHaveLength(4);
   report.immediateWorkshopSave={realUi:true,brushes:p.quickForge.workshop.brushes.length,dirty:(await state(created.project.id)).history.head.dirty};
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
   expect(report.errors).toEqual([]);await close();
  }});
 report.complete=true;
});}catch(error){report.error=String(error);report.stack=error.stack;if(call){const boot=await call('bootstrap').catch(()=>null);report.failedSaveDocuments=boot?.entries?.map(entry=>({id:entry.id,title:entry.title}));}
 if(call&&report.nativeBuild?.jobId){const boot=await call('bootstrap').catch(()=>null);report.nativeCompilerEvents=boot?.logs?.filter(row=>row.jobId===report.nativeBuild.jobId).slice(-300);}
 await page?.screenshot({path:path.join(output,'firefight-failure.png')}).catch(()=>{});throw error;}
finally{if(child&&child.exitCode===null&&child.signalCode===null){child.kill();await waitForQaExit(child).catch(()=>{});}await browser?.close().catch(()=>{});await fs.writeFile(path.join(output,'acceptance.json'),JSON.stringify(report,null,2));}
