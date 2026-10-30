import { test, expect } from '@playwright/test';
test('WebGL renders Halo exterior faces and source transparency without black occluders', async ({
  page,
}) => {
  await page.goto('/tests/ui/fixtures/haloMaterials.html');
  const result = await page.evaluate(async () => {
    const { renderMaterialChecks } = await import('/tests/ui/fixtures/haloMaterials.ts' /* @vite-ignore */);
    return renderMaterialChecks();
  });
  expect(result.errors).toEqual([]);
  for (const pixel of [result.neutral, result.alphaAdded, result.back]) {
    expect(Math.abs(pixel[0] - 26)).toBeLessThanOrEqual(1);
    expect(pixel[1]).toBe(51);
    expect(Math.abs(pixel[2] - 77)).toBeLessThanOrEqual(1);
  }
  expect(Math.abs(result.added[0] - 90)).toBeLessThanOrEqual(1);
  expect(Math.abs(result.combined[1] - 115)).toBeLessThanOrEqual(1);
  expect(result.model).toEqual([0, 128, 0, 255]);
});
