import { describe, it, expect } from 'vitest';
import { createPreviewEvidence } from './qaEvidence';
import type { MapInspection } from './types';

const fixture = {
  header: { name: 'bloodgulch', engine: 'Halo PC', version: 6 },
  sha256: 'a'.repeat(64),
  tags: [{ id: 42, class: 'senv', path: 'levels\\test\\bloodgulch\\rock' }],
  objects: [
    { kind: 'Scenery', tagId: 7 },
    { kind: 'Scenery', tagId: 8 },
    { kind: 'Player spawn', tagId: 9 },
  ],
  renderMesh: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2], source: 'halo-render-untextured', parts: [{ name: 'BSP 1', indexStart: 0, indexCount: 3 }], materialRanges: [{ shaderTagId: 42, bspIndex: 0, lightmapIndex: 0, indexStart: 0, indexCount: 3 }] },
  mesh: { positions: [], indices: [], source: 'halo-collision' },
  modelMeshes: { '7': { positions: [], indices: [], source: 'model' } },
  resources: [{ name: 'bitmaps.map', required: true, found: false, reason: 'not supplied' }],
  diagnostics: [{ code: 'BSP_RENDER_UNAVAILABLE', severity: 'warning', message: 'example' }],
} as unknown as MapInspection;

describe('Read-only owner preview evidence', () => {
  it('reports geometry provenance and unrendered placed objects accurately', () => {
    const result = JSON.parse(createPreviewEvidence(fixture, '2026-10-25T00:00:00Z'));
    expect(result.map.sha256).toBe('a'.repeat(64));
    expect(result.viewport.render.triangles).toBe(1);
    expect(result.viewport.placedObjectsWithModelPreview).toBe(1);
    expect(result.viewport.placedObjectsWithDiagnosticMarker).toBe(1);
    expect(result.viewport.shaders[0].tagId).toBe('0x0000002A');
    expect(result.viewport.shaders[0].path).toContain('bloodgulch');
    expect(result.acceptance.verifiedInGame).toBe(false);
    expect(result.acceptance.generatorWritesSourceData).toBe(false);
    expect(result.acceptance.sourceIntegrityIndependentlyRechecked).toBe(false);
    expect(result.missingRequiredResources[0].name).toBe('bitmaps.map');
  });
  it('does not include absolute file paths or change inputs', () => {
    const before = JSON.stringify(fixture);
    const evidence = createPreviewEvidence(fixture, '2026-10-25T00:00:00Z');
    expect(JSON.stringify(fixture)).toBe(before);
    expect(evidence).not.toContain('originalPath');
    expect(evidence).not.toContain('preservedPath');
    expect(evidence).not.toContain('example');
    expect(evidence).not.toContain('not supplied');
  });
});
