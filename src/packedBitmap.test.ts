import {describe,expect,it} from 'vitest';
import {decodeHaloDds} from './haloDds';
import {decodeOwnedBitmapPreview} from './ownedBitmapPreview';
function packed(kind:'1555'|'4444',words:number[],width=words.length,pitch=width*2){
  const height=Math.ceil(words.length/width),buffer=new ArrayBuffer(128+pitch*height),v=new DataView(buffer);
  new Uint8Array(buffer).set([68,68,83,32]);
  for(const [at,n]of [[4,124],[12,height],[16,width],[20,pitch],[76,32],[80,0x41],[88,16],[92,kind==='1555'?0x7c00:0x0f00],[96,kind==='1555'?0x03e0:0x00f0],[100,kind==='1555'?0x001f:0x000f],[104,kind==='1555'?0x8000:0xf000]])v.setUint32(at,n,true);
  words.forEach((word,i)=>v.setUint16(128+Math.floor(i/width)*pitch+(i%width)*2,word,true));return buffer;
}
describe('original packed Halo color pixels',()=>{
  it('retains 1555 color under zero alpha and skips row padding',()=>{
    const result=decodeHaloDds(packed('1555',[0x7c00,0x83e0,0x801f,0xffff],2,6));
    expect(result.format).toBe('A1R5G5B5');
    expect([...result.pixels]).toEqual([255,0,0,0,0,255,0,255,0,0,255,255,255,255,255,255]);
  });
  it('retains all sixteen 4444 alpha levels and channel ordering',()=>{
    const result=decodeHaloDds(packed('4444',Array.from({length:16},(_,i)=>(i<<12)|0x123)));
    expect(result.format).toBe('A4R4G4B4');
    for(let i=0;i<16;i++)expect([...result.pixels.slice(i*4,i*4+4)]).toEqual([17,34,51,i*17]);
  });
  it('rejects contradictory alpha flags, overlapping masks, short pitch and truncated pixels',()=>{
    for(const [offset,value]of [[80,0x40],[80,0x20041],[96,0x7c00],[104,0x000f],[20,1]]){
      const bytes=packed('1555',[0xFFFF,0]);new DataView(bytes).setUint32(offset,value,true);
      expect(()=>decodeHaloDds(bytes)).toThrow();
    }
    expect(()=>decodeHaloDds(packed('4444',[0xFFFF]).slice(0,129))).toThrow('truncated');
  });
  it('uses the existing source/resource identity bridge and refuses a false format or resource pin',()=>{
    const bytes=packed('4444',[0x8123]),base64=btoa(String.fromCharCode(...new Uint8Array(bytes)));
    const preview={bitmapTagId:7,imageIndex:0,width:1,height:1,format:'A4R4G4B4',sourceSha256:'a'.repeat(64),resourceSha256:'b'.repeat(64),sourceKind:'verified-resource' as const,ddsBase64:base64};
    const target={bitmapTagId:7,sourceSha256:'a'.repeat(64),resourceSha256:'b'.repeat(64)};
    expect([...decodeOwnedBitmapPreview(preview,target).pixels]).toEqual([17,34,51,136]);
    expect(()=>decodeOwnedBitmapPreview({...preview,format:'A1R5G5B5'},target)).toThrow('conflicts');
    expect(()=>decodeOwnedBitmapPreview(preview,{...target,resourceSha256:'c'.repeat(64)})).toThrow('changed');
  });
});
