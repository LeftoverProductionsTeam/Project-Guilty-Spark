/** Bounded, non-destructive compiled Halo 1 BSP *preview* audit.
 *
 * This evaluates the vertices, triangles, material attribution and optional
 * secondary UVs already returned by the native read-only parser. It does not
 * reconstruct collision, diagnose portals/PVS, or establish map playability.
 * It intentionally exports only identity hashes, counts, tag IDs and known
 * diagnostic codes; never source paths, game pixels, mesh positions or logs.
 *
 * Reference: https://c20.reclaimers.net/h1/tags/scenario_structure_bsp/
 */
import type {MapInspection, MeshData} from './types';

export type BspAuditSeverity = 'error' | 'warning' | 'info';
export interface BspAuditFinding {
  severity: BspAuditSeverity;
  code: string;
  message: string;
  bspIndex: number | null;
  shaderTagId: number | null;
}
export interface BspRenderAudit {
  schema: 'guiltyspark-bsp-render-audit/v1';
  scope: 'read-only-compiled-preview';
  sourceSha256: string;
  cacheVersion: number;
  checked: { vertices: number; triangles: number; materialRanges: number; shaderTags: number;
    coveredTriangles: number; unassignedTriangles: number; degenerateTriangles: number;
    lightmapPages: number; realUvSections: number; sectionsMissingUv: number; };
  summary: {errors:number;warnings:number;infos:number;omittedFindings:number};
  findings: BspAuditFinding[];
  acceptance: {
    sourceIndependentlyRehashed: false;
    gameplayCollisionVerified: false;
    bspPortalsAndPvsVerified: false;
    bakedLightmapsVerifiedInEngine: false;
    toolCompiledOrPlayable: false;
  };
  notice: string;
}

const MAX_AUDIT_TRIANGLES=250_000;
const MAX_AUDIT_RANGES=16_384;
const MAX_FINDINGS=128;
const EPSILON_SQUARED=1e-12; // cross-product magnitude squared, world units^4

export function auditHaloBspRender(inspection:Pick<MapInspection,'sha256'|'header'|'tags'>,
  mesh:MeshData | null | undefined):BspRenderAudit {
  if(!/^[a-f\d]{64}$/i.test(inspection?.sha256 ?? '')) throw new Error('BSP audit needs an inspected SHA-256 source');
  if(!mesh?.materialRanges?.length) throw new Error('No source-attributed BSP material ranges are available');
  const vertices=mesh.positions?.length/3, triangles=mesh.indices?.length/3;
  if(!Number.isSafeInteger(vertices)||vertices<3||vertices>MAX_AUDIT_TRIANGLES*3 ||
     !Number.isSafeInteger(triangles)||triangles<1||triangles>MAX_AUDIT_TRIANGLES ||
     mesh.materialRanges.length>MAX_AUDIT_RANGES ||
     !mesh.positions.every(n=>Number.isFinite(n)&&Math.abs(n)<100_000))
    throw new Error('BSP render buffers are missing, malformed, or above the bounded audit budget');
  if(!Array.isArray(inspection.tags) || inspection.tags.length>131_072)
    throw new Error('BSP audit tag table exceeds its bounded inspection limit');
  const tags=new Map(inspection.tags.map(t=>[t.id,t]));
  if(tags.size!==inspection.tags.length)throw new Error('Duplicate tag IDs prevent reliable BSP attribution');
  const findings:BspAuditFinding[]=[];
  const findingCounts={errors:0,warnings:0,infos:0,omittedFindings:0};
  const add=(severity:BspAuditSeverity,code:string,message:string,
    bspIndex:number|null=null,shaderTagId:number|null=null) => {
    if(severity==='error')findingCounts.errors++;
    else if(severity==='warning')findingCounts.warnings++;
    else findingCounts.infos++;
    if(findings.length<MAX_FINDINGS)findings.push({severity,code,message,bspIndex,shaderTagId});
    else findingCounts.omittedFindings++;
  };
  const hasUvs=mesh.uvs?.length===vertices*2 && mesh.uvs.every(n=>Number.isFinite(n)&&Math.abs(n)<=100_000);
  if(!hasUvs)add('warning','BSP_PRIMARY_UVS_UNAVAILABLE','Source primary texture UV array is unavailable or malformed.');
  const hasLightmapUvs=mesh.lightmapUvs?.length===vertices*2 && mesh.lightmapUvs.every(n=>Number.isFinite(n)&&Math.abs(n)<=32);
  if(mesh.lightmapUvs?.length && !hasLightmapUvs)
    add('warning','BSP_LIGHTMAP_UV_BUFFER_INVALID','Secondary UV array is incomplete or contains invalid values.');
  let degenerateTriangles=0;
  for(let i=0;i<mesh.indices.length;i+=3){
    const [a,b,c]=mesh.indices.slice(i,i+3);
    if(![a,b,c].every(n=>Number.isSafeInteger(n)&&n>=0&&n<vertices))
      throw new Error(`BSP render index buffer escaped its declared vertices near triangle ${i/3}`);
    const ax=mesh.positions[a*3], ay=mesh.positions[a*3+1], az=mesh.positions[a*3+2];
    const ux=mesh.positions[b*3]-ax, uy=mesh.positions[b*3+1]-ay, uz=mesh.positions[b*3+2]-az;
    const vx=mesh.positions[c*3]-ax, vy=mesh.positions[c*3+1]-ay, vz=mesh.positions[c*3+2]-az;
    const cx=uy*vz-uz*vy, cy=uz*vx-ux*vz, cz=ux*vy-uy*vx;
    if(a===b||b===c||a===c || (cx*cx+cy*cy+cz*cz)<EPSILON_SQUARED)degenerateTriangles++;
  }
  if(degenerateTriangles)add('warning','BSP_DEGENERATE_RENDER_TRIANGLES',
    `${degenerateTriangles} render triangles have zero/near-zero area. Confirm the geometry with Halo Tool; display surfaces are not collision.`);
  const ranges=[...mesh.materialRanges].sort((a,b)=>a.indexStart-b.indexStart);
  let coveredTriangles=0, unassignedTriangles=0, nextIndex=0, realUvSections=0, sectionsMissingUv=0;
  const shaders=new Set<number>();
  const pages=new Map<string,{id:number|null;hasUv:boolean}>();
  for (const range of ranges) {
    if(!Number.isSafeInteger(range.indexStart)||range.indexStart<0||range.indexStart%3 ||
       !Number.isSafeInteger(range.indexCount)||range.indexCount<=0||range.indexCount%3 ||
       range.indexStart+range.indexCount>mesh.indices.length ||
       !Number.isSafeInteger(range.bspIndex)||range.bspIndex<0||range.bspIndex>255 ||
       !Number.isSafeInteger(range.shaderTagId)||range.shaderTagId<0 ||range.shaderTagId>0xffffffff)
      throw new Error('BSP material range contains untrusted/overrunning metadata');
    if(range.indexStart<nextIndex)throw new Error('Overlapping source BSP material ranges cannot be reliably audited');
    if(range.indexStart>nextIndex)unassignedTriangles+=(range.indexStart-nextIndex)/3;
    nextIndex=range.indexStart+range.indexCount;
    coveredTriangles+=range.indexCount/3;
    shaders.add(range.shaderTagId);
    const tag=tags.get(range.shaderTagId);
    if(!tag)add('warning','BSP_SHADER_TAG_MISSING','A material references a shader tag absent from the inspected tag table.',range.bspIndex,range.shaderTagId);
    else if(tag.class==='soso')add('warning','BSP_MODEL_SHADER_ON_WORLD',
      'A BSP material uses shader_model; Halo 1 world BSP surfaces normally require shader_environment or supported transparent shader classes.',range.bspIndex,range.shaderTagId);
    else if(!['senv','soso','schi','scex','sgla','swat','sotr','smet'].includes(tag.class))
      add('info','BSP_SHADER_CLASS_UNVERIFIED',`Shader class ${String(tag.class).slice(0,8)} requires engine-specific review.`,range.bspIndex,range.shaderTagId);
    if((range.lightmapPage??-1)>=0){
      const page=range.lightmapPage!;
      if(!Number.isSafeInteger(page)||page>255)throw new Error('BSP lightmap page index is malformed');
      const key=`${range.bspIndex}:${page}`;
      const id=range.lightmapBitmapTagId??null;
      if(id!==null&&(!Number.isSafeInteger(id)||id<0||id>0xffffffff))throw new Error('BSP lightmap tag ID is malformed');
      const previous=pages.get(key);
      if(previous && previous.id!==id)add('error','BSP_LIGHTMAP_PAGE_CONFLICT',
        `BSP ${range.bspIndex} page ${page} refers to inconsistent bitmap tag IDs between material sections.`,range.bspIndex,range.shaderTagId);
      else pages.set(key,{id,hasUv:!!range.hasLightmapUvs});
      if(range.hasLightmapUvs){
        if(!hasLightmapUvs)add('error','BSP_LIGHTMAP_UVS_UNTRUSTED',
          'A material claims secondary UVs but its full native vertex UV buffer was not validated.',range.bspIndex,range.shaderTagId);
        else realUvSections++;
      }else sectionsMissingUv++;
      if(id===null || tags.get(id)?.class!=='bitm')add('warning','BSP_LIGHTMAP_BITMAP_UNRESOLVED',
        'Compiled lightmap page has no exact bitmap-tag identity in the inspected cache.',range.bspIndex,range.shaderTagId);
    }
  }
  if(nextIndex<mesh.indices.length)unassignedTriangles+=(mesh.indices.length-nextIndex)/3;
  if(unassignedTriangles)add('info','BSP_UNASSIGNED_RENDER_TRIANGLES',
    `${unassignedTriangles} triangles have no material attribution from the supported parser; they use the editor fallback color.`);
  if(sectionsMissingUv)add('warning','BSP_LIGHTMAP_SECTIONS_WITHOUT_UVS',
    `${sectionsMissingUv} material sections reference a lightmap page but have no verified secondary UVs. This can reflect an unsupported or unlit cache layout.`);
  if(!pages.size)add('info','BSP_NO_LIGHTMAP_PAGES',
    'No source-proven lightmap pages were detected. Some materials are intentionally unlit; actual Halo visibility needs native evidence.');
  const summary=findingCounts;
  return {schema:'guiltyspark-bsp-render-audit/v1',scope:'read-only-compiled-preview',
    sourceSha256:inspection.sha256,cacheVersion:inspection.header.version,
    checked:{vertices,triangles,materialRanges:ranges.length,shaderTags:shaders.size,
      coveredTriangles,unassignedTriangles,degenerateTriangles,lightmapPages:pages.size,realUvSections,sectionsMissingUv},
    summary,findings,
    acceptance:{sourceIndependentlyRehashed:false,gameplayCollisionVerified:false,
      bspPortalsAndPvsVerified:false,bakedLightmapsVerifiedInEngine:false,toolCompiledOrPlayable:false},
    notice:'Read-only viewport data, not a live Halo BSP inspection. A clean report does not certify shader rendering, collision, portals, radiosity or a playable map.'};
}
