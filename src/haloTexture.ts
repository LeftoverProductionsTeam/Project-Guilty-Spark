/** User-authorized texture previews only; no bundled Halo images or disk writes. */
import * as THREE from 'three';
import { decodeHaloDds } from './haloDds';
const MAX_BYTES = 96 * 1024 * 1024;
export async function loadUserShaderTexture(file: File): Promise<THREE.Texture> {
  if (!file || file.size <= 0 || file.size > MAX_BYTES) throw new Error('Texture file size exceeds preview limits');
  if (/\.dds$/i.test(file.name)) {
    const image = decodeHaloDds(await file.arrayBuffer());
    const texture = new THREE.DataTexture(image.pixels, image.width, image.height, THREE.RGBAFormat);
    texture.needsUpdate = true;
    texture.flipY = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.name = `Local DDS ${image.format} · ${file.name}`;
    return texture;
  }
  if (!/\.(png|jpg|jpeg|webp)$/i.test(file.name) || !['image/png','image/jpeg','image/webp'].includes(file.type))
    throw new Error('Choose an image (.png, .jpg, .webp) or DXT1/3/5/RGBA8/BGRA8 DDS');
  const url = URL.createObjectURL(file);
  try {
    const texture = await new THREE.TextureLoader().loadAsync(url);
    const image = texture.image as {width:number; height:number};
    if (!image.width || !image.height || image.width > 4096 || image.height > 4096 || image.width*image.height>16_777_216) {
      texture.dispose(); throw new Error('Image dimensions exceed 4096px or 16 megapixels');
    }
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.name = `Local image · ${file.name}`;
    return texture;
  } finally { URL.revokeObjectURL(url); }
}
