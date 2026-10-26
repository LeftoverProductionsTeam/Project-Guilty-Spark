import assert from 'node:assert/strict';
import {parseHaloWrl} from '../src/haloWrl.ts';
import {analyzeHaloToolLog} from '../src/haloToolDiagnostics.ts';
const wrl=`#VRML 1.0 ascii\nSeparator {\n Coordinate3 { point [100 0 0,200 0 0,300 0 0] }\n MaterialBinding { value PER_VERTEX }\n Material { diffuseColor [1 0 0,0 1 0,0 0 1] transparency [0] }\n IndexedLineSet { coordIndex [0,1,2,-1] }\n}\nSeparator {\n Coordinate3 {point [0 0 0,100 0 0,100 100 0,0 100 0]}\n MaterialBinding {value PER_FACE}\n Material {diffuseColor [0 0.5 1] transparency [0]}\n IndexedFaceSet {coordIndex [0,1,2,3,-1]}\n}`;
const a=parseHaloWrl(wrl);
assert.equal(a.regions,2);assert.equal(a.segments.length,2);assert.equal(a.faces.length,2);
assert.deepEqual(a.segments[0].start,[1,0,0]);
assert.deepEqual(a.segments[1].color,[0,1,0]);
assert.deepEqual(a.faces[0].color,[0,.5,1]);
assert.deepEqual(a.bounds.max,[3,1,0]);
assert.deepEqual(parseHaloWrl(wrl,false).bounds.max,[300,100,0]);
for(const bad of ['#VRML V2.0 utf8\nSeparator {}', '#VRML 1.0 ascii\nSeparator {Coordinate3 {point [1 2 3]} IndexedLineSet {coordIndex [0,1,-1]}}', '#VRML 1.0 ascii\nSeparator {Coordinate3 {point [1 2 3,1 1 1]} IndexedLineSet {coordIndex [0,9,-1]}}', '#VRML 1.0 ascii\nSeparator {Coordinate3 {point [1 2 3,1 1 1]} IndexedLineSet {coordIndex [0,1]}}', '#VRML 1.0 ascii\nSeparator {'])
  assert.throws(()=>parseHaloWrl(bad));
assert.throws(()=>parseHaloWrl(wrl+' '.repeat(2*1024*1024)));
const report=analyzeHaloToolLog('### Warning found 1 degenerate triangles.\n### ERROR edge is open (red)\n### ERROR could not build collision geometry');
assert.deepEqual(report.diagnostics.map(d=>d.code),['DEGENERATE','OPEN_EDGE','COLLISION']);
assert.equal(report.containsFatal,true);
assert.equal(analyzeHaloToolLog('Finished doing something').containsFatal,false);
assert.match(analyzeHaloToolLog('Finished doing something').note,/not a success detector/);
const knownHaloMessages = analyzeHaloToolLog([
  '### Warning found possible T-junction',
  "### ERROR Couldn't build BSP because of overlapping surfaces",
  '### ERROR Vertex has a bad point',
  '### Warning Found duplicate triangle building connected geometry',
  '### WARNING Degenerate triangle or triangle with bad UVs',
  '### Warning Cluster can see multiple skies',
].join('\n'));
assert.deepEqual(knownHaloMessages.diagnostics.map(d=>d.code),[
  'T_JUNCTION','BSP_OVERLAP','VERTEX_BOUNDS','PORTAL_DUPLICATE','RADIOSITY_UVS','SKY_CLUSTER',
]);
const compilerTopologyErrors=analyzeHaloToolLog([
  '### ERROR collision bsp is empty',
  'EXCEPTION halt: global_plane_count<MAXIMUM_BSP3D_DEPTH',
  'EXCEPTION halt: dividing_edge->vertex_indices[1]==NONE',
  'EXCEPTION halt: #-1 is not a valid structure_bsp_cluster_block index in [#0,#0)',
  '### Warning phantom BSP encountered in collision',
].join('\n'));
assert.deepEqual(compilerTopologyErrors.diagnostics.map(item=>item.code),
  ['EMPTY_COLLISION','BSP_DEPTH','BSP_DIVIDING_EDGE','BSP_TOO_SMALL','PHANTOM_COLLISION']);
assert.equal(compilerTopologyErrors.containsFatal,true);
assert.ok(compilerTopologyErrors.diagnostics.every(item=>item.action && item.action.length>30));
const manyFaces = `#VRML 1.0 ascii\nSeparator {Coordinate3 {point [0 0 0,1 0 0,0 1 0]} MaterialBinding {value PER_FACE} Material {diffuseColor [1 0 0,0 1 0,0 0 1,1 1 0]} IndexedFaceSet {coordIndex [0,1,2,-1,0,2,1,-1,0,1,2,-1,0,2,1,-1]}}`;
assert.equal(parseHaloWrl(manyFaces).faces.length,4,'Per-face material count can exceed vertices');
assert.deepEqual(parseHaloWrl(manyFaces).faces[3].color,[1,1,0]);
assert.throws(()=>analyzeHaloToolLog('\0binary'));
console.log('Halo Tool WRL/parser and compiler-log classification: PASS');
