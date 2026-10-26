import assert from 'node:assert/strict';
import {buildMaterialAudit} from '../src/materialAudit.ts';
import {matchLocalShaderTextures} from '../src/shaderTextureMatching.ts';
const hash='b'.repeat(64);
const map={header:{version:7,engine:'Halo CE'},sha256:hash,tags:[
  {id:10,class:'senv',path:'levels/a/shaders/grass',primaryBitmapStatus:'resolved',references:[
    {label:'Base map',targetId:30,class:'bitm'},
    {label:'Bump map',targetId:31,class:'bitm'}]},
  {id:11,class:'soso',path:'vehicles/ghost/ghost',primaryBitmapStatus:'resolved',references:[
    {label:'Diffuse map',targetId:32,class:'bitm'}]},
  {id:12,class:'senv',path:'levels/a/shaders/empty',primaryBitmapStatus:'missing',references:[]},
  {id:13,class:'senv',path:'levels/a/shaders/broken',primaryBitmapStatus:'invalid',references:[]},
  {id:14,class:'senv',path:'levels/a/shaders/external',primaryBitmapStatus:'unavailable',references:[]},
  {id:15,class:'senv',path:'levels/a/shaders/legacy',references:[]},
  {id:30,class:'bitm',path:'levels/a/bitmaps/grass_base',references:[]},
  {id:31,class:'bitm',path:'levels/a/bitmaps/grass_bump',references:[]},
  {id:32,class:'bitm',path:'vehicles/ghost/diffuse',references:[]}
]};
const materialRanges=[10,11,12,13,14,15].map((shaderTagId,i)=>({shaderTagId,bspIndex:i%2,indexStart:3*i,indexCount:3}));
const mesh={indices:Array.from({length:18},(_,i)=>i),materialRanges};
const report=buildMaterialAudit(map,mesh);
assert.equal(report.summary.resolved,2);
assert.equal(report.summary.missing,1);
assert.equal(report.summary.invalid,1);
assert.equal(report.summary.unavailable,1);
assert.equal(report.summary.legacyUnverified,1);
assert.equal(report.shaders[0].bitmapPath,'levels/a/bitmaps/grass_base');
assert.equal(report.shaders[0].otherBitmaps[0].role,'Bump map');
assert.equal(report.shaders[1].bitmapPath,'vehicles/ghost/diffuse');
const files=[{name:'grass_base.dds',size:99},{name:'grass_bump.dds',size:99},{name:'diffuse.png',size:99},
 {name:'empty.dds',size:99},{name:'broken.dds',size:99},{name:'external.dds',size:99}];
const matches=matchLocalShaderTextures(map,[10,11,12,13,14],files);
assert.deepEqual(matches.assignments.map(x=>x.shaderTagId),[10,11]);
assert(matches.skipped.some(x=>x.reason.includes('invalid')));
assert(matches.skipped.some(x=>x.reason.includes('missing')));
assert(matches.skipped.some(x=>x.reason.includes('unavailable')));
const wrong={...map,tags:[{...map.tags[0],references:[{label:'Base map',targetId:999,class:'bitm'}]},...map.tags.slice(1)]};
assert.equal(buildMaterialAudit(wrong,mesh).shaders[0].status,'invalid');
const forged={...map,tags:[{...map.tags[0],class:'snd!'},...map.tags.slice(1)]};
assert.equal(buildMaterialAudit(forged,mesh).shaders[0].status,'invalid');
assert.throws(()=>buildMaterialAudit({...map,sha256:'invalid'},mesh),/SHA-256/);
assert.throws(()=>buildMaterialAudit(map,{indices:[0,1,2],materialRanges}),/Invalid BSP/);
assert.throws(()=>buildMaterialAudit({...map,tags:[...map.tags,map.tags[0]]},mesh),/duplicate/);
assert(!JSON.stringify(report).includes('C:\\'));
console.log('PASS: native shader base/diffuse identities, audit provenance, strict fallback and bounded materials');
