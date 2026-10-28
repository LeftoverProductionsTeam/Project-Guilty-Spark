/** Read-only Halo CE cache material preview planner.
 *
 * A task is emitted ONLY for an exact source-cache tag identity. The renderer
 * can then ask the native, SHA-256-checked bounded batch reader to decode
 * exactly identified bitmap images from one preserved snapshot. This module does not read or redistribute game
 * pixels, infer texture names, or claim Halo shader/radiosity equivalence.
 *
 * H1 BSPs can share lightmap page indices. Page 0 in BSP A MUST NOT be assumed
 * to be image 0 of BSP B's lightmap bitmap tag.
 */
import type { MapInspection, MeshData } from './types';
import { buildMaterialAudit } from './materialAudit.ts';
import { inspectLightmapPages, lightmapPageKey } from './haloLightmap.ts';

export const MAX_OWNED_PREVIEWS_PER_CLICK = 24;

export type OwnedMaterialPreviewTask =
  | { kind: 'shader'; shaderTagId: number; bitmapTagId: number; imageIndex: 0; key: string }
  | { kind: 'lightmap'; bspIndex: number; page: number; bitmapTagId: number; imageIndex: number; key: string };

export interface OwnedMaterialPreviewPlan {
  shaderTasks: Extract<OwnedMaterialPreviewTask, {kind:'shader'}>[];
  lightmapTasks: Extract<OwnedMaterialPreviewTask, {kind:'lightmap'}>[];
  skipped: {key: string; reason: string}[];
  sourceSha256: string;
}

/** Caller must pass ALL BSP material ranges, not just the selected viewport BSP.
 * Previously assigned local textures take precedence over auto previews.
 */
export function planOwnedMaterialPreviews(
  inspection: Pick<MapInspection, 'sha256' | 'header' | 'tags'>,
  mesh: MeshData | null | undefined,
  assignedShaders: ReadonlySet<number> = new Set<number>(),
  assignedLightmaps: ReadonlySet<string> = new Set<string>(),
): OwnedMaterialPreviewPlan {
  if (!/^[a-f0-9]{64}$/i.test(inspection.sha256)) throw new Error('An inspected source SHA-256 is required');
  const result: OwnedMaterialPreviewPlan = {shaderTasks:[], lightmapTasks:[], skipped:[],sourceSha256:inspection.sha256};
  if (!mesh?.materialRanges?.length) return result;
  if (![6,7,13,609].includes(inspection.header.version)) {
    result.skipped.push({key:'runtime',reason:'Automatic classic cache previews are not supported by this runtime'});
    return result;
  }
  const tags = new Map(inspection.tags.map(tag => [tag.id, tag]));
  if (tags.size !== inspection.tags.length) throw new Error('Duplicate tag IDs cannot prove bitmap identity');
  const audit = buildMaterialAudit(inspection, mesh);
  for (const shader of audit.shaders) {
    const key = `shader:${shader.shaderTagId}`;
    if (assignedShaders.has(shader.shaderTagId)) continue;
    if (shader.status !== 'resolved' || shader.bitmapTagId === null) {
      result.skipped.push({key,reason:`Shader primary map ${shader.status}; no automatic guessing`});
      continue;
    }
    const bitmap = tags.get(shader.bitmapTagId);
    if (!bitmap || bitmap.class !== 'bitm' || bitmap.external || !Number.isSafeInteger(bitmap.id) || bitmap.id < 0) {
      result.skipped.push({key,reason:'Bitmap tag metadata is external or invalid'});
      continue;
    }
    result.shaderTasks.push({kind:'shader',shaderTagId:shader.shaderTagId,bitmapTagId:bitmap.id,imageIndex:0,key});
  }
  for (const page of inspectLightmapPages(mesh)) {
    if (!page.withRealUvs || assignedLightmaps.has(page.key)) continue;
    const section = mesh.materialRanges.filter(range =>
      range.bspIndex === page.bspIndex && range.lightmapPage === page.page && range.indexCount > 0);
    if (!section.length || section.some(range => range.hasLightmapUvs !== true)) {
      result.skipped.push({key:page.key,reason:'Incomplete secondary lightmap UV data'});
      continue;
    }
    const ids = new Set(section.map(range => range.lightmapBitmapTagId));
    if (ids.size !== 1) {
      result.skipped.push({key:page.key,reason:'BSP material sections disagree about their lightmap bitmap tag'});
      continue;
    }
    const id = section[0].lightmapBitmapTagId;
    const tag = id == null ? undefined : tags.get(id);
    if (!Number.isSafeInteger(id) || id! < 0 || id! > 0xffffffff || !tag || tag.class !== 'bitm' || tag.external) {
      result.skipped.push({key:page.key,reason:'No verified internal lightmap bitmap metadata for this BSP'});
      continue;
    }
    // Re-derive, don't trust a serialized key to address an image.
    const key = lightmapPageKey(page.bspIndex, page.page);
    result.lightmapTasks.push({kind:'lightmap',bspIndex:page.bspIndex,page:page.page,
      bitmapTagId:id!,imageIndex:page.page,key});
  }
  return result;
}
