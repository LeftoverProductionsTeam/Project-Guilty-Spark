import {describe,it,expect} from 'vitest';
import {pointInsideForgeRoom} from './forge';
import type {QuickForgeDocument} from './forge';
const document:QuickForgeDocument={schemaVersion:1,name:'Placement test',template:'customBlank',runtimeId:'haloCustomEdition',gameMode:'slayer',skyPath:null,buildQuality:'draft',geometry:[{id:'room',name:'Room',kind:'room',position:[0,0,4],rotation:[0,0,0],dimensions:[24,32,8],materialId:'m',visible:true,locked:false,steps:4,heights:[]}],materials:[],placements:[],spawns:[],objectives:[]};
describe('QuickForge source placement containment',()=>{
  it('rejects wall/roof/exterior drops and accepts the interior',()=>{
    expect(pointInsideForgeRoom(document,[0,0,0.1])).toBe(true);
    for(const p of [[12,0,2],[0,0,8],[12,-11,8.1],[0,0,0],[NaN,0,1]])expect(pointInsideForgeRoom(document,p as [number,number,number])).toBe(false);
  });
  it('uses room rotation and preserves blank project authoring',()=>{
    const rotated=structuredClone(document);rotated.geometry[0].rotation=[0,0,Math.PI/2];
    expect(pointInsideForgeRoom(rotated,[15,0,1])).toBe(true);
    expect(pointInsideForgeRoom(rotated,[0,13,1])).toBe(false);
    expect(pointInsideForgeRoom({...document,geometry:[]},[100,100,1])).toBe(true);
  });
});

import {boxBrush, worldVertex, workshopExample} from './bspWorkshop';
import {forgeGeometryKey} from './forge';
describe('shared Workshop object authoring',()=>{
  it('places into transformed space and rejects solid interiors and the exterior',()=>{
    const room=boxBrush('space','space',[-4,-4,0],[4,4,5],'m');room.position=[12,-3,2];room.rotation=[.3,-.4,.8];room.scale=[2,.5,1.5];
    const solid={...boxBrush('solid','solid',[-1,-1,0],[1,1,2],'m'),position:room.position,rotation:room.rotation,scale:room.scale};
    const doc={...document,geometry:[],workshop:{schemaVersion:1 as const,brushes:[room,solid],portals:[]}};
    expect(pointInsideForgeRoom(doc,worldVertex(room,[3,0,1]))).toBe(true);
    expect(pointInsideForgeRoom(doc,worldVertex(room,[0,0,1]))).toBe(false);
    expect(pointInsideForgeRoom(doc,worldVertex(room,[0,0,3]))).toBe(true);
    expect(pointInsideForgeRoom(doc,worldVertex(room,[5,0,1]))).toBe(false);
  });
  it('keeps gameplay when generating example geometry and invalidates mesh only for source changes',()=>{
    const doc={...structuredClone(document),materials:[{id:'m',name:'surface',shaderPath:null,color:[.2,.3,.4] as [number,number,number]}],gameMode:'king' as const,spawns:[{id:'authored-start',name:'Keep me',position:[1,2,1] as [number,number,number],facing:.3,team:1,gameModes:['king'],visible:true,locked:false}],objectives:[{id:'hill',kind:'hill' as const,name:'Keep hill',position:[2,2,1] as [number,number,number],facing:0,team:0,sequence:0,visible:true,locked:false}]};
    const next=workshopExample(doc);expect(next.spawns).toEqual(doc.spawns);expect(next.objectives).toEqual(doc.objectives);expect(next.gameMode).toBe('king');expect(doc.geometry.length).toBe(1);
    const key=forgeGeometryKey(next);next.materials[0].name='bound material';next.materials[0].shaderPath='levels/test/tutorial/shaders/example_tutorial_metal_floor';expect(forgeGeometryKey(next)).toBe(key);next.spawns[0].position[0]+=1;expect(forgeGeometryKey(next)).toBe(key);next.workshop!.brushes[0].position[0]+=1;expect(forgeGeometryKey(next)).not.toBe(key);
  });
  it('inverts multi-axis legacy room rotation in the correct order',()=>{
    const doc=structuredClone(document),b=doc.geometry[0];b.rotation=[.7,-.5,.9];
    const brush={...boxBrush('b','space',[-12,-16,-4],[12,16,4],'m'),position:b.position,rotation:b.rotation};
    expect(pointInsideForgeRoom(doc,worldVertex(brush,[11,15,3]))).toBe(true);
    expect(pointInsideForgeRoom(doc,worldVertex(brush,[13,15,3]))).toBe(false);
  });
});
