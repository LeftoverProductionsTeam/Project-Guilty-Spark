// Runs the production decoder/mixer in the isolated native WebView. No speaker/device capture.
import { loopingSoundEmitters } from '../src/loopingEmitters.ts';
import { loadMapSoundClip } from '../src/soundClipLoader.ts';
import { emptySoundScene, SpatialSoundMixer } from '../src/spatialAudio.ts';
import { soundKey, soundPlayback } from '../src/soundPlayback.ts';

export async function verify(input) {
  const emitters = await loopingSoundEmitters(input.source, [0, 0, 0]);
  if (emitters.length < 2 || emitters.filter((e) => e.gain > 0).length < 2)
    throw Error('The native fixture needs two audible authored main tracks.');
  const context = new OfflineAudioContext(2, 48000 * 3, 48000),
    clips = new Map();
  for (const emitter of emitters) {
    emitter.spatial = false;
    clips.set(
      soundKey(emitter),
      soundPlayback(
        await loadMapSoundClip(context, emitter, input.source.projectId, input.source.sha256, () => false),
      ),
    );
  }
  const scene = { ...emptySoundScene(), master: 0.25, emitters };
  const mixer = new SpatialSoundMixer(context, async (emitter) => clips.get(soundKey(emitter)));
  mixer.configure(scene);
  await mixer.event('ambient');
  const voices = mixer.stats.voices;
  const rendered = await context.startRendering();
  mixer.dispose();
  const samples = rendered.getChannelData(0),
    start = 12000;
  let expectedEnergy = 0,
    errorEnergy = 0,
    omittedEnergy = 0,
    actualEnergy = 0;
  for (let frame = start; frame < samples.length; frame++) {
    let reference = 0,
      firstOnly = 0;
    for (let index = 0; index < emitters.length; index++) {
      const emitter = emitters[index],
        clip = clips.get(soundKey(emitter)),
        buffer = clip.buffer;
      let at = frame;
      const looping = emitter.loop && clip.canLoop !== false;
      if (looping) {
        const begin = Math.round((clip.loopStart ?? 0) * 48000),
          end = Math.round((clip.loopEnd ?? buffer.duration) * 48000);
        if (at >= end) at = begin + ((at - end) % (end - begin));
      }
      const fade = clip.fadeInSeconds ? Math.min(1, frame / 48000 / clip.fadeInSeconds) : 1;
      const value =
        at < buffer.length ? buffer.getChannelData(0)[at] * emitter.gain * scene.master * fade : 0;
      reference += value;
      if (index === 0) firstOnly = value;
    }
    expectedEnergy += reference ** 2;
    actualEnergy += samples[frame] ** 2;
    errorEnergy += (samples[frame] - reference) ** 2;
    omittedEnergy += (reference - firstOnly) ** 2;
  }
  if (expectedEnergy <= 1e-7 || omittedEnergy <= 1e-7)
    throw Error('The real tracks must independently contribute audio.');
  const relativeError = Math.sqrt(errorEnergy / expectedEnergy);
  if (relativeError >= 0.001 || voices !== emitters.length)
    throw Error(`Source main-track mix differs: ${relativeError}, ${voices} voices.`);
  const mutedContext = new OfflineAudioContext(2, 4800, 48000);
  const muted = new SpatialSoundMixer(mutedContext, async (emitter) => clips.get(soundKey(emitter)));
  muted.configure({ ...scene, muted: true });
  await muted.event('ambient');
  const silence = await mutedContext.startRendering();
  muted.dispose();
  const muteRms = Math.sqrt(
    silence.getChannelData(0).reduce((sum, value) => sum + value ** 2, 0) / silence.length,
  );
  if (muteRms !== 0) throw Error('Muted source main tracks produced output.');
  return {
    kind: 'native-source-production-mixer-OfflineAudioContext',
    tracks: emitters.map((emitter) => ({
      tagId: emitter.tagId,
      track: emitter.loopingSource.track,
      gain: emitter.gain,
      decodedFrames: clips.get(soundKey(emitter)).buffer.length,
      decodedChannels: clips.get(soundKey(emitter)).buffer.numberOfChannels,
    })),
    voices,
    relativeError,
    rms: Math.sqrt(actualEnergy / (samples.length - start)),
    firstTrackOnlyError: Math.sqrt(omittedEnergy / expectedEnergy),
    muteRms,
    hardwareListeningAccepted: false,
  };
}
