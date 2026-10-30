export interface NativeTagIntegrityReport {
  nativeParserCheckedFiles?: number;
  semanticUnverifiedFiles?: number;
  equivalentFieldFiles?: number;
  changedFieldFiles?: number;
  checkedFiles: number;
  invalidFiles: number;
  unverifiedFiles: number;
  pendingFiles: number;
  findings: { path: string; state: string; detail: string }[];
  listTruncated: boolean;
}
export interface NativeSaveEvidence {
  observedAt: string;
  revision: number;
  writerConfidence: 'unknown';
  explanation: string;
  associations: {
    tool: string;
    version: string;
    executable: string;
    executableSha256: string;
    processId: number | null;
    basis: string;
  }[];
  files: {
    path: string;
    kind: string;
    previousSha256: string | null;
    observedSha256: string | null;
    bytes: number | null;
    modifiedUnixMs: number | null;
  }[];
  listTruncated: boolean;
}
export function integrityBlocks(report?: NativeTagIntegrityReport) {
  return (
    !!report &&
    (report.invalidFiles > 0 ||
      report.pendingFiles > 0 ||
      (report.semanticUnverifiedFiles ?? 0) > 0 ||
      (report.nativeParserCheckedFiles ?? 0) < report.checkedFiles + report.unverifiedFiles)
  );
}
