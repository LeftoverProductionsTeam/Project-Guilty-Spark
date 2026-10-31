import { useEffect, useMemo, useRef, useState } from 'react';
import type * as THREE from 'three';
import type { MapInspection, Project } from './types';
import { loadReflectionCube } from './ownedReflectionCube';
import { extraTextureKey } from './haloMaterial';
import { textureResourceScope } from './textureResourceScope';
export function useReflectionTextures(
  project: Project,
  inspection: MapInspection | null,
  baseTextures: Record<number, THREE.Texture>,
) {
  type Session = {
    alive: boolean;
    scope: string;
    bytes: number;
    queue: Promise<void>;
    attempted: Set<number>;
    cubes: Map<number, THREE.CubeTexture>;
    errors: Map<number, string>;
  };
  const session = useRef<Session | null>(null);
  const [preview, setPreview] = useState<{
    scope: string;
    cubes: Record<number, THREE.CubeTexture>;
    errors: Record<number, string>;
  }>({ scope: '', cubes: {}, errors: {} });
  const shaders =
    inspection?.tags.filter((tag) => tag.shaderPreview?.reflection && baseTextures[tag.id]) ?? [];
  const scope = JSON.stringify([project.id, inspection?.sha256, textureResourceScope(project.source)]);
  const bitmapIds = [...new Set(shaders.map((tag) => tag.shaderPreview!.reflection!.bitmapTagId))];
  const targets = bitmapIds.join(',');
  useEffect(() => {
    const current: Session = {
      alive: true,
      scope,
      bytes: 0,
      queue: Promise.resolve(),
      attempted: new Set(),
      cubes: new Map(),
      errors: new Map(),
    };
    session.current = current;
    setPreview({ scope, cubes: {}, errors: {} });
    return () => {
      current.alive = false;
      current.cubes.forEach((texture) => texture.dispose());
    };
  }, [scope]);
  useEffect(() => {
    const current = session.current;
    if (!current || current.scope !== scope) return;
    for (const id of bitmapIds) {
      // Both failures and successes are shared by shaders for this resource
      // epoch. Changing pins/source starts a fresh epoch and retries failures.
      if (current.attempted.has(id)) continue;
      current.attempted.add(id);
      current.queue = current.queue.then(async () => {
        if (!current.alive) return;
        try {
          if (current.cubes.size >= 16)
            throw Error(
              'Sixteen reflection cubes are loaded; remaining cubes exceed the active preview budget.',
            );
          const cube = await loadReflectionCube(
            project.id,
            inspection!.sha256,
            id,
            project.source?.resourceSha256 ?? {},
          );
          if (!current.alive) {
            cube.dispose();
            return;
          }
          const bytes = cube.userData.rgbaBytes as number;
          if (current.bytes + bytes > 64 * 1024 * 1024) {
            cube.dispose();
            throw Error('Reflection cubes exceed the 64 MiB preview budget.');
          }
          current.bytes += bytes;
          current.cubes.set(id, cube);
        } catch (error) {
          current.errors.set(id, String(error));
        }
        if (current.alive)
          setPreview({
            scope,
            cubes: Object.fromEntries(current.cubes),
            errors: Object.fromEntries(current.errors),
          });
      });
    }
  }, [scope, targets]);
  const shaderIds = shaders.map((tag) => tag.id).join(',');
  return useMemo(() => {
    const textures: Record<string, THREE.Texture> = {},
      issues: string[] = [];
    if (preview.scope === scope)
      for (const tag of shaders) {
        const id = tag.shaderPreview!.reflection!.bitmapTagId;
        if (preview.cubes[id]) textures[extraTextureKey(tag.id, 'reflectionCube')] = preview.cubes[id];
        if (preview.errors[id]) issues.push(`${tag.path}: ${preview.errors[id]}`);
      }
    return { textures, issues };
  }, [preview, scope, shaderIds]);
}
