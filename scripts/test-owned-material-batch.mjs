import assert from 'node:assert/strict';
import {MAX_OWNED_PREVIEWS_PER_CLICK,planOwnedMaterialPreviews} from '../src/ownedMaterialBatch.ts';
const h = 'b'.repeat(64);
const inspection={sha256:h,header:{version:7,engine:'Halo CE'},tags:[
  {id:10,class:'senv',path:'levels/a/shaders/metal',primaryBitmapStatus:'resolved',references:[{label:'Base map',class:'bitm',targetId:100}]},
  {id:11,class:'soso',path:'vehicles/ghost',primaryBitmapStatus:'resolved',references:[{label:'Diffuse map',class:'bitm',targetId:101}]},
  {id:12,class:'senv',path:'levels/a/shaders/unknown',primaryBitmapStatus:'missing',references:[]},
  {id:100,class:'bitm',path:'levels/a/base',external:false},
  {id:101,class:'bitm',path:'vehicles/ghost_diffuse',external:true},
  {id:200,class:'bitm',path:'levels/a/bsp0_lm',external:false},
  {id:201,class:'bitm',path:'levels/a/bsp1_lm',external:false},
]};
const range=(shaderTagId,bspIndex,indexStart,lightmapBitmapTagId)=>({shaderTagId,bspIndex,indexStart,indexCount:3,lightmapIndex:0,lightmapPage:0,hasLightmapUvs:true,lightmapBitmapTagId});
const mesh={positions:new Array(36).fill(0),indices:Array.from({length:12},(_,i)=>i),lightmapUvs:new Array(24).fill(0),
  materialRanges:[range(10,0,0,200),range(12,0,3,200),range(11,1,6,201),range(10,1,9,201)]};
let report=planOwnedMaterialPreviews(inspection,mesh);
assert.deepEqual(report.shaderTasks.map(t=>t.bitmapTagId),[100]);
assert.deepEqual(report.lightmapTasks.map(t=>[t.key,t.bitmapTagId,t.imageIndex]),[
  ['bsp0:page0',200,0],['bsp1:page0',201,0]
]);
assert(report.skipped.some(s=>s.key==='shader:11'&&s.reason.includes('external')));
assert(report.skipped.some(s=>s.key==='shader:12'&&s.reason.includes('missing')));
report=planOwnedMaterialPreviews(inspection,mesh,new Set([10]),new Set(['bsp0:page0']));
assert.equal(report.shaderTasks.length,0);
assert.deepEqual(report.lightmapTasks.map(t=>t.key),['bsp1:page0']);
report=planOwnedMaterialPreviews(inspection,{...mesh,materialRanges:[...mesh.materialRanges.slice(0,1),
  {...mesh.materialRanges[1],lightmapBitmapTagId:201},...mesh.materialRanges.slice(2)]});
assert(!report.lightmapTasks.some(t=>t.key==='bsp0:page0'));
assert(report.skipped.some(s=>s.reason.includes('disagree')));
report=planOwnedMaterialPreviews(inspection,{...mesh,materialRanges:[{...mesh.materialRanges[0],hasLightmapUvs:false},...mesh.materialRanges.slice(1)]});
assert(!report.lightmapTasks.some(t=>t.key==='bsp0:page0'));
report=planOwnedMaterialPreviews(inspection,{...mesh,materialRanges:[...mesh.materialRanges.slice(0,2),
  {...mesh.materialRanges[2],lightmapBitmapTagId:999},mesh.materialRanges[3]]});
assert(!report.lightmapTasks.some(t=>t.key==='bsp1:page0'));
report=planOwnedMaterialPreviews({...inspection,header:{...inspection.header,version:13}},mesh);
assert(report.shaderTasks.length>0,'MCC uses the verified PC-derived shader layout');
report=planOwnedMaterialPreviews({...inspection,header:{...inspection.header,version:5}},mesh);
assert.equal(report.shaderTasks.length+report.lightmapTasks.length,0);
assert.throws(()=>planOwnedMaterialPreviews({...inspection,sha256:'bad'},mesh),/SHA-256/);
assert.throws(()=>planOwnedMaterialPreviews({...inspection,tags:[...inspection.tags,inspection.tags[0]]},mesh),/Duplicate tag/);
assert.equal(MAX_OWNED_PREVIEWS_PER_CLICK,24);
assert(!JSON.stringify(planOwnedMaterialPreviews(inspection,mesh)).includes('C:\\'));
console.log('PASS: exact-source owned materials, separate per-BSP lightmap tags, missing metadata, ambiguous UVs, preserved user choices and bounded batches');
