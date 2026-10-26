import assert from 'node:assert/strict';
import { decodeHaloDds } from '../src/haloDds.ts';
function dds(fmt,w=4,h=4) {
  const data=new ArrayBuffer(128+Math.ceil(w/4)*Math.ceil(h/4)*(fmt==='DXT1'?8:16));
  const v=new DataView(data), cc=(p,s)=>{for(let i=0;i<4;i++)v.setUint8(p+i,s.charCodeAt(i))};
  cc(0,'DDS ');v.setUint32(4,124,true);v.setUint32(76,32,true);v.setUint32(12,h,true);v.setUint32(16,w,true);cc(84,fmt);
  return {data,v};
}
{
  const {data,v}=dds('DXT1'); v.setUint16(128,0xf800,true);v.setUint16(130,0x07e0,true);v.setUint32(132,0,true);
  const result=decodeHaloDds(data);assert.deepEqual([...result.pixels.slice(0,4)],[255,0,0,255]);
  assert.equal(result.pixels.length,64);
}
{
  const {data,v}=dds('DXT1',5,4);v.setUint16(128,0x001f,true);v.setUint16(130,0x0000,true);
  const result=decodeHaloDds(data);assert.equal(result.pixels.length,80);assert.equal(result.pixels[0],0);assert.equal(result.pixels[2],255);
}
{
  const {data,v}=dds('DXT3');v.setUint8(128,0x0f);v.setUint16(136,0x001f,true);v.setUint16(138,0x0000,true);
  const result=decodeHaloDds(data);assert.equal(result.pixels[3],255);assert.equal(result.pixels[7],0);
}
{
  const {data,v}=dds('DXT5');v.setUint8(128,200);v.setUint8(129,20);v.setUint16(136,0xf800,true);
  const result=decodeHaloDds(data);assert.equal(result.pixels[3],200);
}
{
  const {data,v}=dds('DXT1');v.setUint32(16,5000,true);assert.throws(()=>decodeHaloDds(data),/dimensions/);
  v.setUint32(16,4,true);v.setUint32(84,0,true);assert.throws(()=>decodeHaloDds(data),/Unsupported/);
  assert.throws(()=>decodeHaloDds(data.slice(0,129)),/truncated|format/);
}
{
  // Synthetic DDS with 32-bit BGRA pixels and a padded row: checks channel
  // masks, alpha and pitched rows independent of any game asset.
  const data=new ArrayBuffer(128+16*2),v=new DataView(data);
  const cc=(at,str)=>{for(let i=0;i<4;i++)v.setUint8(at+i,str.charCodeAt(i))};
  cc(0,'DDS ');v.setUint32(4,124,true);v.setUint32(76,32,true);
  v.setUint32(12,2,true);v.setUint32(16,2,true);v.setUint32(20,16,true);
  v.setUint32(80,0x41,true);v.setUint32(88,32,true);
  v.setUint32(92,0xff0000,true);v.setUint32(96,0xff00,true);
  v.setUint32(100,0xff,true);v.setUint32(104,0xff000000,true);
  v.setUint8(128,13);v.setUint8(129,17);v.setUint8(130,21);v.setUint8(131,127);
  v.setUint8(144,37);v.setUint8(145,41);v.setUint8(146,43);v.setUint8(147,200);
  const image=decodeHaloDds(data);
  assert.equal(image.format,'BGRA8');assert.deepEqual([...image.pixels.slice(0,4)],[21,17,13,127]);
  assert.deepEqual([...image.pixels.slice(8,12)],[43,41,37,200]);
  v.setUint32(92,0xff,true);v.setUint32(100,0xff0000,true);
  assert.equal(decodeHaloDds(data).format,'RGBA8');
  v.setUint32(92,0x3ff,true);assert.throws(()=>decodeHaloDds(data),/masks/);
  v.setUint32(92,0xff,true);v.setUint32(112,0x200,true);
  assert.throws(()=>decodeHaloDds(data),/Volume and cubemap/);
  v.setUint32(112,0,true);v.setUint32(20,7,true);
  assert.throws(()=>decodeHaloDds(data),/truncated/);
}
console.log('PASS: DXT1/3/5 and 32-bit RGBA/BGRA DDS, padded rows, cubemap/mask/pitch rejection and bounded source decode');
