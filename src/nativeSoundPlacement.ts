import { call } from './api';
import { attachAssetImport, prepareAssetImport } from './nativeAssetImport';
import type { SoundEmitter } from './spatialAudio';
import { emptySoundScene } from './spatialAudio';
import type { MapInspection, NativeAssetImport, OpenProject, Project } from './types';
import {validMissionSoundCue} from './creatorStudio';
import type {MissionSoundCue} from './creatorStudio';

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

/** Mission radio uses the existing recursive import and owned source identity.
 * Custom WAVs/looping tracks remain in their original editor workflow. */
export function missionSoundUnavailable(project:Project,inspection?:MapInspection|null):string|null {
  if(project.quickForge){if(project.quickForge.native||project.quickForge.gameMode!=='campaign'||!['mccSteam','haloCustomEdition','chupathingyCe'].includes(project.quickForge.runtimeId))return 'Mission radio needs local editable Campaign source; shared native imports use their negotiated publication.';return null;}
  if(!project.source||inspection?.sha256!==project.source.sha256||inspection.header.scenarioType!==0||![609,13].includes(inspection.header.version))return 'Recovered mission radio needs the matching CE609 or MCC13 solo source. Open its native campaign first; other formats need their supported conversion.';
  return null;
}
/** Bind a replacement without resetting authored timing or caption. */
export function missionSoundCueForImport(binding:NativeAssetImport,previous?:MissionSoundCue|null,defaultGain=1):MissionSoundCue {
  if(binding.tagClass!=='snd!')throw Error('Mission radio needs a native one-shot sound import.');
  return {importId:binding.id,soundPath:binding.nativePath.replaceAll('\\','/'),
    phase:previous?.phase??'start',gain:previous?.gain??Math.max(0,Math.min(1,defaultGain)),
    delayMs:previous?.delayMs??0,caption:previous?.caption??''};
}
export async function prepareMissionSound(project:Project,selection:SoundEmitter|MissionSoundCue,inspection?:MapInspection|null) {
  const unavailable=missionSoundUnavailable(project,inspection);if(unavailable)throw Error(unavailable);
  const recovered='soundPath' in selection;
  if(recovered&&(project.quickForge||!validMissionSoundCue(selection)))
    throw Error('Reconnect needs a valid saved radio cue in the matching recovered campaign.');
  if(!recovered&&(selection.customSound||selection.loopingSource))
    throw Error('Choose a native one-shot sound. Custom recordings need a compiled sound tag; loops stay in Map sounds.');
  const id=recovered?project.id:selection.sourceProjectId??project.id,
    hash=recovered?project.source?.sha256:selection.sourceSha256??project.source?.sha256;
  if(!hash)throw Error('Choose a sound from a preserved source map first.');
  let open=await call<OpenProject>('open_project',{id});
  if(open.inspection?.header.version===13&&open.project.source&&!open.project.source.audioResources)
    open=(await call<OpenProject|null>('auto_connect_sound_resources',{projectId:id}))??open;
  if(open.project.id!==id||open.inspection?.sha256!==hash||open.project.source?.sha256!==hash)
    throw Error('The sound source changed. Select its current native revision; existing cues are unchanged.');
  const tags=open.inspection.tags.filter(tag=>tag.class==='snd!'&&(recovered?
    tag.path.replaceAll('\\','/')===selection.soundPath:tag.id===selection.tagId));
  if(tags.length!==1)throw Error(recovered?
    'The saved sound path is missing or ambiguous in this campaign. Choose its real native sound from Map sounds; no substitute was imported.':
    'The selected source has no unique matching native one-shot sound tag.');
  const tag=tags[0];
  return prepareAssetImport(project,{key:'mission-audio:'+id+':'+tag.id,name:recovered?tag.path:selection.name,path:tag.path,class:tag.class,
    sourceProjectId:id,sourceSha256:hash,tagId:tag.id,cacheVersion:open.inspection.header.version});
}
