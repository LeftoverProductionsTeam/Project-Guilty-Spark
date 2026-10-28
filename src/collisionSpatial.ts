import type {Vec3} from './types';
interface Triangle {a:Vec3;b:Vec3;c:Vec3}
export interface CollisionNode {min:Vec3;max:Vec3;ids?:number[];left?:CollisionNode;right?:CollisionNode}
export function buildCollisionIndex(triangles:Triangle[]):CollisionNode|null{
  if(!triangles.length)return null;
  function build(ids:number[]):CollisionNode{
    const min:Vec3=[Infinity,Infinity,Infinity],max:Vec3=[-Infinity,-Infinity,-Infinity];
    for(const id of ids)for(const point of [triangles[id].a,triangles[id].b,triangles[id].c])for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],point[axis]);max[axis]=Math.max(max[axis],point[axis]);}
    if(ids.length<=16)return {min,max,ids};
    const widths=max.map((n,i)=>n-min[i]),axis=widths.indexOf(Math.max(...widths));
    const center=(id:number)=>(triangles[id].a[axis]+triangles[id].b[axis]+triangles[id].c[axis])/3;
    ids.sort((a,b)=>center(a)-center(b));const half=Math.floor(ids.length/2);
    return {min,max,left:build(ids.slice(0,half)),right:build(ids.slice(half))};
  }return build(triangles.map((_,id)=>id));
}
export function queryCollisionIndex(root:CollisionNode|null,position:Vec3,radius:number){
  const stack=root?[root]:[],ids:number[]=[];let nodes=0;
  while(stack.length){const node=stack.pop()!;nodes++;
    if(node.min.some((v,i)=>v>position[i]+radius)||node.max.some((v,i)=>v<position[i]-radius))continue;
    if(node.ids)ids.push(...node.ids);else{if(node.left)stack.push(node.left);if(node.right)stack.push(node.right);}
  }return {ids,nodes};
}
