/** Versioned editable source; derived boolean meshes are never saved as brushes. */
import type { QuickForgeDocument } from './forge';
import type { Vec3 } from './types';
export interface BspFace {
  id: string;
  vertices: number[];
  materialId: string;
  uvScale: [number, number];
  uvOffset: [number, number];
  uvRotation: number;
}
export interface BspBrush {
  id: string;
  name: string;
  role: 'space' | 'solid';
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  vertices: Vec3[];
  faces: BspFace[];
}
export interface BspPortal {
  id: string;
  points: Vec3[];
  materialId: string;
}
export interface BspWorkshopSource {
  schemaVersion: 1;
  brushes: BspBrush[];
  portals: BspPortal[];
}
export type BspView = 'perspective' | 'top' | 'front' | 'side';
export type BspTool =
  | 'select'
  | 'drawSpace'
  | 'drawSolid'
  | 'move'
  | 'rotate'
  | 'scale'
  | 'vertex'
  | 'edge'
  | 'face'
  | 'clip'
  | 'material'
  | 'measure';
export const viewAxes: Record<Exclude<BspView, 'perspective'>, [number, number, number]> = {
  top: [0, 1, 2],
  front: [0, 2, 1],
  side: [1, 2, 0],
};
export function snapNumber(v: number, grid: number) {
  return grid > 0 ? Math.round(v / grid) * grid : v;
}
export function add(a: Vec3, b: Vec3): Vec3 {
  return a.map((v, k) => v + b[k]) as Vec3;
}
export function sub(a: Vec3, b: Vec3): Vec3 {
  return a.map((v, k) => v - b[k]) as Vec3;
}
export function dot(a: Vec3, b: Vec3) {
  return a.reduce((s, v, k) => s + v * b[k], 0);
}
export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function faceNormal(brush: BspBrush, face: BspFace): Vec3 {
  const [a, b, c] = face.vertices.map((i) => brush.vertices[i]);
  const n = cross(sub(b, a), sub(c, a));
  const length = Math.hypot(...n);
  if (length < 1e-6) throw Error('Face is degenerate');
  return n.map((v) => v / length) as Vec3;
}
export function worldVertex(b: BspBrush, v: Vec3): Vec3 {
  const p = v.map((x, k) => x * b.scale[k]);
  for (let axis = 0; axis < 3; axis++) {
    const i = (axis + 1) % 3,
      j = (axis + 2) % 3,
      s = Math.sin(b.rotation[axis]),
      c = Math.cos(b.rotation[axis]),
      a = p[i],
      z = p[j];
    p[i] = a * c - z * s;
    p[j] = a * s + z * c;
  }
  return p.map((x, k) => x + b.position[k]) as Vec3;
}
export function localVertex(b: BspBrush, v: Vec3): Vec3 {
  const p = v.map((x, k) => x - b.position[k]);
  for (let axis = 2; axis >= 0; axis--) {
    const i = (axis + 1) % 3,
      j = (axis + 2) % 3,
      s = Math.sin(-b.rotation[axis]),
      c = Math.cos(-b.rotation[axis]),
      a = p[i],
      z = p[j];
    p[i] = a * c - z * s;
    p[j] = a * s + z * c;
  }
  return p.map((x, k) => x / b.scale[k]) as Vec3;
}
function face(id: string, vertices: number[], materialId: string): BspFace {
  return { id, vertices, materialId, uvScale: [1, 1], uvOffset: [0, 0], uvRotation: 0 };
}
export function boxBrush(
  id: string,
  role: BspBrush['role'],
  lo: Vec3,
  hi: Vec3,
  materialId: string,
): BspBrush {
  if ([...lo, ...hi].some((v) => !Number.isFinite(v)) || lo.some((v, k) => hi[k] - v < 0.01))
    throw Error('Brush needs positive width, depth and height');
  const [x, y, z] = lo,
    [X, Y, Z] = hi;
  return {
    id,
    name: role === 'space' ? 'Room / passage' : 'Solid brush',
    role,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    vertices: [
      [x, y, z],
      [X, y, z],
      [X, Y, z],
      [x, Y, z],
      [x, y, Z],
      [X, y, Z],
      [X, Y, Z],
      [x, Y, Z],
    ],
    faces: [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [1, 2, 6, 5],
      [2, 3, 7, 6],
      [3, 0, 4, 7],
    ].map((v, i) => face(`face-${i}`, v, materialId)),
  };
}
export function rampBrush(id: string, lo: Vec3, hi: Vec3, material: string): BspBrush {
  const b = boxBrush(id, 'solid', lo, hi, material),
    [x, y, z] = lo,
    [X, Y, Z] = hi;
  b.name = 'Ramp';
  b.vertices = [
    [x, y, z],
    [X, y, z],
    [X, Y, z],
    [x, Y, z],
    [X, Y, Z],
    [x, Y, Z],
  ];
  b.faces = [
    [0, 3, 2, 1],
    [3, 5, 4, 2],
    [0, 1, 4, 5],
    [0, 5, 3],
    [1, 2, 4],
  ].map((v, i) => face(`face-${i}`, v, material));
  return b;
}
export function extrudeFace(b: BspBrush, faceId: string, depth: number, id: string): BspBrush {
  if (!Number.isFinite(depth) || depth < 0.01 || depth > 512)
    throw Error('Extrusion depth must be 0.01–512 units');
  const f = b.faces.find((f) => f.id === faceId);
  if (!f) throw Error('Select a face to extrude');
  const n = faceNormal(b, f),
    base = f.vertices.map((i) => b.vertices[i]),
    count = base.length;
  return {
    ...structuredClone(b),
    id,
    name: `${b.name} extrusion`,
    vertices: [...base, ...base.map((v) => add(v, n.map((x) => x * depth) as Vec3))],
    faces: [
      { ...structuredClone(f), id: 'base', vertices: base.map((_, i) => i).reverse() },
      { ...structuredClone(f), id: 'end', vertices: base.map((_, i) => i + count) },
      ...base.map((_, i) => ({
        ...structuredClone(f),
        id: `side-${i}`,
        vertices: [i, (i + 1) % count, ((i + 1) % count) + count, i + count],
      })),
    ],
  };
}
/** Convex half-space clip. Retained faces keep stable IDs/UVs; the new cap is explicit. */
export function clipBrush(b: BspBrush, normal: Vec3, distance: number, capId: string): BspBrush {
  const l = Math.hypot(...normal);
  if (l < 1e-6 || !Number.isFinite(distance))
    throw Error('Clip plane needs a nonzero normal and finite distance');
  const n = normal.map((v) => v / l) as Vec3,
    d = distance / l;
  const vertices: Vec3[] = [],
    faces: BspFace[] = [],
    cap: Vec3[] = [];
  const index = (p: Vec3) => {
    let i = vertices.findIndex((v) => Math.hypot(...sub(p, v)) < 1e-7);
    if (i < 0) {
      i = vertices.length;
      vertices.push(p);
    }
    return i;
  };
  for (const f of b.faces) {
    const polygon = f.vertices.map((i) => b.vertices[i]),
      out: Vec3[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        c = polygon[(i + 1) % polygon.length],
        da = dot(a, n) - d,
        dc = dot(c, n) - d;
      if (da <= 1e-8) out.push(a);
      if (da > 1e-8 !== dc > 1e-8) {
        const p = add(a, sub(c, a).map((v) => (v * da) / (da - dc)) as Vec3);
        out.push(p);
        cap.push(p);
      }
    }
    const ids = out.map(index).filter((v, i, a) => v !== a[(i + 1) % a.length]);
    if (ids.length >= 3) faces.push({ ...structuredClone(f), vertices: ids });
  }
  const ids = [...new Set(cap.map(index))];
  if (ids.length < 3 || faces.length < 3) throw Error('Clip does not cut a nonempty convex volume');
  const center = ids
    .reduce((p, i) => add(p, vertices[i]), [0, 0, 0] as Vec3)
    .map((v) => v / ids.length) as Vec3;
  let u = sub(vertices[ids[0]], center);
  u = u.map((v) => v / Math.hypot(...u)) as Vec3;
  const v = cross(n, u);
  ids.sort((a, b) => {
    const x = sub(vertices[a], center),
      y = sub(vertices[b], center);
    return Math.atan2(dot(x, v), dot(x, u)) - Math.atan2(dot(y, v), dot(y, u));
  });
  faces.push({ ...structuredClone(b.faces[0]), id: capId, vertices: ids });
  return { ...structuredClone(b), vertices, faces };
}
export function workshopExample(doc: QuickForgeDocument): QuickForgeDocument {
  const d = structuredClone(doc),
    material = d.materials.find((m) => !m.name.startsWith('+'))?.id;
  if (!material) throw Error('Add a Halo surface material first');
  if (d.native)
    throw Error(
      'Create a separate source project for Workshop geometry. The admitted native collaboration revision remains unchanged',
    );
  d.geometry = [];
  // Geometry replacement retains authored gameplay. Validation reports content
  // outside the new space so the user can move it rather than lose it.
  d.workshop = {
    schemaVersion: 1,
    brushes: [
      { ...boxBrush('room-a', 'space', [-8, -6, 0], [8, 6, 5], material), name: 'Room A' },
      { ...boxBrush('corridor', 'space', [7, -2, 0], [21, 2, 3], material), name: 'Corridor' },
      { ...boxBrush('room-b', 'space', [20, -6, 0], [36, 6, 5], material), name: 'Room B' },
      rampBrush('ramp', [-3, -3, -0.5], [3, 1, 1.5], material),
    ],
    portals: [],
  };
  if (!d.spawns.length) d.spawns = [
    [-5, -4, 0.1],
    [-5, 4, 0.1],
    [32, -4, 0.1],
    [32, 4, 0.1],
  ].map((position, i) => ({
    id: `start-${i}`,
    name: `Player ${i + 1}`,
    position: position as Vec3,
    facing: 0,
    team: 0,
    gameModes: ['slayer'],
    visible: true,
    locked: false,
  }));
  return d;
}
export function workshopFromPrimitives(doc: QuickForgeDocument): QuickForgeDocument {
  if (doc.native) throw Error('Keep admitted shared native source separate; use a new Workshop project');
  const brushes = doc.geometry.map((b) => {
    if (b.locked || !b.visible)
      throw Error(
        `${b.name}: show and unlock the source brush before converting, or retain this project and create a separate Workshop level`,
      );
    let mesh: BspBrush;
    if (['room', 'box', 'wall', 'floor', 'platform'].includes(b.kind))
      mesh = boxBrush(
        b.id,
        b.kind === 'room' ? 'space' : 'solid',
        b.dimensions.map((v) => -v / 2) as Vec3,
        b.dimensions.map((v) => v / 2) as Vec3,
        b.materialId,
      );
    else if (b.kind === 'ramp')
      mesh = rampBrush(
        b.id,
        b.dimensions.map((v) => -v / 2) as Vec3,
        b.dimensions.map((v) => v / 2) as Vec3,
        b.materialId,
      );
    else
      throw Error(
        `${b.name}: ${b.kind} conversion is not implemented. Keep this project in QuickForge and create a separate Workshop level`,
      );
    return { ...mesh, name: b.name, position: [...b.position] as Vec3, rotation: [...b.rotation] as Vec3 };
  });
  if (!brushes.some((b) => b.role === 'space'))
    throw Error('Create a room shell in QuickForge first, or use the two-room source example');
  return { ...structuredClone(doc), geometry: [], workshop: { schemaVersion: 1, brushes, portals: [] } };
}

/** Convex source containment for placement. Native Halo collision remains authoritative. */
export function pointInsideWorkshop(source: BspWorkshopSource, point: Vec3): boolean {
  if (!point.every(Number.isFinite)) return false;
  const inside = (brush: BspBrush, inclusive: boolean) => {
    const local = localVertex(brush, point);
    return local.every(Number.isFinite) && brush.faces.every(face => {
      const distance = dot(sub(local, brush.vertices[face.vertices[0]]), faceNormal(brush, face));
      return inclusive ? distance <= 1e-5 : distance < -1e-5;
    });
  };
  return source.brushes.some(b => b.role === 'space' && inside(b, true)) &&
    !source.brushes.some(b => b.role === 'solid' && inside(b, false));
}
