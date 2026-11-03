import { expect, it } from 'vitest';
import { nativeSurfacePick } from './nativeSurfacePick';
import { resolveBspMesh } from './renderView';
import type { MapInspection, MeshData } from './types';
it('a displayed BSP triangle keeps its original BSP and shader identity after index rebasing', () => {
  const mesh: MeshData = {
    source: 'halo-render-bsp',
    label: 'source',
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    indices: [0, 1, 2, 0, 1, 2],
    parts: [
      { name: 'A', indexStart: 0, indexCount: 3 },
      { name: 'B', indexStart: 3, indexCount: 3 },
    ],
    materialRanges: [{ bspIndex: 7, shaderTagId: 42, lightmapIndex: 0, indexStart: 3, indexCount: 3 }],
  };
  const shown = resolveBspMesh({ renderMesh: mesh, mesh } as MapInspection, 'render', 1)!;
  expect(nativeSurfacePick(shown, 'a'.repeat(64), 0, [0.2, 0.3, 0])).toEqual({
    sourceHash: 'a'.repeat(64),
    bspIndex: 7,
    shaderTagId: 42,
    triangle: 0,
    point: [0.2, 0.3, 0],
  });
  expect(nativeSurfacePick(shown, 'bad', 0, [0, 0, 0])).toBeNull();
  expect(nativeSurfacePick(shown, 'a'.repeat(64), 1, [0, 0, 0])).toBeNull();
  expect(nativeSurfacePick(shown, 'a'.repeat(64), 0, [NaN, 0, 0])).toBeNull();
  expect(nativeSurfacePick({ ...shown, materialRanges: [] }, 'a'.repeat(64), 0, [0, 0, 0])).toBeNull();
});
