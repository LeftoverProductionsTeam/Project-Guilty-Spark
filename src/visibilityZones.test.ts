import { describe, it, expect } from 'vitest';
import { assemblySignature } from './bspAssembly';
import type { BspAssembly } from './bspAssembly';
import {
  movePortalCut,
  portalQuads,
  validateVisibilityZones,
  visibilityBounds,
  withVisibilityZones,
  mergeZoneOnlyUpdate,
} from './visibilityZones';
import type { VisibilityZone } from './visibilityZones';
import type { Project } from './types';
const zone: VisibilityZone = {
  kind: 'tunnel',
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Tunnel',
  segment: 0,
  start: 0.25,
  end: 0.75,
};
const plan = {
  tunnelPoints: [
    [0, 0, 0],
    [10, 0, 2],
  ],
  tunnelWidth: 2,
  tunnelHeight: 1.6,
} as BspAssembly;
describe('visibility zone authoring', () => {
  it('matches native sloped portal geometry and clamps dragged cuts to their tunnel', () => {
    const quad = portalQuads(plan, zone)[0],
      expected = [
        [2.5, -1.01, 0.49],
        [2.5, 1.01, 0.49],
        [2.5, 1.01, 2.11],
        [2.5, -1.01, 2.11],
      ];
    quad.forEach((point, i) => point.forEach((n, k) => expect(n).toBeCloseTo(expected[i][k], 10)));
    const moved = movePortalCut(plan, zone, 'start', [100, 50, 900]);
    expect(moved.kind === 'tunnel' && moved.start).toBeCloseTo(0.7);
    expect(validateVisibilityZones({ ...plan, visibilityZones: [moved] })).toEqual([]);
  });
  it('zone inspector edits preserve an unapplied connection draft', () => {
    const draft = { ...plan, translation: [50, 2, 3] as [number, number, number] };
    const merged = mergeZoneOnlyUpdate(plan, { ...plan, visibilityZones: [zone] }, draft)!;
    expect(merged.translation).toEqual([50, 2, 3]);
    expect(merged.visibilityZones).toEqual([zone]);
    const different = { ...plan, yawDegrees: 90 };
    expect(mergeZoneOnlyUpdate(plan, different, draft)).toBe(different);
  });
  it('keeps arbitrary volumes explicitly editor-only and bounds them', () => {
    const box: VisibilityZone = {
      kind: 'editorBounds',
      id: zone.id,
      name: 'Planning',
      min: [0, 0, 0],
      max: [2, 3, 4],
    };
    expect(portalQuads(plan, box)).toEqual([]);
    expect(visibilityBounds(plan, box)).toEqual({ min: box.min, max: box.max });
    expect(
      validateVisibilityZones({ ...plan, visibilityZones: [{ ...box, max: [-1, 2, 3] }] }).length,
    ).toBeGreaterThan(0);
  });
  it('rejects missing segments, overlapping cuts and duplicate segment definitions', () => {
    for (const z of [
      { ...zone, segment: 1 },
      { ...zone, start: 0.9, end: 0.2 },
      { ...zone, start: Number.NaN },
    ])
      expect(validateVisibilityZones({ ...plan, visibilityZones: [z] }).length).toBeGreaterThan(0);
    expect(
      validateVisibilityZones({
        ...plan,
        visibilityZones: [zone, { ...zone, id: '00000000-0000-0000-0000-000000000002' }],
      }).length,
    ).toBeGreaterThan(0);
  });
  it('persists authored data immutably and omits empty optional fields from old identities', () => {
    const project = { id: 'map-a', bspAssembly: plan } as Project;
    const edited = withVisibilityZones(project, [zone]);
    expect(project.bspAssembly?.visibilityZones).toBeUndefined();
    expect(JSON.parse(JSON.stringify(edited)).bspAssembly.visibilityZones).toEqual([zone]);
    expect(withVisibilityZones(edited, []).bspAssembly?.visibilityZones).toBeUndefined();
    expect(assemblySignature(plan)).toBe(assemblySignature({ ...plan, visibilityZones: [] }));
    expect(assemblySignature(edited.bspAssembly!)).not.toBe(assemblySignature(plan));
  });
});
