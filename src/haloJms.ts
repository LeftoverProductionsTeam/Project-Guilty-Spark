/** Halo CE JMS 8200 source exporter for imported OBJ/inspected meshes.
 * Mirrors the established spark-core QuickForge JMS layout; never emits a compiled tag/cache.
 * Positions are converted from editor world units to Halo source centimetres.
 */
import type { MeshData } from './types';
import { assertInterchangePrecision } from './haloInterchangePrecision.ts';
import { inspectMeshTopology, validateSourceMesh } from './meshAssembly.ts';

export interface JmsSourceResult {
  text: string;
  vertices: number;
  triangles: number;
  materials: string[];
  topology: ReturnType<typeof inspectMeshTopology>;
  warnings: string[];
}
export type JmsSourceKind = 'model' | 'bsp-candidate';
const fmt=(n:number) => Number(Object.is(n,-0)?0:n).toFixed(6);
const materialName=(name:string) => (name.replace(/[^A-Za-z0-9_!#+-]/g,'_').slice(0,56)||'default');
interface Span { indexStart:number;indexCount:number;name:string }
function sourceSpans(mesh:MeshData):Span[] {
  const raw=mesh.materialRanges?.length
    ? mesh.materialRanges.map(p=>({indexStart:p.indexStart,indexCount:p.indexCount,name:`shader_${p.shaderTagId.toString(16)}`}))
    : mesh.parts?.length ? mesh.parts : [{indexStart:0,indexCount:mesh.indices.length,name:'default'}];
  const sorted=[...raw].sort((a,b)=>a.indexStart-b.indexStart);
  const spans:Span[]=[];let cursor=0;
  for(const part of sorted){
    if(!Number.isSafeInteger(part.indexStart)||!Number.isSafeInteger(part.indexCount)||part.indexStart<cursor||
       part.indexStart%3 || part.indexCount%3 || part.indexCount<=0 || part.indexStart+part.indexCount>mesh.indices.length)
      throw new Error('JMS requires non-overlapping material ranges aligned to triangles');
    if(part.indexStart>cursor) spans.push({indexStart:cursor,indexCount:part.indexStart-cursor,name:'unassigned'});
    spans.push({...part,name:materialName(part.name)});cursor=part.indexStart+part.indexCount;
  }
  if(cursor<mesh.indices.length) spans.push({indexStart:cursor,indexCount:mesh.indices.length-cursor,name:'unassigned'});
  return spans;
}
function meshNormals(mesh:MeshData):number[] {
  if(mesh.normals?.length===mesh.positions.length && mesh.normals.every(Number.isFinite)) {
    return Array.from({length:mesh.positions.length/3},(_,i)=>{
      const n=mesh.normals!.slice(i*3,i*3+3),len=Math.hypot(...n);
      if(len<1e-8) throw new Error('JMS vertex normal has zero length');
      return n.map(v=>v/len);
    }).flat();
  }
  const normals=Array(mesh.positions.length).fill(0);
  const p=(id:number) => mesh.positions.slice(id*3,id*3+3);
  for(let i=0;i<mesh.indices.length;i+=3){
    const ids=mesh.indices.slice(i,i+3),a=p(ids[0]),b=p(ids[1]),c=p(ids[2]);
    const u=a.map((v,j)=>b[j]-v),v=a.map((n,j)=>c[j]-n);
    const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    for(const id of ids)for(let j=0;j<3;j++)normals[id*3+j]+=cross[j];
  }
  for(let i=0;i<normals.length;i+=3){
    const n=normals.slice(i,i+3),len=Math.hypot(...n);
    if(len<1e-9) throw new Error('Cannot generate JMS normals at degenerate vertex');
    for(let j=0;j<3;j++)normals[i+j]/=len;
  }
  return normals;
}
/** A source candidate is only useful after Tool/Invader reports success and Halo loads it. */
export function exportMeshJms(mesh:MeshData,kind:JmsSourceKind='model'):JmsSourceResult {
  validateSourceMesh(mesh);
  assertInterchangePrecision(mesh,'jms');
  const topology=inspectMeshTopology(mesh);
  if(topology.degenerateTriangles || topology.nonManifoldEdges || topology.windingConflicts)
    throw new Error('JMS source contains degenerate or non-manifold/winding-conflicted geometry');
  if(kind==='bsp-candidate' && topology.boundaryEdges)
    throw new Error('BSP JMS candidate has open boundary edges; seal or weld source mesh before export');
  if(kind!=='model'&&kind!=='bsp-candidate')throw new Error('Unsupported JMS source kind');
  const spans=sourceSpans(mesh);
  const names:string[]=[],materialForTriangle:number[]=[];
  for(const s of spans){
    let idx=names.indexOf(s.name);
    if(idx<0){idx=names.push(s.name)-1;}
    if(names.length>256)throw new Error('JMS exceeds 256 unique material groups');
    for(let i=0;i<s.indexCount/3;i++)materialForTriangle.push(idx);
  }
  if(materialForTriangle.length!==mesh.indices.length/3)throw new Error('JMS material spans do not cover every triangle');
  const normals=meshNormals(mesh),uvs=mesh.uvs?.length===(mesh.positions.length/3)*2?mesh.uvs:null;
  const lines=['8200','0','1','frame','-1','-1','0\t0\t0\t1','0\t0\t0',String(names.length)];
  for(const name of names)lines.push(name,'<none>');
  lines.push('0','1','__unnamed',String(mesh.positions.length/3));
  for(let i=0;i<mesh.positions.length/3;i++){
    const p=mesh.positions.slice(i*3,i*3+3),n=normals.slice(i*3,i*3+3);
    lines.push('0',p.map(v=>fmt(v*100)).join('\t'),n.map(fmt).join('\t'),'-1','0',fmt(uvs?.[i*2]??0),fmt(uvs?.[i*2+1]??0),'0');
  }
  lines.push(String(mesh.indices.length/3));
  for(let i=0;i<mesh.indices.length;i+=3){
    lines.push('0',String(materialForTriangle[i/3]),mesh.indices.slice(i,i+3).join('\t'));
  }
  const text=lines.join('\n')+'\n';
  if(text.length>32*1024*1024)throw new Error('JMS source exceeds 32 MiB text limit');
  const warnings=[
    `JMS 8200 ${kind} SOURCE ONLY. Compile using an installed, compatible Halo Tool or Invader; no playable tag/map has been verified.`,
    `Source topology: ${topology.boundaryEdges} boundary edges. Source-tool validation does not prove collision, portals, lightmaps or runtime loading.`,
  ];
  if(!uvs) warnings.push('Missing texture coordinates were emitted as (0, 0).');
  if(!mesh.normals?.length) warnings.push('Normals were recomputed from triangle winding.');
  return {text,vertices:mesh.positions.length/3,triangles:mesh.indices.length/3,materials:names,topology,warnings};
}
