import assert from 'node:assert/strict';
import {auditQuickForgeMesh} from '../src/haloMeshIntegrity.ts';
import {preflightSourceExport} from '../src/sourcePreflight.ts';
import {makeHaloBspSourceReport} from '../src/haloBspSourceReport.ts';

const verts=[[0,0,0],[1,0,0],[0,1,0],[0,0,1],[1,1,0]];
const faces=[[0,2,1],[0,1,3],[0,3,2],[1,2,3]]; // outward tetrahedron
const flat=(facesList,pts=verts)=>({
  positions:facesList.flatMap(face=>face.flatMap(i=>pts[i])),
  indices:facesList.flatMap((_,i)=>[3*i,3*i+1,3*i+2]),
});
const tetra=flat(faces);
const good=auditQuickForgeMesh(tetra);
assert.equal(good.checkedTriangles,4);
assert.equal(good.boundaryEdges,0,'split flat-shaded vertices must still form closed geometric edges');
assert.equal(good.nonManifoldEdges,0);
assert.equal(good.windingConflicts,0);
assert.equal(good.duplicateFaces,0);
assert.equal(good.degenerateTriangles,0);
assert.equal(good.connectedShellCandidates,1);
assert.equal(good.edgeClosedShellCandidates,1);
assert.equal(good.openShellCandidates,0);
const withHole=auditQuickForgeMesh(flat(faces.slice(1)));
assert.equal(withHole.boundaryEdges,3);
assert.equal(withHole.openShellCandidates,1);
assert.equal(withHole.edgeClosedShellCandidates,0);
assert.equal(withHole.exampleBoundaryTriangles.length,3);
const flipped=auditQuickForgeMesh(flat([faces[0].toReversed(),...faces.slice(1)]));
assert.equal(flipped.boundaryEdges,0);
assert.equal(flipped.windingConflicts,3);
assert.equal(flipped.edgeClosedShellCandidates,0);
const nonmanifold=auditQuickForgeMesh(flat([...faces,[0,1,4]]));
assert.equal(nonmanifold.nonManifoldEdges,1);
assert.equal(nonmanifold.edgeClosedShellCandidates,0);
const duplicate=auditQuickForgeMesh(flat([...faces,faces[0].toReversed()]));
assert.equal(duplicate.duplicateFaces,1);
const degenerateMesh={positions:[0,0,0,1,0,0,2,0,0],indices:[0,1,2]};
const degenerate=auditQuickForgeMesh(degenerateMesh);
assert.equal(degenerate.degenerateTriangles,1);
assert.equal(degenerate.openShellCandidates,1);
const separate=flat([...faces,...faces.map(f=>f.map(i=>i+5))], [...verts,...verts.map(v=>v.map(n=>n+5))]);
const second=auditQuickForgeMesh(separate);
assert.equal(second.connectedShellCandidates,2);
assert.equal(second.edgeClosedShellCandidates,2);
assert.equal(auditQuickForgeMesh({positions:[0,0,0,.0001,0,0,0,1,0],indices:[0,1,2]}).shortEdges,1);
assert.throws(()=>auditQuickForgeMesh({positions:[Infinity,0,0],indices:[0,1,2]}));
assert.throws(()=>auditQuickForgeMesh({positions:tetra.positions,indices:[0,1,-1]}),/invalid indices/);
assert.throws(()=>auditQuickForgeMesh({positions:tetra.positions,indices:[0,1,99]}),/invalid indices/);
assert.throws(()=>auditQuickForgeMesh({positions:tetra.positions,indices:[0,1,1.5]}),/invalid indices/);
// The Rust validation report is a synthetic fixture, NOT a real Tool build.
const brush={id:'b',name:'test',kind:'room',position:[0,0,0],rotation:[0,0,0],dimensions:[4,4,4],materialId:'mat',steps:1,visible:true,locked:false};
const doc={geometry:[brush],placements:[],spawns:[],objectives:[],materials:[{id:'mat'}]};
const meshWith=(m)=>({...m,normals:Array(m.positions.length).fill(0),uvs:Array(m.positions.length/3*2).fill(0),parts:[{brushId:'b',materialId:'mat',indexStart:0,indexCount:m.indices.length}]});
const preflight=(m)=>{
  const wrapped=meshWith(m);
  const record={valid:true,issues:[],sourceSha256:'a'.repeat(64),vertices:wrapped.positions.length/3,triangles:wrapped.indices.length/3,closedComponents:1};
  return preflightSourceExport(doc,{mesh:wrapped,document:doc},record,doc);
};
const allowed=preflight(tetra);
assert.equal(allowed.ready,true,allowed.blockers.join(';'));
assert.equal(allowed.meshIntegrity?.edgeClosedShellCandidates,1);
assert.equal(preflight(flat(faces.slice(1))).ready,true,'open material surfaces are warnings, not a universal block');
assert.match(preflight(flat(faces.slice(1))).warnings.join(' '),/boundary edges/);
for (const bad of [flat([faces[0].toReversed(),...faces.slice(1)]),flat([...faces,[0,1,4]]),degenerateMesh]) {
  const gate=preflight(bad);
  assert.equal(gate.ready,false,'malformed source topology must fail independent audit');
  assert(gate.blockers.some(t=>/winding|more than two|collapsed/.test(t)),gate.blockers.join(' | '));
}
const exported=makeHaloBspSourceReport('A'.repeat(64),allowed);
assert.equal(exported.sourceSha256,'a'.repeat(64));
assert.equal(exported.sourceExportPermitted,true);
assert.equal(exported.compilerVerified,false);
assert.equal(exported.collisionVerified,false);
assert.equal(exported.portalsVerified,false);
assert.equal(exported.gameplayVerified,false);
assert.equal(exported.topology.boundaryEdges,0);
assert(!JSON.stringify(exported).includes('positions'));
assert(!JSON.stringify(exported).includes('sourceSecretTagPath')); 
assert.throws(()=>makeHaloBspSourceReport('wrong',allowed),/stale or malformed/);
assert.throws(()=>makeHaloBspSourceReport('a'.repeat(64),{...allowed,sameDocument:false}),/stale or malformed/);
assert.throws(()=>makeHaloBspSourceReport('a'.repeat(64),{...allowed,meshIntegrity:{...allowed.meshIntegrity,exampleBoundaryTriangles:[99]}}),/malformed topology/);
const refused=makeHaloBspSourceReport('a'.repeat(64),preflight(flat([...faces,[0,1,4]])));
assert.equal(refused.sourceExportPermitted,false);
assert.equal(refused.compilerVerified,false);
console.log('PASS: connected-shell edge graph, flat-shaded weld inference, open/non-manifold/winding/degenerate source gates, private SHA-pinned diagnostic handoff');
