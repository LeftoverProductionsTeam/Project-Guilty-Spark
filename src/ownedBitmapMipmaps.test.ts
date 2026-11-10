import {beforeEach,describe,expect,it,vi} from 'vitest';
import {decodeOwnedBitmapBatch} from './ownedBitmapBatch';
import type {VerifiedBatchImage} from './ownedBitmapBatch';
const read=vi.hoisted(()=>vi.fn());vi.mock('./nativePreviewResources',()=>({nativePreviewResource:read}));
import {readOwnedBitmapMipmaps} from './ownedBitmapMipmaps';
const hash='a'.repeat(64),target={bitmapTagId:42,imageIndex:0,sourceSha256:hash,resourceSha256:null};
function base():VerifiedBatchImage{return{bitmapTagId:42,imageIndex:0,mipLevel:0,mipLevels:3,nativeMipmaps:2,imageCount:1,image:{width:4,height:4,format:'BGRA8',pixels:Uint8Array.from(Array.from({length:16},()=>[240,16,32,255]).flat())},sourceKind:'internal-cache',error:null};}
function result(level:number,size=4/2**level){
 const bytes=new Uint8Array(128+size*size*4),v=new DataView(bytes.buffer);bytes.set([68,68,83,32]);for(const[at,n]of[[4,124],[12,size],[16,size],[20,size*4],[76,32],[80,0x41],[88,32],[92,0xff0000],[96,0xff00],[100,0xff],[104,0xff000000]])v.setUint32(at,n,true);
 bytes.set(Array.from({length:size*size},()=>[56,208,24,255]).flat(),128);
 return{bitmapTagId:42,imageIndex:0,mipLevel:level,preview:{bitmapTagId:42,imageIndex:0,mipLevel:level,mipLevels:3,nativeMipmaps:2,imageCount:1,width:size,height:size,format:'BGRA8',sourceSha256:hash,sourceKind:'internal-cache' as const,ddsBase64:btoa(String.fromCharCode(...bytes))},error:null};
}
beforeEach(()=>read.mockReset());
describe('source-owned texture mip chains',()=>{
 it('retains exact distinct authored lower pixels, source requests and base ownership',async()=>{
  const original=base(),images=new Map([['42:0',original]]);read.mockResolvedValue({sourceSha256:hash,items:[result(1),result(2)]});
  const output=(await readOwnedBitmapMipmaps('owned',[target],images)).get('42:0')!;
  expect(output.originalMipmaps?.[0]).toBe(original.image);expect(original.originalMipmaps).toBeUndefined();
  expect(output.originalMipmaps?.map(m=>[m.width,m.height])).toEqual([[4,4],[2,2],[1,1]]);expect([...output.originalMipmaps![1].pixels.slice(0,4)]).toEqual([24,208,56,255]);
  expect(read).toHaveBeenCalledWith('preview_owned_cache_bitmap_batch',{projectId:'owned',requests:[{bitmapTagId:42,imageIndex:0,mipLevel:1},{bitmapTagId:42,imageIndex:0,mipLevel:2}]},hash);
 });
 it('refuses stale source identity and inconsistent lower dimensions',async()=>{
  const images=new Map([['42:0',base()]]);read.mockResolvedValueOnce({sourceSha256:'b'.repeat(64),items:[result(1),result(2)]});
  await expect(readOwnedBitmapMipmaps('owned',[target],images)).rejects.toThrow(/SHA-256/);
  read.mockResolvedValueOnce({sourceSha256:hash,items:[result(1,1),result(2)]});await expect(readOwnedBitmapMipmaps('owned',[target],images)).rejects.toThrow(/dimensions/);
 });
 it('keeps a valid base with an explicit diagnostic when any lower level is refused',async()=>{
  read.mockResolvedValue({sourceSha256:hash,items:[result(1),{bitmapTagId:42,imageIndex:0,mipLevel:2,preview:null,error:'truncated original level',errorCode:'unsupported-format'}]});const original=base();
  const entry=(await readOwnedBitmapMipmaps('owned',[target],new Map([['42:0',original]]))).get('42:0')!;expect(entry.originalMipmaps).toEqual([original.image]);expect(entry.mipError).toContain('truncated original level');expect(original.image!.pixels[0]).toBe(240);
 });
 it('does not reinterpret a compatible donor as a complete original chain',async()=>{
  const original={...base(),compatibleRuntime:'MCC',compatibleSourceSha256:'b'.repeat(64)};const entry=(await readOwnedBitmapMipmaps('owned',[target],new Map([['42:0',original]]))).get('42:0')!;
  expect(read).not.toHaveBeenCalled();expect(entry.originalMipmaps).toEqual([original.image]);expect(entry.mipError).toContain('base image');
 });
 it('enforces batch/unique/base bounds and stops native reads after cancellation',async()=>{
  const images=new Map([['42:0',base()]]);await expect(readOwnedBitmapMipmaps('owned',Array(25).fill(target),images)).rejects.toThrow(/bound/);await expect(readOwnedBitmapMipmaps('owned',[target,target],images)).rejects.toThrow(/Duplicate/);await expect(readOwnedBitmapMipmaps('owned',[{...target,mipLevel:1}],images)).rejects.toThrow(/base/);
  const entry=(await readOwnedBitmapMipmaps('owned',[target],images,()=>false)).get('42:0')!;expect(read).not.toHaveBeenCalled();expect(entry.originalMipmaps).toHaveLength(1);expect(entry.mipError).toContain('incomplete');
 });
});

describe('explicit native whole-chain response',()=>{
 const targetWithMips={...target,includeMips:true};const batch=()=>({sourceSha256:hash,items:[result(0)],mipItems:[result(1),result(2)]});
 it('uses verified returned levels without another native read',async()=>{
  const decoded=decodeOwnedBitmapBatch(batch(),[targetWithMips]),entry=decoded.get('42:0')!;expect(entry.originalMipmaps?.map(m=>m.width)).toEqual([4,2,1]);
  const output=await readOwnedBitmapMipmaps('owned',[targetWithMips],decoded);expect(read).not.toHaveBeenCalled();expect(output.get('42:0')!.originalMipmaps).toBe(entry.originalMipmaps);
 });
 it('refuses unsolicited, missing, reordered or differently shaped lower images',()=>{
  expect(()=>decodeOwnedBitmapBatch(batch(),[target])).toThrow(/Unsolicited/);
  expect(()=>decodeOwnedBitmapBatch({...batch(),mipItems:[]},[targetWithMips])).toThrow(/count/);
  expect(()=>decodeOwnedBitmapBatch({...batch(),mipItems:[result(2),result(1)]},[targetWithMips])).toThrow(/reordered/);
  expect(()=>decodeOwnedBitmapBatch({...batch(),mipItems:[result(1,1),result(2)]},[targetWithMips])).toThrow(/dimensions/);
 });
 it('keeps the base and a clear reason without retrying a native lower-level refusal',async()=>{
  const entry=decodeOwnedBitmapBatch({...batch(),mipItems:[result(1),{bitmapTagId:42,imageIndex:0,mipLevel:2,preview:null,error:'source level unavailable',errorCode:'verification-failed'}]},[targetWithMips]).get('42:0')!;
  expect(entry.originalMipmaps).toEqual([entry.image]);expect(entry.mipError).toContain('source level unavailable');
  const retained=await readOwnedBitmapMipmaps('owned',[targetWithMips],new Map([['42:0',entry]]));expect(read).not.toHaveBeenCalled();expect(retained.get('42:0')!.mipError).toBe(entry.mipError);
 });
 it('retries an aggregate native budget refusal in smaller verified level batches',async()=>{
  const reply={sourceSha256:hash,items:[result(0)],mipItems:[result(1),{bitmapTagId:42,imageIndex:0,mipLevel:2,preview:null,error:'combined packed limit',errorCode:'budget-exceeded'}]};
  const decoded=decodeOwnedBitmapBatch(reply,[targetWithMips]);read.mockResolvedValue({sourceSha256:hash,items:[result(1),result(2)]});
  const entry=(await readOwnedBitmapMipmaps('owned',[targetWithMips],decoded)).get('42:0')!;
  expect(read).toHaveBeenCalledTimes(1);expect(read.mock.calls[0][1]).toEqual({projectId:'owned',requests:[{bitmapTagId:42,imageIndex:0,mipLevel:1},{bitmapTagId:42,imageIndex:0,mipLevel:2}]});
  expect(entry.originalMipmaps?.map(m=>m.width)).toEqual([4,2,1]);expect(entry.mipError).toBeUndefined();
 });
 it('applies aggregate memory, source and resource guards to the entire response',()=>{
  const oversized=batch();oversized.items[0].preview.width=4096;oversized.items[0].preview.height=4096;expect(()=>decodeOwnedBitmapBatch(oversized,[targetWithMips])).toThrow(/budget/);
  expect(()=>decodeOwnedBitmapBatch({...batch(),sourceSha256:'b'.repeat(64)},[targetWithMips])).toThrow(/SHA-256/);
  const corrupt=batch();(corrupt.mipItems[0].preview as any).sourceKind='verified-resource';(corrupt.mipItems[0].preview as any).resourceSha256='c'.repeat(64);
  expect(()=>decodeOwnedBitmapBatch({...corrupt,resourceSha256:'b'.repeat(64)},[{...targetWithMips,resourceSha256:'b'.repeat(64)}])).toThrow(/resource/);
 });
});
