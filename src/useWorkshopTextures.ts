import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { call, native } from './api';
import { decodeOwnedBitmapBatch, uniqueBitmapTargets, MAX_NATIVE_BATCH_RGBA_BYTES } from './ownedBitmapBatch';
import type { OwnedBitmapBatchResponse } from './ownedBitmapBatch';
import { configureSourceTexture } from './sourceTexture';
import type { OpenProject } from './types';
import type { QuickForgeDocument } from './forge';
const normalize = (p: string) => p.replaceAll('\\', '/').toLowerCase();
/** Only exact cached shader paths and provenance-checked images. No borrowed bitmap by basename. */
export function useWorkshopTextures(doc: QuickForgeDocument, source?: OpenProject | null) {
  const [textures, setTextures] = useState<Record<string, THREE.Texture>>({});
  const [status, setStatus] = useState(
    'Material colors · connect an imported source map for texture previews',
  );
  const key = JSON.stringify([
    source?.project.id,
    source?.inspection?.sha256,
    source?.project.source?.resourceSha256,
    doc.materials.map((m) => [m.id, m.shaderPath]),
  ]);
  useEffect(() => {
    let alive = true;
    const owned: THREE.Texture[] = [];
    setTextures({});
    const inspection = source?.inspection;
    if (!native || !inspection || !source) {
      setStatus('Material colors · connect an imported source map for texture previews');
      return;
    }
    const tasks = doc.materials.flatMap((m) => {
      const tag =
        m.shaderPath &&
        inspection.tags.find((t) => t.class === 'senv' && normalize(t.path) === normalize(m.shaderPath!));
      const bitmap =
        tag &&
        tag.primaryBitmapStatus === 'resolved' &&
        tag.references.find((r) => r.label === 'Base map' || r.label === 'Diffuse map');
      return bitmap ? [{ material: m.id, bitmapTagId: bitmap.targetId, imageIndex: 0 }] : [];
    });
    if (!tasks.length) {
      setStatus('Material colors · no exact shader images in the selected source map');
      return;
    }
    void (async () => {
      try {
        const requests = uniqueBitmapTargets(
            tasks,
            inspection.sha256,
            source.project.source?.resourceSha256?.['bitmaps.map'] ?? null,
          ),
          response = await call<OwnedBitmapBatchResponse>('preview_owned_cache_bitmap_batch', {
            projectId: source.project.id,
            requests: requests.map((r) => ({ bitmapTagId: r.bitmapTagId, imageIndex: r.imageIndex })),
          });
        if (!alive) return;
        const images = decodeOwnedBitmapBatch(response, requests),
          result: Record<string, THREE.Texture> = {};
        let bytes = 0;
        for (const r of requests) {
          const image = images.get(`${r.bitmapTagId}:0`)?.image;
          if (!image) continue;
          bytes += Math.ceil((image.pixels.byteLength * 4) / 3);
          if (bytes > MAX_NATIVE_BATCH_RGBA_BYTES) throw Error('Workshop texture preview exceeds 64 MiB');
          const texture = configureSourceTexture(
            new THREE.DataTexture(image.pixels, image.width, image.height, THREE.RGBAFormat),
            'shader',
          );
          owned.push(texture);
          for (const task of tasks.filter((t) => t.bitmapTagId === r.bitmapTagId))
            result[task.material] = texture;
        }
        if (alive) {
          setTextures(result);
          setStatus(
            `${Object.keys(result).length} exact source material textures · lighting remains an editor preview`,
          );
        }
      } catch (e) {
        if (alive) setStatus(`Material colors · texture preview refused: ${String(e)}`);
      }
    })();
    return () => {
      alive = false;
      owned.forEach((t) => t.dispose());
    };
  }, [key]);
  return { textures, status };
}
