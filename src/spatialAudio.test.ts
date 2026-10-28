import { describe, expect, it } from 'vitest';
import {
  busGain,
  checkedSoundChain,
  createEmitter,
  distanceGain,
  emptySoundScene,
  sourceSoundEmitters,
  SpatialSoundMixer,
  validateSoundScene,
} from './spatialAudio';
import type { MapInspection, SceneObject, SoundInspection } from './types';
function fakeContext() {
  const parameter = () => ({
      value: 1,
      setTargetAtTime(value: number) {
        this.value = value;
      },
    }),
    node = () => ({ connect() {}, disconnect() {} });
  let starts = 0;
  const ctx = {
    currentTime: 0,
    destination: {},
    createGain: () => ({ ...node(), gain: parameter() }),
    createPanner: () => ({
      ...node(),
      positionX: parameter(),
      positionY: parameter(),
      positionZ: parameter(),
    }),
    createBufferSource: () => ({
      ...node(),
      buffer: null,
      loop: false,
      playbackRate: parameter(),
      onended: null,
      start() {
        starts++;
      },
      stop() {},
    }),
    listener: Object.fromEntries(
      ['positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ'].map(
        (key) => [key, parameter()],
      ),
    ),
  };
  return { context: ctx as unknown as BaseAudioContext, starts: () => starts };
}
const buffer = { length: 2205, numberOfChannels: 1 } as AudioBuffer;
describe('positional sound events and mixer ownership', () => {
  it('rejects malformed saved emitter data without throwing or accepting extra buses', () => {
    const scene = emptySoundScene();
    for (const malformed of [
      null,
      {},
      { ...createEmitter(1, 'Bad'), name: null },
      { ...createEmitter(1, 'Bad'), position: null },
    ]) {
      scene.emitters = [malformed] as never;
      expect(validateSoundScene(scene).length).toBeGreaterThan(0);
    }
    scene.emitters = [];
    Object.assign(scene.buses, { unexpected: { gain: 1, muted: false, solo: false } });
    expect(validateSoundScene(scene).length).toBeGreaterThan(0);
  });
  it('follows actual segment links, rejects cycles and checks the complete clip budget', () => {
    const emitter = createEmitter(9, 'Linked sound'),
      hash = 'a'.repeat(64),
      report = {
        sourceSha256: hash,
        tagId: 9,
        permutations: [
          {
            pitchRange: 0,
            permutation: 0,
            available: true,
            durationSeconds: 2,
            channels: 1,
            sampleRate: 22050,
            nextPermutation: 2,
            chainStart: true,
          },
          {
            pitchRange: 0,
            permutation: 1,
            available: true,
            durationSeconds: 2,
            channels: 1,
            sampleRate: 22050,
            nextPermutation: null,
            chainStart: true,
          },
          {
            pitchRange: 0,
            permutation: 2,
            available: true,
            durationSeconds: 2,
            channels: 1,
            sampleRate: 22050,
            nextPermutation: null,
            chainStart: false,
          },
        ],
      } as SoundInspection;
    expect(checkedSoundChain(report, emitter, hash).map((p) => p.permutation)).toEqual([0, 2]);
    report.permutations[2].nextPermutation = 0;
    expect(() => checkedSoundChain(report, emitter, hash)).toThrow(/cyclic/);
    expect(checkedSoundChain(report, { ...emitter, followChain: false }, hash)).toHaveLength(1);
    report.permutations[2].nextPermutation = null;
    report.permutations[0].durationSeconds = 100;
    report.permutations[2].durationSeconds = 100;
    expect(() => checkedSoundChain(report, emitter, hash)).toThrow(/180 seconds/);
    report.permutations[0].durationSeconds = 2;
    report.permutations[2].available = false;
    expect(() => checkedSoundChain(report, emitter, hash)).toThrow(/unavailable/);
  });
  it('uses bounded distance attenuation and independent bus solo/mute', () => {
    const e = createEmitter(1, 'Wind');
    expect(distanceGain(e, 0)).toBe(1);
    expect(distanceGain(e, 4)).toBe(0.25);
    expect(distanceGain(e, 41)).toBe(0);
    const scene = emptySoundScene();
    scene.buses.music.solo = true;
    expect(busGain(scene, 'ambience')).toBe(0);
    expect(busGain(scene, 'music')).toBe(0.5);
    scene.buses.music.muted = true;
    expect(busGain(scene, 'music')).toBe(0);
    scene.emitters = [{ ...e, maxDistance: 0.1 }];
    expect(validateSoundScene(scene)).not.toEqual([]);
  });
  it('never plays a buffer that finishes loading after Stop', async () => {
    const fake = fakeContext();
    let finish!: (buffer: AudioBuffer) => void;
    const mixer = new SpatialSoundMixer(
        fake.context,
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      ),
      scene = emptySoundScene(),
      emitter = createEmitter(1, 'Pending');
    scene.emitters = [emitter];
    mixer.configure(scene);
    const task = mixer.play(emitter);
    expect(mixer.stats.loading).toBe(1);
    mixer.stop();
    finish(buffer);
    await task;
    expect(fake.starts()).toBe(0);
    expect(mixer.stats.voices).toBe(0);
    mixer.dispose();
  });
  it('shares a pending clip but keeps identical tag IDs from different maps separate', async () => {
    const fake = fakeContext();
    let count = 0,
      finish!: (buffer: AudioBuffer) => void;
    const mixer = new SpatialSoundMixer(fake.context, () => {
        count++;
        return new Promise((resolve) => {
          finish = resolve;
        });
      }),
      scene = emptySoundScene(),
      a = createEmitter(5, 'A'),
      b = createEmitter(5, 'B');
    scene.emitters = [a, b];
    mixer.configure(scene);
    const first = mixer.play(a),
      second = mixer.play(b);
    expect(count).toBe(1);
    finish(buffer);
    await Promise.all([first, second]);
    expect(mixer.stats.cachedClips).toBe(1);
    expect(mixer.stats.cachedBytes).toBe(8820);
    const c = {
      ...createEmitter(5, 'Other source'),
      sourceProjectId: crypto.randomUUID(),
      sourceSha256: 'b'.repeat(64),
    };
    scene.emitters.push(c);
    mixer.configure(scene);
    const third = mixer.play(c);
    expect(count).toBe(2);
    finish({ ...buffer } as AudioBuffer);
    await third;
    expect(mixer.stats.cachedClips).toBe(2);
    mixer.dispose();
  });
  it('keeps high priority voices and stops removed emitters immediately', async () => {
    const fake = fakeContext(),
      mixer = new SpatialSoundMixer(fake.context, async () => buffer),
      scene = emptySoundScene(),
      high = { ...createEmitter(1, 'High'), priority: 100 },
      low = { ...createEmitter(2, 'Low'), priority: 1 };
    scene.maxVoices = 1;
    scene.emitters = [high, low];
    mixer.configure(scene);
    await mixer.play(high);
    await mixer.play(low);
    expect(fake.starts()).toBe(1);
    scene.emitters = [low];
    mixer.configure(scene);
    expect(mixer.stats.voices).toBe(0);
    await mixer.play(low);
    expect(fake.starts()).toBe(2);
    mixer.dispose();
  });
  it('imports placed sound-scenery through actual attachment and loop references with stable identities', async () => {
    const inspection = {
        sha256: 'a'.repeat(64),
        tags: [
          {
            id: 1,
            class: 'ssce',
            references: [{ label: 'Attachment 1', targetId: 2, class: 'lsnd' }],
            fields: [],
          },
          {
            id: 2,
            class: 'lsnd',
            references: [
              { label: 'Track 1 · Start', targetId: 3, class: 'snd!' },
              { label: 'Track 1 · Loop', targetId: 3, class: 'snd!' },
            ],
            fields: [{ key: 'loop-0-gain', value: 0.25 }],
          },
          {
            id: 3,
            class: 'snd!',
            references: [],
            fields: [
              { key: 'sound-min-distance', value: 2 },
              { key: 'sound-max-distance', value: 30 },
            ],
          },
        ],
      } as unknown as MapInspection,
      objects = [{ id: 'vent-1', name: 'Vent', tagId: 1, position: [10, 20, 30] }] as SceneObject[];
    const first = await sourceSoundEmitters(inspection, objects),
      again = await sourceSoundEmitters(inspection, objects);
    expect(first).toHaveLength(1);
    expect(first[0].id).toBe(again[0].id);
    expect(first[0]).toMatchObject({
      tagId: 3,
      gain: 0.25,
      position: [10, 20, 30],
      minDistance: 2,
      maxDistance: 30,
    });
    first[0].position[0] = 50;
    expect(objects[0].position[0]).toBe(10);
  });
});
