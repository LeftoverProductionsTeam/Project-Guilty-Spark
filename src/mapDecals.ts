import { Triangle, Vector3 } from 'three';
import type { MapInspection, MeshData, SceneDecal, Vec3 } from './types';
import { buildCollisionIndex, queryCollisionIndex } from './collisionSpatial';
import type { CollisionNode } from './collisionSpatial';
import { lightmapPageKey } from './haloLightmap';

export const decalTextureKey = (bitmap: number) => `decal:${bitmap}:0`;
export function decalTextureRequests(inspection: MapInspection, assigned: ReadonlySet<string>) {
  const ids = new Set((inspection.decals ?? []).map((d) => d.bitmapTagId));
  return [...ids]
    .filter(
      (id) =>
        !assigned.has(decalTextureKey(id)) &&
        inspection.tags.some((t) => t.id === id && t.class === 'bitm' && !t.external),
    )
    .map((bitmapTagId) => ({
      kind: 'decal' as const,
      bitmapTagId,
      imageIndex: 0 as const,
      key: decalTextureKey(bitmapTagId),
    }));
}
interface Surface {
  a: Vec3;
  b: Vec3;
  c: Vec3;
  normal: Vector3;
  lightmap: string | null;
  bsp: number | null;
  uvs: number[][];
}
export interface DecalSurfaceIndex {
  surfaces: Surface[];
  tree: CollisionNode | null;
}
export interface DecalPart {
  decal: SceneDecal;
  positions: number[];
  uvs: number[];
  lightmapUvs: number[];
  lightmap: string | null;
}
export interface DecalProjection {
  parts: DecalPart[];
  rendered: number;
  omitted: number;
  vertices: number;
}

/** One spatial index per immutable BSP, shared by all its projected markings.
 * Object meshes are deliberately excluded: Halo environment decals use BSPs. */
export function indexDecalSurfaces(data: MeshData): DecalSurfaceIndex {
  const surfaces: Surface[] = [];
  if (data.indices.length > 1_500_000 || data.positions.length > 1_500_000) return { surfaces, tree: null };
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3(),
    triangle = new Triangle();
  const ranges = [...(data.materialRanges ?? [])].sort((a, b) => a.indexStart - b.indexStart);
  let r = 0;
  for (let i = 0; i + 2 < data.indices.length; i += 3) {
    const ids = data.indices.slice(i, i + 3);
    if (ids.some((id) => !Number.isSafeInteger(id) || id < 0 || id * 3 + 2 >= data.positions.length))
      continue;
    a.fromArray(data.positions, ids[0] * 3);
    b.fromArray(data.positions, ids[1] * 3);
    c.fromArray(data.positions, ids[2] * 3);
    if ([...a, ...b, ...c].some((v) => !Number.isFinite(v))) continue;
    const normal = triangle.set(a, b, c).getNormal(new Vector3());
    if (normal.lengthSq() < 0.5) continue;
    // Halo's compiled index winding can oppose its authored render normals.
    // Use the source normals to choose the exposed side of the same triangle.
    if(data.normals?.length===data.positions.length){
      const authored=new Vector3();for(const id of ids)authored.add(new Vector3().fromArray(data.normals,id*3));
      if(authored.dot(normal)<0)normal.negate();
    }
    while (r < ranges.length && ranges[r].indexStart + ranges[r].indexCount <= i) r++;
    const range = ranges[r]?.indexStart <= i ? ranges[r] : undefined;
    const lightmap =
      range?.hasLightmapUvs &&
      range.lightmapPage !== undefined &&
      range.lightmapPage >= 0 &&
      data.lightmapUvs?.length === (data.positions.length / 3) * 2
        ? lightmapPageKey(range.bspIndex, range.lightmapPage)
        : null;
    surfaces.push({
      a: a.toArray() as Vec3,
      b: b.toArray() as Vec3,
      c: c.toArray() as Vec3,
      normal,
      lightmap,
      bsp: range?.bspIndex ?? null,
      uvs: ids.map((id) => (lightmap ? [data.lightmapUvs![id * 2], data.lightmapUvs![id * 2 + 1]] : [0, 0])),
    });
  }
  return { surfaces, tree: buildCollisionIndex(surfaces) };
}
interface Vertex {
  p: Vec3;
  uv: [number, number];
}
function clip(vertices: Vertex[], axis: number, edge: number, sign: number): Vertex[] {
  const out: Vertex[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % vertices.length],
      da = (a.p[axis] - edge) * sign,
      db = (b.p[axis] - edge) * sign;
    if (da <= 1e-7) out.push(a);
    if (da <= 0 !== db <= 0) {
      const t = da / (da - db);
      out.push({
        p: a.p.map((v, j) => v + (b.p[j] - v) * t) as Vec3,
        uv: [a.uv[0] + (b.uv[0] - a.uv[0]) * t, a.uv[1] + (b.uv[1] - a.uv[1]) * t],
      });
    }
  }
  return out;
}

/** Conform source decals by clipping real nearby triangles. Barycentric
 * lightmap UVs survive clipping. No floating quad or replacement surface. */
export function projectMapDecals(
  index: DecalSurfaceIndex,
  decals: readonly SceneDecal[],
  dimensions: ReadonlyMap<number, { width: number; height: number }> = new Map(),
): DecalProjection {
  const result: DecalProjection = {
    parts: [],
    rendered: 0,
    omitted: Math.max(0, decals.length - 2048),
    vertices: 0,
  };
  const p = new Vector3(),
    q = new Vector3(),
    triangle = new Triangle(),
    a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  let work = 0;
  for (const decal of decals.slice(0, 2048)) {
    if (
      !decal.position.every(Number.isFinite) ||
      !Number.isFinite(decal.radius) ||
      decal.radius <= 0 ||
      decal.radius > 16
    ) {
      result.omitted++;
      continue;
    }
    const yaw = (decal.yaw * Math.PI) / 128;
    const origin = new Vector3(...decal.position),
      nearby = queryCollisionIndex(index.tree, decal.position, decal.radius * 2 + 0.25).ids;
    let nearest: Surface | undefined,
      distance = Infinity,
      anchor = new Vector3();
    for (const id of nearby) {
      const face = index.surfaces[id];
      if (decal.bspIndex !== null && face.bsp !== null && decal.bspIndex !== face.bsp) continue;
      triangle
        .set(a.fromArray(face.a), b.fromArray(face.b), c.fromArray(face.c))
        .closestPointToPoint(origin, q);
      const d = q.distanceToSquared(origin);
      if (d < distance) {
        distance = d;
        nearest = face;
        anchor.copy(q);
      }
    }
    if (!nearest || distance > Math.max(0.08, decal.radius * 0.25) ** 2) {
      result.omitted++;
      continue;
    }
    const n = nearest.normal.clone(),
      up = new Vector3(0, 0, 1);
    if (Math.abs(n.z) > 0.98) up.set(-Math.sin(yaw), Math.cos(yaw), 0);
    const right = new Vector3().crossVectors(up, n).normalize();
    up.crossVectors(n, right).normalize();
    if (!(decal.flags & 8)) {
      // Stable source preview for decals randomized by the engine.
      const angle =
        ((((decal.decalTagId ^ Math.round(decal.position[0] * 1000)) >>> 0) % 360) * Math.PI) / 180;
      right.applyAxisAngle(n, angle);
      up.applyAxisAngle(n, angle);
    }
    const size = dimensions.get(decal.bitmapTagId);
    const width = decal.radius * 2,
      height = width * (decal.flags & 256 && size ? size.height / size.width : 1);
    const depth = decal.kind === 3 ? 0.04 : Math.max(0.08, decal.radius);
    const local = (position: Vec3): Vec3 => {
      p.fromArray(position).sub(anchor);
      return [p.dot(right), p.dot(up), p.dot(n)];
    };
    const parts = new Map<string, DecalPart>();
    for (const id of nearby) {
      if (++work > 1_000_000 || result.vertices >= 196_608) break;
      const face = index.surfaces[id];
      if (decal.bspIndex !== null && face.bsp !== null && decal.bspIndex !== face.bsp) continue;
      if (face.normal.dot(n) < (decal.kind === 3 ? 0.999 : 0.02)) continue;
      let vertices = [face.a, face.b, face.c].map((pos, i) => ({
        p: local(pos),
        uv: face.uvs[i] as [number, number],
      }));
      for (const [axis, half] of [
        [0, width / 2],
        [1, height / 2],
        [2, depth / 2],
      ]) {
        vertices = clip(clip(vertices, axis, half, 1), axis, -half, -1);
        if (vertices.length < 3) break;
      }
      if (vertices.length < 3) continue;
      const count = (vertices.length - 2) * 3;
      if (result.vertices + count > 196_608) break;
      const key = face.lightmap ?? '',
        part = parts.get(key) ?? { decal, positions: [], uvs: [], lightmapUvs: [], lightmap: face.lightmap };
      parts.set(key, part);
      const emit = (vertex: Vertex) => {
        p.copy(anchor)
          .addScaledVector(right, vertex.p[0])
          .addScaledVector(up, vertex.p[1])
          .addScaledVector(n, vertex.p[2] + 0.0003);
        part.positions.push(p.x, p.y, p.z);
        part.uvs.push(vertex.p[0] / width + 0.5, vertex.p[1] / height + 0.5);
        part.lightmapUvs.push(...vertex.uv);
      };
      for (let i = 1; i + 1 < vertices.length; i++) {
        emit(vertices[0]);
        emit(vertices[i]);
        emit(vertices[i + 1]);
      }
      result.vertices += count;
    }
    if (parts.size) {
      result.parts.push(...parts.values());
      result.rendered++;
    } else result.omitted++;
  }
  return result;
}
