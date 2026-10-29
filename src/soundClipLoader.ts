import { call } from './api';
import { decodeSoundChain } from './spatialAudio';
import type { SoundEmitter } from './spatialAudio';
import type { AudioPreview, SoundInspection } from './types';

/** The source identity and decoded sample hashes are checked for every consumer. */
export async function loadMapSoundClip(
  context: BaseAudioContext,
  emitter: SoundEmitter,
  sourceProjectId: string,
  sourceSha256: string,
  cancelled: () => boolean,
) {
  if (cancelled()) throw Error('Sound loading was stopped.');
  const projectId = emitter.sourceProjectId ?? sourceProjectId;
  const report = await call<SoundInspection>('inspect_sound', { projectId, tagId: emitter.tagId });
  return decodeSoundChain(
    context,
    emitter,
    report,
    emitter.sourceSha256 ?? sourceSha256,
    (permutation) =>
      call<AudioPreview>('preview_sound', {
        projectId,
        tagId: emitter.tagId,
        pitchRange: emitter.pitchRange,
        permutation,
      }),
    cancelled,
  );
}
