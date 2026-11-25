import { describe, it, expect } from 'vitest';
import { addInfantryTunnel, addHighGroundRoute, addFlatLandBridge, makeThreeRouteSeam, flattenTerrainConnector,fillTerrainToRidge, assemblyRoutes, assemblySignature, rotateAssemblyAtEntrance, moveDonorToLandingDistance, transformAssembly } from './bspAssembly';
import type { BspAssembly } from './bspAssembly';
const plan: BspAssembly = {
  schemaVersion: 1,
  donorProjectId: 'fixture',
  donorTitle: 'Synthetic interior',
  donorSource: {
    originalPath: 'fixture.map',
    preservedPath: 'fixture.map',
    sha256: '0'.repeat(64),
    cacheVersion: 13,
    engine: 'synthetic',
    scenarioPath: 'fixture',
  },
  donorTagsDirectory: 'fixture-tags',
  donorBspIndex: 0,
  translation: [20, 0, 0],
  yawDegrees: 0,
  tunnelPoints: [
    [0, 0, 0],
    [10, 0, 0],
    [25, 0, 0],
  ],
  tunnelWidth: 2,
  tunnelHeight: 1.6,
  tunnelShaderPath: 'fixture/stone',
};
describe('BSP assembly transforms', () => {
  it('treats old omitted scenery options and reordered IPC keys as the same plan', () => {
    const reordered = Object.fromEntries(
      Object.entries({ ...plan, includeDonorScenery: false }).reverse(),
    ) as unknown as BspAssembly;
    expect(assemblySignature(reordered)).toBe(assemblySignature(plan));
  });
  it('changes semantic identity for scenery and donor transforms', () => {
    expect(assemblySignature({ ...plan, includeDonorScenery: true })).not.toBe(assemblySignature(plan));
    expect(assemblySignature(transformAssembly(plan, [30, 0, 0], 0))).not.toBe(assemblySignature(plan));
  });
  it('closes the gap along the primary landing axis and moves all donor entrances', () => {
    const original=addInfantryTunnel(plan), moved=moveDonorToLandingDistance(original,18);
    expect(moved.translation).toEqual([13,0,0]);
    expect(moved.tunnelPoints).toEqual([[0,0,0],[10,0,0],[18,0,0]]);
    expect(moved.infantryTunnel?.points.at(-1)).toEqual([18,0,0]);
    expect(original.tunnelPoints.at(-1)).toEqual([25,0,0]);
  });
  it('moves the donor mouth while preserving the destination and authored bends', () => {
    const moved = transformAssembly(plan, [30, 10, 2], 90);
    expect(moved.tunnelPoints[0]).toEqual([0, 0, 0]);
    expect(moved.tunnelPoints[1]).toEqual([10, 0, 0]);
    expect(moved.tunnelPoints[2][0]).toBeCloseTo(30);
    expect(moved.tunnelPoints[2][1]).toBeCloseTo(15);
    expect(moved.tunnelPoints[2][2]).toBe(2);
    expect(plan.tunnelPoints[2]).toEqual([25, 0, 0]);
  });
  it('successive adjustments keep the same local mouth instead of accumulating drift', () => {
    let moved = plan;
    for (let i = 0; i < 4; i++) moved = transformAssembly(moved, plan.translation, moved.yawDegrees + 90);
    expect(moved.tunnelPoints.at(-1)![0]).toBeCloseTo(25, 10);
    expect(moved.tunnelPoints.at(-1)![1]).toBeCloseTo(0, 10);
  });
  it('rotates the donor around its entrance while preserving every tunnel point', () => {
    const rotated = rotateAssemblyAtEntrance(plan, 90);
    expect(rotated.translation[0]).toBeCloseTo(25);
    expect(rotated.translation[1]).toBeCloseTo(-5);
    expect(rotated.translation[2]).toBe(0);
    expect(rotated.tunnelPoints).toEqual(plan.tunnelPoints);
    const mouth = transformAssembly(rotated, rotated.translation, 0).tunnelPoints.at(-1)!;
    expect(mouth[0]).toBeCloseTo(30);
    expect(mouth[1]).toBeCloseTo(-5);
    const restored = rotateAssemblyAtEntrance(rotated, 0);
    restored.translation.forEach((v, i) => expect(v).toBeCloseTo(plan.translation[i], 10));
  });
});


describe('separate road and infantry route authoring',()=>{
  it('leaves the existing native source and primary route untouched while creating a reviewable separate tunnel',()=>{
    const before=JSON.stringify(plan),next=addInfantryTunnel(plan);expect(JSON.stringify(plan)).toBe(before);expect(next.tunnelPoints).toBe(plan.tunnelPoints);expect(next.infantryTunnel?.points).toEqual([[0,0,0],[6.25,8,0],[18.75,8,0],[25,0,0]]);expect(next.infantryTunnel?.shaderPath).toBe(plan.tunnelShaderPath);expect(addInfantryTunnel(next)).toBe(next);
    expect(assemblySignature({...plan,openRoad:false,infantryTunnel:undefined})).toBe(assemblySignature(plan));expect(assemblySignature(next)).not.toBe(assemblySignature(plan));
  });
  it('moves both donor mouths and restores their exact local relationship over multiple rotations',()=>{
    const initial=addInfantryTunnel(plan),moved=transformAssembly(initial,[30,10,2],90);
    expect(moved.infantryTunnel!.points.at(-1)).toEqual(moved.tunnelPoints.at(-1));expect(moved.infantryTunnel!.points[1]).toBe(initial.infantryTunnel!.points[1]);
    let rotated=initial;for(let i=0;i<4;i++)rotated=transformAssembly(rotated,initial.translation,rotated.yawDegrees+90);
    rotated.infantryTunnel!.points.at(-1)!.forEach((v,i)=>expect(v).toBeCloseTo(initial.infantryTunnel!.points.at(-1)![i],10));
  });
  it('rotates a separate donor-side infantry entrance with the donor while keeping the primary pivot fixed',()=>{
    const initial=addInfantryTunnel(plan);initial.infantryTunnel!.points[3]=[25,3,0];const next=rotateAssemblyAtEntrance(initial,90);
    expect(next.tunnelPoints).toBe(initial.tunnelPoints);expect(next.infantryTunnel!.points.at(-1)![0]).toBeCloseTo(22);expect(next.infantryTunnel!.points.at(-1)![1]).toBeCloseTo(0);expect(initial.infantryTunnel!.points.at(-1)).toEqual([25,3,0]);
  });
  it('refuses unsupported offsets and too-short connections before creating an unusable route',()=>{
    expect(()=>addInfantryTunnel(plan,Infinity)).toThrow(/offset/);expect(()=>addInfantryTunnel(plan,2)).toThrow(/offset/);expect(()=>addInfantryTunnel({...plan,tunnelPoints:[[0,0,0],[1,0,0]]})).toThrow(/8 world units/);
  });
});

it('preserves terrain-sidecar identity through transforms without altering the original plan',()=>{
 const terrain={...plan,terrainSeam:{shoulderWidth:8,bankHeight:4,baseShaderPath:'owned/grass',donorShaderPath:'owned/snow'}};
 expect(assemblySignature({...plan,terrainSeam:undefined})).toBe(assemblySignature(plan));
 const moved=transformAssembly(terrain,[22,1,0],0);expect(moved.terrainSeam).toEqual(terrain.terrainSeam);
 expect(assemblySignature(terrain)).not.toBe(assemblySignature({...terrain,terrainSeam:{...terrain.terrainSeam,bankHeight:5}}));
 expect(plan).not.toHaveProperty('terrainSeam');
});

describe('three-route canyon seam authoring',()=>{
  it('keeps source identities and the primary points intact while drafting three independent routes',()=>{
    const before=JSON.stringify(plan),next=makeThreeRouteSeam(plan);
    expect(JSON.stringify(plan)).toBe(before);expect(next.donorSource).toBe(plan.donorSource);expect(next.tunnelPoints).toBe(plan.tunnelPoints);
    expect([next.tunnelWidth,next.tunnelHeight]).toEqual([6,4]);
    expect(assemblyRoutes(next).map(route=>route.id)).toEqual(['primary','infantry','highGround']);
    expect(next.highGround!.points).toHaveLength(6);expect(next.highGround!.points[2][2]).toBeGreaterThan(plan.tunnelPoints[0][2]);
    expect(next.highGround!.points[2][1]).toBeLessThan(0);expect(next.infantryTunnel!.points[1][1]).toBeGreaterThan(0);
    expect(assemblySignature(makeThreeRouteSeam(next))).toBe(assemblySignature(next));
    expect(assemblySignature({...plan,highGround:undefined})).toBe(assemblySignature(plan));
  });
  it('retains custom ridge floors through donor transforms and entrance-pivot round trips',()=>{
    const next=makeThreeRouteSeam(plan),source=JSON.stringify(next);next.highGround!.points[next.highGround!.points.length-1]=[25,-3,2];
    const before=JSON.stringify(next),moved=transformAssembly(next,[30,10,2],90);
    expect(JSON.stringify(next)).toBe(before);expect(moved.highGround!.points[1]).toBe(next.highGround!.points[1]);
    const pivot=rotateAssemblyAtEntrance(next,90),restored=rotateAssemblyAtEntrance(pivot,0);
    restored.highGround!.points.at(-1)!.forEach((v,i)=>expect(v).toBeCloseTo(next.highGround!.points.at(-1)![i],10));
    expect(assemblySignature(next)).not.toBe(assemblySignature(plan));expect(source).not.toBe(before);
  });
  it('refuses unsupported length, grade, offset and world bounds before altering a draft',()=>{
    expect(()=>addHighGroundRoute({...plan,tunnelPoints:[[0,0,0],[8,0,0]]})).toThrow(/16 world units/);
    expect(()=>addHighGroundRoute({...plan,tunnelPoints:[[0,0,0],[25,0,10]]})).toThrow(/steep/);
    expect(()=>addHighGroundRoute(plan,Infinity)).toThrow(/offset/);
    expect(()=>addHighGroundRoute({...plan,tunnelPoints:[[2040,0,0],[2065,0,0]]})).toThrow(/world bounds/);
    const next=addHighGroundRoute(plan);expect(addHighGroundRoute(next)).toBe(next);
    expect(assemblyRoutes(next).map(route=>route.label)).toEqual(['Primary connection','High-ground route']);
  });
});

it('starts a flat native connector without losing source edges, materials or other routes',()=>{
 const source={...plan,terrainSeam:{shoulderWidth:8,bankHeight:4,baseShaderPath:'fixture/grass',donorShaderPath:'fixture/snow'}};
 const before=structuredClone(source),flat=flattenTerrainConnector(source);
 expect(flat.terrainSeam).toEqual({...source.terrainSeam,bankHeight:0});
 expect(flat.tunnelPoints).toEqual(source.tunnelPoints);expect(flat.donorSource).toEqual(source.donorSource);
 expect(source).toEqual(before);expect(()=>flattenTerrainConnector(plan)).toThrow(/Plan adjacent terrain/);
});

it('places a natural seam cave outside the vehicle shoulders and uses native ground on its ridge',()=>{
 const source={...plan,tunnelPoints:[[0,0,0],[100,0,0]] as [number,number,number][],tunnelWidth:6,terrainSeam:{shoulderWidth:8,bankHeight:0,baseShaderPath:'fixture/grass',donorShaderPath:'fixture/snow'}};
 const next=makeThreeRouteSeam(source);expect(next.infantryTunnel!.points[1][1]).toBe(13);
 expect(next.highGround!.shaderPath).toBe('fixture/grass');expect(source).not.toHaveProperty('infantryTunnel');
});


it('matches native f32 passage-size readback while retaining f64 coordinate edits',()=>{
 const next=makeThreeRouteSeam(plan),native={...next,tunnelHeight:Math.fround(next.tunnelHeight),infantryTunnel:{...next.infantryTunnel!,height:Math.fround(next.infantryTunnel!.height)}};
 expect(assemblySignature(native)).toBe(assemblySignature(next));
 expect(assemblySignature({...next,translation:[20+1e-10,0,0]})).not.toBe(assemblySignature(next));
 expect(assemblySignature({...next,tunnelWidth:2.01})).not.toBe(assemblySignature(next));
});

it('sectioned seams retain edge identities, native dimensions and independent donor mouths through transforms',()=>{
 const edge={sourceSha256:'a'.repeat(64),bspIndex:0,vertices:[[0,0,0],[0,4,0]] as [[number,number,number],[number,number,number]],point:[0,2,0] as [number,number,number]};
 const section={id:'first',name:'Existing doorway',points:[[0,0,0],[25,3,0]] as [number,number,number][],width:4,height:1.6,shaderPath:'fixture/stone',archSegments:6,edges:[edge,edge] as [typeof edge,typeof edge]};
 const p={...plan,sections:[section]},moved=transformAssembly(p,[30,10,2],90);
 expect(moved.sections![0].points[0]).toEqual(section.points[0]);expect(moved.sections![0].points.at(-1)).toEqual([27,15,2]);expect(moved.sections![0].edges).toBe(section.edges);
 expect(assemblyRoutes(p).at(-1)!.label).toBe('Existing doorway');expect(assemblySignature({...plan,sections:[]})).toBe(assemblySignature(plan));
 expect(assemblySignature({...p,sections:[{...section,height:Math.fround(1.6)}]})).toBe(assemblySignature(p));
});

it('widens the native terrain ribbon to the complete ridge deck and keeps the original plan',()=>{
  const road={...plan,tunnelWidth:6,terrainSeam:{shoulderWidth:8,bankHeight:4,baseShaderPath:'owned/grass',donorShaderPath:'owned/snow'}};
  const draft=addHighGroundRoute(road);
  const widened=fillTerrainToRidge(draft);
  expect(widened.terrainSeam?.shoulderWidth).toBe(12);
  expect(widened.highGround).toBe(draft.highGround);
  expect(draft.terrainSeam?.shoulderWidth).toBe(8);
  expect(fillTerrainToRidge(widened)).toBe(widened);
  expect(()=>fillTerrainToRidge(addHighGroundRoute(road,-40))).toThrow(/fill limit/);
});

it('drafts a six-unit flat bridge above both landings with graded ramps and a separate cave',()=>{
  const road:BspAssembly={...plan,openRoad:true,tunnelPoints:[[0,0,0],[40,0,1]],tunnelWidth:6,tunnelHeight:4,
    terrainSeam:{shoulderWidth:8,bankHeight:0,baseShaderPath:'owned/grass',donorShaderPath:'owned/snow'}};
  const bridge=addFlatLandBridge(road);
  const route=bridge.highGround!;
  expect(route.width).toBe(6);
  expect(route.points[0]).toEqual(road.tunnelPoints[0]);
  expect(route.points.at(-1)).toEqual(road.tunnelPoints.at(-1));
  expect(route.points[2][2]).toBe(route.points[3][2]);
  expect(route.points[2][2]).toBeGreaterThan(1);
  for(let i=1;i<route.points.length;i++){
    const a=route.points[i-1],b=route.points[i];
    expect(Math.abs(b[2]-a[2])/Math.hypot(b[0]-a[0],b[1]-a[1])).toBeLessThanOrEqual(.25);
  }
  expect(bridge.infantryTunnel!.points[1][1]).toBeGreaterThan(0);
  expect(route.points[2][1]).toBeLessThan(0);
  expect(bridge.tunnelPoints).toBe(road.tunnelPoints);
  expect(bridge.terrainSeam?.shoulderWidth).toBe(13);
  expect(road).not.toHaveProperty('highGround');
});

it('keeps a chosen ridge landing and existing cave and refuses impossible bridge elevations',()=>{
  const existing=makeThreeRouteSeam({...plan,tunnelPoints:[[0,0,0],[40,0,0]]});
  const selected:[number,number,number]=[40,-2,1];
  existing.highGround!.points[5]=selected;
  const bridge=addFlatLandBridge(existing);
  expect(bridge.highGround!.points.at(-1)).toEqual(selected);
  expect(bridge.infantryTunnel).toBe(existing.infantryTunnel);
  expect(()=>addFlatLandBridge({...plan,separateNativeBsps:true})).toThrow(/joined BSP/);
  expect(()=>addFlatLandBridge({...plan,tunnelPoints:[[0,0,0],[20,0,3]]})).toThrow(/landing elevations/);
});
