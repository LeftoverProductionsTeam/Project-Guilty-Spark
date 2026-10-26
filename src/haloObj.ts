/** Read-only OBJ geometry exporter for inspected Halo caches and user OBJ assets.
 * No game data is bundled; the caller explicitly selects a local mesh.
 * Shader IDs are diagnostic names, NOT actual decoded game materials.
 */
import type { MeshData } from './types';
import { assertInterchangePrecision } from './haloInterchangePrecision.ts';
import { verifyOwnObjSerialization } from './haloObjRoundTrip.ts';
export interface MeshObjExport { text:string; vertices:number; triangles:number; groups:number; includesUvs:boolean; includesNormals:boolean; }
const name=(input:string) => input.replace(/[^A-Za-z0-9_-]+/g,'_').slice(0,60)||'mesh';
function finite(v:number):string {
  if (!Number.isFinite(v) || Math.abs(v)>1e8) throw new Error('Invalid or extreme mesh coordinate');
  return (Object.is(v,-0) ? 0 : Number(v.toFixed(6))).toString();
}
export function exportMeshObj(mesh:MeshData,requestedName='halo_inspected_mesh'):MeshObjExport {
  if (!mesh || !Array.isArray(mesh.positions) || !Array.isArray(mesh.indices) ||
      mesh.positions.length<9 || mesh.positions.length%3!==0 || mesh.positions.length>900_000 ||
      mesh.indices.length<3 || mesh.indices.length%3!==0 || mesh.indices.length>450_000)
    throw new Error('OBJ export requires bounded, triangulated mesh data');
  const vertices=mesh.positions.length/3, triangles=mesh.indices.length/3;
  // Do not silently discard damaged UV/normal arrays. Unavailable attributes
  // may be absent, but present nonempty attributes must be complete and valid.
  if ((mesh.uvs !== undefined && (!Array.isArray(mesh.uvs) || (mesh.uvs.length && mesh.uvs.length !== vertices*2))) ||
      (mesh.normals !== undefined && (!Array.isArray(mesh.normals) || (mesh.normals.length && mesh.normals.length !== vertices*3))))
    throw new Error('Incomplete or corrupt mesh UV/normal buffers; export refused');
  const hasUvs=Array.isArray(mesh.uvs) && mesh.uvs.length===vertices*2;
  const hasNormals=Array.isArray(mesh.normals) && mesh.normals.length===vertices*3;
  if (!mesh.indices.every(i=>Number.isSafeInteger(i) && i>=0 && i<vertices)) throw new Error('Invalid mesh vertex index');
  for (let i=0;i<mesh.indices.length;i+=3) {
    if (new Set(mesh.indices.slice(i,i+3)).size !== 3) throw new Error('Degenerate OBJ triangle references duplicate vertex indices');
  }
  if (mesh.positions.some(p=>!Number.isFinite(p) || Math.abs(p)>1e8)) throw new Error('Invalid or extreme mesh coordinate');
  assertInterchangePrecision(mesh,'obj');
  const lines=[
    '# Project Guilty Spark - read-only local geometry export',
    '# Not a verified Halo compiler input; shaders are IDs, not extracted materials.',
    `o ${name(requestedName)}`,
  ];
  for (let i=0;i<mesh.positions.length;i+=3) lines.push(`v ${finite(mesh.positions[i])} ${finite(mesh.positions[i+1])} ${finite(mesh.positions[i+2])}`);
  if (hasUvs) for (let i=0;i<mesh.uvs!.length;i+=2) lines.push(`vt ${finite(mesh.uvs![i])} ${finite(mesh.uvs![i+1])}`);
  if (hasNormals) for (let i=0;i<mesh.normals!.length;i+=3) lines.push(`vn ${finite(mesh.normals![i])} ${finite(mesh.normals![i+1])} ${finite(mesh.normals![i+2])}`);
  // Material ranges are validated, not guessed or interpolated across missing data.
  const spans = (mesh.materialRanges?.length
    ? mesh.materialRanges.map(span=>({start:span.indexStart,count:span.indexCount,label:`shader_${span.shaderTagId.toString(16)}_bsp${span.bspIndex}_lm${span.lightmapIndex}`}))
    : (mesh.parts ?? []).map(part=>({start:part.indexStart,count:part.indexCount,label:`part_${part.name}`})))
    .sort((a,b)=>a.start-b.start);
  let end=0;
  for (const span of spans) {
    if (!Number.isSafeInteger(span.start)||!Number.isSafeInteger(span.count)||span.count<=0||
        span.start%3!==0||span.count%3!==0||span.start<end||span.start+span.count>mesh.indices.length||
        span.label.length>256)
      throw new Error('Invalid/overlapping surface group range in inspected source');
    end=span.start+span.count;
  }
  let cursor=0, groups=0;
  const writeFaces=(from:number,to:number,group:string) => {
    if (from>=to) return;
    lines.push(`g ${name(group)}`);
    lines.push(`usemtl ${name(group)}`); // name-only; never claims real game texture payload
    for (let i=from;i<to;i+=3) {
      const face=mesh.indices.slice(i,i+3).map(k=>{
        const n=k+1;
        return hasUvs && hasNormals?`${n}/${n}/${n}`:hasUvs?`${n}/${n}`:hasNormals?`${n}//${n}`:`${n}`;
      });
      lines.push(`f ${face.join(' ')}`);
    }
    groups++;
  };
  for (const span of spans) {
    writeFaces(cursor,span.start,'unassigned_surface');
    writeFaces(span.start,span.start+span.count,span.label);
    cursor=span.start+span.count;
  }
  writeFaces(cursor,mesh.indices.length,spans.length?'unassigned_surface':'geometry');
  const text=lines.join('\n')+'\n';
  if (text.length>32*1024*1024) throw new Error('OBJ export exceeds 32 MiB limit');
  verifyOwnObjSerialization(mesh,text); // Fail before returning a damaged interchange artifact.
  return {text,vertices,triangles,groups,includesUvs:hasUvs,includesNormals:hasNormals};
}
