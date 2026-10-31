import { expect, it } from 'vitest';
import { changedEditInputs, editRevisionKey } from './smartEdit';
import type { Project } from './types';
const p = {
  id: 'map',
  source: { sha256: 'a'.repeat(64), resourceDirectory: null, resourceSha256: {} },
  scene: [],
  tagEdits: [],
  assets: [],
} as unknown as Project;
it('audio-only discovery and save history do not expire native authoring plans', () => {
  const before = editRevisionKey(p),
    after = editRevisionKey({
      ...p,
      modifiedAt: 'later',
      history: [],
      builds: [],
      source: { ...p.source!, audioResources: { previewOnly: true } } as unknown as Project['source'],
    });
  expect(after).toBe(before);
  expect(changedEditInputs(before, after)).toEqual([]);
});
it('reports a changed dependency binding separately from a changed authored field', () => {
  const before = editRevisionKey(p);
  expect(
    changedEditInputs(
      before,
      editRevisionKey({ ...p, source: { ...p.source!, resourceSha256: { 'bitmaps.map': 'b'.repeat(64) } } }),
    ),
  ).toEqual(['Source bindings']);
  expect(
    changedEditInputs(
      before,
      editRevisionKey({ ...p, tagEdits: [{ tagId: 1, fieldKey: 'bounding-radius', value: 2 }] }),
    ),
  ).toEqual(['Tag edits']);
});
