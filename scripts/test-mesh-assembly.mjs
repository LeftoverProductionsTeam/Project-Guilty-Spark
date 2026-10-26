import assert from 'node:assert/strict';
import { assembleSourceMeshes, inspectMeshTopology, planMeshAlignment } from '../src/meshAssembly.ts';
const tri=(positions,uvs)=>({positions,uvs,normals:positions.flatMap((_,i)=>i%3===0?[0,0,1]:[]),indices:[0,1,2],parts:[{name:'stone',indexStart:0,indexCount:3}],label:'triangle',source:'obj'});
const a=tri([0,0,0,1,0,0,0,1,0],[0,0,1,0,0,1]);
const b=tri([1,0,0,1,1,0,0,1,0],[1,0,1,1,0,1]);
let aligned=assembleSourceMeshes(a,b,{mode:'vertex',targetVertex:1,movingVertex:0});
assert.deepEqual(aligned.alignment.translation,[0,0,0]);
assert.equal(aligned.mesh.positions.length,18);
assert.equal(aligned.mesh.indices.length,6);
assert.equal(aligned.weldedEdges,0);
assert.equal(aligned.mesh.parts?.length,2);
assert.equal(inspectMeshTopology(aligned.mesh).boundaryEdges,6,'snapping is not topology welding');
const joined=assembleSourceMeshes(a,b,{mode:'vertex',targetVertex:1,movingVertex:0},true);
assert.equal(joined.weldedEdges,1);
assert.equal(joined.weldedVertices,2);
assert.equal(joined.mesh.positions.length/3,4);
assert.equal(joined.topology.boundaryEdges,4);
assert.equal(joined.topology.nonManifoldEdges,0);
assert.equal(joined.topology.windingConflicts,0);
assert.deepEqual(joined.mesh.indices,[0,1,2,1,3,2]);
assert.throws(()=>assembleSourceMeshes(a,{...b,uvs:[0,0,0,0,0,0]},{mode:'vertex',targetVertex:1,movingVertex:0},true),/incompatible UVs/);
assert.throws(()=>assembleSourceMeshes(a,{...b,indices:[2,1,0]},{mode:'vertex',targetVertex:1,movingVertex:0},true),/identical winding/);
assert.throws(()=>assembleSourceMeshes(a,{...b,positions:[4,0,0,4,1.4,0,3,1.4,0]},{mode:'vertex',targetVertex:1,movingVertex:0},true),/No opposite-facing|identical winding|incompatible/);
const face=planMeshAlignment(a,b,{mode:'face',face:'x+'});
assert.equal(face.translation[0],1);
const far=tri([20,20,0,21,20,0,20,21,0],[0,0,1,0,0,1]);
assert.deepEqual(planMeshAlignment(a,far,{mode:'face',face:'x+'}).translation,[-19,-20,0]);
assert.throws(()=>planMeshAlignment(a,b,{mode:'vertex',targetVertex:-1,movingVertex:0}),/existing/);
assert.throws(()=>assembleSourceMeshes(a,{...b,indices:[0,1,30]},{mode:'face',face:'x+'}),/index is out of bounds/);
assert.throws(()=>assembleSourceMeshes(a,{...b,positions:[NaN,...b.positions.slice(1)]},{mode:'face',face:'x+'}),/invalid, extreme/);
// Coincident positions with distinct source vertex indices must not create
// fabricated topological seams (e.g. an OBJ UV split at the same location).
const duplicateEdge={...a,
 positions:[...a.positions,...a.positions],
 indices:[0,1,2,3,4,5],
 normals:[...a.normals,...a.normals],
 uvs:[...a.uvs,...a.uvs],
 parts:[{name:'stone',indexStart:0,indexCount:6}],
};
assert.throws(()=>assembleSourceMeshes(duplicateEdge,b,{mode:'vertex',targetVertex:1,movingVertex:0},true),/Ambiguous duplicate/);
console.log('PASS: mesh face/vertex alignment, material-preserving composition, exact open-seam weld, non-manifold/unsafe refusal');
