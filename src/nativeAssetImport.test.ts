import { expect, it } from 'vitest';
import { attachAssetImport } from './nativeAssetImport';
import { mergeAssetSources } from './assetSources';
import { historyReducer, initialHistory } from './editor';
import { placeLibraryModel } from './viewportAssets';
import { materialSourcePath } from './useWorkshopTextures';
import type { Project, NativeAssetImport, OpenProject } from './types';
import type { ForgeAsset } from './forge';
const project: Project = {
  schemaVersion: 1,
  id: 'target',
  title: 'Map',
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
};
const binding: NativeAssetImport = {
  id: 'import',
  sourceProjectId: 'source',
  sourceSha256: 'a'.repeat(64),
  tagId: 7,
  tagClass: 'scen',
  tagPath: 'scenery/rock',
  nativePath: 'gs_assets_import/scenery/rock',
  receiptSha256: 'b'.repeat(64),
  fileCount: 5,
};
const asset: ForgeAsset = {
  key: 'rock',
  name: 'Rock',
  path: binding.tagPath,
  class: 'scen',
  sourceProjectId: binding.sourceProjectId,
  sourceSha256: binding.sourceSha256,
  tagId: 7,
  cacheVersion: 13,
};
it('the admitted tag closure and placement form one reversible edit without dropping other project changes', () => {
  const current = { ...project, title: 'Unsaved title' };
  const loaded = historyReducer(initialHistory, { type: 'load', project: current });
  const placed = placeLibraryModel(attachAssetImport(current, binding), asset, [2, 3, 4]);
  const edited = historyReducer(loaded, {
    type: 'edit',
    project: placed.project,
    description: 'Import and place rock',
  });
  const undo = historyReducer(edited, { type: 'undo' });
  expect(undo.current?.title).toBe('Unsaved title');
  expect(undo.current?.nativeAssetImports).toBeUndefined();
  expect(undo.current?.scene).toHaveLength(0);
  const redo = historyReducer(undo, { type: 'redo' });
  expect(redo.current?.nativeAssetImports).toEqual([binding]);
  expect(redo.current?.scene).toHaveLength(1);
  expect(attachAssetImport(redo.current!, binding)).toBe(redo.current);
});
it('a floor-surface drop is lifted just inside sealed playable space and an existing airborne position is retained', () => {
  const quickForge = {
    schemaVersion: 1,
    name: 'Arena',
    template: 'emptyArena',
    runtimeId: 'mccSteam',
    gameMode: 'slayer',
    geometry: [
      {
        id: 'room',
        name: 'Room',
        kind: 'room',
        position: [0, 0, 4],
        rotation: [0, 0, 0],
        dimensions: [24, 32, 8],
        materialId: 'surface',
        visible: true,
        locked: false,
        steps: 4,
      },
    ],
    materials: [],
    placements: [],
    spawns: [],
    objectives: [],
    skyPath: null,
    buildQuality: 'draft',
  } as NonNullable<Project['quickForge']>;
  const floor = placeLibraryModel({ ...project, quickForge }, asset, [1.5, -1.5, 0]);
  expect(floor.project.quickForge?.placements[0].position).toEqual([1.5, -1.5, 0.01]);
  const airborne = placeLibraryModel({ ...project, quickForge }, asset, [2, 3, 4]);
  expect(airborne.project.quickForge?.placements[0].position).toEqual([2, 3, 4]);
});
it('loaded background sources cannot replace an open map draft', () => {
  const open = { history: { current: { ...project, title: 'Draft stays here' } }, inspection: null };
  const result = mergeAssetSources(
    [open],
    [
      { project, inspection: null },
      { project: { ...project, id: 'other' }, inspection: null },
    ],
  );
  expect(result).toHaveLength(2);
  expect(result[0]).toBe(open);
  expect(result[1].history.current?.id).toBe('other');
});
it('private native shader previews resolve only through the same source map and source hash', () => {
  const source = {
    project: { ...project, id: 'source' },
    inspection: { sha256: binding.sourceSha256 },
  } as OpenProject;
  const material = { ...binding, tagClass: 'senv', tagPath: 'levels/test/shaders/metal' };
  expect(materialSourcePath(material.nativePath, source, [material])).toBe(material.tagPath);
  expect(
    materialSourcePath(material.nativePath, { ...source, project: { ...source.project, id: 'other' } }, [
      material,
    ]),
  ).toBe(material.nativePath);
  expect(
    materialSourcePath(
      material.nativePath,
      { ...source, inspection: { ...source.inspection!, sha256: 'c'.repeat(64) } },
      [material],
    ),
  ).toBe(material.nativePath);
});
