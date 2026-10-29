import { call } from './api';
import { decodeSoundChain } from './spatialAudio';
import type { SoundEmitter } from './spatialAudio';
import type { AudioPreview, SoundInspection } from './types';
import { joinSoundPhases, soundBytes } from './soundPlayback';
import type { LoadedSound, SoundPlayback } from './soundPlayback';
export interface LoopingInspection {
  tagId: number;
  sourceSha256: string;
  tagPath: string;
  loops: boolean;
  warnings: string[];
  tracks: {
    index: number;
    gain: number;
    fadeInSeconds: number;
    fadeOutSeconds: number;
    startTagId: number | null;
    loopTagId: number | null;
    endTagId: number | null;
  }[];
}

/** The source identity and decoded sample hashes are checked for every consumer. */
export async function loadMapSoundClip(
  context: BaseAudioContext,
  emitter: SoundEmitter,
  sourceProjectId: string,
  sourceSha256: string,
  cancelled: () => boolean,
): Promise<LoadedSound> {
  if (cancelled()) throw Error('Sound loading was stopped.');
  const projectId = emitter.sourceProjectId ?? sourceProjectId;
  const sourceHash = emitter.sourceSha256 ?? sourceSha256;
  const decode = async (tagId: number, selected = false) => {
    if (cancelled()) throw Error('Sound loading was stopped.');
    const report = await call<SoundInspection>('inspect_sound', { projectId, tagId });
    const first = report.permutations.find((p) => p.available && p.chainStart !== false);
    if (!selected && !first) throw Error(`${report.tagPath}: no playable source phase.`);
    const phase = selected
      ? emitter
      : {
          ...emitter,
          tagId,
          pitchRange: first!.pitchRange,
          permutation: first!.permutation,
          followChain: true,
        };
    return decodeSoundChain(
      context,
      phase,
      report,
      sourceHash,
      (permutation) =>
        call<AudioPreview>('preview_sound', {
          projectId,
          tagId,
          pitchRange: phase.pitchRange,
          permutation,
        }),
      cancelled,
    );
  };
  if (!emitter.loopingSource) return decode(emitter.tagId, true);
  const report = await call<LoopingInspection>('inspect_looping_sound', {
    projectId,
    tagId: emitter.loopingSource.tagId,
  });
  if (report.sourceSha256 !== sourceHash || report.tagId !== emitter.loopingSource.tagId)
    throw Error('Looping sound source identity changed.');
  const track = report.tracks.find((track) => track.index === emitter.loopingSource!.track);
  if (!track || track.loopTagId !== emitter.tagId)
    throw Error('Saved looping track no longer matches its source loop sound.');
  // One PCM buffer gives one-shots gapless phases and repeating tracks an exact loop interval.
  const loop = await decode(emitter.tagId, true);
  const intro = track.startTagId === null ? undefined : await decode(track.startTagId);
  const outro = track.endTagId === null ? undefined : await decode(track.endTagId);
  const joined = joinSoundPhases(context, intro, loop, outro);
  if (cancelled()) throw Error('Sound loading was stopped.');
  const playback: SoundPlayback = {
    ...joined,
    canLoop: report.loops,
    fadeInSeconds: track.fadeInSeconds,
    fadeOutSeconds: track.fadeOutSeconds,
  };
  if (soundBytes(playback) > 32 * 1024 * 1024)
    throw Error('Decoded looping sound phases exceed the 32 MiB clip limit.');
  return playback;
}
