import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyHaloBlend, genericCombiner } from './haloTransparency';
import { createHaloMaterial, createHaloMaterialPasses, updateHaloMaterial } from './haloMaterial';
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
  it('renders explicitly absent glass diffuse as zero contribution while retaining the authored tint and reflection',()=>{
    const cube=new THREE.CubeTexture(),passes=createHaloMaterialPasses(null,null,{...metadata,kind:'glass',glassDiffuseAbsent:true,glassTint:[.4,.5,.6],reflection:{bitmapTagId:7,perpendicularBrightness:.1,parallelBrightness:.7,perpendicularTint:[1,1,1],parallelTint:[1,1,1],falloff:0,cutoff:0}},{reflectionCube:cube}),[tint,material]=passes;
    expect(passes).toHaveLength(2);expect(tint.blendSrc).toBe(THREE.ZeroFactor);expect(tint.blendDst).toBe(THREE.SrcColorFactor);
    expect(tint.uniforms.glassTint.value.toArray()).toEqual([.4,.5,.6]);expect(tint.uniforms.reflectionCube.value).toBe(cube);
    expect(material.blendSrc).toBe(THREE.OneFactor);expect(material.blendDst).toBe(THREE.OneMinusSrcAlphaFactor);
    expect(material.uniforms.hasBase.value).toBe(false);expect(material.uniforms.baseMap.value).toBeNull();expect(material.uniforms.hasReflection.value).toBe(true);expect(material.uniforms.alphaBlended.value).toBe(true);
    expect(()=>createHaloMaterial(null,null,{...metadata,kind:'model'},{})).toThrow(/actual diffuse/);passes.forEach(pass=>pass.dispose());cube.dispose();
  });
  it('uses one neutral glass pass and shares source images with a non-neutral tint pass',()=>{
    const base=new THREE.Texture(),map=new THREE.Texture();
    const neutral=createHaloMaterialPasses(base,null,{...metadata,kind:'glass',glassTint:[1,1,1]},{});
    expect(neutral).toHaveLength(1);expect(neutral[0].uniforms.alphaTest.value).toBe(false);
    const textured=createHaloMaterialPasses(base,null,{...metadata,kind:'glass',glassTint:[1,1,1],glassTintScale:2},{glassTintMap:map});
    expect(textured).toHaveLength(2);
    expect(textured[0].uniforms.glassTintMap.value).toBe(map);expect(textured[1].uniforms.glassTintMap.value).toBe(map);
    expect(textured[0].uniforms.baseMap.value).toBe(base);expect(textured[0].uniforms.glassTintScale.value).toBe(2);
    for(const pass of [...neutral,...textured])pass.dispose();base.dispose();map.dispose();
  });
  it('continues visible native shader animation while static materials need no idle frames', () => {
    const base = new THREE.Texture(), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const staticMaterial=createHaloMaterial(base,null,metadata,{});
    let frames=0;
    updateHaloMaterial(staticMaterial,scene,camera,()=>frames++);
    expect(frames).toBe(0);
    const animated=createHaloMaterial(base,null,{...metadata,stages:[{...stage,constant0Function:6,constant0Lower:[0,0,0,0]}]},{});
    expect(animated.userData.haloAnimated).toBe(true);
    updateHaloMaterial(animated,scene,camera,()=>frames++);
    updateHaloMaterial(animated,scene,camera,()=>frames++);
    expect(frames).toBe(2);
    const constant=createHaloMaterial(base,null,{...metadata,stages:[{...stage,constant0Function:6}]},{});
    expect(constant.userData.haloAnimated).toBe(false);
    staticMaterial.dispose();animated.dispose();constant.dispose();base.dispose();
  });
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
        { ...metadata, kind: 'model', stages: [], alphaTest: true, alphaBlended: true, decal: true },
        {},
      );
    expect(m.depthWrite).toBe(false);
    expect(m.polygonOffset).toBe(true);
    expect(m.uniforms.alphaBlended.value).toBe(true);
    expect(m.uniforms.alphaTest.value).toBe(false);
    m.dispose();
    t.dispose();
  });
});
