import { pointInsideWorkshop } from './bspWorkshop';
import type { BuildRecord, OpenProject, RuntimeId, Vec3 } from './types';
import type { EditorEnvironment } from './environment';

export type BrushKind = 'room' | 'box' | 'wall' | 'floor' | 'ramp' | 'stairs' | 'platform' | 'terrain' | 'caveTunnel';
export type ForgeMode =
  'slayer' | 'teamSlayer' | 'ctf' | 'king' | 'oddball' | 'race' | 'firefight' | 'zombie';
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
  publishedAssetId?: string;
  tagId: number | null;
  tagPath: string;
  tagClass: 'scen' | 'weap' | 'eqip' | 'vehi' | 'bipd' | 'itmc';
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
  inventorySha256: string; fieldTag: string; fieldTagSha256: string; boundingRadius: number;
  templateTag: string; templateSha256: string; dependencies: Record<string,string>;
  previewSha256: string; previewTagId: number; previewTagPath: string;
}
export interface StudioNativeAsset { id: string; name: string; sha256: string; bytes: number[]; }
export interface StudioNativeDocument { source: StudioNativeSource; fields: {id: string; boundingRadius: number}[]; assets: StudioNativeAsset[]; }
export interface QuickForgeDocument {
  workshop?: import('./bspWorkshop').BspWorkshopSource;
  native?: StudioNativeDocument;
  schemaVersion: number;
  name: string;
  template: string;
  runtimeId: RuntimeId;
  gameMode: ForgeMode;
  skyPath: string | null;
  /** Visual authoring intent only; never treated as compiled Halo sky/fog tags. */
  environment?: EditorEnvironment | null;
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
export type ForgeNode =
  | { type: 'brush'; value: ForgeBrush }
  | { type: 'placement'; value: ForgePlacement }
  | { type: 'spawn'; value: ForgeSpawn }
  | { type: 'objective'; value: ForgeObjective };
export interface ForgeAsset {
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
    ...doc.geometry.map((value) => ({ type: 'brush' as const, value })),
    ...doc.placements.map((value) => ({ type: 'placement' as const, value })),
    ...doc.spawns.map((value) => ({ type: 'spawn' as const, value })),
    ...doc.objectives.map((value) => ({ type: 'objective' as const, value })),
  ];
}
export function nodeRotation(node: ForgeNode): Vec3 {
  return node.type === 'brush' || node.type === 'placement' ? node.value.rotation : [0, 0, node.value.facing];
}
export function patchForgeNode(node: ForgeNode, patch: Partial<ForgeEntity> & { team?: number }): ForgeNode {
  // These fields are shared by all variants; team is excluded for geometry.
  const { team, ...common } = patch;
  if (node.type === 'brush') return { ...node, value: { ...node.value, ...common } };
  return { ...node, value: { ...node.value, ...common, ...(team === undefined ? {} : { team }) } } as ForgeNode;
}
export function nodeCategory(node: ForgeNode): string {
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
          }[node.value.tagClass];
}
export function mapForgeNodes(
  doc: QuickForgeDocument,
  update: (node: ForgeNode) => ForgeNode,
): QuickForgeDocument {
  return {
    ...doc,
    geometry: doc.geometry.map((value) => update({ type: 'brush', value }).value as ForgeBrush),
    placements: doc.placements.map((value) => update({ type: 'placement', value }).value as ForgePlacement),
    spawns: doc.spawns.map((value) => update({ type: 'spawn', value }).value as ForgeSpawn),
    objectives: doc.objectives.map((value) => update({ type: 'objective', value }).value as ForgeObjective),
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
  if (node.type === 'brush') {
    const dimensions = node.value.dimensions.map((value, i) => value * scale[i]) as Vec3;
    if (dimensions.some((n) => n < 0.1 || n > 512))
      throw new Error('Brush dimensions must stay between 0.1 and 512 world units.');
    return { ...node, value: { ...node.value, position, rotation, dimensions } };
  }
  if (node.type === 'placement') return { ...node, value: { ...node.value, position, rotation } };
  if (node.type === 'spawn') return { ...node, value: { ...node.value, position, facing: rotation[2] } };
  return { ...node, value: { ...node.value, position, facing: rotation[2] } };
}
export function removeForgeNodes(doc: QuickForgeDocument, ids: string[]): QuickForgeDocument {
  const keep = (value: ForgeEntity) => value.locked || !ids.includes(value.id);
  return {
    ...doc,
    geometry: doc.geometry.filter(keep),
    placements: doc.placements.filter(keep),
    spawns: doc.spawns.filter(keep),
    objectives: doc.objectives.filter(keep),
  };
}
export function duplicateForgeNodes(
  doc: QuickForgeDocument,
  ids: string[],
): { document: QuickForgeDocument; ids: string[] } {
  const result = structuredClone(doc),
    created: string[] = [];
  for (const node of forgeNodes(doc).filter((n) => ids.includes(n.value.id) && !n.value.locked)) {
    const copy = structuredClone(node);
    copy.value.id = crypto.randomUUID();
    copy.value.name = `${copy.value.name || nodeCategory(node)} copy`;
    copy.value.position[0] += 1;
    copy.value.position[1] += 1;
    created.push(copy.value.id);
    if (copy.type === 'brush') result.geometry.push(copy.value);
    else if (copy.type === 'placement') result.placements.push(copy.value);
    else if (copy.type === 'spawn') result.spawns.push(copy.value);
    else result.objectives.push(copy.value);
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
    .filter((tag) => ['scen', 'weap', 'eqip', 'vehi', 'bipd', 'itmc'].includes(tag.class))
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
