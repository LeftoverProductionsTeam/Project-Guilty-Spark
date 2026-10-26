/** Independent, bounded parser for Spark's OWN OBJ export format.
 * Verifies that emitted (six-decimal) coordinates and face references are
 * structurally equivalent to the source mesh. This is NOT an imported BSP,
 * a complete generic OBJ parser, material/UV fidelity proof, or Halo collision test.
 */
import type { MeshData } from './types';
export interface ObjSerializationReceipt {
  vertices:number;
  textureCoordinates:number;
  normals:number;
  triangles:number;
  exactSourceOrder:boolean;
  haloBspVerified:false;
}
const component=/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const parseCoordinates=(raw:string,expected:number):number[]=>{
  const chunks=raw.trim().split(/\s+/);
  if(chunks.length!==expected || !chunks.every(s=>component.test(s)))throw new Error('OBJ serialized source has malformed numeric components');
  const values=chunks.map(Number);
  if(!values.every(Number.isFinite))throw new Error('OBJ serialized source contains non-finite components');
  return values;
};
export function verifyOwnObjSerialization(mesh:MeshData,text:string):ObjSerializationReceipt {
  if(!mesh || !Array.isArray(mesh.positions) || !Array.isArray(mesh.indices) ||
     mesh.positions.length%3 || mesh.indices.length%3 || !mesh.indices.length ||
     text.length>32*1024*1024 || text.includes('\0'))throw new Error('Invalid or oversized OBJ verification input');
  const vertexCount=mesh.positions.length/3;
  const uvs=Array.isArray(mesh.uvs) && mesh.uvs.length===vertexCount*2 ? mesh.uvs : null;
  const normals=Array.isArray(mesh.normals) && mesh.normals.length===mesh.positions.length ? mesh.normals : null;
  let v=0,vt=0,vn=0,triangles=0;
  for(const raw of text.split('\n')){
    const line=raw.trim();
    if(!line || line.startsWith('#'))continue;
    if(line.startsWith('v ')){
      if(v>=vertexCount)throw new Error('OBJ contains extra serialized vertices');
      const parsed=parseCoordinates(line.slice(2),3);
      if(parsed.some((x,i)=>Math.abs(x-mesh.positions[v*3+i])>0.00000051))throw new Error('OBJ serialized coordinates changed unexpectedly');
      v++;continue;
    }
    if(line.startsWith('vt ')){
      if(!uvs || vt>=vertexCount)throw new Error('OBJ contains unexpected UV coordinates');
      const parsed=parseCoordinates(line.slice(3),2);
      if(parsed.some((x,i)=>Math.abs(x-uvs[vt*2+i])>0.00000051))throw new Error('OBJ serialized UV coordinates changed unexpectedly');
      vt++;continue;
    }
    if(line.startsWith('vn ')){
      if(!normals || vn>=vertexCount)throw new Error('OBJ contains unexpected normals');
      const parsed=parseCoordinates(line.slice(3),3);
      if(parsed.some((x,i)=>Math.abs(x-normals[vn*3+i])>0.00000051))throw new Error('OBJ serialized normals changed unexpectedly');
      vn++;continue;
    }
    if(line.startsWith('f ')){
      if(triangles>=mesh.indices.length/3)throw new Error('OBJ contains more faces than the source');
      const tokens=line.slice(2).trim().split(/\s+/);
      if(tokens.length!==3)throw new Error('OBJ contains a non-triangulated source face');
      for(let i=0;i<3;i++){
        const sourceIndex=mesh.indices[triangles*3+i]+1;
        const wanted=uvs&&normals?`${sourceIndex}/${sourceIndex}/${sourceIndex}`:
          uvs?`${sourceIndex}/${sourceIndex}`:normals?`${sourceIndex}//${sourceIndex}`:`${sourceIndex}`;
        if(tokens[i]!==wanted)throw new Error('OBJ face indices or attribute references differ from the source');
      }
      triangles++;continue;
    }
    if(/^(?:o|g|usemtl)\s+\S/.test(line))continue;
    throw new Error('OBJ contains an unexpected source record');
  }
  if(v!==vertexCount || vt!==(uvs?vertexCount:0) || vn!==(normals?vertexCount:0) ||
     triangles!==mesh.indices.length/3)throw new Error('OBJ serialized source is incomplete');
  return {vertices:v,textureCoordinates:vt,normals:vn,triangles,exactSourceOrder:true,haloBspVerified:false};
}
