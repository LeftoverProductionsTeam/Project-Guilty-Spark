import assert from 'node:assert/strict';
import { decodeOwnedBitmapPreview } from '../src/ownedBitmapPreview.ts';
import { verifyResourceAudit } from '../src/resourceAudit.ts';
const cache = 'a'.repeat(64), resource = 'b'.repeat(64);
function fixtureDDS() {
  const bytes=new Uint8Array(136), view=new DataView(bytes.buffer);
  bytes.set([68,68,83,32]);view.setUint32(4,124,true);view.setUint32(8,0x81007,true);
  view.setUint32(12,4,true);view.setUint32(16,4,true);view.setUint32(20,8,true);
  view.setUint32(76,32,true);view.setUint32(80,4,true);
  bytes.set([68,88,84,49],84);view.setUint32(108,0x1000,true);
  bytes.set([0,0xf8,0,0,0,0,0,0],128);
  return Buffer.from(bytes).toString('base64');
}
const ext={bitmapTagId:3,imageIndex:0,width:4,height:4,format:'DXT1',sourceSha256:cache,
  sourceKind:'verified-resource',resourceSha256:resource,ddsBase64:fixtureDDS()};
const target={bitmapTagId:3,sourceSha256:cache,resourceSha256:resource};
assert.equal(decodeOwnedBitmapPreview(ext,target).pixels[0],255);
assert.throws(()=>decodeOwnedBitmapPreview(ext,{...target,resourceSha256:undefined}),/not pinned/);
assert.throws(()=>decodeOwnedBitmapPreview(ext,{...target,resourceSha256:'f'.repeat(64)}),/changed/);
assert.throws(()=>decodeOwnedBitmapPreview({...ext,resourceSha256:undefined},target),/changed/);
assert.throws(()=>decodeOwnedBitmapPreview({...ext,sourceKind:'auto-fuzzy'},target),/storage kind/);
assert.throws(()=>decodeOwnedBitmapPreview({...ext,sourceKind:'internal-cache'},target),/unexpectedly includes/);
assert.equal(decodeOwnedBitmapPreview({...ext,sourceKind:'internal-cache',resourceSha256:null},target).width,4);
const audit={kindCode:0,resourceCount:10,exactBitmapPathMatches:2,missingBitmapPathMatches:1,
  ambiguousBitmapPaths:0,resourceSha256:resource,warning:'Index inspection only'};
assert.equal(verifyResourceAudit(audit,resource).resourceCount,10);
assert.equal(verifyResourceAudit({...audit,kindCode:1},resource).kindCode,1);
assert.throws(()=>verifyResourceAudit({...audit,resourceSha256:cache},resource),/different/);
assert.throws(()=>verifyResourceAudit({...audit,exactBitmapPathMatches:11},resource),/Malformed/);
assert.throws(()=>verifyResourceAudit({...audit,resourceCount:0},resource),/Unsupported/);
console.log('PASS: pinned external bitmap identity, no fuzzy source, bounded audit metadata');
