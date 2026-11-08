import {nativeSurfacePick} from './nativeSurfacePick';
import type {NativeSurfacePick} from './nativeSurfacePick';
import type {MeshData,Vec3} from './types';
import type {SeamEdge,BspAssembly} from './bspAssembly';
/** Closest edge of the actual visible hit triangle, in original source space. */
export function nativeEdgePick(mesh:MeshData,hash:string,triangle:number,point:Vec3):NativeSurfacePick|null {
 const pick=nativeSurfacePick(mesh,hash,triangle,point);if(!pick)return null;
 const vertices=mesh.indices.slice(triangle*3,triangle*3+3).map(id=>mesh.positions.slice(id*3,id*3+3) as Vec3);
 if(vertices.some(p=>p.length!==3||!p.every(Number.isFinite)))return null;
 let best:{vertices:[Vec3,Vec3];point:Vec3;distance:number}|undefined;
 for(let i=0;i<3;i++) {const a=vertices[i],b=vertices[(i+1)%3],d=b.map((n,k)=>n-a[k]),length=d.reduce((n,v)=>n+v*v,0);if(length<1e-8)continue;
  const t=Math.max(0,Math.min(1,d.reduce((n,v,k)=>n+v*(point[k]-a[k]),0)/length)),edgePoint=a.map((n,k)=>n+d[k]*t) as Vec3,distance=edgePoint.reduce((n,v,k)=>n+(v-point[k])**2,0);
  if(!best||distance<best.distance)best={vertices:[a,b],point:edgePoint,distance};
 }
 return best?{...pick,edge:{vertices:best.vertices,point:best.point}}:null;
}
export function selectedSeamEdge(pick:NativeSurfacePick|null,hash:string,bspIndex:number):SeamEdge|null {
 return pick?.edge&&pick.sourceHash===hash&&pick.bspIndex===bspIndex?{sourceSha256:hash,bspIndex,vertices:pick.edge.vertices,point:pick.edge.point}:null;
}
export function donorPoint(point:Vec3,plan:BspAssembly,inverse=false):Vec3 {
 const angle=plan.yawDegrees*Math.PI/180*(inverse?-1:1),c=Math.cos(angle),s=Math.sin(angle),p=inverse?point.map((n,k)=>n-plan.translation[k]) as Vec3:point;
 const result:Vec3=[p[0]*c-p[1]*s,p[0]*s+p[1]*c,p[2]];
 return inverse?result:result.map((n,k)=>n+plan.translation[k]) as Vec3;
}
