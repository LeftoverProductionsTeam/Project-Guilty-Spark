export interface BaboonInstallation {
  directory: string;
  executable: string;
  executableSha256: string;
  version: string;
  game: string;
  definitionsSha256: string;
  releaseUrl: string;
}
export interface BaboonDashboard {
  installed: BaboonInstallation | null;
  setupIssue: string | null;
  sourceIssue: string | null;
  sourceReady: boolean;
  sessionId: string | null;
  sessions?: { id: string; tag: string }[];
  compatibleKits: { game: string; names: string[]; flag: string; family: string }[];
}
export interface BaboonPoll {
  sessionId: string;
  tag: string;
  running: boolean;
  processId: number | null;
  changes: {
    status: string;
    revision: number;
    changedFiles: number;
    totalFiles: number;
    hashesReadLastScan: number;
    changes: { path: string; kind: string }[];
    listTruncated: boolean;
  };
  revisions: string[];
  integrity?: import('./nativeTagIntegrity').NativeTagIntegrityReport;
  writerContext?: string;
}
export interface BaboonReconciled {
  accepted: boolean;
  source: string | null;
  reason: string;
  review: {
    conflicts: number;
    protectedChanges: number;
    workingChangesPreserved: number;
    changes: { path: string; kind: string; conflict: boolean; requiresNativeReview: boolean }[];
  };
}
export const baboonReleaseUrl = 'https://github.com/Zoephie/Baboon/releases/tag/v0.3.2';
