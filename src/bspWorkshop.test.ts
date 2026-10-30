import { describe, it, expect } from 'vitest';
import {
  boxBrush,
  clipBrush,
  extrudeFace,
  rampBrush,
  worldVertex,
  localVertex,
  viewAxes,
  snapNumber,
  workshopFromPrimitives,
} from './bspWorkshop';
import { beginProjectMutation, projectMutationPending } from './projectMutation';
import { cross, sub, dot } from './bspWorkshop';
import type { BspBrush } from './bspWorkshop';
import type { QuickForgeDocument } from './forge';
function volume(b: BspBrush) {
  return b.faces.reduce(
    (sum, f) =>
      sum +
      f.vertices
        .slice(1, -1)
        .reduce(
          (s, i, j) =>
            s + dot(b.vertices[f.vertices[0]], cross(b.vertices[i], b.vertices[f.vertices[j + 2]])) / 6,
          0,
        ),
    0,
  );
}
function manifold(b: BspBrush) {
  const edges = new Map<string, string[]>();
  for (const f of b.faces)
    for (let i = 0; i < f.vertices.length; i++) {
      const a = f.vertices[i],
        c = f.vertices[(i + 1) % f.vertices.length],
        key = [Math.min(a, c), Math.max(a, c)].join(':');
      edges.set(key, [...(edges.get(key) ?? []), `${a}:${c}`]);
    }
  return [...edges.values()].every((v) => v.length === 2 && v[0] !== v[1]);
}
describe('editable Workshop source', () => {
  it('creates a closed box and true triangular ramp with positive solid orientation', () => {
    const b = boxBrush('box', 'space', [-1, -2, 0], [1, 2, 3], 'metal');
    expect(volume(b)).toBe(24);
    expect(manifold(b)).toBe(true);
    const r = rampBrush('ramp', [-1, -2, 0], [1, 2, 3], 'metal');
    expect(volume(r)).toBe(12);
    expect(manifold(r)).toBe(true);
    expect(r.vertices.length).toBe(6);
  });
  it('preserves local/world coordinates under all rotation axes and nonuniform scale', () => {
    const b = boxBrush('b', 'solid', [0, 0, 0], [2, 2, 2], 'm');
    b.position = [4, -8, 7];
    b.rotation = [0.12, -0.3, 0.95];
    b.scale = [0.5, 2, 3];
    const point: [number, number, number] = [0.2, 0.8, 1.3],
      world = worldVertex(b, point);
    localVertex(b, world).forEach((x, k) => expect(x).toBeCloseTo(point[k], 10));
    expect(viewAxes).toEqual({ top: [0, 1, 2], front: [0, 2, 1], side: [1, 2, 0] });
    expect(snapNumber(-1.26, 0.5)).toBe(-1.5);
  });
  it('clips a volume with a real closing face while retaining original face UVs', () => {
    const b = boxBrush('b', 'solid', [-2, -2, -2], [2, 2, 2], 'm');
    b.faces[0].uvScale = [2, 3];
    b.faces[0].uvOffset = [0.2, 0.3];
    b.faces[0].uvRotation = 45;
    const clipped = clipBrush(b, [1, 0, 0], 0, 'cap');
    expect(volume(clipped)).toBeCloseTo(32);
    expect(manifold(clipped)).toBe(true);
    expect(clipped.faces.find((f) => f.id === 'face-0')).toMatchObject({
      uvScale: [2, 3],
      uvOffset: [0.2, 0.3],
      uvRotation: 45,
    });
    expect(clipped.faces.find((f) => f.id === 'cap')).toBeTruthy();
    expect(b.vertices.length).toBe(8);
    expect(() => clipBrush(b, [0, 0, 0], 0, 'cap')).toThrow();
    expect(() => clipBrush(b, [1, 0, 0], 50, 'cap')).toThrow();
    expect(() => clipBrush(b, [1, 0, 0], -50, 'cap')).toThrow();
  });
  it('extrudes the selected polygon into a separate convex source brush', () => {
    const b = boxBrush('b', 'space', [-1, -1, 0], [1, 1, 2], 'm'),
      e = extrudeFace(b, 'face-3', 5, 'extruded');
    expect(volume(e)).toBeCloseTo(20);
    expect(manifold(e)).toBe(true);
    expect(e.vertices.every((v) => v[0] >= 1)).toBe(true);
    expect(e.faces.every((f) => f.materialId === 'm')).toBe(true);
    expect(() => extrudeFace(b, 'missing', 2, 'e')).toThrow();
    expect(() => extrudeFace(b, 'face-3', 0, 'e')).toThrow();
  });
  it('retains pre-existing source rather than accepting unsupported primitive conversion', () => {
    const doc = {
      native: undefined,
      geometry: [
        {
          id: 'a',
          name: 'Terrain',
          kind: 'terrain',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          dimensions: [8, 8, 2],
          materialId: 'm',
          steps: 4,
        },
      ],
      materials: [],
      placements: [],
    } as unknown as QuickForgeDocument;
    const before = JSON.stringify(doc);
    expect(() => workshopFromPrimitives(doc)).toThrow(/separate Workshop/);
    expect(JSON.stringify(doc)).toBe(before);
  });
  it('locks only the affected project until every concurrent local lease releases', () => {
    const a = beginProjectMutation('a'),
      b = beginProjectMutation('a');
    expect(projectMutationPending('a')).toBe(true);
    expect(projectMutationPending('b')).toBe(false);
    a();
    a();
    expect(projectMutationPending('a')).toBe(true);
    b();
    expect(projectMutationPending('a')).toBe(false);
  });
});
