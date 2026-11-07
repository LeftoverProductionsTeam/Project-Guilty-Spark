import { loadReflectionCube, readReflectionCube, createReflectionCubeTexture } from './ownedReflectionCube';
import {useEffect,useState} from 'react';
import * as THREE from 'three';
import {call,native} from './api';
import type {ForgePlacement} from './forge';
import type {MeshData,Tag,ShaderPreview,OpenProject,MapInspection,Project} from './types';
import {fillRuntimeTexturePreviews} from './runtimeTexturePreview';
import {decodeOwnedBitmapBatch,MAX_NATIVE_BATCH_RGBA_BYTES,bitmapImageKey} from './ownedBitmapBatch';
import type {OwnedBitmapBatchResponse} from './ownedBitmapBatch';
import {configureSourceTexture} from './sourceTexture';
import {extraTextureKey} from './haloMaterial';
import {useTextureResourceScopes} from './textureResourceScope';
import {nativeShaderTextureRole,glassWithoutDiffuse} from './nativeShaderTextures';
import {nativePreviewResource} from './nativePreviewResources';
import {planOwnedMaterialPreviews} from './ownedMaterialBatch';
import {decalTextureRequests} from './mapDecals';

export interface OwnedModelView {
  ready?: boolean;
  mesh: MeshData;
  lightmapTextures?: Record<string,THREE.Texture>;
  shaderTextures: Record<number, THREE.Texture>;
  extraTextures: Record<string, THREE.Texture>;
  shaderMetadata: Record<number, ShaderPreview>;
}
export interface OwnedSourceMesh {project:Project;inspection:MapInspection;mesh:MeshData;tagId:number;bsp?:boolean;}
interface ModelResponse {
  sourceSha256: string;
  resourceSha256: string | null;
  objectTagId: number;
  modelTagId: number;
  mesh: MeshData;
  tags: Tag[];
  resourceHashes?: Record<string, string>;
}
export type OwnedModelIdentity = Pick<ForgePlacement, 'sourceProjectId' | 'sourceSha256' | 'tagId'> & {modelVariant?:string};
export const forgeModelKey = (value: OwnedModelIdentity) =>
  `${value.sourceProjectId}:${value.sourceSha256}:${value.tagId}${value.modelVariant?':'+value.modelVariant:''}`;

/** One shared set of source models/textures for a viewport. Transform edits do
 * not reload sources. A missing dependency never creates replacement geometry. */
export function useOwnedForgeModels(
  placements: OwnedModelIdentity[],
  resourceScopes: Record<string, string> = {},
  sourceMeshes: readonly OwnedSourceMesh[] = [],
) {
  const [models,setModels]=useState<Record<string,OwnedModelView>>({});
  const [failures,setFailures]=useState<Record<string,string>>({});
  const seeded=new Map(sourceMeshes.map(value=>[forgeModelKey({sourceProjectId:value.project.id,sourceSha256:value.inspection.sha256,tagId:value.tagId}),value]));
  const sources:OwnedModelIdentity[]=[...new Map([...placements,...sourceMeshes.map(value=>({sourceProjectId:value.project.id,sourceSha256:value.inspection.sha256,tagId:value.tagId}))].map(p=>[forgeModelKey(p),p])).values()];
  const resourceIdentity=useTextureResourceScopes(sources.flatMap(p=>p.sourceProjectId?[p.sourceProjectId]:[]));
  const scope=JSON.stringify(sources.map(p=>[p.sourceProjectId,p.sourceSha256,p.tagId,p.modelVariant??'',resourceScopes[p.sourceProjectId??'']??'',seeded.has(forgeModelKey(p))]));
  useEffect(() => {
    let live=true,textureBytes=0,geometryBytes=0;
    const pool=new Map<string,THREE.Texture>(),loaded:Record<string,OwnedModelView>={},errors:Record<string,string>={};
    const previewSources=new Map<string,OpenProject>();
    setModels({});
    setFailures({});
    async function load() {
      for (const placement of sources) {
        if(!live)return;
        const key=forgeModelKey(placement);
        try {
          if(!native||!placement.sourceProjectId||!placement.sourceSha256||placement.tagId==null)throw new Error('An imported map and exact source tag are required');
          if(Object.keys(loaded).length>=128)throw new Error('The viewport model-type limit is full');
          const seed=seeded.get(key);
          if(seed?.project.source?.sha256!==undefined&&seed.project.source.sha256!==placement.sourceSha256)throw Error('Source geometry identity changed');
          const result:ModelResponse=seed?{sourceSha256:seed.inspection.sha256,resourceSha256:seed.project.source?.resourceSha256?.['mcc-textures']??seed.project.source?.resourceSha256?.['bitmaps.map']??null,objectTagId:seed.tagId,modelTagId:seed.tagId,mesh:seed.mesh,tags:seed.inspection.tags,resourceHashes:seed.project.source?.resourceSha256}:await nativePreviewResource<ModelResponse>('preview_owned_object_model',{projectId:placement.sourceProjectId,tagId:placement.tagId,sourceSha256:placement.sourceSha256,...(placement.modelVariant?{modelVariant:placement.modelVariant}:{})},placement.sourceSha256);
          if(!live)return;
          if(result.sourceSha256!==placement.sourceSha256||result.objectTagId!==placement.tagId)throw new Error('Model source identity differs from its placement');
          const bytes=(result.mesh.positions.length+(result.mesh.normals?.length??0)+(result.mesh.uvs?.length??0)+(result.mesh.lightmapUvs?.length??0)+result.mesh.indices.length+(result.mesh.rig?.weights.length??0))*4+(result.mesh.rig?.indices.length??0)*2;
          if(geometryBytes+bytes>128*1024*1024)throw new Error('The viewport model geometry budget is full');
          geometryBytes+=bytes;
          const view:OwnedModelView={mesh:result.mesh,shaderTextures:{},lightmapTextures:{},extraTextures:{},shaderMetadata:{}};
          loaded[key]=view;
          setModels({...loaded});
          const tasks:{shader:number;bitmap:number;role:string;imageIndex:number;key?:string}[]=[];
          const usedShaders=new Set(result.mesh.materialRanges?.map(range=>range.shaderTagId)??[]);
          for (const tag of result.tags.filter(
            (t) => usedShaders.has(t.id) && t.shaderPreview && (t.primaryBitmapStatus === 'resolved'||t.primaryBitmapStatus==='not-required'&&glassWithoutDiffuse(t.shaderPreview)),
          )) {
            view.shaderMetadata[tag.id]=tag.shaderPreview!;
            for (const reference of tag.references) {
              const role=nativeShaderTextureRole(reference.label);
              if (role && result.tags.some((t) => t.id === reference.targetId && t.class === 'bitm'))
                tasks.push({shader:tag.id,bitmap:reference.targetId,role,imageIndex:0});
            }
          }
          if(seed){
            const plan=planOwnedMaterialPreviews(seed.inspection,seed.mesh);
            for(const task of plan.lightmapTasks)tasks.push({shader:0,bitmap:task.bitmapTagId,imageIndex:task.imageIndex,role:'lightmap',key:task.key});
            if(seed.bsp)for(const task of decalTextureRequests(seed.inspection,new Set()))tasks.push({shader:0,bitmap:task.bitmapTagId,imageIndex:0,role:'decal',key:task.key});
            if(plan.skipped.some(task=>task.key.startsWith('bsp')))errors[key]='Some native donor lightmap pages are unavailable; preview is incomplete';
          }
          // Read one reflection concurrently with diffuse/detail batches.
          // Keep raw data bounded to one cube and consume the result through
          // the same identity decoder and shared texture budget below.
          const firstReflection = Object.values(view.shaderMetadata).find(metadata => metadata.reflection
            && !pool.has(`${placement.sourceProjectId}:cube:${metadata.reflection.bitmapTagId}`))?.reflection?.bitmapTagId;
          const firstCube = firstReflection === undefined ? undefined : readReflectionCube(
            placement.sourceProjectId, result.sourceSha256, firstReflection,
          ).then(response => ({ok:true as const,response}), error => ({ok:false as const,error}));
          const roleFor=(role:string)=>role==='lightmap'?'lightmap':role==='decal'?'decal':'shader';
          const textureKey=(bitmap:number,image:number,role:string)=>`${placement.sourceProjectId}:${bitmapImageKey(bitmap,image)}:${roleFor(role)}`;
          const missing=[...new Map(tasks.filter(task=>!pool.has(textureKey(task.bitmap,task.imageIndex,task.role))).map(task=>[bitmapImageKey(task.bitmap,task.imageIndex),{bitmapTagId:task.bitmap,imageIndex:task.imageIndex}])).values()];
          for (let offset = 0; offset < missing.length; offset += 24) {
            const targets = missing
              .slice(offset, offset + 24)
              .map(({bitmapTagId,imageIndex}) => ({
                bitmapTagId,
                imageIndex,
                sourceSha256: result.sourceSha256,
                resourceSha256: result.resourceSha256,
              }));
            const response=await nativePreviewResource<OwnedBitmapBatchResponse>('preview_owned_cache_bitmap_batch',{projectId:placement.sourceProjectId,requests:targets.map(t=>({bitmapTagId:t.bitmapTagId,imageIndex:t.imageIndex}))},placement.sourceSha256);
            if(!live)return;
            let images=decodeOwnedBitmapBatch(response,targets);
            if([...images.values()].some(i=>!i.image&&['missing-resource','resource-mismatch','resource-unavailable'].includes(i.errorCode??''))){
              let source=previewSources.get(placement.sourceProjectId);
              if(!source){source=seed?{project:seed.project,inspection:seed.inspection}:await call<OpenProject>('open_project',{id:placement.sourceProjectId});previewSources.set(placement.sourceProjectId,source);}
              if(source.inspection?.sha256===placement.sourceSha256)images=await fillRuntimeTexturePreviews(source.project,source.inspection,targets,images);
            }
            if(!live)return;
            for(const image of images.values())if(image.image){
            const raw=image.image,bytes=Math.ceil(raw.pixels.byteLength*4/3);
            const roles=new Set(tasks.filter(task=>task.bitmap===image.bitmapTagId&&task.imageIndex===image.imageIndex).map(task=>roleFor(task.role)));
            for(const role of roles){const pixelKey=textureKey(image.bitmapTagId,image.imageIndex,role);if(pool.has(pixelKey))continue;
              if(textureBytes+bytes>MAX_NATIVE_BATCH_RGBA_BYTES){errors[key]='Some native textures exceed the 64 MiB viewport budget';continue;}
              const texture=configureSourceTexture(new THREE.DataTexture(raw.pixels,raw.width,raw.height,THREE.RGBAFormat),role);
              textureBytes+=bytes;pool.set(pixelKey,texture);
            }
          }
          }
          for(const task of tasks){const texture=pool.get(textureKey(task.bitmap,task.imageIndex,task.role));if(!texture){errors[key]=`Native ${task.role} image unavailable; preview is incomplete`;continue;}
          if(task.role==='lightmap')view.lightmapTextures![task.key!]=texture;else if(task.role==='decal')view.extraTextures[task.key!]=texture;else if(task.role==='base')view.shaderTextures[task.shader]=texture;else view.extraTextures[extraTextureKey(task.shader,task.role)]=texture;
        }
          for (const [shader, metadata] of Object.entries(view.shaderMetadata))
            if (metadata.reflection) {
              const cubeKey = `${placement.sourceProjectId}:cube:${metadata.reflection.bitmapTagId}`;
              try {
                if (!pool.has(cubeKey)) {
                  const prefetched = metadata.reflection.bitmapTagId === firstReflection && firstCube
                    ? await firstCube : null;
                  if (prefetched && !prefetched.ok) throw prefetched.error;
                  const cube = prefetched?.ok
                    ? createReflectionCubeTexture(prefetched.response, result.sourceSha256,
                        metadata.reflection.bitmapTagId, result.resourceHashes ?? {})
                    : await loadReflectionCube(placement.sourceProjectId!, result.sourceSha256,
                        metadata.reflection.bitmapTagId, result.resourceHashes ?? {});
                  if (!live) {
                    cube.dispose();
                    return;
                  }
                  const size = cube.userData.rgbaBytes as number;
                  if (textureBytes + size > MAX_NATIVE_BATCH_RGBA_BYTES) {
                    cube.dispose();
                    throw Error('Reflection textures exceed the viewport budget');
                  }
                  textureBytes += size;
                  pool.set(cubeKey, cube);
                }
                view.extraTextures[extraTextureKey(Number(shader), 'reflectionCube')] = pool.get(cubeKey)!;
              } catch (error) {
                errors[key] = 'Reflection unavailable: ' + String(error);
              }
            }
          view.lightmapTextures={...view.lightmapTextures};
          view.shaderTextures={...view.shaderTextures};
          view.extraTextures={...view.extraTextures};
          view.shaderMetadata={...view.shaderMetadata};
          const absent=[...new Set(view.mesh.materialRanges?.map(range=>range.shaderTagId)??[])].filter(id=>!view.shaderMetadata[id]||!view.shaderTextures[id]&&!glassWithoutDiffuse(view.shaderMetadata[id]));
          if(absent.length){
            const names=absent.slice(0,3).map(id=>result.tags.find(tag=>tag.id===id)?.path??`datum ${id}`).join(', ');
            const message=`${absent.length} native material(s) unavailable: ${names}. This preview is incomplete.`;
            errors[key]=errors[key]?`${errors[key]} ${message}`:message;
          }
          loaded[key] = { ...view, ready: true };
          if(live){setModels({...loaded});setFailures({...errors});}
        } catch (error) {
          if(live){errors[key]=String(error);setFailures({...errors});}
        }
      }
    }
    void load();
    return()=>{live=false;for(const texture of pool.values())texture.dispose();};
  }, [scope,resourceIdentity]);
  return {models,failures};
}
