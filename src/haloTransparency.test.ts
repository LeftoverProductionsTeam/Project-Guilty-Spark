import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyHaloBlend, genericCombiner } from './haloTransparency';
import { createHaloMaterial } from './haloMaterial';
import { planOwnedMaterialPreviews } from './ownedMaterialBatch';
import type { MapHeader, Tag } from './types';
import type { ShaderPreview, ShaderStage } from './types';

const stage: ShaderStage = {
  flags: 0,
  constant0Source: 0,
  constant0Function: 0,
  constant0Period: 1,
  constant0Lower: [1, 1, 1, 1],
  constant0Upper: [1, 1, 1, 1],
  constant1: [0, 0, 0, 0],
  colorInputs: [5, 0, 6, 0, 0, 0, 0, 0],
  colorOutputs: [0, 0, 0, 0, 1, 0],
  alphaInputs: [5, 0, 1, 0, 0, 0, 0, 0],
  alphaOutputs: [0, 0, 1, 0],
};
const metadata: ShaderPreview = {
  alphaTest: false,
  twoSided: true,
  uvScale: [1, 1],
  kind: 'generic',
  framebufferBlend: 3,
  stages: [stage],
};
describe('source transparent materials', () => {
  it('routes native transparent-generic dependencies into the viewport texture planner', () => {
    const tags: Tag[] = [
      {
        id: 1,
        index: 0,
        class: 'sotr',
        path: 'scenery/portal',
        dataOffset: 64,
        external: false,
        fields: [],
        primaryBitmapStatus: 'resolved',
        shaderPreview: metadata,
        references: [{ label: 'Base map', targetId: 2, class: 'bitm', offset: 128 }],
      },
      {
        id: 2,
        index: 1,
        class: 'bitm',
        path: 'scenery/portal mask',
        dataOffset: 256,
        external: false,
        fields: [],
        references: [],
      },
    ];
    const plan = planOwnedMaterialPreviews(
      { sha256: 'a'.repeat(64), header: { version: 13, engine: 'synthetic' } as MapHeader, tags },
      {
        source: 'halo-render-untextured',
        label: 'actual material slot',
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        indices: [0, 1, 2],
        materialRanges: [{ shaderTagId: 1, bspIndex: 0, lightmapIndex: 0, indexStart: 0, indexCount: 3 }],
      },
    );
    expect(plan.shaderTasks).toHaveLength(1);
    expect(plan.shaderTasks[0].bitmapTagId).toBe(2);
    expect(plan.skipped).toEqual([]);
  });
  it('distinguishes additive glow from alpha-multiply-add and uses neutral transparent depth', () => {
    const m = new THREE.ShaderMaterial();
    applyHaloBlend(m, 3);
    expect(m.blendSrc).toBe(THREE.OneFactor);
    expect(m.blendDst).toBe(THREE.OneFactor);
    applyHaloBlend(m, 7);
    expect(m.blendSrc).toBe(THREE.SrcAlphaFactor);
    applyHaloBlend(m, 0);
    expect(m.blendDst).toBe(THREE.OneMinusSrcAlphaFactor);
    m.dispose();
    const t = new THREE.Texture(),
      halo = createHaloMaterial(t, null, metadata, {});
    expect(halo.transparent).toBe(true);
    expect(halo.depthWrite).toBe(false);
    expect(halo.uniforms.kind.value).toBe(3);
    halo.dispose();
    t.dispose();
  });
  it('retains parallel combiner operations and rejects malformed programs', () => {
    const glsl = genericCombiner(metadata);
    expect(glsl.indexOf('float aab')).toBeLessThan(glsl.indexOf('reg[6].rgb='));
    expect(glsl).toContain('base=clamp(reg[6]');
    expect(() =>
      genericCombiner({ ...metadata, stages: [{ ...stage, colorInputs: [25, 0, 0, 0, 0, 0, 0, 0] }] }),
    ).toThrow('Unsupported');
    expect(genericCombiner({ ...metadata, stages: [] })).toBe('base=maps[0];');
  });
  it('uses authored model decal alpha rather than forcing an opaque rectangle', () => {
    const t = new THREE.Texture(),
      m = createHaloMaterial(
        t,
        null,
        { ...metadata, kind: 'model', stages: [], alphaBlended: true, decal: true },
        {},
      );
    expect(m.depthWrite).toBe(false);
    expect(m.polygonOffset).toBe(true);
    expect(m.uniforms.alphaBlended.value).toBe(true);
    m.dispose();
    t.dispose();
  });
});
