import { describe, expect, it, vi } from 'vitest';
import { directorSoundEmitters, prepareDirectorAudio } from './directorAudio';
import { createEmitter, emptySoundScene, publishAudioListener } from './spatialAudio';
import type { SoundEmitter } from './spatialAudio';
const clip = { length: 48000, numberOfChannels: 1 } as AudioBuffer;
function fixture() {
  const parameter = () => ({
    value: 0,
    setTargetAtTime(value: number) {
      this.value = value;
    },
  });
  const connections: unknown[] = [];
  const node = () => ({ connect: (to: unknown) => connections.push(to), disconnect: vi.fn() });
  const track = { stop: vi.fn() };
  const destination = { ...node(), stream: { getTracks: () => [track] } };
  const starts = vi.fn(),
    close = vi.fn(async () => {});
  const context = {
    currentTime: 0,
    state: 'running',
    destination: {},
    resume: vi.fn(async () => {}),
    close,
    createMediaStreamDestination: () => destination,
    createGain: () => ({ ...node(), gain: parameter() }),
    createBufferSource: () => ({
      ...node(),
      buffer: null,
      playbackRate: parameter(),
      start: starts,
      stop() {},
    }),
    createPanner: () => ({
      ...node(),
      positionX: parameter(),
      positionY: parameter(),
      positionZ: parameter(),
    }),
    listener: Object.fromEntries(
      ['positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ'].map(
        (key) => [key, parameter()],
      ),
    ),
  };
  const scene = emptySoundScene();
  scene.emitters = [createEmitter(1, 'Wind')];
  const load = vi.fn(async (_context:BaseAudioContext,_emitter:SoundEmitter) => clip),
    controller = new AbortController();
  const prepare = () =>
    prepareDirectorAudio('map', 'source', 'a'.repeat(64), scene, controller.signal, {
      context: () => context as unknown as AudioContext,
      load,
    });
  return { context, destination, starts, close, connections, track, scene, controller, load, prepare };
}
describe('Director saved map audio ownership', () => {
  it('preloads without voices or speaker output, starts once, follows the camera, and disposes once', async () => {
    const f = fixture();
    const audio = await f.prepare();
    expect(f.load).toHaveBeenCalledTimes(1);
    expect(f.starts).not.toHaveBeenCalled();
    expect(f.connections).toContain(f.destination);
    expect(f.connections).not.toContain(f.context.destination);
    publishAudioListener('map', { position: [3, 4, 5], forward: [1, 0, 0], up: [0, 0, 1] });
    expect(f.context.listener.positionX.value).toBe(3);
    await audio.start();
    await audio.start(); // Resume must not restart the map-start cues.
    expect(f.starts).toHaveBeenCalledTimes(1);
    audio.dispose();
    audio.dispose();
    expect(f.close).toHaveBeenCalledTimes(1);
    expect(f.track.stop).toHaveBeenCalledTimes(1);
    publishAudioListener('map', { position: [30, 4, 5], forward: [1, 0, 0], up: [0, 0, 1] });
    expect(f.context.listener.positionX.value).toBe(3);
    await expect(audio.start()).rejects.toThrow(/cancelled/);
  });
  it('uses a snapshot and deduplicates clips while retaining source identities', async () => {
    const f = fixture();
    f.scene.emitters.push({ ...createEmitter(1, 'Shared'), event: 'mapStart', loop: false });
    const other = {
      ...createEmitter(1, 'Other map'),
      sourceProjectId: crypto.randomUUID(),
      sourceSha256: 'b'.repeat(64),
    };
    f.scene.emitters.push(other);
    const audio = await f.prepare();
    expect(f.load).toHaveBeenCalledTimes(2);
    f.scene.emitters = [];
    await audio.start();
    expect(f.starts).toHaveBeenCalledTimes(3);
    audio.dispose();
  });
  it('preflights each track even when source tracks share their main loop sample', async () => {
    const f=fixture();
    f.scene.emitters=[0,1].map(track=>({...createEmitter(5,`Source track ${track+1}`),
      sourceProjectId:'11111111-1111-4111-8111-111111111111',sourceSha256:'a'.repeat(64),
      loopingSource:{tagId:10,track},gain:track===0?.25:.75,spatial:false}));
    const audio=await f.prepare();
    expect(f.load.mock.calls.map(([,emitter])=>emitter.loopingSource!.track)).toEqual([0,1]);
    expect(f.starts).not.toHaveBeenCalled();
    await audio.start();
    expect(f.starts).toHaveBeenCalledTimes(2);
    audio.dispose();
  });
  it('closes and stops the audio track on a missing clip without starting voices', async () => {
    const f = fixture();
    f.load.mockRejectedValueOnce(Error('Missing pinned sounds.map'));
    await expect(f.prepare()).rejects.toThrow(/Wind:.*Missing pinned/);
    expect(f.close).toHaveBeenCalledTimes(1);
    expect(f.track.stop).toHaveBeenCalledTimes(1);
    expect(f.starts).not.toHaveBeenCalled();
  });
  it('cancels pending decoding and never starts a late sound', async () => {
    const f = fixture();
    let finish!: (value: AudioBuffer) => void;
    f.load.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = f.prepare();
    await vi.waitFor(() => expect(f.load).toHaveBeenCalled());
    f.controller.abort();
    finish(clip);
    await expect(pending).rejects.toThrow(/cancelled/);
    expect(f.close).toHaveBeenCalledTimes(1);
    expect(f.starts).not.toHaveBeenCalled();
  });
  it('refuses oversized clips and total budgets before recording', async () => {
    const f = fixture();
    f.load.mockResolvedValueOnce({ length: 9 * 1024 * 1024, numberOfChannels: 1 } as AudioBuffer);
    await expect(f.prepare()).rejects.toThrow(/32 MiB/);
    const g = fixture();
    g.scene.emitters = [1, 2, 3].map((id) => createEmitter(id, `Sound ${id}`));
    g.load.mockResolvedValue({ length: 8 * 1024 * 1024, numberOfChannels: 1 } as AudioBuffer);
    await expect(g.prepare()).rejects.toThrow(/64 MiB/);
    expect(g.starts).not.toHaveBeenCalled();
    expect(g.close).toHaveBeenCalledTimes(1);
  });
  it('rejects missing startup events and already cancelled takes before creating a context', async () => {
    const f = fixture();
    f.scene.emitters[0].event = 'weaponFire';
    await expect(f.prepare()).rejects.toThrow(/Ambient or Map start/);
    expect(f.context.resume).not.toHaveBeenCalled();
    f.scene.emitters[0].event = 'ambient';
    f.controller.abort();
    await expect(f.prepare()).rejects.toThrow(/cancelled/);
    expect(f.context.resume).not.toHaveBeenCalled();
  });
  it('honors the mixer event limit and rejects malformed scenes', () => {
    const f = fixture();
    f.scene.emitters = Array.from({ length: 40 }, (_, n) => ({
      ...createEmitter(n, `Sound ${n}`),
      priority: n,
    }));
    expect(directorSoundEmitters(f.scene)).toHaveLength(32);
    expect(directorSoundEmitters(f.scene)[0].priority).toBe(39);
    f.scene.emitters[0].position[0] = NaN;
    expect(() => directorSoundEmitters(f.scene)).toThrow();
  });
  it('closes a context when stream creation fails or audio stays suspended', async () => {
    const f = fixture();
    f.context.createMediaStreamDestination = () => {
      throw Error('No recording audio output');
    };
    await expect(f.prepare()).rejects.toThrow(/No recording audio output/);
    expect(f.close).toHaveBeenCalledTimes(1);
    const g = fixture();
    g.context.state = 'suspended';
    await expect(g.prepare()).rejects.toThrow(/Audio could not start/);
    expect(g.close).toHaveBeenCalledTimes(1);
    expect(g.track.stop).toHaveBeenCalledTimes(1);
    expect(g.load).not.toHaveBeenCalled();
  });
});
