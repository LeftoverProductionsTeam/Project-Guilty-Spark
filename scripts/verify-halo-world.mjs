#!/usr/bin/env node
/**
 * Independent, read-only verification of Halo Demo/PC/CE BSP render streams.
 * Requires a user-owned .map. Does not extract copyrighted asset data.
 * The test checks the BSP pointer mapping, vertex normals, UVs and triangles.
 */
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
const filename = process.argv[2];
if (!filename) { console.error('Usage: node scripts/verify-halo-world.mjs <user-owned-bloodgulch.map>'); process.exit(2); }
const path = resolve(filename);
const size = (await stat(path)).size;
if (size < 2048 || size > 512 * 1024 * 1024) throw new Error('Unsupported map size');
const b = await readFile(path);
const range = (at, n = 4) => {
  if (!Number.isSafeInteger(at) || at < 0 || at + n > b.length) throw new Error(`Out-of-bounds map read @${at}`);
  return at;
};
const u32 = (at) => b.readUInt32LE(range(at));
const u16 = (at) => b.readUInt16LE(range(at, 2));
const f32 = (at) => b.readFloatLE(range(at));
const demo = u32(0x2c0) === 0x45686564 && u32(0x5f0) === 0x47666f74;
const version = u32(demo ? 0x588 : 4);
if (![6, 7, 609].includes(version)) throw new Error('Only PC-family Halo CE formats supported');
const tagStart = u32(demo ? 0x5ec : 0x10);
const tagSize = u32(demo ? 0x2c4 : 0x14);
const tagEnd = tagStart + tagSize;
range(tagStart, tagSize);
const magic = version === 6 ? 0x4bf10000 : 0x40440000;
const tagPtr = (p, length = 1) => {
  const at = tagStart + p - magic;
  if (at < tagStart || at + length > tagEnd) throw new Error('Tag pointer escapes tag region');
  return range(at, length);
};
const count = u32(tagStart + 12);
if (count < 1 || count > 65535) throw new Error('Invalid tag count');
const table = tagPtr(u32(tagStart), count * 32);
const scenarioId = u32(tagStart + 4);
let scenario = null;
for (let i=0; i<count; i++) {
  const row = table + i*32;
  if (u32(row+12) === scenarioId) { scenario = tagPtr(u32(row+20)); break; }
}
if (scenario === null) throw new Error('No scenario tag');
const bspCount = u32(scenario + 0x5a4);
if (!bspCount || bspCount > 16) throw new Error('Unexpected BSP count');
const bspList = tagPtr(u32(scenario + 0x5a8), bspCount * 32);
const summary = { map: path, version, bspCount, materials: 0, vertices: 0, triangles: 0, surfaceCount: 0, errors: [] };
for (let bi=0; bi<bspCount; bi++) {
  const desc = bspList + bi*32;
  const begin = u32(desc), length=u32(desc+4), base=u32(desc+8);
  range(begin, length);
  const bspPtr = (p, len=1) => {
    const at=begin+p-base;
    if (at<begin || at+len>begin+length) throw new Error(`BSP pointer escapes BSP ${bi}`);
    return range(at,len);
  };
  const bsp = bspPtr(u32(begin), 648);
  const surfaceCount = u32(bsp+0xf8);
  if (surfaceCount>500000) throw new Error('Excessive BSP surfaces');
  summary.surfaceCount += surfaceCount;
  const surfaces=bspPtr(u32(bsp+0xfc),surfaceCount*6);
  const lightmaps=u32(bsp+0x104);
  if(lightmaps>256) throw new Error('Excessive BSP lightmaps');
  const lights=bspPtr(u32(bsp+0x108),lightmaps*32);
  for (let l=0; l<lightmaps; l++) {
    const light=lights+l*32;
    const materialCount=u32(light+20);
    if(materialCount>2048) throw new Error('Excessive material count');
    if(!materialCount) continue;
    const materials=bspPtr(u32(light+24),materialCount*256);
    for(let m=0; m<materialCount; m++) {
      const mat=materials+m*256;
      const first=u32(mat+20),triangles=u32(mat+24),type=u16(mat+176),vertices=u32(mat+180);
      if(!triangles || !vertices) continue;
      if(type!==0) {summary.errors.push(`BSP ${bi} material ${l}/${m}: compressed or unsupported vertex type ${type}`);continue;}
      if(first+triangles>surfaceCount || vertices>100000) throw new Error('Material surface/index bounds failed');
      const required=vertices*56;
      if(u32(mat+216)<required) throw new Error('Truncated vertex data size');
      const at=bspPtr(u32(mat+228),required);
      for(let v=0; v<vertices; v++) {
        const p=at+v*56;
        const pos=[f32(p),f32(p+4),f32(p+8)];
        const n=[f32(p+12),f32(p+16),f32(p+20)];
        const uv=[f32(p+48),f32(p+52)];
        const nsq=n.reduce((sum,a)=>sum+a*a,0);
        if(pos.some(a=>!Number.isFinite(a) || Math.abs(a)>5000) || nsq<0.5 || nsq>1.5 || uv.some(a=>!Number.isFinite(a) || Math.abs(a)>10000)) {
          throw new Error(`BSP ${bi} material ${l}/${m} vertex ${v} invalid: raw-data pointer may be wrong`);
        }
      }
      for(let t=first; t<first+triangles; t++) {
        const p=surfaces+t*6;
        if(u16(p)>=vertices || u16(p+2)>=vertices || u16(p+4)>=vertices) throw new Error('Out-of-range triangle');
      }
      summary.materials++;
      summary.vertices+=vertices;
      summary.triangles+=triangles;
    }
  }
}
summary.verifiedScope='BSP render-geometry structure and bounds only; no shader, screenshot, game compilation, or runtime verification';
console.log(JSON.stringify(summary,null,2));
if(summary.triangles===0 || summary.errors.length>0) process.exitCode=1;
