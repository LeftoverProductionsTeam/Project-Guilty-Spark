import { describe, it, expect } from 'vitest';
import { addInfantryTunnel, assemblySignature, rotateAssemblyAtEntrance, transformAssembly } from './bspAssembly';
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
