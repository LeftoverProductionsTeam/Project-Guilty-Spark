import type { MeshData, Vec3 } from './types';
export interface NativeSurfacePick {
  sourceHash: string;
  bspIndex: number;
  shaderTagId: number;
  triangle: number;
  point: Vec3;
}
/** Select only an attributed triangle of the displayed native BSP. Rebased
 * material spans retain their original BSP identity; selection grants no
 * writable compiled-map bytes or claim of recovered brush source. */
export function nativeSurfacePick(
  mesh: MeshData,
  sourceHash: string,
  triangle: number,
  point: Vec3,
): NativeSurfacePick | null {
  if (
    !/^[a-f0-9]{64}$/i.test(sourceHash) ||
    !Number.isSafeInteger(triangle) ||
    triangle < 0 ||
    triangle * 3 + 3 > mesh.indices.length ||
    point.length !== 3 ||
    !point.every((v) => Number.isFinite(v) && Math.abs(v) <= 1e6)
  )
    return null;
  const range = mesh.materialRanges?.find(
    (range) => triangle * 3 >= range.indexStart && triangle * 3 + 3 <= range.indexStart + range.indexCount,
  );
  if (
    !range ||
    !Number.isSafeInteger(range.bspIndex) ||
    range.bspIndex < 0 ||
    !Number.isSafeInteger(range.shaderTagId) ||
    range.shaderTagId < 0 ||
    range.shaderTagId > 0xffffffff
  )
    return null;
  return {
    sourceHash,
    bspIndex: range.bspIndex,
    shaderTagId: range.shaderTagId,
    triangle,
    point: [...point],
  };
}
