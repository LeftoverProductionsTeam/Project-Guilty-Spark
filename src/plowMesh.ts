import type { MeshData, Vec3 } from './types';

export const plowProfiles = ['moldboard', 'box-plow', 'rounded', 'v'] as const;
export type PlowProfile = typeof plowProfiles[number];

export interface VehicleMount {
  sourceSha256: string;
  vehicleTagId: number;
  vehiclePath: string;
  position: Vec3;
}

export interface ShapeDraft {
  id: string;
  shape: 'plow' | 'box' | 'wedge';
  dimensions: Vec3;
  profile: PlowProfile;
  curl: number;
  sweep: number;
  paintPng: string;
  vehicleMount?: VehicleMount;
}

export function plowMesh([depth, width, height]: Vec3, scoop: number, wrap: number, profile: PlowProfile,
  detail: 'render' | 'collision' = 'render'): MeshData {
  // A straight blade is constant across its width. One collision column
  // keeps its exact profile without introducing seams at the hull join.
  const box = profile === 'box-plow';
  const columns = detail === 'render' ? 16 : wrap === 0 ? 1 : box ? 4 : 8;
  const rows = detail === 'collision' ? 4 : box ? 24 : 12;
  const mesh: MeshData = { positions: [], indices: [], uvs: [], label: 'Plow blade', source: 'Spark shape' };
  const rake = Math.min(depth, height * 0.7);
  const scoopDepth = height * 0.65 * scoop / 100;
  // Use a circular section for the road blade. Limit the sagitta to keep
  // the lip short of vertical and the thickness faces well defined.
  const halfHeight = height / 2;
  const sagitta = height * 0.38 * scoop / 100;
  const radius = sagitta > 0 ? (halfHeight ** 2 + sagitta ** 2) / (2 * sagitta) : 0;
  const wingDepth = width * 0.33 * wrap / 100;
  const position = (side: number, across: number, up: number): Vec3 => {
    const center = 2 * across - 1;
    const wing = profile === 'v' ? Math.abs(center) : center * center;
    const z = height * (up - 0.5);
    const arc = sagitta > 0
      ? (halfHeight ** 2 - z ** 2) / (Math.sqrt(radius ** 2 - z ** 2) + radius - sagitta)
      : 0;
    if (box) {
      // The straight center retains its circular section. The outer quarters
      // turn forward, reaching farther at the cutting edge than at the top.
      const returnWing = Math.max(0, 2 * Math.abs(center) - 1);
      return [side * depth / 2 - arc + wingDepth * returnWing * (1 - 0.5 * up),
        width * (across - 0.5), height * up];
    }
    const recess = profile === 'moldboard' ? arc : 4 * scoopDepth * up * (1 - up);
    return [side * depth / 2 + rake * up - recess - wingDepth * wing,
      width * (across - 0.5), height * up];
  };
  // Separate UV islands for the front, back and edges. Step counts match on
  // their shared boundaries, so welding by position gives a closed solid.
  function surface(tile: number, uSteps: number, vSteps: number, reversed: boolean,
    sample: (u: number, v: number) => Vec3) {
    const stride = uSteps + 1;
    const first = mesh.positions.length / 3;
    for (let j = 0; j <= vSteps; j++) {
      for (let i = 0; i <= uSteps; i++) {
        const u = i / uSteps, v = j / vSteps;
        mesh.positions.push(...sample(u, v));
        mesh.uvs!.push((tile % 3 + 0.04 + u * 0.92) / 3, (Math.floor(tile / 3) + 0.04 + v * 0.92) / 2);
        if (i === uSteps || j === vSteps) continue;
        const a = first + j * stride + i;
        const b = a + 1, c = a + stride, d = c + 1;
        mesh.indices.push(...(reversed ? [a, c, b, b, c, d] : [a, b, c, b, d, c]));
      }
    }
  }
  surface(0, columns, rows, false, (u, v) => position(1, u, v));
  surface(1, columns, rows, true, (u, v) => position(-1, u, v));
  surface(2, columns, 1, true, (u, v) => position(2 * v - 1, u, 1));
  surface(3, columns, 1, false, (u, v) => position(2 * v - 1, u, 0));
  surface(4, 1, rows, false, (u, v) => position(2 * u - 1, 0, v));
  surface(5, 1, rows, true, (u, v) => position(2 * u - 1, 1, v));
  mesh.parts = [{ name: 'plow_steel', indexStart: 0, indexCount: mesh.indices.length }];
  return mesh;
}
