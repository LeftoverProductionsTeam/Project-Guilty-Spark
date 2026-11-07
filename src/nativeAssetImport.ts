import {useEffect, useRef} from 'react';
import { call, native } from './api';
import type { ForgeAsset } from './forge';
import type { ViewportAsset } from './viewportAssets';
import type { NativeAssetImport, Project } from './types';
export async function prepareAssetImport(
  project: Project,
  asset: Omit<ForgeAsset, 'class'> & { class: string },
): Promise<NativeAssetImport> {
  if (!native)
    throw Error('Recursive native tag imports require the desktop application and installed Invader tools.');
  if (!asset.sourceProjectId || !asset.sourceSha256 || asset.tagId === null)
    throw Error('The asset needs its preserved source map and tag identity.');
  const existing = project.nativeAssetImports?.find(
    (binding) =>
      binding.sourceProjectId === asset.sourceProjectId &&
      binding.sourceSha256 === asset.sourceSha256 &&
      binding.tagId === asset.tagId &&
      binding.tagClass === asset.class &&
      binding.tagPath === asset.path,
  );
  // The backend checks current source drafts and the owned receipt on reuse.
  // A cached frontend binding cannot authorize ignoring a later source edit.
  return call<NativeAssetImport>('prepare_native_asset_import', {
      projectId: project.id,
      sourceProjectId: asset.sourceProjectId,
      sourceSha256: asset.sourceSha256,
      tagId: asset.tagId,
      existing: existing ?? null,
    });
}
export function attachAssetImport(project: Project, binding: NativeAssetImport): Project {
  const imports = project.nativeAssetImports ?? [];
  return imports.some((row) => row.id === binding.id)
    ? project
    : { ...project, nativeAssetImports: [...imports, binding] };
}

export async function prepareSoundImport(project: Project, item: ViewportAsset) {
  if (item.kind !== 'sound') return null;
  return prepareAssetImport(project, {
    key: item.key,
    name: item.name,
    path: item.path,
    sourceProjectId: item.sourceId,
    sourceSha256: item.sourceSha256,
    tagId: item.tagId,
    class: item.looping ? 'lsnd' : 'snd!',
    cacheVersion: 0,
  });
}

/** An async import belongs to one uninterrupted destination view. Leaving and
 * returning to the same map must not revive an earlier placement request. */
export function useAssetImportGuard(projectId: string, active: boolean) {
  const scope = useRef({projectId, active}), mounted = useRef(false);
  if (scope.current.projectId !== projectId || scope.current.active !== active)
    scope.current = {projectId, active};
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  return () => {
    const started = scope.current;
    return () => mounted.current && started.active && scope.current === started;
  };
}
