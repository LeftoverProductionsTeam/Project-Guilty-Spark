import { describe, it, expect } from 'vitest';
import { decalTextureKey, decalTextureRequests, indexDecalSurfaces, projectMapDecals } from './mapDecals';
import type { MapInspection, MeshData, SceneDecal } from './types';
const decal: SceneDecal = {
  id: 'mark',
  decalTagId: 7,
  bitmapTagId: 8,
  position: [0, 0, 0.01],
  yaw: 0,
  pitch: 64,
  bspIndex: 0,
  radius: 0.5,
  intensity: 1,
  color: [1, 1, 1],
  flags: 8,
  kind: 3,
  layer: 0,
  blend: 0,
  chainIndex: 0,
};
const plane: MeshData = {
  label: 'real floor',
  source: 'test',
  positions: [-2, -2, 0, 2, -2, 0, 2, 2, 0, -2, 2, 0],
  indices: [0, 1, 2, 0, 2, 3],
  lightmapUvs: [0, 0, 1, 0, 1, 1, 0, 1],
  materialRanges: [
    {
      shaderTagId: 1,
      bspIndex: 0,
      lightmapIndex: 0,
      lightmapPage: 2,
      hasLightmapUvs: true,
      indexStart: 0,
      indexCount: 6,
    },
  ],
};
describe('source decal projection', () => {
  it('clips actual triangles at the decal footprint and interpolates baked UVs', () => {
    const result = projectMapDecals(indexDecalSurfaces(plane), [decal]);
    expect(result.rendered).toBe(1);
    expect(result.omitted).toBe(0);
    for (const part of result.parts) {
      expect(part.lightmap).toBe('bsp0:page2');
      expect(part.positions.length).toBeGreaterThan(0);
      expect(part.uvs.length).toBe((part.positions.length / 3) * 2);
      for (let i = 0; i < part.positions.length; i += 3) {
        expect(Math.abs(part.positions[i])).toBeLessThanOrEqual(0.50001);
        expect(Math.abs(part.positions[i + 1])).toBeLessThanOrEqual(0.50001);
        expect(part.positions[i + 2]).toBeCloseTo(0.0003);
      }
      expect(part.lightmapUvs.every((v) => v >= 0.37499 && v <= 0.62501)).toBe(true);
    }
  });
  it('never creates floating quads or projects across a different BSP', () => {
    const index = indexDecalSurfaces(plane);
    expect(projectMapDecals(index, [{ ...decal, position: [0, 0, 8] }]).rendered).toBe(0);
    expect(projectMapDecals(index, [{ ...decal, bspIndex: 2 }]).rendered).toBe(0);
    expect(projectMapDecals(index, [{ ...decal, radius: NaN }]).rendered).toBe(0);
    expect(projectMapDecals(indexDecalSurfaces({ ...plane, indices: [0, 1, 999] }), [decal]).rendered).toBe(
      0,
    );
  });
  it('preserves aspect and honors bounded geometry work', () => {
    const result = projectMapDecals(
      indexDecalSurfaces(plane),
      [{ ...decal, flags: 264 }],
      new Map([[8, { width: 64, height: 32 }]]),
    );
    expect(result.rendered).toBe(1);
    const positions = result.parts.flatMap((p) => p.positions);
    for (let i = 1; i < positions.length; i += 3) expect(Math.abs(positions[i])).toBeLessThanOrEqual(0.25001);
    const limit = projectMapDecals(
      indexDecalSurfaces(plane),
      Array.from({ length: 2100 }, (_, i) => ({ ...decal, id: String(i) })),
    );
    expect(limit.rendered).toBeLessThanOrEqual(2048);
    expect(limit.omitted).toBeGreaterThanOrEqual(52);
    expect(limit.vertices).toBeLessThanOrEqual(196608);
  });
  it('requests exact bitmap IDs once and respects resident source images', () => {
    const inspection = {
      decals: [decal, decal],
      tags: [{ id: 8, class: 'bitm', external: false }],
    } as MapInspection;
    expect(decalTextureRequests(inspection, new Set())).toEqual([
      { kind: 'decal', bitmapTagId: 8, imageIndex: 0, key: decalTextureKey(8) },
    ]);
    expect(decalTextureRequests(inspection, new Set([decalTextureKey(8)]))).toEqual([]);
  });
});
