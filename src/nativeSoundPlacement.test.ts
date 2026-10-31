import { beforeEach, expect, it, vi } from 'vitest';
import { createEmitter, emptySoundScene } from './spatialAudio';
import { includePreparedSound, nativeSoundUnavailable, prepareNativeSound } from './nativeSoundPlacement';
import { editRevisionKey, changedEditInputs } from './smartEdit';
import { historyReducer, initialHistory } from './editor';
import type { NativeAssetImport, Project } from './types';
const api = vi.hoisted(() => ({ call: vi.fn(), native: true }));
vi.mock('./api', () => api);
const sourceId = '22222222-2222-4222-8222-222222222222',
  hash = 'a'.repeat(64);
const binding: NativeAssetImport = {
  id: '33333333-3333-4333-8333-333333333333',
  sourceProjectId: sourceId,
  sourceSha256: hash,
  tagId: 4,
  tagClass: 'lsnd',
  tagPath: 'sound/ambient/wind',
  nativePath: 'gs_assets_33333333333343338333333333333333/sound/ambient/wind',
  receiptSha256: 'b'.repeat(64),
  fileCount: 3,
};
function fixture() {
  const emitter = {
    ...createEmitter(5, 'Wind', [0, 0, 1]),
    loopingSource: { tagId: 4, track: 0 },
    sourceProjectId: sourceId,
    sourceSha256: hash,
  };
  const project = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Map',
    scene: [],
    tagEdits: [],
    assets: [],
    history: [],
    builds: [],
    quickForge: { runtimeId: 'mccSteam' },
    audioPreview: { ...emptySoundScene(), emitters: [emitter] },
  } as unknown as Project;
  return { project, emitter };
}
beforeEach(() => {
  api.call.mockReset();
  api.call.mockImplementation(async (command: string) => {
    if (command === 'open_project')
      return {
        inspection: {
          sha256: hash,
          header: { version: 13 },
          tags: [{ id: 4, class: 'lsnd', path: 'sound/ambient/wind' }],
        },
      };
    if (command === 'prepare_native_asset_import') return binding;
    throw Error(command);
  });
});
it('verifies the preserved loop before requesting an existing local recursive import', async () => {
  const { project, emitter } = fixture();
  const prepared = await prepareNativeSound(project, emitter, sourceId);
  expect(prepared.binding).toEqual(binding);
  expect(api.call.mock.calls.map((row) => row[0])).toEqual(['open_project', 'prepare_native_asset_import']);
  expect(api.call.mock.calls[1][1]).toEqual({
    projectId: project.id,
    sourceProjectId: sourceId,
    sourceSha256: hash,
    tagId: 4,
  });
  api.call.mockClear();
  await expect(
    prepareNativeSound(project, { ...emitter, sourceSha256: 'c'.repeat(64) }, sourceId),
  ).rejects.toThrow('changed');
  expect(api.call).toHaveBeenCalledTimes(1);
});
it('merges only placement intent into the latest document and is one undoable edit', async () => {
  const { project, emitter } = fixture();
  const prepared = await prepareNativeSound(project, emitter, sourceId);
  const latest = {
    ...project,
    title: 'Changed during extraction',
    audioPreview: {
      ...project.audioPreview!,
      emitters: [{ ...emitter, position: [2, 3, 4] as [number, number, number], gain: 0.4 }],
    },
  };
  const next = includePreparedSound(latest, emitter, prepared);
  expect(next.title).toBe(latest.title);
  expect(next.audioPreview.emitters[0]).toMatchObject({
    nativePlacement: true,
    position: [2, 3, 4],
    gain: 0.4,
  });
  const history = historyReducer(historyReducer(initialHistory, { type: 'load', project: latest }), {
    type: 'edit',
    project: next,
    description: 'Include native loop',
  });
  expect(historyReducer(history, { type: 'undo' }).current).toEqual(latest);
  const removed = { ...latest, audioPreview: { ...latest.audioPreview, emitters: [] } };
  expect(() => includePreparedSound(removed, emitter, prepared)).toThrow('changed');
});
it('rejects duplicate full loops and unsupported source, runtime, custom clip and shared source routes', async () => {
  const { project, emitter } = fixture();
  const prepared = await prepareNativeSound(project, emitter, sourceId);
  expect(() =>
    includePreparedSound(
      {
        ...project,
        audioPreview: {
          ...project.audioPreview!,
          emitters: [emitter, { ...emitter, id: crypto.randomUUID(), nativePlacement: true }],
        },
      },
      emitter,
      prepared,
    ),
  ).toThrow('whole');
  expect(nativeSoundUnavailable({ ...project, quickForge: null }, emitter)).toContain('QuickForge');
  expect(
    nativeSoundUnavailable(
      { ...project, quickForge: { ...project.quickForge!, runtimeId: 'haloCustomEdition' } },
      emitter,
    ),
  ).toContain('MCC');
  expect(
    nativeSoundUnavailable(
      { ...project, quickForge: { ...project.quickForge!, native: {} as never } },
      emitter,
    ),
  ).toContain('SparkLink');
  expect(nativeSoundUnavailable(project, { ...emitter, loopingSource: null })).toContain('original');
});
it('native intent expires the save plan but rehearsal sliders do not', () => {
  const { project, emitter } = fixture();
  const before = editRevisionKey(project);
  const included = {
    ...project,
    audioPreview: { ...project.audioPreview!, emitters: [{ ...emitter, nativePlacement: true }] },
  };
  const key = editRevisionKey(included);
  expect(changedEditInputs(before, key)).toEqual(['Native sound emitters']);
  expect(
    editRevisionKey({
      ...included,
      audioPreview: {
        ...included.audioPreview,
        muted: true,
        master: 0,
        emitters: [{ ...included.audioPreview.emitters[0], gain: 0, pitch: 2, enabled: false }],
      },
    }),
  ).toBe(key);
  expect(
    editRevisionKey({
      ...included,
      audioPreview: {
        ...included.audioPreview,
        emitters: [{ ...included.audioPreview.emitters[0], position: [1, 2, 3] }],
      },
    }),
  ).not.toBe(key);
});
