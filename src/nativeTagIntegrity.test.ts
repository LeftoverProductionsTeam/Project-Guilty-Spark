import { describe, expect, it } from 'vitest';
import { integrityBlocks, type NativeTagIntegrityReport } from './nativeTagIntegrity';
describe('native save acceptance', () => {
  const report = (change: Partial<NativeTagIntegrityReport> = {}): NativeTagIntegrityReport => ({
    checkedFiles: 1,
    invalidFiles: 0,
    unverifiedFiles: 0,
    pendingFiles: 0,
    findings: [],
    listTruncated: false,
    ...change,
  });
  it('requires semantic verification even when every checksum matches', () => {
    expect(integrityBlocks(report())).toBe(true);
    expect(integrityBlocks(report({ nativeParserCheckedFiles: 1 }))).toBe(false);
    expect(integrityBlocks(report({ nativeParserCheckedFiles: 1, semanticUnverifiedFiles: 1 }))).toBe(true);
    expect(integrityBlocks(report({ nativeParserCheckedFiles: 1, invalidFiles: 1 }))).toBe(true);
    expect(integrityBlocks(report({ nativeParserCheckedFiles: 1, pendingFiles: 1 }))).toBe(true);
  });
  it('allows unchanged source and distinguishes an absent checksum from parser failure', () => {
    expect(integrityBlocks(report({ checkedFiles: 0 }))).toBe(false);
    expect(integrityBlocks(report({ checkedFiles: 0, unverifiedFiles: 1 }))).toBe(true);
    expect(
      integrityBlocks(report({ checkedFiles: 0, unverifiedFiles: 1, nativeParserCheckedFiles: 1 })),
    ).toBe(false);
  });
});
