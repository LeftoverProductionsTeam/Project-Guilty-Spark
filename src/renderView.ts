import type { MapInspection, MeshData } from './types';

export type ViewMode = 'render' | 'smooth' | 'solid' | 'wireframe' | 'collision' | 'materials';

/** Pick only real imported mesh data. Never produce geometry from a placeholder. */
export function resolveBspMesh(
  inspection: MapInspection | null,
  mode: ViewMode,
  bspIndex: number,
): MeshData | null {
  if (!inspection) return null;
  const render = inspection.renderMesh?.indices.length ? inspection.renderMesh : null;
  const original = mode === 'collision' ? inspection.mesh : render ?? inspection.mesh;
  if (!original.indices.length || !original.positions.length) return null;
  if (bspIndex < 0 || !original.parts?.length) return original;
  const part = original.parts[bspIndex];
  if (!part) return original;
  const start = part.indexStart;
  const end = start + part.indexCount;
  if (start < 0 || end > original.indices.length || !Number.isInteger(start) || !Number.isInteger(end)) {
    return original;
  }
  // Preserve the provenance of shader/material ranges while rebasing them
  // into the selected BSP's local index array. Raw material data is never
  // reinterpreted as a texture or used to invent missing render geometry.
  const materialRanges = original.materialRanges?.flatMap((m) => {
    const from = Math.max(m.indexStart, start);
    const to = Math.min(m.indexStart + m.indexCount, end);
    return to > from ? [{ ...m, indexStart: from - start, indexCount: to - from }] : [];
  });
  return { ...original, indices: original.indices.slice(start, end), materialRanges };
}

/** One project object, one actual asset; caller renders a diagnostic marker if unresolved. */
export function resolveObjectMesh(
  inspection: MapInspection | null,
  tagId: number | null,
  assetId: string | null,
  assets: Record<string, MeshData>,
): MeshData | undefined {
  if (assetId) return assets[assetId];
  if (tagId === null) return undefined;
  return inspection?.modelMeshes?.[String(tagId)];
}

export function hasRenderGeometry(inspection: MapInspection | null): boolean {
  return Boolean(inspection?.renderMesh?.indices.length && inspection.renderMesh.positions.length);
}

/** Debug-only colors keyed by actual shader datum IDs; not imported bitmap colors. */
const shaderDebugColors = [
  '#719bb8', '#ca9a73', '#8bbf9e', '#c4b57f', '#ae91c4',
  '#7ab8b3', '#c5858d', '#9baa72', '#6fa9ce', '#d3a27b',
  '#b1b6c6', '#89aa89', '#d1b18a', '#8b9ec7', '#acb799',
];
export function shaderDebugColor(tagId: number): string {
  const hash = Math.imul(tagId ^ (tagId >>> 16), 0x45d9f3b) >>> 0;
  return shaderDebugColors[hash % shaderDebugColors.length];
}
export function shaderForTriangle(mesh: MeshData, faceIndex: number): number | null {
  if (!Number.isSafeInteger(faceIndex) || faceIndex < 0) return null;
  const indexOffset = faceIndex * 3;
  const range = mesh.materialRanges?.find(
    (r) => indexOffset >= r.indexStart && indexOffset + 3 <= r.indexStart + r.indexCount,
  );
  return range?.shaderTagId ?? null;
}
export function shaderLegend(mesh: MeshData | null): { tagId: number; color: string; triangles: number }[] {
  if (!mesh?.materialRanges?.length) return [];
  const counts = new Map<number, number>();
  for (const range of mesh.materialRanges) {
    if (!Number.isSafeInteger(range.shaderTagId) || range.indexCount < 0 || range.indexStart < 0) continue;
    counts.set(range.shaderTagId, (counts.get(range.shaderTagId) ?? 0) + range.indexCount / 3);
  }
  return [...counts].map(([tagId, triangles]) => ({ tagId, triangles, color: shaderDebugColor(tagId) }));
}
