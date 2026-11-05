import { expect, test } from 'vitest';
import { defaultTagContext, inspectTagContexts } from './tagContexts';
import type { MapInspection, Project, Tag } from './types';

const tag = (id:number, className:string):Tag => ({id,index:id,class:className,path:`test/${id}`,dataOffset:id,external:false,fields:[],references:[]});
function fixture() {
  const object=tag(1,'weap'),model=tag(2,'mod2'),shader=tag(3,'soso'),bitmap=tag(4,'bitm'),sound=tag(5,'snd!'),wrong=tag(6,'bitm');
  object.references=[{label:'Model',class:'mod2',targetId:2,offset:40},{label:'Sound',class:'snd!',targetId:5,offset:56},{label:'Bad shader',class:'soso',targetId:6,offset:72}];
  model.references=[{label:'Shader',class:'soso',targetId:3,offset:40}];
  model.fields=[{key:'shader',label:'Shader',offset:40,kind:'reference',value:3,min:0,max:0xffffffff,unit:'reference',targetClass:'soso'}];
  shader.references=[{label:'Base bitmap',class:'bitm',targetId:4,offset:40}];
  shader.shaderPreview={alphaTest:false,twoSided:false,uvScale:[1,1]};
  const project={id:'source-a',source:{sha256:'a'.repeat(64)},tagEdits:[]} as unknown as Project;
  const inspection={sha256:'a'.repeat(64),header:{version:609},tags:[object,model,shader,bitmap,sound,wrong]} as unknown as MapInspection;
  return {project,inspection,object,model,shader,bitmap,sound};
}
test('asset contexts follow valid native references and refuse mismatched-class or foreign source data',()=>{
  const f=fixture(),result=inspectTagContexts(f.project,f.inspection,f.object);
  expect(result.materials).toEqual([f.shader]);expect(result.bitmaps).toEqual([f.bitmap]);expect(result.sounds).toEqual([f.sound]);expect(result.collision).toBe(true);
  expect(inspectTagContexts({...f.project,source:{...f.project.source!,sha256:'b'.repeat(64)}},f.inspection,f.object)).toMatchObject({materials:[],sounds:[],collision:false,error:expect.stringContaining('exact preserved source')});
  // An untyped collision tag cannot be shown as an object collider.
  const collision=tag(10,'coll');f.inspection.tags.push(collision);
  expect(inspectTagContexts(f.project,f.inspection,collision).collision).toBe(false);
});
test('staged reference edits select the new valid material without changing the source or treating it as compiled',()=>{
  const f=fixture(),replacement=tag(7,'soso');replacement.shaderPreview={alphaTest:true,twoSided:true,uvScale:[2,3]};f.inspection.tags.push(replacement);
  const original=JSON.stringify(f.inspection);
  f.project.tagEdits=[{tagId:f.model.id,fieldKey:'shader',value:7}];
  expect(inspectTagContexts(f.project,f.inspection,f.object).materials).toEqual([replacement]);
  expect(JSON.stringify(f.inspection)).toBe(original);
  expect(defaultTagContext(f.sound)).toBe('Sound');expect(defaultTagContext(f.bitmap)).toBe('Materials');
});
