import type { FirefightConfig } from './firefight';
export const campaignAiStates=['sleeping','alert','guarding','searching','fleeing','moving_repeat_same_position','moving_loop','moving_loop_back_and_forth','moving_loop_randomly','moving_randomly'] as const;
export type CampaignAiState=typeof campaignAiStates[number];
export interface NativeEncounterStart {id:string;position:[number,number,number];facingRadians:number;visible?:boolean;locked?:boolean}
export interface NativePatrolPoint extends NativeEncounterStart {waitSeconds:[number,number];weight:number}
export const campaignTacticalModes=['attacking','attackingSearch','attackingGuard','defending','defendingSearch','defendingGuard'] as const;
export type CampaignTacticalMode=typeof campaignTacticalModes[number];
export interface NativeFiringPoint {id:string;position:[number,number,number];group:string;visible?:boolean;locked?:boolean}
export interface NativeCombatSource {points:NativeFiringPoint[];groups:Record<CampaignTacticalMode,string[]>}
export interface NativeEncounterAppend {name:string;actorPath:string;position:[number,number,number];startActive:boolean;count?:number;spacing?:number;difficulty?:{normal:number;insane:number}|null;grid?:{total:number;offset:number};starts?:NativeEncounterStart[];patrol?:{points:NativePatrolPoint[]};combat?:NativeCombatSource;behavior?:{initialState:CampaignAiState;returnState:CampaignAiState}}
export interface NativeSquadCountEdit {encounter:number;squad:number;encounterName:string;squadName:string;normalCount:number;insaneCount:number}
export interface NativeScenarioSquad {encounter:number;squad:number;encounterName:string;name:string;normalCount:number;insaneCount:number;starts?:{index:number;position:[number,number,number];facingRadians?:number|null}[]|null}
export type NativeOperation = { kind: 'boundingRadius'; value: number } | { kind: 'lensFlareScaleRepair' } | {kind:'hudDuplicate';array:string;index:number;sourceSha256:string}
  | ({kind:'encounterSquadCounts';sourceSha256:string}&NativeSquadCountEdit)
  | {kind:'encounterSquadCountsBatch';sourceSha256:string;edits:NativeSquadCountEdit[]}
  | {kind:'encounterStartPosition';encounter:number;squad:number;start:number;encounterName:string;squadName:string;position:[number,number,number];sourceSha256:string;facingRadians?:number|null}
  | ({kind:'appendEncounter'}&Omit<NativeEncounterAppend,'grid'|'starts'|'behavior'|'patrol'|'combat'>) | {kind:'appendEncounters';encounters:NativeEncounterAppend[];sourceRules?:FirefightConfig};
export interface NativeTagContext {
  sourceTarget?: 'mcc-cea' | 'gbx-custom';
  projectId: string;
  buildId: string;
  tag: string;
  class: string;
  tagsDirectory: string;
  tagSha256?:string;
  boundingRadius: number | null;
  lensFlareScale: number | null;
  actorVariants?:string[];
  canAppendEncounter?:boolean;
  scenarioSquads?:NativeScenarioSquad[];
  scenarioStartSquads?:NativeScenarioSquad[];
  startEditIssue?:string|null;
  squadEditIssue?:string|null;
  protectedSquadEncounters?:string[];
  hudArrays?:{name:string;label:string;count:number|null;maximum:number;issue:string|null}[];
  canDuplicateHud?:boolean;
  hudStructureIssue?:string|null;
  firefightPlan?:Extract<NativeOperation,{kind:'appendEncounters'}>|null;
  firefightPlanIssue?:string|null;
  canEdit: boolean;
  canRepair: boolean;
  editIssue: string | null;
  repairIssue: string | null;
  history: NativePreview[];
}
export interface NativePreview {
  id: string;
  tag: string;
  toolId: string;
  beforeSha256: string;
  afterSha256: string;
  changedBytes: number;
  fieldChanges: { before: string; after: string }[];
  actorPositions?:[number,number,number][]|null;
  detail: string;
  currentState: 'before' | 'after' | 'conflict';
}
export interface NativeAccepted {
  operationId: string;
  revisionId: string;
  tagsDirectory: string;
  files: number;
  restored: boolean;
  detail: string;
}
export interface NativeDependencies {
  tag: string;
  tool: string;
  executableSha256: string;
  complete: boolean;
  dependencies: { path: string; reportedBroken: boolean; present: boolean }[];
  output: string;
  detail: string;
}
export function notifyNativeSource(projectId: string) {
  window.dispatchEvent(new CustomEvent('guilty-spark-native-source-changed', { detail: { projectId } }));
}

/** Source-only campaign proposal. Native writing and validation remain in the existing append recipe. */
export function scaleCampaignDifficulty(entries:NativeEncounterAppend[],normalFactor:number,insaneFactor:number,selected?:string){
 if(!entries.length||[normalFactor,insaneFactor].some(value=>!Number.isFinite(value)||value<0||value>4))throw Error('Choose campaign groups and finite population factors between 0 and 4.');
 if(selected!==undefined&&!entries.some(entry=>entry.name===selected))throw Error('Select an existing campaign encounter.');
 const rows:{name:string;before:[number,number];after:[number,number];clamped:boolean}[]=[];
 let changed=0;
 const next=entries.map(entry=>{
  if(selected!==undefined&&entry.name!==selected)return entry;
  const count=entry.count??1,before:[number,number]=[entry.difficulty?.normal??count,entry.difficulty?.insane??count];
  if(!Number.isInteger(count)||count<1||count>32||before.some(value=>!Number.isInteger(value)||value<0||value>count))throw Error('Review invalid starting-position or native difficulty counts for '+entry.name+'.');
  const requested:[number,number]=[Math.round(before[0]*normalFactor),Math.round(before[1]*insaneFactor)];
  const after=requested.map(value=>Math.min(count,value)) as [number,number];
  rows.push({name:entry.name,before,after,clamped:requested.some(value=>value>count)});
  if(before.every((value,index)=>value===after[index]))return entry;
  changed++;return {...entry,difficulty:{normal:after[0],insane:after[1]}};
 });
 return {entries:next,rows,changed};
}

/** Same f32 native grid for preview; explicit poses become the sole source on edit. */
export function campaignEncounterStarts(entry:NativeEncounterAppend):NativeEncounterStart[]{
 campaignPatrolPoints(entry);campaignCombatPoints(entry);
 if(entry.starts){if(entry.grid||entry.starts.length!==(entry.count??1)||!entry.starts.length||entry.starts.length>32)throw Error('Review the individual campaign start count.');const ids=new Set<string>();for(const point of entry.starts){if(typeof point.id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(point.id)||ids.has(point.id)||!Array.isArray(point.position)||point.position.length!==3||point.position.some(v=>!Number.isFinite(v)||Math.abs(v)>2048)||!Number.isFinite(point.facingRadians)||Math.abs(point.facingRadians)>Math.PI*2+1e-6)throw Error('Campaign starts need distinct source IDs, finite XYZ within2048 and facing within one turn.');ids.add(point.id);}return entry.starts;}
 const count=entry.count??1,total=entry.grid?.total??count,offset=entry.grid?.offset??0,side=Math.ceil(Math.sqrt(total)),half=(side-1)/2,spacing=Math.fround(entry.spacing??.75);
 if(!Number.isInteger(count)||count<1||count>32||total<1||total>32||offset<0||offset+count>total)throw Error('Review the campaign starting grid.');
 return Array.from({length:count},(_,index)=>({id:'grid-'+index,position:[Math.fround(Math.fround(entry.position[0])+Math.fround(((offset+index)%side-half)*spacing)),Math.fround(Math.fround(entry.position[1])+Math.fround((Math.floor((offset+index)/side)-half)*spacing)),Math.fround(entry.position[2])],facingRadians:0}));
}
export function campaignAiStateReady(state:CampaignAiState,count:number){return !state.startsWith('moving_')||count>=(['moving_loop','moving_loop_back_and_forth','moving_loop_randomly'].includes(state)?2:1);}
export function campaignPatrolPoints(entry:NativeEncounterAppend):NativePatrolPoint[]{
 const points=entry.patrol?.points??[];if(entry.patrol&&(!points.length||points.length>32))throw Error('A native patrol needs1–32 movement points.');
 const ids=new Set<string>();for(const point of points){if(!/^[A-Za-z0-9_-]{1,64}$/.test(point.id)||ids.has(point.id)||point.position.length!==3||point.position.some(v=>!Number.isFinite(v)||Math.abs(v)>2048)||!Number.isFinite(point.facingRadians)||Math.abs(point.facingRadians)>Math.PI*2+1e-6||!Array.isArray(point.waitSeconds)||point.waitSeconds.length!==2||point.waitSeconds.some(v=>!Number.isFinite(v)||v<0||v>3600)||point.waitSeconds[0]>point.waitSeconds[1]||!Number.isFinite(point.weight)||point.weight<=0||point.weight>100)throw Error('Patrol points need unique IDs, finite XYZ/facing, positive weights≤100 and ordered0–3600second waits.');ids.add(point.id);}
 if(entry.behavior&&[entry.behavior.initialState,entry.behavior.returnState].some(state=>!campaignAiStates.includes(state)||!campaignAiStateReady(state,points.length)))throw Error('Choose a supported native AI state and author enough patrol points before selecting movement behavior.');
 return points;
}
export const campaignPatrolId=(encounter:string,point:string)=>'campaignPatrol:'+encounter+':'+point;
export const campaignStartId=(encounter:string,start:string)=>'campaign:'+encounter+':'+start;

export const campaignFiringId=(encounter:string,id:string)=>'campaignFiring:'+encounter+':'+id;
export function campaignCombatPoints(entry:NativeEncounterAppend):NativeFiringPoint[]{
 const points=entry.combat?.points??[];if(!entry.combat)return points;if(!points.length||points.length>512)throw Error('Native combat source needs1–512 firing positions.');
 for(const mode of campaignTacticalModes){const groups=entry.combat.groups?.[mode];if(!Array.isArray(groups)||groups.length>26||new Set(groups).size!==groups.length||groups.some(g=>typeof g!=='string'||!/^[a-z]$/.test(g)))throw Error('Each tactical mode needs distinct native groups A–Z (or an explicit empty selection).');}
 const ids=new Set<string>();for(const p of points){if(typeof p.id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(p.id)||ids.has(p.id)||!Array.isArray(p.position)||p.position.length!==3||p.position.some(v=>!Number.isFinite(v)||Math.abs(v)>2048)||typeof p.group!=='string'||!/^[a-z]$/.test(p.group))throw Error('Firing points need unique IDs, finite XYZ within2048 and one native group A–Z.');ids.add(p.id);}return points;
}
export function customizeCampaignCombat(entry:NativeEncounterAppend):NativeCombatSource{return {points:campaignEncounterStarts(entry).map(p=>({id:p.id,position:[...p.position],group:'a'})),groups:Object.fromEntries(campaignTacticalModes.map(mode=>[mode,['a']])) as NativeCombatSource['groups']};}

/** Explicit source review for the pinned MCC compiler; never modifies input. */
export function campaignMccSearchReview(combat:NativeCombatSource){const groups={...combat.groups,attackingSearch:[...new Set([...combat.groups.attackingSearch,...combat.groups.attacking])].sort(),defendingSearch:[...new Set([...combat.groups.defendingSearch,...combat.groups.attacking])].sort()};return {groups,changed:groups.attackingSearch.length!==combat.groups.attackingSearch.length||groups.defendingSearch.length!==combat.groups.defendingSearch.length};}
