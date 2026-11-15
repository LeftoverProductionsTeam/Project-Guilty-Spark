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
assert.ok(optional.content.includes('(sleep_until gs_manual_2_done 15)'));assert.ok(optional.content.includes('(sleep_until gs_manual_7_done 15)'));
assert.ok(!optional.content.includes('(volume_test_objects be_survivors (players))'));assert.ok(!optional.content.includes('(volume_test_objects be_extract (players))'));
assert.ok(!optional.content.includes('(game_won)'));assert.ok(!optional.content.includes('(sleep 18000)'));
const body=optional.content.split(/\r?\n/).filter(line=>!line.trimStart().startsWith(';')).join('');assert.equal([...body].filter(c=>c==='(').length,[...body].filter(c=>c===')').length);
operation.missions[4].conditionVolume='';assert.throws(()=>exportHaloCeMission(operation),/condition volume/);
operation.missions[4].conditionVolume='be_containment';operation.missions[6].conditionVolume='be_exit_choice';operation.missions[6].completeMission=true;assert.throws(()=>exportHaloCeMission(operation),/final beat/);
console.log('PASS: Black Echo starter, optional native objective guard, HUD/AI gating, source bindings and safe conditional completion');
