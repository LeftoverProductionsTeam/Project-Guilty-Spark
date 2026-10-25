export type Vec3 = [number, number, number];
export type Workspace =
  'library' | 'world' | 'tags' | 'assets' | 'scenario' | 'build' | 'preservation' | 'settings';
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
}
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
  positions: number[];
  indices: number[];
  label: string;
  source: string;
  parts?: { name: string; indexStart: number; indexCount: number }[];
}
export interface MapInspection {
  header: MapHeader;
  sha256: string;
  tags: Tag[];
  objects: SceneObject[];
  mesh: MeshData;
  encounters: { name: string; squads: string[]; team: number }[];
  scripts: { name: string; scriptType: number; returnType: number }[];
  resources: { name: string; required: boolean; found: boolean; reason: string }[];
  diagnostics: Diagnostic[];
  scenarioPath: string;
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
export interface Project {
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
