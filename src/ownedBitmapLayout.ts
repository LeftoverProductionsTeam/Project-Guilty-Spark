/** Native sequence/atlas metadata. Pixels still use the existing bitmap decoder. */
export interface BitmapLayoutImage {width:number;height:number;kind:number;registration:[number,number]}
export interface BitmapLayoutSprite {imageIndex:number;left:number;right:number;top:number;bottom:number;registration:[number,number]}
export interface BitmapLayoutSequence {name:string;firstImage:number;imageCount:number;sprites:BitmapLayoutSprite[]}
export interface OwnedBitmapLayout {bitmapTagId:number;sourceSha256:string;sourceKind:'internal-cache'|'verified-resource';resourceSha256?:string|null;images:BitmapLayoutImage[];sequences:BitmapLayoutSequence[]}
const integer=(n:unknown,min:number,max:number):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=min&&n<=max;
const finite=(n:unknown,min:number,max:number):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
const pair=(v:unknown,min:number,max:number,whole=false):v is [number,number]=>Array.isArray(v)&&v.length===2&&v.every(n=>whole?integer(n,min,max):finite(n,min,max));
export function validateOwnedBitmapLayout(layout:OwnedBitmapLayout,target:{bitmapTagId:number;sourceSha256:string;resourceSha256?:string|null}):OwnedBitmapLayout {
  if(!layout||!integer(target.bitmapTagId,0,0xffffffff)||!/^[a-f0-9]{64}$/i.test(target.sourceSha256)||
      layout.bitmapTagId!==target.bitmapTagId||layout.sourceSha256!==target.sourceSha256)throw Error('HUD bitmap metadata belongs to a different source or tag.');
  if(layout.sourceKind==='verified-resource'){
    if(!target.resourceSha256||!/^[a-f0-9]{64}$/i.test(target.resourceSha256)||layout.resourceSha256!==target.resourceSha256)throw Error('HUD bitmap metadata resource identity changed.');
  }else if(layout.sourceKind!=='internal-cache'||layout.resourceSha256!=null)throw Error('Unverified HUD bitmap metadata provenance.');
  if(!Array.isArray(layout.images)||layout.images.length===0||layout.images.length>2048||!Array.isArray(layout.sequences)||layout.sequences.length>256)throw Error('HUD bitmap layout exceeds its bounded native inventory.');
  for(const image of layout.images)if(!image||!integer(image.width,1,4096)||!integer(image.height,1,4096)||!integer(image.kind,0,2)||!pair(image.registration,-32768,32767,true))throw Error('Invalid native HUD bitmap dimensions or registration.');
  let sprites=0;
  for(const sequence of layout.sequences){
    if(!sequence||typeof sequence.name!=='string'||sequence.name.length>32||/[\x00-\x1f]/.test(sequence.name)||!integer(sequence.firstImage,-32768,32767)||!integer(sequence.imageCount,0,65535)||!Array.isArray(sequence.sprites)||sequence.sprites.length>64)throw Error('Invalid native HUD bitmap sequence.');
    sprites+=sequence.sprites.length;if(sprites>16384)throw Error('HUD sprite inventory exceeds the preview bound.');
    for(const sprite of sequence.sprites)if(!sprite||!integer(sprite.imageIndex,0,layout.images.length-1)||layout.images[sprite.imageIndex].kind!==0||
      !finite(sprite.left,0,1)||!finite(sprite.right,0,1)||sprite.left>=sprite.right||!finite(sprite.top,0,1)||!finite(sprite.bottom,0,1)||sprite.top>=sprite.bottom||!pair(sprite.registration,-65536,65536))throw Error('HUD sprite escapes its native atlas image.');
    if(sequence.sprites.length===0&&sequence.imageCount>0&&(sequence.firstImage<0||sequence.firstImage+sequence.imageCount>layout.images.length))throw Error('HUD sequence image span escapes its native table.');
  }
  return layout;
}
export interface BitmapSequenceFrame {imageIndex:number;frameCount:number;crop:[number,number,number,number];width:number;height:number;registration:[number,number];sprite:boolean}
/** A disabled or empty sequence never becomes guessed image zero. */
export function bitmapSequenceFrame(layout:OwnedBitmapLayout,sequenceIndex:number,frameIndex:number):BitmapSequenceFrame {
  if(!integer(sequenceIndex,0,layout.sequences.length-1))throw Error(sequenceIndex===-1?'This native HUD sequence is disabled (-1).':'This HUD sequence is absent from the original bitmap.');
  const sequence=layout.sequences[sequenceIndex],count=sequence.sprites.length||sequence.imageCount;
  if(count===0)throw Error('The selected native HUD sequence is empty.');
  if(!integer(frameIndex,0,count-1))throw Error('Choose an original frame in this native HUD sequence.');
  const sprite=sequence.sprites[frameIndex],imageIndex=sprite?sprite.imageIndex:sequence.firstImage+frameIndex,image=layout.images[imageIndex];
  if(!image||image.kind!==0)throw Error('This HUD frame is not a supported native 2D image.');
  const crop:[number,number,number,number]=sprite?[sprite.left,sprite.top,sprite.right-sprite.left,sprite.bottom-sprite.top]:[0,0,1,1];
  return {imageIndex,frameCount:count,crop,width:image.width*crop[2],height:image.height*crop[3],
    registration:sprite?[sprite.registration[0]*image.width,sprite.registration[1]*image.height]:image.registration,sprite:!!sprite};
}
