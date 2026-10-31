import { useEffect, useState } from 'react';
import type * as THREE from 'three';
import type { MapInspection, Project } from './types';
import { loadReflectionCube } from './ownedReflectionCube';
import { extraTextureKey } from './haloMaterial';
export function useReflectionTextures(
  project: Project,
  inspection: MapInspection | null,
  baseTextures: Record<number, THREE.Texture>,
) {
  const [textures, setTextures] = useState<Record<string, THREE.Texture>>({}),
    [issues, setIssues] = useState<string[]>([]);
  const shaders =
    inspection?.tags.filter((tag) => tag.shaderPreview?.reflection && baseTextures[tag.id]) ?? [];
  const scope = JSON.stringify([
    project.id,
    inspection?.sha256,
    project.source?.resourceSha256,
    shaders.map((tag) => tag.id),
  ]);
  useEffect(() => {
    let alive = true,
      bytes = 0;
    const pool = new Map<number, THREE.CubeTexture>(),
      loaded: Record<string, THREE.Texture> = {},
      failures: string[] = [];
    setTextures({});
    setIssues([]);
    void (async () => {
      for (const tag of shaders) {
        if (!alive) return;
        const id = tag.shaderPreview!.reflection!.bitmapTagId;
        try {
          if (!pool.has(id)) {
            if (pool.size >= 8)
              throw Error(
                'Eight reflection cubes are loaded; remaining cubes exceed the active preview budget.',
              );
            const cube = await loadReflectionCube(
              project.id,
              inspection!.sha256,
              id,
              project.source?.resourceSha256 ?? {},
            );
            if (!alive) {
              cube.dispose();
              return;
            }
            bytes += cube.userData.rgbaBytes as number;
            if (bytes > 64 * 1024 * 1024) {
              cube.dispose();
              throw Error('Reflection cubes exceed the 64 MiB preview budget.');
            }
            pool.set(id, cube);
          }
          loaded[extraTextureKey(tag.id, 'reflectionCube')] = pool.get(id)!;
          if (alive) setTextures({ ...loaded });
        } catch (error) {
          failures.push(`${tag.path}: ${String(error)}`);
          if (alive) setIssues([...failures]);
        }
      }
    })();
    return () => {
      alive = false;
      pool.forEach((texture) => texture.dispose());
    };
  }, [scope]);
  return { textures, issues };
}
