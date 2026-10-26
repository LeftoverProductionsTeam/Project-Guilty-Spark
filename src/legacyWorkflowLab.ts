/**
 * Project Guilty Spark: legacy workflow archaeology with current-source evidence.
 * This is a modern, read-only learning and handoff layer, NOT a map patcher.
 * Historical descriptions are sourced; current capability and game proof are
 * explicitly distinct from the old tools' reported capabilities.
 */
import type { MapInspection, Project, Settings, Workspace } from './types';

export type LegacyWorkflowId =
  | 'escha-tags'
  | 'hmt-assets'
  | 'swordedit-placement'
  | 'sparkedit-logmods'
  | 'bsp-tunnels'
  | 'halo-menu'
  | 'zombie-restoration';
export type LegacyEvidenceKind = 'preserved-source'|'matching-inspection'|'authored-geometry'|
  'bitmap-index'|'scenario-authorship'|'creator-note'|'tool-configuration'|
  'compiled-bsp'|'in-game-verification';
export type LegacyEvidenceState = 'observed'|'not-observed'|'manual-unverified';

export interface LegacyWorkflow {
  id: LegacyWorkflowId;
  title: string;
  era: string;
  historicalTool: string;
  historicalTechnique: string;
  modernWorkflow: string;
  workspace: Workspace;
  reference: string;
  warning: string;
  required: readonly LegacyEvidenceKind[];
}
export interface LegacyCheck {
  kind: LegacyEvidenceKind;
  state: LegacyEvidenceState;
  label: string;
  detail: string;
}
export interface LegacySourceSnapshot {
  /** Hash of a user's preserved source cache; never a filesystem path. */
  sourceSha256: string | null;
  cacheVersion: number | null;
  formatNote: string;
  inspectionMatchesSource: boolean;
  inspectedTagCount: number;
  ownedBitmapReferences: number;
  authoredBrushCount: number;
  scenarioPlanRecorded: boolean;
  attributionRecorded: boolean;
  toolFolderConfigured: boolean;
}
export interface LegacyWorkflowPlan {
  schema: 'guiltyspark-legacy-workflow/v1';
  workflow: LegacyWorkflowId;
  historicalReference: string;
  historicalTechnique: string;
  modernWorkflow: string;
  source: LegacySourceSnapshot;
  checks: LegacyCheck[];
  nextWorkspace: Workspace;
  /** Never upgraded from project state, user reports or preview checks. */
  compiledBspVerified: false;
  collisionVerified: false;
  tagRoundTripVerified: false;
  gameRuntimeVerified: false;
  legacyEngineCompatibilityVerified: false;
  limitations: string[];
  privacy: string;
}

const C20_OLD='https://c20.reclaimers.net/h1/community-tools/obsolete/';
export const LEGACY_WORKFLOWS: readonly LegacyWorkflow[] = [
  {
    id:'escha-tags', title:'Eschaton-style tag experiments',era:'Mac/PC/Trial, 2000s',historicalTool:'Eschaton by Altimit01',
    historicalTechnique:'Inspect and change tag metadata directly inside a map, often extending field support with XML plugins.',
    modernWorkflow:'Inspect the same map read-only, follow class-specific references, then extract/edit supported tags with Invader in a separate source workspace.',
    workspace:'tags',reference:C20_OLD,
    warning:'Old cache pokes can leave runtime-only fields inconsistent; rebuilding tags does not always reproduce the old modification.',
    required:['preserved-source','matching-inspection','tool-configuration','compiled-bsp','in-game-verification'],
  },
  {
    id:'hmt-assets',title:'HMT bitmap and model swaps',era:'PC/Xbox/Demo, 2004+',historicalTool:'HMT by MonoxideC and tjc',
    historicalTechnique:'Extract or inject bitmaps, models and sound assets while experimenting with existing cache files.',
    modernWorkflow:'Use the owned-map tag/bitmap previews, preserve resource-map hashes, and create editable source/tag outputs with supported tools.',
    workspace:'tags',reference:C20_OLD,
    warning:'Texture preview is not a valid bitmap tag rebuild or a full shader; HEK+ extracted data may already contain inherited corruption.',
    required:['preserved-source','matching-inspection','bitmap-index','tool-configuration','in-game-verification'],
  },
  {
    id:'swordedit-placement',title:'SwordEdit / SparkEdit scenario placement',era:'Mac/PC Halo 1, mid-2000s',historicalTool:'SparkEdit by Grenadiac; SwordEdit OSX fork by bobindashadows, Sword and Samuco',
    historicalTechnique:'Move scenery, vehicles and objects visually inside the familiar Halo map instead of hand-editing coordinates.',
    modernWorkflow:'Use real BSP inspection plus QuickForge and staged scenario placements, keeping cache content read-only until a new map is compiled.',
    workspace:'world',reference:C20_OLD,
    warning:'A visually placed object does not prove valid palette references, collision, spawn rules or editable imported BSP source.',
    required:['preserved-source','matching-inspection','authored-geometry','compiled-bsp','in-game-verification'],
  },
  {
    id:'sparkedit-logmods',title:'The log-mod era',era:'Halo 1 PC/Mac, 2000s',historicalTool:'SparkEdit and community log mods',
    historicalTechnique:'Build experimental platforms and structures by placing repeated log scenery into an existing multiplayer map.',
    modernWorkflow:'Recreate ideas as original QuickForge brushes with source geometry, materials, spawn markers and explicit topology checks.',
    workspace:'quickforge',reference:C20_OLD,
    warning:'Log placements are scenery, not a watertight BSP extension. Converting them into structural collision requires a new source build.',
    required:['authored-geometry','compiled-bsp','in-game-verification'],
  },
  {
    id:'bsp-tunnels',title:'BSP extension, tunnels and collision',era:'HEK/Custom Edition to H1A',historicalTool:'Halo Tool / Sapien and community geometry guides',
    historicalTechnique:'Cut and rebuild level source geometry; chase open edges, portals, collision and WRL compiler output until the engine accepts it.',
    modernWorkflow:'Use QuickForge topology/T-junction checks, exact tunnel-rim alignment and compiler/WRL triage; compile isolated source through matching Halo Tool.',
    workspace:'quickforge',reference:'https://c20.reclaimers.net/h1/guides/levels/bsp-troubleshooting/',
    warning:'General Boolean room cutting, collision tree rebuilding and phantom BSP repair are NOT automatic; never interrupt Tool while writing a valuable BSP.',
    required:['authored-geometry','tool-configuration','compiled-bsp','in-game-verification'],
  },
  {
    id:'halo-menu',title:'Classic menu and HUD art',era:'Halo Demo, PC and CE',historicalTool:'Bitmap/tag experiments, custom UI maps',
    historicalTechnique:'Recolor or replace bitmap textures and menu graphics to give mods their own identity.',
    modernWorkflow:'Choose a SHA-verified bitmap tag from your OWN map in Interface Studio; use a memory-only image as workbench art.',
    workspace:'interface',reference:'https://c20.reclaimers.net/h1/source-data/',
    warning:'The workbench accent is NOT a real Halo UI widget, atlas, HUD rebuild, complete shader or permission to redistribute game art.',
    required:['preserved-source','matching-inspection','bitmap-index','in-game-verification'],
  },
  {
    id:'zombie-restoration',title:'Zombie Apocalypse restoration',era:'Halo Demo -> PC / HaloMD',historicalTool:'Fonzie-era community mod and subsequent variants',
    historicalTechnique:'Remix weapons, objects, actor variants and scenario behavior into survival play; historical versions were distributed as ready-made caches.',
    modernWorkflow:'Compare owned versions by source SHA, inspect real actor/weapon/vehicle dependencies, author wave logic and verify it in the intended engine.',
    workspace:'firefight',reference:'https://halomd.macgamingmods.com/mods/',
    warning:'A listing or matching tag counts cannot prove the original rules were recovered. Vanilla Halo 1 multiplayer AI is not generally network-synchronized.',
    required:['preserved-source','matching-inspection','scenario-authorship','creator-note','in-game-verification'],
  },
];
const HEX64=/^[a-f0-9]{64}$/i;
const KINDS:readonly LegacyEvidenceKind[]=['preserved-source','matching-inspection','authored-geometry',
  'bitmap-index','scenario-authorship','creator-note','tool-configuration','compiled-bsp','in-game-verification'];
const FORBIDDEN_PATH=/(?:[A-Za-z]:\\|(?:\\\\)|\/Users\/|\/home\/|\.map\b|\.scenario_structure_bsp\b)/;
function boundedCount(v:unknown,max:number):number {
  return Number.isSafeInteger(v) && (v as number)>=0 && (v as number)<=max ? v as number : 0;
}
function getSafeSource(project: Project | null): string|null {
  const hash=project?.source?.sha256;
  return typeof hash==='string'&&HEX64.test(hash)?hash.toLowerCase():null;
}
function classifyVersion(v:unknown):string {
  if(v===6)return 'Halo 1 Demo/Trial cache v6; target still needs confirmation';
  if(v===7)return 'Halo 1 cache v7; retail PC, Mac and HaloMD provenance cannot be inferred from version alone';
  if(v===609)return 'Halo 1 Custom Edition version 609; resource compatibility needs confirmation';
  return 'Unclassified Halo cache; do not infer an engine from a filename';
}
const labels:Record<LegacyEvidenceKind,string>={
  'preserved-source':'Source cache identity',
  'matching-inspection':'Tag table matches the preserved cache',
  'authored-geometry':'Editable source geometry exists',
  'bitmap-index':'Source has a bitmap-tag reference',
  'scenario-authorship':'Creator Studio source plan exists',
  'creator-note':'Creator and permission notes recorded',
  'tool-configuration':'External tool folder is configured',
  'compiled-bsp':'Actual Halo Tool structure proof',
  'in-game-verification':'In-engine / multiplayer proof',
};
function stateFor(kind:LegacyEvidenceKind,s:LegacySourceSnapshot):LegacyEvidenceState {
  if(kind==='compiled-bsp'||kind==='in-game-verification')return 'manual-unverified';
  const found:Record<Exclude<LegacyEvidenceKind,'compiled-bsp'|'in-game-verification'>,boolean>={
    'preserved-source':!!s.sourceSha256,
    'matching-inspection':s.inspectionMatchesSource,
    'authored-geometry':s.authoredBrushCount>0,
    'bitmap-index':s.inspectionMatchesSource&&s.ownedBitmapReferences>0,
    'scenario-authorship':s.scenarioPlanRecorded,
    'creator-note':s.attributionRecorded,
    'tool-configuration':s.toolFolderConfigured,
  };
  return found[kind]?'observed':'not-observed';
}
const details:Record<LegacyEvidenceKind,string>={
  'preserved-source':'Exact 64-character cache SHA-256 is recorded. This checks metadata format, not on-disk file continuity.',
  'matching-inspection':'The current inspection hash must equal the selected preserved source SHA-256.',
  'authored-geometry':'At least one editable QuickForge source brush is present; topology/compile remain separate.',
  'bitmap-index':'The exact-source inspection includes one or more bitm tag identities; pixel decoding remains optional and bounded.',
  'scenario-authorship':'A Creator Studio authoring document is recorded, not compiled or executed HaloScript.',
  'creator-note':'Creator/permissions text is entered by a person; Spark does not independently verify ownership rights.',
  'tool-configuration':'A user-selected HEK or Invader directory is set; tool identity or execution has not been verified by this check.',
  'compiled-bsp':'Requires a real isolated Tool structure result, saved logs and WRL review. Never inferred from source checks.',
  'in-game-verification':'Requires actual play in a target engine, including a separate two-client test for multiplayer AI.',
};

/** No browser APIs or machine paths. The generated report is reproducible for
 * a selected project state and never treats an imported tag cache as source. */
export function planLegacyWorkflow(id:LegacyWorkflowId,project:Project|null,
  inspection:MapInspection|null,settings?:Partial<Settings>|null):LegacyWorkflowPlan {
  const workflow=LEGACY_WORKFLOWS.find(v=>v.id===id);
  if(!workflow)throw new Error('Unknown legacy modding workflow');
  const sourceSha256=getSafeSource(project);
  const inspectionMatchesSource=!!sourceSha256&&!!inspection &&
    typeof inspection.sha256==='string'&&HEX64.test(inspection.sha256)&&inspection.sha256.toLowerCase()===sourceSha256;
  const rawVersion=sourceSha256?project?.source?.cacheVersion:null;
  const cacheVersion=Number.isSafeInteger(rawVersion)&&rawVersion!>=0&&rawVersion!<=4096?rawVersion!:null;
  const snapshot:LegacySourceSnapshot={
    sourceSha256,cacheVersion,formatNote:classifyVersion(cacheVersion),inspectionMatchesSource,
    inspectedTagCount:inspectionMatchesSource&&Array.isArray(inspection?.tags)?boundedCount(inspection.tags.length,250_000):0,
    ownedBitmapReferences:inspectionMatchesSource&&Array.isArray(inspection?.tags)?boundedCount(inspection.tags.filter(t=>t?.class==='bitm').length,250_000):0,
    authoredBrushCount:Array.isArray(project?.quickForge?.geometry)?boundedCount(project!.quickForge!.geometry.length,256):0,
    scenarioPlanRecorded:!!project?.studio,
    attributionRecorded:typeof project?.provenance?.creator==='string'&&project.provenance.creator.trim().length>=2&&
      typeof project?.provenance?.permissions==='string'&&project.provenance.permissions.trim().length>=3,
    toolFolderConfigured:!!(typeof settings?.hekDirectory==='string'&&settings.hekDirectory.trim()||
      typeof settings?.invaderDirectory==='string'&&settings.invaderDirectory.trim()),
  };
  // Invalid historical asset references and malformed source IDs never become
  // positive evidence. A duplicate check prevents accidental forged passes.
  const seen=new Set<string>();
  const checks:LegacyCheck[]=workflow.required.map(kind=>{
    if(!KINDS.includes(kind)||seen.has(kind))throw new Error('Invalid historical workflow evidence requirement');
    seen.add(kind);return {kind,state:stateFor(kind,snapshot),label:labels[kind],detail:details[kind]};
  });
  return {schema:'guiltyspark-legacy-workflow/v1',workflow:id,
    historicalReference:workflow.reference,historicalTechnique:workflow.historicalTechnique,
    modernWorkflow:workflow.modernWorkflow,source:snapshot,checks,nextWorkspace:workflow.workspace,
    compiledBspVerified:false,collisionVerified:false,tagRoundTripVerified:false,
    gameRuntimeVerified:false,legacyEngineCompatibilityVerified:false,
    limitations:[workflow.warning,'No stock Halo assets, source paths, original map bytes or tool output are included.',
      'A saved source state, a compiler receipt, and gameplay are three different evidence levels. This document is a plan, not a compiled mod.'],
    privacy:'Path-free, asset-free local handoff. Tool-directory paths, game bytes, tag names, mod downloads and raw compiler logs are excluded.',
  };
}
/** Validate again at export time: do not allow callers to insert arbitrary raw
 * paths, unverifiable success flags or content into a branded handoff. */
export function exportLegacyWorkflowPlan(id:LegacyWorkflowId,project:Project|null,
  inspection:MapInspection|null,settings?:Partial<Settings>|null):string {
  const report=planLegacyWorkflow(id,project,inspection,settings);
  const serialized=JSON.stringify(report,null,2);
  if(serialized.length>24_000||FORBIDDEN_PATH.test(serialized)||
     report.compiledBspVerified!==false||report.gameRuntimeVerified!==false||report.tagRoundTripVerified!==false)
    throw new Error('Legacy plan is not safe for export');
  return serialized;
}
