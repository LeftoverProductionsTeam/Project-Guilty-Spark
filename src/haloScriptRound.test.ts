import { describe, expect, it } from 'vitest';
import { exportHaloCeFirefightRound } from './haloScript';
import type { FirefightConfig } from './firefight';
export function nativeRoundFixture():FirefightConfig {
  return {schemaVersion:1,title:'Native round',sourceSha256:null,seed:1,playerCount:1,teamLives:1,allowRevives:false,
    rounds:1,endless:false,preparationMs:1000,countdownMs:1000,intermissionMs:1000,spawnIntervalMs:500,
    spawnTimeoutMs:5000,stuckTimeoutMs:60000,maxSpawnAttempts:1,maxAlive:4,maxTotalPerWave:4,
    difficultyStepPercent:0,extraPlayerCountPercent:0,startingEquipment:[],replenishAmmoEachWave:false,supplyDropTags:[],
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
    expect(out.content).not.toMatch(/unit_kill|ai_kill|damage_object|object_destroy|ai_erase_all|cheat/);
    expect(out.dependencies).toHaveLength(2);
    expect(out.generatedOnly).toBe(true);
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
