import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {shadowSurface,MAX_SHADOW_RECEIVER_TRIANGLES} from './haloObjectShadows';
import {sourceObjectLighting,sampleIncidentRadiosity} from './haloLightmap';
import type {MeshData} from './types';
const terrain:MeshData={label:'original floor',source:'halo-bsp-render',positions:[-2,-2,0,2,-2,0,2,2,0,-2,2,0],normals:[0,0,1,0,0,1,0,0,1,0,0,1],uvs:[0,0,1,0,1,1,0,1],lightmapUvs:[0,0,1,0,1,1,0,1],incidentRadiosity:[.3,0,.4,.3,0,.4,.3,0,.4,.3,0,.4],indices:[0,1,2,0,2,3],materialRanges:[{bspIndex:0,lightmapIndex:0,shaderTagId:7,lightmapBitmapTagId:8,lightmapPage:0,hasIncidentRadiosity:true,hasLightmapUvs:true,indexStart:0,indexCount:6}]};
const center=new THREE.Vector3(0,0,1),direction=new THREE.Vector3(0,0,-1);
describe('source-derived native object shadows',()=>{
 it('uses exact source floor vertices without a fabricated flat receiver',()=>{
  const result=shadowSurface(terrain,center,direction,1)!;expect(result.triangles).toBe(2);expect([...result.positions]).toEqual(terrain.indices.flatMap(i=>terrain.positions.slice(i*3,i*3+3)));
  expect(shadowSurface(terrain,new THREE.Vector3(100,0,1),direction,1)).toBeNull();
  expect(shadowSurface({...terrain,materialRanges:[]},center,direction,1)).toBeNull();
  expect(shadowSurface({...terrain,materialRanges:[...terrain.materialRanges!,{...terrain.materialRanges![0],bspIndex:1}]},center,direction,1)).toBeNull();
 });
 it('rejects bad geometry, wrong facing and excessive native receiver counts',()=>{
  expect(shadowSurface({...terrain,indices:[0,1,9999]},center,direction,1)).toBeNull();
  expect(shadowSurface({...terrain,positions:[NaN,...terrain.positions.slice(1)]},center,direction,1)).toBeNull();
  expect(shadowSurface(terrain,center,direction,0)).toBeNull();expect(shadowSurface(terrain,center,direction,Infinity)).toBeNull();
  expect(shadowSurface({...terrain,normals:terrain.normals!.map(n=>-n)},center,direction,1)).toBeNull();
  const indices=Array.from({length:MAX_SHADOW_RECEIVER_TRIANGLES+1},()=>[0,1,2]).flat();
  expect(shadowSurface({...terrain,indices,materialRanges:[{...terrain.materialRanges![0],indexCount:indices.length}]},center,direction,1)).toBeNull();
 });
 it('keeps accuracy-dependent source tint/direction distinct from object brightening',()=>{
  const sample=sampleIncidentRadiosity(terrain,[0,0,1])!,light=sourceObjectLighting(sample,[.1,.2,.3],[.2,.4,.6])!;
  expect(light.shadow!.tint).toEqual([.99,.73,.47]);expect(Math.hypot(...light.shadow!.direction)).toBeCloseTo(1,10);expect(light.shadow!.direction[0]).toBeLessThan(0);expect(light.shadow!.direction[2]).toBeLessThan(-.7);
  expect(sourceObjectLighting(sample,[.1,.2,.3],[.2,.4,.6],true)!.shadow).toEqual(light.shadow);
  expect(sourceObjectLighting({...sample,accuracy:NaN},[.1,.2,.3],[.2,.4,.6])).toBeNull();
 });
});
