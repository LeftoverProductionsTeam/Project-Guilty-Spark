import type { FirefightConfig } from './firefight';
export interface NativeEncounterAppend {name:string;actorPath:string;position:[number,number,number];startActive:boolean;count?:number;spacing?:number;difficulty?:{normal:number;insane:number}|null;grid?:{total:number;offset:number}}
export interface NativeSquadCountEdit {encounter:number;squad:number;encounterName:string;squadName:string;normalCount:number;insaneCount:number}
export interface NativeScenarioSquad {encounter:number;squad:number;encounterName:string;name:string;normalCount:number;insaneCount:number;starts?:{index:number;position:[number,number,number];facingRadians?:number|null}[]|null}
export type NativeOperation = { kind: 'boundingRadius'; value: number } | { kind: 'lensFlareScaleRepair' } | {kind:'hudDuplicate';array:string;index:number;sourceSha256:string}
  | ({kind:'encounterSquadCounts';sourceSha256:string}&NativeSquadCountEdit)
  | {kind:'encounterSquadCountsBatch';sourceSha256:string;edits:NativeSquadCountEdit[]}
  | {kind:'encounterStartPosition';encounter:number;squad:number;start:number;encounterName:string;squadName:string;position:[number,number,number];sourceSha256:string;facingRadians?:number|null}
  | ({kind:'appendEncounter'}&Omit<NativeEncounterAppend,'grid'>) | {kind:'appendEncounters';encounters:NativeEncounterAppend[];sourceRules?:FirefightConfig};
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
