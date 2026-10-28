import { describe, it, expect } from 'vitest';
import { animationDeformer, animationMapping } from './animation';
import type { AnimationClip } from './animation';
import type { MeshData } from './types';
const mesh = (): MeshData => ({
  positions: [1, 0, 0, 2, 0, 0],
  normals: [0, 0, 1, 0, 0, 1],
  uvs: [],
  indices: [],
  label: 'Original weighted test rig',
  source: 'test',
  rig: {
    checksum: 42,
    nodes: [
      { name: 'root', parent: -1, position: [0, 0, 0], rotation: [0, 0, 0, 1] },
      { name: 'arm', parent: 0, position: [1, 0, 0], rotation: [0, 0, 0, 1] },
    ],
    indices: [0, 0, 1, 0],
    weights: [1, 0, 1, 0],
  },
});
const clip = (): AnimationClip => ({
  name: 'turn',
  fps: 1,
  frameCount: 2,
  checksum: 42,
  nodes: [
    { name: 'root', parent: -1 },
    { name: 'arm', parent: 0 },
  ],
  transforms: [
    0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 0, 1,
  ],
});
describe('Actual skeletal animation deformation', () => {
  it('preserves bind pose and rotates only vertices weighted to the animated joint', () => {
    const m = mesh(),
      p = animationDeformer(m, clip());
    expect([...p.sample(0, false).positions]).toEqual(m.positions);
    const out = p.sample(1, false).positions;
    expect([...out.slice(0, 3)]).toEqual([1, 0, 0]);
    expect(out[3]).toBeCloseTo(0);
    expect(out[4]).toBeCloseTo(0);
    expect([...p.normals]).toEqual([0, 0, 1, 0, 0, 1]);
    expect(m.positions).toEqual([1, 0, 0, 2, 0, 0]);
  });
  it('interpolates joint rotation and respects both skin weights', () => {
    const m = mesh();
    m.rig!.indices = [0, 0, 1, 0];
    m.rig!.weights = [1, 0, 0.5, 0.5];
    const p = animationDeformer(m, clip()).sample(0.5, false);
    expect(p.positions[3]).toBeCloseTo(1.5);
    expect(Math.abs(p.positions[4])).toBeCloseTo(0.5);
  });
  it('rejects an incompatible rig, nonfinite frames, bad hierarchy and invalid weights', () => {
    const m = mesh(),
      c = clip();
    c.nodes[1].parent = -1;
    expect(() => animationMapping(c, m.rig!)).toThrow(/hierarchy/);
    c.nodes[1].parent = 0;
    c.transforms[0] = NaN;
    expect(() => animationDeformer(m, c)).toThrow(/frame data/);
    const valid = clip();
    m.rig!.weights[2] = 3;
    expect(() => animationDeformer(m, valid).sample(0)).toThrow(/influence/);
  });
});
