import { followAudioListener, SpatialSoundMixer, validateSoundScene } from './spatialAudio';
import type { SoundEmitter, SoundScene } from './spatialAudio';
import { loadMapSoundClip } from './soundClipLoader';

export interface DirectorAudio {
  stream: MediaStream;
  start: () => Promise<void>;
  dispose: () => void;
}
const clipKey = (e: SoundEmitter) =>
  `${e.sourceProjectId ?? ''}/${e.sourceSha256 ?? ''}/${e.tagId}/${e.pitchRange}/${e.permutation}/${e.followChain !== false}`;

export function directorSoundEmitters(scene: SoundScene) {
  const errors = validateSoundScene(scene);
  if (errors.length) throw Error(errors.join(' '));
  return (['ambient', 'mapStart'] as const).flatMap((event) =>
    scene.emitters
      .filter((e) => e.enabled && e.event === event)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 32),
  );
}

/** An owned recording bus, never a microphone, system capture, or speaker output. */
export async function prepareDirectorAudio(
  projectId: string,
  sourceProjectId: string,
  sourceSha256: string,
  savedScene: SoundScene,
  signal: AbortSignal,
  dependencies = { context: () => new AudioContext(), load: loadMapSoundClip },
): Promise<DirectorAudio> {
  const scene = structuredClone(savedScene),
    emitters = directorSoundEmitters(scene);
  if (!emitters.length)
    throw Error('Save an enabled Ambient or Map start sound in Level editor → Map sounds first.');
  if (signal.aborted) throw Error('Recording audio cancelled.');
  const context = dependencies.context();
  let disposed = false,
    started = false,
    mixer: SpatialSoundMixer | null = null;
  let unsubscribe = () => {};
  let destination: MediaStreamAudioDestinationNode;
  try {
    destination = context.createMediaStreamDestination();
  } catch (error) {
    void context.close().catch(() => {});
    throw error;
  }
  const buffers = new Map<string, AudioBuffer>();
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener('abort', dispose);
    unsubscribe();
    mixer?.dispose();
    destination.stream.getTracks().forEach((track) => track.stop());
    destination.disconnect();
    buffers.clear();
    void context.close().catch(() => {});
  };
  signal.addEventListener('abort', dispose, { once: true });
  try {
    await context.resume();
    if (disposed) throw Error('Recording audio cancelled.');
    if (context.state !== 'running')
      throw Error('Audio could not start. Focus the Director and try Record again.');
    const unique = [...new Map(emitters.map((e) => [clipKey(e), e])).values()];
    let bytes = 0;
    // Decode before the countdown; a missing clip cannot silently become an empty audio track.
    for (let at = 0; at < unique.length; at += 2) {
      const batch = await Promise.allSettled(
        unique.slice(at, at + 2).map(async (emitter) => {
          const buffer = await dependencies
            .load(context, emitter, sourceProjectId, sourceSha256, () => disposed)
            .catch((error) => {
              throw Error(`${emitter.name}: ${String(error)}`);
            });
          if (disposed) throw Error('Recording audio cancelled.');
          const decodedBytes = buffer.length * buffer.numberOfChannels * 4;
          if (decodedBytes > 32 * 1024 * 1024) throw Error('Decoded sound exceeds the 32 MiB clip limit.');
          bytes += decodedBytes;
          if (bytes > 64 * 1024 * 1024)
            throw Error('Recording sounds exceed the 64 MiB audio budget. Disable some emitters first.');
          buffers.set(clipKey(emitter), buffer);
        }),
      );
      const failure = batch.find((result) => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
    }
    mixer = new SpatialSoundMixer(
      context,
      async (emitter) => {
        const buffer = buffers.get(clipKey(emitter));
        if (!buffer || disposed) throw Error('Recording sound is no longer available.');
        return buffer;
      },
      undefined,
      destination,
    );
    mixer.configure(scene);
    unsubscribe = followAudioListener(projectId, (pose) => mixer?.setListener(pose));
    return {
      stream: destination.stream,
      async start() {
        if (disposed) throw Error('Recording audio cancelled.');
        if (started) return;
        started = true;
        await mixer!.event('ambient');
        await mixer!.event('mapStart');
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
