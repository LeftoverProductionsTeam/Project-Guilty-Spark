import * as THREE from 'three';
import { call } from './api';
import { nativePreviewResource } from './nativePreviewResources';
import { decodeOwnedBitmapPreview } from './ownedBitmapPreview';
import type { OwnedBitmapPreview } from './ownedBitmapPreview';
import type { DdsImage } from './haloDds';
export interface OwnedCubeResponse {
  sourceSha256: string;
  resourceSha256: string | null;
  bitmapTagId: number;
  faces: OwnedBitmapPreview[];
  mipFaces?: OwnedBitmapPreview[][];
}
export const MAX_REFLECTION_BATCH = 4;
export interface OwnedCubeBatchResponse {
  sourceSha256: string;
  items: { bitmapTagId: number; preview: OwnedCubeResponse | null; error: string | null }[];
}
export interface DecodedReflectionCube {
  faces: DdsImage[];
  mipFaces?: DdsImage[][];
  bytes: number;
}
export type DecodedReflectionItem = { cube: DecodedReflectionCube | null; error: string | null };
/** Admit every face and original level before decoding any payload. Xbox
 * compressed chains can legitimately end above one pixel. */
function cubeLayout(
  response: OwnedCubeResponse,
  source: string,
  tagId: number,
  resourceHashes: Record<string, string>,
) {
  if (
    !response ||
    response.sourceSha256 !== source ||
    response.bitmapTagId !== tagId ||
    !/^[a-f\d]{64}$/i.test(source) ||
    !Number.isSafeInteger(tagId) ||
    tagId < 0 ||
    tagId > 0xffffffff
  )
    throw Error('Reflection cube identity differs from its source shader.');
  if (response.resourceSha256 && !Object.values(resourceHashes).includes(response.resourceSha256))
    throw Error('Reflection cube resources differ from the map’s recorded pins.');
  if (
    !Array.isArray(response.faces) ||
    response.faces.length !== 6 ||
    (response.mipFaces !== undefined && !Array.isArray(response.mipFaces))
  )
    throw Error('Reflection cube face count differs from its source shader.');
  const first = response.faces[0],
    edge = first?.width,
    count = first?.mipLevels ?? 1;
  if (
    !Number.isInteger(edge) ||
    edge < 1 ||
    edge > 1024 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 11 ||
    count > 1 + Math.floor(Math.log2(edge)) ||
    (response.mipFaces ?? []).length !== count - 1
  )
    throw Error('Reflection original level count or dimensions are invalid.');
  const levels = [response.faces, ...(response.mipFaces ?? [])];
  let packed = 0,
    rgba = 0;
  for (const [level, faces] of levels.entries()) {
    if (!Array.isArray(faces) || faces.length !== 6)
      throw Error('Reflection original level has an invalid face count.');
    const expected = Math.max(1, Math.floor(edge / 2 ** level));
    for (const face of faces) {
      if (!face || face.bitmapTagId !== tagId || face.imageIndex !== 0 || face.sourceSha256 !== source)
        throw Error('Source map changed or reflection face refers to a different tag or image.');
      if (
        face.width !== expected ||
        face.height !== expected ||
        (face.mipLevel ?? 0) !== level ||
        (face.mipLevels ?? 1) !== count ||
        face.nativeMipmaps !== first.nativeMipmaps ||
        (face.imageCount ?? 1) !== (first.imageCount ?? 1) ||
        face.format !== first.format ||
        (face.sourceKind ?? 'internal-cache') !== (first.sourceKind ?? 'internal-cache') ||
        (face.resourceSha256 ?? null) !== response.resourceSha256
      )
        throw Error('Reflection original face dimensions, encoding or source metadata changed.');
      if (typeof face.ddsBase64 !== 'string' || face.ddsBase64.length > 23 * 1024 * 1024)
        throw Error('Reflection face exceeds its bounded image layout.');
      packed += Math.floor(face.ddsBase64.length / 4) * 3;
      rgba += expected * expected * 4;
    }
  }
  if (packed > 16 * 1024 * 1024 + 128 * 6 * count || rgba > 16 * 1024 * 1024)
    throw Error('Reflection cube exceeds its packed or decoded 16MiB budget.');
  return { levels, packed, rgba };
}
export function decodeReflectionCube(
  response: OwnedCubeResponse,
  source: string,
  tagId: number,
  resourceHashes: Record<string, string>,
): DecodedReflectionCube {
  const layout = cubeLayout(response, source, tagId, resourceHashes);
  const levels = layout.levels.map((faces, mipLevel) =>
    faces.map((face, cubeFaceIndex) =>
      decodeOwnedBitmapPreview(
        face,
        {
          bitmapTagId: tagId,
          imageIndex: 0,
          mipLevel,
          sourceSha256: source,
          resourceSha256: response.resourceSha256,
        },
        cubeFaceIndex,
      ),
    ),
  );
  return { faces: levels[0], mipFaces: levels.slice(1), bytes: layout.rgba };
}
/** Validate the complete transaction before admitting any GPU textures. One
 * malformed identity poisons the batch; explicit per-cube refusals stay visible. */
export function decodeReflectionCubeBatch(
  response: OwnedCubeBatchResponse,
  source: string,
  ids: readonly number[],
  resourceHashes: Record<string, string>,
): Map<number, DecodedReflectionItem> {
  if (
    !/^[a-f\d]{64}$/i.test(source) ||
    response?.sourceSha256 !== source ||
    !ids.length ||
    ids.length > MAX_REFLECTION_BATCH ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !Number.isSafeInteger(id) || id < 0 || id > 0xffffffff) ||
    !Array.isArray(response.items) ||
    response.items.length !== ids.length
  )
    throw Error('Reflection batch identity or count differs from its request.');
  let packed = 0,
    rgba = 0;
  for (let i = 0; i < ids.length; i++) {
    const item = response.items[i];
    if (!item || item.bitmapTagId !== ids[i] || (item.preview != null) === (item.error != null))
      throw Error('Reflection batch contains a reordered, foreign or ambiguous result.');
    if (!item.preview) {
      if (typeof item.error !== 'string' || !item.error || item.error.length > 200)
        throw Error('Reflection batch refusal is invalid.');
      continue;
    }
    const layout = cubeLayout(item.preview, source, item.bitmapTagId, resourceHashes);
    packed += layout.packed;
    rgba += layout.rgba;
  }
  if (packed > 64 * 1024 * 1024 + 128 * 6 * 11 * ids.length || rgba > 64 * 1024 * 1024)
    throw Error('Reflection batch exceeds its packed or decoded 64MiB budget.');
  return new Map(
    response.items.map((item) => [
      item.bitmapTagId,
      {
        cube: item.preview
          ? decodeReflectionCube(item.preview, source, item.bitmapTagId, resourceHashes)
          : null,
        error: item.error,
      },
    ]),
  );
}
export async function loadReflectionCubeBatch(
  projectId: string,
  source: string,
  ids: number[],
  resourceHashes: Record<string, string>,
) {
  const response = await call<OwnedCubeBatchResponse>('preview_owned_reflection_cube_batch', {
    projectId,
    sourceSha256: source,
    bitmapTagIds: ids,
    includeMips: true,
  });
  return decodeReflectionCubeBatch(response, source, ids, resourceHashes);
}
export async function loadReflectionCube(
  projectId: string,
  source: string,
  tagId: number,
  resourceHashes: Record<string, string>,
) {
  const response = await readReflectionCube(projectId, source, tagId);
  return createReflectionCubeTexture(response, source, tagId, resourceHashes);
}
/** Raw bytes only; callers must validate/decode before creating any texture. */
export function readReflectionCube(projectId: string, source: string, tagId: number) {
  return nativePreviewResource<OwnedCubeResponse>(
    'preview_owned_reflection_cube',
    {
      projectId,
      bitmapTagId: tagId,
      includeMips: true,
      sourceSha256: source,
    },
    source,
  );
}
export function createReflectionCubeTexture(
  response: OwnedCubeResponse,
  source: string,
  tagId: number,
  resourceHashes: Record<string, string>,
) {
  const decoded = decodeReflectionCube(response, source, tagId, resourceHashes);
  return createDecodedReflectionCubeTexture(decoded, tagId);
}
export function createDecodedReflectionCubeTexture(decoded: DecodedReflectionCube, tagId: number) {
  const levels = [decoded.faces, ...(decoded.mipFaces ?? [])],
    edge = decoded.faces[0]?.width;
  if (
    !Number.isInteger(edge) ||
    edge < 1 ||
    edge > 1024 ||
    levels.length > 11 ||
    levels.length > 1 + Math.floor(Math.log2(edge))
  )
    throw Error('Invalid original reflection texture levels');
  let bytes = 0;
  for (const [level, faces] of levels.entries()) {
    const size = Math.max(1, Math.floor(edge / 2 ** level));
    if (
      faces.length !== 6 ||
      faces.some(
        (face) => face.width !== size || face.height !== size || face.pixels.byteLength !== size * size * 4,
      )
    )
      throw Error('Invalid original reflection face layout');
    bytes += size * size * 4 * 6;
  }
  if (bytes !== decoded.bytes || bytes > 16 * 1024 * 1024)
    throw Error('Original reflection pixel budget differs from decoded data');
  // Data images preserve RGB beneath alpha; a canvas round trip cannot.
  const images = levels.map((faces) =>
    faces.map((face) => new THREE.DataTexture(face.pixels, face.width, face.height, THREE.RGBAFormat)),
  );
  const texture = new THREE.CubeTexture(images[0]);
  // Three's uncompressed cube upload expects lower levels without the base.
  texture.mipmaps = images.slice(1).map((faces) => new THREE.CubeTexture(faces));
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  texture.generateMipmaps = false;
  texture.minFilter = levels.length > 1 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.userData.originalMipLevels = levels.length;
  texture.userData.rgbaBytes = bytes;
  texture.userData.sourceEncoded = true;
  texture.userData.sourceTagId = tagId;
  texture.needsUpdate = true;
  return texture;
}
