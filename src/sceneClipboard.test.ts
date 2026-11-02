import {beforeEach,expect,it,vi} from 'vitest';
import {cloneSceneObject,copySceneObject,readSceneObject} from './sceneClipboard';
import type {SceneObject} from './types';
const object:SceneObject={id:'tree',name:'Tree',kind:'Scenery',tagId:7,position:[1,2,3],rotation:[0,0,0],scale:[1,1,1],visible:true,sourceOffset:80,rotationOffset:92,assetId:null};
let stored:string|null;
beforeEach(()=>{stored=null;vi.stubGlobal('localStorage',{getItem:()=>stored,setItem:(_key:string,text:string)=>{stored=text;}});});
it('copies source references and transforms without sharing mutable state or native instance offsets',()=>{
  copySceneObject({version:1,sourceProjectId:'map-a',object});
  const copied=readSceneObject()!;copied.object.position[0]=9;
  expect(object.position).toEqual([1,2,3]);expect(readSceneObject()!.object.position).toEqual([1,2,3]);
  const pasted=cloneSceneObject(copied.object),second=cloneSceneObject(copied.object);
  expect(pasted.id).not.toBe(object.id);expect(pasted.id).not.toBe(second.id);expect(pasted.sourceOffset).toBeNull();expect(pasted.rotationOffset).toBeNull();expect(pasted.tagId).toBe(7);
});
it('refuses nonfinite transforms and corrupt local clipboard records',()=>{
  stored=JSON.stringify({version:1,sourceProjectId:'map-a',object:{...object,scale:[0,1,1]}});expect(readSceneObject()).toBeNull();
  stored=JSON.stringify({version:99,sourceProjectId:'map-a',object});expect(readSceneObject()).toBeNull();
  expect(()=>cloneSceneObject({...object,position:[NaN,0,0]})).toThrow();
});
