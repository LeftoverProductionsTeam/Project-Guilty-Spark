/** Source-local object illumination through the existing verified bitmap
 * reader/cache. No new renderer, writable native source, or disk cache. */
import {useEffect,useState} from 'react';
import {nativePreviewResource} from './nativePreviewResources';
import {useTextureResourceScope} from './textureResourceScope';
import {bitmapImageKey,decodeOwnedBitmapBatch} from './ownedBitmapBatch';
import type {OwnedBitmapBatchResponse,VerifiedBatchImage} from './ownedBitmapBatch';
import type {OwnedBitmapTarget} from './ownedBitmapPreview';
import type {IncidentRadiositySample,SourceObjectLighting} from './haloLightmap';
import {nativeDiffuseImageIndex,nativeDiffuseLightMip,sampleNativeLightPixel,sourceObjectLighting} from './haloLightmap';
export interface ObjectLightProbe {id:string;sample:IncidentRadiositySample;bitmapTagId:number;brighten:boolean}
export function useNativeObjectLighting(projectId:string,sourceSha256:string|undefined,resourceSha256:string|null,cacheVersion:number|undefined,probes:readonly ObjectLightProbe[]){
  const [state,setState]=useState<{scope:string;probes:readonly ObjectLightProbe[];lights:ReadonlyMap<string,SourceObjectLighting>;reason:string|null;milliseconds:number}|null>(null);
  const resources=useTextureResourceScope(projectId);
  const scope=JSON.stringify([projectId,sourceSha256,resourceSha256,cacheVersion,resources]);
  useEffect(()=>{
    let live=true;const started=performance.now();
    // MCC's pack mip count is not the classic native bitmap sampling count.
    // The reader exposes a native count only when exact pack/tag metadata agrees.
    if(!sourceSha256||![5,6,7,13,609].includes(cacheVersion??-1)||!probes.length||probes.length>1024)return;
    const images=new Map<string,VerifiedBatchImage>();let decodedBytes=0;
    const read=async(requests:readonly {bitmapTagId:number;imageIndex:number;mipLevel?:number}[])=>{
      const unique=[...new Map(requests.map(r=>[bitmapImageKey(r.bitmapTagId,r.imageIndex,r.mipLevel),r])).values()].filter(r=>!images.has(bitmapImageKey(r.bitmapTagId,r.imageIndex,r.mipLevel)));
      if(unique.length>256)throw Error('Native lighting image request limit exceeded');
      for(let at=0;at<unique.length&&live;at+=8){
        const chunk=unique.slice(at,at+8),targets:OwnedBitmapTarget[]=chunk.map(r=>({...r,sourceSha256,resourceSha256}));
        const response=await nativePreviewResource<OwnedBitmapBatchResponse>('preview_owned_cache_bitmap_batch',{projectId,requests:chunk},sourceSha256);
        if(!live)return;
        for(const [key,image]of decodeOwnedBitmapBatch(response,targets)){
          decodedBytes+=image.image?.pixels.byteLength??0;
          if(decodedBytes>64*1024*1024)throw Error('Native lighting decoded image budget exceeded');
          images.set(key,image);
        }
      }
    };
    void(async()=>{
      try{
        await read(probes.flatMap(p=>[{bitmapTagId:p.bitmapTagId,imageIndex:0},{bitmapTagId:p.sample.lightmapBitmapTagId,imageIndex:Number(p.sample.lightmapKey.split(':page')[1])}]));
        if(!live)return;
        const selected=new Map<string,number>();
        for(const probe of probes){const first=images.get(bitmapImageKey(probe.bitmapTagId,0)),count=first?.imageCount;
          const index=nativeDiffuseImageIndex(probe.sample.shaderPermutation,count);
          if(first?.image&&index!==null)selected.set(probe.id,index);
        }
        await read(probes.filter(p=>selected.has(p.id)).map(p=>({bitmapTagId:p.bitmapTagId,imageIndex:selected.get(p.id)!})));
        if(!live)return;
        const levels=new Map<string,number>();
        for(const probe of probes){const index=selected.get(probe.id);if(index===undefined)continue;
          const image=images.get(bitmapImageKey(probe.bitmapTagId,index));
          const level=nativeDiffuseLightMip(image?.nativeMipmaps,image?.mipLevels);if(level!==null)levels.set(probe.id,level);
        }
        await read(probes.filter(p=>levels.has(p.id)).map(p=>({bitmapTagId:p.bitmapTagId,imageIndex:selected.get(p.id)!,mipLevel:levels.get(p.id)!})));
        if(!live)return;
        const lights=new Map<string,SourceObjectLighting>();
        for(const probe of probes){const index=selected.get(probe.id),level=levels.get(probe.id);if(index===undefined||level===undefined)continue;
          const diffuse=images.get(bitmapImageKey(probe.bitmapTagId,index,level)),light=images.get(bitmapImageKey(probe.sample.lightmapBitmapTagId,Number(probe.sample.lightmapKey.split(':page')[1])));
          if(!diffuse?.image||!light?.image)continue;
          const d=sampleNativeLightPixel(diffuse.image,probe.sample.surfaceUv),l=sampleNativeLightPixel(light.image,probe.sample.lightmapUv);
          const value=d&&l?sourceObjectLighting(probe.sample,d,l,probe.brighten):null;if(value)lights.set(probe.id,value);
        }
        if(live)setState({scope,probes,lights,reason:lights.size<probes.length?'Some original lightmap or diffuse samples are unavailable.':null,milliseconds:performance.now()-started});
      }catch(error){if(live)setState({scope,probes,lights:new Map(),reason:String(error).slice(0,240),milliseconds:performance.now()-started});}
    })();
    return()=>{live=false;};
  },[scope,projectId,sourceSha256,resourceSha256,cacheVersion,probes]);
  const current=state?.scope===scope&&state.probes===probes?state:null;
  const supported=!!sourceSha256&&[5,6,7,13,609].includes(cacheVersion??-1),overBudget=probes.length>1024;
  return {lights:current?.lights??null,pending:supported&&!overBudget&&probes.length>0&&!current,reason:current?.reason??(overBudget?'Native source-lighting probe limit exceeded.':!supported?'This source format has no verified local-lighting sampler.':null),milliseconds:current?.milliseconds??null};
}
