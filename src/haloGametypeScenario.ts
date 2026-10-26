/** Halo CE scenario-netgame authoring rules. These operations NEVER modify a
 * compiled .map. A source plan must still be compiled with the correct Halo 1
 * editing kit and tested in the real target engine.
 *
 * References:
 * https://c20.reclaimers.net/h1/tags/scenario/#netgame-flags
 * https://c20.reclaimers.net/h1/engine/game-modes/
 * https://nikon.bungie.org/misc/hek_tutorial/references/level_design/mp_level_design/mp_ld_level_population.html
 */
import type { ForgeObjective, ForgeSpawn, QuickForgeDocument } from './forge';
import type { Vec3 } from './types';

export type ClassicGameMode = 'ctf' | 'slayer' | 'oddball' | 'king' | 'race';
export const CLASSIC_GAME_MODES: readonly ClassicGameMode[] = ['slayer', 'ctf', 'oddball', 'king', 'race'];
export interface NetgameFinding {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  ids: string[];
}
export interface HillArea {
  usageId: number;
  markerIds: string[];
  /** Engine's horizontal convex hull, or a 2x2 single-marker square. */
  polygon: Vec3[];
  valid: boolean;
  shape: 'single' | 'polygon' | 'invalid';
}

const distance2 = (a: Vec3, b: Vec3) => (a[0]-b[0])**2+(a[1]-b[1])**2;
const finitePoint = (p: Vec3) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const cross = (o: Vec3, a: Vec3, b: Vec3) => (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);

/** Legacy QuickForge hill/ball records used sequence while storing team=-1.
 * Preserve their effective IDs until the user edits them; new data stores the
 * ID in team (which Halo's scenario format calls usage_id).
 */
export function netgameUsageId(o: ForgeObjective): number {
  if (o.kind === 'raceCheckpoint') return o.sequence;
  return (o.kind === 'hill' || o.kind === 'oddball') && o.team < 0 ? o.sequence : o.team;
}

/** Convex hull of unique XY samples in world units. Collinear samples cannot
 * define a polygon; never invent a valid hill from two points. */
export function convexHullXY(points: readonly Vec3[]): Vec3[] {
  if (!points.every(finitePoint) || points.length > 8) return [];
  const sorted = [...points].sort((a,b) => a[0]-b[0] || a[1]-b[1]);
  const unique: Vec3[] = [];
  for (const p of sorted) if (!unique.length || distance2(p, unique[unique.length-1]) > 1e-10) unique.push(p);
  if (unique.length < 3) return [];
  const lower: Vec3[] = [], upper: Vec3[] = [];
  for (const p of unique) {
    while (lower.length >= 2 && cross(lower[lower.length-2],lower[lower.length-1],p) <= 1e-7) lower.pop();
    lower.push(p);
  }
  for (const p of [...unique].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length-2],upper[upper.length-1],p) <= 1e-7) upper.pop();
    upper.push(p);
  }
  const hull = lower.slice(0,-1).concat(upper.slice(0,-1));
  const signedArea = hull.reduce((s,p,i)=>s+p[0]*hull[(i+1)%hull.length][1]-hull[(i+1)%hull.length][0]*p[1],0)/2;
  return hull.length>=3 && Number.isFinite(signedArea) && Math.abs(signedArea)>0.001 ? hull : [];
}

export function hillAreas(objectives: readonly ForgeObjective[]): HillArea[] {
  const groups = new Map<number, ForgeObjective[]>();
  for (const obj of objectives) {
    if (obj.kind !== 'hill') continue;
    const id = netgameUsageId(obj);
    const members = groups.get(id) ?? [];
    members.push(obj);
    groups.set(id,members);
  }
  return [...groups.entries()].sort(([a],[b])=>a-b).map(([usageId, members]) => {
    const count = members.length;
    const single = count===1 && finitePoint(members[0].position);
    const polygon: Vec3[] = single ? (() => {
      const [x,y,z] = members[0].position;
      return [[x-1,y-1,z],[x+1,y-1,z],[x+1,y+1,z],[x-1,y+1,z]];
    })() : count>=3 && count<=8 ? convexHullXY(members.map(m=>m.position)) : [];
    const valid = polygon.length>=3 && (single || count>=3 && count<=8);
    return { usageId, markerIds:members.map(m=>m.id), polygon, valid,
      shape:!valid?'invalid':single?'single':'polygon' };
  });
}

export function validSpawnForMode(s: ForgeSpawn, mode: ClassicGameMode): boolean {
  const allowed=s.gameModes??[];
  return allowed.includes('allGames') || allowed.some(m=>m===mode || mode==='slayer' && m==='teamSlayer');
}

/** Engine-level crash/format guards. All authorable markers count, even if
 * visually hidden: QuickForge's hidden flag does not remove a scenario entry. */
export function auditClassicNetgame(doc: Pick<QuickForgeDocument,'objectives'|'spawns'|'gameMode'>): NetgameFinding[] {
  const issues: NetgameFinding[] = [];
  const fail=(code:string,message:string,ids:string[]=[])=>issues.push({severity:'error',code,message,ids});
  const warn=(code:string,message:string,ids:string[]=[])=>issues.push({severity:'warning',code,message,ids});
  const flags = doc.objectives;
  if (flags.length>200) fail('CE_FLAG_LIMIT','Classic HEK supports at most 200 scenario netgame flags.');
  const ctf=flags.filter(o=>o.kind==='ctfFlag');
  const balls=flags.filter(o=>o.kind==='oddball');
  const race=flags.filter(o=>o.kind==='raceCheckpoint');
  const hills=flags.filter(o=>o.kind==='hill');
  const knownKinds=new Set(['ctfFlag','oddball','raceCheckpoint','hill','raceVehicle','teleportFrom','teleportTo']);
  for(const obj of flags) {
    if(!knownKinds.has(obj.kind) || !finitePoint(obj.position) || !Number.isFinite(obj.facing))
      fail('CE_BAD_FLAG','Netgame flag type, position and facing must be valid.',[obj.id]);
    const u=netgameUsageId(obj);
    const max = obj.kind==='raceCheckpoint'?31:obj.kind==='ctfFlag'?1:15;
    if(!Number.isSafeInteger(u) || u<0 || u>max)
      fail('CE_USAGE_ID_RANGE',`${obj.kind}: usage ID ${u} is outside 0–${max}.`,[obj.id]);
    if(obj.kind==='raceVehicle' && obj.team!==0)
      warn('CE_RACE_VEHICLE_UNUSED_ID','Race vehicle usage ID is unused by Halo CE; zero is recommended.',[obj.id]);
    if((obj.kind==='hill'||obj.kind==='oddball')&&obj.team<0)
      warn('LEGACY_USAGE_ID',`${obj.name}: legacy marker stores its usage ID in sequence. Set the indexed ID in Properties to migrate.`,[obj.id]);
  }
  for(const id of [0,1]) {
    const matching=ctf.filter(o=>netgameUsageId(o)===id);
    if(matching.length>1) fail('CE_DUPLICATE_CTF',`CTF flag for team ${id} appears ${matching.length} times.`,matching.map(o=>o.id));
  }
  if(doc.gameMode==='ctf' && !(ctf.some(o=>netgameUsageId(o)===0)&&ctf.some(o=>netgameUsageId(o)===1)))
    warn('CE_CTF_MISSING','CTF requires separate red (0) and blue (1) netgame flags.');
  if(balls.length>16) fail('CE_ODDBALL_LIMIT','Halo CE supports at most 16 numbered Oddball spawn markers.',balls.map(o=>o.id));
  for(const kind of [balls,race]) {
    const used=new Map<number,ForgeObjective>();
    for(const o of kind){
      const id=netgameUsageId(o);
      if(used.has(id)) fail(kind===balls?'CE_DUPLICATE_BALL':'CE_DUPLICATE_RACE',
        `Two ${o.kind} markers share usage ID ${id}.`,[used.get(id)!.id,o.id]);
      else used.set(id,o);
    }
    if(kind.length>0){
      const ids=[...used.keys()].sort((a,b)=>a-b);
      if(ids.some((id,i)=>id!==i)) fail(kind===balls?'CE_BALL_INDEX_GAP':'CE_RACE_INDEX_GAP',
        `${kind[0].kind} IDs must be sequential from 0 with no gaps.`,kind.map(o=>o.id));
    }
  }
  if(race.length>32) fail('CE_RACE_LIMIT','Race supports at most 32 checkpoints.',race.map(o=>o.id));
  const raceVehicles=flags.filter(o=>o.kind==='raceVehicle');
  if(raceVehicles.length>16)fail('CE_RACE_VEHICLE_LIMIT','Classic Halo CE supports at most 16 race vehicle markers.',raceVehicles.map(o=>o.id));
  if(doc.gameMode==='race' && !raceVehicles.length)warn('CE_RACE_VEHICLE_SUGGESTION','Race vehicle markers help Halo spawn vehicles near Race players; add them where players have driving clearance.');
  const teleports=new Map<number,{entries:ForgeObjective[];exits:ForgeObjective[]}>();
  for(const o of flags.filter(o=>o.kind==='teleportFrom'||o.kind==='teleportTo')){
    const channel=netgameUsageId(o);
    const group=teleports.get(channel)??{entries:[],exits:[]};
    (o.kind==='teleportFrom'?group.entries:group.exits).push(o);
    teleports.set(channel,group);
  }
  for(const [channel,group] of teleports){
    if(!group.entries.length || !group.exits.length)
      fail('CE_TELEPORT_CHANNEL_UNPAIRED',`Teleporter channel ${channel} requires at least one entrance and one exit.`,[...group.entries,...group.exits].map(o=>o.id));
    if(group.exits.length>1)
      warn('CE_TELEPORT_MULTIPLE_EXITS',`Channel ${channel} has ${group.exits.length} exit markers; verify the intended destination behavior in Halo.`,group.exits.map(o=>o.id));
    for(const entry of group.entries)for(const exit of group.exits){
      if(finitePoint(entry.position)&&finitePoint(exit.position)&&
         entry.position.every((v,i)=>Math.abs(v-exit.position[i])<0.5))
        warn('CE_TELEPORT_OVERLAP',`Channel ${channel} has entrance and exit less than 0.5 units apart; check for teleport loops.`,[entry.id,exit.id]);
    }
  }
  if(doc.gameMode==='race' && race.length<2) warn('CE_RACE_MISSING','Race needs an ordered checkpoint course (at least two recommended).');
  if(doc.gameMode==='oddball' && !balls.length) warn('CE_BALL_MISSING','Oddball needs a ball spawn, beginning with usage ID 0.');
  const areas=hillAreas(flags);
  for(const area of areas){
    const group=hills.filter(o=>netgameUsageId(o)===area.usageId);
    if(group.length===2) fail('CE_TWO_POINT_HILL',`Hill ${area.usageId} has exactly two flags: this can crash Halo CE/Standalone. Use one marker or 3–8.`,area.markerIds);
    else if(group.length>8) fail('CE_HILL_POINT_LIMIT',`Hill ${area.usageId} has ${group.length} points; maximum is eight.`,area.markerIds);
    else if(!area.valid || group.some((a,i)=>group.slice(i+1).some(b=>distance2(a.position,b.position)<1e-10)))
      fail('CE_HILL_DEGENERATE',`Hill ${area.usageId} has an invalid/collinear/duplicate XY polygon.`,area.markerIds);
    else if(group.length>1 && area.polygon.length<group.length)
      warn('CE_HILL_CONVEX_HULL',`Hill ${area.usageId} includes interior or collinear markers; Halo uses the convex hull, not a concave boundary.`,area.markerIds);
    if(group.length>1) {
      const heights=group.map(o=>o.position[2]);
      if(Math.max(...heights)-Math.min(...heights)>0.2)
        warn('CE_HILL_HEIGHTS',`Hill ${area.usageId} markers vary in elevation; verify the vertical scoring slab in-game.`,area.markerIds);
    }
  }
  if(doc.gameMode==='king' && !areas.length) warn('CE_HILL_MISSING','King requires at least one valid hill marker group.');
  if(doc.gameMode==='king' && areas.length===1) warn('CE_CRAZY_KING','One hill supports fixed King; moving/Crazy King should have at least two groups.');
  const starts=doc.spawns;
  for(const start of starts) {
    if(!finitePoint(start.position)) fail('CE_INVALID_SPAWN',`Player start ${start.name??start.id} has an invalid position.`,[start.id]);
  }
  for(const mode of CLASSIC_GAME_MODES){
    const eligible=starts.filter(s=>validSpawnForMode(s,mode));
    if((mode===doc.gameMode || mode==='slayer'&&doc.gameMode==='teamSlayer') && eligible.length<2)
      warn('CE_FEW_MODE_STARTS',`${mode} has only ${eligible.length} eligible starts; add multiple safe player starts.`,eligible.map(s=>s.id));
  }
  if(doc.gameMode==='ctf' && ctf.length>=2){
    const flag0=ctf.find(o=>netgameUsageId(o)===0), flag1=ctf.find(o=>netgameUsageId(o)===1);
    if(flag0 && flag1 && finitePoint(flag0.position) && finitePoint(flag1.position)){
      if(distance2(flag0.position,flag1.position)<16)
        warn('CE_CTF_FLAGS_CLOSE','CTF flag locations are very close; check team-base separation and spawn eligibility.',[flag0.id,flag1.id]);
      for(const team of [0,1]){
        const flag=team===0?flag0:flag1, enemy=team===0?flag1:flag0;
        const startsForTeam=starts.filter(s=>s.team===team && validSpawnForMode(s,'ctf'));
        if(!startsForTeam.length) warn('CE_CTF_TEAM_STARTS',`CTF team ${team} has no eligible player starts.`);
        else if(startsForTeam.every(s=>finitePoint(s.position) && distance2(s.position,flag.position)>distance2(s.position,enemy.position)))
          warn('CE_CTF_SPAWN_ELIGIBILITY',`CTF team ${team} starts are all closer to the opposing flag; Halo may disable them.`,startsForTeam.map(s=>s.id));
      }
    }
  }
  return issues.slice(0,128);
}

/** Add a visually defined 4-point hill; the actual engine uses these exact
 * netgame markers as a convex hull after scenario compilation. */
export function makeFourPointHill(center:Vec3,usageId:number,halfWidth=2,halfDepth=2,ids?:()=>string):ForgeObjective[] {
  if(!finitePoint(center) || !Number.isSafeInteger(usageId) || usageId<0 || usageId>15 ||
     !Number.isFinite(halfWidth) || !Number.isFinite(halfDepth) ||
     halfWidth<=0.1 || halfDepth<=0.1 || halfWidth>128 || halfDepth>128) throw new Error('Hill needs a finite centre, size 0.1–128 and usage index 0–15.');
  const nextId=ids??(()=>crypto.randomUUID());
  return [[-halfWidth,-halfDepth],[halfWidth,-halfDepth],[halfWidth,halfDepth],[-halfWidth,halfDepth]].map(([dx,dy],i)=>({
    id:nextId(),name:`Hill ${usageId} corner ${i+1}`,kind:'hill',position:[center[0]+dx,center[1]+dy,center[2]],
    facing:0,team:usageId,sequence:i,visible:true,locked:false,
  }));
}
/** Find a channel that is not used by either half of an authored teleporter link. */
/** Fill the first unused Race checkpoint index instead of using the array
 * length, which can duplicate IDs after authors delete an intermediate flag. */
export function nextFreeRaceCheckpointId(doc:Pick<QuickForgeDocument,'objectives'>):number | null {
  const used=new Set(doc.objectives.filter(o=>o.kind==='raceCheckpoint').map(netgameUsageId));
  for(let i=0;i<32;i++)if(!used.has(i))return i;
  return null;
}
export function nextFreeTeleportChannel(doc:Pick<QuickForgeDocument,'objectives'>):number | null {
  const busy=new Set(doc.objectives.filter(o=>o.kind==='teleportFrom'||o.kind==='teleportTo').map(netgameUsageId));
  for(let channel=0;channel<=15;channel++)if(!busy.has(channel))return channel;
  return null;
}
/** Create one complete netgame teleporter channel as a single reversible edit.
 * No collision or native runtime behavior is claimed by this source helper. */
export function makeTeleporterPair(entry:Vec3,exit:Vec3,channel:number,ids?:()=>string):ForgeObjective[] {
  if(!finitePoint(entry)||!finitePoint(exit)||!Number.isSafeInteger(channel)||channel<0||channel>15)
    throw new Error('Teleporter requires two finite positions and a channel 0–15.');
  if(entry.every((v,i)=>Math.abs(v-exit[i])<0.5))
    throw new Error('Teleporter exit must be at least 0.5 units away from its entrance in some axis.');
  const nextId=ids??(()=>crypto.randomUUID());
  return (['teleportFrom','teleportTo'] as const).map((kind,i)=>({
    id:nextId(),name:`Teleporter channel ${channel} ${i===0?'entrance':'exit'}`,
    kind,position:[...(i===0?entry:exit)] as Vec3,facing:0,team:channel,sequence:0,visible:true,locked:false,
  }));
}
/** Ordered geometric preview, not a networked game-state simulation. */
export function raceCoursePoints(objectives:readonly ForgeObjective[]):Vec3[] {
  const points=objectives.filter(o=>o.kind==='raceCheckpoint');
  if(points.length<2||points.length>32||points.some(o=>!finitePoint(o.position)))return [];
  const sorted=[...points].sort((a,b)=>netgameUsageId(a)-netgameUsageId(b));
  if(sorted.some((p,i)=>netgameUsageId(p)!==i))return []; // do not draw a false valid route
  return sorted.map(o=>o.position);
}
export function teleporterLinks(objectives:readonly ForgeObjective[]):{channel:number;start:Vec3;end:Vec3}[] {
  const result:{channel:number;start:Vec3;end:Vec3}[]=[];
  for(const entrance of objectives.filter(o=>o.kind==='teleportFrom'&&finitePoint(o.position)&&netgameUsageId(o)>=0&&netgameUsageId(o)<=15)){
    for(const exit of objectives.filter(o=>o.kind==='teleportTo'&&finitePoint(o.position)&&netgameUsageId(o)===netgameUsageId(entrance))){
      if(result.length>=64)return result; // bounded visual preview
      result.push({channel:netgameUsageId(entrance),start:entrance.position,end:exit.position});
    }
  }
  return result;
}
export function nextFreeUsageId(doc:Pick<QuickForgeDocument,'objectives'>,kind:'hill'|'ctfFlag'|'oddball'):number | null {
  const max=kind==='ctfFlag'?1:15;
  const used=new Set(doc.objectives.filter(o=>o.kind===kind).map(netgameUsageId));
  for(let id=0;id<=max;id++) if(!used.has(id))return id;
  return null;
}

/** UI readiness is an editor-source checklist, not a gameplay certification. */
export function classicModeChecklist(doc:Pick<QuickForgeDocument,'objectives'|'spawns'|'gameMode'>):{mode:ClassicGameMode;label:string;count:number;ready:boolean;notes:string[]}[] {
  const flags=doc.objectives;
  const areas=hillAreas(flags);
  const allIssues=auditClassicNetgame(doc);
  return CLASSIC_GAME_MODES.map(mode=>{
    const count=doc.spawns.filter(s=>validSpawnForMode(s,mode)).length;
    const notes:string[]=[];
    if(count<2)notes.push(`Only ${count} eligible starts`);
    if(mode==='ctf'){
      const red=flags.find(o=>o.kind==='ctfFlag'&&netgameUsageId(o)===0);
      const blue=flags.find(o=>o.kind==='ctfFlag'&&netgameUsageId(o)===1);
      if(!red||!blue)notes.push('Place both team flags');
      for(const team of [0,1]){
        const teamStarts=doc.spawns.filter(s=>s.team===team&&validSpawnForMode(s,'ctf'));
        if(!teamStarts.length)notes.push(`Add team ${team} CTF player starts`);
        if(red&&blue&&teamStarts.length){
          const own=team===0?red:blue,enemy=team===0?blue:red;
          if(finitePoint(own.position)&&finitePoint(enemy.position)&&teamStarts.every(s=>
            !finitePoint(s.position)||distance2(s.position,own.position)>distance2(s.position,enemy.position)))
              notes.push(`Team ${team} spawns may be disabled by Halo CTF flag-proximity rules`);
        }
      }
    }
    if(mode==='oddball' && !flags.some(o=>o.kind==='oddball'&&netgameUsageId(o)===0))notes.push('Place first ball spawn (0)');
    if(mode==='king' && !areas.some(a=>a.valid&&a.usageId===0))notes.push('Place hill group 0');
    if(mode==='race' && flags.filter(o=>o.kind==='raceCheckpoint').length<2)notes.push('Place at least two checkpoints');
    if(allIssues.some(i=>i.severity==='error'))notes.push('Resolve netgame flag errors');
    return {mode,label:{slayer:'Slayer',ctf:'CTF',oddball:'Oddball',king:'King of the Hill',race:'Race'}[mode],count,ready:notes.length===0,notes};
  });
}

/** Resolve documented Halo 1 variant aliases to their real scenario mode.
 * Infection/Firefight concepts return null: they are not stock CE game modes. */
export function classicModeFromVariant(raw:string):ClassicGameMode|null {
  const v=raw.toLowerCase().trim().replace(/ /g,'_').replace(/^classic_/,'').replace(/^team_/,'');
  if(!v || /(?:infection|firefight|zombie)/.test(v))return null;
  if(/^(?:ctf|iron_ctf|invasion|assault|ctf_pro)$/.test(v))return 'ctf';
  if(/^(?:king|king_pro|crazy_king)$/.test(v))return 'king';
  if(/^(?:oddball|reverse_tag|accumulation|juggernaut|stalker)$/.test(v))return 'oddball';
  if(/^(?:race|rally)$/.test(v))return 'race';
  if(/^(?:slayer|slayer_pro|phantoms|endurance|rockets|snipers)$/.test(v))return 'slayer';
  return null;
}
