/** Source-only Halo 1 multiplayer spawn design review. No access to native
 * compiled collision, navigation, visibility, or netcode: findings are risks,
 * never certification that a playable cache will spawn correctly.
 * Primary sources:
 * https://nikon.bungie.org/misc/hek_tutorial/references/general/general_ld_info.html
 * https://c20.reclaimers.net/h1/guides/multiplayer/player-spawns/
 * https://c20.reclaimers.net/h1/engine/game-modes/
 */
import type { QuickForgeDocument, ForgeSpawn } from './forge';
import {CLASSIC_GAME_MODES,netgameUsageId,validSpawnForMode} from './haloGametypeScenario.ts';
import type {ClassicGameMode} from './haloGametypeScenario.ts';
export interface SpawnReviewFinding {
  code:string;
  severity:'blocker'|'caution'|'recommendation';
  message:string;
  ids:string[];
}
export interface SpawnReview {
  schema:'guiltyspark-halo1-spawn-review/v1';
  scope:'authored-scenario-only';
  engineVerified:false;
  mapCompiled:false;
  sourceName:string;
  template:string;
  recommendedPerTeam:number;
  /** Mode eligibility is not a guarantee that the engine will use a start. */
  modeCoverage:Record<ClassicGameMode,number>;
  ctfTeamEligible:{red:number;blue:number};
  authoringNotes:string[];
  findings:SpawnReviewFinding[];
  totalFindings:number;
  omittedFindings:number;
}
const RECOMMENDED_PER_TEAM=16;
const finite=(point:unknown):point is [number,number,number] => Array.isArray(point)&&point.length===3&&point.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=2048);
const d2=(a:readonly number[],b:readonly number[]) => (a[0]-b[0])**2+(a[1]-b[1])**2;
const sharedMode=(a:ForgeSpawn,b:ForgeSpawn) => CLASSIC_GAME_MODES.some(mode=>validSpawnForMode(a,mode)&&validSpawnForMode(b,mode));
export function auditMultiplayerSpawns(doc:Pick<QuickForgeDocument,'name'|'template'|'spawns'|'objectives'>):SpawnReview {
  if(!doc||typeof doc.name!=='string'||doc.name.length>120||typeof doc.template!=='string'||doc.template.length>72||
     !Array.isArray(doc.spawns)||doc.spawns.length>256||!Array.isArray(doc.objectives)||doc.objectives.length>200)
    throw new Error('Invalid or oversized scenario source for spawn audit');
  for(const o of doc.objectives){
    if(!o||typeof o.id!=='string'||o.id.length>128||typeof o.kind!=='string'||
       !Number.isSafeInteger(o.team)||!finite(o.position))
      throw new Error('Scenario objective record is malformed');
  }
  const findings:SpawnReviewFinding[]=[];
  let total=0;
  const add=(code:string,severity:SpawnReviewFinding['severity'],message:string,ids:string[]=[])=>{
    total++;
    if(findings.length<128)findings.push({code,severity,message,ids:ids.slice(0,32)});
  };
  const ids=new Set<string>();
  for(const s of doc.spawns){
    if(!s||typeof s.id!=='string'||s.id.length<1||s.id.length>128||ids.has(s.id))
      throw new Error('Spawn IDs must be unique bounded strings');
    ids.add(s.id);
    if(!finite(s.position)||!Array.isArray(s.gameModes)||s.gameModes.length>4||s.gameModes.some(m=>typeof m!=='string'||m.length>24)||!Number.isSafeInteger(s.team)||s.team<-1||s.team>15)
      throw new Error('Spawn coordinate, team or game-mode record is malformed');
  }
  const modeCoverage=Object.fromEntries(CLASSIC_GAME_MODES.map(mode=>[mode,doc.spawns.filter(s=>validSpawnForMode(s,mode)).length])) as Record<ClassicGameMode,number>;
  const ctf=doc.spawns.filter(s=>validSpawnForMode(s,'ctf'));
  const red=ctf.filter(s=>s.team===0), blue=ctf.filter(s=>s.team===1);
  for(const [name,starts] of [['red',red],['blue',blue]] as const){
    if(!starts.length)add('CTF_TEAM_EMPTY','blocker',`No ${name} CTF-eligible starts exist.`,[]);
    else if(starts.length<RECOMMENDED_PER_TEAM)
      add('CTF_TEAM_SPAWN_RECOMMENDATION','recommendation',
        `Only ${starts.length} ${name} team starts. Historic Bungie level-design guidance recommends ${RECOMMENDED_PER_TEAM} starts per team; this is a design target, not a hard parser limit.`,starts.map(s=>s.id));
  }
  for(const mode of CLASSIC_GAME_MODES){
    if(modeCoverage[mode]<2)add('MODE_START_SHORTAGE','blocker',`${mode} has ${modeCoverage[mode]} eligible authored player starts.`,[]);
    else if(modeCoverage[mode]<16)add('MODE_START_RECOMMENDATION','recommendation',
      `${mode} has ${modeCoverage[mode]} eligible starts; review capacity for a 16-player match.`,[]);
  }
  const redFlag=doc.objectives.find(o=>o.kind==='ctfFlag'&&netgameUsageId(o)===0);
  const blueFlag=doc.objectives.find(o=>o.kind==='ctfFlag'&&netgameUsageId(o)===1);
  if(redFlag&&blueFlag&&finite(redFlag.position)&&finite(blueFlag.position)){
    for(const [team, own, enemy, starts] of [[0,redFlag,blueFlag,red],[1,blueFlag,redFlag,blue]] as const){
      const disabled=starts.filter(s=>d2(s.position,own.position)>d2(s.position,enemy.position));
      if(disabled.length)add('CTF_START_ENEMY_SIDE',disabled.length===starts.length?'blocker':'caution',
        `${disabled.length}/${starts.length} CTF team ${team} starts are closer to the opposing flag and may be disabled by the engine.`,disabled.map(s=>s.id));
    }
  } else {
    add('CTF_FLAG_PROVENANCE','caution','Cannot check CTF spawn-side eligibility without one red and one blue flag marker.');
  }
  // Bounded to 256^2/2 pairs; comparisons are authored XY only (not player
  // capsule clearance, vertical floors or in-game line-of-sight).
  let closePairs=0, enemyPressure=0;
  const closeIds:string[]=[], pressureIds:string[]=[];
  for(let i=0;i<doc.spawns.length;i++)for(let j=i+1;j<doc.spawns.length;j++){
    const a=doc.spawns[i],b=doc.spawns[j];
    if(!sharedMode(a,b))continue;
    const horizontalSq=d2(a.position,b.position);
    const height=Math.abs(a.position[2]-b.position[2]);
    if(horizontalSq+height*height<1){closePairs++;if(closeIds.length<16)closeIds.push(a.id,b.id);}
    if(a.team!==b.team&&[0,1].includes(a.team)&&[0,1].includes(b.team)&&
       horizontalSq<25&&height<2){enemyPressure++;if(pressureIds.length<16)pressureIds.push(a.id,b.id);}
  }
  if(closePairs)add('NEAR_DUPLICATE_STARTS','caution',
    `${closePairs} start pairs are under 1 world unit apart in authored 3D distance; check collision and waiting-for-space behavior.`,closeIds);
  if(enemyPressure)add('ENEMY_SPAWN_PRESSURE','caution',
    `${enemyPressure} cross-team start pairs are within 5 horizontal world units at similar height; review spawn blocking and team safety in Halo.`,pressureIds);
  return {schema:'guiltyspark-halo1-spawn-review/v1',scope:'authored-scenario-only',
    engineVerified:false,mapCompiled:false,sourceName:doc.name,template:doc.template,
    recommendedPerTeam:RECOMMENDED_PER_TEAM,modeCoverage,
    ctfTeamEligible:{red:red.length,blue:blue.length},
    authoringNotes:[
      'Bungie recommended 16 starts per team as a multiplayer design guideline; this does not establish engine necessity or valid collision.',
      'Halo 1 CTF disables starts closer to the opposing flag. Enemy presence within approximately 5 world units can influence spawn blocking.',
      'Review the actual compiled scenario, player capsule clearance, CTF teams, and real two-client Halo gameplay before accepting the map.',
      'This JSON is source-only and omits coordinates, paths, tag bytes, cache bytes, user data and runtime results.',
    ],findings,totalFindings:total,omittedFindings:total-findings.length};
}
