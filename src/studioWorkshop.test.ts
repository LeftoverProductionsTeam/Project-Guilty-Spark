import { it, expect } from 'vitest';
import { workshopExample } from './bspWorkshop';
import { mergeForge, portableForge } from './forgeSession';
import type { QuickForgeDocument } from './forge';
const empty: QuickForgeDocument = {
  schemaVersion: 1,
  name: 'Shared Workshop',
  template: 'customBlank',
  runtimeId: 'mccSteam',
  gameMode: 'slayer',
  skyPath: null,
  buildQuality: 'draft',
  geometry: [],
  materials: [{ id: 'metal', name: 'metal', shaderPath: null, color: [1, 1, 1] }],
  placements: [],
  spawns: [],
  objectives: [],
};
it('reconciles independent Workshop brushes and preserves participant-specific inverse edits', () => {
  const base = workshopExample(empty),
    a = structuredClone(base),
    b = structuredClone(base);
  a.workshop!.brushes[0].faces[0].uvOffset[0] = 0.25;
  b.workshop!.brushes[1].faces[0].uvScale[0] = 0.5;
  const combined = mergeForge(base, a, b),
    undo = mergeForge(a, base, combined);
  expect(combined.workshop!.brushes[0]).toEqual(a.workshop!.brushes[0]);
  expect(combined.workshop!.brushes[1]).toEqual(b.workshop!.brushes[1]);
  expect(undo.workshop!.brushes[0]).toEqual(base.workshop!.brushes[0]);
  expect(undo.workshop!.brushes[1]).toEqual(b.workshop!.brushes[1]);
});
it('refuses coupled topology/material and edit/delete conflicts without altering either draft', () => {
  const base = workshopExample(empty),
    a = structuredClone(base),
    b = structuredClone(base);
  a.workshop!.brushes[0].vertices.forEach((v) => (v[0] *= 1.1));
  b.workshop!.brushes[0].faces[0].uvOffset[0] = 0.25;
  expect(() => mergeForge(base, a, b)).toThrow(/Workshop conflict/);
  expect(b.workshop!.brushes[0].faces[0].uvOffset[0]).toBe(0.25);
  b.workshop!.brushes.splice(0, 1);
  expect(() => mergeForge(base, a, b)).toThrow(/edit\/delete/);
});
it('preserves native f64 Workshop source precision and merges independent transform axes', () => {
  const base = workshopExample(empty);
  base.workshop!.brushes[0].position[0] = 0.123456789101112;
  expect(portableForge(base).workshop).toEqual(base.workshop);
  expect(portableForge(portableForge(base))).toEqual(portableForge(base));
  const a = structuredClone(base),
    b = structuredClone(base);
  a.workshop!.brushes[0].position[0] = 0.45678910111213;
  b.workshop!.brushes[0].position[1] = 2;
  expect(mergeForge(base, a, b).workshop!.brushes[0].position).toEqual([0.45678910111213, 2, 0]);
});
