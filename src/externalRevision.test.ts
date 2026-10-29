import { describe, expect, it } from 'vitest';
import { documentReducer, emptyMapDocuments } from './mapDocuments';
import { copyMapViewSession, readMapSession, writeMapSession } from './mapSession';
import type { MapInspection, OpenProject, Project } from './types';

function revision(id: string, hash: string): OpenProject {
  const project: Project = {
    schemaVersion: 1,
    id,
    title: id,
    createdAt: '',
    modifiedAt: '',
    source: {
      originalPath: 'watched.map',
      preservedPath: `${id}/source.map`,
      sha256: hash,
      cacheVersion: 7,
      engine: 'synthetic',
      scenarioPath: 'levels/test',
    },
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
  return { project, inspection: { sha256: hash, objects: [], tags: [] } as unknown as MapInspection };
}
describe('external cache revision adoption', () => {
  it('replaces a clean tab without stealing another active map', () => {
    let state = documentReducer(emptyMapDocuments(100), { type: 'open', open: revision('old', 'old-sha') });
    state = documentReducer(state, { type: 'open', open: revision('other', 'other-sha') });
    state = documentReducer(state, {
      type: 'external-revision',
      previousId: 'old',
      open: revision('new', 'new-sha'),
      replaceClean: true,
    });
    expect(state.documents.map((d) => d.id)).toEqual(['new', 'other']);
    expect(state.activeId).toBe('other');
  });
  it('retains both unsaved and saved source edits when an adoption became stale', () => {
    for (const dirty of [true, false]) {
      const old = revision('old', 'old-sha');
      old.project.tagEdits = [{ tagId: 1, fieldKey: 'synthetic', value: 2 }];
      let state = documentReducer(emptyMapDocuments(100), { type: 'open', open: old });
      if (dirty)
        state = documentReducer(state, {
          type: 'history',
          action: {
            type: 'edit',
            project: { ...old.project, title: 'new draft' },
            description: 'A new draft during external import',
          },
        });
      state = documentReducer(state, {
        type: 'external-revision',
        previousId: 'old',
        open: revision('new', 'new-sha'),
        replaceClean: true,
      });
      expect(state.documents.map((d) => d.id)).toEqual(['old', 'new']);
      expect(state.documents[0].history.current?.tagEdits).toHaveLength(1);
    }
  });
  it('ignores a response after the original tab closes and preserves an existing revision draft', () => {
    let state = documentReducer(emptyMapDocuments(100), { type: 'open', open: revision('new', 'new-sha') });
    state = documentReducer(state, {
      type: 'history',
      action: {
        type: 'edit',
        project: { ...revision('new', 'new-sha').project, title: 'existing draft' },
        description: 'Keep this draft',
      },
    });
    expect(
      documentReducer(state, {
        type: 'external-revision',
        previousId: 'closed',
        open: revision('new', 'new-sha'),
        replaceClean: true,
      }),
    ).toBe(state);
    state = documentReducer(state, { type: 'open', open: revision('old', 'old-sha') });
    state = documentReducer(state, {
      type: 'external-revision',
      previousId: 'old',
      open: revision('new', 'new-sha'),
      replaceClean: true,
    });
    expect(state.documents.find((d) => d.id === 'new')?.history.current?.title).toBe('existing draft');
  });
  it('carries camera and search state while remapping tag identity and clearing live mode', () => {
    const before = revision('view-before', 'a'),
      after = revision('view-after', 'b');
    before.inspection!.tags = [
      { id: 1, class: 'weap', path: 'weapons\\pistol\\pistol' },
    ] as MapInspection['tags'];
    after.inspection!.tags = [
      { id: 99, class: 'weap', path: 'weapons/pistol/pistol' },
    ] as MapInspection['tags'];
    writeMapSession('view-before', 'camera.world.PerspectiveCamera', { position: [1, 2, 3] });
    writeMapSession('view-before', 'tags.query', 'pistol');
    writeMapSession('view-before', 'tags.selection', 1);
    writeMapSession('view-before', 'live.binding', { session: 'old' });
    writeMapSession('view-before', 'world.selection', 'old-source-object');
    writeMapSession('view-before', 'level.target', 'live');
    copyMapViewSession('view-before', 'view-after', before.inspection, after.inspection);
    expect(readMapSession('view-after', 'tags.selection', null)).toBe(99);
    expect(readMapSession('view-after', 'tags.query', '')).toBe('pistol');
    expect(readMapSession('view-after', 'camera.world.PerspectiveCamera', null)).toEqual({
      position: [1, 2, 3],
    });
    expect(readMapSession('view-after', 'live.binding', null)).toBeNull();
    expect(readMapSession('view-after', 'world.selection', null)).toBeNull();
    expect(readMapSession('view-after', 'level.target', '')).toBe('source');
  });
});
