export interface PortabilityProfile {
  profileId: string;
  label: string;
  cacheVersions: number[];
  implementedAdapter: boolean;
  target: {
    edition: string;
    platform: string;
    distribution: string;
    architecture: string;
    extensionIds: string[];
  };
}
export interface PortabilityFinding {
  code: string;
  severity: 'blocker' | 'warning' | 'review';
  title: string;
  detail: string;
  nextAction: string;
  source: string;
  tagIds: number[];
  affectedTags: number;
}
export interface PortabilityReport {
  schemaVersion: number;
  projectId: string;
  projectFingerprint: string;
  sourceSha256: string;
  sourceEdition: string;
  sourceCacheVersion: number;
  sourceTags: number;
  auditedFields: number;
  targets: {
    profile: PortabilityProfile;
    cacheFamilyMatches: boolean;
    compiler: string;
    conversionAvailable: boolean;
    findings: PortabilityFinding[];
    buildPreflight: { ready: boolean; blockers: string[]; warnings: string[] } | null;
  }[];
  limitations: string[];
}
export interface NativePreservation {
  sourceSha256: string;
  derivedSha256: string;
  bytes: number;
  changedBytes: number;
  permittedRanges: [number, number][];
  untouchedBytesPreserved: boolean;
  byteIdentical: boolean;
  scope: string;
}
export interface PortabilityDiff {
  sourceSha256: string;
  targetSha256: string;
  sourceCacheVersion: number;
  targetCacheVersion: number;
  sourceTags: number;
  targetTags: number;
  missingTagCount: number;
  addedTagCount: number;
  missingTags: string[];
  addedTags: string[];
  fieldChangeCount: number;
  fieldChanges: { tagPath: string; class: string; field: string; before: unknown; after: unknown }[];
  unchangedAuditedFields: number;
  unpairedAuditedFields: number;
  sourceObjects: number;
  targetObjects: number;
  scope: string;
}
