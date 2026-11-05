import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { automaticBackupLimit, BackupRetentionSelect } from './StorageSettings';

describe('per-project automatic backup choices', () => {
  it('preserves None independently of a nonzero legacy default', () => {
    expect(automaticBackupLimit({ automaticBackupRetention: 0 }, { snapshotRetention: 20 })).toBe(0);
    expect(automaticBackupLimit({ automaticBackupRetention: 5 }, { snapshotRetention: 20 })).toBe(5);
  });
  it('retains explicit existing choices, with automatic backups off for new defaults', () => {
    expect(automaticBackupLimit({}, { snapshotRetention: 20 })).toBe(20);
    expect(automaticBackupLimit({ automaticBackupRetention: null }, { snapshotRetention: 1 })).toBe(1);
    expect(automaticBackupLimit({}, {})).toBe(0);
  });
  it('offers all approved presets and renders saved custom limits without rounding', () => {
    const markup = renderToStaticMarkup(<BackupRetentionSelect value={17} onChange={() => {}} />);
    expect(markup).toContain('Maximum automatic map backups');
    expect(markup).toContain('<option value="0">None (default)</option>');
    expect(markup).toContain('<option value="1">1</option>');
    expect(markup).toContain('<option value="3">3</option>');
    expect(markup).toContain('<option value="5">5</option>');
    expect(markup).toContain('<option value="10">10</option>');
    expect(markup).toContain('value="custom" selected=""');
    expect(markup).toContain('aria-label="Custom automatic backup limit"');
    expect(markup).toContain('value="17"');
  });
  it('keeps the None choice selected and disables unavailable policy editing', () => {
    const markup = renderToStaticMarkup(<BackupRetentionSelect value={0} disabled onChange={() => {}} />);
    expect(markup).toContain('<option value="0" selected="">None (default)</option>');
    expect(markup).not.toContain('Custom automatic backup limit');
    expect(markup).toContain('disabled=""');
  });
});
