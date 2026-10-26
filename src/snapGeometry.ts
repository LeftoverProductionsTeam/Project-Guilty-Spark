/** Opt-in source-geometry placement snapping for QuickForge.
 * Face snapping aligns rectangular, cardinally oriented authored brushes.
 * Cave snapping aligns *identical* opposite-facing polygon rings. It does not
 * edit a compiled BSP, connect room-to-cave CSG, or create game collision/PVS.
 */
import type { ForgeBrush } from './forge';
import type { Vec3 } from './types';
import { cavePorts, analyzeCaveJoins } from './caveJoinAnalysis.ts';
import { exactTerrainJoins, terrainSnapCandidates } from './terrainJoinAnalysis.ts';

export type SnapKind = 'face' | 'cave-rim' | 'terrain-edge';
export interface BrushSnap {
  position: Vec3;
  targetBrushId: string;
  kind: SnapKind;
  distance: number;
  axis: 'x' | 'y' | 'z' | 'rim';
}
const rectTypes = new Set(['box', 'wall', 'floor', 'platform']);
const between = (a: number, b: number, epsilon = 1e-5) => Math.abs(a - b) <= epsilon;
const dot = (a: Vec3,b: Vec3) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const distance = (a: Vec3,b: Vec3) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
function bounds(brush: ForgeBrush): [Vec3,Vec3] | null {
  if (!rectTypes.has(brush.kind)) return null;
  const values = [...brush.position, ...brush.rotation, ...brush.dimensions];
  if (!values.every(Number.isFinite) || brush.dimensions.some(n => n <= 0)) return null;
  if (!between(Math.sin(brush.rotation[0]),0) || !between(Math.sin(brush.rotation[1]),0)) return null;
  const turns=brush.rotation[2]/(Math.PI/2), rounded=Math.round(turns);
  if (!between(turns,rounded,1e-5)) return null;
  const dim = [...brush.dimensions] as Vec3;
  if (Math.abs(rounded) % 2 === 1) [dim[0],dim[1]]=[dim[1],dim[0]];
  return [brush.position.map((x,i)=>x-dim[i]/2) as Vec3, brush.position.map((x,i)=>x+dim[i]/2) as Vec3];
}
function candidateFaces(moving: ForgeBrush, target: ForgeBrush, limit: number): BrushSnap[] {
  const source = bounds(moving), fixed = bounds(target);
  if (!source || !fixed) return [];
  const results: BrushSnap[] = [];
  for (let axis=0;axis<3;axis++) {
    // Require actual positive projected overlap. Side-by-side corners are not faces.
    const others=[0,1,2].filter(i=>i!==axis);
    if (others.some(i=>Math.min(source[1][i],fixed[1][i]) - Math.max(source[0][i],fixed[0][i]) < 0.025)) continue;
    for (const side of [-1,1]) {
      const delta=side<0 ? fixed[0][axis]-source[1][axis] : fixed[1][axis]-source[0][axis];
      if (Math.abs(delta) > limit || Math.abs(delta) < 1e-7) continue;
      const position=[...moving.position] as Vec3;
      position[axis]+=delta;
      if (position.some(n=>!Number.isFinite(n)||Math.abs(n)>2048)) continue;
      results.push({position,targetBrushId:target.id,kind:'face',distance:Math.abs(delta),axis:(['x','y','z'] as const)[axis]});
    }
  }
  return results;
}
function candidateRims(moving:ForgeBrush,target:ForgeBrush,all:ForgeBrush[],limit:number): BrushSnap[] {
  if (moving.kind!=='caveTunnel' || target.kind!=='caveTunnel') return [];
  const found:BrushSnap[]=[];
  for (const a of cavePorts(moving)) for (const b of cavePorts(target)) {
    const offset:Vec3=[b.center[0]-a.center[0],b.center[1]-a.center[1],b.center[2]-a.center[2]];
    const d=Math.hypot(...offset);
    if (d<1e-7 || d>limit || dot(a.outward,b.outward)>-0.9999 || a.steps!==b.steps ||
        a.crossSection.some((r,i)=>!between(r,b.crossSection[i],0.005))) continue;
    const position=moving.position.map((v,i)=>v+offset[i]) as Vec3;
    if (position.some(v=>!Number.isFinite(v)||Math.abs(v)>2048)) continue;
    const relocated={...moving,position};
    // An exact ring match is mandatory, not just coincident centers/normals.
    // Check *all* authored caves to reject three-way/ambiguous mouths.
    const report=analyzeCaveJoins({geometry:[...all.filter(x=>x.id!==moving.id),relocated]});
    if (!report.candidates.some(c=>c.sourceWeldEligible &&
        new Set([c.first.brushId,c.second.brushId]).has(moving.id) &&
        new Set([c.first.brushId,c.second.brushId]).has(target.id))) continue;
    found.push({position,targetBrushId:target.id,kind:'cave-rim',distance:d,axis:'rim'});
  }
  return found;
}
/** Never silently choose between equally close, incompatible snap targets. */
export function snapBrushToAuthoredMesh(moving:ForgeBrush,geometry:ForgeBrush[],maxDistance=1.25):BrushSnap|null {
  if (!Number.isFinite(maxDistance)||maxDistance<=0||maxDistance>4) throw new Error('Snap reach must be within 0..4 world units');
  if (geometry.length>256) throw new Error('Snap exceeds the QuickForge brush safety limit');
  if (![...moving.position,...moving.rotation,...moving.dimensions].every(Number.isFinite))
    throw new Error('Cannot snap non-finite geometry');
  if (moving.locked) return null;
  const targets=geometry.filter(target=>target.id!==moving.id && target.visible);
  const candidates=targets.flatMap(target=>[
    ...candidateFaces(moving,target,maxDistance),
    ...candidateRims(moving,target,geometry,maxDistance),
    ...terrainSnapCandidates(moving,target,maxDistance).filter(item =>
      exactTerrainJoins([...geometry.filter(b=>b.id!==moving.id),{...moving,position:item.position}]).some(join =>
        new Set([join.firstId,join.secondId]).has(moving.id) && new Set([join.firstId,join.secondId]).has(target.id)))
      .map(item=>({position:item.position,targetBrushId:target.id,kind:'terrain-edge' as const,distance:item.distance,axis:item.axis})),
  ]).sort((a,b)=>a.distance-b.distance || a.targetBrushId.localeCompare(b.targetBrushId));
  if (!candidates.length) return null;
  const best=candidates[0];
  // A tie can represent different faces (or targets) and is ambiguous.
  if (candidates.some(c=>c!==best && Math.abs(c.distance-best.distance)<0.001 &&
      (c.targetBrushId!==best.targetBrushId || distance(c.position,best.position)>0.001))) return null;
  return best;
}
