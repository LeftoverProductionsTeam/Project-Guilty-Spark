import { exportMeshJms } from './haloJms.ts';
import type { MeshData, Vec3 } from './types';

const maxSourceLength = 32 * 1024 * 1024;
const maxVertices = 65535;
const maxTriangles = 131072;

function count(rows: string[], at: number, limit: number, label: string) {
  const row = rows[at];
  const value = Number(row);
  if (!row || !/^\d+$/.test(row) || !Number.isSafeInteger(value) || value > limit) {
    throw new Error('Invalid recovered JMS ' + label);
  }
  return value;
}

function readHeader(text: string) {
  if (text.length > maxSourceLength) throw new Error('Recovered JMS source exceeds 32 MiB');
  const rows = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const checksum = Number(rows[1]);
  if (rows[0] !== '8200' || !/^-?\d+$/.test(rows[1] ?? '') ||
    !Number.isInteger(checksum) || checksum < -0x80000000 || checksum > 0xffffffff) {
    throw new Error('Expected recovered JMS 8200 source with a 32-bit rig checksum');
  }
  return { rows, checksum: checksum >>> 0 };
}

/** Invader Recover prints the unsigned checksum. Halo Tool and Invader Model
 * read a signed decimal. Keep the same bits above the signed range. */
export function normalizeRecoveredJmsChecksum(text: string) {
  const { rows, checksum } = readHeader(text);
  rows[1] = String(checksum | 0);
  return rows.join('\n') + '\n';
}

export function readRecoveredJms(text: string) {
  const { rows, checksum } = readHeader(text);
  const nodes = count(rows, 2, 255, 'node count');
  const materialStart = 3 + 5 * nodes;
  const materials = count(rows, materialStart, 256, 'material count');
  const markerStart = materialStart + 1 + 2 * materials;
  const markers = count(rows, markerStart, 4096, 'marker count');
  const regionStart = markerStart + 1 + 6 * markers;
  const regions = count(rows, regionStart, 256, 'region count');
  const vertexStart = regionStart + 1 + regions;
  const vertices = count(rows, vertexStart, maxVertices, 'vertex count');
  // Invader Recover emits one packed U/V/W row per vertex.
  const triangleStart = vertexStart + 1 + 6 * vertices;
  const triangles = count(rows, triangleStart, maxTriangles, 'triangle count');
  if (triangleStart + 1 + 3 * triangles !== rows.length) throw new Error('Unexpected recovered JMS rows');
  return {
    rows, checksum, vertices, triangles, vertexStart, triangleStart,
    nodes: Array.from({ length: nodes }, (_, i) => rows[3 + 5 * i]),
    materials: Array.from({ length: materials }, (_, i) => rows[materialStart + 1 + 2 * i]),
    regions: rows.slice(regionStart + 1, vertexStart),
    rig: rows.slice(3, materialStart),
    markers: rows.slice(markerStart, regionStart),
  };
}

/** Append one compiler-facing shader name without changing any stock slot index. */
export function appendRecoveredJmsMaterial(text: string, name: string) {
  const { rows, nodes, materials } = readRecoveredJms(text);
  if (!/^[a-z][a-z0-9_]{0,47}$/.test(name) || materials.some(material => material.toLowerCase() === name)) {
    throw new Error('Choose a unique native material name');
  }
  if (materials.length >= 256) throw new Error('Recovered JMS material capacity reached');
  const countAt = 3 + 5 * nodes.length;
  rows[countAt] = String(materials.length + 1);
  rows.splice(countAt + 1 + 2 * materials.length, 0, name, '<none>');
  const result = rows.join('\n') + '\n';
  if (result.length > maxSourceLength) throw new Error('Recovered JMS source exceeds 32 MiB');
  return result;
}

export function attachRigidPartToRecoveredJms(text: string, mesh: MeshData, mount: {
  node: string;
  region: string;
  material: string;
  /** Translation in model space, in editor world units. */
  position: Vec3;
}) {
  const { rows, checksum, vertices, triangles, vertexStart, triangleStart, nodes, materials, regions } = readRecoveredJms(text);
  function uniqueIndex(values: string[], requested: string, label: string) {
    const first = values.indexOf(requested);
    if (first < 0 || first !== values.lastIndexOf(requested)) {
      throw new Error('Choose one existing JMS ' + label + ': ' + requested);
    }
    return first;
  }
  const node = uniqueIndex(nodes, mount.node, 'node');
  const material = uniqueIndex(materials, mount.material, 'material');
  const region = uniqueIndex(regions, mount.region, 'region');
  if (mount.position.length !== 3 || !mount.position.every(v => Number.isFinite(v) && Math.abs(v) <= 1000)) {
    throw new Error('Rigid mount translation exceeds its bounds');
  }

  const part = exportMeshJms(mesh);
  if (part.materials.length !== 1) throw new Error('A rigid part must use one material slot');
  if (vertices + part.vertices > maxVertices || triangles + part.triangles > maxTriangles) {
    throw new Error('Mounted part exceeds the recovered JMS model limits');
  }
  const partRows = part.text.trimEnd().split('\n');
  const partStart = 15; // Single-node, single-material exportMeshJms source.
  if (Number(partRows[partStart - 1]) !== part.vertices) throw new Error('Unexpected rigid part JMS rows');
  const addedVertices: string[] = [];
  for (let i = 0; i < part.vertices; i++) {
    const at = partStart + 8 * i;
    const position = partRows[at + 1].split(/\s+/)
      .map((value, axis) => (Number(value) + 100 * mount.position[axis]).toFixed(6));
    addedVertices.push(String(node), position.join('\t'), partRows[at + 2], '-1', '0',
      [partRows[at + 5], partRows[at + 6], '0'].join('\t'));
  }
  const addedTriangles: string[] = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const corners = mesh.indices.slice(i, i + 3).map(index => index + vertices);
    addedTriangles.push(String(region), String(material), corners.join('\t'));
  }
  rows[1] = String(checksum | 0);
  const result = [
    ...rows.slice(0, vertexStart), String(vertices + part.vertices),
    ...rows.slice(vertexStart + 1, triangleStart), ...addedVertices,
    String(triangles + part.triangles), ...rows.slice(triangleStart + 1), ...addedTriangles,
  ].join('\n') + '\n';
  if (result.length > maxSourceLength) throw new Error('Mounted JMS source exceeds 32 MiB');
  return { text: result, checksum, originalTriangles: triangles, addedTriangles: part.triangles };
}
