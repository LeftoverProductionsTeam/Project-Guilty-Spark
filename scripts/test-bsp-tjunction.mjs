import assert from 'node:assert/strict';
import {auditQuickForgeMesh} from '../src/haloMeshIntegrity.ts';
import {preflightSourceExport} from '../src/sourcePreflight.ts';
import {makeHaloBspSourceReport} from '../src/haloBspSourceReport.ts';

const flush=(pts,faces)=>({positions:faces.flatMap(f=>f.flatMap(idx=>pts[idx])),indices:faces.flatMap((_,t)=>[t*3,t*3+1,t*3+2])});
// Point (1,0,0) lies STRICTLY on the middle of (0,0,0) -> (2,0,0).
const pts=[[0,0,0],[2,0,0],[0,1,0],[1,0,0],[1,1,0],[2,1,0]];
const triangles=[[0,1,2],[3,4,5]];
const review=auditQuickForgeMesh(flush(pts,triangles));
assert.equal(review.checkedTriangles,2);
assert(review.tJunctionEdges>0,'vertex-on-edge should be detected even across independent flat-shaded triangles');
assert(review.exampleTJunctionTriangles.includes(0));
assert.equal(review.tJunctionScanComplete,true);
assert(review.tJunctionCandidatesChecked>0);
const detached=auditQuickForgeMesh(flush([[0,0,0],[2,0,0],[0,1,0],[1,2,0],[1,3,0],[2,3,0]],triangles));
assert.equal(detached.tJunctionEdges,0);
assert.equal(detached.tJunctionScanComplete,true);
const brush={id:'brush',name:'room',kind:'room',position:[0,0,0],rotation:[0,0,0],dimensions:[4,4,4],materialId:'mat',steps:4,visible:true,locked:false};
const doc={geometry:[brush],placements:[],spawns:[],objectives:[],materials:[{id:'mat'}]};
const raw=flush(pts,triangles);
const mesh={...raw,normals:Array(raw.positions.length).fill(0),uvs:Array(raw.positions.length/3*2).fill(0),parts:[{brushId:'brush',materialId:'mat',indexStart:0,indexCount:raw.indices.length}]};
const validation={valid:true,issues:[],sourceSha256:'b'.repeat(64),vertices:mesh.positions.length/3,triangles:mesh.indices.length/3};
const gate=preflightSourceExport(doc,{mesh,document:doc},validation,doc);
assert(gate.warnings.some(w=>w.includes('T-junction')));
assert.equal(gate.ready,true,'T-junction heuristics advise rather than creating false hard-blockers');
const exported=makeHaloBspSourceReport('b'.repeat(64),gate);
assert.equal(exported.schema,'guiltyspark-halo1-bsp-source-topology/v2');
assert.equal(exported.topology.tJunctionEdges,review.tJunctionEdges);
assert.equal(exported.topology.tJunctionScanComplete,true);
assert(exported.topology.exampleTJunctionTriangles.length>0);
assert.equal(exported.compilerVerified,false);
assert.throws(()=>makeHaloBspSourceReport('b'.repeat(64),{...gate,meshIntegrity:{...gate.meshIntegrity,tJunctionEdges:-1}}),/inconsistent topology/);
// 1000 independent long edges sharing the same x-range but unrelated y/z:
// this exceeds the bounded comparison budget without a quadratic full scan.
const hugePts=[],hugeFaces=[];
for(let i=0;i<1000;i++){
  const base=hugePts.length;
  hugePts.push([0,i*.001,0],[100,i*.001,0],[0,i*.001,.01]);
  hugeFaces.push([base,base+1,base+2]);
}
const huge=auditQuickForgeMesh(flush(hugePts,hugeFaces));
assert.equal(huge.tJunctionScanComplete,false,'budget exhaustion must be explicit');
assert(huge.tJunctionCandidatesChecked<=2_000_000);
assert.match(huge.note,/bounded/);
console.log('PASS: bounded vertex-on-edge T-junction hints, source warnings, fail-closed report evidence and explicit incomplete scan');
