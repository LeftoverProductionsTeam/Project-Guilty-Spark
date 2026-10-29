import type { MeshData } from './types';

/** Convert cached Halo faces to the renderer's front-face convention. Keep the
 * authored normals, vertex/UV order and triangle slots (material/pick IDs).
 * Workshop geometry already uses its author's convention and is left alone. */
export function renderIndices(mesh: MeshData): number[] {
  if (!/^halo-(?:render|model)/.test(mesh.source) || mesh.normals?.length !== mesh.positions.length)
    return mesh.indices;
  const result = mesh.indices.slice(),
    p = mesh.positions,
    n = mesh.normals;
  for (let i = 0; i + 2 < result.length; i += 3) {
    const [a, b, c] = result.slice(i, i + 3).map((v) => v * 3);
    if ([a, b, c].some((v) => !Number.isSafeInteger(v) || v < 0 || v + 2 >= p.length)) continue;
    const ux = p[b] - p[a],
      uy = p[b + 1] - p[a + 1],
      uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a],
      vy = p[c + 1] - p[a + 1],
      vz = p[c + 2] - p[a + 2];
    const dot =
      (uy * vz - uz * vy) * (n[a] + n[b] + n[c]) +
      (uz * vx - ux * vz) * (n[a + 1] + n[b + 1] + n[c + 1]) +
      (ux * vy - uy * vx) * (n[a + 2] + n[b + 2] + n[c + 2]);
    if (dot < -1e-12) [result[i + 1], result[i + 2]] = [result[i + 2], result[i + 1]];
  }
  return result;
}
