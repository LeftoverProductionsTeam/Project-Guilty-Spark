/** Provenance-checked bridge for one bounded native Halo 1 bitmap batch.
 * Every result must agree with the exact requested (tag ID, image index) and
 * source snapshot. One malformed response poisons the WHOLE response; an
 * explicitly refused image does not block other well-formed image previews.
 * Decoded RGBA and packed-buffer budgets apply before material creation.
 */
import { decodeOwnedBitmapPreview } from './ownedBitmapPreview.ts';
import { profileStart, profileEnd } from './profiling.ts';
import type { OwnedBitmapPreview, OwnedBitmapTarget } from './ownedBitmapPreview.ts';
import type { DdsImage } from './haloDds.ts';

export const MAX_NATIVE_BITMAP_BATCH = 24;
export const MAX_NATIVE_BATCH_RAW_BYTES = 16 * 1024 * 1024;
export const MAX_NATIVE_BATCH_RGBA_BYTES = 64 * 1024 * 1024;
export interface OwnedBitmapBatchItem {
  bitmapTagId: number;
  imageIndex: number;
  mipLevel?: number;
  preview?: OwnedBitmapPreview | null;
  error?: string | null;
  errorCode?: string | null;
}
export interface OwnedBitmapBatchResponse {
  sourceSha256: string;
  resourceSha256?: string | null;
  items: OwnedBitmapBatchItem[];
  mipItems?: OwnedBitmapBatchItem[];
}
export interface VerifiedBatchImage {
  recoveredResourceProjectId?: string;
  compatibleRuntime?: string;
  compatibleSourceSha256?: string;
  compatibleBitmapTagId?: number;
  bitmapTagId: number;
  imageIndex: number;
  mipLevel?: number;
  nativeMipmaps?: number;
  mipLevels?: number;
  imageCount?: number;
  image: DdsImage | null;
  originalMipmaps?: DdsImage[];
  mipError?: string;
  mipErrorCode?: string;
  sourceKind: 'internal-cache' | 'verified-resource' | null;
  error: string | null;
  errorCode?: string | null;
}
export function bitmapImageKey(bitmapTagId: number, imageIndex: number, mipLevel=0) {
  if (
    !Number.isSafeInteger(bitmapTagId) ||
    bitmapTagId < 0 ||
    bitmapTagId > 0xffffffff ||
    !Number.isSafeInteger(imageIndex) ||
    imageIndex < 0 ||
    imageIndex > 2047 ||
    !Number.isInteger(mipLevel)||mipLevel<0||mipLevel>16
  )
    throw new Error('Invalid exact bitmap image key');
  return `${bitmapTagId}:${imageIndex}${mipLevel===0?'':`:mip${mipLevel}`}`;
}

/** No path is involved. The client can request one native snapshot per click,
 * then associate its uniquely decoded image bytes with multiple shader slots.
 */
export function uniqueBitmapTargets(
  tasks: readonly { bitmapTagId: number; imageIndex: number; mipLevel?: number }[],
  sourceSha256: string,
  resourceSha256: string | null = null,
): OwnedBitmapTarget[] {
  if (!/^[a-f\d]{64}$/i.test(sourceSha256)) throw new Error('Missing source SHA-256');
  const seen = new Set<string>();
  const requests: OwnedBitmapTarget[] = [];
  for (const task of tasks) {
    const key = bitmapImageKey(task.bitmapTagId, task.imageIndex,task.mipLevel);
    if (seen.has(key)) continue;
    seen.add(key);
    requests.push({
      bitmapTagId: task.bitmapTagId,
      imageIndex: task.imageIndex,
      ...(task.mipLevel===undefined?{}:{mipLevel:task.mipLevel}),
      sourceSha256,
      resourceSha256,
    });
    if (requests.length > MAX_NATIVE_BITMAP_BATCH)
      throw new Error('More than 24 unique bitmap images in one operation');
  }
  return requests;
}

export function decodeOwnedBitmapBatch(
  response: OwnedBitmapBatchResponse,
  requests: readonly OwnedBitmapTarget[],
): Map<string, VerifiedBatchImage> {
  const start = profileStart();
  try {
    return decodeBatch(response, requests);
  } finally {
    profileEnd('spark.decode.bitmap-batch', start);
  }
}
function decodeBatch(response:OwnedBitmapBatchResponse,requests:readonly OwnedBitmapTarget[]):Map<string,VerifiedBatchImage>{
  if(!Array.isArray(requests)||!requests.length||requests.length>MAX_NATIVE_BITMAP_BATCH||!Array.isArray(response?.items)||response.items.length!==requests.length)throw Error('Batch result count differs from bounded request');
  const chains=requests.some(r=>r.includeMips);
  if(!chains){if(response.mipItems!==undefined&&(!Array.isArray(response.mipItems)||response.mipItems.length))throw Error('Unsolicited original mip images');return decodeItems(response,requests);}
  if(requests.some(r=>r.includeMips!==true||(r.mipLevel??0)!==0))throw Error('Whole original chains require uniform base requests');
  const lower:OwnedBitmapTarget[]=[];
  for(let i=0;i<requests.length;i++){const preview=response.items[i]?.preview;if(!preview)continue;const count=preview.mipLevels??1;if(!Number.isInteger(count)||count<1||count>17)throw Error('Invalid original chain count');for(let mipLevel=1;mipLevel<count;mipLevel++)lower.push({...requests[i],mipLevel,includeMips:undefined});}
  if((response.mipItems!==undefined&&!Array.isArray(response.mipItems))||lower.length!==(response.mipItems??[]).length)throw Error('Original mip response count differs from requested chains');
  const all=decodeItems({...response,items:[...response.items,...(response.mipItems??[])]},[...requests,...lower],MAX_NATIVE_BITMAP_BATCH*17);
  const result=new Map<string,VerifiedBatchImage>();
  for(const wanted of requests){const key=bitmapImageKey(wanted.bitmapTagId,wanted.imageIndex??0),base=all.get(key)!;result.set(key,base);if(!base.image)continue;
    const count=base.mipLevels??1;if(count>1+Math.floor(Math.log2(Math.max(base.image.width,base.image.height))))throw Error('Invalid original chain dimensions/count');base.originalMipmaps=[base.image];
    for(let level=1;level<count;level++){const item=all.get(bitmapImageKey(wanted.bitmapTagId,wanted.imageIndex??0,level))!;
      if(!item.image){base.mipError='Original texture detail unavailable: '+(item.error??'native source refused');const code=item.errorCode??'verification-failed';base.mipErrorCode=base.mipErrorCode&&base.mipErrorCode!==code?'verification-failed':code;continue;}
      if(item.mipLevels!==base.mipLevels||item.nativeMipmaps!==base.nativeMipmaps||item.imageCount!==base.imageCount||item.image.format!==base.image.format||item.image.width!==Math.max(1,Math.floor(base.image.width/2**level))||item.image.height!==Math.max(1,Math.floor(base.image.height/2**level)))throw Error('Original chain dimensions, encoding or source metadata changed');
      base.originalMipmaps[level]=item.image;
    }
    if(base.mipError)base.originalMipmaps=[base.image];
  }
  return result;
}
function decodeItems(
  response: OwnedBitmapBatchResponse,
  requests: readonly OwnedBitmapTarget[],
  maximum=MAX_NATIVE_BITMAP_BATCH,
): Map<string, VerifiedBatchImage> {
  if (
    !Array.isArray(requests) ||
    !requests.length ||
    requests.length > maximum ||
    !Array.isArray(response?.items) ||
    response.items.length !== requests.length
  )
    throw new Error('Batch result count differs from bounded request');
  const expectedSource = requests[0].sourceSha256;
  if (!/^[a-f\d]{64}$/i.test(expectedSource) || response.sourceSha256 !== expectedSource)
    throw new Error('Batch source SHA-256 differs from the active Halo map');
  if (
    response.resourceSha256 != null &&
    (!/^[a-f\d]{64}$/i.test(response.resourceSha256) ||
      !requests[0].resourceSha256 ||
      response.resourceSha256.toLowerCase() !== requests[0].resourceSha256.toLowerCase())
  )
    throw new Error('Batch shared resource SHA-256 differs from the project pin');
  let packedBytes = 0;
  let rgbaBytes = 0;
  const seen = new Set<string>();
  for (let i = 0; i < requests.length; i++) {
    const wanted = requests[i],
      actual = response.items[i];
    const key = bitmapImageKey(wanted.bitmapTagId, wanted.imageIndex ?? 0,wanted.mipLevel);
    if (seen.has(key)) throw new Error('Duplicate requested bitmap image identity');
    seen.add(key);
    if (
      !actual ||
      bitmapImageKey(actual.bitmapTagId, actual.imageIndex,actual.mipLevel) !== key ||
      wanted.sourceSha256 !== expectedSource ||
      wanted.resourceSha256 !== requests[0].resourceSha256
    )
      throw new Error('Batch contains a reordered, foreign, or differently pinned image');
    const succeeded = actual.preview != null;
    if (succeeded === (actual.error != null))
      throw new Error('Bitmap item must contain either a preview or an explicit refusal');
    if (!succeeded) {
      if (typeof actual.error !== 'string' || !actual.error || actual.error.length > 200)
        throw new Error('Bitmap refusal message is invalid');
      continue;
    }
    const preview = actual.preview!;
    if (typeof preview.ddsBase64 !== 'string' || preview.ddsBase64.length > 23 * 1024 * 1024)
      throw new Error('Oversized bitmap batch entry');
    // Bound packed and decoded bytes BEFORE attempting base64/DXT decompression.
    packedBytes += Math.floor(preview.ddsBase64.length / 4) * 3;
    rgbaBytes += Number(preview.width) * Number(preview.height) * 4;
    if (
      !Number.isSafeInteger(packedBytes) ||
      packedBytes > MAX_NATIVE_BATCH_RAW_BYTES + 128 * maximum ||
      !Number.isSafeInteger(rgbaBytes) ||
      rgbaBytes > MAX_NATIVE_BATCH_RGBA_BYTES
    )
      throw new Error('Aggregate bitmap batch memory budget exceeded');
  }
  const result = new Map<string, VerifiedBatchImage>();
  for (let i = 0; i < requests.length; i++) {
    const wanted = requests[i],
      actual = response.items[i];
    const key = bitmapImageKey(wanted.bitmapTagId, wanted.imageIndex ?? 0,wanted.mipLevel);
    if (actual.preview) {
      const image = decodeOwnedBitmapPreview(actual.preview, wanted);
      result.set(key, {
        bitmapTagId: wanted.bitmapTagId,
        imageIndex: wanted.imageIndex ?? 0,
        mipLevel:wanted.mipLevel??0,
        nativeMipmaps:actual.preview.nativeMipmaps,mipLevels:actual.preview.mipLevels,imageCount:actual.preview.imageCount,
        image,
        sourceKind: actual.preview.sourceKind ?? 'internal-cache',
        error: null,
      });
    } else {
      result.set(key, {
        bitmapTagId: wanted.bitmapTagId,
        imageIndex: wanted.imageIndex ?? 0,
        mipLevel:wanted.mipLevel??0,
        image: null,
        sourceKind: null,
        error: actual.error ?? 'Unsupported bitmap',
        errorCode: actual.errorCode ?? 'verification-failed',
      });
    }
  }
  return result;
}
