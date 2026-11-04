export interface RecoveryPlan {
  schemaVersion: number;
  identity: string;
  projectId: string;
  sourceSha256: string;
  sourcePath: string;
  sourceEdition: string;
  sourceVersion: number;
  tagId: number;
  requestedTag: string;
  scope: string;
  indexedTags: number;
  observedDependencies: string[];
  resources: Record<string, string>;
  toolHashes: Record<string, string>;
  blockers: string[];
  limitations: string[];
}
export interface RecoveredFile {
  path: string;
  bytes: number;
  sha256: string;
}
export interface RecoveryReceipt {
  schemaVersion: number;
  id: string;
  plan: RecoveryPlan;
  directory: string;
  tagsDirectory: string;
  dataDirectory: string;
  extractionId: string;
  nativeTags: RecoveredFile[];
  recoveredData: RecoveredFile[];
  nativeReadback: Record<string, string>;
  dependencyClosure: string[];
  sourceRecoveryGaps: string[];
  tools: Record<string, string>;
  status: string;
  reused: boolean;
  nativeTagFidelity: string;
  dataFidelity: string;
  nativeCompilationVerified: boolean;
  gameplayVerified: boolean;
}
