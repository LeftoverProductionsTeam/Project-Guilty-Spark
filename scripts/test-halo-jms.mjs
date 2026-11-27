import assert from 'node:assert/strict';
import { exportMeshJms } from '../src/haloJms.ts';
import { auditQuickForgeMesh } from '../src/haloMeshIntegrity.ts';
import { plowMesh } from '../src/plowMesh.ts';
import { appendRecoveredJmsMaterial, attachRigidPartToRecoveredJms, normalizeRecoveredJmsChecksum, readRecoveredJms } from '../src/haloRiggedJms.ts';
const triangle={positions:[0,0,0,1,0,0,0,1,0],indices:[0,1,2],normals:[0,0,1,0,0,1,0,0,1],uvs:[0,0,1,0,0,1],parts:[{name:'paint/stone',indexStart:0,indexCount:3}],label:'a',source:'obj'};
const jms=exportMeshJms(triangle);
assert.equal(jms.vertices,3); assert.equal(jms.triangles,1);
assert.deepEqual(jms.materials,['paint_stone']);
const lines=jms.text.trim().split('\n');
assert.equal(lines[0],'8200'); assert.equal(lines[2],'1');
assert.equal(lines[8],'1'); assert.equal(lines[9],'paint_stone');
assert.equal(lines[10],'<none>'); assert.equal(lines[13],'__unnamed');
assert.equal(lines[14],'3'); assert.equal(lines[16],'0.000000\t0.000000\t0.000000');
assert.equal(lines[24],'100.000000\t0.000000\t0.000000');
assert.equal(lines.at(-3),'0'); assert.equal(lines.at(-2),'0'); assert.equal(lines.at(-1),'0\t1\t2');
assert.throws(()=>exportMeshJms(triangle,'bsp-candidate'),/open boundary/);
assert.match(exportMeshJms({...triangle,normals:[]}).warnings.join(' '),/recomputed/);
assert.throws(()=>exportMeshJms({...triangle,indices:[0,0,2]}),/degenerate/);
assert.throws(()=>exportMeshJms({...triangle,parts:[{name:'stone',indexStart:1,indexCount:3}]}),/material part|ranges/);
console.log('PASS: bounded Halo JMS 8200 material/source export, 100x coordinate conversion, topology gates');

const roadBlade=plowMesh([.22,3,.72],80,0,'moldboard');
const flatBlade=plowMesh([.22,3,.72],0,0,'moldboard');
assert.deepEqual(roadBlade.uvs,flatBlade.uvs);
const sagitta=.72*.38*.8;
const radius=(.36**2+sagitta**2)/(2*sagitta);
for(let row=0;row<=12;row++){
  const at=(row*17+8)*3;
  const recess=flatBlade.positions[at]-roadBlade.positions[at];
  const z=roadBlade.positions[at+2]-.36;
  assert.ok(Math.abs(Math.hypot(recess+radius-sagitta,z)-radius)<1e-12);
}
assert.equal(exportMeshJms(roadBlade).triangles,880);
const roadTopology=auditQuickForgeMesh(roadBlade);
assert.equal(roadTopology.edgeClosedShellCandidates,1);
assert.equal(roadTopology.windingConflicts,0);
assert.equal(roadTopology.nonManifoldEdges,0);

const recovered=[
  '8200','4180762708','2',
  'frame hull','1','-1','0 0 0 1','0 0 42',
  'frame wheel','-1','-1','0 0 0 1','0 15 0',
  '2','body','<none>','wheel','<none>',
  '1','seat','0','0','0 0 0 1','0 0 42','0',
  '2','hull','wheel',
  '3',
  '0','0 0 0','0 0 1','-1','0','0 0 0',
  '0','100 0 0','0 0 1','-1','0','1 0 0',
  '0','0 100 0','0 0 1','-1','0','0 1 0',
  '1','0','0','0 1 2',
].join('\n');
const withPaint=appendRecoveredJmsMaterial(recovered,'plow_paint');
assert.deepEqual(readRecoveredJms(withPaint).materials,['body','wheel','plow_paint']);
assert.deepEqual(readRecoveredJms(withPaint).vertices,readRecoveredJms(recovered).vertices);
assert.throws(()=>appendRecoveredJmsMaterial(withPaint,'plow_paint'));
const sourceMount={node:'frame wheel',region:'hull',material:'wheel',position:[1,0,0]};
const rigid=attachRigidPartToRecoveredJms(recovered,triangle,sourceMount);
assert.equal(rigid.checksum,4180762708);
assert.equal(rigid.originalTriangles,1);
assert.equal(rigid.addedTriangles,1);
const mounted=rigid.text.trim().split('\n');
assert.equal(mounted[1],'-114204588');
assert.equal(normalizeRecoveredJmsChecksum(rigid.text),rigid.text);
assert.deepEqual(mounted.slice(2,28),recovered.split('\n').slice(2,28));
const vertexCount=28;
assert.equal(mounted[vertexCount],'6');
assert.deepEqual(mounted.slice(29,47),recovered.split('\n').slice(29,47));
assert.deepEqual(mounted.slice(47,53),['1','100.000000\t0.000000\t0.000000','0.000000\t0.000000\t1.000000','-1','0','0.000000\t0.000000\t0']);
assert.deepEqual(mounted.slice(-7),['2','0','0','0 1 2','0','1','3\t4\t5']);
assert.throws(()=>attachRigidPartToRecoveredJms(recovered,triangle,{...sourceMount,node:'missing'}),/JMS node/);
assert.throws(()=>attachRigidPartToRecoveredJms(recovered.replace('4180762708','4294967296'),triangle,sourceMount),/32-bit rig checksum/);
assert.throws(()=>attachRigidPartToRecoveredJms(recovered.replace('3\n0\n0 0 0\n','4\n0\n0 0 0\n'),triangle,sourceMount),/recovered JMS/);
console.log('PASS: rigid recovered JMS mount preserves exact stock rows, target node, LOD source and checksum bits');
