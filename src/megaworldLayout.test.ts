import {describe,it,expect} from 'vitest';
import {originalMultiplayerMaps,originalRegions,addLayoutRegions,regionFootprint,overlappingRegions,spreadLayout} from './megaworldLayout';
import type {AtlasRegion} from './megaworldLayout';
const region=(name:string,index=0):AtlasRegion=>({id:index.toString(16).padStart(64,'0')+':0',cacheSha256:index.toString(16).padStart(64,'0'),cacheVersion:609,bspIndex:0,mapName:name,bspName:name,scenarioType:1,minimum:[-10,-5,-2],maximum:[10,5,4],translation:[0,0,0],yawDegrees:0,coordinates:'Halo Z up',collisionTriangles:2,renderTriangles:2,boundaryEdges:0,nonmanifoldEdges:0,degenerateTriangles:0,shaders:[],runtimes:['CE']});
describe('source-bound Megaworld layout',()=>{
 it('keeps all19 original source identities, refuses ambiguous edition selection and reports missing regions',()=>{
  const sources=originalMultiplayerMaps.map((name,i)=>region(name,i)),before=JSON.stringify(sources),found=originalRegions(sources);
  expect(found.missing).toEqual([]);expect(new Set(found.regions.map(r=>r.id)).size).toBe(19);
  expect(originalRegions(sources.slice(1)).missing).toEqual(['beavercreek']);
  expect(()=>originalRegions([...sources,{...region('beavercreek',99),cacheVersion:5}])).toThrow('Choose one runtime');
  const layout=addLayoutRegions(null,found.regions);expect(addLayoutRegions(layout,sources).regions).toHaveLength(19);expect(JSON.stringify(sources)).toBe(before);
 });
 it('rotates around native origin, preserves UV/source bounds and distinguishes bounds overlaps from Z separation',()=>{
  const a=addLayoutRegions(null,[region('a')]).regions[0],b={...a,regionId:'b',translation:[15,0,0] as [number,number,number]},before=JSON.stringify(a);
  expect(overlappingRegions([a,b])).toEqual([[a.regionId,'b']]);
  expect(overlappingRegions([a,{...b,translation:[30,0,0]}])).toEqual([]);
  expect(overlappingRegions([a,{...b,translation:[0,0,10]}])).toEqual([]);
  const rotated=regionFootprint({...a,yawDegrees:90});expect(rotated[0][0]).toBeCloseTo(5);expect(rotated[0][1]).toBeCloseTo(-10);
  expect(JSON.stringify(a)).toBe(before);
 });
 it('spreads19 rotated bounds without mutating source coordinates or Z and limits authoring size',()=>{
  const plan=addLayoutRegions(null,originalMultiplayerMaps.map((name,i)=>region(name,i)));plan.regions[3].yawDegrees=37;
  const before=JSON.stringify(plan),spread=spreadLayout(plan);expect(overlappingRegions(spread.regions)).toEqual([]);expect(JSON.stringify(plan)).toBe(before);
  expect(spread.regions.map(r=>[r.cacheSha256,r.minimum,r.maximum,r.translation[2],r.yawDegrees])).toEqual(plan.regions.map(r=>[r.cacheSha256,r.minimum,r.maximum,r.translation[2],r.yawDegrees]));
  expect(()=>addLayoutRegions(null,Array.from({length:65},(_,i)=>region('variant',i)))).toThrow('64');
 });
});

it('places the chosen center inside two complete six-sided rings for19 equal native footprints',()=>{
 const plan=addLayoutRegions(null,originalMultiplayerMaps.map((name,i)=>region(name,i))),center=plan.regions[17].regionId,next=spreadLayout(plan,center);
 expect(next.regions[17].translation).toEqual([0,0,0]);
 const ring=next.regions.map(r=>{const row=r.translation[1]/10,q=r.translation[0]/20-row/2;return Math.max(Math.abs(q),Math.abs(row),Math.abs(q+row));});
 expect(ring.filter(r=>r===0)).toHaveLength(1);expect(ring.filter(r=>r===1)).toHaveLength(6);expect(ring.filter(r=>r===2)).toHaveLength(12);expect(overlappingRegions(next.regions)).toEqual([]);
});
