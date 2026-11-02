import type {SceneObject} from './types';
import type {ForgeAsset} from './forge';
import {validateSceneTransform} from './sourcePreflight';
export interface SceneClipboard {version:1;sourceProjectId:string;object:SceneObject;asset?:ForgeAsset}
const key='guilty-spark:scene-clipboard-v1';
let fallback:SceneClipboard|null=null;
export function copySceneObject(value:SceneClipboard){
  validateSceneTransform(value.object);fallback=structuredClone(value);
  try{localStorage.setItem(key,JSON.stringify(value));}catch{/* Same-window copy still works. */}
}
export function readSceneObject():SceneClipboard|null{
  let value:unknown=fallback;
  try{const text=localStorage.getItem(key);if(text&&text.length<128*1024)value=JSON.parse(text);}catch{/* Use the last local copy. */}
  if(!value||typeof value!=='object')return null;
  const item=value as SceneClipboard;
  if(item.version!==1||typeof item.sourceProjectId!=='string'||!item.sourceProjectId||!item.object||typeof item.object.name!=='string'||item.object.name.length>256)return null;
  try{validateSceneTransform(item.object);}catch{return null;}
  if(item.asset&&(!item.asset.sourceProjectId||!/^[a-f0-9]{64}$/i.test(item.asset.sourceSha256??'')||!Number.isSafeInteger(item.asset.tagId)))return null;
  return structuredClone(item);
}
export function cloneSceneObject(object:SceneObject):SceneObject{
  validateSceneTransform(object);
  return {...structuredClone(object),id:crypto.randomUUID(),name:object.name+' copy',sourceOffset:null,rotationOffset:null};
}
