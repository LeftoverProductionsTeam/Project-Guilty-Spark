import * as THREE from 'three';
import { call } from './api';
import { decodeOwnedBitmapPreview } from './ownedBitmapPreview';
import type { OwnedBitmapPreview } from './ownedBitmapPreview';
export interface OwnedCubeResponse {
  sourceSha256: string;
  resourceSha256: string | null;
  bitmapTagId: number;
  faces: OwnedBitmapPreview[];
}
export const MAX_REFLECTION_BATCH = 4;
export interface OwnedCubeBatchResponse {
  sourceSha256: string;
  items: { bitmapTagId: number; preview: OwnedCubeResponse | null; error: string | null }[];
}
export type DecodedReflectionCube = ReturnType<typeof decodeReflectionCube>;
export type DecodedReflectionItem = { cube: DecodedReflectionCube | null; error: string | null };
export function decodeReflectionCube(
  response: OwnedCubeResponse,
  source: string,
  tagId: number,
  resourceHashes: Record<string, string>,
) {
  if (response.sourceSha256 !== source || response.bitmapTagId !== tagId || response.faces.length !== 6)
    throw Error('Reflection cube identity or face count differs from its source shader.');
  if (response.resourceSha256 && !Object.values(resourceHashes).includes(response.resourceSha256))
    throw Error('Reflection cube resources differ from the map’s recorded pins.');
  let edge = 0,
    bytes = 0;
  const faces = response.faces.map((face) => {
    const image = decodeOwnedBitmapPreview(face, {
      bitmapTagId: tagId,
      imageIndex: 0,
      sourceSha256: source,
      resourceSha256: response.resourceSha256,
    });
    if (image.width !== image.height || image.width > 1024 || (edge && edge !== image.width))
      throw Error('Reflection faces must have the same bounded square dimensions.');
    edge = image.width;
    bytes += image.pixels.byteLength;
    return image;
  });
  if (bytes > 16 * 1024 * 1024) throw Error('Reflection cube exceeds the 16 MiB decoded budget.');
  return { faces, bytes };
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
    if (!Array.isArray(item.preview.faces) || item.preview.faces.length !== 6)
      throw Error('Reflection batch has an invalid face count.');
    for (const face of item.preview.faces) {
      if (
        !face ||
        typeof face.ddsBase64 !== 'string' ||
        face.ddsBase64.length > 23 * 1024 * 1024 ||
        !Number.isInteger(face.width) ||
        !Number.isInteger(face.height) ||
        face.width <= 0 ||
        face.height <= 0 ||
        face.width > 1024 ||
        face.height > 1024
      )
        throw Error('Reflection batch face exceeds its bounded image layout.');
      packed += Math.floor(face.ddsBase64.length / 4) * 3;
      rgba += face.width * face.height * 4;
    }
  }
  if (packed > 64 * 1024 * 1024 + 128 * 6 * ids.length || rgba > 64 * 1024 * 1024)
    throw Error('Reflection batch exceeds its packed or decoded 64 MiB budget.');
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
  return call<OwnedCubeResponse>('preview_owned_reflection_cube', {
    projectId,
    bitmapTagId: tagId,
    sourceSha256: source,
  });
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
  const images = decoded.faces.map((face) => {
    const canvas = document.createElement('canvas');
    canvas.width = face.width;
    canvas.height = face.height;
    const context = canvas.getContext('2d');
    if (!context) throw Error('Reflection image canvas is unavailable');
    const pixels = context.createImageData(face.width, face.height);
    pixels.data.set(face.pixels);
    context.putImageData(pixels, 0, 0);
    return canvas;
  });
  const texture = new THREE.CubeTexture(images);
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  texture.userData.rgbaBytes = decoded.bytes;
  texture.userData.sourceEncoded = true;
  texture.userData.sourceTagId = tagId;
  return texture;
}
