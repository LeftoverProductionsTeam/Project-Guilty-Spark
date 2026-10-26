/** Source-only Halo 1 material dependency audit. Deliberately excludes image
 * pixels, local operating-system paths and any claim of game shader parity.
 * All bitmap IDs come from the exact inspected cache's tag table. */
import type { MapInspection, MeshData, Tag } from './types';

export type MaterialBindingState = 'resolved' | 'missing' | 'invalid' | 'unavailable' | 'legacy-unverified';
export interface MaterialDependency {
  shaderTagId: number;
  shaderClass: string;
  shaderPath: string;
  status: MaterialBindingState;
  bitmapTagId: number | null;
  bitmapPath: string | null;
  otherBitmaps: {role:string;tagId:number;path:string}[];
  triangleCount: number;
  bspIndices: number[];
}
export interface MaterialAudit {
  schema: 'guiltyspark-halo1-material-audit-v1';
  sourceSha256: string;
  engine: string;
  cacheVersion: number;
  scope: 'read-only-cache-metadata';
  summary: {renderMaterials:number;resolved:number;missing:number;invalid:number;unavailable:number;legacyUnverified:number};
  shaders: MaterialDependency[];
  notices:string[];
}
const primaryLabel = /^(?:base map|base texture|diffuse map|diffuse texture|primary map|albedo map|bitmap)$/i;
function shaderState(tag:Tag|undefined, bitmap:Tag|undefined, primaryCount:number):MaterialBindingState {
  if(!tag || !['senv','soso'].includes(tag.class)) return 'invalid';
  const status=tag.primaryBitmapStatus;
  if(status==='missing'||status==='unavailable'||status==='invalid')return status;
  if(status==='resolved')return primaryCount===1&&bitmap?.class==='bitm'?'resolved':'invalid';
  // Old serialized inspections did not carry native shader provenance.
  return 'legacy-unverified';
}

/** Never extrapolate a bitmap by filename. Caller can offer manual preview for
 * unresolved shaders without claiming an actual shader dependency was found. */
export function buildMaterialAudit(inspection: Pick<MapInspection,'header'|'sha256'|'tags'>, mesh:MeshData|null|undefined): MaterialAudit {
  if (!/^[a-f0-9]{64}$/i.test(inspection.sha256)) throw new Error('Expected verified SHA-256 of the exact source map');
  const tags = new Map(inspection.tags.map(t=>[t.id,t]));
  if(tags.size!==inspection.tags.length)throw new Error('Ambiguous duplicate tag IDs');
  const ranges=mesh?.materialRanges??[];
  if(ranges.length>131072)throw new Error('Too many material sections to audit safely');
  const counts=new Map<number,{triangles:number;bsps:Set<number>}>();
  for(const range of ranges) {
    if(!Number.isSafeInteger(range.shaderTagId)||!Number.isSafeInteger(range.bspIndex)||range.bspIndex<0||range.bspIndex>15||
       !Number.isSafeInteger(range.indexStart)||!Number.isSafeInteger(range.indexCount)||
       range.indexStart<0||range.indexCount<0||range.indexCount%3!==0||
       range.indexStart+range.indexCount>(mesh?.indices.length??0)) throw new Error('Invalid BSP shader material section');
    if(!range.indexCount) continue;
    const curr=counts.get(range.shaderTagId)??{triangles:0,bsps:new Set<number>()};
    curr.triangles+=range.indexCount/3;curr.bsps.add(range.bspIndex);
    counts.set(range.shaderTagId,curr);
  }
  if(counts.size>16384)throw new Error('Shader count exceeds material audit bound');
  const shaders=[...counts].sort(([a],[b])=>a-b).map(([shaderTagId,info]):MaterialDependency=>{
    const tag=tags.get(shaderTagId);
    const bitmapRefs=(tag?.references??[]).filter(ref=>ref.class==='bitm'&&tags.get(ref.targetId)?.class==='bitm');
    const primaryRefs=bitmapRefs.filter(ref=>primaryLabel.test(ref.label.trim()));
    const primary=primaryRefs.length===1?tags.get(primaryRefs[0].targetId):undefined;
    const state=shaderState(tag,primary,primaryRefs.length);
    const otherBitmaps=bitmapRefs.filter(ref=>!primaryRefs.includes(ref))
      .map(ref=>({role:ref.label,tagId:ref.targetId,path:tags.get(ref.targetId)!.path}));
    return {shaderTagId,shaderClass:tag?.class??'unknown',shaderPath:tag?.path??'(tag missing)',
      status:state,bitmapTagId:state==='resolved'?primary!.id:null,
      bitmapPath:state==='resolved'?primary!.path:null,
      otherBitmaps,triangleCount:info.triangles,bspIndices:[...info.bsps].sort((a,b)=>a-b)};
  });
  const statuses=shaders.map(x=>x.status);
  return {schema:'guiltyspark-halo1-material-audit-v1',sourceSha256:inspection.sha256,engine:inspection.header.engine,
    cacheVersion:inspection.header.version,scope:'read-only-cache-metadata',
    summary:{renderMaterials:shaders.length,resolved:statuses.filter(x=>x==='resolved').length,
      missing:statuses.filter(x=>x==='missing').length,invalid:statuses.filter(x=>x==='invalid').length,
      unavailable:statuses.filter(x=>x==='unavailable').length,
      legacyUnverified:statuses.filter(x=>x==='legacy-unverified').length},
    shaders,
    notices:['Metadata audit only. No game pixels are included or redistributed.',
      'Only classic Halo PC/CE senv and soso primary dependencies have native read-only offsets.',
      'Resolved references are not proof of a decoded bitmap, shader blending, or a playable map.']};
}
