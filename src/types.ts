import type { QuickForgeDocument } from './forge';
import type { FirefightConfig } from './firefight';
import type { CreatorStudioDocument } from './creatorStudio';
export type Vec3 = [number, number, number];
export interface ModelRig{checksum:number;nodes:{name:string;parent:number;position:[number,number,number];rotation:[number,number,number,number]}[];indices:number[];weights:number[]}
export type Workspace =
  | 'library'
  | 'map-finder'
  | 'get-started'
  | 'features'
  | 'how-to'
  | 'community'
  | 'world'
  | 'tags'
  | 'assets'
  | 'scenario'
  | 'build'
  | 'preservation'
  | 'settings'
  | 'compare'
  | 'runtimes'
  | 'live'
  | 'quickforge'
  | 'firefight'
  | 'interface'
  | 'creator'
  | 'machinima'
  | 'academy';
export interface Diagnostic {
  severity: string;
  code: string;
  message: string;
}
export interface MapHeader {
  version: number;
  engine: string;
  name: string;
  build: string;
  scenarioType: number;
  fileSize: number;
  declaredSize: number;
  tagOffset: number;
  tagSize: number;
  crc32: number;
  flags: number;
  demoLayout: boolean;
  compressed: boolean;
  extended: boolean;
  legacyTagSizeRepair: boolean;
}
export interface TagField {
  key: string;
  label: string;
  offset: number;
  kind: 'f32' | 'reference';
  value: number;
  min: number;
  max: number;
  unit: string;
  targetClass: string | null;
}
export interface TagReference {
  label: string;
  targetId: number;
  class: string;
  offset: number;
}
export interface Tag {
  id: number;
  index: number;
  class: string;
  path: string;
  dataOffset: number | null;
  external: boolean;
  fields: TagField[];
  references: TagReference[];
  /** Read-only classic shader base/diffuse map attribution from the source cache. */
  primaryBitmapStatus?: 'resolved' | 'missing' | 'invalid' | 'unavailable' | null;
  shaderPreview?:ShaderPreview|null;
}
export interface ShaderLayer {bitmapTagId:number;uvScale:[number,number];uvOffset:[number,number];rotation:number;colorFunction:number;alphaFunction:number}
export interface ShaderPreview {alphaTest:boolean;twoSided:boolean;uvScale:[number,number];kind?:string;shaderType?:number;detailFunction?:number;multipurposeXbox?:boolean;bumpScale?:number;
  microDetailFunction?:number;detailScales?:[number,number,number];framebufferBlend?:number;layers?:ShaderLayer[]}
export interface SceneObject {
  id: string;
  name: string;
  kind: string;
  tagId: number | null;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  visible: boolean;
  sourceOffset: number | null;
  rotationOffset: number | null;
  assetId: string | null;
}
export interface MeshData {
  rig?:ModelRig|null;
  positions: number[];
  indices: number[];
  normals?: number[];
  uvs?: number[];
  /** Only real read-only BSP lightmap UVs; unverified/missing data is zero-filled. */
  lightmapUvs?: number[];
  label: string;
  source: string;
  parts?: { name: string; indexStart: number; indexCount: number }[];
  /** Actual shader-tag provenance for untextured BSP spans. */
  materialRanges?: { shaderTagId: number; bspIndex: number; lightmapIndex: number; lightmapPage?: number; hasLightmapUvs?: boolean; lightmapBitmapTagId?: number | null; indexStart: number; indexCount: number }[];
}
export interface MapInspection {
  header: MapHeader;
  tagChecksum?:number|null;
  sha256: string;
  tags: Tag[];
  objects: SceneObject[];
  decals?: SceneDecal[];
  mesh: MeshData;
  renderMesh?: MeshData | null;
  modelMeshes?: Record<string, MeshData>;
  encounters: { name: string; squads: string[]; team: number }[];
  scripts: { name: string; scriptType: number; returnType: number }[];
  resources: { name: string; required: boolean; found: boolean; reason: string }[];
  diagnostics: Diagnostic[];
  scenarioPath: string;
}
export interface SceneDecal {
  id:string;decalTagId:number;bitmapTagId:number;position:Vec3;yaw:number;pitch:number;bspIndex:number|null;
  radius:number;intensity:number;color:Vec3;flags:number;kind:number;layer:number;blend:number;chainIndex:number;
}
export interface Provenance {
  creator: string;
  community: string;
  releaseYear: number | null;
  description: string;
  sourceUrl: string;
  permissions: string;
}
export interface Asset {
  id: string;
  name: string;
  kind: string;
  sha256: string;
  path: string;
  vertices: number;
  triangles: number;
  hasUvs: boolean;
  materials: string[];
}
export interface TagEdit {
  tagId: number;
  fieldKey: string;
  value: number;
}
export interface BuildRecord {
  id: string;
  timestamp: string;
  status: string;
  target: string;
  output: string | null;
  sha256: string | null;
  message: string;
  projectFingerprint: string;
}
export interface EngineBuildTarget {
  id:string;name:string;runtimeId:RuntimeId;builder:'h1a-tool'|'invader-mcc'|'invader-ce'|'unsupported';
  hekDirectory:string|null;hekFlavor:'h1aEk'|'legacyHek'|null;tagsDirectory:string|null;
  invaderDirectory:string|null;ceCompatibleTagset:boolean;openSauce:boolean;
}
export interface Project {
  gameplayControls?:import('./gameplay').GameplayControls|null;
  bspAssembly?:import('./bspAssembly').BspAssembly|null;
  animations?:import('./animation').AnimationAsset[];
  animationAssignments?:import('./animation').AnimationAssignment[];
  renderFeatures?:import('./renderFeatures').RenderFeatures|null;
  conversionProfile?:'faithful'|'zombie-recovery'|null;
  sourceSceneVersion?:number;
  worldEnvironment?:import('./environment').EditorEnvironment|null;
  buildTargets?:EngineBuildTarget[];
  activeBuildTarget?:string|null;
  quickForge?: QuickForgeDocument | null;
  firefight?: FirefightConfig | null;
  studio?: CreatorStudioDocument | null;
  schemaVersion: number;
  id: string;
  title: string;
  createdAt: string;
  modifiedAt: string;
  source: {
    originalPath: string;
    preservedPath: string;
    sha256: string;
    cacheVersion: number;
    engine: string;
    scenarioPath: string;
    archive?: { originalPath: string; sha256: string; entryPath: string } | null;
    resourceDirectory?: string | null;
    resourceSha256?: Record<string, string>;
  } | null;
  provenance: Provenance;
  scene: SceneObject[];
  assets: Asset[];
  tagEdits: TagEdit[];
  history: { id: string; timestamp: string; description: string }[];
  builds: BuildRecord[];
}
export interface LibraryEntry {
  id: string;
  title: string;
  engine: string;
  version: number | null;
  sha256: string | null;
  modifiedAt: string;
  creator: string;
  tagCount: number;
  objectCount: number;
  status: string;
  projectPath: string;
  scenarioType: number | null;
}
export interface Settings {
  steamBridgeDirectory?: string | null;
  steamBridgeManifestSha256?: string | null;
  preferredHalo?:RuntimeId|null;
  onboardingCompleted?:boolean;
  snapshotIntervalMinutes?: number;
  snapshotRetention?: number;
  hekDirectory?: string | null;
  /** Explicit confirmation of which official Halo 1 toolchain owns hekDirectory. */
  hekFlavor?: 'legacyHek' | 'h1aEk' | null;
  hekTagsDirectory?: string | null;
  steamDirectory: string | null;
  mccDirectory: string | null;
  invaderDirectory: string | null;
  resourceDirectory: string | null;
  metadataTemplateDirectory: string | null;
  nativeExecutable: string | null;
  autoBuild: boolean;
}
export interface Installation {
  steamPath: string | null;
  steamExecutable: string | null;
  mccPath: string | null;
  halo1Installed: boolean;
  libraries: string[];
  editingTools: string | null;
  manifestPath: string | null;
  running: boolean;
  diagnostics: string[];
}
export interface ManagedRoot {
  root: string;
  inbox: string;
  mods: string;
}
export interface JobEvent {
  jobId: string;
  projectId: string;
  phase: string;
  severity: string;
  message: string;
  progress: number;
  timestamp: string;
}
export interface Bootstrap {
  apiVersion: number;
  installation: Installation;
  managed: ManagedRoot | null;
  settings: Settings;
  entries: LibraryEntry[];
  dataDirectory: string;
  inboxDirectory: string;
  diagnostics: string[];
  logs: JobEvent[];
}
export interface OpenProject {
  project: Project;
  inspection: MapInspection | null;
}
export interface CompatibilityReport {
  target: string;
  pipeline: string;
  blockers: string[];
  warnings: string[];
  ready: boolean;
}
export interface Readiness {
  mccFound: boolean;
  halo1Installed: boolean;
  steamAvailable: boolean;
  packageValid: boolean;
  registered: boolean;
  running: boolean;
  launchReady: boolean;
  message: string;
  currentValidatedBuildId: string | null;
  currentBuildMessage: string;
}
export interface TemplateReport {
  valid: boolean;
  title: string;
  engine: string;
  scenarioMatches: boolean;
  files: string[];
  blockers: string[];
}
export interface AssetResult {
  project: Project;
  asset: Asset;
  mesh: MeshData;
  warnings: string[];
}

export type RuntimeId =
  | 'mccSteam'
  | 'chupathingyCe'
  | 'openCe'
  | 'haloPc'
  | 'haloCustomEdition'
  | 'macRetail'
  | 'macDemo'
  | 'haloPcTrial'
  | 'haloMd'
  | 'haloXbox';
export type CapabilityStatus = 'supported' | 'unsupported' | 'unknown';
export type TestStatus = 'pass' | 'fail' | 'blocked' | 'untested';
export interface SourceReference {
  title: string;
  url: string;
  revision: string | null;
}
export interface CapabilityEvidence {
  key: string;
  status: CapabilityStatus;
  evidence:
    'application' | 'officialDocumentation' | 'upstreamSource' | 'userDeclaration' | 'localInspection';
  testStatus: TestStatus;
  detail: string;
  sources: SourceReference[];
}
export interface MapFamilyCapability extends Omit<CapabilityEvidence, 'key'> {
  family: string;
  cacheVersions: number[];
}
export interface RuntimeInstallation {
  registrationId: string;
  root: string;
  executable: string | null;
  dataRoot: string;
  executableSha256: string | null;
  version: string | null;
  networkVersion: string | null;
  identity: 'steamManifest' | 'userDeclared' | 'unknown';
  validation: TestStatus;
  diagnostics: string[];
}
export interface RuntimeReport {
  schemaVersion: number;
  adapterVersion: number;
  id: RuntimeId;
  name: string;
  hostPlatform: string;
  installation: RuntimeInstallation | null;
  capabilities: CapabilityEvidence[];
  mapFamilies: MapFamilyCapability[];
  diagnostics: string[];
}
export interface RuntimeRegistration {
  id: string;
  runtimeId: RuntimeId;
  root: string;
  executable: string;
  dataRoot: string | null;
  version: string | null;
  networkVersion: string | null;
}
export interface RuntimeInventory {
  runtimeId: RuntimeId;
  registrationId: string;
  maps: {
    relativePath: string;
    family: string;
    cacheVersion: number | null;
    sha256: string | null;
    scenarioType: number | null;
    fileSize: number;
    valid: boolean;
    detail: string;
  }[];
  resources: { relativePath: string; name: string; sha256: string | null; size: number | null }[];
  diagnostics: string[];
}
export type MultiplayerMode =
  'mccCoopCampaign' | 'mccCustomMultiplayer' | 'nativeCoop' | 'nativeMultiplayer' | 'legacyMultiplayer';
export interface PeerManifest {
  schemaVersion: number;
  adapterVersion: number;
  runtimeId: RuntimeId;
  platform: 'windows' | 'macos' | 'linux' | 'unknown';
  runtimeBuild: string | null;
  networkVersion: string | null;
  executableSha256: string | null;
  mode: MultiplayerMode;
  antiCheatDisabled: boolean | null;
  map: { sha256: string; cacheVersion: number; scenarioType: number };
  resources: { name: string; sha256: string | null; required: boolean }[];
  packageSha256: string | null;
  sourceSha256: string | null;
  buildToolVersion: string | null;
  buildVerified: boolean;
  resourceSetVerified: boolean;
}
export interface PeerPreflight {
  schemaVersion: number;
  status: 'pass' | 'fail' | 'blocked';
  scope: 'manifestComparisonOnly';
  gameplayVerified: false;
  checks: { key: string; status: 'pass' | 'fail' | 'blocked'; detail: string }[];
  diagnostics: string[];
}
export interface SoundPermutation {
  pitchRange: number;
  permutation: number;
  name: string;
  format: string;
  channels: number;
  sampleRate: number;
  byteLength: number;
  embedded: boolean;
  available: boolean;
  sha256: string | null;
  durationSeconds: number | null;
  reason: string | null;
}
export interface SoundInspection {
  tagId: number;
  tagPath: string;
  sourceSha256: string;
  permutations: SoundPermutation[];
  warnings: string[];
}
export interface AudioPreview {
  name: string;
  mime: 'audio/ogg' | 'audio/wav';
  sha256: string;
  bytes: number[];
  sourceSha256:string;
  sourceSampleSha256:string;
}
