import {exportHaloCeMission,exportHaloCeTransport,readNativeTransportSource,recoveredCampaignMission,composeRecoveredCampaignMission,haloSourceDeclarations,readRecoveredMissionSource} from './haloScript';
import { describe, expect, it } from 'vitest';
import {emptyCreatorStudio} from './creatorStudio';
import { attachNativeFirefightRound, exportHaloCeFirefightRound, exportPlannedFirefightRound, nativeRoundBinding, nativeSoloFirefightRules } from './haloScript';
import type { Project } from './types';
import { defaultNativePlayerProfile, type FirefightConfig } from './firefight';
export function nativeRoundFixture():FirefightConfig {
  return {schemaVersion:1,title:'Native round',sourceSha256:null,seed:1,playerCount:1,teamLives:1,allowRevives:false,
    rounds:1,endless:false,preparationMs:1000,countdownMs:1000,intermissionMs:1000,spawnIntervalMs:500,
    spawnTimeoutMs:5000,stuckTimeoutMs:60000,maxSpawnAttempts:1,maxAlive:4,maxTotalPerWave:4,
    difficultyStepPercent:0,extraPlayerCountPercent:0,startingEquipment:[],replenishAmmoEachWave:false,supplyDropTags:[],nativePlayerProfile:defaultNativePlayerProfile(),
    enemies:[{id:'elite',name:'Elite',actorVariantPath:'characters/elite/elite',points:125}],
    spawnZones:[{id:'first',position:[94,-155,0.2],radius:1,enabled:true}],
    waves:[{id:'first',name:'First wave',boss:false,scoreMultiplierMilli:1000,groups:[{enemyId:'elite',count:2}]},
      {id:'second',name:'Second wave',boss:false,scoreMultiplierMilli:2000,groups:[{enemyId:'elite',count:3}]}]};
}
describe('opt-in native Firefight round source',()=>{
  it('refuses independent campaign population overrides on controller-owned wave plans',()=>{
    const rules=nativeRoundFixture();rules.sourceSha256='a'.repeat(64);
    const encounters=rules.waves.flatMap((wave,index)=>wave.groups.map(group=>({name:'wave_'+index,actorPath:'characters/elite/elite',
      position:[0,0,0] as [number,number,number],startActive:false,count:group.count,spacing:.75})));
    expect(()=>exportPlannedFirefightRound({kind:'appendEncounters',sourceRules:rules,
      encounters:encounters.map((entry,index)=>index===0?{...entry,difficulty:{normal:1,insane:2}}:entry)},'manual')).toThrow(/independent difficulty/);
  });
  it('owns exact encounters, waits for actual spawns and deaths, and provides bounded restart/score state',()=>{
    const out=exportHaloCeFirefightRound(nativeRoundFixture());
    expect(out.activation).toBe('(set gs_ff_start true)');
    expect(out.scenarioType).toBe('singleplayer');
    expect(out.content).toContain('(script continuous gs_firefight');
    expect(out.content).toContain('(sleep_until (or (= (ai_living_count gs_w01_g01) 2) (<= (unit_get_health gs_ff_player) 0)) 1 150)');
    expect(out.content).toContain('(set gs_ff_score (+ gs_ff_score 250))');
    expect(out.content).toContain('(set gs_ff_score (+ gs_ff_score 750))');
    expect(out.content).toContain('(ai_force_active gs_w01_g01 true)');
    expect(out.content).toContain('(ai_force_active gs_w02_g01 false)');
    expect(out.content).toContain('(set gs_ff_cleared (+ gs_ff_cleared 3))');
    expect(out.content).toContain('(set gs_ff_score 0)');
    expect(out.content).toContain('(set gs_ff_player (unit (list_get (players) 0)))');
    expect(out.content).toContain('(unit_get_health gs_ff_player)');
    expect(out.content.slice(out.content.indexOf('(script static void gs_wave_01'),out.content.indexOf('(script continuous gs_firefight'))).not.toContain('(players)');
    expect(out.content).toContain('(set gs_ff_state 5)');
    expect(out.content).not.toMatch(/unit_kill|ai_kill|damage_object|ai_erase_all|cheat/);
    expect(out.dependencies).toContain('starting_profile:gs_firefight_start');
    expect(out.dependencies).toContain('weapon:weapons/pistol/pistol');
    expect(out.generatedOnly).toBe(true);
  });
  it('captures encounter units before combat and cleans their corpses without deleting players or unrelated objects',()=>{
    const out=exportHaloCeFirefightRound(nativeRoundFixture());
    const source=out.content;
    expect(source).toContain('(global object_list gs_ff_units_w01_g01 (ai_actors gs_w01_g01))');
    const wave=source.slice(source.indexOf('(script static void gs_wave_01'),source.indexOf('(script static void gs_wave_02'));
    const placed=wave.indexOf('(ai_place gs_w01_g01)');
    const captured=wave.indexOf('(set gs_ff_units_w01_g01 (ai_actors gs_w01_g01))');
    const ready=wave.indexOf('(sleep_until (or (= (ai_living_count gs_w01_g01) 2) (<= (unit_get_health gs_ff_player) 0))');
    const combat=wave.indexOf('(sleep_until (or (= (ai_living_count gs_w01_g01) 0)');
    for(const index of [placed,captured,ready,combat])expect(index).toBeGreaterThanOrEqual(0);
    expect(placed).toBeLessThan(captured);expect(captured).toBeLessThan(ready);expect(ready).toBeLessThan(combat);
    const cleanup=source.slice(source.indexOf('(script static void gs_ff_clean_w01_g01'),source.indexOf('(script static void gs_ff_clean_w02_g01'));
    expect(cleanup.indexOf('(list_get gs_ff_units_w01_g01 1)')).toBeLessThan(cleanup.indexOf('(list_get gs_ff_units_w01_g01 0)'));
    expect(cleanup).toContain('(ai_erase gs_w01_g01)');
    expect(cleanup).not.toMatch(/players|gs_ff_player|object_destroy_all|containing|by_definition/);
    expect(source).toContain('(if (= gs_ff_state 3) (sleep 60))');
    expect(source.match(/\(gs_ff_clean_w01_g01\)/g)).toHaveLength(2);
    expect(out.warnings.some(w=>w.includes('corpses'))).toBe(true);
  });
  it('refuses rules it cannot implement rather than silently dropping them',()=>{
    const config=nativeRoundFixture();
    for(const patch of [{playerCount:2},{teamLives:5},{allowRevives:true},{difficultyStepPercent:25},
      {extraPlayerCountPercent:50},{startingEquipment:['weapons/pistol']},{supplyDropTags:['weapons/pistol']},
      {replenishAmmoEachWave:true},{spawnTimeoutMs:0},{stuckTimeoutMs:NaN},{preparationMs:600000,countdownMs:600000},{endless:true}])
      expect(()=>exportHaloCeFirefightRound({...config,...patch})).toThrow();
  });
  it('refuses duplicate identities, invalid or overflowing native score',()=>{
    const config=nativeRoundFixture();
    expect(()=>exportHaloCeFirefightRound({...config,enemies:[...config.enemies,...config.enemies]})).toThrow(/Duplicate/);
    for(const points of [-1,NaN,100001])expect(()=>exportHaloCeFirefightRound({...config,enemies:[{...config.enemies[0],points}]})).toThrow(/points/);
    expect(()=>exportHaloCeFirefightRound({...config,rounds:32,waves:Array.from({length:32},()=>({...config.waves[0],groups:[{enemyId:'elite',count:4}],scoreMultiplierMilli:10000})),enemies:[{...config.enemies[0],points:100000}]})).toThrow(/long range/);
  });
});

describe('native round attachment to existing source document',()=>{
  const project=()=>({firefight:nativeRoundFixture(),quickForge:{gameMode:'firefight',runtimeId:'haloCustomEdition',logic:{schemaVersion:1,triggers:[],devices:[],rules:[],handwrittenSources:[{filename:'original.hsc',content:'; original manual source'}]}}}) as unknown as Project;
  it('binds the current rules and startup through existing handwritten modules, preserving unrelated source and input identity',()=>{
    const original=project(),next=attachNativeFirefightRound(original);
    expect(original.quickForge!.logic!.handwrittenSources).toHaveLength(1);
    expect(next.quickForge!.logic!.handwrittenSources![0]).toEqual(original.quickForge!.logic!.handwrittenSources![0]);
    const source=next.quickForge!.logic!.handwrittenSources![1].content;
    expect(JSON.parse(source.split('\r\n')[0].slice(nativeRoundBinding.length))).toEqual(original.firefight);
    expect(source).toContain('(script startup gs_ff_bootstrap');
    expect(source).toContain('(set gs_ff_start true)');
    expect(attachNativeFirefightRound(next)).toEqual(next);
  });
  it('refreshes only untouched generated controllers and refuses to overwrite manual edits',()=>{
    const bound=attachNativeFirefightRound(project());
    bound.firefight!.waves[0].groups[0].count=3;
    const refreshed=attachNativeFirefightRound(bound);
    expect(refreshed.quickForge!.logic!.handwrittenSources![1].content).toContain('(ai_living_count gs_w01_g01) 3');
    refreshed.quickForge!.logic!.handwrittenSources![1].content+='; manual edit';
    expect(()=>attachNativeFirefightRound(refreshed)).toThrow(/manual edits/);
    expect(refreshed.quickForge!.logic!.handwrittenSources![1].content).toContain('; manual edit');
  });
  it('refuses unsupported source modes and keeps non-ASCII configuration outside native script bytes',()=>{
    for(const patch of [{gameMode:'zombie'},{runtimeId:'openCe'},{native:{}}]) {
      const p=project();Object.assign(p.quickForge!,patch);
      expect(()=>attachNativeFirefightRound(p)).toThrow(/editable solo/);
    }
    const p=project();p.firefight!.title='Sûrvival';
    const source=attachNativeFirefightRound(p).quickForge!.logic!.handwrittenSources![1].content;
    expect([...source].every(character=>character.charCodeAt(0)<128)).toBe(true);
  });
});

it('native solo preset keeps encounters/zones and leaves the prior authoring rules untouched',()=>{
  const original={...nativeRoundFixture(),playerCount:2,teamLives:5,maxSpawnAttempts:3,difficultyStepPercent:25};
  const next=nativeSoloFirefightRules(original);
  expect(next.waves).toEqual(original.waves);expect(next.spawnZones).toEqual(original.spawnZones);
  expect(original.playerCount).toBe(2);expect(next.playerCount).toBe(1);expect(next.teamLives).toBe(1);expect(next.maxSpawnAttempts).toBe(1);
  expect(()=>exportHaloCeFirefightRound(next)).not.toThrow();
});

it('equips an explicit standard scenario profile only after the native player is alive',()=>{
 const config=nativeRoundFixture();const source=exportHaloCeFirefightRound(config).content;
 expect(source).toContain('(if (!= gs_ff_state 5) (player_add_equipment gs_ff_player gs_firefight_start true))');
 expect(source.indexOf('(player_add_equipment')).toBeGreaterThan(source.indexOf('(set gs_ff_player (unit (list_get (players) 0)))'));
 for(const patch of [{health:0},{shields:4},{primaryLoaded:-1},{primaryReserved:32768},{fragmentationGrenades:5},{primaryWeapon:'../original'},{secondaryWeapon:config.nativePlayerProfile!.primaryWeapon}])
  expect(()=>exportHaloCeFirefightRound({...config,nativePlayerProfile:{...config.nativePlayerProfile!,...patch}})).toThrow();
});
it('retains old generated source for comparison but requires an explicit loadout for new native attachment',()=>{
 const config=nativeRoundFixture();delete config.nativePlayerProfile;
 expect(exportHaloCeFirefightRound(config).content).not.toContain('player_add_equipment');
 const p={firefight:config,quickForge:{gameMode:'firefight',runtimeId:'mccSteam'}} as Project;
 expect(()=>attachNativeFirefightRound(p)).toThrow(/Player loadout/);
 const fixed=nativeSoloFirefightRules(config);expect(fixed.nativePlayerProfile).toEqual(defaultNativePlayerProfile());
 expect(config.nativePlayerProfile).toBeUndefined();
});


describe('Forerunner native transport source',()=>{
 const options={faction:'unsc' as const,pilot:'pilot',pilotSeat:'P-driver',outbound:'field_route',inbound:'hub_route',hub:'extraction_return',field:'extraction_zone'};
 it('uses actual landing and native boarding/settlement without inventing banking or boarding players',()=>{
  const script=exportHaloCeTransport(options);expect(readNativeTransportSource(script.content)).toEqual(options);
  expect(script.filename).toBe('gs_pelican_transport.hsc');
  expect(script.content).toContain('(volume_test_object extraction_zone extraction_pelican) (> (device_group_get extraction_pelican_landed) 0.5)');
  expect(script.content).toContain('(device_group_get extraction_pelican_called)');
  expect(script.content).toContain('(ai_command_list pilot field_route)');expect(script.content).toContain('(ai_command_list pilot hub_route)');
  expect(script.content).toContain('(script continuous forerunner_pelican_complete\n  (sleep -1)');
  expect(script.content.indexOf('(set gs_pelican_settled false)')).toBeLessThan(script.content.indexOf('(ai_command_list pilot field_route)'));
  const wait=script.content.indexOf(' gs_pelican_settled) 1)');expect(wait).toBeGreaterThan(script.content.indexOf('(ai_command_list pilot hub_route)'));
  expect(script.content.slice(wait)).toContain('(unit_set_enterable_by_player (unit extraction_pelican) true)');
  expect(script.content).not.toMatch(/player_add_equipment|object_teleport|vehicle_unload|ai_place/);
  expect(script.dependencies).toContain('device_group:extraction_pelican_landed');
 });
 it('authors empty return and real recall as separate phases without granting settlement',()=>{
  for(const faction of ['unsc','covenant'] as const){
   const role=faction==='unsc'?'pelican':'spirit',craft='extraction_'+role;
   const source=exportHaloCeTransport({...options,faction,returnAfterInsertion:true});
   expect(readNativeTransportSource(source.content).returnAfterInsertion).toBe(true);
   const flight=source.content.slice(source.content.indexOf('(script continuous gs_'+role+'_trip'));
   const commands=[...flight.matchAll(/\(ai_command_list pilot ([a-z_]+)\)/g)].map(row=>row[1]);
   expect(commands).toEqual(['field_route','hub_route','field_route','hub_route']);
   const firstReturn=flight.indexOf('(ai_command_list pilot hub_route)'),recall=flight.indexOf('(ai_command_list pilot field_route)',flight.indexOf('(ai_command_list pilot field_route)')+1),lastReturn=flight.lastIndexOf('(ai_command_list pilot hub_route)');
   expect(flight.slice(0,firstReturn)).toContain('(= (list_count (vehicle_riders (unit '+craft+'))) 1)');
   expect(flight.slice(firstReturn,recall)).toContain('(device_group_get '+craft+'_called)');
   expect(flight.slice(firstReturn,recall)).not.toContain('(unit_set_enterable_by_player (unit '+craft+') true)');
   expect(flight.slice(recall,lastReturn)).toContain('(device_group_get '+craft+'_boarded)');
   expect(flight.slice(recall,lastReturn)).toContain('(set gs_'+role+'_settled false)');
   expect(flight.slice(lastReturn)).toContain('gs_'+role+'_settled) 1)');
   expect(source.content).not.toMatch(/vehicle_unload|object_teleport|player_add_equipment|ai_erase|object_destroy/);
  }
  expect(()=>exportHaloCeTransport({...options,returnAfterInsertion:'yes'} as any)).toThrow('whether');
 });
 it('keeps factions distinct and rejects handwritten source regeneration and injected refs',()=>{
  const script=exportHaloCeTransport({...options,faction:'covenant',pilotSeat:'CD-driver',departureCue:'depart_cue',arrivalCue:'arrive_cue'});
  expect(script.content).toContain('forerunner_spirit_complete');expect(script.content).toContain('(depart_cue)');expect(script.content).toContain('(arrive_cue)');
  expect(script.content).not.toContain('extraction_pelican');
  expect(()=>readNativeTransportSource(script.content+'; Handwritten change\n')).toThrow('edited');
  expect(()=>readNativeTransportSource('(script startup old (sleep 1))')).toThrow('handwritten');
  for(const change of [{pilot:'pilot) (object_destroy all)'},{pilotSeat:'P-driver"'},{pilotSeat:'P-driver\\bad'},{outbound:options.inbound},{hub:options.field},{arrivalCue:'bad function'}])expect(()=>exportHaloCeTransport({...options,...change})).toThrow();
 });
});

describe('recovered campaign source preparation',()=>{
 it('has reversible source ownership and preserves bootstrap identity without requiring QuickForge initialization',async()=>{
  const studio={...emptyCreatorStudio(),missions:[{id:'one',title:'Arrival',objective:'Reach the pad',trigger:'triggerVolume' as const,triggerRef:'pad',encounterName:''}]};
  const manual=recoveredCampaignMission(studio,'manual',false),startup=recoveredCampaignMission(studio,'startup',false);
  expect(manual.content).not.toContain('gs_logic_ready');expect(startup.content).not.toContain('gs_logic_ready');expect(manual.content).toContain('(script startup gs_mission_bootstrap\n  (sleep -1)');expect(startup.content).toContain('(sleep_until (> (list_count (players)) 0) 1)\n  (wake gs_mission)');expect((await readRecoveredMissionSource(startup.content)).missions).toEqual(studio.missions);
  await expect(readRecoveredMissionSource(startup.content+'; handwritten change\n')).rejects.toThrow(/edited/);await expect(readRecoveredMissionSource('(script startup old (sleep 1))')).rejects.toThrow(/unchanged/);
 });
});


describe('reviewed recovered mission module composition',()=>{
 const original='; Creator-owned source license stays here.\r\n;* outer ;* (script startup fake (quit)) *; nested *;\r\n(global boolean old_done false)\r\n(script static void gs_complete_7 (set old_done true))\r\n(script dormant forerunner_extraction_complete (gs_complete_7))\r\n(script startup original_mission (print "(not a declaration); still a string") (ai_place guards))\r\n(script continuous unrelated (sleep 30))\r\n';
 const composition={filename:'original.hsc',sourceSha256:'a'.repeat(64),retiredStartups:['original_mission'],replaceExtractionCallback:true};
 const studio={...emptyCreatorStudio(),missions:[{id:'first',title:'Collect',objective:'Collect',trigger:'weaponOwned' as const,weaponPath:'technology/item',encounterName:''},{id:'last',title:'Return',objective:'Return',trigger:'forerunnerExtractionSettled' as const,triggerRef:'extraction_activate',encounterName:''}]};
 const hash=async(text:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');
 it('preserves unrelated original forms/comments and replaces only explicitly reviewed controller bodies',async()=>{
  const ownership={...composition,sourceSha256:await hash(original)},output=await composeRecoveredCampaignMission(studio,'startup',true,original,ownership),rows=haloSourceDeclarations(output.content);
  expect(output.filename).toBe('original.hsc');expect(output.content).toContain('; Creator-owned source license stays here.\r\n');expect(output.content).toContain('(script continuous unrelated (sleep 30))\r\n');expect(output.content).toContain('(script static void gs_complete_7 (set old_done true))\r\n');expect(output.content).toContain('(global boolean old_done false)\r\n');
  expect(output.content).toContain('(script startup original_mission\n  (sleep -1)\n)');expect(output.content).not.toContain('(ai_place guards)');expect(rows.filter(row=>row.name==='forerunner_extraction_complete')).toHaveLength(1);expect(rows.filter(row=>row.type==='startup').map(row=>row.name)).toEqual(['original_mission','gs_mission_bootstrap']);expect(rows.filter(row=>row.kind==='script').slice(0,4).map(row=>row.name)).toEqual(haloSourceDeclarations(original).filter(row=>row.kind==='script').map(row=>row.name));expect(rows.some(row=>row.name==='fake')).toBe(false);
  expect((await readRecoveredMissionSource(output.content)).composition).toMatchObject(ownership);expect(original).toContain('(ai_place guards)');
  const next=structuredClone(studio);next.missions[0].title='Updated';const revision=await composeRecoveredCampaignMission(next,'manual',true,output.content,{...composition,sourceSha256:await hash(output.content)});expect((await readRecoveredMissionSource(revision.content)).missions).toEqual(next.missions);expect(revision.content).toContain('(script continuous unrelated (sleep 30))');
 });
 it('refuses conflicting globals/functions, missing ownership and source ambiguity without producing a draft',async()=>{
  for(const [text,options] of [[original,{...composition,replaceExtractionCallback:false}],[original,{...composition,retiredStartups:['missing']}],[original,{...composition,filename:'../old.hsc'}],[original,{...composition,sourceSha256:'bad'}],[original+'(global boolean gs_extraction_armed false)',composition],[original+'(script dormant gs_mission (sleep 1))',composition],[original.replace('dormant forerunner','startup forerunner'),composition],[original+original,composition]] as const)await expect(composeRecoveredCampaignMission(studio,'startup',true,text,{...options,retiredStartups:[...options.retiredStartups],sourceSha256:options.sourceSha256==='bad'?'bad':await hash(text)})).rejects.toThrow();
  const output=await composeRecoveredCampaignMission(studio,'startup',true,original,{...composition,sourceSha256:await hash(original)});await expect(readRecoveredMissionSource(output.content+'; manual addition')).rejects.toThrow(/edited/);await expect(readRecoveredMissionSource(output.content.replace('(sleep -1)','(sleep 1)'))).rejects.toThrow(/edited|changed/);await expect(composeRecoveredCampaignMission(studio,'startup',true,output.content,{...composition,sourceSha256:await hash(output.content),retiredStartups:[]})).rejects.toThrow(/ownership/);
  await expect(composeRecoveredCampaignMission(studio,'startup',true,original,composition)).rejects.toThrow(/SHA256/);
 });
 it('bounds lexical structure and ignores comment/string decoys when discovering declarations',()=>{
  for(const text of ['(script startup broken (sleep 1)','(script startup broken "unterminated)',';* unclosed','outside (script dormant fine (sleep 1))','(script startup "quoted name" (sleep 1))','('.repeat(130)+')'.repeat(130),' '.repeat(256*1024+1)])expect(()=>haloSourceDeclarations(text)).toThrow();
  const rows=haloSourceDeclarations(original);expect(rows.map(row=>row.name)).toEqual(['old_done','gs_complete_7','forerunner_extraction_complete','original_mission','unrelated']);for(const row of rows)expect(original.slice(row.start,row.end)).toMatch(/^\((?:script|global)/);
 });
});


it('creates only the selected named collection weapon inside its eligible mission step without changing declaration slots',()=>{
 const make=(create=false)=>({...emptyCreatorStudio(),missions:[{id:'collect',title:'Collect',objective:'Acquire',trigger:'weaponOwned' as const,weaponPath:'weapons/technology',encounterName:'',conditionVolume:'optional_route',...(create?{createWeaponObject:'be_technology'}:{})}]});
 const before=exportHaloCeMission(make()),after=exportHaloCeMission(make(true));expect(before.content).not.toContain('(object_create ');expect(after.content).toContain('(object_create be_technology)');expect(after.dependencies).toContain('weapon_object:be_technology:weapons/technology');expect(after.content.indexOf('(object_create ')).toBeGreaterThan(after.content.indexOf('(if (volume_test_objects optional_route'));expect(after.content.indexOf('(object_create ')).toBeLessThan(after.content.indexOf('(unit_has_weapon '));expect(after.content).not.toMatch(/object_create_anew|object_destroy|player_add_equipment/);
 expect(haloSourceDeclarations(after.content).map(row=>[row.kind,row.type,row.name])).toEqual(haloSourceDeclarations(before.content).map(row=>[row.kind,row.type,row.name]));
 for(const value of ['', 'bad) (quit)', '../weapon', 'a'.repeat(32)])expect(()=>exportHaloCeMission({...make(),missions:[{...make().missions[0],createWeaponObject:value}]})).toThrow();expect(()=>exportHaloCeMission({...make(),missions:[{...make().missions[0],trigger:'manual',createWeaponObject:'be_technology'}]})).toThrow();
});
