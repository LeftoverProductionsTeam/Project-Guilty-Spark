import { expect, it } from 'vitest';
import { DecodedBitmapCache } from './decodedBitmapCache';
import { decodeOwnedBitmapPreview, type OwnedBitmapPreview } from './ownedBitmapPreview';

it('keeps cached pixels private, refuses changed bytes and evicts the least recently used entry within its budget', () => {
  const cache = new DecodedBitmapCache(30, 2);
  const image = { width: 1, height: 1, format: 'BGRA8' as const, pixels: new Uint8Array([1, 2, 3, 4]) };
  cache.put('a', 'dds-a', image);
  image.pixels[0] = 99;
  const returned = cache.get('a', 'dds-a')!;
  expect([...returned.pixels]).toEqual([1, 2, 3, 4]);
  returned.pixels[1] = 99;
  expect([...cache.get('a', 'dds-a')!.pixels]).toEqual([1, 2, 3, 4]);
  cache.put('b', 'dds-b', image); // 32 bytes would exceed the 30-byte bound.
  expect(cache.get('a', 'dds-a')).toBeNull();
  expect(cache.get('b', 'dds-b')).not.toBeNull();
  expect(cache.get('b', 'different')).toBeNull();
  expect(cache.get('b', 'dds-b')).toBeNull();
});

function preview(word: number): OwnedBitmapPreview {
  const bytes = new Uint8Array(130),
    v = new DataView(bytes.buffer);
  bytes.set([68, 68, 83, 32]);
  for (const [offset, n] of [
    [4, 124],
    [12, 1],
    [16, 1],
    [20, 2],
    [76, 32],
    [80, 0x41],
    [88, 16],
    [92, 0x0f00],
    [96, 0x00f0],
    [100, 0x000f],
    [104, 0xf000],
  ])
    v.setUint32(offset, n, true);
  v.setUint16(128, word, true);
  return {
    bitmapTagId: 51,
    imageIndex: 0,
    width: 1,
    height: 1,
    format: 'A4R4G4B4',
    sourceSha256: 'd'.repeat(64),
    resourceSha256: 'e'.repeat(64),
    sourceKind: 'verified-resource',
    ddsBase64: btoa(String.fromCharCode(...bytes)),
  };
}
const target = { bitmapTagId: 51, sourceSha256: 'd'.repeat(64), resourceSha256: 'e'.repeat(64) };

it('still validates source, resource, dimensions, image and format when identical DDS pixels are resident', () => {
  const original = preview(0x8123);
  decodeOwnedBitmapPreview(original, target).pixels.fill(0);
  expect([...decodeOwnedBitmapPreview(original, target).pixels]).toEqual([17, 34, 51, 136]);
  for (const changed of [
    { ...original, sourceSha256: 'f'.repeat(64) },
    { ...original, resourceSha256: 'f'.repeat(64) },
    { ...original, width: 2 },
    { ...original, imageIndex: 1 },
    { ...original, format: 'A1R5G5B5' },
    { ...original, imageCount: 0 },
    { ...original, sharedNativeBitmapPath: 'bad\u0000path' },
  ])
    expect(() => decodeOwnedBitmapPreview(changed, target)).toThrow();
  expect(() => decodeOwnedBitmapPreview(original, { ...target, resourceSha256: 'f'.repeat(64) })).toThrow();
});

it('decodes changed pixels under the same metadata, rejects corrupt DDS and can recover using original bytes', () => {
  expect([...decodeOwnedBitmapPreview(preview(0x8123), target).pixels]).toEqual([17, 34, 51, 136]);
  expect([...decodeOwnedBitmapPreview(preview(0xf456), target).pixels]).toEqual([68, 85, 102, 255]);
  const broken = preview(0xf456);
  broken.ddsBase64 = 'AAAA' + broken.ddsBase64.slice(4);
  expect(() => decodeOwnedBitmapPreview(broken, target)).toThrow();
  expect([...decodeOwnedBitmapPreview(preview(0x8123), target).pixels]).toEqual([17, 34, 51, 136]);
});

it('immediately trims existing decoded pixels when the user lowers the budget',()=>{
 const cache=new DecodedBitmapCache(128);const image={width:1,height:1,format:'BGRA8' as const,pixels:new Uint8Array(4)};
 cache.put('one','dds',image);cache.put('two','dds',image);cache.setBudget(16);expect(cache.stats().estimatedBytes).toBeLessThanOrEqual(16);expect(cache.stats().evictions).toBeGreaterThan(0);
 expect(()=>cache.setBudget(Infinity)).toThrow();
});
