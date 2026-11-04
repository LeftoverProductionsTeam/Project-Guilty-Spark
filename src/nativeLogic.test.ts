import { expect, it } from 'vitest';
import {
  addLogicTrigger,
  addHandwrittenSource,
  centerDoorTrigger,
  connectDoor,
  copyDeviceBehavior,
} from './nativeLogic';
import {
  appendForgeNodes,
  forgeGeometryKey,
  forgeNodes,
  removeForgeNodes,
  transformForgeNode,
} from './forge';
import { mergeForge } from './forgeSession';
import { historyReducer, initialHistory } from './editor';
import type { Project } from './types';
import type { QuickForgeDocument } from './forge';
const base: QuickForgeDocument = {
  schemaVersion: 1,
  name: 'Native events',
  template: 'customBlank',
  runtimeId: 'mccSteam',
  gameMode: 'slayer',
  skyPath: null,
  buildQuality: 'draft',
  materials: [],
  geometry: [],
  spawns: [],
  objectives: [],
  placements: [
    {
      id: 'door',
      name: 'Door',
      tagClass: 'mach',
      tagPath: 'levels/a10/devices/doors/door small/door small',
      tagId: 7,
      sourceProjectId: 'source',
      sourceSha256: 'a'.repeat(64),
      position: [14, 0, 0],
      rotation: [0, 0, 0],
      team: 0,
      respawnSeconds: 0,
      visible: true,
      locked: false,
    },
  ],
};
function level() {
  const added = addLogicTrigger(base, [11, 0, 1.5]);
  return connectDoor(added.document, added.id, 'door');
}
it('makes simple door entry repeatable and explicitly centers a return-accessible trigger', () => {
  const d = level(),
    id = d.logic!.triggers[0].id;
  expect(d.logic!.rules[0].once).toBe(false);
  const fitted = centerDoorTrigger(d, id, 'door');
  expect(fitted.logic!.triggers[0]).toMatchObject({ id, position: [14, 0, 1.5], dimensions: [6, 3, 3] });
  expect(fitted.logic!.rules).toEqual(d.logic!.rules);
  expect(d.logic!.triggers[0].position).toEqual([11, 0, 1.5]);
  d.logic!.triggers[0].locked = true;
  expect(() => centerDoorTrigger(d, id, 'door')).toThrow(/Unlock/);
});
function project(doc: QuickForgeDocument): Project {
  return {
    schemaVersion: 1,
    id: 'local',
    title: 'Logic',
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
    quickForge: doc,
  };
}
it('binds a trigger to the placed native device, preserves source identity and reuses geometry', () => {
  const d = level();
  expect(base.logic).toBeUndefined();
  expect(d.logic?.devices).toEqual([{ placementId: 'door', initialPosition: 0, powered: true }]);
  expect(d.placements).toEqual(base.placements);
  expect(forgeGeometryKey(d)).toBe(forgeGeometryKey(base));
  expect(d.logic?.rules[0].event.kind).toBe('enter');
  expect(() => connectDoor(d, 'missing', 'door')).toThrow();
  const bad = structuredClone(d);
  bad.placements[0].tagClass = 'scen';
  expect(() => connectDoor(bad, bad.logic!.triggers[0].id, 'door')).toThrow();
});
it('undo restores deletion and all dependent logic in one document transaction', () => {
  const d = level(),
    deleted = removeForgeNodes(d, ['door']);
  expect(deleted.logic?.rules).toHaveLength(0);
  expect(deleted.logic?.devices).toHaveLength(0);
  expect(deleted.logic?.triggers).toHaveLength(1);
  let h = historyReducer(initialHistory, { type: 'load', project: project(d) });
  h = historyReducer(h, {
    type: 'edit',
    project: project(deleted),
    description: 'Delete door and connections',
  });
  h = historyReducer(h, { type: 'undo' });
  expect(h.current?.quickForge).toEqual(d);
  h = historyReducer(h, { type: 'redo' });
  expect(h.current?.quickForge).toEqual(deleted);
});
it('duplicates only trigger geometry with a new identity and requires explicit new bindings', () => {
  const d = level(),
    trigger = forgeNodes(d).find((n) => n.type === 'trigger')!;
  const copied = appendForgeNodes(d, [trigger], [0, 4, 0]);
  expect(copied.ids[0]).not.toBe(trigger.value.id);
  expect(copied.document.logic?.triggers).toHaveLength(2);
  expect(copied.document.logic?.rules).toEqual(d.logic?.rules);
  expect(copied.document.logic?.triggers[1].position).toEqual([11, 4, 1.5]);
  expect(() => transformForgeNode(trigger, [0, 0, 1], [0.1, 0, 0])).toThrow(/yaw/);
  expect(() => transformForgeNode(trigger, [1600, 0, 1], [0, 0, 0])).toThrow();
  expect(() => transformForgeNode(trigger, [0, 0, 1], [0, 0, 0], [100, 1, 1])).toThrow(/128/);
});
it('preserves locked trigger rules and merges or rejects graphs without overwriting the peer draft', () => {
  const d = level();
  d.logic!.triggers[0].locked = true;
  expect(removeForgeNodes(d, [d.logic!.triggers[0].id])).toEqual(d);
  const own = structuredClone(d),
    peer = structuredClone(d);
  own.logic!.rules[0].once = !d.logic!.rules[0].once;
  peer.name = 'Peer rename';
  expect(mergeForge(d, own, peer).name).toBe('Peer rename');
  peer.logic!.rules[0].enabled = false;
  expect(() => mergeForge(d, own, peer)).toThrow(/Logic/);
  expect(peer.logic!.rules[0].enabled).toBe(false);
  const clear = { ...d, logic: undefined };
  expect(mergeForge(d, clear, d).logic).toBeUndefined();
});
it('copies a complete device setup into independent rotated instance bindings with one Undo', () => {
  const d = level();
  d.placements.push({
    ...structuredClone(d.placements[0]),
    id: 'second-door',
    name: 'Second door',
    position: [28, 6, 0],
    rotation: [0, 0, Math.PI / 2],
  });
  const original = structuredClone(d);
  const copied = copyDeviceBehavior(d, 'door', 'second-door');
  expect(d).toEqual(original);
  const logic = copied.document.logic!;
  expect(logic.devices.map((b) => b.placementId)).toEqual(['door', 'second-door']);
  expect(logic.triggers[1].position).toEqual([28, 3, 1.5]);
  expect(logic.triggers[1].rotation[2]).toBeCloseTo(Math.PI / 2);
  expect(logic.rules[1].actions).toEqual([{ kind: 'devicePosition', targetId: 'second-door', value: 1 }]);
  expect(logic.rules[1].event).toEqual({ kind: 'enter', triggerId: copied.triggerIds[0] });
  expect(new Set(logic.rules.map((r) => r.id)).size).toBe(2);
  const h = historyReducer(historyReducer(initialHistory, { type: 'load', project: project(d) }), {
    type: 'edit',
    project: project(copied.document),
    description: 'Copy behavior',
  });
  expect(historyReducer(h, { type: 'undo' }).current?.quickForge).toEqual(d);
  expect(() => copyDeviceBehavior(copied.document, 'door', 'second-door')).toThrow(/already has/);
  const shared = structuredClone(d);
  shared.logic!.rules[0].actions.push({ kind: 'devicePower', targetId: 'second-door', value: 1 });
  expect(() => copyDeviceBehavior(shared, 'door', 'second-door')).toThrow();
});
it('preserves handwritten source bytes and refuses ambiguous imports or invisible graph changes', () => {
  const d = level(),
    content = '; original comment\r\n(global short user_counter 41)\r\n';
  const added = addHandwrittenSource(d, 'mission notes.hsc', content);
  expect(added.logic?.handwrittenSources).toEqual([{ filename: 'mission notes.hsc', content }]);
  expect(d.logic?.handwrittenSources).toBeUndefined();
  expect(() => addHandwrittenSource(added, 'MISSION NOTES.hsc', '; replacement')).toThrow(/already exists/);
  for (const name of [
    '../escape.hsc',
    'CON.hsc',
    'NUL.any.hsc',
    'gs_logic.hsc',
    'global_scripts.hsc',
    'file.HSC',
  ])
    expect(() => addHandwrittenSource(d, name, content)).toThrow();
  expect(() => addHandwrittenSource(d, 'user.hsc', '\ufeff; BOM')).toThrow(/ASCII/);
  const manual = structuredClone(d);
  manual.logic!.manualSource = '; retained manual override';
  expect(() => connectDoor(manual, manual.logic!.triggers[0].id, 'door')).toThrow(/paused/);
  expect(addHandwrittenSource(manual, 'user.hsc', content).logic?.manualSource).toBe(
    manual.logic!.manualSource,
  );
  const peer = structuredClone(added);
  peer.logic!.handwrittenSources![0].content = '; peer changed source';
  const own = structuredClone(added);
  own.logic!.rules[0].once = true;
  expect(() => mergeForge(added, own, peer)).toThrow(/Logic/);
});
