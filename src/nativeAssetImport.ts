import {useEffect, useRef} from 'react';
import { call, native } from './api';
import type { ForgeAsset } from './forge';
import type { ViewportAsset } from './viewportAssets';
import type { NativeAssetImport, OpenProject, Project } from './types';
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

/** Reuse the same immutable recursive imports as placed assets. This does not
 * alter source rules or turn a recovered scenario into a fresh native round. */
export async function prepareFirefightImports(
  project: Project,
  sourceProjectId: string,
  stillCurrent: () => boolean,
): Promise<NativeAssetImport[]> {
  const config = project.firefight;
  const doc = project.quickForge;
  if (!native || !doc || doc.native || doc.gameMode !== 'firefight' ||
      !['mccSteam','haloCustomEdition','chupathingyCe'].includes(doc.runtimeId))
    throw Error('Source actor imports currently need an editable native solo Firefight level. Recovered-scenario authoring remains separate.');
  if (!config?.sourceSha256 || !sourceProjectId)
    throw Error('Choose and apply the actor source before including native assets.');
  const current = () => {
    if (!stillCurrent()) throw Error('The project closed or its rules changed during asset preparation. No old plan was reapplied.');
  };
  current();
  const open = await call<OpenProject>('open_project', {id:sourceProjectId});
  current();
  const inspection = open.inspection;
  if (!inspection || open.project.id !== sourceProjectId ||
      inspection.sha256 !== config.sourceSha256 || open.project.source?.sha256 !== config.sourceSha256)
    throw Error('The actor source no longer matches these rules. Reopen and review its exact native revision.');
  const key = (value:string) => value.replaceAll('\\','/').toLowerCase();
  const requested = new Map<string,{path:string;class:string}>();
  const include = (path:string,tagClass:string) => requested.set(tagClass+':'+key(path),{path,class:tagClass});
  for (const wave of config.waves) for (const group of wave.groups) {
    const enemy = config.enemies.find(candidate => candidate.id === group.enemyId);
    if (!enemy) throw Error('A wave references a missing enemy definition. Repair that wave before extracting assets.');
    include(enemy.actorVariantPath,'actv');
  }
  if (config.nativePlayerProfile) {
    include(config.nativePlayerProfile.primaryWeapon,'weap');
    if (config.nativePlayerProfile.secondaryWeapon) include(config.nativePlayerProfile.secondaryWeapon,'weap');
  }
  if (!requested.size) throw Error('Add a wave actor or starting weapon before including native assets.');
  const tags = [...requested.values()].map(asset => {
    const matches = inspection.tags.filter(tag => tag.class === asset.class && key(tag.path) === key(asset.path));
    if (matches.length !== 1) throw Error('The source asset is missing or ambiguous: '+asset.path+'.'+asset.class);
    return matches[0];
  });
  const fresh = tags.filter(tag => !project.nativeAssetImports?.some(binding =>
    binding.sourceProjectId === sourceProjectId && binding.sourceSha256 === inspection.sha256 &&
    binding.tagId === tag.id && binding.tagClass === tag.class && binding.tagPath === tag.path));
  if ((project.nativeAssetImports?.length ?? 0) + fresh.length > 128)
    throw Error('This plan exceeds the existing 128-asset native import limit. Split the source project before extracting.');
  const bindings: NativeAssetImport[] = [];
  for (const tag of tags) {
    current();
    const binding = await prepareAssetImport(project, {
      key:'firefight:'+sourceProjectId+':'+tag.id,name:tag.path,path:tag.path,class:tag.class,
      sourceProjectId,sourceSha256:inspection.sha256,tagId:tag.id,cacheVersion:inspection.header.version,
    });
    current();
    bindings.push(binding);
  }
  return bindings;
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
