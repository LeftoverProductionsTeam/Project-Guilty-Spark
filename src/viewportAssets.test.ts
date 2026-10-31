import { expect, it } from 'vitest';
import { placeLibraryModel, sourcePlacement, viewportAssetCatalog, checkedDropPoint } from './viewportAssets';
import type { Project } from './types';
import type { ForgeAsset } from './forge';
import type { MapDocument } from './mapDocuments';
const source = '11111111-1111-4111-8111-111111111111',
  hash = 'a'.repeat(64);
const asset = {
  tagId: 7,
  name: 'Donor model',
  path: 'scenery/test',
  class: 'scen',
  sourceProjectId: source,
  sourceSha256: hash,
} as ForgeAsset;
const project = () =>
  ({ id: '22222222-2222-4222-8222-222222222222', scene: [], assets: [] }) as unknown as Project;
it('preserves donor identity and replacement pose in a source-bound model preview', () => {
  let p = project();
  const added = placeLibraryModel(p, asset, [1, 2, 3]);
  p = added.project;
  expect(p.scene[0].tagId).toBeNull();
  expect(p.scene[0].sourceModel).toEqual({
    projectId: source,
    sourceSha256: hash,
    tagId: 7,
    path: 'scenery/test',
    class: 'scen',
  });
  p.scene[0].rotation = [0.1, 0.2, 0.3];
  p.scene[0].scale = [2, 2, 2];
  p.scene[0].visible = false;
  const replaced = placeLibraryModel(p, { ...asset, tagId: 8 }, [100, 100, 100], added.selectedId);
  expect(replaced.project.scene[0]).toMatchObject({
    id: added.selectedId,
    position: [1, 2, 3],
    rotation: [0.1, 0.2, 0.3],
    scale: [2, 2, 2],
    visible: false,
    sourceModel: { tagId: 8 },
  });
  expect(sourcePlacement(replaced.project.scene[0])).toMatchObject({
    sourceProjectId: source,
    sourceSha256: hash,
    tagId: 8,
    position: [1, 2, 3],
  });
  expect(p.scene[0].sourceModel?.tagId).toBe(7);
});
it('creates native forge placements, retains gameplay settings on swap, and respects locks and limits', () => {
  let p = { ...project(), quickForge: { placements: [], geometry: [] } } as unknown as Project;
  const added = placeLibraryModel(p, asset, [1, 2, 3]);
  p = added.project;
  Object.assign(p.quickForge!.placements[0], {
    rotation: [1, 2, 3],
    team: 2,
    respawnSeconds: 25,
    visible: false,
  });
  const replaced = placeLibraryModel(p, { ...asset, tagId: 8 }, [9, 9, 9], added.selectedId);
  expect(replaced.project.quickForge!.placements[0]).toMatchObject({
    id: added.selectedId,
    tagId: 8,
    position: [1, 2, 3],
    rotation: [1, 2, 3],
    team: 2,
    respawnSeconds: 25,
    visible: false,
  });
  p.quickForge!.placements[0].locked = true;
  expect(() => placeLibraryModel(p, asset, [0, 0, 0], added.selectedId)).toThrow(/Unlock/);
  p.quickForge!.placements = Array.from({ length: 1024 }, () => p.quickForge!.placements[0]);
  expect(() => placeLibraryModel(p, asset, [0, 0, 0])).toThrow(/1024/);
  expect(() => checkedDropPoint([NaN, 0, 0])).toThrow(/finite/);
  expect(() => placeLibraryModel(project(), { ...asset, sourceSha256: '' }, [0, 0, 0])).toThrow(/identity/);
});
it('offers only open map assets with exact inspection identity and includes registered custom sound', () => {
  const p = {
    ...project(),
    source: { sha256: hash },
    assets: [{ id: 'sound', name: 'wind.wav', kind: 'custom-sound' }],
  } as unknown as Project;
  const document = {
    id: p.id,
    history: { current: p },
    inspection: { sha256: hash, tags: [{ id: 3, class: 'snd!', path: 'sound/wind' }] },
  } as unknown as MapDocument;
  expect(viewportAssetCatalog([document]).map((item) => item.kind)).toEqual(['sound', 'customSound']);
  expect(
    viewportAssetCatalog([
      { ...document, inspection: { ...document.inspection!, sha256: 'b'.repeat(64) } },
    ]).map((item) => item.kind),
  ).toEqual(['customSound']);
  expect(viewportAssetCatalog([])).toEqual([]);
});
