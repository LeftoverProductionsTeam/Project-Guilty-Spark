import { useEffect, useMemo, useRef, useState } from 'react';
import type * as THREE from 'three';
import type { MapInspection, Project } from './types';
import { loadReflectionCubeBatch, createDecodedReflectionCubeTexture } from './ownedReflectionCube';
import { ReflectionTextureSession } from './reflectionTextureSession';
import { extraTextureKey } from './haloMaterial';
import { textureResourceScope } from './textureResourceScope';
export function useReflectionTextures(
  project: Project,
  inspection: MapInspection | null,
  baseTextures: Record<number, THREE.Texture>,
) {
  const session = useRef<{ scope: string; reader: ReflectionTextureSession } | null>(null);
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
    const reader = new ReflectionTextureSession(
      (ids) =>
        loadReflectionCubeBatch(project.id, inspection!.sha256, ids, project.source?.resourceSha256 ?? {}),
      createDecodedReflectionCubeTexture,
      () =>
        setPreview({
          scope,
          cubes: Object.fromEntries(reader.cubes),
          errors: Object.fromEntries(reader.errors),
        }),
    );
    const current = { scope, reader };
    session.current = current;
    setPreview({ scope, cubes: {}, errors: {} });
    return () => {
      reader.dispose();
    };
  }, [scope]);
  useEffect(() => {
    const current = session.current;
    if (!current || current.scope !== scope) return;
    // Failures and successes are attempted once per exact resource epoch.
    current.reader.enqueue(bitmapIds);
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
