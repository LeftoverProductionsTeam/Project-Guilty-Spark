import { expect, it } from 'vitest';
import { historyReducer, initialHistory } from './editor';
import type { ForgeMaterial, QuickForgeDocument } from './forge';
import type { Project } from './types';
const materials: ForgeMaterial[] = [{ id: 'surface', name: 'wall', shaderPath: null, color: [1, 1, 1] }];
const document: QuickForgeDocument = {
  schemaVersion: 1,
  name: 'Original',
  template: 'customBlank',
  runtimeId: 'mccSteam',
  gameMode: 'slayer',
  skyPath: null,
  buildQuality: 'draft',
  geometry: [],
  materials,
  placements: [],
  spawns: [],
  objectives: [],
};
const project: Project = {
  schemaVersion: 1,
  id: 'local',
  title: 'Workshop',
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
  quickForge: document,
};
const defaults: ForgeMaterial[] = [
  { id: 'surface', name: 'runtime-metal', shaderPath: 'levels/metal', color: [1, 1, 1] },
];
it('late runtime bindings preserve one-step undo and redo of authored work', () => {
  let state = historyReducer(initialHistory, { type: 'load', project });
  state = historyReducer(state, {
    type: 'edit',
    project: { ...project, quickForge: { ...document, name: 'Authored' } },
    description: 'Rename',
  });
  state = historyReducer(state, { type: 'forge-defaults', projectId: project.id, materials: defaults });
  expect(state.past).toHaveLength(1);
  expect(state.current?.quickForge?.materials[0].shaderPath).toBe('levels/metal');
  state = historyReducer(state, { type: 'undo' });
  expect(state.current?.quickForge?.name).toBe('Original');
  expect(state.current?.quickForge?.materials[0].shaderPath).toBe('levels/metal');
  // A second async resolution, after undo, must keep the redo branch.
  state = historyReducer(state, { type: 'forge-defaults', projectId: project.id, materials: defaults });
  expect(state.future).toHaveLength(1);
  state = historyReducer(state, { type: 'redo' });
  expect(state.current?.quickForge?.name).toBe('Authored');
  expect(state.past).toHaveLength(1);
});
it('resource arrival while undone keeps authored shaders and the later edit intact', () => {
  const authored = {
    ...project,
    quickForge: {
      ...document,
      materials: [
        materials[0],
        { ...materials[0], id: 'authored', shaderPath: 'custom/authored' },
        {
          id: 'portal',
          name: '+exactportal',
          shaderPath: null,
          color: [0, 1, 1] as [number, number, number],
        },
      ],
    },
  };
  let state = historyReducer(initialHistory, { type: 'load', project: authored });
  state = historyReducer(state, {
    type: 'edit',
    project: { ...authored, quickForge: { ...authored.quickForge, name: 'Later' } },
    description: 'Rename',
  });
  state = historyReducer(state, { type: 'undo' });
  state = historyReducer(state, { type: 'forge-defaults', projectId: project.id, materials: defaults });
  expect(state.future).toHaveLength(1);
  state = historyReducer(state, { type: 'redo' });
  expect(state.current?.quickForge?.name).toBe('Later');
  expect(state.current?.quickForge?.materials.map((m) => m.shaderPath)).toEqual(['levels/metal', 'custom/authored', null]);
  expect(historyReducer(state, { type: 'forge-defaults', projectId: 'another', materials: defaults })).toBe(
    state,
  );
});
