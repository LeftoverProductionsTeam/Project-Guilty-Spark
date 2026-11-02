import {expect,it} from 'vitest';
import {planOwnedMaterialPreviews} from './ownedMaterialBatch';
import type {MapInspection,MeshData} from './types';

it('schedules exact CE indexed bitmap dependencies through the material audit, while other external layouts stay refused',()=>{
  const inspection={sha256:'a'.repeat(64),header:{version:609,engine:'Synthetic CE'},tags:[
    {id:1,class:'soso',path:'test/shader',primaryBitmapStatus:'resolved',references:[{label:'Diffuse map',class:'bitm',targetId:2}]},
    {id:2,class:'bitm',path:'test/bitmap',external:true,references:[]},
  ]} as unknown as MapInspection;
  const mesh={positions:[0,0,0,1,0,0,0,1,0],indices:[0,1,2],materialRanges:[{shaderTagId:1,bspIndex:0,indexStart:0,indexCount:3}]} as MeshData;
  expect(planOwnedMaterialPreviews(inspection,mesh).shaderTasks).toEqual([{kind:'shader',shaderTagId:1,bitmapTagId:2,imageIndex:0,key:'shader:1'}]);
  for(const version of [5,6,7,13])expect(planOwnedMaterialPreviews({...inspection,header:{...inspection.header,version}},mesh).shaderTasks).toEqual([]);
  expect(planOwnedMaterialPreviews(inspection,mesh,new Set([1])).shaderTasks).toEqual([]);
  const mismatched={...inspection,tags:inspection.tags.map(t=>t.id===2?{...t,class:'snd!'}:t)};
  expect(planOwnedMaterialPreviews(mismatched,mesh).shaderTasks).toEqual([]);
});
