/** Conservative, source-only BSP cave endpoint analysis.
 * Detects candidate aligned tunnel mouths; NEVER asserts a welded BSP,
 * collision/pathfinding build, portal/PVS, lightmap, or successful gameplay.
 * Rotation order mirrors spark-core::quickforge::transform (Z, Y, X).
 */
import type { ForgeBrush, QuickForgeDocument } from './forge';
import type { Vec3 } from './types';
export interface CavePort { brushId: string; end: 'near'|'far'; center: Vec3; outward: Vec3; crossSection: [number,number]; steps: number }
export interface CaveJoinCandidate { first: CavePort; second: CavePort; distance: number; aligned: boolean; sameRadii: boolean; sameSegments: boolean; rimVerticesMatch: boolean; sourceWeldEligible: boolean; joinReady: false }
export interface CavePortReport { ports: CavePort[]; candidates: CaveJoinCandidate[]; weldedPairs: number; unpaired: CavePort[]; gameplayVerified: false; compileReady: false }
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const distance=(a:Vec3,b:Vec3)=>Math.hypot(...a.map((v,i)=>v-b[i]));
function rotate(v:Vec3, rotation:Vec3):Vec3 {
  const p:Vec3=[...v];
  for(let axis=2;axis>=0;axis--) {
    const [a,b]=axis===0?[1,2]:axis===1?[2,0]:[0,1];
    const x=p[a],c=Math.cos(rotation[axis]),s=Math.sin(rotation[axis]);
    p[a]=c*x-s*p[b];p[b]=s*x+c*p[b];
  }
  return p;
}
export function cavePorts(brush:ForgeBrush):CavePort[] {
  if(brush.kind!=='caveTunnel')return [];
  if(![...brush.position,...brush.rotation,...brush.dimensions].every(Number.isFinite) || brush.dimensions.some(v=>v<=0))
    throw new Error('Invalid cave source brush transforms');
  return ([-1,1] as const).map(sign=>{
    const local:Vec3=[0,sign*brush.dimensions[1]/2,0];
    const rot=rotate(local,brush.rotation);
    return {brushId:brush.id,end:sign<0?'near':'far',
      center:brush.position.map((v,i)=>v+rot[i]) as Vec3,
      outward:rotate([0,sign,0],brush.rotation),
      crossSection:[brush.dimensions[0]*.75,brush.dimensions[2]*.75] as [number,number],steps:brush.steps};
  });
}
function rimVertices(brush:ForgeBrush,end:'near'|'far',scale:number):string[] {
  const y=(end==='near'?-1:1)*brush.dimensions[1]/2;
  return Array.from({length:brush.steps},(_,i)=>{
    const angle=i*Math.PI*2/brush.steps;
    const point:Vec3=[brush.dimensions[0]*.5*scale*Math.cos(angle),y,brush.dimensions[2]*.5*scale*Math.sin(angle)];
    const rotated=rotate(point,brush.rotation);
    return rotated.map((n,k)=>Math.round((n+brush.position[k])*1e6)).join(',');
  }).sort();
}
/** Match the actual polygon rings rather than only comparing centers/radii. */
function identicalRims(a:ForgeBrush,ae:'near'|'far',b:ForgeBrush,be:'near'|'far'):boolean {
  if (a.steps!==b.steps) return false;
  return [1,.75].every(scale=>{
    const left=rimVertices(a,ae,scale),right=rimVertices(b,be,scale);
    return left.every((value,i)=>value===right[i]);
  });
}
export function analyzeCaveJoins(doc:Pick<QuickForgeDocument,'geometry'>):CavePortReport {
  const brushes=new Map(doc.geometry.filter(brush=>brush.kind==='caveTunnel').map(brush=>[brush.id,brush]));
  const ports=doc.geometry.filter(brush=>brush.kind==='caveTunnel').flatMap(cavePorts);
  const candidates:CaveJoinCandidate[]=[],viable=new Map<CavePort,number[]>();
  for(let i=0;i<ports.length;i++)for(let j=i+1;j<ports.length;j++) {
    const a=ports[i],b=ports[j];
    if(a.brushId===b.brushId)continue;
    const separation=distance(a.center,b.center);
    // Proximity is diagnostic. Welding is exact and fails closed.
    if(separation>0.02)continue;
    const aligned=dot(a.outward,b.outward)<-0.9999;
    const sameRadii=a.crossSection.every((v,k)=>Math.abs(v-b.crossSection[k])<0.005);
    const sameSegments=a.steps===b.steps;
    const first=brushes.get(a.brushId)!,second=brushes.get(b.brushId)!;
    const rimVerticesMatch=sameSegments && identicalRims(first,a.end,second,b.end);
    const result:CaveJoinCandidate={first:a,second:b,distance:separation,aligned,sameRadii,sameSegments,rimVerticesMatch,sourceWeldEligible:false,joinReady:false};
    const index=candidates.push(result)-1;
    if(separation<=0.001 && aligned && rimVerticesMatch) {
      viable.set(a,[...(viable.get(a)??[]),index]);
      viable.set(b,[...(viable.get(b)??[]),index]);
    }
  }
  const paired=new Set<CavePort>();
  for(const [index,c] of candidates.entries()) {
    if(viable.get(c.first)?.length===1 && viable.get(c.second)?.length===1 &&
      viable.get(c.first)?.[0]===index && viable.get(c.second)?.[0]===index) {
      c.sourceWeldEligible=true; paired.add(c.first);paired.add(c.second);
    }
  }
  return {ports,candidates,weldedPairs:candidates.filter(c=>c.sourceWeldEligible).length,
    unpaired:ports.filter(port=>!paired.has(port)),gameplayVerified:false,compileReady:false};
}
