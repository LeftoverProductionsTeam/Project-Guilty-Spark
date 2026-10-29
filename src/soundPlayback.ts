import type { SoundEmitter } from './spatialAudio';
export interface SoundPlayback {
  buffer: AudioBuffer;
  loopStart?: number;
  loopEnd?: number;
  canLoop?: boolean;
  outroStart?: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
}
export type LoadedSound = AudioBuffer | SoundPlayback;
export function soundPlayback(loaded: LoadedSound): SoundPlayback {
  const clip = 'buffer' in loaded ? loaded : { buffer: loaded };
  if (
    !Number.isSafeInteger(clip.buffer.length) ||
    clip.buffer.length <= 0 ||
    ![1, 2].includes(clip.buffer.numberOfChannels)
  )
    throw Error('Decoded sound dimensions are invalid.');
  if (clip.loopStart !== undefined || clip.loopEnd !== undefined) {
    if (
      !Number.isFinite(clip.buffer.duration) ||
      !Number.isFinite(clip.loopStart) ||
      !Number.isFinite(clip.loopEnd) ||
      clip.loopStart! < 0 ||
      clip.loopEnd! <= clip.loopStart! ||
      clip.loopEnd! > clip.buffer.duration
    )
      throw Error('Decoded sound loop interval is invalid.');
  }
  if (
    clip.outroStart !== undefined &&
    (!Number.isFinite(clip.buffer.duration) ||
      !Number.isFinite(clip.outroStart) ||
      clip.outroStart < 0 ||
      clip.outroStart >= clip.buffer.duration)
  )
    throw Error('Decoded sound ending offset is invalid.');
  for (const fade of [clip.fadeInSeconds, clip.fadeOutSeconds])
    if (fade !== undefined && (!Number.isFinite(fade) || fade < 0 || fade > 600))
      throw Error('Decoded sound fade is invalid.');
  return clip;
}
export function soundBytes(loaded: LoadedSound) {
  const clip = soundPlayback(loaded);
  return clip.buffer.length * clip.buffer.numberOfChannels * 4;
}
export function soundKey(e: SoundEmitter) {
  return `${e.sourceProjectId ?? ''}/${e.sourceSha256 ?? ''}/${e.tagId}/${e.pitchRange}/${e.permutation}/${e.followChain !== false}/${e.loopingSource?.tagId ?? ''}/${e.loopingSource?.track ?? ''}`;
}
export function joinSoundPhases(
  context: BaseAudioContext,
  intro: AudioBuffer | undefined,
  loop: AudioBuffer,
  outro?: AudioBuffer,
) {
  const phases = [intro, loop, outro].filter((buffer): buffer is AudioBuffer => !!buffer);
  if (phases.some((buffer) => buffer.sampleRate !== context.sampleRate))
    throw Error('Looping sound phases have inconsistent decoded sample rates.');
  const channels = Math.max(...phases.map((buffer) => buffer.numberOfChannels));
  const length = phases.reduce((sum, buffer) => sum + buffer.length, 0);
  if (![1, 2].includes(channels) || !Number.isSafeInteger(length) || length * channels * 4 > 32 * 1024 * 1024)
    throw Error('Looping sound intro and loop exceed the 32 MiB clip limit.');
  const buffer = phases.length === 1 ? loop : context.createBuffer(channels, length, context.sampleRate);
  if (phases.length > 1) {
    let offset = 0;
    for (const phase of phases) {
      for (let channel = 0; channel < channels; channel++)
        buffer.copyToChannel(
          phase.getChannelData(Math.min(channel, phase.numberOfChannels - 1)),
          channel,
          offset,
        );
      offset += phase.length;
    }
  }
  const loopStart = (intro?.length ?? 0) / context.sampleRate,
    loopEnd = ((intro?.length ?? 0) + loop.length) / context.sampleRate;
  return { buffer, loopStart, loopEnd, outroStart: outro ? loopEnd : undefined };
}
