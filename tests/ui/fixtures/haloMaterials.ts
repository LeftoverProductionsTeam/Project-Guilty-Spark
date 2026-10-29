import * as THREE from 'three';
import { createHaloMaterial } from '../../../src/haloMaterial';
import { renderIndices } from '../../../src/haloGeometry';
import type { ShaderPreview, ShaderStage } from '../../../src/types';

export function renderMaterialChecks() {
  const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('canvas')!, antialias: false });
  renderer.setSize(32, 32);
  const target = new THREE.WebGLRenderTarget(32, 32, { depthBuffer: true });
  const errors: string[] = [];
  renderer.debug.onShaderError = (_gl, _program, vs, fs) => {
    errors.push(String(_gl.getShaderInfoLog(vs)), String(_gl.getShaderInfoLog(fs)));
  };
  const texture = (rgba: number[]) => {
    const t = new THREE.DataTexture(new Uint8Array(rgba), 1, 1);
    t.userData.sourceEncoded = true;
    t.needsUpdate = true;
    return t;
  };
  const black = texture([0, 0, 0, 0]),
    green = texture([0, 128, 0, 128]),
    red = texture([64, 0, 0, 0]),
    half = texture([128, 128, 128, 255]);
  const geometry = new THREE.PlaneGeometry(2, 2);
  geometry.setAttribute('uv1', geometry.getAttribute('uv'));
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 2;
  const scene = new THREE.Scene();
  renderer.setRenderTarget(target);
  renderer.setClearColor(new THREE.Color(0.1, 0.2, 0.3), 1);
  const sample = (material: THREE.Material, geo = geometry) => {
    const mesh = new THREE.Mesh(geo, material);
    scene.add(mesh);
    renderer.clear();
    renderer.render(scene, camera);
    const pixel = new Uint8Array(4);
    renderer.readRenderTargetPixels(target, 16, 16, 1, 1, pixel);
    scene.remove(mesh);
    material.dispose();
    return [...pixel];
  };
  const metadata: ShaderPreview = {
    kind: 'generic',
    alphaTest: false,
    twoSided: false,
    uvScale: [1, 1],
    framebufferBlend: 3,
    layers: [],
  };
  const neutral = sample(createHaloMaterial(black, null, metadata, {}));
  const added = sample(createHaloMaterial(red, null, metadata, {}));
  const alphaAdded = sample(createHaloMaterial(red, null, { ...metadata, framebufferBlend: 7 }, {}));
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
  const combined = sample(
    createHaloMaterial(green, null, { ...metadata, stages: [stage] }, { layer1: half }),
  );
  const cached = {
    source: 'halo-model-untextured',
    label: 'cached face',
    positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
    indices: [0, 2, 1],
  };
  const exterior = new THREE.BufferGeometry();
  exterior.setAttribute('position', new THREE.Float32BufferAttribute(cached.positions, 3));
  exterior.setAttribute('normal', new THREE.Float32BufferAttribute(cached.normals, 3));
  exterior.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
  exterior.setAttribute('uv1', exterior.getAttribute('uv'));
  exterior.setIndex(renderIndices(cached));
  const model = sample(createHaloMaterial(green, null, { ...metadata, kind: 'model' }, {}), exterior);
  camera.position.z = -2;
  camera.lookAt(0, 0, 0);
  const back = sample(createHaloMaterial(green, null, { ...metadata, kind: 'model' }, {}), exterior);
  exterior.dispose();
  geometry.dispose();
  for (const t of [black, green, red, half]) t.dispose();
  target.dispose();
  renderer.dispose();
  return { neutral, added, alphaAdded, combined, model, back, errors };
}
