import assert from 'node:assert/strict';
import {encodeHaloSourceTiff} from '../src/haloTiff.ts';
import {decodeHaloDds} from '../src/haloDds.ts';
const pixels=new Uint8Array([255,0,0,255, 0,255,0,127, 0,0,255,0, 12,34,56,78]);
const tif=encodeHaloSourceTiff({width:2,height:2,pixels});
const view=new DataView(tif.buffer);
assert.equal(view.getUint16(0,true),0x4949);
assert.equal(view.getUint16(2,true),42);
const at=view.getUint32(4,true);
assert.equal(view.getUint16(at,true),15);
const tags=new Map();
for(let i=0;i<15;i++){
 const o=at+2+12*i;
 tags.set(view.getUint16(o,true),{type:view.getUint16(o+2,true),count:view.getUint32(o+4,true),value:view.getUint32(o+8,true)});
}
for(const tag of [0x100,0x101,0x102,0x103,0x106,0x111,0x115,0x117,0x152])assert.ok(tags.has(tag));
assert.equal(tags.get(0x117).value,16);
assert.deepEqual([...tif.slice(tags.get(0x111).value)],[...pixels]);
assert.equal(tags.get(0x152).value,2,'straight alpha is explicitly declared');
assert.deepEqual([...encodeHaloSourceTiff({width:2,height:2,pixels})],[...tif],'TIFF output deterministic');
assert.throws(()=>encodeHaloSourceTiff({width:4097,height:1,pixels}),/dimensions/);
assert.throws(()=>encodeHaloSourceTiff({width:2,height:2,pixels:new Uint8Array(8)}),/exactly one/);
assert.throws(()=>encodeHaloSourceTiff({width:2,height:2,pixels:new Uint8Array(64)}),/exactly one/);
// DDS preview -> TIFF source path; no game/tool interaction.
const buffer=new ArrayBuffer(136),dds=new DataView(buffer);
for(const [i,c] of [...'DDS '].entries())dds.setUint8(i,c.charCodeAt(0));
dds.setUint32(4,124,true);dds.setUint32(76,32,true);dds.setUint32(12,4,true);dds.setUint32(16,4,true);
for(const [i,c] of [...'DXT1'].entries())dds.setUint8(84+i,c.charCodeAt(0));
dds.setUint16(128,0xf800,true);dds.setUint16(130,0x07e0,true);
const rgba=decodeHaloDds(buffer);
const converted=encodeHaloSourceTiff(rgba);
assert.deepEqual([...converted.slice(converted.length-64,converted.length-60)],[255,0,0,255]);
console.log('PASS: standards-based baseline TIFF RGBA, explicit alpha, bounds, determinism and DDS source roundtrip');
