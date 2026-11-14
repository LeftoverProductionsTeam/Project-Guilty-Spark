import type { Vec3 } from './types';
export interface EnemyType {
  id: string;
  name: string;
  actorVariantPath: string;
  points: number;
}
export interface SpawnZone {
  id: string;
  position: Vec3;
  radius: number;
  enabled: boolean;
}
export interface WaveDefinition {
  id: string;
  name: string;
  boss: boolean;
  scoreMultiplierMilli: number;
  groups: { enemyId: string; count: number; spawnZoneId?: string | null }[];
}
export interface NativePlayerProfile {
  primaryWeapon:string; primaryLoaded:number; primaryReserved:number;
  secondaryWeapon:string|null; secondaryLoaded:number; secondaryReserved:number;
  health:number; shields:number; fragmentationGrenades:number; plasmaGrenades:number;
}
export const defaultNativePlayerProfile=():NativePlayerProfile=>({primaryWeapon:'weapons/pistol/pistol',primaryLoaded:12,primaryReserved:60,
  secondaryWeapon:null,secondaryLoaded:0,secondaryReserved:0,health:1,shields:1,fragmentationGrenades:2,plasmaGrenades:0});
export interface FirefightConfig {
  schemaVersion: number;
  title: string;
  sourceSha256: string | null;
  seed: number;
  playerCount: number;
  teamLives: number;
  allowRevives: boolean;
  rounds: number;
  endless: boolean;
  preparationMs: number;
  countdownMs: number;
  intermissionMs: number;
  spawnIntervalMs: number;
  spawnTimeoutMs: number;
  stuckTimeoutMs: number;
  maxSpawnAttempts: number;
  maxAlive: number;
  maxTotalPerWave: number;
  difficultyStepPercent: number;
  extraPlayerCountPercent: number;
  enemies: EnemyType[];
  spawnZones: SpawnZone[];
  waves: WaveDefinition[];
  startingEquipment: string[];
  replenishAmmoEachWave: boolean;
  supplyDropTags: string[];
  nativePlayerProfile?: NativePlayerProfile;
  nativeHudMessages?: boolean;
}
export interface NativeFirefightHudMessage {name:string;text:string}
/** Standard HMT source for the opt-in fresh-scenario controller, not engine HUD RPC. */
export function nativeFirefightHudMessages(config:FirefightConfig):NativeFirefightHudMessage[] {
  if(config.nativeHudMessages!==true)return [];
  if(!Number.isSafeInteger(config.rounds)||config.rounds<1||config.rounds>32||!config.waves.length||config.waves.length>32)
    throw Error('Native HUD messages require 1–32 finite rounds and waves.');
  const messages:NativeFirefightHudMessage[]=[
    {name:'gs_ff_ready',text:'Firefight: prepare for combat. One life.'},
    {name:'gs_ff_victory',text:'Victory! Pause menu: restart to replay, or quit to leave.'},
    {name:'gs_ff_no_player',text:'Round stopped: no living player. Pause to restart or quit.'},
    {name:'gs_ff_spawn_failed',text:'Round stopped: enemy wave not ready. Pause to restart or quit.'},
    {name:'gs_ff_defeated',text:'Defeat. Pause menu: restart to replay, or quit to leave.'},
    {name:'gs_ff_timed_out',text:'Round stopped: wave time limit reached. Pause to restart or quit.'},
  ];
  const enemies=new Map(config.enemies.map(enemy=>[enemy.id,enemy]));
  const scores=new Set<number>([0]);let score=0;
  for(let r=0;r<config.rounds;r++){
    messages.push({name:'gs_ff_round_'+(r+1),text:'Round '+(r+1)+' of '+config.rounds});
    for(let w=0;w<config.waves.length;w++){
      const wave=config.waves[w];let count=0,points=0;
      if(!Number.isSafeInteger(wave.scoreMultiplierMilli)||wave.scoreMultiplierMilli<1||wave.scoreMultiplierMilli>10000)throw Error('Native HUD score multiplier is invalid.');
      for(const group of wave.groups){const enemy=enemies.get(group.enemyId);
        if(!enemy||!Number.isSafeInteger(group.count)||group.count<1||group.count>32||!Number.isSafeInteger(enemy.points)||enemy.points<0||enemy.points>100000)throw Error('Native HUD needs valid finite actor counts and point values.');
        count+=group.count;points+=Math.floor(group.count*enemy.points*wave.scoreMultiplierMilli/1000);
      }
      if(r===0)messages.push({name:'gs_ff_wave_'+(w+1),text:'Wave '+(w+1)+' of '+config.waves.length+': eliminate '+count+' hostiles.'});
      score+=points;if(!Number.isSafeInteger(score)||score>2147483647)throw Error('Native HUD score exceeds Halo long range.');scores.add(score);
    }
  }
  for(const value of scores)messages.push({name:'gs_ff_score_'+value,text:'Team wave-clear score: '+value});
  if(messages.length>1024||messages.reduce((sum,message)=>sum+(message.text.length+1)*2,0)>65536)
    throw Error('Native HUD messages exceed the standard tag limits. Reduce finite rounds/waves or leave HUD generation off; the rules were retained.');
  return messages;
}
export function nativeFirefightHudSource(messages:NativeFirefightHudMessage[]):Uint8Array {
  const text=messages.map(message=>message.name+'='+message.text+'\r\n').join('');
  const bytes=new Uint8Array(2+text.length*2);bytes[0]=255;bytes[1]=254;
  const view=new DataView(bytes.buffer);for(let i=0;i<text.length;i++)view.setUint16(2+i*2,text.charCodeAt(i),true);
  return bytes;
}
export interface FirefightPreset {
  id: string;
  name: string;
  config: FirefightConfig | null;
  missingActorVariants: string[];
  detail: string;
}
export interface NativeEncounterCandidate {
  name:string;actorVariantPaths:string[];normalCount:number|null;insaneCount:number|null;startingLocations:number|null;notInitiallyCreated:boolean|null;issue:string|null;
}
export interface FirefightCatalog {
  sourceScenarioType?:number;
  encounters?:NativeEncounterCandidate[];
  enemies: EnemyType[];
  weapons?: string[];
  presets: FirefightPreset[];
  defaultConfig: FirefightConfig;
}
/** Explicit authoring reconciliation, not native conversion or tag extraction.
 * Keep authored IDs, scores, waves and zones. Every replacement must be selected
 * from this exact source catalog; source changes are never inferred from tag IDs. */
export function reconcileFirefightSource(
  config: FirefightConfig,
  catalog: FirefightCatalog,
  actors: Record<string,string> = {},
  weapons: Record<string,string> = {},
): FirefightConfig {
  const hash=catalog.defaultConfig.sourceSha256;
  if(!hash||!/^[0-9a-f]{64}$/i.test(hash))throw Error('The selected source has no verified map identity. Reopen its catalog.');
  const key=(path:string)=>path.replaceAll('\\','/').toLowerCase();
  const actorPaths=new Map(catalog.enemies.map(enemy=>[key(enemy.actorVariantPath),enemy.actorVariantPath]));
  const weaponPaths=new Map((catalog.weapons??[]).map(path=>[key(path),path]));
  const enemies=config.enemies.map(enemy=>{
    const path=actorPaths.get(key(actors[enemy.id]??enemy.actorVariantPath));
    if(!path)throw Error(`Choose a replacement in the selected source for ${enemy.name}. Its original definition was retained.`);
    return {...enemy,actorVariantPath:path};
  });
  const weapon=(path:string)=>{
    const replacement=weaponPaths.get(key(weapons[key(path)]??path));
    if(!replacement)throw Error(`Choose a starting weapon from the selected source for ${path}. The loadout was retained.`);
    return replacement;
  };
  const profile=config.nativePlayerProfile;
  return {...config,sourceSha256:hash,enemies,...(profile?{nativePlayerProfile:{...profile,
    primaryWeapon:weapon(profile.primaryWeapon),secondaryWeapon:profile.secondaryWeapon?weapon(profile.secondaryWeapon):null}}:{})};
}
export interface FirefightValidation {
  valid: boolean;
  sourceMatches: boolean;
  missingActorVariants: string[];
  missingEquipment: string[];
  runtimeIntegrated: false;
  diagnostics: string[];
}
export interface FirefightSimulation {
  schemaVersion: number;
  scope: 'authoringSimulationOnly';
  runtimeIntegrated: false;
  gameplayVerified: false;
  configSha256: string;
  state: {
    phase: string;
    elapsedMs: number;
    waveNumber: number;
    roundNumber: number;
    kills: number;
    score: number;
    teamLives: number;
    reason: string | null;
  };
  events: { atMs: number; kind: string; detail: string }[];
  diagnostics: string[];
}
