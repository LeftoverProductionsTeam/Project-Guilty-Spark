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
export async function loadReflectionCube(
  projectId: string,
  source: string,
  tagId: number,
  resourceHashes: Record<string, string>,
) {
  const response = await call<OwnedCubeResponse>('preview_owned_reflection_cube', {
    projectId,
    bitmapTagId: tagId,
    sourceSha256: source,
  });
  const decoded = decodeReflectionCube(response, source, tagId, resourceHashes);
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
