import {Box3,Matrix4,Vector3} from 'three';
import type {MeshData} from './types';
export type CollisionMesh=Pick<MeshData,'positions'|'indices'>;
export interface FloorSurface {mesh:CollisionMesh;matrix:Matrix4}
export function collisionBounds(mesh:CollisionMesh|undefined,matrix:Matrix4):Box3{
  const box=new Box3(),point=new Vector3();
  if(mesh){if(mesh.positions.length%3||mesh.positions.length>1_500_000)throw Error('Collision bounds exceed the editor budget.');
    const vertices=mesh.indices.length?mesh.indices:Array.from({length:mesh.positions.length/3},(_,i)=>i);
    for(const index of vertices){if(!Number.isSafeInteger(index)||index<0||index*3+2>=mesh.positions.length)throw Error('Collision bounds contain an invalid index.');point.fromArray(mesh.positions,index*3).applyMatrix4(matrix);if(!point.toArray().every(Number.isFinite))throw Error('Collision contains a non-finite point.');box.expandByPoint(point);}}
  if(box.isEmpty())box.setFromCenterAndSize(point.setFromMatrixPosition(matrix),new Vector3());
  return box;
}
/** Nearest support below the selected feet, sampled over their footprint. The
 * same displacement moves a group; individual members keep their relative pose. */
export function floorSnapDelta(bounds:Box3[],surfaces:FloorSurface[]):number|null{
  if(!bounds.length||bounds.some(b=>b.isEmpty()))return null;
  let result=-Infinity;const p=new Vector3(),vertices=new Float64Array(9);
  const samples=bounds.flatMap(box=>{const xs=[box.min.x,(box.min.x+box.max.x)/2,box.max.x],ys=[box.min.y,(box.min.y+box.max.y)/2,box.max.y];return xs.flatMap(x=>ys.map(y=>({x,y,feet:box.min.z,start:box.max.z})));});
  let triangles=0;
  for(const {mesh,matrix} of surfaces){
    if(mesh.indices.length%3||mesh.positions.length%3)throw Error('Collision mesh is incomplete.');
    triangles+=mesh.indices.length/3;if(triangles>1_000_000)throw Error('Floor snap exceeds the collision budget.');
    for(let i=0;i<mesh.indices.length;i+=3){
      for(let k=0;k<3;k++){const at=mesh.indices[i+k];if(!Number.isSafeInteger(at)||at<0||at*3+2>=mesh.positions.length)throw Error('Collision triangle index is invalid.');p.fromArray(mesh.positions,at*3).applyMatrix4(matrix);if(!p.toArray().every(Number.isFinite))throw Error('Collision contains a non-finite point.');vertices.set(p.toArray(),k*3);}
      const [ax,ay,az,bx,by,bz,cx,cy,cz]=vertices,den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);
      if(Math.abs(den)<1e-10)continue;
      for(const sample of samples){const a=((by-cy)*(sample.x-cx)+(cx-bx)*(sample.y-cy))/den,b=((cy-ay)*(sample.x-cx)+(ax-cx)*(sample.y-cy))/den,c=1-a-b;
        if(a< -1e-7||b< -1e-7||c< -1e-7)continue;const z=a*az+b*bz+c*cz;
        if(z>sample.start+0.0001||z<sample.feet-20000)continue;result=Math.max(result,z-sample.feet);
      }
    }
  }
  return Number.isFinite(result)?result+0.0001:null;
}
