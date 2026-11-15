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
