import assert from 'node:assert/strict';
import { blackEchoMission, emptyCreatorStudio } from '../src/creatorStudio.ts';
import { exportHaloCeMission, exportHaloCeCinematic, exportHaloCeFirefight, scriptManifest } from '../src/haloScript.ts';
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
const cue=exportHaloCeMission(radio),cleared=cue.content.indexOf('(sleep_until (= (ai_living_count defense) 0) 15)'),audio=cue.content.indexOf('(sound_impulse_start "gs_assets_owned/sound/radio distress" none 0.5)');
assert.ok(audio>cleared);assert.ok(cue.content.indexOf('(hud_set_help_text gs_mission_cue_1)')>cleared);
assert.ok(cue.content.includes('(sleep 15)'));assert.ok(cue.content.includes('(sleep_until (<= (sound_impulse_time "gs_assets_owned/sound/radio distress") 0) 1 18000)'));
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
  const tags=path.join(context.directory,'tags'),data=path.join(context.directory,'data'),scenario='levels/radio/radio';
  await fs.mkdir(path.join(tags,'levels/radio'),{recursive:true});await fs.mkdir(path.join(data,path.dirname(scenario),'scripts'),{recursive:true});await fs.mkdir(path.join(data,'sound/radio'),{recursive:true});
  const run=async(tool,args,capture=false)=>{
   const output=path.join(context.directory,'readback.txt');let fd;
   try{if(capture)fd=sync.openSync(output,'w');await runDevelopmentCommand(path.join(tools,tool+'.exe'),['-t',tags,...args],context,capture?{stdio:['ignore',fd,'inherit']}:{ });}
   finally{if(fd!==undefined)sync.closeSync(fd);}
   return capture?(await fs.readFile(output,'utf8')).trim():'';
  };
  const samples=4410,wave=Buffer.alloc(44+samples*2);wave.write('RIFF');wave.writeUInt32LE(wave.length-8,4);wave.write('WAVEfmt ',8);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(22050,24);wave.writeUInt32LE(44100,28);wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);wave.write('data',36);wave.writeUInt32LE(samples*2,40);
  for(let i=0;i<samples;i++)wave.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*440/22050)*1000),44+i*2);
  await fs.writeFile(path.join(data,'sound/radio/tone.wav'),wave);
  await run('invader-sound',['-d',data,'-c','scripted_dialog_force_unspatialized','-F','16-bit_pcm','-j','1','sound/radio']);
  await run('invader-edit',['-N','-S','type','singleplayer','-I','trigger_volumes','1','end','-S','trigger_volumes[0].name','radio_area','-I','encounters','1','end','-S','encounters[0].name','survivors',scenario+'.scenario']);
  const native=emptyCreatorStudio();native.missions=[{id:'native_radio',title:'Native cue',objective:'Native syntax only',trigger:'manual',encounterName:'',conditionVolume:'radio_area',
   soundCue:{importId:'owned_sound',soundPath:'sound/radio',phase:'start',gain:.5,delayMs:500,caption:'Radio: native cue.'}},
   {id:'escort',title:'Native escort',objective:'Native syntax only',trigger:'escort',encounterName:'survivors',triggerRef:'radio_area',minimumSurvivors:1},
   {id:'native_complete',title:'Complete',objective:'Manual gate',trigger:'manual',encounterName:'',soundCue:{importId:'owned_sound',soundPath:'sound/radio',phase:'complete',gain:1,delayMs:0,caption:''}}];
  const source=exportHaloCeMission(native).content;await fs.writeFile(path.join(data,path.dirname(scenario),'scripts/gs_mission.hsc'),source);
  await fs.writeFile(path.join(data,'levels/radio_messages.hmt'),Buffer.concat([Buffer.from([255,254]),Buffer.from('gs_mission_cue_1=Radio: native cue.\r\ngs_mission_fail_2=Rescue failed: not enough survivors. Restart or revise the operation.\r\n','utf16le')]));
  await run('invader-string',['-d',data,'-T','hud_message_text','levels/radio_messages']);
  await run('invader-edit',['-S','hud_messages','levels/radio_messages.hud_message_text',scenario+'.scenario']);
  const hash=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex'),results=[];
  for(const engine of ['gbx-custom','mcc-cea','xbox-ntsc']){
   await run('invader-script',['-d',data,'-E','-g',engine,scenario]);
   const count=await run('invader-edit',['-C','scripts',scenario+'.scenario'],true);assert.equal(count,'3');
   const names=await run('invader-edit',['-G','scripts[0].name','-G','scripts[1].name','-G','scripts[2].name',scenario+'.scenario'],true);
   for(const name of ['gs_complete_1','gs_complete_3','gs_mission'])assert.ok(names.split(/\r?\n/).includes(name));
   results.push({engine,scriptCount:Number(count),names:names.split(/\r?\n/),scenarioSha256:await hash(path.join(tags,scenario+'.scenario'))});
  }
  const caption=await run('invader-edit',['-G','messages[0].name','levels/radio_messages.hud_message_text'],true);assert.equal(caption,'gs_mission_cue_1');
  const failure=await run('invader-edit',['-G','messages[1].name','levels/radio_messages.hud_message_text'],true);assert.equal(failure,'gs_mission_fail_2');
  console.log(JSON.stringify({nativeMissionAudioSyntax:'pass',nativeEscortSyntax:'pass',failure,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),soundSha256:await hash(path.join(tags,'sound/radio.sound')),hudSha256:await hash(path.join(tags,'levels/radio_messages.hud_message_text')),caption,results,cacheBuilt:false,gameplayVerified:false}));
 },{reservationBytes:32*1024*1024});
}
