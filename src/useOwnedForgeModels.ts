import {useEffect,useState} from 'react';
import * as THREE from 'three';
import {call,native} from './api';
import type {ForgePlacement} from './forge';
import type {MeshData,Tag,ShaderPreview} from './types';
import {decodeOwnedBitmapBatch,MAX_NATIVE_BATCH_RGBA_BYTES} from './ownedBitmapBatch';
import type {OwnedBitmapBatchResponse} from './ownedBitmapBatch';
import {configureSourceTexture} from './sourceTexture';
import {extraTextureKey} from './haloMaterial';

export interface OwnedModelView {mesh:MeshData;shaderTextures:Record<number,THREE.Texture>;extraTextures:Record<string,THREE.Texture>;shaderMetadata:Record<number,ShaderPreview>}
interface ModelResponse {sourceSha256:string;resourceSha256:string|null;objectTagId:number;modelTagId:number;mesh:MeshData;tags:Tag[]}
export const forgeModelKey=(value:ForgePlacement)=>`${value.sourceProjectId}:${value.sourceSha256}:${value.tagId}`;

/** One shared set of source models/textures for a viewport. Transform edits do
 * not reload sources. A missing dependency never creates replacement geometry. */
export function useOwnedForgeModels(placements:ForgePlacement[]){
  const [models,setModels]=useState<Record<string,OwnedModelView>>({});
  const [failures,setFailures]=useState<Record<string,string>>({});
  const sources=[...new Map(placements.map(p=>[forgeModelKey(p),p])).values()];
  const scope=JSON.stringify(sources.map(p=>[p.sourceProjectId,p.sourceSha256,p.tagId]));
  useEffect(()=>{
    let live=true,textureBytes=0,geometryBytes=0;
    const pool=new Map<string,THREE.Texture>(),loaded:Record<string,OwnedModelView>={},errors:Record<string,string>={};
    setModels({});setFailures({});
    async function load(){for(const placement of sources){
      if(!live)return;const key=forgeModelKey(placement);
      try{
        if(!native||!placement.sourceProjectId||!placement.sourceSha256||placement.tagId==null)throw new Error('An imported map and exact source tag are required');
        if(Object.keys(loaded).length>=128)throw new Error('The viewport model-type limit is full');
        const result=await call<ModelResponse>('preview_owned_object_model',{projectId:placement.sourceProjectId,tagId:placement.tagId,sourceSha256:placement.sourceSha256});
        if(!live)return;
        if(result.sourceSha256!==placement.sourceSha256||result.objectTagId!==placement.tagId)throw new Error('Model source identity differs from its placement');
        const bytes=(result.mesh.positions.length+(result.mesh.normals?.length??0)+(result.mesh.uvs?.length??0)+result.mesh.indices.length+(result.mesh.rig?.weights.length??0))*4+(result.mesh.rig?.indices.length??0)*2;
        if(geometryBytes+bytes>128*1024*1024)throw new Error('The viewport model geometry budget is full');geometryBytes+=bytes;
        const view:OwnedModelView={mesh:result.mesh,shaderTextures:{},extraTextures:{},shaderMetadata:{}};
        loaded[key]=view;setModels({...loaded});
        const tasks:{shader:number;bitmap:number;role:string}[]=[];
        for(const tag of result.tags.filter(t=>t.shaderPreview&&t.primaryBitmapStatus==='resolved')){
          view.shaderMetadata[tag.id]=tag.shaderPreview!;
          for(const reference of tag.references){
            const role=/^(Base map|Diffuse map)$/.test(reference.label)?'base':({'Primary detail map':'primaryDetail','Detail map':'primaryDetail','Secondary detail map':'secondaryDetail','Micro detail map':'microDetail','Bump map':'normalMap','Multipurpose map':'multipurpose'} as Record<string,string>)[reference.label]??(/^Chicago layer [1-3]$/.test(reference.label)?`layer${reference.label.at(-1)}`:undefined);
            if(role&&result.tags.some(t=>t.id===reference.targetId&&t.class==='bitm'&&!t.external))tasks.push({shader:tag.id,bitmap:reference.targetId,role});
          }
        }
        const missing=[...new Set(tasks.map(t=>t.bitmap))].filter(id=>!pool.has(`${placement.sourceProjectId}:${id}`));
        for(let offset=0;offset<missing.length;offset+=24){
          const targets=missing.slice(offset,offset+24).map(bitmapTagId=>({bitmapTagId,imageIndex:0,sourceSha256:result.sourceSha256,resourceSha256:result.resourceSha256}));
          const response=await call<OwnedBitmapBatchResponse>('preview_owned_cache_bitmap_batch',{projectId:placement.sourceProjectId,requests:targets.map(t=>({bitmapTagId:t.bitmapTagId,imageIndex:0}))});
          if(!live)return;const images=decodeOwnedBitmapBatch(response,targets);
          for(const image of images.values())if(image.image){
            const raw=image.image,bytes=Math.ceil(raw.pixels.byteLength*4/3);
            if(textureBytes+bytes>MAX_NATIVE_BATCH_RGBA_BYTES){errors[key]='Some model textures exceed the 64 MiB viewport budget';continue;}
            const texture=configureSourceTexture(new THREE.DataTexture(raw.pixels,raw.width,raw.height,THREE.RGBAFormat),'shader');
            textureBytes+=bytes;pool.set(`${placement.sourceProjectId}:${image.bitmapTagId}`,texture);
          }
        }
        for(const task of tasks){const texture=pool.get(`${placement.sourceProjectId}:${task.bitmap}`);if(!texture)continue;
          if(task.role==='base')view.shaderTextures[task.shader]=texture;else view.extraTextures[extraTextureKey(task.shader,task.role)]=texture;
        }
        view.shaderTextures={...view.shaderTextures};view.extraTextures={...view.extraTextures};view.shaderMetadata={...view.shaderMetadata};loaded[key]={...view};
        if(live){setModels({...loaded});setFailures({...errors});}
      }catch(error){if(live){errors[key]=String(error);setFailures({...errors});}}
    }}
    void load();return()=>{live=false;for(const texture of pool.values())texture.dispose();};
  },[scope]);
  return {models,failures};
}
