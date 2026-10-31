import { expect, it } from 'vitest';
import { decodeReflectionCube, decodeReflectionCubeBatch } from './ownedReflectionCube';
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
it('validates the entire ordered cube batch while keeping explicit missing-resource refusals', () => {
  const value = cube();
  const response = {
    sourceSha256: source,
    items: [
      { bitmapTagId: 7, preview: value, error: null },
      { bitmapTagId: 8, preview: null, error: 'Original reflection resource is missing' },
    ],
  };
  const decoded = decodeReflectionCubeBatch(response, source, [7, 8], {});
  expect(decoded.get(7)?.cube?.bytes).toBe(384);
  expect(decoded.get(8)?.error).toContain('missing');
  for (const changed of [
    { ...response, sourceSha256: 'b'.repeat(64) },
    { ...response, items: [...response.items].reverse() },
    { ...response, items: response.items.slice(1) },
    { ...response, items: [response.items[0], { ...response.items[1], error: null }] },
  ])
    expect(() => decodeReflectionCubeBatch(changed, source, [7, 8], {})).toThrow();
  const foreign = {
    ...value,
    bitmapTagId: 8,
    faces: value.faces.map((face) => ({ ...face, bitmapTagId: 8 })),
  };
  foreign.faces[5] = { ...foreign.faces[5], sourceSha256: 'c'.repeat(64) };
  expect(() =>
    decodeReflectionCubeBatch(
      { ...response, items: [response.items[0], { bitmapTagId: 8, preview: foreign, error: null }] },
      source,
      [7, 8],
      {},
    ),
  ).toThrow();
  expect(() => decodeReflectionCubeBatch(response, source, [7, 7], {})).toThrow();
  expect(() => decodeReflectionCubeBatch(response, source, [], {})).toThrow();
  const giant = { ...value, faces: value.faces.map((face) => ({ ...face, width: 1024, height: 1024 })) };
  expect(() =>
    decodeReflectionCubeBatch(
      {
        sourceSha256: source,
        items: [1, 2, 3, 4].map((id) => ({ bitmapTagId: id, preview: giant, error: null })),
      },
      source,
      [1, 2, 3, 4],
      {},
    ),
  ).toThrow(/budget/);
});
