import {describe,it,expect} from 'vitest';
import stockAtlas from '../docs/fixtures/c43-original-bsp-atlas.json';
import {alignAtlasDonor,applyCompactStockLayout,applyAtlasSurfaceAccess,atlasAdjacentRegions,atlasCoveringRegions,originalMultiplayerMaps,originalRegions,addLayoutRegions,regionFootprint,overlappingRegions,spreadLayout,selectedExtractionPoints,previewExtractionRoll,stockExtractionDraft} from './megaworldLayout';
import type {AtlasRegion,ExtractionPoint,ExtractionPoints} from './megaworldLayout';
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
 const ring=next.regions.map(r=>{const [q,row]=r.hexSlot!;return Math.max(Math.abs(q),Math.abs(row),Math.abs(q+row));});
 const widths=[-2,-1,0,1,2].map(row=>next.regions.filter(r=>r.hexSlot?.[1]===row).length);
 expect(widths).toEqual([3,4,5,4,3]);
 expect(atlasAdjacentRegions(next.regions,next.regions[17])).toHaveLength(6);
 expect(ring.filter(r=>r===0)).toHaveLength(1);expect(ring.filter(r=>r===1)).toHaveLength(6);expect(ring.filter(r=>r===2)).toHaveLength(12);expect(overlappingRegions(next.regions)).toEqual([]);
});

it('only suggests surface cover when a lower interior fits the rotated footprint',()=>{
 const layout=addLayoutRegions(null,[region('timberland'),region('chillout',1),region('wizard',2)]);
 const [terrain,cave,secondCave]=layout.regions;
 const surface={...terrain,yawDegrees:90};
 const interior={...cave,underground:true,minimum:[-2,-2,0] as [number,number,number],
   maximum:[2,2,3] as [number,number,number],translation:[0,5,-10] as [number,number,number]};
 const other={...secondCave,underground:true};
 expect(atlasCoveringRegions([surface,other],interior)).toEqual([surface]);
 expect(atlasCoveringRegions([surface],{...interior,translation:[5,0,-10]})).toEqual([]);
 expect(atlasCoveringRegions([surface],{...interior,translation:[0,5,2]})).toEqual([]);
});
it('copies a native alignment into the neighboring Atlas slot at full precision',()=>{
 const arranged=spreadLayout(addLayoutRegions(null,[region('timberland'),region('sidewinder',1)]));
 const [base,donor]=arranged.regions;
 const native=[68.88340761726377,32.66749670335764,-21.075047395103685] as [number,number,number];
 const result=alignAtlasDonor(arranged,base,donor,native,0);
 expect(result.regions[0]).toBe(base);
 expect(result.regions[1].hexSlot).toEqual(donor.hexSlot);
 expect(result.regions[1].translation).toEqual(native);
 const origin={...base,translation:[24,10,-4] as [number,number,number],yawDegrees:90};
 const compiledBase={...base,translation:[0,-10,0] as [number,number,number],yawDegrees:-45};
 const continued=alignAtlasDonor(arranged,compiledBase,donor,[4,8,-16],15,origin);
 expect(continued.regions[1].translation).toEqual([16,14,-20]);
 expect(continued.regions[1].yawDegrees).toBe(105);
});

it('keeps reviewed burial depth and an explicit access edge outside the hex neighbors',()=>{
  const layout=addLayoutRegions(null,[region('terrain'),region('room',1),region('outside',2)]);
  const [surface,room,outside]=layout.regions;
  surface.hexSlot=[0,0];
  room.hexSlot=[-2,2];
  room.underground=true;
  room.translation=[1,2,-10];
  outside.hexSlot=[2,-2];
  expect(atlasAdjacentRegions(layout.regions,surface)).toEqual([]);
  const linked=applyAtlasSurfaceAccess(layout,room.regionId,surface.regionId,2,-19,-90);
  expect(linked.regions[1].translation).toEqual([1,2,-19]);
  expect(atlasAdjacentRegions(linked.regions,surface)).toEqual([linked.regions[1]]);
  expect(atlasAdjacentRegions(linked.regions,linked.regions[1])).toEqual([surface]);
  expect(linked.regions[0]).toBe(surface);
  expect(room.translation).toEqual([1,2,-10]);
  expect(()=>applyAtlasSurfaceAccess(layout,room.regionId,room.regionId,2,-19,0)).toThrow('surface');
  const shifted=spreadLayout(linked,outside.regionId).regions;
  expect(shifted[1].translation.map((axis,i)=>axis-shifted[0].translation[i])).toEqual([1,2,-19]);
});

it('loads the stock compact layout and preserves built surface frames', () => {
  const sources = stockAtlas.regions.filter(row => row.cacheVersion === 609 && row.scenarioType === 1 && row.bspIndex === 0)
    .map(row => ({...row, minimum: row.minimum as [number, number, number], maximum: row.maximum as [number, number, number],
      translation: [0, 0, 0] as [number, number, number], yawDegrees: 0}));
  const original = JSON.stringify(sources);
  const plan = applyCompactStockLayout(null, sources);
  const region = (name: string) => plan.regions.find(row => row.mapName === name)!;
  expect(plan.regions).toHaveLength(19);
  expect([-2, -1, 0, 1, 2].map(row => plan.regions.filter(item => item.hexSlot?.[1] === row).length)).toEqual([3, 4, 5, 4, 3]);
  expect(region('sidewinder').translation).toEqual([114.02209091186523, 9.3280029296875, -17.233085022040342]);
  expect(plan.regions.filter(row => row.underground && row.surfaceAccess)).toHaveLength(9);
  expect(region('hangemhigh').surfaceAccess?.surfaceRegionId).toBe(region('bloodgulch').regionId);
  expect(region('chillout')).toMatchObject({translation: [-12, 30, -31], surfaceAccess: {surfaceRegionId: region('timberland').regionId, headingDegrees: -180}});
  expect(atlasAdjacentRegions(plan.regions, region('timberland')).map(row => row.mapName)).toContain('dangercanyon');
  expect(JSON.stringify(sources)).toBe(original);
  const moved = { ...region('timberland'), translation: [40, 25, -4] as [number, number, number], yawDegrees: 90 };
  const rotated = applyCompactStockLayout(plan, sources, [moved]);
  expect(rotated.regions.find(row => row.mapName === 'chillout')).toMatchObject({translation: [10, 13.000000000000002, -35], surfaceAccess: {headingDegrees: -90}});
  expect(() => applyCompactStockLayout(null, sources.slice(1))).toThrow('Missing');
  expect(() => applyCompactStockLayout(plan, sources, [region('timberland'), {...region('sidewinder'), translation: [80, 0, 0]}])).toThrow('move compiled');
});

it('draws exactly one vehicle and three distinct weapons from reviewed points without changing the pool',()=>{
 const row=(index:number, base:number):ExtractionPoint=>({row:index,label:'point'+index,position:[base+index,0,0]});
 const candidates:ExtractionPoints={
  playerStarts:[row(1,0),row(2,0)],
  weapons:[row(0,10),row(3,10),row(4,10),row(6,10)],
  vehicles:[row(1,20),row(2,20)],
 };
 const pool={playerStarts:[1,2],weapons:[0,3,4,6],vehicles:[1,2]};
 const reviewed=selectedExtractionPoints(pool,candidates);
 expect(previewExtractionRoll(reviewed,()=>0).weapons.map(point=>point.row)).toEqual([0,3,4]);
 const last=previewExtractionRoll(reviewed,()=>0.99);
 expect(last.weapons.map(point=>point.row)).toEqual([6,4,3]);
 expect(last.vehicles.map(point=>point.row)).toEqual([2]);
 expect(last.playerStarts.map(point=>point.row)).toEqual([2]);
 expect(pool.weapons).toEqual([0,3,4,6]);
 const placed:ExtractionPoint={row:-1,label:'Placed Ghost',position:[40,0,0]};
 const authoredPool={...pool,vehicles:[],authoredVehicleIds:['ghost']};
 expect(previewExtractionRoll(selectedExtractionPoints(authoredPool,candidates,new Map([['ghost',placed]])),()=>0).vehicles).toEqual([placed]);
 expect(()=>selectedExtractionPoints(authoredPool,candidates)).toThrow('vehicle placement is unavailable');
 expect(()=>selectedExtractionPoints({...pool,playerStarts:[1,1]},candidates)).toThrow('two player starts');
 const starts = candidates.playerStarts.map(point => ({...point,teamIndex:0}));
 expect(()=>selectedExtractionPoints(pool,{...candidates,playerStarts:starts})).toThrow('both UNSC and Covenant');
 starts[0].teamIndex = -1;
 expect(selectedExtractionPoints(pool,{...candidates,playerStarts:starts}).playerStarts).toHaveLength(2);
 expect(()=>selectedExtractionPoints({...pool,weapons:[0,3,9]},candidates)).toThrow('unavailable');
 expect(()=>selectedExtractionPoints(pool,{...candidates,vehicles:[{...candidates.vehicles[0],position:candidates.weapons[0].position},candidates.vehicles[1]]})).toThrow('separate');
});

it('keeps a saved Extraction pool when reorganizing or adding Atlas regions',()=>{
 const source=region('fixture');
 const plan=addLayoutRegions(null,[source]);
 const extraction={[source.id]:{playerStarts:[1,3],weapons:[2,5,6],vehicles:[1]}};
 expect(spreadLayout({...plan,extraction}).extraction).toEqual(extraction);
 expect(addLayoutRegions({...plan,extraction},[region('neighbor',1)]).extraction).toEqual(extraction);
});

it('fills a starter draft with faction starts and preserves room for an authored vehicle',()=>{
 const point=(row:number,x:number,teamIndex?:number):ExtractionPoint=>({row,label:String(row),position:[x,0,0],teamIndex});
 const candidates:ExtractionPoints={
  playerStarts:[point(10,0,-1),point(11,1,0),point(12,2,1)],
  weapons:[point(20,10),point(21,11),point(22,12),point(23,13)],
  vehicles:[point(30,13)]
 };
 const draft=stockExtractionDraft(candidates);
 expect(draft).toEqual({playerStarts:[10,12],weapons:[20,21,22],vehicles:[30]});
 expect(()=>selectedExtractionPoints(draft,candidates)).not.toThrow();
 expect(stockExtractionDraft({...candidates,vehicles:[]})).toEqual({
  playerStarts:[10,12],weapons:[20,21,22,23],vehicles:[]
 });
});
