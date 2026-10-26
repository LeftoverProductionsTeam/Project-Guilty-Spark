/** Read-only classic-map bitmap preview response validation.
 * No game assets are bundled, cached on disk, or saved into project JSON.
 */
import { decodeHaloDds } from './haloDds.ts';
export interface OwnedBitmapPreview {
  bitmapTagId: number;
  imageIndex: number;
  width: number;
  height: number;
  format: string;
  sourceSha256: string;
  ddsBase64: string;
  /** A resource read additionally requires the exact project-pinned SHA. */
  sourceKind?: 'internal-cache' | 'verified-resource';
  resourceSha256?: string | null;
}
export interface OwnedBitmapTarget {
  bitmapTagId: number;
  sourceSha256: string;
  /** Optional top-mip *image* index in a multi-page bitm (not a mip level). */
  imageIndex?: number;
  resourceSha256?: string | null;
}
const MAX_PREVIEW_BASE64 = 23 * 1024 * 1024; // 16 MiB top mip plus DDS header, base64 expansion
const SUPPORTED_FORMATS = new Set(['DXT1', 'DXT3', 'DXT5', 'BGRA8', 'BGRX8']);

/** Validate *both* tag and source identity before revealing any returned pixel buffer. */
export function decodeOwnedBitmapPreview(preview: OwnedBitmapPreview, target: OwnedBitmapTarget) {
  const imageIndex = target.imageIndex ?? 0;
  if (!Number.isSafeInteger(target.bitmapTagId) || target.bitmapTagId < 0 ||
      !Number.isSafeInteger(imageIndex) || imageIndex < 0 || imageIndex > 2047 ||
      preview.bitmapTagId !== target.bitmapTagId || preview.imageIndex !== imageIndex) {
    throw new Error('Bitmap response refers to a different tag or mipmap');
  }
  if (!/^[a-f0-9]{64}$/i.test(target.sourceSha256) ||
      preview.sourceSha256 !== target.sourceSha256) {
    throw new Error('Source map changed during bitmap preview');
  }
  if (preview.sourceKind && preview.sourceKind !== 'internal-cache' && preview.sourceKind !== 'verified-resource') {
    throw new Error('Unexpected bitmap storage kind');
  }
  if (preview.sourceKind === 'verified-resource') {
    if (!target.resourceSha256 || !/^[a-f0-9]{64}$/i.test(target.resourceSha256) ||
        preview.resourceSha256?.toLowerCase() !== target.resourceSha256.toLowerCase()) {
      throw new Error('The external bitmap resource changed or was not pinned to this project');
    }
  } else if (preview.resourceSha256) {
    throw new Error('Internal bitmap response unexpectedly includes external-resource identity');
  }
  if (!SUPPORTED_FORMATS.has(preview.format)) throw new Error('Unexpected automatic bitmap format');
  if (!Number.isInteger(preview.width) || !Number.isInteger(preview.height) ||
      preview.width < 1 || preview.height < 1 || preview.width > 4096 || preview.height > 4096 ||
      preview.width * preview.height > 16_777_216) throw new Error('Bitmap response dimensions out of bounds');
  if (typeof preview.ddsBase64 !== 'string' || preview.ddsBase64.length < 172 ||
      preview.ddsBase64.length > MAX_PREVIEW_BASE64 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(preview.ddsBase64)) {
    throw new Error('Malformed or oversized bitmap response');
  }
  const packed = atob(preview.ddsBase64);
  if (packed.length > 16 * 1024 * 1024 + 128 || packed.length < 128) {
    throw new Error('Decoded bitmap exceeds size limits');
  }
  const dds = Uint8Array.from(packed, character => character.charCodeAt(0));
  const decoded = decodeHaloDds(dds.buffer);
  if (decoded.width !== preview.width || decoded.height !== preview.height ||
      (preview.format !== decoded.format && !(preview.format === 'BGRX8' && decoded.format === 'BGRA8'))) {
    throw new Error('Bitmap metadata conflicts with decoded DDS pixels');
  }
  return decoded;
}
