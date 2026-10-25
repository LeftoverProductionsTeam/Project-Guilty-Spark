import { describe, it, expect } from 'vitest';
import {
  effectiveReferenceId,
  fieldValue,
  historyReducer,
  initialHistory,
  replaceVector,
  setTagValue,
} from './editor';
import type { Project, Tag } from './types';
const project: Project = {
  schemaVersion: 1,
  id: 'p',
  title: 'test',
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
const tag: Tag = {
  id: 1,
  index: 0,
  class: 'weap',
  path: 'weapons/test',
  dataOffset: 0,
  external: false,
  references: [],
  fields: [
    {
      key: 'rate',
      label: 'Rate',
      offset: 4,
      kind: 'f32',
      value: 5,
      min: 0,
      max: 100,
      unit: 'rounds/s',
      targetClass: null,
    },
  ],
};
describe('semantic tag overlay', () => {
  it('resolves graph references through the same edited value as the property inspector', () => {
    const field = {
      ...tag.fields[0],
      key: 'projectile',
      kind: 'reference' as const,
      value: 2,
      targetClass: 'proj',
    };
    const weapon = { ...tag, fields: [field] };
    const reference = { label: 'Projectile', targetId: 2, class: 'proj', offset: field.offset };
    const edited = setTagValue(project, weapon, field, 3);
    expect(effectiveReferenceId(edited, weapon, reference)).toBe(3);
    expect(effectiveReferenceId(project, weapon, reference)).toBe(2);
  });
  it('stores a typed edit and preserves the source model', () => {
    const p = setTagValue(project, tag, tag.fields[0], 9);
    expect(fieldValue(p, tag, tag.fields[0])).toBe(9);
    expect(project.tagEdits).toHaveLength(0);
    expect(tag.fields[0].value).toBe(5);
  });
  it('removes the overlay when restoring the original', () => {
    const p = setTagValue(setTagValue(project, tag, tag.fields[0], 9), tag, tag.fields[0], 5);
    expect(p.tagEdits).toHaveLength(0);
  });
  it('rejects invalid numerical values', () => {
    for (const value of [NaN, Infinity, -1, 101])
      expect(() => setTagValue(project, tag, tag.fields[0], value)).toThrow();
  });
});
describe('project history', () => {
  it('keeps completed build history while undoing an unrelated edit', () => {
    let state = historyReducer(initialHistory, { type: 'load', project });
    state = historyReducer(state, {
      type: 'edit',
      project: { ...project, title: 'Edited title' },
      description: 'Rename',
    });
    const builds = [
      {
        id: 'build-1',
        timestamp: '',
        status: 'validated',
        target: 'mcc',
        output: null,
        sha256: null,
        message: '',
        projectFingerprint: 'fingerprint',
      },
    ];
    state = historyReducer(state, { type: 'builds', project: { ...project, builds } });
    state = historyReducer(state, { type: 'undo' });
    expect(state.current?.title).toBe('test');
    expect(state.current?.builds).toEqual(builds);
  });
  it('ignores a completed build lookup from a project that is no longer open', () => {
    const state = historyReducer(initialHistory, { type: 'load', project });
    const result = historyReducer(state, { type: 'builds', project: { ...project, id: 'other-project' } });
    expect(result).toBe(state);
  });
  it('undoes and redoes a saved scene transform', () => {
    const p = {
      ...project,
      scene: [
        {
          id: 'o',
          name: 'object',
          kind: 'Scenery',
          tagId: null,
          position: [0, 0, 0] as [number, number, number],
          rotation: [0, 0, 0] as [number, number, number],
          scale: [1, 1, 1] as [number, number, number],
          visible: true,
          sourceOffset: 10,
          rotationOffset: 22,
          assetId: null,
        },
      ],
    };
    let h = historyReducer(initialHistory, { type: 'load', project: p });
    h = historyReducer(h, {
      type: 'edit',
      project: { ...p, scene: [{ ...p.scene[0], position: [1, 2, 3] }] },
      description: 'Move object',
    });
    expect(h.current?.scene[0].position).toEqual([1, 2, 3]);
    h = historyReducer(h, { type: 'saved' });
    h = historyReducer(h, { type: 'undo' });
    expect(h.current?.scene[0].position).toEqual([0, 0, 0]);
    expect(h.dirty).toBe(true);
    h = historyReducer(h, { type: 'redo' });
    expect(h.current?.scene[0].position).toEqual([1, 2, 3]);
  });
  it('clears the redo branch on a new edit', () => {
    let h = historyReducer(initialHistory, { type: 'load', project });
    h = historyReducer(h, { type: 'edit', project: { ...project, title: 'A' }, description: 'Rename' });
    h = historyReducer(h, { type: 'undo' });
    h = historyReducer(h, { type: 'edit', project: { ...project, title: 'B' }, description: 'Rename' });
    expect(h.future).toHaveLength(0);
  });
  it('merges build completion without losing unsaved edits', () => {
    let h = historyReducer(initialHistory, { type: 'load', project });
    h = historyReducer(h, { type: 'edit', project: { ...project, title: 'unsaved' }, description: 'Rename' });
    h = historyReducer(h, {
      type: 'builds',
      project: {
        ...project,
        builds: [
          {
            id: 'j',
            timestamp: '',
            status: 'validated',
            target: 'mcc',
            output: 'out',
            sha256: 'abc',
            message: '',
            projectFingerprint: 'x',
          },
        ],
      },
    });
    expect(h.current?.title).toBe('unsaved');
    expect(h.current?.builds).toHaveLength(1);
    expect(h.dirty).toBe(true);
  });
});
it('validates scenario vectors without mutating the original', () => {
  const v: [number, number, number] = [1, 2, 3];
  expect(replaceVector(v, 1, 4)).toEqual([1, 4, 3]);
  expect(v).toEqual([1, 2, 3]);
  expect(() => replaceVector(v, 0, Infinity)).toThrow();
});
