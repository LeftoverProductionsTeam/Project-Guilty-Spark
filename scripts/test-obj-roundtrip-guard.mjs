import assert from 'node:assert/strict';
import { exportMeshObj } from '../src/haloObj.ts';
import { verifyOwnObjSerialization } from '../src/haloObjRoundTrip.ts';
const mesh={label:'owned',source:'obj',positions:[0,0,0, 1,0,0, 0,1,0, 2,0,0, 2,1,0, 1,1,0],
  indices:[0,1,2, 3,4,5],uvs:[0,0,1,0,0,1,0,0,1,1,1,0],
  normals:Array.from({length:6},()=>[0,0,1]).flat(),
  parts:[{indexStart:0,indexCount:3,name:'world'},{indexStart:3,indexCount:3,name:'tunnel'}]};
const output=exportMeshObj(mesh);
const result=verifyOwnObjSerialization(mesh,output.text);
assert.equal(result.triangles,2);
assert.equal(result.textureCoordinates,6);
assert.equal(result.exactSourceOrder,true);
assert.equal(result.haloBspVerified,false);
assert.throws(()=>verifyOwnObjSerialization(mesh,output.text.replace('f 1/1/1 2/2/2 3/3/3','f 1/1/1 3/3/3 2/2/2')),/indices/);
assert.throws(()=>verifyOwnObjSerialization(mesh,output.text.replace('v 1 0 0','v 1.25 0 0')),/coordinates/);
assert.throws(()=>verifyOwnObjSerialization(mesh,output.text.replace('vt 0 0','vt 1 0')),/UV coordinates/);
assert.throws(()=>verifyOwnObjSerialization(mesh,output.text.replace('vn 0 0 1','vn 0 0 0.5')),/normals/);
assert.throws(()=>verifyOwnObjSerialization(mesh,output.text.replace('f 4/4/4 5/5/5 6/6/6','')),/incomplete/);
const bare={...mesh,uvs:[],normals:[]};
const bareExport=exportMeshObj(bare);
assert.equal(verifyOwnObjSerialization(bare,bareExport.text).triangles,2);
assert.throws(()=>verifyOwnObjSerialization(bare,bareExport.text+'f 1 2 3\n'),/more faces/);
console.log('PASS: Spark OBJ serializer independently verifies source vertices/UVs/normals/material sections and exact triangle references; damaged interchange refuses');
