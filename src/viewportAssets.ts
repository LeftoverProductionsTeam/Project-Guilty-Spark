import type { MapDocument } from './mapDocuments';
import type { Asset, Project, SceneObject, Vec3, MapInspection } from './types';
import { catalogAssets, placeAsset, pointInsideForgeRoom } from './forge';
import type { ForgeAsset, ForgePlacement } from './forge';
import { call } from './api';
import { createEmitter } from './spatialAudio';
import type { SoundEmitter } from './spatialAudio';
import type { SoundInspection } from './types';
import { loopingSoundEmitters } from './loopingEmitters';

export type ViewportAsset =
  | {
      key: string;
      kind: 'model';
      sourceId: string;
      sourceTitle: string;
      name: string;
      path: string;
      asset: ForgeAsset;
    }
  | {
      key: string;
      kind: 'mesh' | 'customSound';
      sourceId: string;
      sourceTitle: string;
      name: string;
      path: string;
      asset: Asset;
    }
  | {
      key: string;
      kind: 'sound';
      sourceId: string;
      sourceTitle: string;
      name: string;
      path: string;
      tagId: number;
      sourceSha256: string;
      looping: boolean;
    };
export function viewportAssetCatalog(documents: {history:{current:Project|null};inspection:MapInspection|null}[]): ViewportAsset[] {
  return documents.flatMap((document) => {
    const project = document.history.current;
    if (!project) return [];
    const source = { sourceId: project.id, sourceTitle: project.title };
    const models: ViewportAsset[] =
      document.inspection && project.source && document.inspection.sha256 === project.source.sha256
        ? catalogAssets({ project, inspection: document.inspection }).map((asset) => ({
            ...source,
            key: `${project.id}:model:${asset.tagId}`,
            kind: 'model',
            name: asset.name,
            path: asset.path,
            asset,
          }))
        : [];
    const sounds: ViewportAsset[] =
      document.inspection && project.source && document.inspection.sha256 === project.source.sha256
        ? document
            .inspection!.tags.filter((tag) => tag.class === 'snd!' || tag.class === 'lsnd')
            .map((tag) => ({
              ...source,
              key: `${project.id}:sound:${tag.id}`,
              kind: 'sound',
              name: tag.path.split(/[\\/]/).at(-1) ?? 'Sound',
              path: tag.path,
              tagId: tag.id,
              sourceSha256: document.inspection!.sha256,
              looping: tag.class === 'lsnd',
            }))
        : [];
    const imported: ViewportAsset[] = project.assets
      .filter((asset) => asset.kind === 'obj' || asset.kind === 'custom-sound')
      .map((asset) => ({
        ...source,
        key: `${project.id}:${asset.kind}:${asset.id}`,
        kind: asset.kind === 'obj' ? 'mesh' : 'customSound',
        name: asset.name,
        path: asset.name,
        asset,
      }));
    return [...models, ...sounds, ...imported];
  });
}
export function checkedDropPoint(position: Vec3): Vec3 {
  if (position.length !== 3 || position.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e6))
    throw Error('Choose a finite position inside the editing world.');
  return [...position];
}
export function sourcePlacement(object: SceneObject): ForgePlacement | null {
  const source = object.sourceModel;
  return source
    ? {
        id: object.id,
        name: object.name,
        tagId: source.tagId,
        tagPath: source.path,
        tagClass: source.class,
        sourceProjectId: source.projectId,
        sourceSha256: source.sourceSha256,
        position: object.position,
        rotation: object.rotation,
        team: 0,
        respawnSeconds: 0,
        visible: object.visible,
        locked: false,
      }
    : null;
}
export function placeLibraryModel(
  project: Project,
  asset: ForgeAsset,
  position: Vec3,
  replaceId?: string | null,
): { project: Project; selectedId: string } {
  let point = checkedDropPoint(position);
  if (project.quickForge && !pointInsideForgeRoom(project.quickForge, point)) {
    const lifted: [number, number, number] = [point[0], point[1], point[2] + 0.01];
    if (pointInsideForgeRoom(project.quickForge, lifted)) point = lifted;
  }
  if (!asset.sourceProjectId || !/^[a-f\d]{64}$/i.test(asset.sourceSha256) || !Number.isInteger(asset.tagId))
    throw Error('The model needs its original map and tag identity.');
  if (project.quickForge) {
    const old = replaceId ? project.quickForge.placements.find((p) => p.id === replaceId) : undefined;
    if (replaceId && !old) throw Error('Select a placed model to replace.');
    if (!old && project.quickForge.placements.length >= 1024)
      throw Error('The placement library is full (1024 objects).');
    const placement = {
      ...placeAsset(asset, old?.position ?? point),
      ...(old
        ? {
            id: old.id,
            rotation: [...old.rotation] as Vec3,
            team: old.team,
            respawnSeconds: old.respawnSeconds,
            visible: old.visible,
            locked: old.locked,
          }
        : {}),
    };
    if (old?.locked) throw Error('Unlock this model before replacing it.');
    return {
      project: {
        ...project,
        quickForge: {
          ...project.quickForge,
          placements: old
            ? project.quickForge.placements.map((p) => (p.id === old.id ? placement : p))
            : [...project.quickForge.placements, placement],
        },
      },
      selectedId: placement.id,
    };
  }
  const old = replaceId ? project.scene.find((object) => object.id === replaceId) : undefined;
  if (replaceId && !old) throw Error('Select a model to replace.');
  if (!old && project.scene.length >= 20000) throw Error('The scene object limit is full.');
  const object: SceneObject = {
    ...(old ?? {
      id: crypto.randomUUID(),
      position: point,
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      visible: true,
      sourceOffset: null,
      rotationOffset: null,
    }),
    name: asset.name,
    kind: 'Source model',
    tagId: null,
    assetId: null,
    sourceModel: {
      projectId: asset.sourceProjectId,
      sourceSha256: asset.sourceSha256,
      tagId: asset.tagId,
      path: asset.path,
      class: asset.class,
    },
  };
  return {
    project: {
      ...project,
      scene: old
        ? project.scene.map((value) => (value.id === old.id ? object : value))
        : [...project.scene, object],
    },
    selectedId: object.id,
  };
}
export async function librarySoundEmitters(
  item: Extract<ViewportAsset, { kind: 'sound' }> | Extract<ViewportAsset, { kind: 'mesh' | 'customSound' }>,
  point: Vec3,
): Promise<SoundEmitter[]> {
  const position = checkedDropPoint(point);
  if (item.kind === 'customSound') {
    const emitter = createEmitter(0, item.name.slice(0, 120), position);
    emitter.customSound = { assetId: item.asset.id, sha256: item.asset.sha256 };
    emitter.sourceProjectId = item.sourceId;
    emitter.sourceSha256 = item.asset.sha256;
    emitter.loop = false;
    emitter.event = 'manual';
    emitter.bus = 'effects';
    return [emitter];
  }
  if (item.kind !== 'sound') throw Error('Choose a sound asset.');
  if (item.looping) return loopingSoundEmitters({
    projectId: item.sourceId, sha256: item.sourceSha256, tagId: item.tagId, name: item.name,
  }, position);
  const soundId = item.tagId;
  const report = await call<SoundInspection>('inspect_sound', { projectId: item.sourceId, tagId: soundId });
  if (report.sourceSha256 !== item.sourceSha256 || report.tagId !== soundId)
    throw Error('The sound source identity changed.');
  const sample = report.permutations.find((sample) => sample.available && sample.chainStart !== false);
  if (!sample) throw Error('No playable source sample. Connect this map’s original sound resources.');
  const emitter = createEmitter(soundId, item.name.slice(0, 120), position);
  emitter.sourceProjectId = item.sourceId;
  emitter.sourceSha256 = item.sourceSha256;
  emitter.pitchRange = sample.pitchRange;
  emitter.permutation = sample.permutation;
  emitter.loop = /ambient|wind|rain|water|loop|music/i.test(item.path);
  if (!emitter.loop) {
    emitter.event = 'manual';
    emitter.bus = 'effects';
  }
  return [emitter];
}
