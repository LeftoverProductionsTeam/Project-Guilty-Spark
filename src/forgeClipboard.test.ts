import { beforeEach, expect, it, vi } from 'vitest';
import { appendForgeNodes, forgeNodes } from './forge';
import { applyForgePaste, copyForgeSelection, prepareForgePaste, readForgeSelection } from './forgeClipboard';
import { historyReducer, initialHistory } from './editor';
import type { Project, NativeAssetImport } from './types';
const project = (): Project => ({
  schemaVersion: 1,
  id: 'origin',
  title: 'Source',
  createdAt: '',
  modifiedAt: '',
  source: null,
  provenance: {
    creator: '',
    community: '',
    releaseYear: null,
    description: '',
    sourceUrl: '',
    permissions: '',
  },
  scene: [],
  assets: [],
  tagEdits: [],
  history: [],
  builds: [],
  quickForge: {
    schemaVersion: 1,
    name: 'Source',
    template: 'customBlank',
    runtimeId: 'mccSteam',
    gameMode: 'slayer',
    skyPath: null,
    buildQuality: 'draft',
    geometry: [],
    materials: [],
    spawns: [],
    objectives: [],
    placements: [
      {
        id: 'boulder',
        name: 'Boulder',
        tagId: 7,
        tagPath: 'scenery/rocks/boulder',
        tagClass: 'scen',
        sourceProjectId: 'native-source',
        sourceSha256: 'a'.repeat(64),
        position: [1, 2, 0],
        rotation: [0, 0, 0.25],
        visible: true,
        locked: false,
        team: 0,
        respawnSeconds: 30,
      },
    ],
  },
});
const binding = {
  id: 'new-binding',
  sourceProjectId: 'native-source',
  sourceSha256: 'a'.repeat(64),
  tagId: 7,
  tagClass: 'scen',
  tagPath: 'scenery/rocks/boulder',
  nativePath: 'gs_assets_new/scenery/rocks/boulder',
  receiptSha256: 'b'.repeat(64),
  fileCount: 5,
} as NativeAssetImport;
let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
});
it('Alt-drag clones transformed placements with fresh identity while retaining original sources and one Undo', () => {
  const p = project(),
    before = structuredClone(p);
  const node = forgeNodes(p.quickForge!)[0];
  node.value = { ...node.value, position: [8, 9, 2] };
  const result = appendForgeNodes(p.quickForge!, [node]);
  expect(p).toEqual(before);
  expect(result.document.placements[0].position).toEqual([1, 2, 0]);
  expect(result.document.placements[1].position).toEqual([8, 9, 2]);
  expect(result.ids[0]).not.toBe('boulder');
  expect(result.document.placements[1].sourceSha256).toBe('a'.repeat(64));
  let history = historyReducer(initialHistory, { type: 'load', project: p });
  history = historyReducer(history, {
    type: 'edit',
    project: { ...p, quickForge: result.document },
    description: 'Duplicate and move',
  });
  expect(history.past).toHaveLength(1);
  expect(historyReducer(history, { type: 'undo' }).current).toEqual(p);
});
it('same-map copy/paste preserves native dependency bindings without extraction or shared mutable objects', async () => {
  const p = project();
  copyForgeSelection(p, ['boulder']);
  const clip = readForgeSelection()!;
  clip.nodes[0].value.position[0] = 50;
  expect(readForgeSelection()!.nodes[0].value.position[0]).toBe(1);
  const prepare = vi.fn().mockResolvedValue(binding);
  const first = applyForgePaste(p, await prepareForgePaste(p, readForgeSelection()!, prepare));
  const second = applyForgePaste(
    first.project,
    await prepareForgePaste(first.project, readForgeSelection()!, prepare),
  );
  expect(prepare).toHaveBeenCalledTimes(2);
  expect(second.project.nativeAssetImports).toEqual([binding]);
  expect(second.project.quickForge!.placements).toHaveLength(3);
  expect(new Set(second.project.quickForge!.placements.map((p) => p.id)).size).toBe(3);
  expect(first.project.quickForge!.placements[1].position).toEqual([2, 3, 0]);
  expect(first.project.quickForge!.placements[1].tagPath).toBe(binding.tagPath);
});
it('copies imported bindings with the original document path and keeps native namespaces in the admission receipt', async () => {
  const source = project();
  source.nativeAssetImports = [binding];
  source.quickForge!.placements[0].tagPath = binding.nativePath;
  copyForgeSelection(source, ['boulder']);
  const clip = readForgeSelection()!;
  expect(clip.nativeImports).toEqual([binding]);
  const target = { ...project(), id: 'other-map', quickForge: { ...project().quickForge!, placements: [] } };
  const admitted = { ...binding, id: 'destination-binding', nativePath: 'gs_other/scenery/rocks/boulder' };
  const prepare = vi.fn().mockResolvedValue(admitted);
  const pasted = applyForgePaste(target, await prepareForgePaste(target, clip, prepare));
  expect(prepare.mock.calls[0][1].path).toBe(binding.tagPath);
  expect(pasted.project.quickForge!.placements[0].tagPath).toBe(binding.tagPath);
  expect(pasted.project.nativeAssetImports).toEqual([admitted]);
  expect(source.quickForge!.placements[0].tagPath).toBe(binding.nativePath);
  const wrong = structuredClone(clip);
  wrong.nativeImports[0].tagPath = 'another/native/tag';
  await expect(prepareForgePaste(target, wrong, prepare)).rejects.toThrow(/differs/);
});
it('cross-map/runtime paste resolves original identity and rebases onto concurrent destination edits', async () => {
  const source = project();
  copyForgeSelection(source, ['boulder']);
  const target = {
    ...project(),
    id: 'destination',
    title: 'Target',
    quickForge: { ...project().quickForge!, runtimeId: 'haloCustomEdition' as const, placements: [] },
  };
  const prepare = vi.fn().mockResolvedValue(binding),
    prepared = await prepareForgePaste(target, readForgeSelection()!, prepare);
  expect(prepare.mock.calls[0][1]).toMatchObject({
    sourceProjectId: 'native-source',
    sourceSha256: 'a'.repeat(64),
    tagId: 7,
    class: 'scen',
  });
  const current = { ...target, title: 'Unrelated edit while extracting' },
    pasted = applyForgePaste(current, prepared);
  expect(pasted.project.title).toBe(current.title);
  expect(pasted.project.nativeAssetImports).toEqual([binding]);
  expect(pasted.project.quickForge!.placements).toHaveLength(1);
  expect(target.nativeAssetImports).toBeUndefined();
  expect(() => applyForgePaste({ ...current, id: 'different-map' }, prepared)).toThrow(
    /destination map changed/,
  );
  expect(() =>
    applyForgePaste({ ...current, quickForge: { ...current.quickForge, runtimeId: 'mccSteam' } }, prepared),
  ).toThrow(/destination map changed/);
});
it('paste after Undo restores the original native closure and refuses material changes during asynchronous preparation', async () => {
  const source = project();
  source.nativeAssetImports = [binding];
  copyForgeSelection(source, ['boulder']);
  const undone = { ...source, nativeAssetImports: [], quickForge: { ...source.quickForge!, placements: [] } };
  const prepare = vi.fn().mockResolvedValue(binding),
    pasted = applyForgePaste(undone, await prepareForgePaste(undone, readForgeSelection()!, prepare));
  expect(pasted.project.nativeAssetImports).toEqual([binding]);
  expect(pasted.project.quickForge!.placements).toHaveLength(1);
  const material = {
    id: 'metal',
    name: 'Metal',
    shaderPath: null,
    color: [1, 1, 1] as [number, number, number],
  };
  source.quickForge!.materials = [material];
  source.quickForge!.geometry = [
    {
      id: 'floor',
      name: 'Floor',
      kind: 'box',
      materialId: 'metal',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      dimensions: [4, 4, 1],
      steps: 1,
      visible: true,
      locked: false,
    },
  ];
  copyForgeSelection(source, ['floor']);
  const prepared = await prepareForgePaste(source, readForgeSelection()!, prepare);
  expect(() =>
    applyForgePaste({ ...source, quickForge: { ...source.quickForge!, materials: [] } }, prepared),
  ).toThrow(/material changed during paste/);
});
it('an unsupported native cross-runtime import refuses the whole paste without modifying either project', async () => {
  const source = project();
  copyForgeSelection(source, ['boulder']);
  const target = { ...project(), id: 'other' };
  const before = structuredClone(target);
  await expect(
    prepareForgePaste(
      target,
      readForgeSelection()!,
      vi.fn().mockRejectedValue(Error('Unsupported Xbox native extraction')),
    ),
  ).rejects.toThrow('Unsupported Xbox');
  expect(target).toEqual(before);
  expect(source.quickForge!.placements).toHaveLength(1);
});
it('refuses a native result for a different copied tag or class before admitting any document changes', async () => {
  const source = project();
  copyForgeSelection(source, ['boulder']);
  const target = { ...source, id: 'different' };
  await expect(
    prepareForgePaste(
      target,
      readForgeSelection()!,
      vi.fn().mockResolvedValue({ ...binding, tagClass: 'weap' }),
    ),
  ).rejects.toThrow(/differs from the copied asset/);
  expect(target.nativeAssetImports).toBeUndefined();
});
it('refuses corrupt transforms and foreign material paths rather than substituting a gray material', async () => {
  const source = project();
  source.quickForge!.geometry = [
    {
      id: 'floor',
      name: 'Floor',
      kind: 'box',
      materialId: 'metal',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      dimensions: [4, 4, 1],
      steps: 1,
      visible: true,
      locked: false,
    },
  ];
  source.quickForge!.materials = [
    { id: 'metal', name: 'Authored metal', shaderPath: 'some/unverified/shader', color: [1, 1, 1] },
  ];
  copyForgeSelection(source, ['floor']);
  const target = { ...project(), id: 'other' };
  await expect(prepareForgePaste(target, readForgeSelection()!, vi.fn())).rejects.toThrow(
    /verified recursive source/,
  );
  const raw = JSON.parse(storage.get('guilty-spark:forge-clipboard-v1')!);
  raw.nodes[0].value.position = [0, 0, 999999];
  storage.set('guilty-spark:forge-clipboard-v1', JSON.stringify(raw));
  expect(readForgeSelection()).toBeNull();
});
