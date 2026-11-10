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
  triangle:number; bspIndex:number; shaderTagId:number; lightmapKey:string;
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
  return {triangle:hit.triangle,bspIndex:range.bspIndex,shaderTagId:range.shaderTagId,lightmapKey:key,lightmapBitmapTagId:range.lightmapBitmapTagId!,
    point:[point[0],point[1],hit.z],barycentric:weights,surfaceNormal:unit(surface),surfaceUv,lightmapUv,incident,direction,accuracy:lengths.reduce((sum,n,k)=>sum+n*weights[k],0)};
}
