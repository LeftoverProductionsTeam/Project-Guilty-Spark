import { call } from './api';
import { readMapSession } from './mapSession';
import type { MapInspection, OpenProject, Project, RuntimeId } from './types';
import { bitmapImageKey, decodeOwnedBitmapBatch } from './ownedBitmapBatch';
import type { OwnedBitmapBatchResponse, VerifiedBatchImage } from './ownedBitmapBatch';
import type { OwnedBitmapTarget } from './ownedBitmapPreview';
import type { ForgeMaterial } from './forge';
import { publishTextureResources } from './textureResourceScope';

const sources = new Map<RuntimeId, Promise<OpenProject>>();
export function runtimeTextureSource(runtimeId: RuntimeId): Promise<OpenProject> {
  let pending = sources.get(runtimeId);
  if (!pending) {
    pending = call<OpenProject>('runtime_texture_source', { runtimeId })
      .then((open) => {
        publishTextureResources(open.project);
        return open;
      })
      .catch((error) => {
        sources.delete(runtimeId);
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
  if (![6, 7, 609].includes(inspection.header.version)) return decoded;
  const missing = targets.filter((t) => {
    const item = decoded.get(bitmapImageKey(t.bitmapTagId, t.imageIndex ?? 0));
    return (
      !item?.image &&
      ['missing-resource', 'resource-mismatch', 'resource-unavailable'].includes(item?.errorCode ?? '')
    );
  });
  if (!missing.length) return decoded;
  const runtimeId = readMapSession<RuntimeId>(project.id, 'hosting.runtime', 'mccSteam');
  try {
    const open = await runtimeTextureSource(runtimeId);
    if (!open.inspection || open.inspection.sha256 === inspection.sha256) return decoded;
    const matches = await call<Match[]>('compatible_bitmap_targets', {
      projectId: project.id,
      runtimeProjectId: open.project.id,
      requests: missing.map((t) => ({ bitmapTagId: t.bitmapTagId, imageIndex: t.imageIndex ?? 0 })),
    });
    if (!Array.isArray(matches) || matches.length > missing.length)
      throw Error('Unbounded compatibility mapping');
    const seen = new Set<string>();
    for (const m of matches) {
      const key = bitmapImageKey(m.sourceBitmapTagId, m.imageIndex);
      const a = inspection.tags.find((t) => t.id === m.sourceBitmapTagId && t.class === 'bitm'),
        b = open.inspection.tags.find((t) => t.id === m.bitmapTagId && t.class === 'bitm');
      if (
        seen.has(key) ||
        !missing.some((t) => t.bitmapTagId === m.sourceBitmapTagId && (t.imageIndex ?? 0) === m.imageIndex) ||
        !a ||
        !b ||
        normalized(a.path) !== normalized(b.path)
      )
        throw Error('Unsolicited compatibility mapping');
      seen.add(key);
    }
    if (!matches.length) return decoded;
    const pins = open.project.source?.resourceSha256 ?? {};
    const resource = pins['mcc-textures'] ?? pins['bitmaps.map'] ?? null;
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
