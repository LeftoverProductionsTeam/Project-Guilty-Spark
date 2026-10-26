/**
 * Read-only, conservative association of a user-imported Halo 1 Tool WRL
 * diagnostic with an authored QuickForge source brush. This is a proximity
 * hint, NEVER proof of which source triangle caused a compiler error.
 *
 * Does not read/write files, mutate meshes, infer the original WRL's source
 * hash, repair collision, or claim a successful structure compilation.
 */
import type { ForgeMesh } from './forge';
import type { WrlDiagnostics } from './haloWrl';

type Vec3 = [number, number, number];
export interface WrlBrushCandidate {
  brushId: string;
  /** Number of sampled WRL segments/faces uniquely associated with this brush. */
  diagnosticSamples: number;
  closestDistance: number;
}
export interface WrlBrushAssociation {
  sampledPrimitives: number;
  totalPrimitives: number;
  ambiguousPrimitives: number;
  unmatchedPrimitives: number;
  candidates: WrlBrushCandidate[];
  note: string;
}
interface Bounds { id: string; min: Vec3; max: Vec3 }
const MAX_SAMPLES = 192;
const MAX_MATCH_DISTANCE_SQ = 0.25 ** 2;
// A point on the common boundary of two brushes is ambiguous, not a match.
const MIN_BETTER_THAN_NEXT_SQ = 1e-6;

function brushBounds(mesh: Pick<ForgeMesh,'positions'|'indices'|'parts'>): Bounds[] {
  if (!mesh || !Array.isArray(mesh.positions) || !Array.isArray(mesh.indices) ||
      !Array.isArray(mesh.parts) || !mesh.parts.length || mesh.parts.length > 256 ||
      mesh.positions.length % 3 || mesh.indices.length % 3 ||
      mesh.indices.length > 32000*3 || mesh.positions.length > 96000*3 ||
      !mesh.positions.every(n=>Number.isFinite(n) && Math.abs(n)<=2048) ||
      !mesh.indices.every(n=>Number.isSafeInteger(n) && n>=0 && n*3+2<mesh.positions.length))
    throw new Error('Cannot locate WRL errors against invalid or oversized source geometry');
  const byBrush = new Map<string,Bounds>();
  let end = 0;
  for(const part of mesh.parts) {
    if (!part || typeof part.brushId!=='string' || part.brushId.length<1 || part.brushId.length>128 ||
        !Number.isSafeInteger(part.indexStart) || !Number.isSafeInteger(part.indexCount) ||
        part.indexStart!==end || part.indexCount<3 || part.indexCount%3 ||
        part.indexStart+part.indexCount>mesh.indices.length)
      throw new Error('WRL-to-brush matching requires a complete, ordered source brush triangle inventory');
    end=part.indexStart+part.indexCount;
    let box = byBrush.get(part.brushId);
    if(!box){box={id:part.brushId,min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};byBrush.set(part.brushId,box);}
    for(let j=part.indexStart;j<end;j++) {
      const idx=mesh.indices[j]*3;
      for(let a=0;a<3;a++) {
        const v=mesh.positions[idx+a];
        box.min[a]=Math.min(box.min[a],v);
        box.max[a]=Math.max(box.max[a],v);
      }
    }
  }
  if(end!==mesh.indices.length)throw new Error('WRL-to-brush inventory does not cover all source triangles');
  return [...byBrush.values()];
}
function distanceSquared(p: Vec3, bounds: Bounds): number {
  let total=0;
  for(let i=0;i<3;i++) {
    const gap=p[i]<bounds.min[i]?bounds.min[i]-p[i]:p[i]>bounds.max[i]?p[i]-bounds.max[i]:0;
    total+=gap*gap;
  }
  return total;
}
function primitivePoints(wrl: WrlDiagnostics, i: number): Vec3[] {
  if (i < wrl.segments.length) {
    const edge = wrl.segments[i];
    return [edge.start,edge.end,edge.start.map((v,k)=>(v+edge.end[k])/2) as Vec3];
  }
  const face = wrl.faces[i - wrl.segments.length];
  return [face.a,face.b,face.c,face.a.map((v,k)=>(v+face.b[k]+face.c[k])/3) as Vec3];
}
export function matchWrlToSourceBrushes(
  mesh: Pick<ForgeMesh,'positions'|'indices'|'parts'>,
  wrl: Pick<WrlDiagnostics,'segments'|'faces'>,
): WrlBrushAssociation {
  // A parser-generated WRL has at most 75k geometry primitives; explicit
  // guards protect direct API callers too.
  if(!wrl || !Array.isArray(wrl.segments) || !Array.isArray(wrl.faces) ||
     wrl.segments.length+wrl.faces.length<1 || wrl.segments.length+wrl.faces.length>75000)
    throw new Error('WRL brush matching requires a bounded parsed Halo 1 Tool diagnostic');
  const bounds = brushBounds(mesh);
  const total = wrl.segments.length+wrl.faces.length;
  const stride = Math.max(1,Math.ceil(total/MAX_SAMPLES));
  const tally = new Map<string,{count:number;closest:number}>();
  let sampled=0,ambiguous=0,unmatched=0;
  for(let i=0;i<total;i+=stride){
    const points=primitivePoints(wrl as WrlDiagnostics,i);
    if(points.some(p=>!Array.isArray(p) || p.length!==3 ||
      p.some(v=>typeof v!=='number' || !Number.isFinite(v) || Math.abs(v)>100000))) {
      throw new Error('WRL diagnostic contains an unsafe coordinate');
    }
    sampled++;
    let best:Bounds|null=null, bestScore=Infinity, second=Infinity;
    for(const box of bounds) {
      const score=Math.min(...points.map(p=>distanceSquared(p,box)));
      if(score<bestScore) { second=bestScore;bestScore=score;best=box; }
      else if(score<second) second=score;
    }
    if(!best || bestScore>MAX_MATCH_DISTANCE_SQ) { unmatched++;continue; }
    if(second-bestScore<=MIN_BETTER_THAN_NEXT_SQ) { ambiguous++;continue; }
    const value=tally.get(best.id)??{count:0,closest:Infinity};
    value.count++;value.closest=Math.min(value.closest,Math.sqrt(bestScore));
    tally.set(best.id,value);
  }
  return {
    sampledPrimitives:sampled,totalPrimitives:total,ambiguousPrimitives:ambiguous,unmatchedPrimitives:unmatched,
    candidates:[...tally.entries()].map(([brushId,score])=>({brushId,diagnosticSamples:score.count,closestDistance:score.closest}))
      .sort((a,b)=>b.diagnosticSamples-a.diagnosticSamples || a.closestDistance-b.closestDistance || a.brushId.localeCompare(b.brushId))
      .slice(0,10),
    note:'WRL proximity to current brush axis-aligned bounds is a heuristic, not an exact triangle or compiler-error attribution. Ambiguous overlap is never auto-assigned. Confirm units, source identity and Halo Tool output; no geometry was changed.',
  };
}
