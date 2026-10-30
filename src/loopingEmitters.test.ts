import { beforeEach, expect, it, vi } from 'vitest';
const { ipc } = vi.hoisted(() => ({ ipc: vi.fn() }));
vi.mock('./api', () => ({ call: ipc }));
import { loopingSoundEmitters } from './loopingEmitters';
import { validateSoundScene, emptySoundScene } from './spatialAudio';
import type { LoopingInspection } from './soundClipLoader';

const source = {
  projectId: '11111111-1111-4111-8111-111111111111',
  sha256: 'a'.repeat(64),
  tagId: 10,
  name: 'Forest',
};
let report: LoopingInspection;
beforeEach(() => {
  report = {
    tagId: 10,
    tagPath: 'sound/forest',
    sourceSha256: source.sha256,
    loops: true,
    warnings: [],
    tracks: [
      {
        index: 0,
        gain: 0.25,
        fadeInSeconds: 0,
        fadeOutSeconds: 0,
        startTagId: null,
        loopTagId: 11,
        endTagId: null,
      },
      {
        index: 1,
        gain: 0.75,
        fadeInSeconds: 0,
        fadeOutSeconds: 0,
        startTagId: null,
        loopTagId: 12,
        endTagId: null,
      },
    ],
  };
  ipc.mockReset();
  ipc.mockImplementation(async (command, args) =>
    command === 'inspect_looping_sound'
      ? report
      : {
          tagId: args.tagId,
          sourceSha256: source.sha256,
          permutations: [
            { available: true, chainStart: false, pitchRange: 0, permutation: 0 },
            { available: true, chainStart: true, pitchRange: 1, permutation: 3 },
          ],
        },
  );
});
it('retains every main track, authored gain, real chain start, pose and source identity', async () => {
  const group = await loopingSoundEmitters(source, [2, 3, 4]);
  expect(group.map((e) => [e.tagId, e.loopingSource?.track, e.gain])).toEqual([
    [11, 0, 0.25],
    [12, 1, 0.75],
  ]);
  expect(
    group.every(
      (e) =>
        e.sourceProjectId === source.projectId &&
        e.sourceSha256 === source.sha256 &&
        e.pitchRange === 1 &&
        e.permutation === 3 &&
        e.loop,
    ),
  ).toBe(true);
  expect(group.map((e) => e.name)).toEqual(['Forest · Track 1', 'Forest · Track 2']);
  expect(group[0].position).toEqual([2, 3, 4]);
  expect(validateSoundScene({ ...emptySoundScene(), emitters: group })).toEqual([]);
});
it('uses stable BSP identities across re-entry and distinct identities for other BSPs', async () => {
  const a = await loopingSoundEmitters(source, [0, 0, 0], 'bsp:0');
  const b = await loopingSoundEmitters(source, [0, 0, 0], 'bsp:0');
  const c = await loopingSoundEmitters(source, [0, 0, 0], 'bsp:1');
  expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
  expect(new Set([...a, ...c].map((e) => e.id)).size).toBe(4);
  const moved = await loopingSoundEmitters(source, [9, 8, 7], 'bsp:0');
  expect(moved.map((e) => e.id)).toEqual(a.map((e) => e.id));
});
it('keeps not-a-loop and zero gain semantics while deduplicating repeated sample inspection', async () => {
  report.loops = false;
  report.tracks[0].gain = 0;
  report.tracks[1].loopTagId = 11;
  const group = await loopingSoundEmitters(source, [0, 0, 0]);
  expect(group.map((e) => e.loop)).toEqual([false, false]);
  expect(group[0].gain).toBe(0);
  expect(ipc.mock.calls.filter(([command]) => command === 'inspect_sound')).toHaveLength(1);
  expect(group[0].id).not.toBe(group[1].id);
});
it('rejects an unavailable second track instead of returning a partial group', async () => {
  const normal = ipc.getMockImplementation()!;
  ipc.mockImplementation(async (command, args) =>
    command === 'inspect_sound' && args.tagId === 12
      ? { tagId: 12, sourceSha256: source.sha256, permutations: [] }
      : normal(command, args),
  );
  await expect(loopingSoundEmitters(source, [0, 0, 0])).rejects.toThrow(/Track 2.*no playable/);
});
it('rejects changed sample identities, duplicate tracks, invalid gain and excess tracks before publishing', async () => {
  const normal = ipc.getMockImplementation()!;
  ipc.mockImplementation(async (command, args) =>
    command === 'inspect_sound'
      ? { ...(await normal(command, args)), sourceSha256: 'b'.repeat(64) }
      : normal(command, args),
  );
  await expect(loopingSoundEmitters(source, [0, 0, 0])).rejects.toThrow(/different source/);
  ipc.mockImplementation(normal);
  report.tracks[1].index = 0;
  await expect(loopingSoundEmitters(source, [0, 0, 0])).rejects.toThrow(/duplicate/);
  report.tracks[1].index = 1;
  report.tracks[1].gain = NaN;
  await expect(loopingSoundEmitters(source, [0, 0, 0])).rejects.toThrow(/invalid/);
  report.tracks = Array.from({ length: 5 }, () => ({ ...report.tracks[0] }));
  await expect(loopingSoundEmitters(source, [0, 0, 0])).rejects.toThrow(/limit/);
});
it('cancels a late source inspection and never begins its sample requests', async () => {
  let finish!: (value: LoopingInspection) => void,
    cancelled = false;
  ipc.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = loopingSoundEmitters(source, [0, 0, 0], undefined, () => cancelled);
  cancelled = true;
  finish(report);
  await expect(pending).rejects.toThrow(/stopped/);
  expect(ipc).toHaveBeenCalledTimes(1);
});
it('rejects unsupported positions and empty or stale groups', async () => {
  await expect(loopingSoundEmitters(source, [Infinity, 0, 0])).rejects.toThrow(/finite/);
  expect(ipc).not.toHaveBeenCalled();
  report.tracks = [];
  await expect(loopingSoundEmitters(source, [0, 0, 0])).rejects.toThrow(/no main/);
  report.sourceSha256 = 'b'.repeat(64);
  await expect(loopingSoundEmitters(source, [0, 0, 0])).rejects.toThrow(/identity/);
});
