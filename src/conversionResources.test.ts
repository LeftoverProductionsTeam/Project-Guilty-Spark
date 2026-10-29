import { describe, it, expect } from 'vitest';
import { selectRepairedTagset, type BitmapRepairReceipt } from './conversionResources';
import type { Project, Settings } from './types';
const project = () =>
  ({
    id: 'map',
    source: { sha256: 'source' },
    buildTargets: [],
    activeBuildTarget: null,
    scene: [{ id: 'keep' }],
    tagEdits: [],
  }) as unknown as Project;
const defaults = { hekFlavor: 'h1aEk', hekDirectory: 'kit', invaderDirectory: 'invader' } as Settings;
const receipt = {
  schemaVersion: 1,
  status: 'ready-source-tagset',
  sourceSha256: 'source',
  tagsDirectory: 'private/repaired/tags',
  sourcePreserved: true,
  playableOutput: false,
} as BitmapRepairReceipt;
describe('repaired conversion tagset selection', () => {
  it('creates a separate MCC target while retaining the map source and authoring', () => {
    const original = project(),
      next = selectRepairedTagset(original, defaults, receipt, () => 'new-target');
    expect(next.activeBuildTarget).toBe('new-target');
    expect(next.buildTargets?.[0]).toMatchObject({
      runtimeId: 'mccSteam',
      builder: 'h1a-tool',
      tagsDirectory: receipt.tagsDirectory,
      hekDirectory: 'kit',
      invaderDirectory: 'invader',
    });
    expect(next.scene).toBe(original.scene);
    expect(next.source).toBe(original.source);
    expect(original.buildTargets).toEqual([]);
  });
  it('changes only the active MCC target tag folder and keeps the other target', () => {
    let original = selectRepairedTagset(project(), defaults, receipt, () => 'mcc');
    original = {
      ...original,
      buildTargets: [
        ...original.buildTargets!,
        {
          ...original.buildTargets![0],
          id: 'ce',
          runtimeId: 'haloCustomEdition',
          builder: 'invader-ce',
          tagsDirectory: 'keep-ce',
        },
      ],
    };
    const next = selectRepairedTagset(original, defaults, { ...receipt, tagsDirectory: 'new-tags' });
    expect(next.buildTargets?.[0].tagsDirectory).toBe('new-tags');
    expect(next.buildTargets?.[1]).toBe(original.buildTargets?.[1]);
    expect(original.buildTargets?.[0].tagsDirectory).toBe(receipt.tagsDirectory);
  });
  it('refuses another map, a non-source result and a selected CE target', () => {
    expect(() => selectRepairedTagset(project(), defaults, { ...receipt, sourceSha256: 'wrong' })).toThrow(
      /does not match/,
    );
    expect(() => selectRepairedTagset(project(), defaults, { ...receipt, playableOutput: true })).toThrow(
      /does not match/,
    );
    const original = selectRepairedTagset(project(), defaults, receipt, () => 'target');
    original.buildTargets![0] = {
      ...original.buildTargets![0],
      runtimeId: 'haloCustomEdition',
      builder: 'invader-ce',
    };
    expect(() => selectRepairedTagset(original, defaults, receipt)).toThrow(/MCC H1A/);
  });
  it('does not exceed the existing engine-target limit', () => {
    const original = project();
    original.buildTargets = Array.from(
      { length: 16 },
      (_, index) => ({ id: String(index) }) as NonNullable<Project['buildTargets']>[number],
    );
    expect(() => selectRepairedTagset(original, defaults, receipt)).toThrow(/existing MCC target/);
  });
});
