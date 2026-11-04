import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { boxBrush } from './bspWorkshop';
import { pickWorkshopOrtho, workshopPartSelection, workshopPickGeometry } from './bspPicking';

describe('source component picking', () => {
  it('selects the near source wall from outside and inside instead of the far inward-rendered wall', () => {
    const room = boxBrush('a', 'space', [-8, -6, 0], [8, 6, 5], 'metal');
    const surface = workshopPickGeometry([room]);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(surface.geometry, material);
    mesh.updateMatrixWorld();
    for (const [origin, direction, expected] of [
      [[20, 0, 2], [-1, 0, 0], 'face-3'],
      [[-20, 0, 2], [1, 0, 0], 'face-5'],
      [[0, 0, 2], [1, 0, 0], 'face-3'],
    ] as const) {
      const hits = new THREE.Raycaster(
        new THREE.Vector3(...origin),
        new THREE.Vector3(...direction),
      ).intersectObject(mesh);
      expect(hits.length).toBeGreaterThan(0);
      expect(surface.hits[hits[0].faceIndex!].face.id).toBe(expected);
    }
    material.dispose();
    surface.geometry.dispose();
  });
  it('orthographic picking follows camera depth, independent of brush and polygon painter order', () => {
    const front = boxBrush('near', 'solid', [-2, -6, 0], [2, -4, 2], 'metal');
    const back = boxBrush('far', 'space', [-3, -3, 0], [3, 3, 4], 'metal');
    for (const brushes of [
      [front, back],
      [back, front],
    ]) {
      const surface = workshopPickGeometry(brushes);
      expect(pickWorkshopOrtho(surface, 'front', [0, 0, 1])).toMatchObject({
        brush: { id: 'near' },
        face: { id: 'face-2' },
      });
      expect(pickWorkshopOrtho(surface, 'top', [0, 0, 0])).toMatchObject({
        brush: { id: 'far' },
        face: { id: 'face-1' },
      });
      expect(pickWorkshopOrtho(surface, 'top', [100, 100, 0])).toBeNull();
      surface.geometry.dispose();
    }
  });
  it('only offers edges and vertices of the picked nearest face, within a screen-sized handle', () => {
    const room = boxBrush('room', 'space', [0, 0, 0], [2, 2, 2], 'm');
    const face = room.faces[3];
    const project = (v: number[]) => ({ x: v[1] * 100, y: v[2] * 100 });
    expect(workshopPartSelection(room, face, 'edge', { x: 100, y: 0 }, project).vertices).toEqual([1, 2]);
    expect(workshopPartSelection(room, face, 'edge', { x: 100, y: 100 }, project).vertices).toBeUndefined();
    expect(workshopPartSelection(room, face, 'vertex', { x: 199, y: 199 }, project).vertices).toEqual([6]);
    expect(workshopPartSelection(room, face, 'face', { x: 100, y: 100 }, project).vertices).toEqual(
      face.vertices,
    );
  });
});
