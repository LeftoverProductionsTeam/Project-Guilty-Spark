/** Non-destructive source mesh alignment and narrowly scoped topology welding.
 * No compiled Halo BSP is patched. Aligning surfaces is not collision/PVS/portal generation.
 */
import type { MeshData, Vec3 } from './types';

export type MeshSnapMode = 'face' | 'vertex';
export type FaceDirection = 'x+' | 'x-' | 'y+' | 'y-' | 'z+' | 'z-';
export interface MeshAlignment {
  mode: MeshSnapMode;
  translation: Vec3;
  description: string;
}
export interface MeshSnapOptions {
  mode: MeshSnapMode;
  face?: FaceDirection;
  targetVertex?: number;
  movingVertex?: number;
}
export interface MeshTopology {
  boundaryEdges: number;
  nonManifoldEdges: number;
  windingConflicts: number;
  degenerateTriangles: number;
  triangles: number;
}
export interface MeshAssembly {
  mesh: MeshData;
  alignment: MeshAlignment;
  weldedEdges: number;
  weldedVertices: number;
  topology: MeshTopology;
  warnings: string[];
}
const finite = (n: number) => Number.isFinite(n) && Math.abs(n) <= 1e7;
const vertex = (mesh: MeshData, i: number): Vec3 => mesh.positions.slice(i * 3, i * 3 + 3) as Vec3;
const add = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v + b[i]) as Vec3;
const subtract = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v - b[i]) as Vec3;
const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;
const key = (a: Vec3): string => a.map(v => Math.round(v * 100000)).join(':');
const edgeKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;

export function validateSourceMesh(mesh: MeshData): void {
  if (!mesh || !Array.isArray(mesh.positions) || !Array.isArray(mesh.indices) ||
      mesh.positions.length < 9 || mesh.positions.length % 3 || mesh.positions.length > 900000 ||
      mesh.indices.length < 3 || mesh.indices.length % 3 || mesh.indices.length > 450000 ||
      !mesh.positions.every(finite)) throw new Error('Mesh has invalid, extreme, or unsupported source vertices');
  const count = mesh.positions.length / 3;
  if (!mesh.indices.every(n => Number.isSafeInteger(n) && n >= 0 && n < count))
    throw new Error('Mesh index is out of bounds');
  for (const [label, arr, stride] of [['UVs', mesh.uvs, 2], ['normals', mesh.normals, 3]] as const) {
    if (arr !== undefined && (!Array.isArray(arr) || (arr.length !== 0 && arr.length !== count * stride) || !arr.every(finite)))
      throw new Error(`Invalid ${label} in source mesh`);
  }
  for (const part of mesh.parts ?? []) {
    if (!Number.isSafeInteger(part.indexStart) || !Number.isSafeInteger(part.indexCount) ||
        part.indexStart < 0 || part.indexCount <= 0 || part.indexStart % 3 || part.indexCount % 3 ||
        part.indexStart + part.indexCount > mesh.indices.length)
      throw new Error('Invalid source material part');
  }
}
function bounds(mesh: MeshData): [Vec3, Vec3] {
  const min: Vec3 = [Infinity,Infinity,Infinity], max: Vec3 = [-Infinity,-Infinity,-Infinity];
  for (let i=0; i<mesh.positions.length; i++) {
    const axis=i%3, v=mesh.positions[i];
    min[axis]=Math.min(min[axis],v); max[axis]=Math.max(max[axis],v);
  }
  return [min,max];
}
/** A deliberate side/axis selection eliminates guesswork between equally plausible faces. */
export function planMeshAlignment(fixed: MeshData, moving: MeshData, options: MeshSnapOptions): MeshAlignment {
  validateSourceMesh(fixed); validateSourceMesh(moving);
  if (options.mode === 'vertex') {
    const a=options.targetVertex ?? 0, b=options.movingVertex ?? 0;
    if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a<0 || b<0 ||
        a>=fixed.positions.length/3 || b>=moving.positions.length/3)
      throw new Error('Select existing source mesh vertex indices');
    const translation=subtract(vertex(fixed,a),vertex(moving,b));
    if (!translation.every(finite)) throw new Error('Vertex alignment exceeds supported coordinate range');
    return {mode:'vertex',translation,description:`Vertex ${b} aligned to target vertex ${a}`};
  }
  if (options.mode !== 'face' || !options.face || !/^[xyz][+-]$/.test(options.face))
    throw new Error('Select an explicit target face and snap mode');
  const axis='xyz'.indexOf(options.face[0]), positive=options.face[1]==='+';
  const [fmin,fmax]=bounds(fixed), [mmin,mmax]=bounds(moving);
  const translation:Vec3=[0,0,0];
  for (let i=0;i<3;i++) {
    translation[i] = i===axis
      ? (positive ? fmax[i]-mmin[i] : fmin[i]-mmax[i])
      : ((fmin[i]+fmax[i])-(mmin[i]+mmax[i]))/2;
  }
  if (!translation.every(finite)) throw new Error('Face alignment exceeds supported coordinate range');
  return {mode:'face',translation,description:`Moving mesh ${positive?'min':'max'} ${options.face[0].toUpperCase()} face snapped to target ${options.face}`};
}

interface Edge { a:number; b:number; direction:number; count:number }
function indexedEdges(mesh: MeshData, shift: Vec3=[0,0,0]): Map<string,Edge> {
  // First classify edges using actual source vertex INDICES, then use geometric
  // keys only to find a seam between two independent meshes. Coincident but
  // disconnected edges within one mesh are not a valid welding reference.
  const byIndex=new Map<string,Edge>();
  for (let i=0;i<mesh.indices.length;i+=3) {
    const triangle=mesh.indices.slice(i,i+3);
    for (const [a,b] of [[triangle[0],triangle[1]],[triangle[1],triangle[2]],[triangle[2],triangle[0]]]) {
      const identity=a<b?`${a}:${b}`:`${b}:${a}`;
      const direction=a<b?1:-1;
      const previous=byIndex.get(identity);
      if(previous) {previous.count++;previous.direction+=direction;}
      else byIndex.set(identity,{a,b,direction,count:1});
    }
  }
  const boundaries=new Map<string,Edge>();
  for (const edge of byIndex.values()) {
    if(edge.count!==1)continue;
    const pa=key(add(vertex(mesh,edge.a),shift)), pb=key(add(vertex(mesh,edge.b),shift));
    if(pa===pb)throw new Error('Coincident boundary vertices are not a valid seam');
    const identity=edgeKey(pa,pb);
    if(boundaries.has(identity))
      throw new Error('Ambiguous duplicate source boundary edges; resolve UV seams or duplicate vertices before welding');
    boundaries.set(identity,{...edge,direction:pa<pb?1:-1});
  }
  return boundaries;
}
export function inspectMeshTopology(mesh: MeshData): MeshTopology {
  validateSourceMesh(mesh);
  // Topology must be measured using actual shared vertex INDICES, not coincident
  // positions. Otherwise two snapped but un-welded meshes appear falsely sealed.
  const edges=new Map<string,{count:number;direction:number}>();
  for(let i=0;i<mesh.indices.length;i+=3){
    const [a,b,c]=mesh.indices.slice(i,i+3);
    for(const [u,v] of [[a,b],[b,c],[c,a]]){
      const identity=u<v?`${u}:${v}`:`${v}:${u}`;
      const direction=u<v?1:-1;
      const found=edges.get(identity);
      if(found){found.count++;found.direction+=direction;}
      else edges.set(identity,{count:1,direction});
    }
  }
  let degenerateTriangles=0;
  for (let i=0;i<mesh.indices.length;i+=3) {
    const [a,b,c]=mesh.indices.slice(i,i+3).map(j=>vertex(mesh,j));
    const u=subtract(b,a),v=subtract(c,a);
    const cross:Vec3=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    if (Math.hypot(...cross)<1e-9) degenerateTriangles++;
  }
  return {
    triangles:mesh.indices.length/3,
    boundaryEdges:[...edges.values()].filter(e=>e.count===1).length,
    nonManifoldEdges:[...edges.values()].filter(e=>e.count>2).length,
    windingConflicts:[...edges.values()].filter(e=>e.count===2 && e.direction!==0).length,
    degenerateTriangles,
  };
}
interface Part { name:string; indexStart:number; indexCount:number }
function safePartName(value:string):string { return value.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,56)||'material'; }
function groups(mesh:MeshData,prefix:string,offset:number):Part[] {
  const original=mesh.materialRanges?.length
    ? mesh.materialRanges.map(p=>({indexStart:p.indexStart,indexCount:p.indexCount,name:`shader_${p.shaderTagId.toString(16)}_lm${p.lightmapIndex}`}))
    : mesh.parts?.length ? mesh.parts : [{name:'surface',indexStart:0,indexCount:mesh.indices.length}];
  const sorted=[...original].sort((a,b)=>a.indexStart-b.indexStart);
  const output:Part[]=[]; let cursor=0;
  for (const part of sorted) {
    if (!Number.isSafeInteger(part.indexStart)||!Number.isSafeInteger(part.indexCount)||part.indexStart<cursor||
        part.indexStart%3 || part.indexCount%3 || part.indexCount<=0 || part.indexStart+part.indexCount>mesh.indices.length)
      throw new Error('Overlapping or invalid material group');
    if (part.indexStart>cursor) output.push({name:`${prefix}_unassigned`,indexStart:offset+cursor,indexCount:part.indexStart-cursor});
    output.push({name:`${prefix}_${safePartName(part.name)}`,indexStart:offset+part.indexStart,indexCount:part.indexCount});
    cursor=part.indexStart+part.indexCount;
  }
  if (cursor<mesh.indices.length) output.push({name:`${prefix}_unassigned`,indexStart:offset+cursor,indexCount:mesh.indices.length-cursor});
  return output;
}
function attributesCompatible(fixed:MeshData,a:number,moving:MeshData,b:number,tol:number):boolean {
  for (const [property,stride] of [['uvs',2],['normals',3]] as const) {
    const f=fixed[property],m=moving[property];
    const hasF=!!f?.length,hasM=!!m?.length;
    if (hasF!==hasM) return false;
    if (hasF && hasM && !Array.from({length:stride},(_,i)=>i).every(i=>near(f![a*stride+i],m![b*stride+i],tol))) return false;
  }
  return true;
}
function canonicalTriangles(mesh:MeshData,shift:Vec3=[0,0,0]):Set<string> {
  const out=new Set<string>();
  for(let i=0;i<mesh.indices.length;i+=3) out.add(mesh.indices.slice(i,i+3).map(n=>key(add(vertex(mesh,n),shift))).sort().join(';'));
  return out;
}
/** Only weld *open*, oppositely oriented matching boundary edges, with compatible UVs/normals.
 * Touching closed solids have no boundary edges and must be rebuilt via CSG/Tool instead.
 */
export function assembleSourceMeshes(fixed:MeshData,moving:MeshData,options:MeshSnapOptions,weld=false):MeshAssembly {
  const alignment=planMeshAlignment(fixed,moving,options);
  const originalA=inspectMeshTopology(fixed), originalB=inspectMeshTopology(moving);
  const translation=alignment.translation, fixedCount=fixed.positions.length/3;
  const movedPositions=moving.positions.map((v,i)=>v+translation[i%3]);
  if (!movedPositions.every(finite) || fixedCount + moving.positions.length/3>300000 ||
      fixed.indices.length+moving.indices.length>450000)
    throw new Error('Joined geometry exceeds safe OBJ/JMS export size');
  const mesh:MeshData={
    label:'Aligned source mesh assembly (not a compiled Halo BSP)',source:'user-assembled-source',
    positions:[...fixed.positions,...movedPositions],
    indices:[...fixed.indices,...moving.indices.map(n=>n+fixedCount)],
    parts:[...groups(fixed,'target',0),...groups(moving,'moving',fixed.indices.length)],
  };
  const warnings:string[]=[];
  if (fixed.uvs?.length===fixedCount*2 && moving.uvs?.length===(moving.positions.length/3)*2)
    mesh.uvs=[...fixed.uvs,...moving.uvs];
  else warnings.push('One mesh lacks complete UVs; assembly OBJ will omit all UV coordinates.');
  if (fixed.normals?.length===fixedCount*3 && moving.normals?.length===moving.positions.length)
    mesh.normals=[...fixed.normals,...moving.normals];
  else warnings.push('One mesh lacks complete normals; assembly OBJ will omit normals.');
  let weldedEdges=0,weldedVertices=0;
  if (weld) {
    if (originalA.nonManifoldEdges||originalB.nonManifoldEdges||originalA.windingConflicts||originalB.windingConflicts||originalA.degenerateTriangles||originalB.degenerateTriangles)
      throw new Error('Welding requires non-degenerate, consistently wound input meshes');
    const leftBoundary=indexedEdges(fixed),rightBoundary=indexedEdges(moving,translation);
    const pairs=new Map<number,number>();
    const targetTriangles=canonicalTriangles(fixed), movedTriangles=canonicalTriangles(moving,translation);
    if ([...movedTriangles].some(t=>targetTriangles.has(t)))
      throw new Error('Coincident triangles require explicit CSG face removal, not boundary welding');
    for (const [edgeId,b] of rightBoundary) {
      const a=leftBoundary.get(edgeId);
      if (!a) continue;
      if (a.direction+b.direction!==0) throw new Error('Matching boundary edges have identical winding; reverse the source mesh before welding');
      const find = (movingIndex:number):number => {
        const point=key(add(vertex(moving,movingIndex),translation));
        for (const index of [a.a,a.b]) if(key(vertex(fixed,index))===point)return index;
        throw new Error('Boundary seam has mismatched positions');
      };
      for (const candidate of [b.a,b.b]) {
        const resolved=find(candidate);
        if(!attributesCompatible(fixed,resolved,moving,candidate,0.00002))
          throw new Error('Boundary has incompatible UVs or normals; export aligned OBJ without welding');
        if(pairs.has(candidate)&&pairs.get(candidate)!==resolved) throw new Error('Ambiguous seam vertex correspondence');
        pairs.set(candidate,resolved);
      }
      weldedEdges++;
    }
    if (!weldedEdges) throw new Error('No opposite-facing open boundary edges coincide; closed BSP faces cannot be automatically welded');
    weldedVertices=pairs.size;
    const indices=mesh.indices.map((index,i)=>i<fixed.indices.length?index:(pairs.get(index-fixedCount)??index));
    // The source mesh can reuse a destination vertex, but disconnected vertices are compacted.
    const used=new Set(indices),renumber=new Map<number,number>();
    const positions:number[]=[], uvs:number[]=[],normals:number[]=[];
    for(let index=0;index<mesh.positions.length/3;index++) if(used.has(index)) {
      renumber.set(index,positions.length/3);
      positions.push(...mesh.positions.slice(index*3,index*3+3));
      if(mesh.uvs) uvs.push(...mesh.uvs.slice(index*2,index*2+2));
      if(mesh.normals) normals.push(...mesh.normals.slice(index*3,index*3+3));
    }
    mesh.positions=positions;mesh.indices=indices.map(n=>renumber.get(n)!);
    if(mesh.uvs)mesh.uvs=uvs;
    if(mesh.normals)mesh.normals=normals;
  }
  const topology=inspectMeshTopology(mesh);
  if (weld && (topology.nonManifoldEdges||topology.windingConflicts||topology.degenerateTriangles ||
      topology.boundaryEdges >= originalA.boundaryEdges+originalB.boundaryEdges))
    throw new Error('Combined seam fails topology verification; source meshes were not modified');
  warnings.push(weld
    ? `Welded ${weldedEdges} compatible source boundary edges; ${topology.boundaryEdges} open edges remain. Halo collision/portals still require compilation.`
    : 'Alignment only. No vertices or faces were welded; use source geometry tools before compiling a playable BSP.');
  return {mesh,alignment,weldedEdges,weldedVertices,topology,warnings};
}
