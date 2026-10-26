/** Read-only resource-map index provenance. Never contains game resource bytes. */
export interface ResourceMapAudit {
  kindCode: number;
  resourceCount: number;
  exactBitmapPathMatches: number;
  missingBitmapPathMatches: number;
  ambiguousBitmapPaths: number;
  resourceSha256: string;
  warning: string;
}
/** Validate the native report before displaying it. Some historical H1 docs
 * disagree about type code 0 versus 1, so neither is proof of a bitmap. */
export function verifyResourceAudit(report: ResourceMapAudit, expectedHash: string): ResourceMapAudit {
  if (!/^[a-f0-9]{64}$/i.test(expectedHash) ||
      report.resourceSha256 !== expectedHash.toLowerCase()) {
    throw new Error('Resource index belongs to a different resource-map snapshot');
  }
  if (![0, 1].includes(report.kindCode) ||
      !Number.isSafeInteger(report.resourceCount) || report.resourceCount < 1 || report.resourceCount > 65535) {
    throw new Error('Unsupported resource-map index header');
  }
  const counts = [report.exactBitmapPathMatches, report.missingBitmapPathMatches, report.ambiguousBitmapPaths];
  if (counts.some(v => !Number.isSafeInteger(v) || v < 0 || v > 65535) ||
      report.exactBitmapPathMatches > report.resourceCount ||
      typeof report.warning !== 'string' || report.warning.length > 1024) {
    throw new Error('Malformed resource-map index audit');
  }
  return report;
}
