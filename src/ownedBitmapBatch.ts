/** Provenance-checked bridge for one bounded native Halo 1 bitmap batch.
 * Every result must agree with the exact requested (tag ID, image index) and
 * source snapshot. One malformed response poisons the WHOLE response; an
 * explicitly refused image does not block other well-formed image previews.
 * Decoded RGBA and packed-buffer budgets apply before material creation.
 */
import { decodeOwnedBitmapPreview } from './ownedBitmapPreview.ts';
import type { OwnedBitmapPreview, OwnedBitmapTarget } from './ownedBitmapPreview.ts';
import type { DdsImage } from './haloDds.ts';

export const MAX_NATIVE_BITMAP_BATCH = 24;
export const MAX_NATIVE_BATCH_RAW_BYTES = 16 * 1024 * 1024;
export const MAX_NATIVE_BATCH_RGBA_BYTES = 64 * 1024 * 1024;
export interface OwnedBitmapBatchItem {
  bitmapTagId: number;
  imageIndex: number;
  preview?: OwnedBitmapPreview | null;
  error?: string | null;
  errorCode?: string | null;
}
export interface OwnedBitmapBatchResponse {
  sourceSha256: string;
  resourceSha256?: string | null;
  items: OwnedBitmapBatchItem[];
}
export interface VerifiedBatchImage {
  compatibleRuntime?: string;
  compatibleSourceSha256?: string;
  compatibleBitmapTagId?: number;
  bitmapTagId: number;
  imageIndex: number;
  image: DdsImage | null;
  sourceKind: 'internal-cache' | 'verified-resource' | null;
  error: string | null;
  errorCode?: string | null;
}
export function bitmapImageKey(bitmapTagId:number,imageIndex:number) {
  if (!Number.isSafeInteger(bitmapTagId) || bitmapTagId < 0 || bitmapTagId > 0xffffffff ||
      !Number.isSafeInteger(imageIndex) || imageIndex < 0 || imageIndex > 2047)
    throw new Error('Invalid exact bitmap image key');
  return `${bitmapTagId}:${imageIndex}`;
}

/** No path is involved. The client can request one native snapshot per click,
 * then associate its uniquely decoded image bytes with multiple shader slots.
 */
export function uniqueBitmapTargets(tasks: readonly { bitmapTagId:number; imageIndex:number }[], sourceSha256:string,
  resourceSha256:string | null = null): OwnedBitmapTarget[] {
  if (!/^[a-f\d]{64}$/i.test(sourceSha256)) throw new Error('Missing source SHA-256');
  const seen = new Set<string>();
  const requests: OwnedBitmapTarget[]=[];
  for (const task of tasks) {
    const key=bitmapImageKey(task.bitmapTagId,task.imageIndex);
    if (seen.has(key)) continue;
    seen.add(key);
    requests.push({bitmapTagId:task.bitmapTagId,imageIndex:task.imageIndex,
      sourceSha256,resourceSha256});
    if (requests.length>MAX_NATIVE_BITMAP_BATCH)throw new Error('More than 24 unique bitmap images in one operation');
  }
  return requests;
}

export function decodeOwnedBitmapBatch(response: OwnedBitmapBatchResponse,
  requests: readonly OwnedBitmapTarget[]): Map<string,VerifiedBatchImage> {
  if (!Array.isArray(requests) || !requests.length || requests.length > MAX_NATIVE_BITMAP_BATCH ||
      !Array.isArray(response?.items) || response.items.length !== requests.length)
    throw new Error('Batch result count differs from bounded request');
  const expectedSource=requests[0].sourceSha256;
  if (!/^[a-f\d]{64}$/i.test(expectedSource) || response.sourceSha256 !== expectedSource)
    throw new Error('Batch source SHA-256 differs from the active Halo map');
  if (response.resourceSha256 != null &&
      (!/^[a-f\d]{64}$/i.test(response.resourceSha256) ||
       !requests[0].resourceSha256 ||
       response.resourceSha256.toLowerCase() !== requests[0].resourceSha256.toLowerCase()))
    throw new Error('Batch shared resource SHA-256 differs from the project pin');
  let packedBytes=0;
  let rgbaBytes=0;
  const seen=new Set<string>();
  for (let i=0;i<requests.length;i++) {
    const wanted=requests[i], actual=response.items[i];
    const key=bitmapImageKey(wanted.bitmapTagId,wanted.imageIndex??0);
    if (seen.has(key))throw new Error('Duplicate requested bitmap image identity');
    seen.add(key);
    if (!actual || bitmapImageKey(actual.bitmapTagId,actual.imageIndex)!==key ||
        wanted.sourceSha256!==expectedSource || wanted.resourceSha256!==requests[0].resourceSha256)
      throw new Error('Batch contains a reordered, foreign, or differently pinned image');
    const succeeded=actual.preview!=null;
    if (succeeded === (actual.error != null))
      throw new Error('Bitmap item must contain either a preview or an explicit refusal');
    if (!succeeded) {
      if (typeof actual.error!=='string' || !actual.error || actual.error.length>200)
        throw new Error('Bitmap refusal message is invalid');
      continue;
    }
    const preview=actual.preview!;
    if (typeof preview.ddsBase64!=='string' || preview.ddsBase64.length > 23*1024*1024)
      throw new Error('Oversized bitmap batch entry');
    // Bound packed and decoded bytes BEFORE attempting base64/DXT decompression.
    packedBytes+=Math.floor(preview.ddsBase64.length/4)*3;
    rgbaBytes+=Number(preview.width)*Number(preview.height)*4;
    if (!Number.isSafeInteger(packedBytes) || packedBytes > MAX_NATIVE_BATCH_RAW_BYTES + 128*MAX_NATIVE_BITMAP_BATCH ||
        !Number.isSafeInteger(rgbaBytes) || rgbaBytes > MAX_NATIVE_BATCH_RGBA_BYTES)
      throw new Error('Aggregate bitmap batch memory budget exceeded');
  }
  const result=new Map<string,VerifiedBatchImage>();
  for(let i=0;i<requests.length;i++){
    const wanted=requests[i], actual=response.items[i];
    const key=bitmapImageKey(wanted.bitmapTagId,wanted.imageIndex??0);
    if(actual.preview) {
      const image=decodeOwnedBitmapPreview(actual.preview,wanted);
      result.set(key,{bitmapTagId:wanted.bitmapTagId,imageIndex:wanted.imageIndex??0,image,
        sourceKind:actual.preview.sourceKind??'internal-cache',error:null});
    } else {
      result.set(key,{bitmapTagId:wanted.bitmapTagId,imageIndex:wanted.imageIndex??0,
        image:null,sourceKind:null,error:actual.error??'Unsupported bitmap',errorCode:actual.errorCode??'verification-failed'});
    }
  }
  return result;
}
