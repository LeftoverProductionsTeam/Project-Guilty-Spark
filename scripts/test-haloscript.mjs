import assert from 'node:assert/strict';
import { blackEchoMission, emptyCreatorStudio } from '../src/creatorStudio.ts';
import { recoveredCampaignMission, exportHaloCeTransport, attachNativeCampaignMission, exportHaloCeMission, exportHaloCeCinematic, exportHaloCeFirefight, scriptManifest } from '../src/haloScript.ts';
const studio=emptyCreatorStudio();
studio.missions=[
  {id:'one',title:'First Contact',objective:'Move to the bridge',trigger:'triggerVolume',triggerRef:'gs_bridge',encounterName:''},
  {id:'two',title:'Elites',objective:'Clear',trigger:'encounterCleared',encounterName:'bridge/elites'},
  {id:'three',title:'Wait',objective:'Next',trigger:'timer',timerSeconds:2,encounterName:''},
  {id:'four',title:'Manually continue',objective:'Next',trigger:'manual',encounterName:''},
];
let exportResult=exportHaloCeMission(studio);
assert.ok(exportResult.content.includes('(script dormant gs_mission'));
assert.ok(exportResult.content.includes('(volume_test_objects gs_bridge (players))'));
assert.ok(exportResult.content.includes('(sleep_until (> (ai_living_count bridge/elites) 0) 15)'));
assert.ok(exportResult.content.includes('(sleep 60)'));
assert.ok(exportResult.content.includes('(global boolean gs_manual_4_done false)'));
assert.ok(exportResult.content.includes('(sleep_until gs_manual_4_done 15)'));
assert.ok(exportResult.content.includes('(script static void gs_complete_4'));
assert.equal(exportResult.dependencies.length,2);
assert.equal(exportResult.activation,'(wake gs_mission)');
assert.ok(!exportResult.content.includes('script startup void')); 
assert.equal(JSON.parse(scriptManifest(exportResult)).gameplayVerified,false);
studio.missions[1].encounterName='pwn" ) (ai_erase_all)';
assert.throws(()=>exportHaloCeMission(studio),/identifier/);
studio.missions[1].encounterName='bridge/elites';
studio.shots=[{id:'shot1',name:'Look',durationMs:1500,cameraPosition:[0,0,0],lookAt:[0,1,0],fov:60,subtitle:'',cameraMarker:'gs_intro'}];
const camera=exportHaloCeCinematic(studio);
assert.ok(camera.content.includes('(camera_set gs_intro 45)'));
assert.ok(camera.content.includes('(camera_control false)'));
studio.shots[0].cameraMarker=undefined;
assert.throws(()=>exportHaloCeCinematic(studio),/cutscene camera point/);
const config={schemaVersion:1,waves:[{id:'w',name:'Test',groups:[{enemyId:'elite',count:2}],boss:false,scoreMultiplierMilli:1000}],
  enemies:[{id:'elite',name:'Elite',actorVariantPath:'characters/elite',points:100}],rounds:2,endless:false,maxAlive:8,intermissionMs:2000};
const firefight=exportHaloCeFirefight(config);
assert.ok(firefight.content.includes('(ai_place gs_w01_g01)'));
assert.equal(firefight.content.split('(gs_wave_01)').length,3);
assert.equal(firefight.dependencies.length,1);
assert.ok(firefight.content.includes('(script dormant gs_firefight'));
assert.equal(firefight.activation,'(wake gs_firefight)');
assert.throws(()=>exportHaloCeFirefight({...config,endless:true}),/Endless/);
assert.throws(()=>exportHaloCeFirefight({...config,waves:[{...config.waves[0],groups:[{enemyId:'elite',count:9}]}]}),/starting actors/);
console.log('PASS: CE HaloScript authoring, validated scenario refs, cutscene points, finite AI waves, anti-injection, dependency manifest');

// Optional objectives must gate the actual native AI/HUD/wait instructions,
// not merely annotate a mission plan. Required native bindings stay explicit.
const operation=emptyCreatorStudio();let beatId=0;operation.missions=blackEchoMission(()=>`black_echo_${++beatId}`);
const optional=exportHaloCeMission(operation),gate=optional.content.indexOf('(if (volume_test_objects be_containment (players)) (begin'),spawn=optional.content.indexOf('(ai_place be_flood)'),end=optional.content.indexOf('  ))',spawn),next=optional.content.indexOf('(ai_place be_defense)');
assert.ok(gate>=0&&gate<spawn&&spawn<end&&end<next);assert.ok(optional.content.indexOf('(hud_set_objective_text gs_mission_obj_5)',gate)<spawn);
assert.ok(optional.dependencies.includes('trigger_volume:be_containment'));
assert.ok(optional.content.includes('(ai_set_team be_marines human)'));assert.ok(optional.content.includes('(ai_follow_target_players be_marines)'));
assert.ok(optional.content.includes('(sleep_until (or (< (ai_living_count be_marines) 1) (volume_test_objects_all be_survivors (ai_actors be_marines))) 15)'));
assert.ok(optional.content.includes('(hud_set_objective_text gs_mission_fail_2)'));assert.ok(optional.content.includes('(sleep_until false 15)'));assert.ok(optional.content.includes('(sleep_until gs_manual_4_done 15)'));assert.ok(optional.content.includes('(sleep_until gs_manual_7_done 15)'));assert.ok(!optional.content.includes('(volume_test_objects be_artifact (players))'));
assert.ok(!optional.content.includes('(volume_test_objects be_survivors (players))'));
assert.ok(optional.dependencies.includes('ai_encounter:be_marines'));assert.ok(optional.dependencies.includes('trigger_volume:be_survivors'));assert.ok(!optional.content.includes('(volume_test_objects be_extract (players))'));
assert.ok(!optional.content.includes('(game_won)'));assert.ok(!optional.content.includes('(sleep 18000)'));
const body=optional.content.split(/\r?\n/).filter(line=>!line.trimStart().startsWith(';')).join('');assert.equal([...body].filter(c=>c==='(').length,[...body].filter(c=>c===')').length);
operation.missions[4].conditionVolume='';assert.throws(()=>exportHaloCeMission(operation),/condition volume/);
operation.missions[4].conditionVolume='be_containment';operation.missions[6].conditionVolume='be_exit_choice';operation.missions[6].completeMission=true;assert.throws(()=>exportHaloCeMission(operation),/final beat/);
console.log('PASS: Black Echo starter, optional native objective guard, HUD/AI gating, source bindings and safe conditional completion');

// Cues are actual native instructions inside the optional branch. Completion
// audio must follow its guarded encounter wait and precede native progression.
const radio=emptyCreatorStudio();radio.missions=[{id:'radio',title:'Evac',objective:'Defend',trigger:'encounterCleared',encounterName:'defense',conditionVolume:'evac',
 soundCue:{importId:'owned_sound',soundPath:'gs_assets_owned/sound/radio distress',phase:'complete',gain:.5,delayMs:500,caption:'Evac is ready.'}}];
const cue=exportHaloCeMission(radio),cleared=cue.content.indexOf('(sleep_until (= (ai_living_count defense) 0) 15)'),audio=cue.content.indexOf('(sound_impulse_start "gs_assets_owned\\sound\\radio distress" none 0.5)');
assert.ok(audio>cleared);assert.ok(cue.content.indexOf('(hud_set_help_text gs_mission_cue_1)')>cleared);
assert.ok(cue.content.includes('(sleep 15)'));assert.ok(cue.content.includes('(sleep_until (<= (sound_impulse_time "gs_assets_owned\\sound\\radio distress") 0) 1 18000)'));
assert.ok(cue.dependencies.includes('sound:gs_assets_owned/sound/radio distress'));assert.ok(cue.dependencies.includes('hud_message:gs_mission_cue_1'));
assert.ok(cue.content.indexOf('(show_hud_help_text false)',audio)<cue.content.indexOf('  ))',audio));
radio.missions[0].soundCue.soundPath='sound/" ) (quit)';assert.throws(()=>exportHaloCeMission(radio),/Invalid mission beat/);
console.log('PASS: native mission radio timing, captions, optional branch, exact sound dependencies and unsafe-path refusal');


// Explicit opt-in native syntax/readback smoke using installed tools and an
// original generated tone. No SDK, existing tags or game runtime are modified.
if(process.env.SPARK_NATIVE_MISSION_AUDIO==='1') {
 const fs=await import('node:fs/promises'),sync=await import('node:fs'),path=await import('node:path'),crypto=await import('node:crypto');
 const {withDevelopmentWorkspace,runDevelopmentCommand}=await import('./native-qa-storage.mjs');
 const tools=path.resolve(process.env.SPARK_QA_INVADER??'tools/invader');
 await withDevelopmentWorkspace('frontend-native-mission-audio',async context=>{
  const work=await fs.mkdtemp(path.join(context.directory,'native-mission-')),tags=path.join(work,'tags'),data=path.join(work,'data'),scenario='levels/radio/radio';
  await fs.mkdir(path.join(tags,'levels/radio'),{recursive:true});await fs.mkdir(path.join(data,path.dirname(scenario),'scripts'),{recursive:true});await fs.mkdir(path.join(data,'sound/radio'),{recursive:true});
  const run=async(tool,args,capture=false)=>{
   const output=path.join(work,'readback.txt');let fd;
   try{if(capture)fd=sync.openSync(output,'w');await runDevelopmentCommand(path.join(tools,tool+'.exe'),['-t',tags,...args],context,capture?{stdio:['ignore',fd,'inherit']}:{ });}
   finally{if(fd!==undefined)sync.closeSync(fd);}
   return capture?(await fs.readFile(output,'utf8')).trim():'';
  };
  const samples=4410,wave=Buffer.alloc(44+samples*2);wave.write('RIFF');wave.writeUInt32LE(wave.length-8,4);wave.write('WAVEfmt ',8);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(22050,24);wave.writeUInt32LE(44100,28);wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);wave.write('data',36);wave.writeUInt32LE(samples*2,40);
  for(let i=0;i<samples;i++)wave.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*440/22050)*1000),44+i*2);
  await fs.writeFile(path.join(data,'sound/radio/tone.wav'),wave);
  await run('invader-sound',['-d',data,'-c','scripted_dialog_force_unspatialized','-F','16-bit_pcm','-j','1','sound/radio']);
  const template=process.env.SPARK_NATIVE_MISSION_TEMPLATE;if(!template)throw Error('Provide an owned authored scenario containing extraction_activate for this opt-in native compiler test; read-only name-table safeguards remain enabled.');
  const templateInfo=await fs.lstat(template);assert.ok(templateInfo.isFile()&&!templateInfo.isSymbolicLink()&&templateInfo.size<=2*1024*1024);
  const templateHash=crypto.createHash('sha256').update(await fs.readFile(template)).digest('hex');
  await fs.copyFile(template,path.join(tags,scenario+'.scenario'),sync.constants.COPYFILE_EXCL);
  await run('invader-edit',['-S','type','singleplayer','-I','trigger_volumes','1','end','-S','trigger_volumes[0].name','radio_area','-I','encounters','1','end','-S','encounters[0].name','survivors',scenario+'.scenario']);
  // Reuse existing authored names; never disable the native table safeguard.
  const nativeNames=(await run('invader-edit',['-G','object_names[*].name',scenario+'.scenario'],true)).split(/\r?\n/),activationNameIndex=nativeNames.indexOf('extraction_activate');
  assert.ok(activationNameIndex>=0&&nativeNames.lastIndexOf('extraction_activate')===activationNameIndex);
  const nativeControls=(await run('invader-edit',['-G','controls[*].name',scenario+'.scenario'],true)).split(/\r?\n/).map(Number),activationControlIndex=nativeControls.indexOf(activationNameIndex);
  assert.ok(activationControlIndex>=0&&nativeControls.lastIndexOf(activationNameIndex)===activationControlIndex);
  const native=emptyCreatorStudio();native.missions=[{id:'native_radio',title:'Native cue',objective:'Native syntax only',trigger:'manual',encounterName:'',conditionVolume:'radio_area',conditionGroup:'native_route',
   soundCue:{importId:'owned_sound',soundPath:'sound/radio',phase:'start',gain:.5,delayMs:500,caption:'Radio: native cue.'}},
   {id:'escort',title:'Native escort',objective:'Native syntax only',trigger:'escort',encounterName:'survivors',triggerRef:'radio_area',minimumSurvivors:1,escortFailure:'continue'},
   {id:'native_complete',title:'Complete',objective:'Manual gate',trigger:'manual',encounterName:'',conditionVolume:'radio_area',conditionGroup:'native_route',conditionOutside:true,soundCue:{importId:'owned_sound',soundPath:'sound/radio',phase:'complete',gain:1,delayMs:0,caption:''}},
   {id:'terminal',title:'Restore communications',objective:'Native syntax only',trigger:'deviceActivated',encounterName:'',triggerRef:'extraction_activate'},
   {id:'rescue_success',title:'Success path',objective:'Native syntax only',trigger:'manual',encounterName:'',conditionVolume:'radio_area',conditionGroup:'native_route',conditionResult:{beatId:'escort',failed:false}},
   {id:'rescue_failure',title:'Failure path',objective:'Native syntax only',trigger:'manual',encounterName:'',conditionResult:{beatId:'escort',failed:true}}];
  const source=exportHaloCeMission(native).content;await fs.writeFile(path.join(data,path.dirname(scenario),'scripts/gs_mission.hsc'),source);
  await fs.writeFile(path.join(data,'levels/radio_messages.hmt'),Buffer.concat([Buffer.from([255,254]),Buffer.from('gs_mission_cue_1=Radio: native cue.\r\ngs_mission_fail_2=Rescue failed: not enough survivors. Continuing the operation.\r\n','utf16le')]));
  await run('invader-string',['-d',data,'-T','hud_message_text','levels/radio_messages']);
  await run('invader-edit',['-S','hud_messages','levels/radio_messages.hud_message_text',scenario+'.scenario']);
  const hash=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex'),results=[];
  for(const engine of ['gbx-custom','mcc-cea','xbox-ntsc']){
   await run('invader-script',['-d',data,'-E','-g',engine,scenario]);
   const count=await run('invader-edit',['-C','scripts',scenario+'.scenario'],true);assert.equal(count,'5');
   const names=await run('invader-edit',['-G','scripts[*].name',scenario+'.scenario'],true);
   for(const name of ['gs_complete_1','gs_complete_3','gs_complete_5','gs_complete_6','gs_mission'])assert.ok(names.split(/\r?\n/).includes(name));
   const globals=await run('invader-edit',['-G','globals[*].name',scenario+'.scenario'],true);
   assert.deepEqual(new Set(globals.split(/\r?\n/)),new Set(['gs_branch_1_ready','gs_branch_1_inside','gs_result_2_done','gs_result_2_failed','gs_manual_1_done','gs_manual_3_done','gs_manual_5_done','gs_manual_6_done']));
   results.push({engine,scriptCount:Number(count),names:names.split(/\r?\n/),globals:globals.split(/\r?\n/),scenarioSha256:await hash(path.join(tags,scenario+'.scenario'))});
  }
  // Same owned native fixture: compile real ownership and the documented dormant callback.
  await fs.mkdir(path.join(tags,'weapons'),{recursive:true});await run('invader-edit',['-N','weapons/technology.weapon']);
  const settled=emptyCreatorStudio();settled.missions=[{id:'collect',title:'Collect',objective:'Owned weapon',trigger:'weaponOwned',weaponPath:'weapons/technology',encounterName:''},{id:'return',title:'Return',objective:'Native settlement',trigger:'forerunnerExtractionSettled',triggerRef:'extraction_activate',encounterName:''}];
  assert.throws(()=>exportHaloCeMission(settled),/Forerunner/);
  await fs.writeFile(path.join(data,path.dirname(scenario),'scripts/gs_mission.hsc'),exportHaloCeMission(settled,{forerunner:true}).content);
  await run('invader-script',['-d',data,'-E','-g','gbx-custom',scenario]);
  const settledNames=await run('invader-edit',['-G','scripts[*].name',scenario+'.scenario'],true);assert.deepEqual(new Set(settledNames.split(/\r?\n/)),new Set(['gs_mission','forerunner_extraction_complete']));
  const settledGlobals=await run('invader-edit',['-G','globals[*].name',scenario+'.scenario'],true);assert.deepEqual(new Set(settledGlobals.split(/\r?\n/)),new Set(['gs_collector_1','gs_collected_1','gs_extraction_armed','gs_settled_2']));
  console.log('PASS: native CE ownership/settled callback syntax and independent script/global readback',await hash(path.join(tags,scenario+'.scenario')));
  await fs.writeFile(path.join(data,path.dirname(scenario),'scripts/gs_mission.hsc'),source);
  // Compile the actual prepared mission body, including its player wait and intro.
  // Reuse this bounded native fixture; no SDK or playable-map claim.
  const introScenario='levels/intro/intro';await fs.mkdir(path.join(tags,'levels/intro'),{recursive:true});await fs.mkdir(path.join(data,'levels/intro/scripts'),{recursive:true});
  const shots=[{id:'intro_a',name:'Approach',durationMs:1000,cameraPosition:[1,2,3],lookAt:[4,6,3],fov:60,subtitle:'Rehearsal notes',roll:12},
   {id:'intro_b',name:'Ridge',durationMs:1500,cameraPosition:[25,0,3],lookAt:[29,0,1],fov:70,subtitle:'',easing:'cut'}];
  const prepared=await attachNativeCampaignMission({studio:{...emptyCreatorStudio(),shots,missions:[{id:'move',title:'Move out',objective:'Advance',trigger:'timer',timerSeconds:1,encounterName:''}]},
   quickForge:{gameMode:'campaign',runtimeId:'haloCustomEdition',startingProfile:{},logic:{schemaVersion:1,triggers:[],devices:[],rules:[],handwrittenSources:[]}}},'startup',true);
  const introSource=prepared.quickForge.logic.handwrittenSources[0].content;
  await fs.writeFile(path.join(data,'levels/intro/scripts/gs_mission.hsc'),introSource);await fs.writeFile(path.join(data,'levels/intro/scripts/gs_logic.hsc'),'(global boolean gs_logic_ready true)\n');
  await run('invader-edit',['-N','-S','type','singleplayer',introScenario+'.scenario']);
  for(const [i,shot] of shots.entries()){
   const d=shot.lookAt.map((value,axis)=>value-shot.cameraPosition[axis]),length=Math.hypot(...d),angles=[Math.atan2(d[1],d[0]),Math.asin(d[2]/length),(shot.roll??0)*Math.PI/180],prefix='cutscene_camera_points['+i+']';
   await run('invader-edit',['-I','cutscene_camera_points','1','end','-S',prefix+'.name','gs_cs_'+String(i+1).padStart(3,'0'),'-S',prefix+'.position',shot.cameraPosition.join(','),'-S',prefix+'.orientation',angles.join(','),'-S',prefix+'.field_of_view',String(shot.fov*Math.PI/180),introScenario+'.scenario']);
  }
  const introResults=[];
  for(const engine of ['gbx-custom','mcc-cea','xbox-ntsc']){
   await run('invader-script',['-d',data,'-E','-g',engine,introScenario]);
   const names=(await run('invader-edit',['-G','scripts[*].name',introScenario+'.scenario'],true)).split(/\r?\n/);assert.deepEqual(new Set(names),new Set(['gs_cinematic','gs_mission','gs_mission_bootstrap']));
   const values=await run('invader-edit',['-G','cutscene_camera_points[0].position','-G','cutscene_camera_points[1].position','-G','cutscene_camera_points[0].field_of_view',introScenario+'.scenario'],true);const parts=values.split(/\r?\n/);assert.deepEqual(parts.slice(0,2),['1.000000,2.000000,3.000000','25.000000,0.000000,3.000000']);assert.ok(Math.abs(Number(parts[2])-60)<.0001);
   introResults.push({engine,names,scenarioSha256:await hash(path.join(tags,introScenario+'.scenario'))});
  }
  assert.equal(crypto.createHash('sha256').update(introSource).digest('hex'),'cfb4e7abfba97c77d48d8fb6c7821421ba9311fdc61bf9e9727050a473c32be9','Legacy reviewed intro must remain byte-identical');
  const sceneProject=structuredClone(prepared);sceneProject.studio.missions[0].cinematicCue={firstShotId:'intro_a',lastShotId:'intro_b',phase:'complete'};sceneProject.studio.missions[0].completeMission=true;
  const scenes=await attachNativeCampaignMission(sceneProject,'startup',false),sceneSource=scenes.quickForge.logic.handwrittenSources[0].content;
  assert.ok(!sceneSource.includes('(script static void gs_cinematic'));assert.ok(sceneSource.indexOf('(gs_scene_1)')<sceneSource.indexOf('(game_won)'));
  await fs.writeFile(path.join(data,'levels/intro/scripts/gs_mission.hsc'),sceneSource);const sceneResults=[];
  for(const engine of ['gbx-custom','mcc-cea','xbox-ntsc']){
   await run('invader-script',['-d',data,'-E','-g',engine,introScenario]);const names=(await run('invader-edit',['-G','scripts[*].name',introScenario+'.scenario'],true)).split(/\r?\n/);assert.deepEqual(new Set(names),new Set(['gs_scene_1','gs_mission','gs_mission_bootstrap']));
   sceneResults.push({engine,names,scenarioSha256:await hash(path.join(tags,introScenario+'.scenario'))});
  }
  const combinedProject=structuredClone(scenes);combinedProject.studio.shots[0].name='  (sleep_until gs_logic_ready 1)';
  const combined=await attachNativeCampaignMission(combinedProject,'startup',true),combinedSource=combined.quickForge.logic.handwrittenSources[0].content;
  assert.ok(combinedSource.slice(combinedSource.indexOf('(script dormant gs_mission')).includes('  (sleep_until gs_logic_ready 1)\r\n  (sleep_until (> (list_count (players)) 0) 1)\r\n  (gs_cinematic)'));
  await fs.writeFile(path.join(data,'levels/intro/scripts/gs_mission.hsc'),combinedSource);const combinedResults=[];
  for(const engine of ['gbx-custom','mcc-cea','xbox-ntsc']){
   await run('invader-script',['-d',data,'-E','-g',engine,introScenario]);const names=(await run('invader-edit',['-G','scripts[*].name',introScenario+'.scenario'],true)).split(/\r?\n/);assert.deepEqual(new Set(names),new Set(['gs_cinematic','gs_scene_1','gs_mission','gs_mission_bootstrap']));
   combinedResults.push({engine,names,scenarioSha256:await hash(path.join(tags,introScenario+'.scenario'))});
  }
  console.log(JSON.stringify({nativeCombinedSceneSyntax:'pass',sourceSha256:crypto.createHash('sha256').update(combinedSource).digest('hex'),combinedResults,cacheBuilt:false,gameplayVerified:false}));
  console.log(JSON.stringify({nativeObjectiveSceneSyntax:'pass',sourceSha256:crypto.createHash('sha256').update(sceneSource).digest('hex'),sceneResults,cacheBuilt:false,gameplayVerified:false}));
  console.log(JSON.stringify({nativePreparedCinematicSyntax:'pass',introSourceSha256:crypto.createHash('sha256').update(introSource).digest('hex'),introResults,cacheBuilt:false,gameplayVerified:false}));
  const controlName=await run('invader-edit',['-G','object_names['+activationNameIndex+'].name','-G','controls['+activationControlIndex+'].name',scenario+'.scenario'],true);assert.deepEqual(controlName.split(/\r?\n/),['extraction_activate',String(activationNameIndex)]);
  const caption=await run('invader-edit',['-G','messages[0].name','levels/radio_messages.hud_message_text'],true);assert.equal(caption,'gs_mission_cue_1');
  const failure=await run('invader-edit',['-G','messages[1].name','levels/radio_messages.hud_message_text'],true);assert.equal(failure,'gs_mission_fail_2');
  assert.equal(crypto.createHash('sha256').update(await fs.readFile(template)).digest('hex'),templateHash);
  console.log(JSON.stringify({templateHash,nativeMissionAudioSyntax:'pass',nativeEscortSyntax:'pass',nativeTerminalSyntax:'pass',nativeSharedBranchSyntax:'pass',nativeRescueOutcomeSyntax:'pass',controlName,failure,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),soundSha256:await hash(path.join(tags,'sound/radio.sound')),hudSha256:await hash(path.join(tags,'levels/radio_messages.hud_message_text')),caption,results,cacheBuilt:false,gameplayVerified:false}));
 },{reservationBytes:32*1024*1024});
}


if(process.env.SPARK_NATIVE_TRANSPORT==='1'){
 const fs=await import('node:fs/promises'),path=await import('node:path'),crypto=await import('node:crypto');
 const {promisify}=await import('node:util'),{execFile}=await import('node:child_process'),exec=promisify(execFile);
 const {withDevelopmentWorkspace}=await import('./native-qa-storage.mjs');
 await withDevelopmentWorkspace('native-transport-source',async context=>{
  const root=await fs.mkdtemp(path.join(context.directory,'transport-syntax-'));
  const tags=path.join(root,'tags'),data=path.join(root,'data');await fs.mkdir(tags);await fs.mkdir(path.join(data,'scripts'),{recursive:true});
  const invader=path.resolve(process.env.SPARK_QA_INVADER??'tools/invader');
  const run=async(tool,args)=>{const value=await exec(path.join(invader,tool+'.exe'),['-t',tags,...args],{cwd:root,windowsHide:true,maxBuffer:1024*1024});assert.ok(!/ERROR:|Failed to/i.test(value.stdout+'\n'+value.stderr),value.stderr);return value.stdout.trim();};
  const scenario='transport.scenario';await run('invader-edit',['-N',scenario]);
  await run('invader-edit',['-n','-I','vehicles','2','end','-I','object_names','2','end','-I','encounters','2','end','-I','command_lists','2','end','-I','trigger_volumes','2','end','-I','device_groups','6','end',scenario]);
  const args=[];
  for(const [i,role]of ['pelican','spirit'].entries()){
   args.push('-S','object_names['+i+'].name','extraction_'+role,'-S','vehicles['+i+'].name',String(i),'-S','encounters['+i+'].name','pilot_'+role);
   for(const [j,suffix]of ['boarded','called','landed'].entries())args.push('-S','device_groups['+(i*3+j)+'].name','extraction_'+role+'_'+suffix,'-S','device_groups['+(i*3+j)+'].initial_value','0');
  }
  for(const[i,name]of ['field_route','hub_route'].entries())args.push('-S','command_lists['+i+'].name',name);
  for(const[i,name]of ['extraction_return','extraction_zone'].entries())args.push('-S','trigger_volumes['+i+'].name',name);
  await run('invader-edit',['-n',...args,scenario]);
  await fs.writeFile(path.join(data,'scripts/cues.hsc'),'(script static void depart_cue (sleep 1))\n(script static void arrive_cue (sleep 1))\n');
  const results=[];
  for(const returnAfterInsertion of [false,true]){
   const sources=[];
   for(const faction of ['unsc','covenant']){
    const role=faction==='unsc'?'pelican':'spirit';const source=exportHaloCeTransport({faction,pilot:'pilot_'+role,pilotSeat:faction==='unsc'?'P-driver':'CD-driver',outbound:'field_route',inbound:'hub_route',hub:'extraction_return',field:'extraction_zone',departureCue:'depart_cue',arrivalCue:'arrive_cue',...(returnAfterInsertion?{returnAfterInsertion:true}:{})});
    await fs.writeFile(path.join(data,'scripts',source.filename),source.content);sources.push({filename:source.filename,sha256:crypto.createHash('sha256').update(source.content).digest('hex')});
   }
   await run('invader-script',['-d',data,'-g','gbx-custom','-E','transport']);
   const names=(await run('invader-edit',['-G','scripts[*].name',scenario])).split(/\r?\n/),types=(await run('invader-edit',['-G','scripts[*].script_type',scenario])).split(/\r?\n/);
   for(const role of ['pelican','spirit']){
    for(const name of ['gs_'+role+'_pilot','gs_'+role+'_trip','forerunner_'+role+'_complete'])assert.ok(names.includes(name),name);
    assert.equal(types[names.indexOf('forerunner_'+role+'_complete')],'continuous');
   }
   results.push({returnAfterInsertion,scripts:names,source:sources,scenarioSha256:crypto.createHash('sha256').update(await fs.readFile(path.join(tags,scenario))).digest('hex')});
  }
  const recoveredStudio={...emptyCreatorStudio(),missions:[{id:'arrive',title:'Arrive',objective:'Reach the landing zone',trigger:'triggerVolume',triggerRef:'extraction_zone',encounterName:''},{id:'clear',title:'Clear',objective:'Defeat the authored group',trigger:'encounterCleared',encounterName:'pilot_pelican'}]};
  const recovered=[];for(const activation of ['manual','startup']){const source=recoveredCampaignMission(recoveredStudio,activation,true);await fs.writeFile(path.join(data,'scripts',source.filename),source.content);await run('invader-script',['-d',data,'-g','gbx-custom','-E','transport']);const scripts=(await run('invader-edit',['-G','scripts[*].name',scenario])).split(/\r?\n/),globals=(await run('invader-edit',['-G','globals[*].name',scenario])).split(/\r?\n/);assert.ok(scripts.includes('gs_mission_bootstrap')&&scripts.includes('gs_mission'));assert.ok(!globals.includes('gs_logic_ready'));recovered.push({activation,sourceSha256:crypto.createHash('sha256').update(source.content).digest('hex'),scenarioSha256:crypto.createHash('sha256').update(await fs.readFile(path.join(tags,scenario))).digest('hex'),scripts});}
  console.log(JSON.stringify({nativeTransportSyntax:'pass',results,recoveredMissionSyntax:recovered,cacheBuilt:false,gameplayVerified:false}));
 },{reservationBytes:32*1024*1024});
}
