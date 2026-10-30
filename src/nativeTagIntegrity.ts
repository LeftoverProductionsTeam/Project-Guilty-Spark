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
export function integrityBlocks(report?: NativeTagIntegrityReport) {
  return !!report && (report.invalidFiles > 0 || report.pendingFiles > 0);
}
