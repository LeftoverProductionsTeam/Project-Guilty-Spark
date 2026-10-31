import { expect, it } from 'vitest';
import { decodeReflectionCube } from './ownedReflectionCube';
import type { OwnedCubeResponse } from './ownedReflectionCube';
const source = 'a'.repeat(64);
function cube(): OwnedCubeResponse {
  const dds = new Uint8Array(136),
    view = new DataView(dds.buffer);
  const put = (at: number, n: number) => view.setUint32(at, n, true);
  dds.set(new TextEncoder().encode('DDS '));
  put(4, 124);
  put(8, 0x81007);
  put(12, 4);
  put(16, 4);
  put(20, 8);
  put(76, 32);
  put(80, 4);
  dds.set(new TextEncoder().encode('DXT1'), 84);
  put(108, 0x1000);
  return {
    sourceSha256: source,
    resourceSha256: null,
    bitmapTagId: 7,
    faces: Array.from({ length: 6 }, () => ({
      bitmapTagId: 7,
      imageIndex: 0,
      width: 4,
      height: 4,
      format: 'DXT1',
      sourceSha256: source,
      ddsBase64: Buffer.from(dds).toString('base64'),
      sourceKind: 'internal-cache',
    })),
  };
}
it('decodes six exact source faces without a different image or resource identity', () => {
  const value = cube();
  const decoded = decodeReflectionCube(value, source, 7, {});
  expect(decoded.faces).toHaveLength(6);
  expect(decoded.bytes).toBe(6 * 4 * 4 * 4);
  for (const changed of [
    { ...value, bitmapTagId: 8 },
    { ...value, sourceSha256: 'b'.repeat(64) },
    { ...value, faces: value.faces.slice(1) },
    { ...value, resourceSha256: 'b'.repeat(64) },
  ])
    expect(() => decodeReflectionCube(changed, source, 7, {})).toThrow();
  value.faces[3] = { ...value.faces[3], bitmapTagId: 8 };
  expect(() => decodeReflectionCube(value, source, 7, {})).toThrow();
});
