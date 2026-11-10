import { call } from './api';
import type { MapInspection, OpenProject, Project, RuntimeId } from './types';
import { bitmapImageKey, decodeOwnedBitmapBatch } from './ownedBitmapBatch';
import type { OwnedBitmapBatchResponse, VerifiedBatchImage } from './ownedBitmapBatch';
import type { OwnedBitmapTarget } from './ownedBitmapPreview';
import type { ForgeMaterial } from './forge';
import { publishTextureResources,bitmapResourceSha256 } from './textureResourceScope';
import type { MapTextureSource } from './sourceIdentity';
import {assertMapSourceIdentity,mapSourceIdentityKey} from './sourceIdentity';
export { withPreviewDefaults } from './forgeDefaultMaterials';

const sources = new Map<RuntimeId, Promise<OpenProject>>();
const mapSources = new Map<string, Promise<MapTextureSource>>();
let runtimeSourceEpoch=0;
export function invalidateRuntimeTextureSources() {
  runtimeSourceEpoch++;
  sources.clear();
  mapSources.clear();
}
if(typeof window!=='undefined')window.addEventListener('guilty-spark-runtime-connections-changed',invalidateRuntimeTextureSources);
function mapTextureSource(project: Project, inspection: MapInspection): Promise<MapTextureSource> {
  const key=mapSourceIdentityKey(project);
  let pending=mapSources.get(key);
  if(!pending){
    const epoch=runtimeSourceEpoch;
    pending=call<MapTextureSource>('map_texture_source',{projectId:project.id,sourceSha256:inspection.sha256}).then(result=>{
      const identity=result.identity;
      if(epoch!==runtimeSourceEpoch)throw Error('Runtime installations changed during resource discovery');
      assertMapSourceIdentity(identity,project,inspection);
      publishTextureResources(result.open.project);
      return result;
    }).catch(error=>{if(mapSources.get(key)===pending)mapSources.delete(key);throw error;});
    mapSources.set(key,pending);
    // Retention is bounded per source/resource identity, not per hosting choice.
    while(mapSources.size>16)mapSources.delete(mapSources.keys().next().value!);
  }
  return pending;
}
export function runtimeTextureSource(runtimeId: RuntimeId): Promise<OpenProject> {
  let pending = sources.get(runtimeId);
  if (!pending) {
    const epoch=runtimeSourceEpoch;
    pending = call<OpenProject>('runtime_texture_source', { runtimeId })
      .then((open) => {
        if(epoch!==runtimeSourceEpoch)throw Error('Runtime installations changed during material discovery');
        publishTextureResources(open.project);
        return open;
      })
      .catch((error) => {
        if(sources.get(runtimeId)===pending)sources.delete(runtimeId);
        throw error;
      });
    sources.set(runtimeId, pending);
  }
  return pending;
}
export function defaultPreviewMaterials(open: OpenProject): ForgeMaterial[] {
  const choices = [
    ['surface', 'halo_metal', 'levels/test/bloodgulch/shaders/cap_metal', [0.35, 0.4, 0.42]],
    ['grass', 'halo_grass', 'levels/test/bloodgulch/shaders/blood ground', [0.3, 0.42, 0.23]],
  ] as const;
  return choices.flatMap(([id, name, path, color]) =>
    open.inspection?.tags.some((t) => t.class === 'senv' && normalized(t.path) === path)
      ? [{ id, name, shaderPath: path, color: [...color] } as ForgeMaterial]
      : [],
  );
}
interface Match {
  sourceBitmapTagId: number;
  bitmapTagId: number;
  imageIndex: number;
  width: number;
  height: number;
  format: string;
}
const normalized = (p: string) => p.replaceAll('\\', '/').toLowerCase();
/** Add only independently verified runtime previews for unavailable external
 * pixels. Never rewrite source IDs/pins, replace an embedded image, or bind
 * compatibility pixels as extraction/compiler resources. */
export async function fillRuntimeTexturePreviews(
  project: Project,
  inspection: MapInspection,
  targets: OwnedBitmapTarget[],
  decoded: Map<string, VerifiedBatchImage>,
): Promise<Map<string, VerifiedBatchImage>> {
  if (!project.source||project.source.sha256!==inspection.sha256||project.source.cacheVersion!==inspection.header.version||
      ![6, 7, 609].includes(inspection.header.version)) return decoded;
  const missing = targets.filter((t) => {
    const item = decoded.get(bitmapImageKey(t.bitmapTagId, t.imageIndex ?? 0));
    return (
      !item?.image &&
      ['missing-resource', 'resource-mismatch', 'resource-unavailable'].includes(item?.errorCode ?? '')
    );
  });
  if (!missing.length||missing.some(target=>target.sourceSha256!==inspection.sha256)) return decoded;
  // Old projects can have a partial stock pack pinned while another preserved
  // variant holds the real original pack. Same SHA means the exact tag IDs and
  // bitmap metadata agree. Each candidate's native batch still verifies all
  // source/resource bytes and per-image spans; compiler pins remain unchanged.
  try {
    const alternatives=await call<{projectId:string;sourceSha256:string;resourceSha256:string}[]>('original_bitmap_preview_sources',{projectId:project.id,sourceSha256:inspection.sha256});
    if(!Array.isArray(alternatives)||alternatives.length>6)throw Error('Unbounded original resource alternatives');
    for(const candidate of alternatives){
      if(candidate.projectId===project.id||candidate.sourceSha256!==inspection.sha256||!/^[a-f0-9]{64}$/i.test(candidate.resourceSha256))throw Error('Original resource candidate identity differs');
      const wanted=missing.filter(t=>!decoded.get(bitmapImageKey(t.bitmapTagId,t.imageIndex??0))?.image);
      if(!wanted.length)break;
      const targets=wanted.map(t=>({...t,resourceSha256:candidate.resourceSha256}));
      const response=await call<OwnedBitmapBatchResponse>('preview_owned_cache_bitmap_batch',{projectId:candidate.projectId,requests:targets.map(t=>({bitmapTagId:t.bitmapTagId,imageIndex:t.imageIndex??0}))});
      const recovered=decodeOwnedBitmapBatch(response,targets),next=new Map(decoded);
      for(const [key,item] of recovered)if(item.image)next.set(key,{...item,recoveredResourceProjectId:candidate.projectId});
      decoded=next;
    }
    if(missing.every(t=>decoded.get(bitmapImageKey(t.bitmapTagId,t.imageIndex??0))?.image))return decoded;
  }catch{/* Missing recovery candidates leave the explicit runtime preview path available. */}
  // Original recovery can be partial. Never include its successful pixels in
  // a later substitution request or replace them with compatible runtime data.
  const unresolved=missing.filter(target=>!decoded.get(bitmapImageKey(target.bitmapTagId,target.imageIndex??0))?.image);
  if(!unresolved.length)return decoded;
  try {
    const {open,runtimeId} = await mapTextureSource(project,inspection);
    if (!open.inspection || open.inspection.sha256 === inspection.sha256) return decoded;
    const matches = await call<Match[]>('compatible_bitmap_targets', {
      projectId: project.id,
      runtimeProjectId: open.project.id,
      requests: unresolved.map((t) => ({ bitmapTagId: t.bitmapTagId, imageIndex: t.imageIndex ?? 0 })),
    });
    if (!Array.isArray(matches) || matches.length > unresolved.length)
      throw Error('Unbounded compatibility mapping');
    const seen = new Set<string>();
    for (const m of matches) {
      const key = bitmapImageKey(m.sourceBitmapTagId, m.imageIndex);
      const a = inspection.tags.find((t) => t.id === m.sourceBitmapTagId && t.class === 'bitm'),
        b = open.inspection.tags.find((t) => t.id === m.bitmapTagId && t.class === 'bitm');
      if (
        seen.has(key) ||
        !unresolved.some((t) => t.bitmapTagId === m.sourceBitmapTagId && (t.imageIndex ?? 0) === m.imageIndex) ||
        !a ||
        !b ||
        normalized(a.path) !== normalized(b.path)
      )
        throw Error('Unsolicited compatibility mapping');
      seen.add(key);
    }
    if (!matches.length) return decoded;
    const resource = bitmapResourceSha256(open.project.source);
    const requests = [
      ...new Map(
        matches.map((m) => [
          bitmapImageKey(m.bitmapTagId, m.imageIndex),
          {
            bitmapTagId: m.bitmapTagId,
            imageIndex: m.imageIndex,
            sourceSha256: open.inspection!.sha256,
            resourceSha256: resource,
          },
        ]),
      ).values(),
    ];
    const response = await call<OwnedBitmapBatchResponse>('preview_owned_cache_bitmap_batch', {
      projectId: open.project.id,
      requests: requests.map(({ bitmapTagId, imageIndex }) => ({ bitmapTagId, imageIndex })),
    });
    const verified = decodeOwnedBitmapBatch(response, requests),
      result = new Map(decoded);
    for (const m of matches) {
      const item = verified.get(bitmapImageKey(m.bitmapTagId, m.imageIndex));
      const preview = response.items.find(
        (p) => p.bitmapTagId === m.bitmapTagId && p.imageIndex === m.imageIndex,
      )?.preview;
      if (
        !item?.image ||
        item.image.width !== m.width ||
        item.image.height !== m.height ||
        preview?.format !== m.format
      )
        continue;
      result.set(bitmapImageKey(m.sourceBitmapTagId, m.imageIndex), {
        ...item,
        bitmapTagId: m.sourceBitmapTagId,
        compatibleRuntime: runtimeId,
        compatibleSourceSha256: open.inspection.sha256,
        compatibleBitmapTagId: m.bitmapTagId,
      });
    }
    return result;
  } catch {
    return decoded;
  }
}
