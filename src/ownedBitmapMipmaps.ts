/** Attach bounded original 2D levels to already verified base images. No disk
 * cache, resampling, cross-runtime relabelling or second decoder. */
import {nativePreviewResource} from './nativePreviewResources';
import {bitmapImageKey,decodeOwnedBitmapBatch,MAX_NATIVE_BITMAP_BATCH,MAX_NATIVE_BATCH_RGBA_BYTES} from './ownedBitmapBatch';
import type {VerifiedBatchImage,OwnedBitmapBatchResponse} from './ownedBitmapBatch';
import type {OwnedBitmapTarget} from './ownedBitmapPreview';
export async function readOwnedBitmapMipmaps(projectId:string,targets:readonly OwnedBitmapTarget[],base:ReadonlyMap<string,VerifiedBatchImage>,current:()=>boolean=()=>true){
 if(targets.length>MAX_NATIVE_BITMAP_BATCH)throw Error('Original mip request exceeds image batch bound');
 const result=new Map<string,VerifiedBatchImage>(),pending:OwnedBitmapTarget[]=[],keys=new Set<string>();let bytes=0;
 for(const target of targets){
  if((target.mipLevel??0)!==0)throw Error('Original mip chain requires its base image');
  const key=bitmapImageKey(target.bitmapTagId,target.imageIndex??0);if(keys.has(key))throw Error('Duplicate original mip base');keys.add(key);
  const image=base.get(key);if(!image)throw Error('Original mip base is missing');
  const entry={...image,originalMipmaps:image.originalMipmaps??(image.image?[image.image]:undefined)};result.set(key,entry);
  if(!image.image)continue;bytes+=(entry.originalMipmaps??[image.image]).reduce((n,m)=>n+m.pixels.byteLength,0);if(bytes>MAX_NATIVE_BATCH_RGBA_BYTES)throw Error('Original mip pixels exceed preview budget');
 }
 for(const target of targets){const key=bitmapImageKey(target.bitmapTagId,target.imageIndex??0),entry=result.get(key)!;if(!entry.image)continue;
  const count=entry.mipLevels??1;if(!Number.isInteger(count)||count<1||count>17||count>1+Math.floor(Math.log2(Math.max(entry.image.width,entry.image.height))))throw Error('Invalid original mip count');
  if(entry.originalMipmaps?.length===count&&!entry.mipError)continue;
  // A packed whole-chain budget can be met with smaller level batches.
  // Other explicit source failures retain their valid base without repeated reads.
  if(target.includeMips&&entry.mipError&&entry.mipErrorCode!=='budget-exceeded')continue;
  if(entry.compatibleRuntime||entry.recoveredResourceProjectId){if(count>1)entry.mipError='Compatible resource preview has only its verified base image.';continue;}
  let extra=0;for(let level=1;level<count;level++)extra+=Math.max(1,Math.floor(entry.image.width/2**level))*Math.max(1,Math.floor(entry.image.height/2**level))*4;
  if(bytes+extra>MAX_NATIVE_BATCH_RGBA_BYTES){entry.mipError='Original texture detail exceeds the 64 MiB decode budget; base image retained.';continue;}
  entry.mipError=undefined;entry.mipErrorCode=undefined;entry.originalMipmaps=[entry.image];
  bytes+=extra;for(let mipLevel=1;mipLevel<count;mipLevel++)pending.push({...target,mipLevel,includeMips:undefined});
 }
 for(let at=0;at<pending.length&&current();at+=MAX_NATIVE_BITMAP_BATCH){
  const wanted=pending.slice(at,at+MAX_NATIVE_BITMAP_BATCH),source=wanted[0].sourceSha256;
  if(wanted.some(t=>t.sourceSha256!==source))throw Error('Original mip chain mixes source identities');
  const response=await nativePreviewResource<OwnedBitmapBatchResponse>('preview_owned_cache_bitmap_batch',{projectId,requests:wanted.map(t=>({bitmapTagId:t.bitmapTagId,imageIndex:t.imageIndex??0,mipLevel:t.mipLevel}))},source);
  if(!current())return result;
  const decoded=decodeOwnedBitmapBatch(response,wanted);
  for(const target of wanted){const key=bitmapImageKey(target.bitmapTagId,target.imageIndex??0),entry=result.get(key)!,level=target.mipLevel!,item=decoded.get(bitmapImageKey(target.bitmapTagId,target.imageIndex??0,level))!;
   if(!item.image){entry.mipError='Original texture detail unavailable: '+(item.error??'native source refused');continue;}
   if(item.mipLevels!==entry.mipLevels||item.imageCount!==entry.imageCount||item.nativeMipmaps!==entry.nativeMipmaps||item.image.format!==entry.image!.format||item.image.width!==Math.max(1,Math.floor(entry.image!.width/2**level))||item.image.height!==Math.max(1,Math.floor(entry.image!.height/2**level)))throw Error('Original mip dimensions, encoding or source metadata changed');
   entry.originalMipmaps![level]=item.image;
  }
 }
 for(const entry of result.values())if(entry.image){const count=entry.mipLevels??1;if(entry.mipError||entry.originalMipmaps!.length!==count||Array.from({length:count},(_,i)=>entry.originalMipmaps![i]).some(i=>!i)){entry.originalMipmaps=[entry.image];entry.mipError??='Original texture detail incomplete; base image retained.';}}
 return result;
}
