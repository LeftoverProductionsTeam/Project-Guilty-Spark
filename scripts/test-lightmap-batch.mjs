import assert from 'node:assert/strict';
import { matchLocalLightmapPages } from '../src/haloLightmap.ts';
const pages=[{key:'bsp0:page0',bspIndex:0,page:0,withRealUvs:true},
  {key:'bsp0:page3',bspIndex:0,page:3,withRealUvs:true},
  {key:'bsp0:page4',bspIndex:0,page:4,withRealUvs:false}];
const files=[{name:'lightmap_page_003.dds'},{name:'page_0.png'},{name:'page_4.png'},{name:'normalmap.png'}];
const match=matchLocalLightmapPages(pages,files);
assert.deepEqual(match.assignments.map(x=>[x.key,x.fileIndex]),[['bsp0:page0',1],['bsp0:page3',0]]);
assert.equal(match.skipped.length,2);
const ambiguous=matchLocalLightmapPages(pages,[{name:'page_003.png'},{name:'lightmap_3.dds'}]);
assert.equal(ambiguous.assignments.length,0);
assert.equal(ambiguous.skipped.length,2);
assert.throws(()=>matchLocalLightmapPages(pages,Array(129).fill({name:'page_0.png'})),/128/);
assert.equal(matchLocalLightmapPages(pages,[{name:'Page_3.webp'},{name:'page_00.jpeg'}]).assignments.length,2);
assert.equal(matchLocalLightmapPages(pages,[{name:'page_999.png'},{name:'lightmap_page_3.exe'}]).assignments.length,0);
const multiple=[...pages,{key:'bsp1:page3',bspIndex:1,page:3,withRealUvs:true}];
let test=matchLocalLightmapPages(multiple,[{name:'page_3.png'},{name:'bsp_0_page_3.dds'},{name:'bsp_1_lightmap_page_003.png'}]);
assert.deepEqual(test.assignments.map(x=>x.key),['bsp0:page3','bsp1:page3']);
assert.equal(test.skipped.length,1);
assert.match(test.skipped[0].reason,/multiple BSPs/);
test=matchLocalLightmapPages(multiple,[{name:'bsp_1_page_003.png'},{name:'bsp1_lightmap_3.dds'}]);
assert.equal(test.assignments.length,0);
assert.equal(test.skipped.length,2);
assert.throws(()=>matchLocalLightmapPages(pages,[{name:'page_0.png',size:257*1024*1024}]),/256 MiB/);
console.log('PASS: per-BSP lightmap images, ambiguous legacy rejection, explicit mapping and size limits');
