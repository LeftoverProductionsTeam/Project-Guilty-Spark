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
it('hashes imported custom audio, checks decoded dimensions, and refuses substitution or resampling overflow',async()=>{
  const bytes=Uint8Array.of(1,2,3,4),sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
  const selected={...emitter,tagId:0,sourceProjectId:'donor',sourceSha256:sha,loopingSource:null,customSound:{assetId:'asset',sha256:sha}};
  const payload={assetId:'asset',sha256:sha,info:{channels:1,durationSeconds:1},base64:btoa(String.fromCharCode(...bytes))};
  ipc.mockResolvedValue(payload);const decodeAudioData=vi.fn().mockResolvedValue(pcm([1,2,3,4]));const customContext={...context,decodeAudioData} as unknown as BaseAudioContext;
  expect(await loadMapSoundClip(customContext,selected,'owner',hash,()=>false)).toHaveProperty('duration',1);
  expect(ipc).toHaveBeenLastCalledWith('preview_custom_sound',{projectId:'donor',assetId:'asset',sha256:sha});
  ipc.mockResolvedValue({...payload,base64:btoa('wrong')});await expect(loadMapSoundClip(customContext,selected,'owner',hash,()=>false)).rejects.toThrow(/bytes differ/);
  ipc.mockResolvedValue({...payload,info:{channels:2,durationSeconds:180}});await expect(loadMapSoundClip({...customContext,sampleRate:192000} as BaseAudioContext,selected,'owner',hash,()=>false)).rejects.toThrow(/budget/);
  expect(decodeAudioData).toHaveBeenCalledTimes(1);
  ipc.mockResolvedValue(payload);decodeAudioData.mockResolvedValue({...pcm([1,2,3,4]),numberOfChannels:2});await expect(loadMapSoundClip(customContext,selected,'owner',hash,()=>false)).rejects.toThrow(/dimensions/);
});
