import assert from 'node:assert/strict';
import { auditHaloBspRender } from '../src/bspRenderAudit.ts';
const inspection={sha256:'a'.repeat(64),header:{version:7},tags:[
  {id:42,class:'senv'}, {id:43,class:'soso'}, {id:5,class:'bitm'}, {id:6,class:'bitm'},
]};
const mesh=()=>({positions:[0,0,0, 1,0,0, 0,1,0, 2,0,0, 3,0,0, 2,1,0],
  indices:[0,1,2,3,4,5],uvs:[0,0,1,0,0,1,0,0,1,0,0,1],
  lightmapUvs:[0,0,1,0,0,1,0,0,1,0,0,1],
  materialRanges:[
    {shaderTagId:42,bspIndex:0,indexStart:0,indexCount:3,lightmapPage:0,lightmapBitmapTagId:5,hasLightmapUvs:true},
    {shaderTagId:42,bspIndex:0,indexStart:3,indexCount:3,lightmapPage:0,lightmapBitmapTagId:5,hasLightmapUvs:true},
  ]});
const ok=auditHaloBspRender(inspection,mesh());
assert.equal(ok.checked.coveredTriangles,2);
assert.equal(ok.checked.degenerateTriangles,0);
assert.equal(ok.checked.lightmapPages,1);
assert.equal(ok.checked.realUvSections,2);
assert.deepEqual(ok.summary,{errors:0,warnings:0,infos:0,omittedFindings:0});
assert.equal(ok.acceptance.toolCompiledOrPlayable,false);
assert.equal(JSON.stringify(ok).includes('C:\\Users'),false);
const conflict=mesh();conflict.materialRanges[1].lightmapBitmapTagId=6;
assert(auditHaloBspRender(inspection,conflict).findings.some(f=>f.code==='BSP_LIGHTMAP_PAGE_CONFLICT'&&f.severity==='error'));
const model=mesh();model.materialRanges[0].shaderTagId=43;
assert(auditHaloBspRender(inspection,model).findings.some(f=>f.code==='BSP_MODEL_SHADER_ON_WORLD'));
const missing=mesh();missing.materialRanges[0].shaderTagId=123;
assert(auditHaloBspRender(inspection,missing).findings.some(f=>f.code==='BSP_SHADER_TAG_MISSING'));
const noUvs=mesh();delete noUvs.lightmapUvs;
assert(auditHaloBspRender(inspection,noUvs).findings.some(f=>f.code==='BSP_LIGHTMAP_UVS_UNTRUSTED'));
const unlit=mesh();unlit.materialRanges[1].lightmapPage=-1;
assert.equal(auditHaloBspRender(inspection,unlit).checked.lightmapPages,1);
const gap=mesh();gap.materialRanges=[gap.materialRanges[0]];
assert.equal(auditHaloBspRender(inspection,gap).checked.unassignedTriangles,1);
const zeroArea=mesh();zeroArea.positions[6]=0;zeroArea.positions[7]=0;
assert.equal(auditHaloBspRender(inspection,zeroArea).checked.degenerateTriangles,1);
const badIndex=mesh();badIndex.indices[3]=9000;
assert.throws(()=>auditHaloBspRender(inspection,badIndex),/index buffer/);
const overlap=mesh();overlap.materialRanges[1].indexStart=0;
assert.throws(()=>auditHaloBspRender(inspection,overlap),/Overlapping/);
const badRange=mesh();badRange.materialRanges[0].indexCount=200000000;
assert.throws(()=>auditHaloBspRender(inspection,badRange),/material range/);
const big=mesh();big.indices=Array(250_001*3).fill(0);
assert.throws(()=>auditHaloBspRender(inspection,big),/bounded audit budget/);
assert.throws(()=>auditHaloBspRender({...inspection,sha256:'bad'},mesh()),/SHA-256/);
const many=mesh();many.materialRanges=Array.from({length:135},(_,i)=>({
  shaderTagId:i+1000,bspIndex:0,indexStart:i*3,indexCount:3,lightmapPage:-1,hasLightmapUvs:false,
}));
many.positions=Array.from({length:135},(_,i)=>[i*3,0,0,i*3+1,0,0,i*3,1,0]).flat();
many.indices=Array.from({length:135},(_,i)=>[i*3,i*3+1,i*3+2]).flat();
many.uvs=Array.from({length:135},()=>[0,0,1,0,0,1]).flat();
many.lightmapUvs=[...many.uvs];
const dense=auditHaloBspRender(inspection,many);
assert.equal(dense.summary.warnings,135);
assert.equal(dense.findings.length,128);
assert.equal(dense.summary.omittedFindings,8);
assert.equal(dense.summary.infos,1);
const old=mesh();delete old.materialRanges;
assert.throws(()=>auditHaloBspRender(inspection,old),/No source-attributed/);
console.log('PASS: bounded compiled BSP render-material integrity, lightmap UV/page identity, degenerate triangles, malformed buffers, read-only acceptance claims');
