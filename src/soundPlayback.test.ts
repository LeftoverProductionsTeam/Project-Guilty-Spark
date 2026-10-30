import { describe, expect, it } from 'vitest';
import { joinSoundPhases, soundBytes, soundKey, soundPlayback } from './soundPlayback';
import { createEmitter, emptySoundScene, SpatialSoundMixer } from './spatialAudio';
function buffer(channels: number[][], rate = 4): AudioBuffer {
  const data = channels.map((values) => Float32Array.from(values));
  return {
    length: data[0].length,
    numberOfChannels: channels.length,
    sampleRate: rate,
    duration: data[0].length / rate,
    getChannelData: (channel: number) => data[channel],
    copyToChannel: (values: Float32Array, channel: number, offset = 0) => data[channel].set(values, offset),
  } as AudioBuffer;
}
function context() {
  const params: any[] = [],
    sources: any[] = [];
  const parameter = () => {
    const result = {
      value: 1,
      events: [] as any[],
      setTargetAtTime(value: number) {
        this.value = value;
      },
      setValueAtTime(value: number, at: number) {
        this.events.push(['set', value, at]);
      },
      linearRampToValueAtTime(value: number, at: number) {
        this.events.push(['ramp', value, at]);
      },
      cancelAndHoldAtTime(at: number) {
        this.events.push(['hold', at]);
      },
    };
    params.push(result);
    return result;
  };
  const node = () => ({ connect() {}, disconnect() {} });
  const ctx = {
    currentTime: 0,
    sampleRate: 4,
    destination: {},
    createBuffer: (channels: number, length: number, rate: number) =>
      buffer(
        Array.from({ length: channels }, () => Array(length).fill(0)),
        rate,
      ),
    createGain: () => ({ ...node(), gain: parameter() }),
    createPanner: () => ({
      ...node(),
      positionX: parameter(),
      positionY: parameter(),
      positionZ: parameter(),
    }),
    createBufferSource: () => {
      const source = {
        ...node(),
        buffer: null as AudioBuffer | null,
        loop: false,
        playbackRate: parameter(),
        onended: null as (() => void) | null,
        starts: [] as any[],
        stops: [] as number[],
        start(at = 0, offset = 0) {
          this.starts.push([at, offset]);
        },
        stop(at = 0) {
          this.stops.push(at);
        },
      };
      sources.push(source);
      return source;
    },
    listener: Object.fromEntries(
      ['positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ'].map(
        (key) => [key, parameter()],
      ),
    ),
  };
  return { context: ctx as unknown as BaseAudioContext, clock: ctx, sources, params };
}
describe('authored sound phases', () => {
  it('joins PCM once and keeps a sample-aligned repeating interval and ending offset', () => {
    const f = context(),
      clip = joinSoundPhases(f.context, buffer([[1, 2]]), buffer([[3, 4, 5, 6]]), buffer([[7, 8]]));
    expect(clip.buffer.getChannelData(0)).toEqual(Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8]));
    expect([clip.loopStart, clip.loopEnd, clip.outroStart]).toEqual([0.5, 1.5, 1.5]);
    expect(soundBytes(clip)).toBe(32);
  });
  it('preserves mono/stereo phases and rejects rate, interval and memory violations', () => {
    const f = context(),
      joined = joinSoundPhases(
        f.context,
        buffer([[1, 2]]),
        buffer([
          [3, 4],
          [5, 6],
        ]),
      );
    expect(joined.buffer.getChannelData(1)).toEqual(Float32Array.from([1, 2, 5, 6]));
    expect(() => joinSoundPhases(f.context, buffer([[1]], 8), buffer([[2]]))).toThrow(/sample rates/);
    expect(() =>
      joinSoundPhases(f.context, undefined, {
        length: 9 * 1024 * 1024,
        numberOfChannels: 1,
        sampleRate: 4,
      } as AudioBuffer),
    ).toThrow(/32 MiB/);
    expect(() => soundPlayback({ buffer: buffer([[1, 2]]), loopStart: 1, loopEnd: 0 })).toThrow(/interval/);
    expect(() => soundPlayback({ buffer: buffer([[1, 2]]), outroStart: 0.5 })).toThrow(/ending offset/);
  });
  it('plays the intro once, repeats the main phase and schedules its ending after the source fade', async () => {
    const f = context(),
      clip = {
        ...joinSoundPhases(f.context, buffer([[1, 2]]), buffer([[3, 4, 5, 6]]), buffer([[7, 8]])),
        fadeInSeconds: 0.25,
        fadeOutSeconds: 0.5,
      };
    const m = new SpatialSoundMixer(f.context, async () => clip),
      scene = emptySoundScene(),
      e = createEmitter(1, 'Engine');
    scene.emitters = [e];
    m.configure(scene);
    await m.play(e);
    expect(f.sources[0].loop).toBe(true);
    expect(f.sources[0].loopStart).toBe(0.5);
    expect(f.sources[0].loopEnd).toBe(1.5);
    expect(f.sources[0].starts).toEqual([[0, 0]]);
    f.clock.currentTime = 3;
    let finished = false;
    const ending = m.finish().then(() => {
      finished = true;
    });
    expect(f.sources[0].stops).toEqual([3.5]);
    expect(f.sources[1].starts).toEqual([[3.5, 1.5]]);
    expect(f.sources[1].buffer).toBe(f.sources[0].buffer);
    expect(finished).toBe(false);
    expect(
      f.params.some((parameter) =>
        parameter.events.some((event: any) => event[0] === 'ramp' && event[1] === 0 && event[2] === 3.5),
      ),
    ).toBe(true);
    f.sources[1].onended();
    await ending;
    expect(m.stats.voices).toBe(0);
    expect(finished).toBe(true);
    m.dispose();
  });
  it('plays a source one-shot as a gapless buffer without restarting its ending in JS', async () => {
    const f = context(),
      clip = { ...joinSoundPhases(f.context, buffer([[1]]), buffer([[2]]), buffer([[3]])), canLoop: false };
    const m = new SpatialSoundMixer(f.context, async () => clip),
      scene = emptySoundScene(),
      e = createEmitter(1, 'One shot');
    scene.emitters = [e];
    m.configure(scene);
    await m.play(e);
    expect(f.sources[0].loop).toBe(false);
    expect(f.sources[0].buffer.getChannelData(0)).toEqual(Float32Array.from([1, 2, 3]));
    f.sources[0].onended();
    expect(f.sources).toHaveLength(1);
    expect(m.repeats(e)).toBe(false);
    expect(m.stats.voices).toBe(0);
    m.dispose();
  });
  it('immediate disposal stops both scheduled sources and resolves graceful finish', async () => {
    const f = context(),
      clip = {
        ...joinSoundPhases(f.context, undefined, buffer([[1, 2]]), buffer([[3, 4]])),
        fadeOutSeconds: 2,
      };
    const m = new SpatialSoundMixer(f.context, async () => clip),
      scene = emptySoundScene(),
      e = createEmitter(1, 'Cut');
    scene.emitters = [e];
    m.configure(scene);
    await m.play(e);
    const ending = m.finish();
    m.dispose();
    await ending;
    expect(m.stats.voices).toBe(0);
    expect(f.sources.every((source) => source.stops.includes(0))).toBe(true);
    expect(m.stats.cachedBytes).toBe(0);
  });
  it('separates authored track keys and shares an identical concurrent clip once', async () => {
    const f = context(),
      clip = joinSoundPhases(f.context, undefined, buffer([[1, 2]]), buffer([[3, 4]]));
    let loads = 0;
    const m = new SpatialSoundMixer(f.context, async () => {
        loads++;
        return clip;
      }),
      scene = emptySoundScene(),
      a = createEmitter(1, 'A'),
      b = createEmitter(1, 'B');
    a.loopingSource = { tagId: 9, track: 0 };
    b.loopingSource = { tagId: 9, track: 0 };
    scene.emitters = [a, b];
    m.configure(scene);
    await Promise.all([m.play(a), m.play(b)]);
    expect(loads).toBe(1);
    expect(m.stats.cachedBytes).toBe(16);
    expect(m.stats.voices).toBe(2);
    expect(soundKey(a)).not.toBe(soundKey({ ...a, loopingSource: { tagId: 9, track: 1 } }));
    m.dispose();
  });
  it('releases voices and reports an ending-device failure', async () => {
    const f = context(),
      clip = joinSoundPhases(f.context, undefined, buffer([[1]]), buffer([[2]])),
      create = f.clock.createBufferSource;
    let count = 0;
    f.clock.createBufferSource = () => {
      const node = create();
      if (++count === 2)
        node.start = () => {
          throw Error('device failed');
        };
      return node;
    };
    const m = new SpatialSoundMixer(f.context, async () => clip),
      scene = emptySoundScene(),
      e = createEmitter(1, 'Broken');
    scene.emitters = [e];
    m.configure(scene);
    await m.play(e);
    await expect(m.finish()).rejects.toThrow(/device failed/);
    expect(m.stats.voices).toBe(0);
    expect(m.error).toContain('device failed');
    m.dispose();
  });
});
