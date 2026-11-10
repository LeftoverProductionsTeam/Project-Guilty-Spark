import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { call, native } from './api';
import { decodeOwnedBitmapBatch, uniqueBitmapTargets, MAX_NATIVE_BATCH_RGBA_BYTES } from './ownedBitmapBatch';
import type { OwnedBitmapBatchResponse } from './ownedBitmapBatch';
import { configureSourceTexture } from './sourceTexture';
import {readOwnedBitmapMipmaps} from './ownedBitmapMipmaps';
import { loadReflectionCube } from './ownedReflectionCube';
import { nativeShaderTextureRole } from './nativeShaderTextures';
import { textureResourceScope,bitmapResourceSha256 } from './textureResourceScope';
import type { OpenProject, NativeAssetImport, ShaderPreview } from './types';
import type { QuickForgeDocument } from './forge';
export interface WorkshopMaterialView {
  base: THREE.Texture;
  metadata?: ShaderPreview;
  extra: Record<string, THREE.Texture>;
}
const normalize = (path: string) => path.replaceAll('\\', '/').toLowerCase();
/** Resolve a private native material back to its exact original preview source. */
export function materialSourcePath(path: string, source: OpenProject, bindings: NativeAssetImport[]) {
  const binding = bindings.find(
    (b) =>
      b.tagClass === 'senv' &&
      normalize(b.nativePath) === normalize(path) &&
      b.sourceProjectId === source.project.id &&
      b.sourceSha256 === source.inspection?.sha256,
  );
  return binding?.tagPath ?? path;
}
/** Uses the same exact native pixels, metadata and reflection reader as map models. */
export function useWorkshopTextures(
  doc: QuickForgeDocument,
  source?: OpenProject | null,
  bindings: NativeAssetImport[] = [],
) {
  const [textures, setTextures] = useState<Record<string, THREE.Texture>>({}),
    [views, setViews] = useState<Record<string, WorkshopMaterialView>>({}),
    [status, setStatus] = useState('Connect an owned source map for native material previews');
  const key = JSON.stringify([
    source?.project.id,
    source?.inspection?.sha256,
    textureResourceScope(source?.project.source),
    doc.materials.map((m) => [m.id, m.shaderPath]),
    bindings,
  ]);
  useEffect(() => {
    let alive = true;
    const owned: THREE.Texture[] = [];
    setTextures({});
    setViews({});
    const inspection = source?.inspection;
    if (!native || !source || !inspection) {
      setStatus('Connect an owned source map for native material previews');
      return;
    }
    const materials = doc.materials.flatMap((material) => {
      const path = material.shaderPath && materialSourcePath(material.shaderPath, source, bindings);
      const tag =
        path && inspection.tags.find((t) => t.class === 'senv' && normalize(t.path) === normalize(path));
      return tag && tag.primaryBitmapStatus === 'resolved' ? [{ material: material.id, tag }] : [];
    });
    if (!materials.length) {
      setStatus('No exact shader images in the selected source map');
      return;
    }
    setStatus('Loading original Halo material textures…');
    void (async () => {
      try {
        const tasks = materials.flatMap(({ material, tag }) =>
          tag.references.flatMap((reference) => {
            const role = nativeShaderTextureRole(reference.label);
            return role ? [{ material, role, bitmapTagId: reference.targetId, imageIndex: 0 }] : [];
          }),
        );
        const resource =
          bitmapResourceSha256(source.project.source);
        const requests = uniqueBitmapTargets(tasks, inspection.sha256, resource),
          pool = new Map<number, THREE.Texture>();
        let bytes = 0;const mipWarnings:string[]=[];
        for (let offset = 0; offset < requests.length; offset += 24) {
          const wanted = requests.slice(offset, offset + 24);
          const response = await call<OwnedBitmapBatchResponse>('preview_owned_cache_bitmap_batch', {
            projectId: source.project.id,
            requests: wanted.map((r) => ({ bitmapTagId: r.bitmapTagId, imageIndex: 0 })),
          });
          if (!alive) return;
          const images=await readOwnedBitmapMipmaps(source.project.id,wanted,decodeOwnedBitmapBatch(response,wanted),()=>alive);
          if(!alive)return;
          for (const image of images.values()) {
            if (!image.image) continue;
            const raw = image.image;
            bytes += (image.originalMipmaps??[raw]).reduce((n,m)=>n+m.pixels.byteLength,0);
            if(image.mipError)mipWarnings.push(image.mipError);
            if (bytes > MAX_NATIVE_BATCH_RGBA_BYTES)
              throw Error('Workshop textures exceed the 64 MiB preview budget');
            const texture = configureSourceTexture(
              new THREE.DataTexture(raw.pixels, raw.width, raw.height, THREE.RGBAFormat),
              'shader',image.originalMipmaps??[raw],
            );
            owned.push(texture);
            pool.set(image.bitmapTagId, texture);
          }
        }
        const result: Record<string, WorkshopMaterialView> = {},
          base: Record<string, THREE.Texture> = {},
          cubePool = new Map<number, THREE.CubeTexture>(),
          warnings: string[] = [...new Set(mipWarnings)];
        for (const { material, tag } of materials) {
          const baseId = tasks.find((t) => t.material === material && t.role === 'base')?.bitmapTagId;
          const texture = baseId === undefined ? null : pool.get(baseId);
          if (!texture) continue;
          const view: WorkshopMaterialView = {
            base: texture,
            metadata: tag.shaderPreview ?? undefined,
            extra: {},
          };
          for (const task of tasks.filter((t) => t.material === material && t.role !== 'base')) {
            const detail = pool.get(task.bitmapTagId);
            if (detail) view.extra[task.role] = detail;
          }
          const reflection = tag.shaderPreview?.reflection;
          if (reflection) {
            try {
              let cube = cubePool.get(reflection.bitmapTagId);
              if (!cube) {
                cube = await loadReflectionCube(
                  source.project.id,
                  inspection.sha256,
                  reflection.bitmapTagId,
                  source.project.source?.resourceSha256 ?? {},
                );
                if (!alive) {
                  cube.dispose();
                  return;
                }
                bytes += cube.userData.rgbaBytes as number;
                if (bytes > MAX_NATIVE_BATCH_RGBA_BYTES) {
                  cube.dispose();
                  throw Error('Workshop reflections exceed the preview budget');
                }
                owned.push(cube);
                cubePool.set(reflection.bitmapTagId, cube);
              }
              view.extra.reflectionCube = cube;
            } catch (error) {
              warnings.push(String(error));
            }
          }
          base[material] = texture;
          result[material] = view;
        }
        if (alive) {
          setTextures(base);
          setViews(result);
          setStatus(
            `${Object.keys(result).length} exact native material previews${warnings.length ? ' · some reflections unavailable' : ''}`,
          );
        }
      } catch (error) {
        if (alive) setStatus('Native material preview refused: ' + String(error));
      }
    })();
    return () => {
      alive = false;
      owned.forEach((texture) => texture.dispose());
    };
  }, [key]);
  return { textures, views, status };
}
