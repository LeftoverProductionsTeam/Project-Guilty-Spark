import * as THREE from 'three';
import type { BspBrush, BspFace, BspTool, BspView, WorkshopSelection } from './bspWorkshop';
import { viewAxes, worldVertex } from './bspWorkshop';
import type { Vec3 } from './types';

/** Source faces are selectable from either side. Native render faces face into
 * playable air, so using only their render material would pick the far wall. */
export function workshopPickGeometry(brushes: readonly BspBrush[]) {
  const positions: number[] = [],
    hits: { brush: BspBrush; face: BspFace }[] = [];
  for (const brush of brushes)
    for (const face of brush.faces)
      for (let i = 1; i < face.vertices.length - 1; i++) {
        for (const index of [face.vertices[0], face.vertices[i], face.vertices[i + 1]])
          positions.push(...worldVertex(brush, brush.vertices[index]));
        hits.push({ brush, face });
      }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return { geometry, hits };
}
export function pickWorkshopOrtho(
  surface: ReturnType<typeof workshopPickGeometry>,
  view: Exclude<BspView, 'perspective'>,
  point: Vec3,
) {
  const axis = viewAxes[view][2],
    sign = view === 'front' ? -1 : 1;
  const origin = new THREE.Vector3(...point),
    direction = new THREE.Vector3();
  origin.setComponent(axis, sign * 10000);
  direction.setComponent(axis, -sign);
  const ray = new THREE.Ray(origin, direction),
    positions = surface.geometry.getAttribute('position');
  let nearest: { brush: BspBrush; face: BspFace; distance: number } | null = null;
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    hit = new THREE.Vector3();
  for (let i = 0; i < surface.hits.length; i++) {
    a.fromBufferAttribute(positions, i * 3);
    b.fromBufferAttribute(positions, i * 3 + 1);
    c.fromBufferAttribute(positions, i * 3 + 2);
    if (ray.intersectTriangle(a, b, c, false, hit)) {
      const distance = hit.distanceTo(origin);
      if (!nearest || distance < nearest.distance - 1e-6) nearest = { ...surface.hits[i], distance };
    }
  }
  return nearest;
}
type ScreenPoint = { x: number; y: number };
/** Edge/vertex handles belong to the nearest face, never to an occluded face. */
export function workshopPartSelection(
  brush: BspBrush,
  face: BspFace,
  tool: BspTool,
  point: ScreenPoint,
  project: (p: Vec3) => ScreenPoint,
  tolerance = 12,
): WorkshopSelection {
  const selection: WorkshopSelection = { brushId: brush.id, faceId: face.id };
  if (tool === 'face') return { ...selection, vertices: [...face.vertices] };
  if (tool !== 'edge' && tool !== 'vertex') return selection;
  const projected = face.vertices.map((i) => project(worldVertex(brush, brush.vertices[i])));
  let best = tolerance * tolerance,
    vertices: number[] | undefined;
  for (let i = 0; i < projected.length; i++) {
    const a = projected[i],
      b = projected[(i + 1) % projected.length];
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const t =
      tool === 'vertex' || dx * dx + dy * dy < 1e-12
        ? 0
        : Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
    const d = (point.x - a.x - t * dx) ** 2 + (point.y - a.y - t * dy) ** 2;
    if (d <= best) {
      best = d;
      vertices =
        tool === 'vertex'
          ? [face.vertices[i]]
          : [face.vertices[i], face.vertices[(i + 1) % face.vertices.length]];
    }
  }
  return { ...selection, ...(vertices ? { vertices } : {}) };
}
