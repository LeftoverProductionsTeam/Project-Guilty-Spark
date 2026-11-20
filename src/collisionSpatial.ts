import type {Vec3} from './types';
interface Triangle {a:Vec3;b:Vec3;c:Vec3}
export interface CollisionNode {min:Vec3;max:Vec3;ids?:number[];left?:CollisionNode;right?:CollisionNode}

export function buildCollisionIndex(triangles:Triangle[]):CollisionNode|null {
  return buildCollisionIndexFrom(triangles.length,id=>triangles[id]);
}

/** Store each triangle's bounds and centroid once during the build. A streamed
 * source can keep its original vertex/index buffers instead of copying them. */
export function buildCollisionIndexFrom(count:number,read:(id:number)=>Triangle|null):CollisionNode|null {
  if(!count)return null;
  const stride=9, bounds=new Float64Array(count*stride);
  for(let id=0;id<count;id++){
    const triangle=read(id);
    if(!triangle)return null;
    const {a,b,c}=triangle, start=id*stride;
    for(let axis=0;axis<3;axis++){
      bounds[start+axis]=Math.min(a[axis],b[axis],c[axis]);
      bounds[start+3+axis]=Math.max(a[axis],b[axis],c[axis]);
      bounds[start+6+axis]=(a[axis]+b[axis]+c[axis])/3;
    }
  }
  function build(ids:number[]):CollisionNode {
    const min:Vec3=[Infinity,Infinity,Infinity],max:Vec3=[-Infinity,-Infinity,-Infinity];
    for(const id of ids){
      const start=id*stride;
      for(let axis=0;axis<3;axis++){
        min[axis]=Math.min(min[axis],bounds[start+axis]);
        max[axis]=Math.max(max[axis],bounds[start+3+axis]);
      }
    }
    if(ids.length<=16)return {min,max,ids};
    const widths=max.map((n,i)=>n-min[i]),axis=widths.indexOf(Math.max(...widths));
    const centroid=6+axis;
    ids.sort((a,b)=>bounds[a*stride+centroid]-bounds[b*stride+centroid]);
    const half=Math.floor(ids.length/2);
    return {min,max,left:build(ids.slice(0,half)),right:build(ids.slice(half))};
  }
  return build(Array.from({length:count},(_,id)=>id));
}

export function queryCollisionBounds(root:CollisionNode|null,min:Vec3,max:Vec3) {
  const stack=root?[root]:[],ids:number[]=[];
  let nodes=0;
  while(stack.length){
    const node=stack.pop()!;
    nodes++;
    if(node.min.some((value,axis)=>value>max[axis])||node.max.some((value,axis)=>value<min[axis]))continue;
    if(node.ids)ids.push(...node.ids);else{if(node.left)stack.push(node.left);if(node.right)stack.push(node.right);}
  }
  return {ids,nodes};
}

export function queryCollisionIndex(root:CollisionNode|null,position:Vec3,radius:number) {
  const min:Vec3=[position[0]-radius,position[1]-radius,position[2]-radius];
  const max:Vec3=[position[0]+radius,position[1]+radius,position[2]+radius];
  return queryCollisionBounds(root,min,max);
}
