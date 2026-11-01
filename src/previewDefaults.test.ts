import { expect, it } from 'vitest';
import { withPreviewDefaults } from './runtimeTexturePreview';
import type { ForgeMaterial } from './forge';
it('keeps exact portal and sky materials shader-free during a late runtime-default response', () => {
  const defaults: ForgeMaterial[] = [
    { id: 'surface', name: 'halo_metal', shaderPath: 'levels/metal', color: [1, 1, 1] },
    { id: 'grass', name: 'halo_grass', shaderPath: 'levels/grass', color: [1, 1, 1] },
  ];
  const authored: ForgeMaterial[] = [
    { id: 'authored', name: 'custom', shaderPath: 'custom/authored', color: [0.1, 0.2, 0.3] },
  ];
  const specials: ForgeMaterial[] = ['+portal', '+exactportal', '+sky'].map((name, i) => ({
    id: `special-${i}`,
    name,
    shaderPath: null,
    color: [0, 1, 1],
  }));
  const current = [
    ...authored,
    ...specials,
    { id: 'surface', name: 'wall', shaderPath: null, color: [0.1, 0.2, 0.3] },
  ] satisfies ForgeMaterial[];
  const original = structuredClone(current),
    next = withPreviewDefaults(current, defaults);
  expect(current).toEqual(original);
  expect(next.slice(0, 4)).toEqual([...authored, ...specials]);
  expect(next.find((m) => m.id === 'surface')?.shaderPath).toBe('levels/metal');
  expect(next.find((m) => m.id === 'grass')?.shaderPath).toBe('levels/grass');
  expect(withPreviewDefaults(next, defaults)).toEqual(next);
});
