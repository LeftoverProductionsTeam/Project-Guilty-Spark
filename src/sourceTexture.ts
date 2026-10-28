import * as THREE from 'three';

/** Classic colours are combined in their stored colour space by haloMaterial.
 * Detail stages tile; only baked lightmap pages clamp at their UV borders. */
export function configureSourceTexture(texture: THREE.Texture, role: 'shader' | 'lightmap' | 'detail' | 'decal') {
  texture.colorSpace = THREE.NoColorSpace;
  texture.userData.sourceEncoded = true;
  texture.wrapS = texture.wrapT = role === 'lightmap' || role==='decal' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  if (role === 'lightmap') texture.channel = 1;
  return texture;
}
