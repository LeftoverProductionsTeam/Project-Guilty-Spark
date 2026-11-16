import {campaignEncounterStarts,campaignStartId,campaignPatrolPoints,campaignPatrolId,campaignCombatPoints,campaignFiringId} from './nativeOperations';
import { pointInsideWorkshop } from './bspWorkshop';
import type { BuildRecord, OpenProject, RuntimeId, Vec3 } from './types';
import type { EditorEnvironment } from './environment';
import { removeLogicReferences } from './nativeLogic';
import type { LogicTrigger, NativeLogicDocument, NativeLogicSource } from './nativeLogic';

export type BrushKind = 'room' | 'box' | 'wall' | 'floor' | 'ramp' | 'stairs' | 'platform' | 'terrain' | 'caveTunnel';
export type ForgeMode =
  'slayer' | 'teamSlayer' | 'ctf' | 'king' | 'oddball' | 'race' | 'campaign' | 'firefight' | 'zombie';
interface ForgeEntity {
  id: string;
  name: string;
  position: Vec3;
  visible: boolean;
  locked: boolean;
}
export interface ForgeBrush extends ForgeEntity {
  kind: BrushKind;
  rotation: Vec3;
  dimensions: Vec3;
  materialId: string;
  steps: number;
  heights?: number[];
}
export interface ForgeMaterial {
  id: string;
  name: string;
  shaderPath: string | null;
  color: Vec3;
}
export interface ForgePlacement extends ForgeEntity {
  /** Standard solo-scenario vehicle name, separate from the display label. */
  nativeName?: string;
  publishedAssetId?: string;
  tagId: number | null;
  tagPath: string;
  tagClass: 'scen' | 'weap' | 'eqip' | 'vehi' | 'bipd' | 'itmc' | 'mach' | 'ctrl';
  sourceProjectId: string | null;
  sourceSha256: string | null;
  rotation: Vec3;
  team: number;
  respawnSeconds: number;
}
export interface ForgeSpawn extends ForgeEntity {
  facing: number;
  team: number;
  gameModes: string[];
}
export interface ForgeObjective extends ForgeEntity {
  kind: 'ctfFlag' | 'hill' | 'oddball' | 'raceCheckpoint' | 'raceVehicle' | 'teleportFrom' | 'teleportTo';
  facing: number;
  team: number;
  sequence: number;
}
export interface StudioNativeSource {
  /** Omitted admissions are legacy MCC13; CE609 is explicit. */
  cacheVersion?: number;
  inventorySha256: string; fieldTag: string; fieldTagSha256: string; boundingRadius: number;
  templateTag: string; templateSha256: string; dependencies: Record<string,string>;
  previewSha256: string; previewTagId: number; previewTagPath: string;
}
export interface StudioNativeAsset { id: string; name: string; sha256: string; bytes: number[]; }
export interface StudioNativeDocument { source: StudioNativeSource; fields: {id: string; boundingRadius: number}[]; assets: StudioNativeAsset[]; }
export interface QuickForgeDocument {
  workshop?: import('./bspWorkshop').BspWorkshopSource;
  native?: StudioNativeDocument;
  logic?: NativeLogicDocument;
  schemaVersion: number;
  name: string;
  template: string;
  runtimeId: RuntimeId;
  gameMode: ForgeMode;
  startingProfile?: import('./firefight').NativePlayerProfile;
  campaignEncounters?: import('./nativeOperations').NativeEncounterAppend[];
  skyPath: string | null;
  /** Visual authoring intent only; never treated as compiled Halo sky/fog tags. */
  environment?: EditorEnvironment | null;
  nativeLighting?: import("./environment").NativeLighting | null;
  buildQuality: 'draft' | 'final';
  geometry: ForgeBrush[];
  materials: ForgeMaterial[];
  placements: ForgePlacement[];
  spawns: ForgeSpawn[];
  objectives: ForgeObjective[];
}
export interface ForgeMesh {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  parts: { brushId: string; materialId: string; indexStart: number; indexCount: number; faceId?: string }[];
}
export interface GeometryIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  brushIds: string[];
  triangleIndices: number[];
}
export interface GeometryReport {
  logicPreview?:NativeLogicSource;
  valid: boolean;
  issues: GeometryIssue[];
  vertices: number;
  triangles: number;
  closedComponents: number;
  sourceSha256: string;
}
export interface ForgeSourceExport {
  directory: string;
  documentPath: string;
  jmsPath: string;
  scenarioPlanPath: string;
  /** Source-only preview intent, not a compiled .sky or .fog tag. */
  environmentPlanPath?: string | null;
  sourceSha256: string;
  jmsSha256: string;
  scenarioPath: string;
  bspName: string;
  validation: GeometryReport;
  dependencies: unknown[];
  commands: unknown[];
  /** Native source recipes, not a runtime gameplay format. */
  nativeOperations?: import('./nativeOperations').NativeOperation[];
  blockers: string[];
}
export interface QuickForgeBuildReceipt {
  current?: boolean;
  sourceDocumentSha256?: string;
  schemaVersion: number;
  jobId: string;
  projectId: string;
  projectFingerprint: string;
  status: 'exported' | 'blocked' | 'failed' | 'validated' | 'cancelled';
  durationMs: number;
  sources: ForgeSourceExport | null;
  blockers: string[];
  warnings: string[];
  build: BuildRecord | null;
  toolIdentities: Record<string, string>;
}
export interface CampaignStartNode extends ForgeEntity {encounterName:string;startId:string;facing:number}
export type ForgeNode =
  | {type:'campaignStart';value:CampaignStartNode}
  | {type:'campaignFiring';value:CampaignStartNode&{group:string}}
  | {type:'campaignPatrol';value:CampaignStartNode&{waitSeconds:[number,number];weight:number}}
  | { type: 'trigger'; value: LogicTrigger }
  | { type: 'brush'; value: ForgeBrush }
  | { type: 'placement'; value: ForgePlacement }
  | { type: 'spawn'; value: ForgeSpawn }
  | { type: 'objective'; value: ForgeObjective };
export interface ForgeAsset {
  /** Optional exact native model variation for preview only. */
  modelVariant?: string;
  tagId: number;
  key: string;
  name: string;
  path: string;
  class: ForgePlacement['tagClass'];
  sourceProjectId: string;
  sourceSha256: string;
  cacheVersion: number;
}
export const forgeModes: Record<ForgeMode, string> = {
  slayer: 'Slayer',
  teamSlayer: 'Team Slayer',
  ctf: 'Capture the Flag',
  king: 'King of the Hill',
  oddball: 'Oddball',
  race: 'Race',
  campaign: 'Campaign / scripted solo',
  firefight: 'Firefight',
  zombie: 'Zombie Apocalypse',
};
export const forgeTargets: Partial<Record<RuntimeId, string>> = {
  haloCustomEdition: 'Halo Custom Edition',
  mccSteam: 'Steam MCC / Halo 1',
  chupathingyCe: 'ChupathingyCE',
  openCe: 'OpenCE',
  haloPc: 'Halo PC Retail',
};
export const brushNames: Record<BrushKind, string> = {
  box: 'Cover box',
  wall: 'Wall',
  floor: 'Floor slab',
  ramp: 'Ramp',
  stairs: 'Stairs',
  platform: 'Platform',
  room: 'Sealed room',
  terrain: 'Sculptable terrain tile',
  caveTunnel: 'Hollow cave tunnel shell',
};
export function forgeNodes(doc: QuickForgeDocument): ForgeNode[] {
  return [
    ...(doc.gameMode==='campaign'?(doc.campaignEncounters??[]).flatMap(entry=>campaignEncounterStarts(entry).map((point,index)=>({type:'campaignStart' as const,value:{id:campaignStartId(entry.name,point.id),name:entry.name+' / Start '+index,encounterName:entry.name,startId:point.id,position:point.position,facing:point.facingRadians,visible:point.visible!==false,locked:!!point.locked}}))):[]),
    ...(doc.gameMode==='campaign'?(doc.campaignEncounters??[]).flatMap(entry=>campaignPatrolPoints(entry).map((point,index)=>({type:'campaignPatrol' as const,value:{id:campaignPatrolId(entry.name,point.id),name:entry.name+' / Patrol '+index,encounterName:entry.name,startId:point.id,position:point.position,facing:point.facingRadians,waitSeconds:point.waitSeconds,weight:point.weight,visible:point.visible!==false,locked:!!point.locked}}))):[]),
    ...(doc.gameMode==='campaign'?(doc.campaignEncounters??[]).flatMap(entry=>campaignCombatPoints(entry).map((p,index)=>({type:'campaignFiring' as const,value:{id:campaignFiringId(entry.name,p.id),name:entry.name+' / Firing '+index,encounterName:entry.name,startId:p.id,position:p.position,facing:0,group:p.group,visible:p.visible!==false,locked:!!p.locked}}))):[]),
    ...doc.geometry.map((value) => ({ type: 'brush' as const, value })),
    ...doc.placements.map((value) => ({ type: 'placement' as const, value })),
    ...doc.spawns.map((value) => ({ type: 'spawn' as const, value })),
    ...doc.objectives.map((value) => ({ type: 'objective' as const, value })),
    ...(doc.logic?.triggers??[]).map(value=>({type:'trigger' as const,value})),
  ];
}
export function nodeRotation(node: ForgeNode): Vec3 {
  return node.type === 'brush' || node.type === 'placement' || node.type==='trigger' ? node.value.rotation : [0, 0, node.value.facing];
}
export function patchForgeNode(node: ForgeNode, patch: Partial<ForgeEntity> & { team?: number }): ForgeNode {
  // These fields are shared by all variants; team is excluded for geometry.
  const { team, ...common } = patch;
  if (node.type === 'brush' || node.type==='trigger' || (node.type==='campaignStart'||node.type==='campaignPatrol'||node.type==='campaignFiring')) return { ...node, value: { ...node.value, ...common } } as ForgeNode;
  return { ...node, value: { ...node.value, ...common, ...(team === undefined ? {} : { team }) } } as ForgeNode;
}
export function nodeCategory(node: ForgeNode): string {
  if(node.type==='campaignFiring')return 'Campaign firing positions';
  if(node.type==='campaignPatrol')return 'Campaign patrol points';
  if(node.type==='campaignStart')return 'Campaign AI starts';
  if(node.type==='trigger')return 'Trigger volumes';
  return node.type === 'brush'
    ? 'Geometry'
    : node.type === 'spawn'
      ? 'Player spawns'
      : node.type === 'objective'
        ? 'Objectives'
        : {
            weap: 'Weapons',
            eqip: 'Equipment',
            vehi: 'Vehicles',
            bipd: 'Characters',
            scen: 'Scenery',
            itmc: 'Item collections',
            mach: 'Doors & devices',
            ctrl: 'Control terminals',
          }[node.value.tagClass];
}
export function mapForgeNodes(
  doc: QuickForgeDocument,
  update: (node: ForgeNode) => ForgeNode,
): QuickForgeDocument {
  return {
    ...doc,
    ...(doc.gameMode==='campaign'&&doc.campaignEncounters?{campaignEncounters:doc.campaignEncounters.map(entry=>{
      const old=campaignEncounterStarts(entry),starts=old.map((point,index)=>{
        const node:ForgeNode={type:'campaignStart',value:{id:campaignStartId(entry.name,point.id),name:entry.name+' / Start '+index,encounterName:entry.name,startId:point.id,position:point.position,facing:point.facingRadians,visible:point.visible!==false,locked:!!point.locked}};
        const revised=update(node);if(revised.type!=='campaignStart'||revised.value.encounterName!==entry.name||revised.value.startId!==point.id)throw Error('Campaign start ownership cannot be reassigned by a transform.');
        const v=revised.value;if(v.position.every((value,i)=>value===point.position[i])&&v.facing===point.facingRadians&&v.visible===(point.visible!==false)&&v.locked===!!point.locked)return point;
        return {...point,position:v.position,facingRadians:v.facing,visible:v.visible,locked:v.locked};
      });
      const oldPatrol=campaignPatrolPoints(entry),patrol=oldPatrol.map((point,index)=>{const node:ForgeNode={type:'campaignPatrol',value:{id:campaignPatrolId(entry.name,point.id),name:entry.name+' / Patrol '+index,encounterName:entry.name,startId:point.id,position:point.position,facing:point.facingRadians,waitSeconds:point.waitSeconds,weight:point.weight,visible:point.visible!==false,locked:!!point.locked}};const revised=update(node);if(revised.type!=='campaignPatrol'||revised.value.encounterName!==entry.name||revised.value.startId!==point.id)throw Error('Patrol ownership cannot be reassigned.');const v=revised.value;return v.position.every((n,i)=>n===point.position[i])&&v.facing===point.facingRadians&&v.visible===(point.visible!==false)&&v.locked===!!point.locked?point:{...point,position:v.position,facingRadians:v.facing,visible:v.visible,locked:v.locked};});
      const oldCombat=campaignCombatPoints(entry),firing=oldCombat.map((point,index)=>{const node:ForgeNode={type:'campaignFiring',value:{id:campaignFiringId(entry.name,point.id),name:entry.name+' / Firing '+index,encounterName:entry.name,startId:point.id,position:point.position,facing:0,group:point.group,visible:point.visible!==false,locked:!!point.locked}};const revised=update(node);if(revised.type!=='campaignFiring'||revised.value.encounterName!==entry.name||revised.value.startId!==point.id)throw Error('Firing position ownership cannot be reassigned.');const v=revised.value;return v.position.every((n,i)=>n===point.position[i])&&v.visible===(point.visible!==false)&&v.locked===!!point.locked?point:{...point,position:v.position,visible:v.visible,locked:v.locked};});
      const firingChanged=firing.some((p,i)=>p!==oldCombat[i]);const startChanged=starts.some((p,i)=>p!==old[i]),patrolChanged=patrol.some((p,i)=>p!==oldPatrol[i]);return startChanged||patrolChanged||firingChanged?{...entry,...(firingChanged?{combat:{...entry.combat!,points:firing}}:{}),...(startChanged?{starts}:{}),...(patrolChanged?{patrol:{points:patrol}}:{})}:entry;
    })}:{}),
    geometry: doc.geometry.map((value) => update({ type: 'brush', value }).value as ForgeBrush),
    placements: doc.placements.map((value) => update({ type: 'placement', value }).value as ForgePlacement),
    spawns: doc.spawns.map((value) => update({ type: 'spawn', value }).value as ForgeSpawn),
    objectives: doc.objectives.map((value) => update({ type: 'objective', value }).value as ForgeObjective),
    ...(doc.logic?{logic:{...doc.logic,triggers:doc.logic.triggers.map(value=>update({type:'trigger',value}).value as LogicTrigger)}}:{}),
  };
}
export function transformForgeNode(
  node: ForgeNode,
  position: Vec3,
  rotation: Vec3,
  scale: Vec3 = [1, 1, 1],
): ForgeNode {
  if (node.value.locked) return node;
  if (
    ![...position, ...rotation, ...scale].every(Number.isFinite) ||
    position.some((n) => Math.abs(n) > 2048) ||
    scale.some((n) => n <= 0)
  )
    throw new Error('Use finite transforms and positive dimensions within ±2048 world units.');
  if(node.type==='campaignFiring'&&rotation.some(v=>Math.abs(v)>1e-6))throw Error('Native firing positions support XYZ only.');
  if((node.type==='campaignStart'||node.type==='campaignPatrol'||node.type==='campaignFiring')&&(Math.abs(rotation[0])>1e-6||Math.abs(rotation[1])>1e-6||scale.some(value=>Math.abs(value-1)>1e-6)))throw Error('Campaign AI points support XYZ position and Z facing only.');
  if (node.type === 'brush' || node.type==='trigger') {
    if (node.type === 'trigger' && (position.some(n => Math.abs(n) > 1500) || Math.abs(rotation[0]) > 0.00001 || Math.abs(rotation[1]) > 0.00001))
      throw new Error('Native trigger volumes support yaw rotation within ±1500 world units.');
    const dimensions = node.value.dimensions.map((value, i) => value * scale[i]) as Vec3;
    if (dimensions.some((n) => n < 0.1 || n > (node.type==='trigger'?128:512)))
      throw new Error(node.type === 'trigger' ? 'Trigger dimensions must stay between 0.1 and 128 world units.' : 'Brush dimensions must stay between 0.1 and 512 world units.');
    return { ...node, value: { ...node.value, position, rotation, dimensions } } as ForgeNode;
  }
  if (node.type === 'placement') return { ...node, value: { ...node.value, position, rotation } };
  if((node.type==='campaignStart'||node.type==='campaignPatrol'||node.type==='campaignFiring'))return {...node,value:{...node.value,position,facing:Math.atan2(Math.sin(rotation[2]),Math.cos(rotation[2]))}} as ForgeNode;
  if (node.type === 'spawn') return { ...node, value: { ...node.value, position, facing: rotation[2] } };
  return { ...node, value: { ...node.value, position, facing: rotation[2] } };
}
export function removeForgeNodes(doc: QuickForgeDocument, ids: string[]): QuickForgeDocument {
  const keep = (value: ForgeEntity) => value.locked || !ids.includes(value.id);
  const removed=new Set(forgeNodes(doc).filter(n=>!keep(n.value)).map(n=>n.value.id));
  return {
    ...doc,
    ...(doc.gameMode==='campaign'&&doc.campaignEncounters?{campaignEncounters:doc.campaignEncounters.map(entry=>{
      const old=campaignEncounterStarts(entry),starts=old.filter(point=>point.locked||!ids.includes(campaignStartId(entry.name,point.id)));
      const oldPatrol=campaignPatrolPoints(entry),patrol=oldPatrol.filter(p=>p.locked||!ids.includes(campaignPatrolId(entry.name,p.id)));let revised=patrol.length===oldPatrol.length?entry:{...entry,patrol:patrol.length?{points:patrol}:undefined};campaignPatrolPoints(revised);const oldFiring=campaignCombatPoints(entry),firing=oldFiring.filter(p=>p.locked||!ids.includes(campaignFiringId(entry.name,p.id)));if(firing.length!==oldFiring.length){if(!firing.length)throw Error('Keep one firing position, or explicitly Reset firing source in Creator Studio.');revised={...revised,combat:{...entry.combat!,points:firing}};}
      if(starts.length===old.length)return revised;
      if(!starts.length||entry.difficulty&&[entry.difficulty.normal,entry.difficulty.insane].some(count=>count>starts.length))throw Error('Keep at least one campaign start and enough for both difficulty populations. Lower overrides first, or Remove encounter in Creator Studio.');
      return {...revised,starts,count:starts.length};
    })}:{}),
    geometry: doc.geometry.filter(keep),
    placements: doc.placements.filter(keep),
    spawns: doc.spawns.filter(keep),
    objectives: doc.objectives.filter(keep),
    ...(doc.logic?{logic:removeLogicReferences(doc,removed)}:{}),
  };
}
export function duplicateForgeNodes(
  doc: QuickForgeDocument,
  ids: string[],
): { document: QuickForgeDocument; ids: string[] } {
  return appendForgeNodes(doc,forgeNodes(doc).filter(n=>ids.includes(n.value.id)&&!n.value.locked),[1,1,0]);
}
/** Clone source references, never source instance identities. Used by copy/paste
 * and Alt-drag so the entire placement change is one authored transaction. */
export function appendForgeNodes(doc:QuickForgeDocument,nodes:ForgeNode[],offset:Vec3=[0,0,0]):{document:QuickForgeDocument;ids:string[]}{
  const result = structuredClone(doc),
    created: string[] = [];
  for (const node of nodes.filter(n=>!n.value.locked)) {
    if(node.type==='campaignFiring'){const group=result.campaignEncounters?.find(e=>e.name===node.value.encounterName);if(!group?.combat||result.gameMode!=='campaign')throw Error('Customize the owning encounter firing source first.');const points=campaignCombatPoints(group);if(points.length>=512)throw Error('Native firing position limit512 reached.');const id=crypto.randomUUID(),position=node.value.position.map((v,i)=>v+offset[i]) as Vec3;transformForgeNode(node,position,[0,0,0]);const combat={...group.combat,points:[...points,{id,position,group:node.value.group,visible:node.value.visible,locked:false}]};campaignCombatPoints({...group,combat});group.combat=combat;created.push(campaignFiringId(group.name,id));continue;}
    if(node.type==='campaignPatrol'){
      const group=result.campaignEncounters?.find(e=>e.name===node.value.encounterName);if(!group||result.gameMode!=='campaign')throw Error('Include the owning campaign encounter first.');const points=campaignPatrolPoints(group);if(points.length>=32)throw Error('Native patrol supports32points per group.');const position=node.value.position.map((v,i)=>v+offset[i]) as Vec3;transformForgeNode(node,position,nodeRotation(node));const id=crypto.randomUUID();const patrol={points:[...points,{id,position,facingRadians:node.value.facing,waitSeconds:node.value.waitSeconds,weight:node.value.weight,visible:node.value.visible,locked:false}]};campaignPatrolPoints({...group,patrol});group.patrol=patrol;created.push(campaignPatrolId(group.name,id));continue;
    }
    if(node.type==='campaignStart'){
      const group=result.campaignEncounters?.find(entry=>entry.name===node.value.encounterName);if(!group||result.gameMode!=='campaign')throw Error('Include this encounter and its actor in the destination campaign first.');
      const starts=campaignEncounterStarts(group);if(starts.length>=32||(result.campaignEncounters??[]).reduce((sum,entry)=>sum+(entry.count??1),0)>=128)throw Error('Campaign start capacity reached (32 per group,128 total).');
      const position=node.value.position.map((value,i)=>value+offset[i]) as Vec3;transformForgeNode(node,position,nodeRotation(node));
      const id=crypto.randomUUID();group.starts=[...starts,{id,position,facingRadians:node.value.facing,visible:node.value.visible,locked:false}];group.count=group.starts.length;created.push(campaignStartId(group.name,id));continue;
    }
    const copy = structuredClone(node);
    copy.value.id = crypto.randomUUID();
    copy.value.name = `${copy.value.name || nodeCategory(node)} copy`;
    copy.value.position=copy.value.position.map((v,i)=>v+offset[i]) as Vec3;
    transformForgeNode(copy,copy.value.position,nodeRotation(copy),[1,1,1]);
    created.push(copy.value.id);
    if (copy.type === 'brush') result.geometry.push(copy.value);
    else if (copy.type === 'placement') {delete copy.value.nativeName;result.placements.push(copy.value);}
    else if (copy.type === 'spawn') result.spawns.push(copy.value);
    else if(copy.type==='objective') result.objectives.push(copy.value);
    else {delete copy.value.nativeName;result.logic??={schemaVersion:1,triggers:[],devices:[],rules:[]};result.logic.triggers.push(copy.value);}
  }
  return { document: result, ids: created };
}
export function snapPoint(position: Vec3, step: number): Vec3 {
  return step > 0 ? (position.map((n) => Math.round(n / step) * step) as Vec3) : [...position];
}
export function createBrush(kind: BrushKind, point: Vec3, materialId: string): ForgeBrush {
  const dimensions: Vec3 =
    kind === 'room'
      ? [16, 20, 6]
      : kind === 'terrain'
        ? [12, 12, 3]
        : kind === 'caveTunnel'
          ? [4, 12, 4]
      : kind === 'wall'
        ? [8, 0.5, 4]
        : kind === 'floor'
          ? [8, 8, 0.25]
          : kind === 'ramp' || kind === 'stairs'
            ? [4, 6, 2]
            : kind === 'platform'
              ? [6, 6, 0.75]
              : [2, 2, 2];
  return {
    id: crypto.randomUUID(),
    name: brushNames[kind],
    kind,
    position: [point[0], point[1], point[2] + dimensions[2] / 2 + 0.02],
    rotation: [0, 0, 0],
    dimensions,
    materialId,
    visible: true,
    locked: false,
    steps: kind === 'terrain' ? 8 : kind === 'caveTunnel' ? 12 : 4,
    heights: kind === 'terrain' ? Array(81).fill(0) : [],
  };
}
export function catalogAssets(open: OpenProject): ForgeAsset[] {
  if (!open.inspection || !open.project.source) return [];
  return open.inspection.tags
    .filter((tag) => ['scen', 'weap', 'eqip', 'vehi', 'bipd', 'itmc', 'mach', 'ctrl'].includes(tag.class))
    .map((tag) => ({
      key: `${open.project.id}:${tag.id}`,
      tagId: tag.id,
      name: tag.path.split(/[\\/]/).filter(Boolean).at(-1) ?? tag.path,
      path: tag.path,
      class: tag.class as ForgePlacement['tagClass'],
      sourceProjectId: open.project.id,
      sourceSha256: open.inspection!.sha256,
      cacheVersion: open.inspection!.header.version,
    }));
}
export function placeAsset(asset: ForgeAsset, position: Vec3): ForgePlacement {
  return {
    tagId: asset.tagId,
    id: crypto.randomUUID(),
    name: asset.name,
    tagPath: asset.path,
    tagClass: asset.class,
    sourceProjectId: asset.sourceProjectId,
    sourceSha256: asset.sourceSha256,
    position,
    rotation: [0, 0, 0],
    team: -1,
    respawnSeconds: 30,
    visible: true,
    locked: false,
  };
}
/** Match the native sealed-room placement boundary, including rotated rooms.
 * This is source containment, not model contact or compiled Halo collision. */
export function pointInsideForgeRoom(document:QuickForgeDocument,point:Vec3):boolean {
  if(!point.every(Number.isFinite))return false;
  if(document.workshop)return pointInsideWorkshop(document.workshop,point);
  const room=document.geometry.find(brush=>brush.kind==='room');
  if(!room)return true; // Incomplete blank projects remain editable.
  const local=point.map((value,index)=>value-room.position[index]) as Vec3;
  for(let axis=2;axis>=0;axis--){
    const [a,b]=axis===0?[1,2]:axis===1?[2,0]:[0,1];
    const c=Math.cos(-room.rotation[axis]),s=Math.sin(-room.rotation[axis]);
    const value=local[a];local[a]=c*value-s*local[b];local[b]=s*value+c*local[b];
  }
  return local.every((value,index)=>Math.abs(value)<room.dimensions[index]/2);
}

/** Source inputs affecting mesh buffers. Shader/material bindings and gameplay are validated separately for every revision. */
export function forgeGeometryKey(document: QuickForgeDocument): string {
  return JSON.stringify([document.geometry, document.workshop ?? null]);
}
