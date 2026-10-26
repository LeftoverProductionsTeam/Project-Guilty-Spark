import assert from 'node:assert/strict';
import { preflightSourceExport, validateSceneTransform } from '../src/sourcePreflight.ts';
const brush={id:'b',name:'room',kind:'room',position:[0,0,0],rotation:[0,0,0],dimensions:[4,4,4],materialId:'mat',steps:1,visible:true,locked:false};
const doc={geometry:[brush],placements:[],spawns:[],objectives:[],materials:[{id:'mat'}]};
const mesh={positions:[0,0,0,1,0,0,0,1,0],normals:[0,0,1,0,0,1,0,0,1],uvs:[0,0,1,0,0,1],indices:[0,1,2],parts:[{brushId:'b',materialId:'mat',indexStart:0,indexCount:3}]};
const report={valid:true,issues:[],sourceSha256:'a'.repeat(64),vertices:3,triangles:1,closedComponents:1};
const valid=preflightSourceExport(doc,{mesh,document:doc},report,doc);
assert.equal(valid.ready,true,valid.blockers.join(';'));
assert.equal(valid.triangles,1);
assert.equal(preflightSourceExport(doc,{mesh,document:doc},report,doc,true).ready,false,'busy blocks');
assert.equal(preflightSourceExport({...doc},{mesh,document:doc},report,doc).sameDocument,false,'stale doc blocks');
assert.equal(preflightSourceExport(doc,{mesh,document:doc},report,null).ready,false,'missing matching validation blocks');
assert.equal(preflightSourceExport(doc,{mesh:{...mesh,indices:[9,1,2]},document:doc},report,doc).ready,false,'broken indices block');
assert.equal(preflightSourceExport(doc,{mesh:{...mesh,uvs:[0,0]},document:doc},report,doc).ready,false,'wrong UV count blocks');
assert.equal(preflightSourceExport(doc,{mesh:{...mesh,parts:[{...mesh.parts[0],indexStart:1}]},document:doc},report,doc).ready,false,'invalid part offsets block');
assert.equal(preflightSourceExport(doc,{mesh,document:doc},{...report,valid:false},doc).ready,false,'Rust errors block');
assert.equal(preflightSourceExport(doc,{mesh,document:doc},{...report,sourceSha256:'broken'},doc).ready,false,'invalid hash block');
assert.equal(preflightSourceExport({...doc,materials:[]},{mesh,document:doc},report,doc).ready,false,'stale edit blocks');
const modified={...doc,geometry:[{...brush,materialId:'missing'}]};
assert.equal(preflightSourceExport(modified,{mesh,document:modified},report,modified).ready,false,'material integrity blocks');
const doubleMesh={...mesh,
  positions:[...mesh.positions,0,1,0,1,0,0,0,0,0],
  normals:[...mesh.normals,0,0,1,0,0,1,0,0,1],
  uvs:[...mesh.uvs,0,1,1,0,0,0],
  indices:[0,1,2,3,4,5],
  parts:[{brushId:'b',materialId:'mat',indexStart:0,indexCount:6}],
};
const duplicateReport={...report,vertices:6,triangles:2};
const duplicate=preflightSourceExport(doc,{mesh:doubleMesh,document:doc},duplicateReport,doc);
assert.equal(duplicate.ready,false,'identical triangles with separate vertex IDs must block collision export');
assert.match(duplicate.blockers.join(' '),/Duplicate coincident source faces/);
validateSceneTransform({position:[1200,0,0],rotation:[0,0,Math.PI],scale:[1,1,1]});
assert.throws(()=>validateSceneTransform({position:[0,NaN,0],rotation:[0,0,0],scale:[1,1,1]}),/invalid position/);
assert.throws(()=>validateSceneTransform({position:[0,0,0],rotation:[0,0,0],scale:[1,-1,1]}),/scale must/);
console.log('PASS: fail-closed export guards detect stale generations, Rust errors, missing materials and malformed mesh data');
