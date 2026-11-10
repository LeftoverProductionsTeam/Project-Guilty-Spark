/** Evidence-led Halo 1 BSP lightmap coverage and local image attribution.
 * In Halo 1 a lightmap page index is local to a BSP, not global to a map.
 * Never silently share a texture between BSPs which both have page 0.
 * No cache data is changed; no game texture pixels are guessed or bundled.
 */
import type { MeshData, Vec3 } from './types';

export interface LightmapPageCoverage {
  key: string;
  bspIndex: number;
  page: number;
  materials: number;
  triangles: number;
  bspIndices: number[];
  withRealUvs: boolean;
}

export function lightmapPageKey(bspIndex: number, page: number): string {
  if (!Number.isSafeInteger(bspIndex) || bspIndex < 0 || bspIndex > 255 ||
      !Number.isSafeInteger(page) || page < 0 || page > 255) {
    throw new Error('Lightmap page and BSP must be bounded nonnegative integers');
  }
  return `bsp${bspIndex}:page${page}`;
}

/** Select a baked-lighting page for a single BSP material. This is not a
 * shader-effect renderer; it prevents unrelated BSP page assignments.
 */
export function materialLightmapKey(
  range: Pick<NonNullable<MeshData['materialRanges']>[number], 'bspIndex' | 'lightmapPage' | 'hasLightmapUvs'>,
  hasValidatedUvBuffer: boolean,
  assignedPages: Readonly<Record<string, unknown>>,
): string | null {
  if (!hasValidatedUvBuffer || range.hasLightmapUvs !== true) return null;
  try {
    const key = lightmapPageKey(range.bspIndex, range.lightmapPage ?? -1);
    return assignedPages[key] ? key : null;
  } catch { return null; }
}

export function inspectLightmapPages(mesh: MeshData | null): LightmapPageCoverage[] {
  if (!mesh?.materialRanges?.length) return [];
  const vertexCount = mesh.positions.length / 3;
  const hasCompleteBuffer = Number.isInteger(vertexCount) && !!mesh.lightmapUvs &&
    mesh.lightmapUvs.length === vertexCount * 2 &&
    mesh.lightmapUvs.every(n => Number.isFinite(n) && Math.abs(n) <= 32);
  const pages = new Map<string, { bspIndex: number; page: number; triangles: number; materials: number; valid: boolean }>();
  for (const range of mesh.materialRanges) {
    let key: string;
    try { key = lightmapPageKey(range.bspIndex, range.lightmapPage ?? -1); } catch { continue; }
    if (!Number.isSafeInteger(range.indexStart) || !Number.isSafeInteger(range.indexCount) ||
        range.indexStart < 0 || range.indexCount <= 0 || range.indexCount % 3 ||
        range.indexStart + range.indexCount > mesh.indices.length) continue;
    const item = pages.get(key) ?? {bspIndex: range.bspIndex, page: range.lightmapPage!, triangles: 0, materials: 0, valid: false};
    item.triangles += range.indexCount / 3;
    item.materials++;
    item.valid ||= hasCompleteBuffer && range.hasLightmapUvs === true;
    pages.set(key, item);
  }
  return [...pages.entries()].sort((a,b) => a[1].bspIndex - b[1].bspIndex || a[1].page - b[1].page)
    .map(([key, item]) => ({key, bspIndex: item.bspIndex, page: item.page, materials: item.materials,
      triangles: item.triangles, bspIndices: [item.bspIndex], withRealUvs: item.valid}));
}

export interface LocalLightmapFile { name: string; size?: number; }
export interface LocalLightmapMatch { key: string; bspIndex: number; page: number; fileIndex: number; filename: string; }

/** Image names MUST identify the page. Multi-BSP caches also need BSP in the
 * filename when a page number is repeated: bsp_1_page_0.png. If only one BSP
 * has page 0, a legacy page_0.png is unambiguous and continues to work.
 * Duplicate candidates for the same page are all rejected.
 */
export function matchLocalLightmapPages(pages: readonly LightmapPageCoverage[], files: readonly LocalLightmapFile[]): {
  assignments: LocalLightmapMatch[];
  skipped: {filename:string;reason:string}[];
} {
  if (files.length > 128 || files.reduce((sum, f) => sum + (f.size ?? 0), 0) > 256 * 1024 * 1024)
    throw new Error('Select at most 128 local lightmap images totaling 256 MiB');
  const eligible = new Map(pages.filter(p => p.withRealUvs).map(p => [p.key, p]));
  const byPage = new Map<number, LightmapPageCoverage[]>();
  for (const p of eligible.values()) byPage.set(p.page, [...(byPage.get(p.page) ?? []), p]);
  const requests = new Map<string, LocalLightmapMatch[]>();
  const skipped: {filename:string;reason:string}[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const name = file?.name ?? '';
    if (!Number.isFinite(file?.size ?? 0) || (file?.size ?? 0) < 0 || (file?.size ?? 0) > 96 * 1024 * 1024) {
      skipped.push({filename:name,reason:'Image size is invalid or exceeds 96 MiB'});continue;
    }
    const explicit = /^bsp[_-]?(\d{1,3})[_-](?:lightmap[_-]?(?:page[_-]?)?|page[_-]?)(\d{1,3})\.(?:dds|png|jpe?g|webp)$/i.exec(name);
    const legacy = explicit ? null : /^(?:lightmap[_-]?(?:page[_-]?)?|page[_-]?)(\d{1,3})\.(?:dds|png|jpe?g|webp)$/i.exec(name);
    if (!explicit && !legacy) {
      skipped.push({filename:name,reason:'Use bsp_0_page_3.png, or page_3.png if its BSP is unambiguous'});continue;
    }
    const page = Number(explicit ? explicit[2] : legacy![1]);
    let target: LightmapPageCoverage | undefined;
    if (explicit) target = eligible.get(`bsp${Number(explicit[1])}:page${page}`);
    else {
      const candidates = byPage.get(page) ?? [];
      if (candidates.length > 1) {
        skipped.push({filename:name,reason:`Page ${page} occurs in multiple BSPs; use bsp_N_page_${page}.png`});continue;
      }
      target = candidates[0];
    }
    if (!target) {
      skipped.push({filename:name,reason:'BSP/page not present with validated secondary UVs'});continue;
    }
    const item: LocalLightmapMatch = {key:target.key,bspIndex:target.bspIndex,page:target.page,fileIndex:i,filename:name};
    requests.set(item.key,[...(requests.get(item.key)??[]),item]);
  }
  const assignments: LocalLightmapMatch[] = [];
  for (const [key, items] of [...requests].sort(([a],[b])=>a.localeCompare(b))) {
    if (items.length !== 1) {
      for (const item of items) skipped.push({filename:item.filename,reason:`Ambiguous: ${items.length} images for ${key}`});
    } else assignments.push(items[0]);
  }
  return {assignments,skipped};
}

/** A source-data sample, not a replacement lighting rig or native game state. */
export interface IncidentRadiositySample {
  triangle:number; bspIndex:number; shaderTagId:number; shaderPermutation:number; lightmapKey:string;
  lightmapBitmapTagId:number; point:Vec3; barycentric:Vec3;
  surfaceNormal:Vec3; surfaceUv:[number,number]; lightmapUv:[number,number];
  incident:Vec3; direction:Vec3; accuracy:number;
}
/** Downward source probe. Select the nearest surface before checking lighting:
 * an unavailable floor must never leak light from another floor behind it.
 * Native incident-vector lengths are retained independently from direction.
 * No texture is decoded, no source is copied and no scene lighting is changed.
 */
export function sampleIncidentRadiosity(mesh:MeshData|null|undefined,point:Vec3,maximumDistance=10,bspIndex?:number):IncidentRadiositySample|null {
  if(!mesh||point.length!==3||!point.every(Number.isFinite)||!Number.isFinite(maximumDistance)||maximumDistance<=0||maximumDistance>100||
    mesh.positions.length%3||mesh.positions.length>3_000_000||mesh.indices.length%3||mesh.indices.length>1_500_000||
    (bspIndex!==undefined&&(!Number.isInteger(bspIndex)||bspIndex<0||bspIndex>15)))return null;
  const ranges=mesh.materialRanges??[];if(ranges.length>131072)return null;
  if(!ranges.some(range=>range.hasIncidentRadiosity===true))return null;
  let hit:{triangle:number;ids:number[];weights:Vec3;z:number;range:typeof ranges[number]|undefined}|undefined,ambiguous=false;
  for(let at=0;at<mesh.indices.length;at+=3){
    const ids=mesh.indices.slice(at,at+3);if(ids.some(id=>!Number.isSafeInteger(id)||id<0||id*3+2>=mesh.positions.length))return null;
    const a=mesh.positions.slice(ids[0]*3,ids[0]*3+3),b=mesh.positions.slice(ids[1]*3,ids[1]*3+3),c=mesh.positions.slice(ids[2]*3,ids[2]*3+3);
    if(![...a,...b,...c].every(Number.isFinite))return null;
    if(point[0]<Math.min(a[0],b[0],c[0])||point[0]>Math.max(a[0],b[0],c[0])||point[1]<Math.min(a[1],b[1],c[1])||point[1]>Math.max(a[1],b[1],c[1]))continue;
    const denominator=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(denominator)<1e-12)continue;
    const u=((b[1]-c[1])*(point[0]-c[0])+(c[0]-b[0])*(point[1]-c[1]))/denominator,v=((c[1]-a[1])*(point[0]-c[0])+(a[0]-c[0])*(point[1]-c[1]))/denominator,w=1-u-v;
    if(Math.min(u,v,w)<-1e-7)continue;const z=a[2]*u+b[2]*v+c[2]*w;if(z>point[2]+1e-7||point[2]-z>maximumDistance)continue;
    const matches=ranges.filter(range=>Number.isSafeInteger(range.indexStart)&&Number.isSafeInteger(range.indexCount)&&range.indexStart<=at&&at+3<=range.indexStart+range.indexCount);
    const range=matches.length===1?matches[0]:undefined;
    if(bspIndex!==undefined&&range?.bspIndex!==bspIndex)continue;
    if(hit&&Math.abs(z-hit.z)<1e-7&&range?.bspIndex!==hit.range?.bspIndex){ambiguous=true;continue;}
    if(!hit||z>hit.z+1e-7){hit={triangle:at/3,ids,weights:[u,v,w],z,range};ambiguous=false;}
  }
  if(!hit||ambiguous||!hit.range?.hasIncidentRadiosity||!hit.range.hasLightmapUvs)return null;
  const {ids,weights,range}=hit,radiosity=mesh.incidentRadiosity,normals=mesh.normals,uvs=mesh.uvs,lightUvs=mesh.lightmapUvs;
  if(!radiosity||radiosity.length!==mesh.positions.length||!normals||normals.length!==mesh.positions.length||!uvs||uvs.length!==mesh.positions.length/3*2||!lightUvs||lightUvs.length!==uvs.length||
    !Number.isSafeInteger(range.shaderTagId)||!Number.isSafeInteger(range.lightmapBitmapTagId)||range.lightmapBitmapTagId!<0)return null;
  const interpolate=(values:number[],stride:number):number[]=>Array.from({length:stride},(_,axis)=>ids.reduce((sum,id,k)=>sum+values[id*stride+axis]*weights[k],0));
  const unit=(vector:Vec3):Vec3=>{const length=Math.hypot(...vector);return length>1e-9?vector.map(n=>n/length) as Vec3:[0,0,0];};
  const incident=interpolate(radiosity,3) as Vec3,surface=interpolate(normals,3) as Vec3,surfaceUv=interpolate(uvs,2) as [number,number],lightmapUv=interpolate(lightUvs,2) as [number,number];
  const lengths=ids.map(id=>Math.hypot(...radiosity.slice(id*3,id*3+3)));
  if(![...incident,...surface,...surfaceUv,...lightmapUv,...lengths].every(Number.isFinite)||lengths.some(n=>n>Math.sqrt(1.05)))return null;
  const direction=unit([0,1,2].map(axis=>ids.reduce((sum,id,k)=>sum+(lengths[k]>1e-9?radiosity[id*3+axis]/lengths[k]:0)*weights[k],0)) as Vec3);
  let key:string;try{key=lightmapPageKey(range.bspIndex,range.lightmapPage??-1);}catch{return null;}
  return {triangle:hit.triangle,bspIndex:range.bspIndex,shaderTagId:range.shaderTagId,shaderPermutation:range.shaderPermutation??0,lightmapKey:key,lightmapBitmapTagId:range.lightmapBitmapTagId!,
    point:[point[0],point[1],hit.z],barycentric:weights,surfaceNormal:unit(surface),surfaceUv,lightmapUv,incident,direction,accuracy:lengths.reduce((sum,n,k)=>sum+n*weights[k],0)};
}

/** Static source-preview lighting, not live engine state. The native object
 * offset is relative to its root bone, then transformed by the placed object.
 * A geometric AABB centre is not an interchangeable sampling location. */
export function objectLightingPoint(mesh:MeshData|undefined,object:{position:Vec3;rotation:Vec3;scale:Vec3}):Vec3|null {
  const info=mesh?.objectLighting,root=mesh?.rig?.nodes[0];
  if(!info||!root||root.parent!==-1||![...info.offset,info.radius,...root.position,...root.rotation,...object.position,...object.rotation,...object.scale].every(Number.isFinite)||
    info.offset.some(n=>Math.abs(n)>1000)||info.radius<0||info.radius>1000||object.scale.some(n=>n<=0||n>1000))return null;
  const q=root.rotation,ql=Math.hypot(...q);if(ql<1e-9)return null;
  const [qx,qy,qz,qw]=q.map(n=>n/ql),[vx,vy,vz]=info.offset;
  const tx=2*(qy*vz-qz*vy),ty=2*(qz*vx-qx*vz),tz=2*(qx*vy-qy*vx);
  let x=(vx+qw*tx+qy*tz-qz*ty+root.position[0])*object.scale[0];
  let y=(vy+qw*ty+qz*tx-qx*tz+root.position[1])*object.scale[1];
  let z=(vz+qw*tz+qx*ty-qy*tx+root.position[2])*object.scale[2];
  const [yaw,pitch,roll]=object.rotation;
  // Match the existing World group: stored radians, composed in ZYX order.
  const rx=Math.cos(roll)*y-Math.sin(roll)*z,rz=Math.sin(roll)*y+Math.cos(roll)*z;y=rx;z=rz;
  const px=Math.cos(pitch)*x+Math.sin(pitch)*z,pz=-Math.sin(pitch)*x+Math.cos(pitch)*z;x=px;z=pz;
  const point:Vec3=[Math.cos(yaw)*x-Math.sin(yaw)*y+object.position[0],Math.sin(yaw)*x+Math.cos(yaw)*y+object.position[1],z+object.position[2]];
  return point.every(n=>Number.isFinite(n)&&Math.abs(n)<1e6)?point:null;
}
export interface SourceObjectLighting {
  point:Vec3;ambient:Vec3;primary:Vec3;primaryDirection:Vec3;
  bounce:Vec3;bounceDirection:Vec3;reflection:Vec3;reflectionBrightness:number;
  /** Source-derived dynamic shadow; unavailable in older cached metadata. */
  shadow?:{direction:Vec3;tint:Vec3};
}
/** Native integer texture sampling uses nearest-even at texel centres and
 * repeats at image boundaries. It does not sample generated GPU mipmaps. */
export function sampleNativeLightPixel(image:{width:number;height:number;pixels:Uint8Array},uv:[number,number]):Vec3|null {
  const {width,height,pixels}=image;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>4096||height>4096||pixels.length!==width*height*4||!uv.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6))return null;
  const nearestEven=(n:number)=>{const lower=Math.floor(n),fraction=n-lower;return fraction===.5?(lower%2===0?lower:lower+1):Math.round(n);};
  const wrap=(n:number,size:number)=>((n%size)+size)%size;
  const index=(wrap(nearestEven(height*uv[1]-.5),height)*width+wrap(nearestEven(width*uv[0]-.5),width))*4;
  return [pixels[index]/255,pixels[index+1]/255,pixels[index+2]/255];
}
/** BSP stores a signed 16-bit permutation. Preserve its remainder semantics:
 * a negative nonzero result is unavailable, never a wrapped last image. */
export function nativeDiffuseImageIndex(permutation:number,imageCount:number|undefined):number|null {
  if(!Number.isInteger(permutation)||permutation< -32768||permutation>65535||!Number.isInteger(imageCount)||imageCount!<1||imageCount!>2048)return null;
  const signed=permutation>=32768?permutation-65536:permutation,index=signed%imageCount!;
  return index<0?null:index===0?0:index;
}
/** The source's declared count includes Xbox padded tails. Never derive this
 * from the number of displayable levels or substitute a generated average. */
export function nativeDiffuseLightMip(nativeMipmaps:number|undefined,usableLevels:number|undefined):number|null {
  if(!Number.isInteger(nativeMipmaps)||nativeMipmaps!<0||nativeMipmaps!>16||!Number.isInteger(usableLevels)||usableLevels!<1||usableLevels!>17||usableLevels!>nativeMipmaps!+1)return null;
  const value=Math.fround(Math.fround(1-Math.fround(.3))*nativeMipmaps!),lower=Math.floor(value),level=value-lower===.5?(lower%2===0?lower:lower+1):Math.round(value);
  return level<usableLevels!?level:null;
}
/** Independently expressed static preview equations from the pinned native
 * lighting contract. Source RGB remains encoded, as in Halo's material math;
 * emission and authored reflection parameters are composed by haloMaterial.
 * Contact shadows, dynamic lights and runtime pose/lighting flags are separate.
 */
export function sourceObjectLighting(sample:IncidentRadiositySample,diffuse:Vec3,light:Vec3,brighten=false):SourceObjectLighting|null {
  if(![...diffuse,...light,...sample.direction,...sample.surfaceNormal,...sample.point].every(Number.isFinite)||[...diffuse,...light].some(n=>n<0||n>1))return null;
  const clamp=(n:number)=>Math.min(1,Math.max(0,n)),brightness=light[0]*.299+light[1]*.587+light[2]*.114;
  if(!Number.isFinite(sample.accuracy)||sample.accuracy<0||sample.accuracy>Math.sqrt(1.05))return null;
  const accuracy=clamp(sample.accuracy),spread=Math.pow(accuracy,.25),sx=-sample.direction[0]*spread,sy=-sample.direction[1]*spread,horizontal=Math.hypot(sx,sy),factor=horizontal>.707?.707/horizontal:1;
  const shadow={direction:[sx*factor,sy*factor,-Math.sqrt(1-Math.min(.707,horizontal)**2)] as Vec3,tint:light.map(n=>Math.min(1,Math.max(.03,1-1.3*n+(1-accuracy)*.5))) as Vec3};
  const boost=(rgb:Vec3,fraction:number):Vec3=>{if(!brighten)return rgb;const peak=Math.max(...rgb);return peak===0?rgb:rgb.map(n=>n*Math.min(1,Math.max(fraction,peak*(1+fraction)))/peak) as Vec3;};
  return {point:sample.point,shadow,ambient:boost(light.map(n=>.03+.4*n) as Vec3,.2),primary:boost([...light],.3),primaryDirection:sample.direction,
    bounce:boost(diffuse.map(n=>n*brightness) as Vec3,.2),bounceDirection:sample.surfaceNormal.map(n=>-n) as Vec3,
    reflection:boost(diffuse.map((n,i)=>clamp(.5+3*n)*clamp(.25+2*light[i])) as Vec3,.5),reflectionBrightness:brighten?1:clamp(.25+1.5*brightness)};
}
