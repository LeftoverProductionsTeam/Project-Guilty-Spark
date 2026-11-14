import { describe, expect, it } from 'vitest';
import { attachNativeFirefightRound, exportHaloCeFirefightRound, nativeRoundBinding, nativeSoloFirefightRules } from './haloScript';
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
  it('owns exact encounters, waits for actual spawns and deaths, and provides bounded restart/score state',()=>{
    const out=exportHaloCeFirefightRound(nativeRoundFixture());
    expect(out.activation).toBe('(set gs_ff_start true)');
    expect(out.scenarioType).toBe('singleplayer');
    expect(out.content).toContain('(script continuous gs_firefight');
    expect(out.content).toContain('(sleep_until (= (ai_living_count gs_w01_g01) 2) 1 150)');
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
    expect(source.indexOf('(set gs_ff_units_w01_g01 (ai_actors gs_w01_g01))',source.indexOf('(ai_place gs_w01_g01)')))
      .toBeLessThan(source.indexOf('(sleep_until (= (ai_living_count gs_w01_g01) 2)'));
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
