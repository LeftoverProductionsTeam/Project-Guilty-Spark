/** Exact source-heightfield seam analysis. Mirrors the guarded QuickForge Rust join.
 * An eligible join removes duplicate *source* perimeter walls; the engine must
 * still compile/validate its own collision, portals, lightmaps and visibility.
 */
import type { ForgeBrush, QuickForgeDocument } from './forge';
import type { Vec3 } from './types';
export type TerrainSide = 0 | 1 | 2 | 3; // x-, x+, y-, y+
export interface TerrainJoin {
  firstId:string;
  secondId:string;
  firstSide:TerrainSide;
  secondSide:TerrainSide;
}
const near=(a:number,b:number,eps=1e-5)=>Math.abs(a-b)<eps;
function eligible(b:ForgeBrush): boolean {
  return b.kind==='terrain' && b.steps>=2 && b.steps<=32 &&
    [...b.position,...b.rotation,...b.dimensions].every(Number.isFinite) &&
    b.rotation.every(v=>near(v,0)) && b.dimensions.every(v=>v>0) &&
    (b.heights?.length===0 || b.heights?.length===(b.steps+1)**2) &&
    (b.heights??[]).every(Number.isFinite);
}
function sample(b:ForgeBrush,side:TerrainSide,k:number):number {
  const n=b.steps;
  const i=side===0?0:side===1?n:k;
  const j=side===2?0:side===3?n:k;
  return b.heights?.[j*(n+1)+i]??0;
}
function sameSurface(a:ForgeBrush,sideA:TerrainSide,b:ForgeBrush,sideB:TerrainSide):boolean {
  if(a.steps!==b.steps || a.dimensions.some((v,i)=>!near(v,b.dimensions[i])) ||
      !near(a.position[2],b.position[2])) return false;
  for(let k=0;k<=a.steps;k++) if(!near(sample(a,sideA,k),sample(b,sideB,k))) return false;
  return true;
}
function touching(a:ForgeBrush,b:ForgeBrush):[TerrainSide,TerrainSide]|null {
  const dx=b.position[0]-a.position[0],dy=b.position[1]-a.position[1];
  if(near(dx,a.dimensions[0])&&near(dy,0))return [1,0];
  if(near(dx,-a.dimensions[0])&&near(dy,0))return [0,1];
  if(near(dy,a.dimensions[1])&&near(dx,0))return [3,2];
  if(near(dy,-a.dimensions[1])&&near(dx,0))return [2,3];
  return null;
}
/** Ambiguous three-way source seams are refused rather than falsely welded. */
export function exactTerrainJoins(geometry:ForgeBrush[]):TerrainJoin[] {
  if(geometry.length>256)throw new Error('Terrain source exceeds geometry safety bound');
  const matches:TerrainJoin[]=[];
  for(let i=0;i<geometry.length;i++) {
    const a=geometry[i];if(!eligible(a))continue;
    for(let j=i+1;j<geometry.length;j++) {
      const b=geometry[j];if(!eligible(b))continue;
      const sides=touching(a,b);if(!sides||!sameSurface(a,sides[0],b,sides[1]))continue;
      matches.push({firstId:a.id,secondId:b.id,firstSide:sides[0],secondSide:sides[1]});
    }
  }
  const count=(id:string,side:TerrainSide)=>matches.filter(m=>(m.firstId===id&&m.firstSide===side)||(m.secondId===id&&m.secondSide===side)).length;
  return matches.filter(m=>count(m.firstId,m.firstSide)===1&&count(m.secondId,m.secondSide)===1);
}
/** Required exact center for a moving terrain tile to meet a target by a full border. */
export function terrainSnapCandidates(moving:ForgeBrush,target:ForgeBrush,maxDistance:number):{position:Vec3;axis:'x'|'y';distance:number}[]{
  if(!eligible(moving)||!eligible(target)||moving.id===target.id||
      moving.steps!==target.steps||moving.dimensions.some((v,i)=>!near(v,target.dimensions[i]))||
      !near(moving.position[2],target.position[2]))return [];
  const moves:{position:Vec3;axis:'x'|'y';distance:number}[]=[];
  for(const [axis,sign] of [[0,-1],[0,1],[1,-1],[1,1]] as const) {
    const position=[...moving.position] as Vec3;
    position[axis]=target.position[axis]+sign*target.dimensions[axis];
    const change=Math.hypot(...position.map((v,i)=>v-moving.position[i]));
    if(change<1e-7||change>maxDistance)continue;
    const moved={...moving,position};
    const pair=touching(target,moved);
    if(!pair||!sameSurface(target,pair[0],moved,pair[1]))continue;
    moves.push({position,axis:axis===0?'x':'y',distance:change});
  }
  return moves;
}
export function describeTerrainJoins(document:QuickForgeDocument):string {
  const n=exactTerrainJoins(document.geometry).length;
  return `${n} exact terrain-source seam${n===1?'':'s'} · ${n?'internal walls omitted from generated source mesh':'no terrain source seams'} · NOT compiled Halo collision`;
}
