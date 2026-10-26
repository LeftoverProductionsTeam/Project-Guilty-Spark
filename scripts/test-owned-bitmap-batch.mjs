import assert from 'node:assert/strict';
import {bitmapImageKey,uniqueBitmapTargets,decodeOwnedBitmapBatch,MAX_NATIVE_BITMAP_BATCH} from '../src/ownedBitmapBatch.ts';
const sha='a'.repeat(64),resource='b'.repeat(64);
const first={bitmapTagId:42,imageIndex:0},second={bitmapTagId:43,imageIndex:2};
const requests=uniqueBitmapTargets([first,second,first],sha,resource);
assert.equal(requests.length,2);
assert.equal(MAX_NATIVE_BITMAP_BATCH,24);
assert.equal(bitmapImageKey(42,2),'42:2');
assert.throws(()=>bitmapImageKey(2,2048),/key/);
assert.throws(()=>uniqueBitmapTargets(Array.from({length:25},(_,i)=>({bitmapTagId:i,imageIndex:0})),sha),/24/);
const dds=new Uint8Array(128+8),d=new DataView(dds.buffer);
dds.set([68,68,83,32]);d.setUint32(4,124,true);d.setUint32(8,0x81007,true);
d.setUint32(12,4,true);d.setUint32(16,4,true);d.setUint32(20,8,true);
d.setUint32(76,32,true);d.setUint32(80,4,true);dds.set([68,88,84,49],84);
d.setUint32(108,0x1000,true);dds.set([0,0xf8,0,0,0,0,0,0],128);
const image={bitmapTagId:42,imageIndex:0,width:4,height:4,format:'DXT1',sourceSha256:sha,
  ddsBase64:Buffer.from(dds).toString('base64'),sourceKind:'internal-cache'};
const good={sourceSha256:sha,resourceSha256:null,items:[
  {...first,preview:image,error:null},
  {...second,preview:null,error:'Unsupported format'},
]};
let decoded=decodeOwnedBitmapBatch(good,requests);
assert.deepEqual([...decoded.keys()],['42:0','43:2']);
assert.deepEqual([...decoded.get('42:0').image.pixels.slice(0,4)],[255,0,0,255]);
assert.equal(decoded.get('43:2').image,null);
assert.throws(()=>decodeOwnedBitmapBatch({...good,sourceSha256:resource},requests),/SHA-256/);
assert.throws(()=>decodeOwnedBitmapBatch({...good,resourceSha256:resource},uniqueBitmapTargets([first,second],sha)),/resource/);
assert.throws(()=>decodeOwnedBitmapBatch({...good,items:[good.items[1],good.items[0]]},requests),/reordered/);
assert.throws(()=>decodeOwnedBitmapBatch({...good,items:[good.items[0]]},requests),/count/);
assert.throws(()=>decodeOwnedBitmapBatch({...good,items:[{...good.items[0],error:'also failed'},good.items[1]]},requests),/either a preview/);
assert.throws(()=>decodeOwnedBitmapBatch({...good,items:[{...good.items[0],preview:{...image,sourceSha256:resource}},good.items[1]]},requests),/changed/);
assert.throws(()=>decodeOwnedBitmapBatch({...good,items:[{...good.items[0],preview:{...image,width:4096,height:4096}},good.items[1]]},requests),/conflicts/);
assert.throws(()=>decodeOwnedBitmapBatch({...good,items:[{...good.items[0],preview:{...image,ddsBase64:'A'.repeat(23*1024*1024+1)}},good.items[1]]},requests),/Oversized/);
assert.throws(()=>decodeOwnedBitmapBatch(good,[requests[0],requests[0]]),/Duplicate/);
assert.throws(()=>decodeOwnedBitmapBatch({...good,items:[{...good.items[0],preview:{...image,sourceKind:'verified-resource',resourceSha256:resource}},good.items[1]]},uniqueBitmapTargets([first,second],sha)),/resource/);
assert.equal(decodeOwnedBitmapBatch({...good,resourceSha256:resource,items:[{...good.items[0],preview:{...image,sourceKind:'verified-resource',resourceSha256:resource}},good.items[1]]},requests).get('42:0').sourceKind,'verified-resource');
console.log('PASS: pinned native bitmap batch protocol, bounded memory, exact order, per-image refusals, stale/hijacked resource protection');
