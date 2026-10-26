import assert from 'node:assert/strict';
import { decodeOwnedBitmapPreview } from '../src/ownedBitmapPreview.ts';
const hash='f'.repeat(64), id=0x12340001;
function dds() {
  const b=new Uint8Array(128+8);
  const v=new DataView(b.buffer);
  b.set([68,68,83,32]);v.setUint32(4,124,true);v.setUint32(8,0x81007,true);
  v.setUint32(12,4,true);v.setUint32(16,4,true);v.setUint32(20,8,true);
  v.setUint32(76,32,true);v.setUint32(80,4,true);
  b.set([68,88,84,49],84);v.setUint32(108,0x1000,true);
  // Red 565 endpoint and four red pixels per 4x4 block.
  b.set([0,0xf8,0,0,0,0,0,0],128);
  return Buffer.from(b).toString('base64');
}
const preview={bitmapTagId:id,imageIndex:0,width:4,height:4,format:'DXT1',sourceSha256:hash,ddsBase64:dds()};
const target={bitmapTagId:id,sourceSha256:hash};
const image=decodeOwnedBitmapPreview(preview,target);
assert.equal(image.width,4);assert.equal(image.height,4);assert.deepEqual([...image.pixels.slice(0,4)],[255,0,0,255]);
assert.throws(()=>decodeOwnedBitmapPreview({...preview,bitmapTagId:id+1},target),/different tag/);
assert.deepEqual(decodeOwnedBitmapPreview({...preview,imageIndex:2},{...target,imageIndex:2}).pixels,image.pixels);
assert.throws(()=>decodeOwnedBitmapPreview({...preview,imageIndex:2},target),/different tag or mipmap/);
assert.throws(()=>decodeOwnedBitmapPreview(preview,{...target,imageIndex:2048}),/different tag or mipmap/);
assert.throws(()=>decodeOwnedBitmapPreview({...preview,sourceSha256:'0'.repeat(64)},target),/changed/);
assert.throws(()=>decodeOwnedBitmapPreview({...preview,format:'BC7'},target),/format/);
assert.throws(()=>decodeOwnedBitmapPreview({...preview,height:2},target),/conflicts/);
assert.throws(()=>decodeOwnedBitmapPreview({...preview,ddsBase64:'!garbage!'},target),/Malformed/);
assert.throws(()=>decodeOwnedBitmapPreview({...preview,ddsBase64:'A'.repeat(23*1024*1024+4)},target),/Malformed/);
console.log('Owned cache bitmap preview protocol: exact-source identity, top-mip pixels, format, dimensions and malformed payload tests passed');
