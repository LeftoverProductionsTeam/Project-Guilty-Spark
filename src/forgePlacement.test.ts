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
