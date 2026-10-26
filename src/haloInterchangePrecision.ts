/** Source OBJ/JMS round-trip precision guard, not a native Halo collision test.
 * These serializers emit six decimals. Check the actual quantized coordinates
 * BEFORE handing them to an importer so a tiny triangle cannot silently
 * collapse into a zero-area face. The original mesh and game tags are read-only.
 */
import type { MeshData } from './types';
export type SourceInterchangeKind = 'obj'|'jms';
export interface InterchangePrecisionReview {
  format: SourceInterchangeKind;
  triangles: number;
  quantizedVertices: number;
  lostTriangles: number;
  outOfBoundsVertices: number;
  exportSafe: boolean;
  runtimeCollisionVerified: false;
}
const fmt=(v:number,scale:number)=>Number((v*scale).toFixed(6));
export function auditInterchangePrecision(mesh:MeshData,format:SourceInterchangeKind):InterchangePrecisionReview {
  if(format!=='obj' && format!=='jms')throw new Error('Unsupported geometry interchange format');
  if(!mesh || !Array.isArray(mesh.positions) || !Array.isArray(mesh.indices) || !mesh.indices.length ||
     mesh.positions.length<9 || mesh.positions.length%3 || mesh.indices.length%3 ||
     mesh.indices.length>450000 || mesh.positions.length>900000 ||
     !mesh.positions.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e7) ||
     !mesh.indices.every(n=>Number.isSafeInteger(n)&&n>=0&&n<mesh.positions.length/3))
    throw new Error('Interchange precision audit requires valid bounded mesh arrays');
  const scale=format==='obj'?1:100;
  const vertexCount=mesh.positions.length/3;
  const points:Array<[number,number,number]> = [];
  let outOfBoundsVertices=0;
  for(let i=0;i<mesh.positions.length;i+=3){
    const original=mesh.positions.slice(i,i+3);
    if(format==='jms' && original.some(n=>Math.abs(n)>1500))outOfBoundsVertices++;
    points.push(original.map(n=>fmt(n,scale)) as [number,number,number]);
  }
  let lostTriangles=0;
  for(let i=0;i<mesh.indices.length;i+=3){
    const [a,b,c]=mesh.indices.slice(i,i+3).map(index=>points[index]);
    const u=a.map((n,j)=>b[j]-n),v=a.map((n,j)=>c[j]-n);
    const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    if(Math.hypot(...cross)<=1e-12 ||
       [Math.hypot(...u),Math.hypot(...v),Math.hypot(...b.map((n,j)=>c[j]-n))].some(n=>n<(format==='jms' ? 0.1 : 1e-6)))lostTriangles++;
  }
  const report={format,triangles:mesh.indices.length/3,quantizedVertices:vertexCount,
    lostTriangles,outOfBoundsVertices,exportSafe:!lostTriangles && !outOfBoundsVertices,
    runtimeCollisionVerified:false as const};
  return report;
}
export function assertInterchangePrecision(mesh:MeshData,format:SourceInterchangeKind):void {
  const r=auditInterchangePrecision(mesh,format);
  if(r.outOfBoundsVertices)throw new Error(`HALO_VERTEX_BOUNDS: ${r.outOfBoundsVertices} JMS vertices are outside Halo 1's ±1500-world-unit BSP range`);
  if(r.lostTriangles)throw new Error(`${format.toUpperCase()} round-trip precision would collapse ${r.lostTriangles} degenerate triangle(s) from quantization or sub-0.1-JMS-unit edges; rescale/retriangulate before exporting`);
}
