import { describe, expect, it } from 'vitest';
import {
  BufferGeometry,
  Float32BufferAttribute,
  FrontSide,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
} from 'three';
import { renderIndices } from './haloGeometry';
import type { MeshData } from './types';

const source: MeshData = {
  source: 'halo-model-untextured',
  label: 'cached exterior',
  positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
  normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
  uvs: [0, 0, 1, 0, 0.5, 1],
  indices: [0, 2, 1],
  materialRanges: [{ shaderTagId: 12, bspIndex: 0, lightmapIndex: 0, indexStart: 0, indexCount: 3 }],
};
describe('Halo front faces', () => {
  it('picks the exterior with single-sided culling and leaves the back unpickable', () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(source.positions, 3));
    geometry.setIndex(renderIndices(source));
    const material = new MeshBasicMaterial({ side: FrontSide }),
      mesh = new Mesh(geometry, material);
    const front = new Raycaster(new Vector3(0, 0, 1), new Vector3(0, 0, -1));
    const back = new Raycaster(new Vector3(0, 0, -1), new Vector3(0, 0, 1));
    expect(front.intersectObject(mesh)).toHaveLength(1);
    expect(back.intersectObject(mesh)).toHaveLength(0);
    expect(source.indices).toEqual([0, 2, 1]);
    expect(source.normals).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    geometry.dispose();
    material.dispose();
  });
  it('preserves correct faces, material slots and workshop-authored winding', () => {
    expect(renderIndices({ ...source, indices: [0, 1, 2, 0, 2, 1] })).toEqual([0, 1, 2, 0, 1, 2]);
    expect(renderIndices({ ...source, source: 'obj' })).toBe(source.indices);
    expect(renderIndices({ ...source, normals: [] })).toBe(source.indices);
    expect(renderIndices({ ...source, positions: Array(9).fill(0) })).toEqual(source.indices);
  });
});
