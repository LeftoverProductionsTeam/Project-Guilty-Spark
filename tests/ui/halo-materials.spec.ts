import { test, expect } from '@playwright/test';
test('WebGL renders Halo exterior faces and source transparency without black occluders', async ({
  page,
}) => {
  await page.goto('/tests/ui/fixtures/haloMaterials.html');
  const result = await page.evaluate(async () => {
    const { renderMaterialChecks } = await import('/tests/ui/fixtures/haloMaterials.ts' /* @vite-ignore */);
    return renderMaterialChecks();
  });
  console.log('HALO_MATERIAL_PIXELS',JSON.stringify({detailOrder:result.detailOrder,noReflectionDetail:result.noReflectionDetail,maskedDetailOrder:result.maskedDetailOrder}));
  expect(result.errors).toEqual([]);
  for (const pixel of [result.neutral, result.alphaAdded, result.back]) {
    expect(Math.abs(pixel[0] - 26)).toBeLessThanOrEqual(1);
    expect(pixel[1]).toBe(51);
    expect(Math.abs(pixel[2] - 77)).toBeLessThanOrEqual(1);
  }
  expect(Math.abs(result.added[0] - 90)).toBeLessThanOrEqual(1);
  expect(Math.abs(result.combined[1] - 115)).toBeLessThanOrEqual(1);
  expect(result.model).toEqual([0, 128, 0, 255]);
  expect(result.nativeGlow).toEqual([128,64,32,255]);
  expect(result.advancedGlow).toEqual(result.nativeGlow);
  expect(result.unmasked).toEqual([0,0,0,255]);
  expect(result.blackGlow).toEqual([0,0,0,255]);
  for(const [index,expected] of [[0,[88,56]],[1,[76,28]],[2,[145,177]]] as const){
    for(const order of [0,1]){const pixel=result.detailOrder[index][order];for(const channel of pixel.slice(0,3))expect(Math.abs(channel-expected[order])).toBeLessThanOrEqual(1);expect(pixel[3]).toBe(255);}
  }
  for(const pixel of result.noReflectionDetail)expect(pixel).toEqual([24,24,24,255]);
  for(const channels of result.maskedDetailOrder)for(const order of[0,1]){
    for(const channel of channels[order].slice(0,3))expect(Math.abs(channel-[68,60][order])).toBeLessThanOrEqual(1);
    expect(channels[order][3]).toBe(255);
  }
});
