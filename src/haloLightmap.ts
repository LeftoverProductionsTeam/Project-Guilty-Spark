/** Evidence-led Halo 1 BSP lightmap coverage and local image attribution.
 * In Halo 1 a lightmap page index is local to a BSP, not global to a map.
 * Never silently share a texture between BSPs which both have page 0.
 * No cache data is changed; no game texture pixels are guessed or bundled.
 */
import type { MeshData } from './types';

export interface LightmapPageCoverage {
  key: string;
  bspIndex: number;
  page: number;
  materials: number;
  triangles: number;
  bspIndices: number[];
  withRealUvs: boolean;
}

export function lightmapPageKey(bspIndex: number, page: number): string {
  if (!Number.isSafeInteger(bspIndex) || bspIndex < 0 || bspIndex > 255 ||
      !Number.isSafeInteger(page) || page < 0 || page > 255) {
    throw new Error('Lightmap page and BSP must be bounded nonnegative integers');
  }
  return `bsp${bspIndex}:page${page}`;
}

/** Select a baked-lighting page for a single BSP material. This is not a
 * shader-effect renderer; it prevents unrelated BSP page assignments.
 */
export function materialLightmapKey(
  range: Pick<NonNullable<MeshData['materialRanges']>[number], 'bspIndex' | 'lightmapPage' | 'hasLightmapUvs'>,
  hasValidatedUvBuffer: boolean,
  assignedPages: Readonly<Record<string, unknown>>,
): string | null {
  if (!hasValidatedUvBuffer || range.hasLightmapUvs !== true) return null;
  try {
    const key = lightmapPageKey(range.bspIndex, range.lightmapPage ?? -1);
    return assignedPages[key] ? key : null;
  } catch { return null; }
}

export function inspectLightmapPages(mesh: MeshData | null): LightmapPageCoverage[] {
  if (!mesh?.materialRanges?.length) return [];
  const vertexCount = mesh.positions.length / 3;
  const hasCompleteBuffer = Number.isInteger(vertexCount) && !!mesh.lightmapUvs &&
    mesh.lightmapUvs.length === vertexCount * 2 &&
    mesh.lightmapUvs.every(n => Number.isFinite(n) && Math.abs(n) <= 32);
  const pages = new Map<string, { bspIndex: number; page: number; triangles: number; materials: number; valid: boolean }>();
  for (const range of mesh.materialRanges) {
    let key: string;
    try { key = lightmapPageKey(range.bspIndex, range.lightmapPage ?? -1); } catch { continue; }
    if (!Number.isSafeInteger(range.indexStart) || !Number.isSafeInteger(range.indexCount) ||
        range.indexStart < 0 || range.indexCount <= 0 || range.indexCount % 3 ||
        range.indexStart + range.indexCount > mesh.indices.length) continue;
    const item = pages.get(key) ?? {bspIndex: range.bspIndex, page: range.lightmapPage!, triangles: 0, materials: 0, valid: false};
    item.triangles += range.indexCount / 3;
    item.materials++;
    item.valid ||= hasCompleteBuffer && range.hasLightmapUvs === true;
    pages.set(key, item);
  }
  return [...pages.entries()].sort((a,b) => a[1].bspIndex - b[1].bspIndex || a[1].page - b[1].page)
    .map(([key, item]) => ({key, bspIndex: item.bspIndex, page: item.page, materials: item.materials,
      triangles: item.triangles, bspIndices: [item.bspIndex], withRealUvs: item.valid}));
}

export interface LocalLightmapFile { name: string; size?: number; }
export interface LocalLightmapMatch { key: string; bspIndex: number; page: number; fileIndex: number; filename: string; }

/** Image names MUST identify the page. Multi-BSP caches also need BSP in the
 * filename when a page number is repeated: bsp_1_page_0.png. If only one BSP
 * has page 0, a legacy page_0.png is unambiguous and continues to work.
 * Duplicate candidates for the same page are all rejected.
 */
export function matchLocalLightmapPages(pages: readonly LightmapPageCoverage[], files: readonly LocalLightmapFile[]): {
  assignments: LocalLightmapMatch[];
  skipped: {filename:string;reason:string}[];
} {
  if (files.length > 128 || files.reduce((sum, f) => sum + (f.size ?? 0), 0) > 256 * 1024 * 1024)
    throw new Error('Select at most 128 local lightmap images totaling 256 MiB');
  const eligible = new Map(pages.filter(p => p.withRealUvs).map(p => [p.key, p]));
  const byPage = new Map<number, LightmapPageCoverage[]>();
  for (const p of eligible.values()) byPage.set(p.page, [...(byPage.get(p.page) ?? []), p]);
  const requests = new Map<string, LocalLightmapMatch[]>();
  const skipped: {filename:string;reason:string}[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const name = file?.name ?? '';
    if (!Number.isFinite(file?.size ?? 0) || (file?.size ?? 0) < 0 || (file?.size ?? 0) > 96 * 1024 * 1024) {
      skipped.push({filename:name,reason:'Image size is invalid or exceeds 96 MiB'});continue;
    }
    const explicit = /^bsp[_-]?(\d{1,3})[_-](?:lightmap[_-]?(?:page[_-]?)?|page[_-]?)(\d{1,3})\.(?:dds|png|jpe?g|webp)$/i.exec(name);
    const legacy = explicit ? null : /^(?:lightmap[_-]?(?:page[_-]?)?|page[_-]?)(\d{1,3})\.(?:dds|png|jpe?g|webp)$/i.exec(name);
    if (!explicit && !legacy) {
      skipped.push({filename:name,reason:'Use bsp_0_page_3.png, or page_3.png if its BSP is unambiguous'});continue;
    }
    const page = Number(explicit ? explicit[2] : legacy![1]);
    let target: LightmapPageCoverage | undefined;
    if (explicit) target = eligible.get(`bsp${Number(explicit[1])}:page${page}`);
    else {
      const candidates = byPage.get(page) ?? [];
      if (candidates.length > 1) {
        skipped.push({filename:name,reason:`Page ${page} occurs in multiple BSPs; use bsp_N_page_${page}.png`});continue;
      }
      target = candidates[0];
    }
    if (!target) {
      skipped.push({filename:name,reason:'BSP/page not present with validated secondary UVs'});continue;
    }
    const item: LocalLightmapMatch = {key:target.key,bspIndex:target.bspIndex,page:target.page,fileIndex:i,filename:name};
    requests.set(item.key,[...(requests.get(item.key)??[]),item]);
  }
  const assignments: LocalLightmapMatch[] = [];
  for (const [key, items] of [...requests].sort(([a],[b])=>a.localeCompare(b))) {
    if (items.length !== 1) {
      for (const item of items) skipped.push({filename:item.filename,reason:`Ambiguous: ${items.length} images for ${key}`});
    } else assignments.push(items[0]);
  }
  return {assignments,skipped};
}
