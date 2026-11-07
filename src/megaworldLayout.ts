import type {Vec3} from './types';
export const originalMultiplayerMaps=['beavercreek','bloodgulch','boardingaction','carousel','chillout','damnation','dangercanyon','deathisland','gephyrophobia','hangemhigh','icefields','infinity','longest','prisoner','putput','ratrace','sidewinder','timberland','wizard'] as const;
export interface AtlasRegion {id:string;mapName:string;bspName:string;bspIndex:number;cacheSha256:string;cacheVersion:number;scenarioType:number;coordinates:string;minimum:Vec3;maximum:Vec3;collisionTriangles:number;renderTriangles:number;boundaryEdges:number;nonmanifoldEdges:number;degenerateTriangles:number;shaders:string[];runtimes:string[];translation:Vec3;yawDegrees:number}
export interface LayoutRegion {regionId:string;cacheSha256:string;cacheVersion:number;bspIndex:number;mapName:string;bspName:string;minimum:Vec3;maximum:Vec3;translation:Vec3;yawDegrees:number}
export interface MegaworldLayout {schemaVersion:1;regions:LayoutRegion[]}
export function planRegion(region:AtlasRegion):LayoutRegion {
  return {regionId:region.id,cacheSha256:region.cacheSha256,cacheVersion:region.cacheVersion,bspIndex:region.bspIndex,mapName:region.mapName,bspName:region.bspName,minimum:[...region.minimum],maximum:[...region.maximum],translation:[0,0,0],yawDegrees:0};
}
export function addLayoutRegions(layout:MegaworldLayout|undefined|null,regions:AtlasRegion[]):MegaworldLayout {
  const next=layout?.regions.slice()??[],seen=new Set(next.map(r=>r.regionId));
  for(const region of regions)if(!seen.has(region.id)){next.push(planRegion(region));seen.add(region.id);}
  if(next.length>64)throw Error('The Atlas layout holds at most 64 region plans.');
  return {schemaVersion:1,regions:next};
}
/** Require an explicit edition when a map name has multiple source hashes. */
export function originalRegions(regions:AtlasRegion[]):{regions:AtlasRegion[];missing:string[]} {
  const result:AtlasRegion[]=[],missing:string[]=[];
  for(const name of originalMultiplayerMaps){const matches=regions.filter(r=>r.scenarioType===1&&r.bspIndex===0&&r.mapName.toLowerCase()===name);
    if(matches.length>1)throw Error('Choose one runtime or add individual source variants for '+name+'.');
    if(matches[0])result.push(matches[0]);else missing.push(name);
  }return {regions:result,missing};
}
export function regionFootprint(r:LayoutRegion):[number,number][] {
  const angle=r.yawDegrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  return [[r.minimum[0],r.minimum[1]],[r.maximum[0],r.minimum[1]],[r.maximum[0],r.maximum[1]],[r.minimum[0],r.maximum[1]]].map(([x,y])=>[x*c-y*s+r.translation[0],x*s+y*c+r.translation[1]]);
}
/** Rotated source bounds only: overlaps are candidates, never collision/seam proof. */
export function overlappingRegions(regions:LayoutRegion[]):[string,string][] {
  const polygons=regions.map(regionFootprint),result:[string,string][]=[];
  for(let a=0;a<regions.length;a++)for(let b=a+1;b<regions.length;b++){
    const ra=regions[a],rb=regions[b];
    if(ra.minimum[2]+ra.translation[2]>=rb.maximum[2]+rb.translation[2]||rb.minimum[2]+rb.translation[2]>=ra.maximum[2]+ra.translation[2])continue;
    const p=polygons[a],q=polygons[b];let separate=false;
    for(const poly of [p,q])for(let i=0;i<4;i++){const u=poly[i],v=poly[(i+1)%4],normal=[u[1]-v[1],v[0]-u[0]];
      if(Math.hypot(...normal)<1e-9)continue;
      const project=(r:number[])=>r[0]*normal[0]+r[1]*normal[1],x=p.map(project),y=q.map(project);
      if(Math.max(...x)<=Math.min(...y)||Math.max(...y)<=Math.min(...x))separate=true;
    }if(!separate)result.push([regions[a].regionId,regions[b].regionId]);
  }return result;
}

/** Hexagonal planning rings preserve each source's dimensions and orientation.
 * Bounds are only a placement proxy; terrain blends/caves require native rebuild. */
export function spreadLayout(layout:MegaworldLayout,centerId=layout.regions[0]?.regionId):MegaworldLayout {
  const sizes=layout.regions.map(r=>{const p=regionFootprint(r);return [Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))];});
  const cellX=Math.max(1,...sizes.map(p=>p[2]-p[0])),cellY=Math.max(1,...sizes.map(p=>p[3]-p[1]));
  const order=layout.regions.map((r,i)=>i).sort((a,b)=>Number(layout.regions[b].regionId===centerId)-Number(layout.regions[a].regionId===centerId));
  const slots:[number,number][]=[[0,0]];
  for(let radius=1;slots.length<layout.regions.length;radius++){
    const ring:[number,number][]=[];for(let q=-radius;q<=radius;q++)for(let r=-radius;r<=radius;r++)if(Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))===radius)ring.push([q,r]);
    ring.sort((a,b)=>Math.atan2(a[1],a[0]+a[1]/2)-Math.atan2(b[1],b[0]+b[1]/2));slots.push(...ring);
  }
  const positions=new Map(order.map((index,i)=>[index,slots[i]]));
  const regions=layout.regions.map((r,i)=>{const [q,row]=positions.get(i)!;return {...r,translation:[r.translation[0]+(q+row/2)*cellX-(sizes[i][0]+sizes[i][2])/2,r.translation[1]+row*cellY-(sizes[i][1]+sizes[i][3])/2,r.translation[2]] as Vec3};});
  if(regions.some(r=>r.translation.some(n=>!Number.isFinite(n)||Math.abs(n)>1000000)))throw Error('These bounds exceed the supported layout range. Arrange them individually.');
  return {schemaVersion:1,regions};
}
