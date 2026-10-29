import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const hooks = vi.hoisted(() => ({
  focus: null as null | ((focused: boolean) => void),
  load: vi.fn(),
  ipc: vi.fn(),
}));
vi.mock('./api', () => ({ native: true, call: hooks.ipc }));
vi.mock('./windowFocus', () => ({
  observeWindowFocus: (callback: (focused: boolean) => void) => {
    hooks.focus = callback;
    callback(true);
    return () => {
      hooks.focus = null;
    };
  },
}));
vi.mock('./soundClipLoader', () => ({ loadMapSoundClip: hooks.load }));
import { ambienceCluster, EditorAudioSession } from './editorAudio';
import type { AmbienceBsp } from './editorAudio';
import { createEmitter, emptySoundScene, publishAudioListener } from './spatialAudio';
import type { Project } from './types';

let starts = 0,
  closes = 0;
const masters: { value: number; setTargetAtTime: (value: number) => void }[] = [];
class Context {
  state = 'running';
  get currentTime(){return Date.now()/1000;}
  destination = {};
  sampleRate = 48000;
  listener = Object.fromEntries(
    ['positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ'].map(
      (key) => [key, parameter()],
    ),
  );
  resume = async () => {};
  close = async () => {
    this.state = 'closed';
    closes++;
  };
  createGain() {
    const gain = parameter();
    masters.push(gain);
    return { ...node(), gain };
  }
  createAnalyser() {
    return { ...node(), fftSize: 256, getFloatTimeDomainData: (values: Float32Array) => values.fill(0.01) };
  }
  createBufferSource() {
    return {
      ...node(),
      buffer: null,
      loop: false,
      playbackRate: parameter(),
      onended: null,
      start: () => {
        starts++;
      },
      stop: () => {},
    };
  }
}
function node() {
  return { connect() {}, disconnect() {} };
}
function parameter() {
  return {
    value: 1,
    setTargetAtTime(value: number) {
      this.value = value;
    },
  };
}
const projectId = '11111111-1111-4111-8111-111111111111';
function configuration() {
  const scene = emptySoundScene(),
    emitter = createEmitter(3, 'Authored ambience');
  emitter.spatial = false;
  scene.emitters = [emitter];
  return {
    project: { id: projectId, scene: [], assets: [], audioPreview: scene } as unknown as Project,
    inspection: null,
    active: true,
    muted: false,
    volume: 0.4,
    bspIndex: 0,
    resourceScope: '',
  };
}
async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('AudioContext', Context);
  starts = 0;
  closes = 0;
  masters.length = 0;
  hooks.ipc.mockReset();
  hooks.load.mockReset();
  hooks.load.mockResolvedValue({ length: 4800, numberOfChannels: 1, duration: 0.1 } as AudioBuffer);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('plays authored ambience automatically, adjusts the actual master gain, and avoids duplicate voices', async () => {
  const session = new EditorAudioSession(projectId),
    config = configuration();
  session.connect();
  session.update(config);
  await flush();
  expect(starts).toBe(1);
  expect(session.getSnapshot().voices).toBe(1);
  expect(masters[0].value).toBe(0.2);
  await vi.advanceTimersByTimeAsync(2000);
  expect(starts).toBe(1);
  expect(hooks.load).toHaveBeenCalledTimes(1);
  session.update({ ...config, volume: 0.2 });
  expect(masters[0].value).toBe(0.1);
  session.update({ ...config, muted: true });
  expect(masters[0].value).toBe(0);
  expect(session.getSnapshot().phase).toBe('muted');
  session.update(config);
  await flush();
  expect(starts).toBe(1);
  expect(masters[0].value).toBe(0.2);
  session.dispose();
  expect(closes).toBe(1);
  expect(vi.getTimerCount()).toBe(0);
});
it('releases on native focus loss, resumes on return, and never treats cancelled loads as broken clips', async () => {
  let complete!: (buffer: AudioBuffer) => void;
  hooks.load.mockImplementationOnce(
    () =>
      new Promise<AudioBuffer>((resolve) => {
        complete = resolve;
      }),
  );
  const session = new EditorAudioSession(projectId),
    config = configuration();
  session.connect();
  session.update(config);
  await flush();
  hooks.focus!(false);
  complete({ length: 4800, numberOfChannels: 1 } as AudioBuffer);
  await flush();
  expect(starts).toBe(0);
  hooks.focus!(true);
  await flush();
  expect(starts).toBe(1);
  expect(session.getSnapshot().phase).toBe('playing');
  session.setLive(true);
  expect(session.getSnapshot().voices).toBe(0);
  await vi.advanceTimersByTimeAsync(500);
  expect(starts).toBe(1);
  session.setLive(false);
  await flush();
  expect(starts).toBe(2);
  session.update({ ...config, active: false });
  expect(session.getSnapshot().voices).toBe(0);
  session.dispose();
});
it('keeps failed sources bounded and allows a new pinned source revision to retry', async () => {
  hooks.load.mockRejectedValue(Error('Pinned sound resource is unavailable'));
  const session = new EditorAudioSession(projectId),
    config = configuration();
  session.connect();
  session.update(config);
  await flush();
  await vi.advanceTimersByTimeAsync(4000);
  expect(hooks.load).toHaveBeenCalledTimes(1);
  expect(session.getSnapshot().detail).toMatch(/Pinned sound/);
  hooks.load.mockResolvedValue({ length: 4800, numberOfChannels: 1 } as AudioBuffer);
  session.update({ ...config, resourceScope: 'new pinned resource' });
  await flush();
  expect(hooks.load).toHaveBeenCalledTimes(2);
  expect(starts).toBe(1);
  session.dispose();
  session.connect();
  session.update(config);
  await vi.advanceTimersByTimeAsync(200);
  expect(starts).toBe(2);
  session.dispose();
  expect(vi.getTimerCount()).toBe(0);
});
it('follows the actual BSP branch and leaf cluster while refusing void, cycles and invalid positions', () => {
  const bsp: AmbienceBsp = {
    index: 0,
    tagPath: 'levels/test',
    backgroundPalette: [],
    clusters: [],
    listenerTree: { nodes: [[0, 0x80000000, 0x80000001]], planes: [[1, 0, 0, 3]], leafClusters: [2, 7] },
  };
  expect(ambienceCluster(bsp, [2, 0, 0])).toBe(2);
  expect(ambienceCluster(bsp, [4, 0, 0])).toBe(7);
  bsp.listenerTree!.nodes[0][2] = 0xffffffff;
  expect(ambienceCluster(bsp, [4, 0, 0])).toBeNull();
  bsp.listenerTree!.nodes[0][2] = 0;
  expect(ambienceCluster(bsp, [4, 0, 0])).toBeNull();
  expect(ambienceCluster(bsp, [NaN, 0, 0])).toBeNull();
  publishAudioListener(projectId, { position: [4, 0, 0], forward: [1, 0, 0], up: [0, 0, 1] });
});
it('uses an assigned overview loop, honors a silent cluster, and resumes its exact pinned loop on return', async () => {
  const config = configuration(),
    hash = 'a'.repeat(64);
  config.project.audioPreview!.emitters = [];
  config.project.source = { sha256: hash } as Project['source'];
  const metadata = {
    sourceSha256: hash,
    bsps: [
      {
        index: 0,
        tagPath: 'levels/test',
        backgroundPalette: [{ tagPath: 'sound/actual' }],
        clusters: [
          { index: 0, background: 0 },
          { index: 1, background: null },
        ],
        listenerTree: {
          nodes: [
            [0, 0x80000000, 1],
            [1, 0x80000001, 0xffffffff],
          ],
          planes: [
            [1, 0, 0, 0],
            [0, 1, 0, 0],
          ],
          leafClusters: [0, 1],
        },
      },
    ],
  };
  hooks.ipc.mockImplementation(async (command, args) =>
    command === 'inspect_map_ambience'
      ? metadata
      : command === 'inspect_looping_sound'
        ? { sourceSha256: hash, tagId: 10, loops: true, tracks: [{ index: 0, loopTagId: 11, gain: 1 }] }
        : command === 'inspect_sound'
          ? {
              sourceSha256: hash,
              tagId: args.tagId,
              permutations: [{ available: true, pitchRange: 0, permutation: 0 }],
            }
          : null,
  );
  const inspection = {
    sha256: hash,
    tags: [
      { id: 1, class: 'sbsp' },
      { id: 10, class: 'lsnd', path: 'sound/actual' },
    ],
  } as never;
  publishAudioListener(projectId, { position: [1, 1, 0], forward: [1, 0, 0], up: [0, 0, 1] });
  const session = new EditorAudioSession(projectId);
  session.connect();
  session.update({ ...config, inspection });
  await flush();
  await vi.advanceTimersByTimeAsync(200);
  expect(starts).toBe(1);
  publishAudioListener(projectId, { position: [1, -1, 0], forward: [1, 0, 0], up: [0, 0, 1] });
  await vi.advanceTimersByTimeAsync(200);
  expect(session.getSnapshot().voices).toBe(0);
  publishAudioListener(projectId, { position: [-1, 0, 0], forward: [1, 0, 0], up: [0, 0, 1] });
  await vi.advanceTimersByTimeAsync(200);
  expect(starts).toBe(2);
  expect(hooks.load).toHaveBeenCalledTimes(1);
  session.dispose();
});
