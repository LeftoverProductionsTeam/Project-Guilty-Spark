import { describe, expect, it } from 'vitest';
import { hasRenderGeometry, resolveBspMesh, resolveObjectMesh } from './renderView';
import type { MapInspection, MeshData } from './types';

const collision: MeshData = {
  label: 'Actual collision geometry', source: 'halo-collision',
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2],
  parts: [{ name: 'BSP 1', indexStart: 0, indexCount: 3 }],
};
const render: MeshData = {
  label: 'Untextured render surfaces', source: 'halo-render-untextured',
  positions: [0, 0, 0, 2, 0, 0, 0, 2, 0, 3, 0, 0], indices: [0, 1, 2, 1, 3, 2],
  parts: [{ name: 'BSP 1', indexStart: 0, indexCount: 3 },
          { name: 'BSP 2', indexStart: 3, indexCount: 3 }],
  materialRanges: [{ shaderTagId: 1234, bspIndex: 0, lightmapIndex: 0, indexStart: 0, indexCount: 3 },
                   { shaderTagId: 5678, bspIndex: 1, lightmapIndex: 1, indexStart: 3, indexCount: 3 }],
};
const inspection: MapInspection = {
  header: {version:6,engine:'Synthetic viewport fixture',name:'fixture',build:'synthetic parser fixture',scenarioType:1,fileSize:0,declaredSize:0,tagOffset:0,tagSize:0,crc32:0,flags:0,demoLayout:true,compressed:false,extended:false,legacyTagSizeRepair:false},
  sha256:'a'.repeat(64),tags:[],objects:[],encounters:[],scripts:[],resources:[],diagnostics:[],scenarioPath:'test/fixture',
  mesh: collision, renderMesh: render, modelMeshes: { '123': render },
};

describe('Guilty Spark real-world viewport resolution', () => {
  it('prioritizes actual render triangles, not collision, for game-like mode', () => {
    expect(resolveBspMesh(inspection, 'render', -1)).toBe(render);
    expect(resolveBspMesh(inspection, 'collision', -1)).toBe(collision);
  });
  it('selects the correct BSP part without changing the original geometry', () => {
    expect(resolveBspMesh(inspection, 'smooth', 1)?.indices).toEqual([1, 3, 2]);
    expect(render.indices).toEqual([0, 1, 2, 1, 3, 2]);
    expect(resolveBspMesh(inspection, 'render', 1)?.materialRanges).toEqual([
      { shaderTagId: 5678, bspIndex: 1, lightmapIndex: 1, indexStart: 0, indexCount: 3 },
    ]);
  });
  it('safely falls back to real collision geometry if render decoding fails', () => {
    const partial = { ...inspection, renderMesh: null };
    expect(hasRenderGeometry(partial)).toBe(false);
    expect(resolveBspMesh(partial, 'smooth', 0)?.source).toBe('halo-collision');
  });
  it('resolves only real decoded object meshes or imported workshop meshes', () => {
    expect(resolveObjectMesh(inspection, 123, null, {})).toBe(render);
    expect(resolveObjectMesh(inspection, 999, null, {})).toBeUndefined();
    expect(resolveObjectMesh(inspection, null, 'asset-1', {'asset-1': collision})).toBe(collision);
  });
  it('never invents a missing BSP', () => {
    const empty = { ...inspection, mesh: { ...collision, indices: [] }, renderMesh: null };
    expect(resolveBspMesh(empty, 'render', 0)).toBeNull();
    expect(resolveBspMesh(null, 'render', 0)).toBeNull();
  });
});

describe('BSP material lens (actual shader identities, not textures)', () => {
  it('maps actual rendered triangles to their shader tag identity', async () => {
    const { shaderForTriangle, shaderDebugColor } = await import('./renderView');
    expect(shaderForTriangle(render, 0)).toBe(1234);
    expect(shaderForTriangle(render, 1)).toBe(5678);
    expect(shaderForTriangle(render, 2)).toBeNull();
    expect(shaderForTriangle(render, -1)).toBeNull();
    expect(shaderDebugColor(1234)).toBe(shaderDebugColor(1234));
  });
  it('correctly rebases shader ranges for the selected BSP', async () => {
    const { shaderLegend, shaderForTriangle } = await import('./renderView');
    const second = resolveBspMesh(inspection, 'materials', 1);
    expect(shaderLegend(second)).toEqual([{ tagId: 5678, color: expect.any(String), triangles: 1 }]);
    expect(shaderForTriangle(second!, 0)).toBe(5678);
    expect(shaderForTriangle(second!, 1)).toBeNull();
    expect(shaderLegend(collision)).toEqual([]);
  });
});
