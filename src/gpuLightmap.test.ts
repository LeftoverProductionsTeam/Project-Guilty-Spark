import { expect, it } from 'vitest';
import { encodeAetherLightmapPage } from './gpuLightmap';

it('exports a bottom-origin BGR source page with padding and unchanged bake values', () => {
  const size = 256;
  const pixels = new Float32Array(size*size*4);
  pixels.set([0.25,0.5,1,1]);
  const bytes = encodeAetherLightmapPage({size,pixels});
  const header = new DataView(bytes.buffer);
  expect([bytes[2],header.getUint16(12,true),header.getUint16(14,true),bytes[16],bytes[17]])
    .toEqual([2,size,size,24,0]);
  expect([...bytes.subarray(18,30)]).toEqual([255,128,64,255,128,64,255,128,64,0,0,0]);
  expect([...bytes.subarray(18+size*3,21+size*3)]).toEqual([255,128,64]);
  expect([...bytes.subarray(18+(size-1)*3,18+size*3)]).toEqual([0,0,0]);
  expect([...pixels.subarray(0,8)]).toEqual([0.25,0.5,1,1,0,0,0,0]);
});
