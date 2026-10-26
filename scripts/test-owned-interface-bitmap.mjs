import assert from 'node:assert/strict';
import { pinOwnedInterfaceBitmap, matchesOwnedInterfaceBitmap, validLocalInterfaceBitmapRef, decodeBoundedInterfaceBitmap } from '../src/ownedInterfaceBitmap.ts';
import { sanitizeInterfacePreferences, DEFAULT_INTERFACE } from '../src/interfacePreferences.ts';
const hash='a'.repeat(64);
const project={id:'owned',source:{sha256:hash}};
const inspection={sha256:hash,tags:[{id:45,class:'bitm',path:'ui/hud'},{id:46,class:'snd!',path:'audio/menu'}]};
const ref=pinOwnedInterfaceBitmap(project,inspection,45);
assert.deepEqual(ref,{projectId:'owned',bitmapTagId:45,sourceSha256:hash});
assert.equal(matchesOwnedInterfaceBitmap(ref,project,inspection),true);
assert.equal(matchesOwnedInterfaceBitmap(ref,{...project,id:'other'},inspection),false);
assert.equal(matchesOwnedInterfaceBitmap(ref,project,{...inspection,sha256:'b'.repeat(64)}),false);
assert.equal(matchesOwnedInterfaceBitmap(ref,project,{...inspection,tags:[]}),false);
assert.throws(()=>pinOwnedInterfaceBitmap(project,inspection,46),/not a verified bitmap/);
assert.throws(()=>pinOwnedInterfaceBitmap({...project,source:{sha256:'0'.repeat(64)}},inspection,45),/exact-source/);
assert.equal(validLocalInterfaceBitmapRef({...ref,sourceSha256:'incorrect'}),false);
const prefs=sanitizeInterfacePreferences({...DEFAULT_INTERFACE,bitmap:ref});
assert.deepEqual(prefs.bitmap,ref);
assert.equal(sanitizeInterfacePreferences({...DEFAULT_INTERFACE,bitmap:{...ref,bitmapTagId:-1}}).bitmap,null);
assert.equal(sanitizeInterfacePreferences({...DEFAULT_INTERFACE,bitmap:{...ref,sourceSha256:'z'.repeat(64)}}).bitmap,null);
assert.throws(()=>decodeBoundedInterfaceBitmap({bitmapTagId:45,sourceSha256:'bad',imageIndex:0},ref,null),/Source map changed/);
const dds=new Uint8Array(136);
const view=new DataView(dds.buffer);
dds.set([68,68,83,32]);view.setUint32(4,124,true);view.setUint32(8,0x81007,true);
view.setUint32(12,4,true);view.setUint32(16,4,true);view.setUint32(20,8,true);
view.setUint32(76,32,true);view.setUint32(80,4,true);
dds.set([68,88,84,49],84);view.setUint32(108,0x1000,true);
dds.set([0,0xf8,0,0,0,0,0,0],128);
const ownedPreview={bitmapTagId:45,imageIndex:0,width:4,height:4,format:'DXT1',sourceSha256:hash,
 ddsBase64:Buffer.from(dds).toString('base64'),sourceKind:'internal-cache'};
assert.deepEqual([...decodeBoundedInterfaceBitmap(ownedPreview,ref,null).pixels.slice(0,4)],[255,0,0,255],
  'actual owned DXT1 decode can power an in-memory UI header when the selected source is exact');
assert.throws(()=>decodeBoundedInterfaceBitmap({...ownedPreview,sourceKind:'verified-resource',resourceSha256:'b'.repeat(64)},ref,null),/external bitmap resource changed/i);

console.log('PASS: user-owned interface bitmap references are pinned, verified on reopen, bounded and never persist Halo image bytes');
