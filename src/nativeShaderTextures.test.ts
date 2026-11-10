import { expect, it } from 'vitest';
import { nativeShaderTextureRole,unassignedNativeTriangles,nativeMeterInputs } from './nativeShaderTextures';
it('loads every decoded generic and Chicago layer without accepting fabricated stages',()=>{
  for(const prefix of ['Chicago','Transparent'])for(let index=1;index<=3;index++)
    expect(nativeShaderTextureRole(`${prefix} layer ${index}`)).toBe(`layer${index}`);
  expect(nativeShaderTextureRole('Multipurpose map')).toBe('multipurpose');
  expect(nativeShaderTextureRole('Diffuse map')).toBe('base');
  expect(nativeShaderTextureRole('Background tint map')).toBe('glassTintMap');
  for(const label of ['Transparent layer 0','Transparent layer 4','Chicago layer 999','Reflection cube map','unknown'])
    expect(nativeShaderTextureRole(label)).toBeUndefined();
});

it('reports unsupported and partially attributed source geometry without mutating it',()=>{
  const indices=[0,1,2,2,3,0,0,3,4,4,5,0],range=(indexStart:number,indexCount:number)=>({shaderTagId:7,bspIndex:0,lightmapIndex:0,indexStart,indexCount});
  const mesh={indices,materialRanges:[range(6,3),range(0,3)]},original=structuredClone(mesh);
  expect(unassignedNativeTriangles(mesh)).toBe(2);expect(mesh).toEqual(original);
  expect(unassignedNativeTriangles({indices,materialRanges:[]})).toBe(4);
  expect(unassignedNativeTriangles({indices})).toBe(4);
  expect(unassignedNativeTriangles({indices,materialRanges:[range(0,12)]})).toBe(0);
  expect(unassignedNativeTriangles({indices:[]})).toBe(0);
});
it('counts overlapping attribution only once instead of concealing uncovered triangles',()=>{
  const range=(indexStart:number,indexCount:number)=>({shaderTagId:7,bspIndex:0,lightmapIndex:0,indexStart,indexCount});
  expect(unassignedNativeTriangles({indices:Array(12).fill(0),materialRanges:[range(0,6),range(3,6)]})).toBe(1);
});
it('does not call malformed material attribution complete',()=>{
  const range=(indexStart:number,indexCount:number)=>({shaderTagId:7,bspIndex:0,lightmapIndex:0,indexStart,indexCount});
  for(const r of[range(-3,3),range(0,4),range(1,3),range(0,15),range(NaN,3),range(0,0)])expect(unassignedNativeTriangles({indices:Array(12).fill(0),materialRanges:[r]})).toBeNull();
  expect(unassignedNativeTriangles({indices:[0,1]})).toBeNull();
  expect(unassignedNativeTriangles({indices:[0,1,2],materialRanges:Array(16385).fill(range(0,3))})).toBeNull();
});

it('resolves native meter sources without inventing unavailable engine values',()=>{
 const shader={kind:'meter',alphaTest:false,twoSided:false,uvScale:[1,1] as [number,number],meter:{flags:17,gradientMin:[0,1,0] as [number,number,number],gradientMax:[1,0,0] as [number,number,number],background:[0,0,0] as [number,number,number],flash:[1,1,1] as [number,number,number],tint:[1,1,1] as [number,number,number],meterTransparency:0,backgroundTransparency:0,sources:[0,0,3,0,3] as [number,number,number,number,number]}};
 expect(nativeMeterInputs(shader,[null,null,0,null])).toEqual([1,1,0,1,0]);
 expect(nativeMeterInputs(shader,[null,null,null,null])).toBeNull();expect(nativeMeterInputs(shader,null)).toBeNull();
 expect(nativeMeterInputs(shader,undefined)).toEqual([1,1,1,1,1]);
 for(const bad of[NaN,Infinity,-1,2])expect(nativeMeterInputs(shader,[0,0,bad,0])).toBeNull();
 expect(nativeMeterInputs({...shader,meter:{...shader.meter,sources:[0,0,5,0,0]}},undefined)).toBeNull();
 expect(nativeMeterInputs({...shader,kind:'model'},[0,0,0,0])).toBeNull();
});
