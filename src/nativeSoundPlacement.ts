import { call } from './api';
import { attachAssetImport, prepareAssetImport } from './nativeAssetImport';
import type { SoundEmitter } from './spatialAudio';
import { emptySoundScene } from './spatialAudio';
import type { OpenProject, Project } from './types';

export function nativeSoundUnavailable(project: Project, emitter: SoundEmitter): string | null {
  if (!project.quickForge || project.quickForge.runtimeId !== 'mccSteam')
    return 'Native loops currently need an editable MCC QuickForge map.';
  if (project.quickForge.native)
    return 'Native sound placement is not part of the shared SparkLink revision yet.';
  if (!emitter.loopingSource || emitter.customSound)
    return 'Choose an original Halo looping sound; single clips remain editor rehearsal.';
  return null;
}

/** Prepares the verified import without modifying the live document while tools run. */
export async function prepareNativeSound(project: Project, emitter: SoundEmitter, fallbackSource: string) {
  const reason = nativeSoundUnavailable(project, emitter);
  if (reason) throw Error(reason);
  const id = emitter.sourceProjectId ?? fallbackSource;
  let open = await call<OpenProject>('open_project', { id });
  if (open.inspection?.header.version === 13 && open.project?.source && !open.project.source.audioResources)
    open = (await call<OpenProject | null>('auto_connect_sound_resources', { projectId: id })) ?? open;
  const hash = open.inspection?.sha256;
  if (!hash || (emitter.sourceSha256 && emitter.sourceSha256 !== hash))
    throw Error('The sound source changed; reimport the original loop.');
  const tag = open.inspection!.tags.find((t) => t.id === emitter.loopingSource!.tagId && t.class === 'lsnd');
  if (!tag) throw Error('The original looping sound is unavailable in its preserved map.');
  const binding = await prepareAssetImport(project, {
    key: `native-audio:${id}:${tag.id}`,
    name: emitter.name,
    path: tag.path,
    class: 'lsnd',
    tagId: tag.id,
    sourceProjectId: id,
    sourceSha256: hash,
    cacheVersion: open.inspection!.header.version,
  });
  return { binding, emitter: { ...emitter, sourceProjectId: id, sourceSha256: hash, nativePlacement: true } };
}

/** Merge only the accepted intent into the latest map, preserving edits made during extraction. */
export function includePreparedSound(
  latest: Project,
  before: SoundEmitter,
  prepared: Awaited<ReturnType<typeof prepareNativeSound>>,
) {
  const scene = latest.audioPreview ?? emptySoundScene();
  const current = scene.emitters.find((e) => e.id === before.id);
  if (
    !current ||
    current.tagId !== before.tagId ||
    current.loopingSource?.tagId !== before.loopingSource?.tagId ||
    current.sourceProjectId !== before.sourceProjectId ||
    current.sourceSha256 !== before.sourceSha256
  )
    throw Error('The sound selection changed during extraction; the prepared tags are retained for retry.');
  const reason = nativeSoundUnavailable(latest, current);
  if (reason) throw Error(reason);
  if (
    scene.emitters.some(
      (e) =>
        e.id !== current.id &&
        e.nativePlacement &&
        e.loopingSource?.tagId === prepared.emitter.loopingSource?.tagId &&
        e.sourceProjectId === prepared.emitter.sourceProjectId &&
        e.sourceSha256 === prepared.emitter.sourceSha256 &&
        e.position.every((v, i) => v === current.position[i]),
    )
  )
    throw Error(
      'This complete loop is already included here. Include one track only; Halo plays the whole original loop.',
    );
  return {
    ...attachAssetImport(latest, prepared.binding),
    audioPreview: {
      ...scene,
      emitters: scene.emitters.map((e) =>
        e.id === current.id
          ? {
              ...e,
              sourceProjectId: prepared.emitter.sourceProjectId,
              sourceSha256: prepared.emitter.sourceSha256,
              nativePlacement: true,
            }
          : e,
      ),
    },
  };
}
