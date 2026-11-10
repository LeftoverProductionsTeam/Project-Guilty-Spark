/** Read-only classic-map bitmap preview response validation.
 * No game assets are bundled, cached on disk, or saved into project JSON.
 */
import { decodeHaloDds } from './haloDds.ts';
import {pixelPreviewBudget} from './resourceBudgets.ts';
import { DecodedBitmapCache } from './decodedBitmapCache.ts';
import { decodeBoundedBase64 } from './boundedBase64.ts';
import { profileGauge } from './profiling.ts';
export interface OwnedBitmapPreview {
  bitmapTagId: number;
  imageIndex: number;
  /** Level in the original image, independent of its image-array index. */
  mipLevel?: number;
  mipLevels?: number;
  width: number;
  height: number;
  format: string;
  sourceSha256: string;
  ddsBase64: string;
  /** A resource read additionally requires the exact project-pinned SHA. */
  sourceKind?: 'internal-cache' | 'verified-resource';
  imageCount?: number;
  sharedNativeBitmapPath?: string | null;
  resourceSha256?: string | null;
}
export interface OwnedBitmapTarget {
  bitmapTagId: number;
  sourceSha256: string;
  /** Optional top-mip *image* index in a multi-page bitm (not a mip level). */
  imageIndex?: number;
  mipLevel?: number;
  resourceSha256?: string | null;
}
const MAX_PREVIEW_BASE64 = 23 * 1024 * 1024; // 16 MiB top mip plus DDS header, base64 expansion
const SUPPORTED_FORMATS = new Set([
  'DXT1',
  'DXT3',
  'DXT5',
  'BGRA8',
  'BGRX8',
  'R5G6B5',
  'A1R5G5B5',
  'A4R4G4B4',
  'A8',
  'Y8',
  'A8Y8',
]);
const decodedPixels = new DecodedBitmapCache(pixelPreviewBudget());
export const decodedBitmapStats=()=>decodedPixels.stats();
export const trimDecodedBitmapPreviews=()=>decodedPixels.setBudget(pixelPreviewBudget());
if(typeof window!=='undefined'){window.addEventListener?.('spark-preview-budgets',trimDecodedBitmapPreviews);window.addEventListener?.('storage',event=>{if(event.key==='spark.previewBudgets.v1')trimDecodedBitmapPreviews();});}

/** Validate *both* tag and source identity before revealing any returned pixel buffer. */
export function decodeOwnedBitmapPreview(
  preview: OwnedBitmapPreview,
  target: OwnedBitmapTarget,
  cubeFaceIndex?: number,
) {
  if (
    cubeFaceIndex !== undefined &&
    (!Number.isInteger(cubeFaceIndex) || cubeFaceIndex < 0 || cubeFaceIndex > 5)
  )
    throw Error('Invalid reflection face cache identity');
  const imageIndex = target.imageIndex ?? 0;
  const mipLevel = target.mipLevel ?? 0;
  const mipLevels = preview.mipLevels ?? 1;
  if (!Number.isInteger(mipLevel)||mipLevel<0||mipLevel>16||
      (preview.mipLevel??0)!==mipLevel||!Number.isInteger(mipLevels)||
      mipLevels<1||mipLevels>17||mipLevel>=mipLevels)
    throw Error('Bitmap response refers to a different or invalid authored mip level');
  if (
    !Number.isSafeInteger(target.bitmapTagId) ||
    target.bitmapTagId < 0 ||
    !Number.isSafeInteger(imageIndex) ||
    imageIndex < 0 ||
    imageIndex > 2047 ||
    preview.bitmapTagId !== target.bitmapTagId ||
    preview.imageIndex !== imageIndex
  ) {
    throw new Error('Bitmap response refers to a different tag or mipmap');
  }
  if (!/^[a-f0-9]{64}$/i.test(target.sourceSha256) || preview.sourceSha256 !== target.sourceSha256) {
    throw new Error('Source map changed during bitmap preview');
  }
  if (
    preview.sourceKind &&
    preview.sourceKind !== 'internal-cache' &&
    preview.sourceKind !== 'verified-resource'
  ) {
    throw new Error('Unexpected bitmap storage kind');
  }
  if (
    preview.imageCount !== undefined &&
    (!Number.isSafeInteger(preview.imageCount) ||
      preview.imageCount < 1 ||
      preview.imageCount > 2048 ||
      imageIndex >= preview.imageCount)
  )
    throw Error('Invalid native bitmap image count');
  if (
    preview.sharedNativeBitmapPath != null &&
    (preview.sourceKind !== 'verified-resource' ||
      typeof preview.sharedNativeBitmapPath !== 'string' ||
      !preview.sharedNativeBitmapPath.length ||
      preview.sharedNativeBitmapPath.length > 1024 ||
      /[\u0000-\u001f]/.test(preview.sharedNativeBitmapPath))
  )
    throw Error('Invalid shared native bitmap provenance');
  if (preview.sourceKind === 'verified-resource') {
    if (
      !target.resourceSha256 ||
      !/^[a-f0-9]{64}$/i.test(target.resourceSha256) ||
      preview.resourceSha256?.toLowerCase() !== target.resourceSha256.toLowerCase()
    ) {
      throw new Error('The external bitmap resource changed or was not pinned to this project');
    }
  } else if (preview.resourceSha256) {
    throw new Error('Internal bitmap response unexpectedly includes external-resource identity');
  }
  if (!SUPPORTED_FORMATS.has(preview.format)) throw new Error('Unexpected automatic bitmap format');
  if (
    !Number.isInteger(preview.width) ||
    !Number.isInteger(preview.height) ||
    preview.width < 1 ||
    preview.height < 1 ||
    preview.width > 4096 ||
    preview.height > 4096 ||
    preview.width * preview.height > 16_777_216
  )
    throw new Error('Bitmap response dimensions out of bounds');
  if (
    typeof preview.ddsBase64 !== 'string' ||
    preview.ddsBase64.length < 172 ||
    preview.ddsBase64.length > MAX_PREVIEW_BASE64
  ) {
    throw new Error('Malformed or oversized bitmap response');
  }
  const key = JSON.stringify([
    target.sourceSha256,
    target.bitmapTagId,
    imageIndex,
    mipLevel,
    mipLevels,
    preview.sourceKind ?? 'internal-cache',
    preview.resourceSha256 ?? null,
    preview.imageCount ?? null,
    preview.sharedNativeBitmapPath ?? null,
    preview.width,
    preview.height,
    preview.format,
    cubeFaceIndex ?? '2d',
  ]);
  trimDecodedBitmapPreviews();
  const cached = decodedPixels.get(key, preview.ddsBase64);
  profileGauge('bitmap-decode', () => decodedPixels.stats());
  if (cached) return cached;
  const dds = decodeBoundedBase64(preview.ddsBase64, 16 * 1024 * 1024 + 128, 128);
  const decoded = decodeHaloDds(dds.buffer);
  if (
    decoded.width !== preview.width ||
    decoded.height !== preview.height ||
    (preview.format !== decoded.format && !(preview.format === 'BGRX8' && decoded.format === 'BGRA8'))
  ) {
    throw new Error('Bitmap metadata conflicts with decoded DDS pixels');
  }
  decodedPixels.put(key, preview.ddsBase64, decoded);
  profileGauge('bitmap-decode', () => decodedPixels.stats());
  return decoded;
}
