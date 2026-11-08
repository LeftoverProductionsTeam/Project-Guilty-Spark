import {it,expect} from 'vitest';
import {nativeEdgePick,selectedSeamEdge,donorPoint} from './seamEdges';
import type {MeshData} from './types';import type {BspAssembly} from './bspAssembly';
const mesh:MeshData={positions:[0,0,0,4,0,0,0,4,0],indices:[0,1,2],label:'actual hit triangle',source:'halo-bsp',materialRanges:[{bspIndex:0,shaderTagId:42,lightmapIndex:0,indexStart:0,indexCount:3}]};
const sha='a'.repeat(64);
it('selects the closest edge of the visible native triangle and keeps local source identity',()=>{
 const pick=nativeEdgePick(mesh,sha,0,[1,.1,0])!;expect(pick.edge).toEqual({vertices:[[0,0,0],[4,0,0]],point:[1,0,0]});
 expect(selectedSeamEdge(pick,sha,0)).toEqual({sourceSha256:sha,bspIndex:0,...pick.edge});
 expect(selectedSeamEdge(pick,'b'.repeat(64),0)).toBeNull();expect(selectedSeamEdge(pick,sha,1)).toBeNull();
 expect(nativeEdgePick(mesh,sha,1,[0,0,0])).toBeNull();expect(nativeEdgePick(mesh,sha,0,[NaN,0,0])).toBeNull();
});
it('reverses a rotated donor view into its own source coordinates without mutating the map',()=>{
 const plan={translation:[10,-20,3],yawDegrees:90} as BspAssembly,point:[number,number,number]=[2,4,1],world=donorPoint(point,plan);
 expect(world).toEqual([6,-18,4]);donorPoint(world,plan,true).forEach((v,k)=>expect(v).toBeCloseTo(point[k],12));expect(point).toEqual([2,4,1]);
});
it('refuses malformed geometry instead of inventing a selectable edge',()=>{
 expect(nativeEdgePick({...mesh,positions:[0,0,0],indices:[0,1,2]},sha,0,[0,0,0])).toBeNull();
 expect(nativeEdgePick({...mesh,positions:Array(9).fill(0)},sha,0,[0,0,0])).toBeNull();
});
