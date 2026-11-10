import { test, expect } from '@playwright/test';
test('WebGL renders Halo exterior faces and source transparency without black occluders', async ({
  page,
}) => {
  await page.goto('/tests/ui/fixtures/haloMaterials.html');
  const result = await page.evaluate(async () => {
    const { renderMaterialChecks } = await import('/tests/ui/fixtures/haloMaterials.ts' /* @vite-ignore */);
    return renderMaterialChecks();
  });
  console.log('HALO_MATERIAL_PIXELS',JSON.stringify({detailOrder:result.detailOrder,noReflectionDetail:result.noReflectionDetail,maskedDetailOrder:result.maskedDetailOrder,glassAlpha:result.glassAlpha,glassTintSamples:result.glassTintSamples,glassNoDiffuse:result.glassNoDiffuse,glassNativeAngular:result.glassNativeAngular,glassNativeBack:result.glassNativeBack,decal:result.decal,cutout:result.cutout}));
  console.log('HALO_MODEL_VERTEX_REFLECTION',JSON.stringify({tint:result.vertexTint,expected:result.vertexTintExpected,direction:result.vertexDirection,back:result.vertexBack,saturated:result.vertexSaturated,saturatedExpected:result.vertexSaturatedExpected,glError:result.reflectionGlError}));
  expect(result.reflectionGlError).toBe(0);
  for(const [channel,expected]of result.vertexTintExpected.entries())expect(Math.abs(result.vertexTint[channel]-expected)).toBeLessThanOrEqual(1);
  expect(result.vertexDirection).toEqual([240,16,32,255]);
  for(const [channel,expected]of result.vertexTintExpected.entries())expect(Math.abs(result.vertexBack[channel]-expected)).toBeLessThanOrEqual(1);
  for(const [channel,expected]of result.vertexSaturatedExpected.entries())expect(Math.abs(result.vertexSaturated[channel]-expected)).toBeLessThanOrEqual(1);
  expect(result.errors).toEqual([]);
  for (const pixel of [result.neutral, result.alphaAdded, result.back]) {
    expect(Math.abs(pixel[0] - 26)).toBeLessThanOrEqual(1);
    expect(pixel[1]).toBe(51);
    expect(Math.abs(pixel[2] - 77)).toBeLessThanOrEqual(1);
  }
  expect(Math.abs(result.added[0] - 90)).toBeLessThanOrEqual(1);
  expect(Math.abs(result.combined[1] - 115)).toBeLessThanOrEqual(1);
  expect(result.model).toEqual([0, 128, 0, 255]);
  for(const [index,expected] of [80,58,62,255].entries())expect(Math.abs(result.decal[index]-expected)).toBeLessThanOrEqual(1);
  for(const [index,expected] of [26,51,77,255].entries())expect(Math.abs(result.cutout[index]-expected)).toBeLessThanOrEqual(1);
  for(const [index,expected] of [[90,115,141],[128,106,110],[165,97,78],[240,80,16]].entries())
    for(const channel of [0,1,2])expect(Math.abs(result.glassAlpha[index][channel]-expected[channel])).toBeLessThanOrEqual(1);
  for(const pixel of result.glassTintSamples)for(const [channel,expected] of [118,78,110,255].entries())expect(Math.abs(pixel[channel]-expected)).toBeLessThanOrEqual(1);
  for(const [channel,expected] of [77,77,141,255].entries())expect(Math.abs(result.glassNoDiffuse[channel]-expected)).toBeLessThanOrEqual(1);
  for(const [sample,expected]of [[result.glassNativeAngular[0],[112,112,112,255]],[result.glassNativeAngular[1],[1,29,112,255]],[result.glassNativeBack,[128,128,128,255]]] as const)
    for(const channel of [0,1,2,3])expect(Math.abs(sample[channel]-expected[channel])).toBeLessThanOrEqual(1);
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

test('shared model and BSP components preserve glass pass order, chroma mode and geometry reuse',async({page})=>{
  await page.goto('/tests/ui/fixtures/haloMaterials.html');
  const result=await page.evaluate(async()=>{const {renderComponentGlassChecks}=await import('/tests/ui/fixtures/haloMaterials.ts' /* @vite-ignore */);return renderComponentGlassChecks();});
  console.log('HALO_COMPONENT_GLASS',JSON.stringify(result));
  expect(result.errors).toEqual([]);
  for(const frame of [result.model,result.completed,result.bsp]){
    for(const [channel,expected]of[118,78,110,255].entries())expect(Math.abs(frame.pixel[channel]-expected)).toBeLessThanOrEqual(1);
    expect(frame.groups).toBe(2);expect(frame.draws).toBe(2);expect(frame.triangles).toBe(4);
  }
  expect(result.completed.geometry).toBe(result.model.geometry);
  for(const [channel,expected]of[128,106,110,255].entries())expect(Math.abs(result.neutral.pixel[channel]-expected)).toBeLessThanOrEqual(1);
  expect(result.neutral.groups).toBe(1);expect(result.neutral.draws).toBe(1);
  for(const frame of[result.modelGreen,result.bspGreen]){expect(frame.pixel).toEqual([0,255,0,255]);expect(frame.draws).toBe(1);expect(frame.triangles).toBe(2);}
});

test('source-sky lighting reaches placed objects without relighting baked BSPs or reflection',async({page})=>{
  await page.goto('/tests/ui/fixtures/haloMaterials.html');const result=await page.evaluate(async()=>{const {renderObjectLightingChecks}=await import('/tests/ui/fixtures/haloMaterials.ts' /* @vite-ignore */);return renderObjectLightingChecks();});console.log('HALO_OBJECT_LIGHTING',JSON.stringify(result));
  expect(result.errors).toEqual([]);for(const [frame,value]of[[result.object,64],[result.unavailable,160],[result.baked,96],[result.bakedObject,96],[result.override,48]] as const){for(const channel of[0,1,2])expect(Math.abs(frame.pixel[channel]-value)).toBeLessThanOrEqual(1);expect(frame.pixel[3]).toBe(255);expect(frame.draws).toBe(1);expect(frame.triangles).toBe(2);}
  expect(result.object.geometry).toBe(result.unavailable.geometry);expect(result.green.pixel).toEqual([0,255,0,255]);
  for(const [i,expected]of[27,50,60,255].entries())expect(Math.abs(result.localZero.pixel[i]-expected)).toBeLessThanOrEqual(1);
  for(const frame of[result.local,result.localNoSky])for(const [i,expected]of[53,101,137,255].entries())expect(Math.abs(frame.pixel[i]-expected)).toBeLessThanOrEqual(1);
  for(const [frame,value]of[[result.localOverride,64],[result.localBaked,96],[result.localNonObject,160],[result.removed,64]] as const)for(const i of[0,1,2])expect(Math.abs(frame.pixel[i]-value)).toBeLessThanOrEqual(1);
  expect(result.glError).toBe(0);
  for(const [i,expected]of[160,122,160,255].entries())expect(Math.abs(result.localBright.pixel[i]-expected)).toBeLessThanOrEqual(1);
  expect(result.artistHdr.pixel).toEqual([255,255,255,255]);expect(result.localBright.geometry).toBe(result.removed.geometry);
  expect(result.localGreen.pixel).toEqual([0,255,0,255]);expect(result.local.geometry).toBe(result.localBaseline.geometry);expect(result.localNoSky.geometry).toBe(result.local.geometry);expect(result.removed.geometry).toBe(result.beforeRemove.geometry);
});

test('native authored mip colours reach GPU sampling without generated replacement levels',async({page})=>{
 await page.goto('/tests/ui/fixtures/haloMaterials.html');
 const result=await page.evaluate(async()=>{const {renderAuthoredMipChecks}=await import('/tests/ui/fixtures/haloMaterials.ts' /* @vite-ignore */);return renderAuthoredMipChecks();});
 console.log('HALO_AUTHORED_GPU_MIPS',JSON.stringify(result));
 expect(result.errors).toEqual([]);expect(result.glError).toBe(0);expect(result.base).toEqual([240,16,32,255]);
 expect(result.authored).toEqual([24,208,56,255]);expect(result.last).toEqual(result.authored);expect(result.generated).toBe(false);expect(result.levels).toBe(2);
});

test('original reflection levels and zero-alpha RGB survive native cube GPU upload',async({page})=>{
 await page.goto('/tests/ui/fixtures/haloMaterials.html');const result=await page.evaluate(async()=>{const {renderAuthoredCubeChecks}=await import('/tests/ui/fixtures/haloMaterials.ts' /* @vite-ignore */);return renderAuthoredCubeChecks();});console.log('HALO_ORIGINAL_CUBE_MIPS',JSON.stringify(result));
 expect(result.errors).toEqual([]);expect(result.glError).toBe(0);expect(result.base).toEqual([240,16,32,255]);expect(result.authored).toEqual([24,208,56,255]);expect(result.last).toEqual(result.authored);expect(result.transparent).toEqual([80,160,224,255]);expect(result.generated).toBe(false);expect(result.levels).toBe(2);
});

test('native object silhouettes shadow original BSPs with cutouts and bounded retained GPU ownership',async({page})=>{
 await page.goto('/tests/ui/fixtures/haloMaterials.html');const result=await page.evaluate(async()=>{const {renderNativeShadowChecks}=await import('/tests/ui/fixtures/haloMaterials.ts' /* @vite-ignore */);return renderNativeShadowChecks();});console.log('HALO_NATIVE_SHADOWS',JSON.stringify(result));
 expect(result.errors).toEqual([]);expect(result.glError).toBe(0);
 for(const frame of[result.before,result.outside,result.oldPosition,result.hidden,result.disabled,result.oldMetadata,result.cutout,result.green])expect(frame.pixel).toEqual([200,150,100,255]);
 for(const frame of[result.shadow,result.cached,result.moved,result.opaque]){for(const[i,value]of[40,60,60,255].entries())expect(Math.abs(frame.pixel[i]-value)).toBeLessThanOrEqual(1);expect(frame.drawn).toBe(1);expect(frame.textureBytes).toBe(128*128*4);expect(frame.targetRestored).toBe(true);}
 for(const[i,expected]of[40,60,60,255].entries())expect(Math.abs(result.contextRestored.pixel[i]-expected)).toBeLessThanOrEqual(1);
 expect(result.contextRestored.updated).toBe(1);expect(result.contextRestored.drawn).toBe(1);expect(result.contextRestored.cached).toBe(1);
 expect(result.paused.cached).toBe(1);expect(result.paused.textureBytes).toBe(65536);expect(result.paused.updated).toBe(0);expect(result.shadow.updated).toBe(1);expect(result.cached.updated).toBe(0);expect(result.moved.updated).toBe(1);expect(result.disabled.drawn).toBe(0);expect(result.oldMetadata.drawn).toBe(0);expect(result.disposedReceivers).toBe(0);expect(result.bounded.visible).toBe(13);expect(result.bounded.drawn).toBe(8);expect(result.bounded.cached).toBe(8);expect(result.bounded.textureBytes).toBe(524288);expect(result.retained.cached).toBe(8);
});
