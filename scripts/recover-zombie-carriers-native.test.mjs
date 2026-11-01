import { test } from 'node:test';
import assert from 'node:assert/strict';
import { triangulateCollider, carrierSources } from './recover-zombie-carriers-native.mjs';
const points = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
];
const edges = points.map((_, i) => ({
  start_vertex: i,
  end_vertex: (i + 1) % 3,
  forward_edge: (i + 1) % 3,
  reverse_edge: (i + 2) % 3,
  left_surface: 0,
  right_surface: 1,
}));

test('collision half-edges preserve both surface windings and refuse broken topology', () => {
  assert.deepEqual(triangulateCollider(points, edges, [0, 0]), [
    [0, 1, 2],
    [1, 0, 2],
  ]);
  assert.throws(
    () => triangulateCollider(points, [{ ...edges[0], forward_edge: 0 }, ...edges.slice(1)], [0]),
    /polygon/,
  );
  assert.throws(
    () => triangulateCollider(points, [{ ...edges[0], start_vertex: 20 }, ...edges.slice(1)], [0]),
    /vertex/,
  );
  assert.throws(() => triangulateCollider(points, edges, [4]), /cycle/);
});
const nodes = [
  { name: 'root', child: 1, sibling: -1, translation: [0, 0, 0.42], rotation: [0, 0, 0, 1] },
  { name: 'wheel', child: -1, sibling: -1, translation: [1, 2, 3], rotation: [0, 0, 0, 1] },
];
const mesh = { points, triangles: [[0, 1, 2]], material: 'authored material' };
test('native source retains material and bind-space volume in different weighted regions', () => {
  const { jms, jma } = carrierSources(nodes, 123, mesh, ['hull', 'tire'], [0, 1]);
  const lines = jms.trim().split('\n');
  // Read the JMS header independently: two nodes, one material, no markers,
  // two regions, six vertices, then two triangles with separate region IDs.
  assert.deepEqual(lines.slice(0, 3), ['8200', '0', '2']);
  assert.deepEqual(lines.slice(13, 21), ['1', 'authored material', '<none>', '0', '2', 'hull', 'tire', '6']);
  const vertices = Array.from({ length: 6 }, (_, i) => lines.slice(21 + i * 8, 21 + (i + 1) * 8));
  assert.equal(vertices[0][0], '0');
  assert.equal(vertices[3][0], '1');
  assert.equal(vertices[0][1], '0\t0\t42');
  assert.equal(vertices[0][1], vertices[3][1]);
  assert.deepEqual(lines.slice(69), ['2', '0', '0', '0\t1\t2', '1', '0', '3\t4\t5']);
  assert.deepEqual(jma.split('\n').slice(0, 7), ['16392', '2', '30', '1', 'carrier', '2', '123']);
});
test('unreviewed roots, bad node links and invalid material/source values are refused', () => {
  assert.throws(
    () => carrierSources([{ ...nodes[0], rotation: [1, 0, 0, 0] }, nodes[1]], 123, mesh, ['hull'], [0]),
    /rotation/,
  );
  assert.throws(
    () => carrierSources([{ ...nodes[0], child: 0 }, nodes[1]], 123, mesh, ['hull'], [0]),
    /Cyclic/,
  );
  assert.throws(
    () => carrierSources(nodes, 123, { ...mesh, material: 'bad\nmaterial' }, ['hull'], [0]),
    /metadata/,
  );
  assert.throws(() => carrierSources(nodes, 123, mesh, ['hull'], [7]), /metadata/);
});
