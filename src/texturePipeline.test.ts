import {describe,expect,it} from 'vitest';
import {decodeHaloDds} from './haloDds';
import {summarizeTextureFailures} from './textureDiagnostics';
import {playerStartCamera} from './sourceCamera';
import type {SceneObject} from './types';
function rgb565(){const b=new ArrayBuffer(136),v=new DataView(b);new Uint8Array(b).set([68,68,83,32]);
  for(const [at,n] of [[4,124],[12,1],[16,3],[20,8],[76,32],[80,0x40],[88,16],[92,0xf800],[96,0x7e0],[100,0x1f]])v.setUint32(at,n,true);
  v.setUint16(128,0xf800,true);v.setUint16(130,0x07e0,true);v.setUint16(132,0x001f,true);return b;}
describe('classic RGB565 lightmaps',()=>{
  it('decodes RGB endpoints with opaque alpha and skips row padding',()=>{const image=decodeHaloDds(rgb565());expect(image.format).toBe('R5G6B5');expect([...image.pixels]).toEqual([255,0,0,255,0,255,0,255,0,0,255,255]);});
  it('rejects incorrect masks and truncated pitches',()=>{const b=rgb565();new DataView(b).setUint32(92,0x7c00,true);expect(()=>decodeHaloDds(b)).toThrow('masks');expect(()=>decodeHaloDds(rgb565().slice(0,133))).toThrow('truncated');});
  it('refuses volumetric resources through the flat decoder',()=>{const b=rgb565();new DataView(b).setUint32(24,4,true);expect(()=>decodeHaloDds(b)).toThrow('Volume');});
});
describe('measured texture diagnostics',()=>{
  it('keeps missing, format and verification counts separate',()=>{const entry={bitmapTagId:1,imageIndex:0,reason:'test'};
    expect(summarizeTextureFailures([{...entry,code:'missing-resource'},{...entry,bitmapTagId:2,code:'missing-resource'},
      {...entry,code:'unsupported-format'},{...entry,code:'verification-failed'}])).toBe('2 need Halo Textures, 1 use unsupported pixel formats, 1 failed verification');});
  it('does not invent a refusal when every request succeeded',()=>expect(summarizeTextureFailures([])).toBe(''));
});

describe('luminance and alpha source images',()=>{
  function image(flags:number,bits:number,red:number,alpha:number,raw:number[]){
    const b=new ArrayBuffer(128+raw.length),v=new DataView(b);new Uint8Array(b).set([68,68,83,32]);
    for(const [at,n] of [[4,124],[12,1],[16,2],[20,raw.length],[76,32],[80,flags],[88,bits],[92,red],[104,alpha]])v.setUint32(at,n,true);
    new Uint8Array(b,128).set(raw);return b;
  }
  it('preserves A8 opacity without darkening its colour',()=>expect([...decodeHaloDds(image(2,8,0,255,[0,192])).pixels]).toEqual([255,255,255,0,255,255,255,192]));
  it('expands luminance and independent opacity',()=>{
    expect([...decodeHaloDds(image(0x20000,8,255,0,[32,240])).pixels]).toEqual([32,32,32,255,240,240,240,255]);
    expect([...decodeHaloDds(image(0x20001,16,255,0xff00,[32,64,240,128])).pixels]).toEqual([32,32,32,64,240,240,240,128]);
  });
  it('refuses wrong channel masks and truncated alpha rows',()=>{
    expect(()=>decodeHaloDds(image(2,8,255,255,[0,192]))).toThrow('masks');
    expect(()=>decodeHaloDds(image(0x20001,16,255,0xff00,[32,64,240]))).toThrow('truncated');
  });
});

describe('viewing a source map from a player start',()=>{
  const start={position:[12,-8,3],rotation:[Math.PI/2,0,0]} as SceneObject;
  it('uses the authored position and world Z yaw rather than the map overview camera',()=>{
    const pose=playerStartCamera(start);expect(pose.position).toEqual([12,-8,3.62]);
    expect(pose.target[0]).toBeCloseTo(12);expect(pose.target[1]).toBeCloseTo(4);expect(pose.target[2]).toBeCloseTo(3.62);
  });
  it('retains source transforms when calculating a pitched view',()=>{
    const original=structuredClone(start);const pose=playerStartCamera({...start,rotation:[0,Math.PI/4,0]});
    expect(pose.target[2]).toBeGreaterThan(pose.position[2]);expect(start).toEqual(original);
  });
});
