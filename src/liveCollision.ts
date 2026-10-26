/** Deterministic, bounded collision sandbox for QuickForge's actual generated
 * source triangles. This is NOT Halo's compiled physics, collision BSP, PVS,
 * or a live connection to the game process. No game files are modified.
 */
import type { ForgeMesh } from './forge';
import type { Vec3 } from './types';

const CELL = 4;
const RADIUS = 0.32;
const EYE = 1.62;
const BODY_OFFSETS = [0.34, 0.91, 1.43] as const;
const MAX_TRIANGLES = 40000;
const MAX_REFERENCES = 450000;
const EPS = 1e-8;
type Triangle = { a: Vec3; b: Vec3; c: Vec3; normal: Vec3 };
export interface SourceCollisionWorld {
  triangles: Triangle[];
  cells: Map<string, number[]>;
  cellSize: number;
  triangleCount: number;
  /** The generator supplies source geometry, not Halo's collision tags. */
  gameCollisionCompiled: false;
}
export interface WalkState {
  feet: Vec3;
  verticalSpeed: number;
  grounded: boolean;
  contacts: number;
}
export const WALK_EYE_HEIGHT = EYE;
const add = (a:Vec3,b:Vec3):Vec3 => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub = (a:Vec3,b:Vec3):Vec3 => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const mul = (a:Vec3,s:number):Vec3 => [a[0]*s,a[1]*s,a[2]*s];
const dot = (a:Vec3,b:Vec3) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a:Vec3,b:Vec3):Vec3 => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm = (v:Vec3):Vec3 => { const d=Math.hypot(...v);return d<EPS?[0,0,1]:mul(v,1/d); };
const key = (x:number,y:number,z:number) => `${x},${y},${z}`;
const finite = (v:number) => Number.isFinite(v)&&Math.abs(v)<2048;

/** Reject unreasonable sources before building the spatial grid. */
export function createSourceCollisionWorld(mesh: Pick<ForgeMesh,'positions'|'indices'>): SourceCollisionWorld {
  if (mesh.positions.length%3 || mesh.indices.length%3 || mesh.indices.length/3>MAX_TRIANGLES ||
      mesh.positions.length/3>MAX_TRIANGLES*3 || !mesh.positions.every(finite)) {
    throw new Error('Source collision mesh is malformed or exceeds the preview budget');
  }
  const triangles:Triangle[]=[];
  const cells=new Map<string,number[]>();
  let references=0;
  for(let i=0;i<mesh.indices.length;i+=3){
    const ids=mesh.indices.slice(i,i+3);
    if(ids.some(v=>!Number.isSafeInteger(v)||v<0||v>=mesh.positions.length/3)||new Set(ids).size!==3)
      throw new Error('Invalid source collision triangle index');
    const [a,b,c]=ids.map(idx=>mesh.positions.slice(idx*3,idx*3+3) as Vec3) as [Vec3,Vec3,Vec3];
    const n=cross(sub(b,a),sub(c,a));
    if(Math.hypot(...n)<1e-7)throw new Error('Degenerate triangle in source collision mesh');
    const mins=[0,1,2].map(axis=>Math.floor(Math.min(a[axis],b[axis],c[axis])/CELL));
    const maxs=[0,1,2].map(axis=>Math.floor(Math.max(a[axis],b[axis],c[axis])/CELL));
    const cellCount=(maxs[0]-mins[0]+1)*(maxs[1]-mins[1]+1)*(maxs[2]-mins[2]+1);
    if(cellCount>4096||references+cellCount>MAX_REFERENCES)
      throw new Error('Source collision spatial index budget exceeded');
    const index=triangles.length;
    triangles.push({a,b,c,normal:norm(n)});
    for(let x=mins[0];x<=maxs[0];x++)for(let y=mins[1];y<=maxs[1];y++)for(let z=mins[2];z<=maxs[2];z++){
      const k=key(x,y,z);const list=cells.get(k);
      if(list)list.push(index);else cells.set(k,[index]);
    }
    references+=cellCount;
  }
  return {triangles,cells,cellSize:CELL,triangleCount:triangles.length,gameCollisionCompiled:false};
}

/** Christer Ericson's closest-point-on-triangle region tests. */
function closest(p:Vec3,t:Triangle):Vec3 {
  const {a,b,c}=t,ab=sub(b,a),ac=sub(c,a),ap=sub(p,a);
  const d1=dot(ab,ap),d2=dot(ac,ap);
  if(d1<=0&&d2<=0)return a;
  const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);
  if(d3>=0&&d4<=d3)return b;
  const vc=d1*d4-d3*d2;
  if(vc<=0&&d1>=0&&d3<=0)return add(a,mul(ab,d1/(d1-d3)));
  const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);
  if(d6>=0&&d5<=d6)return c;
  const vb=d5*d2-d1*d6;
  if(vb<=0&&d2>=0&&d6<=0)return add(a,mul(ac,d2/(d2-d6)));
  const va=d3*d6-d5*d4;
  if(va<=0&&(d4-d3)>=0&&(d5-d6)>=0)return add(b,mul(sub(c,b),(d4-d3)/((d4-d3)+(d5-d6))));
  const denom=1/(va+vb+vc);
  return add(a,add(mul(ab,vb*denom),mul(ac,vc*denom)));
}
function nearby(world:SourceCollisionWorld,p:Vec3,r:number):number[]{
  const min=p.map(v=>Math.floor((v-r)/CELL)),max=p.map(v=>Math.floor((v+r)/CELL));
  const result=new Set<number>();
  for(let x=min[0];x<=max[0];x++)for(let y=min[1];y<=max[1];y++)for(let z=min[2];z<=max[2];z++){
    for(const id of world.cells.get(key(x,y,z))??[])result.add(id);
  }
  return [...result];
}
export function resolveSourceBody(world:SourceCollisionWorld, feet:Vec3): Pick<WalkState,'feet'|'grounded'|'contacts'> {
  if(!feet.every(finite))throw new Error('Invalid simulated player position');
  let at:Vec3=[...feet],contacts=0,grounded=false;
  for(let iteration=0;iteration<5;iteration++){
    let pushed=false;
    for(const offset of BODY_OFFSETS){
      const center:Vec3=[at[0],at[1],at[2]+offset];
      for(const index of nearby(world,center,RADIUS+0.025)){
        const t=world.triangles[index],point=closest(center,t),delta=sub(center,point);
        const dist=Math.hypot(...delta);
        if(dist>RADIUS+0.02)continue;
        const direction=dist>EPS?mul(delta,1/dist):t.normal;
        if(direction[2]>.5 && dist<=RADIUS+0.02)grounded=true;
        if(dist>=RADIUS-0.0005)continue;
        const amount=Math.min(0.35,RADIUS-dist+0.0005);
        at=add(at,mul(direction,amount));contacts++;pushed=true;
      }
    }
    if(!pushed)break;
  }
  return {feet:at,grounded,contacts};
}
/** Fixed-bounded substeps prevent most tunnelling through thin source surfaces.
 * The editor intentionally does not implement Halo movement physics or jumping.
 */
export function stepSourceWalk(world:SourceCollisionWorld,state:WalkState, planar:Vec3,dt:number):WalkState {
  if(!planar.every(Number.isFinite)||!Number.isFinite(dt)||dt<0||dt>.1)
    throw new Error('Invalid live preview walk timestep');
  const speed=Math.hypot(planar[0],planar[1]);
  if(speed>12.01||Math.abs(planar[2])>.001)throw new Error('Walk velocity exceeds sandbox limits');
  const steps=Math.max(1,Math.ceil(Math.hypot(planar[0],planar[1],state.verticalSpeed)*dt/0.12));
  let next={...state,feet:[...state.feet] as Vec3},contacts=0;
  for(let i=0;i<steps;i++){
    const h=dt/steps;
    const speedZ=Math.max(-16,next.verticalSpeed-12*h);
    const delta:Vec3=[planar[0]*h,planar[1]*h,speedZ*h];
    const resolved=resolveSourceBody(world,add(next.feet,delta));
    contacts+=resolved.contacts;
    next={feet:resolved.feet,verticalSpeed:resolved.grounded&&speedZ<0?0:speedZ,
      grounded:resolved.grounded,contacts:resolved.contacts};
  }
  return {...next,contacts};
}
