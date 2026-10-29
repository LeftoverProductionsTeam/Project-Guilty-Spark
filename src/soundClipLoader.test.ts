import { beforeEach, expect, it, vi } from 'vitest';
const { ipc, decode } = vi.hoisted(() => ({ ipc: vi.fn(), decode: vi.fn() }));
vi.mock('./api', () => ({ call: ipc }));
vi.mock('./spatialAudio', () => ({ decodeSoundChain: decode }));
import { loadMapSoundClip } from './soundClipLoader';
import { soundPlayback } from './soundPlayback';
const hash = 'a'.repeat(64);
const emitter: any = { tagId: 3, pitchRange: 0, permutation: 2, loopingSource: { tagId: 10, track: 0 } };
function pcm(values: number[]): AudioBuffer {
  const data = Float32Array.from(values);
  return {
    length: data.length,
    numberOfChannels: 1,
    sampleRate: 4,
    duration: data.length / 4,
    getChannelData: () => data,
    copyToChannel: (samples: Float32Array, _channel: number, offset = 0) => data.set(samples, offset),
    copyFromChannel: (samples: Float32Array, _channel: number, offset = 0) =>
      samples.set(data.subarray(offset, offset + samples.length)),
  } as AudioBuffer;
}
const context = {
  sampleRate: 4,
  createBuffer: (_channels: number, length: number) => pcm(Array(length).fill(0)),
} as unknown as BaseAudioContext;
let report: any;
beforeEach(() => {
  ipc.mockReset();
  decode.mockReset();
  report = {
    tagId: 10,
    sourceSha256: hash,
    loops: true,
    tracks: [
      { index: 0, startTagId: 2, loopTagId: 3, endTagId: 4, fadeInSeconds: 0.25, fadeOutSeconds: 0.5 },
    ],
  };
  ipc.mockImplementation(async (command, args) => {
    if (command === 'inspect_looping_sound') return structuredClone(report);
    if (command === 'inspect_sound')
      return {
        tagId: args.tagId,
        tagPath: `phase/${args.tagId}`,
        sourceSha256: hash,
        permutations: [{ available: true, chainStart: true, pitchRange: 0, permutation: 0 }],
      };
    throw Error('Unexpected synthetic IPC');
  });
  decode.mockImplementation(async (_context, selected) =>
    pcm(selected.tagId === 2 ? [1, 2] : selected.tagId === 3 ? [3, 4, 5, 6] : [7, 8]),
  );
});
it('resolves source phases with their own root selections while preserving the chosen loop permutation', async () => {
  const clip = soundPlayback(await loadMapSoundClip(context, emitter, 'source', hash, () => false));
  expect(clip.buffer.getChannelData(0)).toEqual(Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8]));
  expect([clip.loopStart, clip.loopEnd, clip.outroStart, clip.fadeInSeconds, clip.fadeOutSeconds]).toEqual([
    0.5, 1.5, 1.5, 0.25, 0.5,
  ]);
  expect(decode.mock.calls.map((call) => [call[1].tagId, call[1].permutation])).toEqual([
    [3, 2],
    [2, 0],
    [4, 0],
  ]);
});
it('never substitutes a loop when its source identity or saved track changed', async () => {
  report.sourceSha256 = 'b'.repeat(64);
  await expect(loadMapSoundClip(context, emitter, 'source', hash, () => false)).rejects.toThrow(
    /identity changed/,
  );
  expect(decode).not.toHaveBeenCalled();
  report.sourceSha256 = hash;
  report.tracks[0].loopTagId = 99;
  await expect(loadMapSoundClip(context, emitter, 'source', hash, () => false)).rejects.toThrow(
    /no longer matches/,
  );
  expect(decode).not.toHaveBeenCalled();
});
it('fails a missing source phase before returning a playable partial bundle', async () => {
  decode.mockImplementation(async (_context, selected) => {
    if (selected.tagId === 4) throw Error('Pinned ending unavailable');
    return pcm([1, 2]);
  });
  await expect(loadMapSoundClip(context, emitter, 'source', hash, () => false)).rejects.toThrow(
    /Pinned ending unavailable/,
  );
});
it('keeps old loop-only emitters valid and honors a linked project identity for every phase', async () => {
  await loadMapSoundClip(context, { ...emitter, loopingSource: null }, 'source', hash, () => false);
  expect(ipc.mock.calls.some((call) => call[0] === 'inspect_looping_sound')).toBe(false);
  ipc.mockClear();
  await loadMapSoundClip(
    context,
    { ...emitter, sourceProjectId: 'other-project', sourceSha256: hash },
    'owner',
    hash,
    () => false,
  );
  expect(ipc.mock.calls.every((call) => call[1].projectId === 'other-project')).toBe(true);
});
