import * as THREE from 'three';
import type {DdsImage} from './haloDds';

/** Classic colours are combined in their stored colour space by haloMaterial.
 * Detail stages tile; only baked lightmap pages clamp at their UV borders. */
export function configureSourceTexture(texture: THREE.Texture, role: 'shader' | 'lightmap' | 'detail' | 'decal', originalMipmaps?: readonly DdsImage[]) {
  texture.colorSpace = THREE.NoColorSpace;
  texture.userData.sourceEncoded = true;
  texture.wrapS = texture.wrapT = role === 'lightmap' || role==='decal' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  if(originalMipmaps){
    const image=texture.image as {width:number;height:number};
    if(!originalMipmaps.length||originalMipmaps.length>17||originalMipmaps.length>1+Math.floor(Math.log2(Math.max(image.width,image.height)))||originalMipmaps.some((m,i)=>m.width!==Math.max(1,Math.floor(image.width/2**i))||m.height!==Math.max(1,Math.floor(image.height/2**i))||m.pixels.byteLength!==m.width*m.height*4))throw Error('Invalid original texture mip chain');
    texture.mipmaps=originalMipmaps.map(m=>({data:m.pixels,width:m.width,height:m.height}));
    texture.generateMipmaps=false;texture.minFilter=originalMipmaps.length>1?THREE.LinearMipmapLinearFilter:THREE.LinearFilter;
    texture.userData.originalMipLevels=originalMipmaps.length;texture.userData.rgbaBytes=originalMipmaps.reduce((n,m)=>n+m.pixels.byteLength,0);
  }
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  if (role === 'lightmap') texture.channel = 1;
  return texture;
}
