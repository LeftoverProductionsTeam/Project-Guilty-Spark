import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { decodedBitmapStats } from './ownedBitmapPreview';
import {
  decodeReflectionCube,
  decodeReflectionCubeBatch,
  createDecodedReflectionCubeTexture,
} from './ownedReflectionCube';
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
it('keeps all six distinct face payloads warm without aliasing pixels or bypassing provenance', () => {
  const value = cube();
  value.bitmapTagId = 49;
  value.faces = value.faces.map((face, index) => {
    const bytes = Buffer.from(face.ddsBase64, 'base64');
    bytes.writeUInt16LE((index + 1) * 0x1010, 128);
    return { ...face, bitmapTagId: 49, ddsBase64: bytes.toString('base64') };
  });
  vi.stubGlobal('__GS_PROFILE__', true);
  try {
    const original = decodeReflectionCube(value, source, 49, {});
    const before = (globalThis as any).__GS_PROFILE_GAUGES__['bitmap-decode'];
    expect(new Set(original.faces.map((f) => [...f.pixels].join(','))).size).toBe(6);
    original.faces[0].pixels.fill(255);
    const repeat = decodeReflectionCube(value, source, 49, {});
    const after = (globalThis as any).__GS_PROFILE_GAUGES__['bitmap-decode'];
    expect(after.hits - before.hits).toBe(6);
    expect(after.misses - before.misses).toBe(0);
    expect(repeat.faces[0].pixels).not.toEqual(original.faces[0].pixels);
    const invalid = { ...value, faces: value.faces.map((f) => ({ ...f, sourceSha256: 'c'.repeat(64) })) };
    expect(() => decodeReflectionCube(invalid, source, 49, {})).toThrow(/Source map changed/);
  } finally {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, '__GS_PROFILE_GAUGES__');
  }
});
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
        items: [1, 2, 3, 4].map((id) => ({
          bitmapTagId: id,
          preview: {
            ...giant,
            bitmapTagId: id,
            faces: giant.faces.map((face) => ({ ...face, bitmapTagId: id })),
          },
          error: null,
        })),
      },
      source,
      [1, 2, 3, 4],
      {},
    ),
  ).toThrow(/budget/);
});

function originalCube(id = 17): OwnedCubeResponse {
  const base = cube();
  const levels = Array.from({ length: 3 }, (_, level) =>
    base.faces.map((face, index) => {
      const bytes = Buffer.from(face.ddsBase64, 'base64'),
        edge = 4 >> level;
      bytes.writeUInt32LE(edge, 12);
      bytes.writeUInt32LE(edge, 16);
      bytes.writeUInt16LE((level * 6 + index + 1) * 0x800, 128);
      return {
        ...face,
        bitmapTagId: id,
        width: edge,
        height: edge,
        mipLevel: level,
        mipLevels: 3,
        nativeMipmaps: 2,
        imageCount: 1,
        ddsBase64: bytes.toString('base64'),
      };
    }),
  );
  return { ...base, bitmapTagId: id, faces: levels[0], mipFaces: levels.slice(1) };
}
it('keeps every original face and level distinct in the shared warm decoder', () => {
  const input = originalCube(),
    decoded = decodeReflectionCube(input, source, input.bitmapTagId, {});
  const levels = [decoded.faces, ...decoded.mipFaces!];
  expect(levels.map((faces) => faces.map((face) => face.width))).toEqual([
    [4, 4, 4, 4, 4, 4],
    [2, 2, 2, 2, 2, 2],
    [1, 1, 1, 1, 1, 1],
  ]);
  expect(new Set(levels.flat().map((face) => [...face.pixels.subarray(0, 4)].join(','))).size).toBe(18);
  expect(decoded.bytes).toBe((16 + 4 + 1) * 4 * 6);
  const before = decodedBitmapStats();
  const again = decodeReflectionCube(input, source, input.bitmapTagId, {});
  expect(decodedBitmapStats().hits - before.hits).toBe(18);
  decoded.mipFaces![0][4].pixels.fill(255);
  expect(again.mipFaces![0][4].pixels).not.toEqual(decoded.mipFaces![0][4].pixels);
});
it('rejects incomplete, reordered or foreign original reflection levels before any decode', () => {
  const input = originalCube(18);
  const mutations: ((value: OwnedCubeResponse) => void)[] = [
    (value) => {
      value.mipFaces!.pop();
    },
    (value) => {
      value.mipFaces!.reverse();
    },
    (value) => {
      value.mipFaces![1].pop();
    },
    (value) => {
      value.mipFaces![1][5].width = 2;
    },
    (value) => {
      value.mipFaces![1][5].format = 'DXT3';
    },
    (value) => {
      value.mipFaces![1][5].imageCount = 2;
    },
    (value) => {
      value.mipFaces![1][5].bitmapTagId++;
    },
    (value) => {
      value.mipFaces![1][5].imageIndex = 1;
    },
    (value) => {
      value.mipFaces![1][5].sourceSha256 = 'c'.repeat(64);
    },
    (value) => {
      value.mipFaces![1][5].resourceSha256 = 'c'.repeat(64);
    },
    (value) => {
      value.mipFaces![1][5].nativeMipmaps = 3;
    },
    (value) => {
      value.mipFaces![1][5].sourceKind = 'verified-resource';
    },
  ];
  const before = decodedBitmapStats();
  for (const mutate of mutations) {
    const value = structuredClone(input);
    mutate(value);
    expect(() => decodeReflectionCube(value, source, value.bitmapTagId, {})).toThrow();
  }
  expect(decodedBitmapStats().misses).toBe(before.misses);
  expect(decodedBitmapStats().hits).toBe(before.hits);
});
it('preflights every cube in a batch and refuses missing resource pins and excess pixels', () => {
  const first = originalCube(19),
    last = originalCube(20);
  last.mipFaces![1][5].sourceSha256 = 'c'.repeat(64);
  const response = {
    sourceSha256: source,
    items: [first, last].map((preview) => ({ bitmapTagId: preview.bitmapTagId, preview, error: null })),
  };
  const before = decodedBitmapStats();
  expect(() => decodeReflectionCubeBatch(response, source, [19, 20], {})).toThrow(/Source map changed/);
  expect(decodedBitmapStats()).toEqual(before);
  const pinned = originalCube(21),
    bank = 'd'.repeat(64);
  pinned.resourceSha256 = bank;
  for (const face of [pinned.faces, ...pinned.mipFaces!].flat())
    Object.assign(face, { sourceKind: 'verified-resource', resourceSha256: bank });
  expect(() => decodeReflectionCube(pinned, source, 21, {})).toThrow(/recorded pins/);
  expect(decodeReflectionCube(pinned, source, 21, { 'bitmaps.map': bank }).bytes).toBe(504);
  const giant = cube();
  giant.faces.forEach((face) => {
    face.width = 1024;
    face.height = 1024;
  });
  expect(() => decodeReflectionCube(giant, source, 7, {})).toThrow(/budget/);
  const overpacked = cube(),
    packed = 'A'.repeat(4 * 1024 * 1024);
  overpacked.faces.forEach((face) => {
    face.ddsBase64 = packed;
  });
  expect(() => decodeReflectionCube(overpacked, source, 7, {})).toThrow(/budget/);
});
it('uploads original CPU buffers directly, preserving all levels and exact accounting', () => {
  const decoded = decodeReflectionCube(originalCube(22), source, 22, {});
  const texture = createDecodedReflectionCubeTexture(decoded, 22);
  expect(texture.generateMipmaps).toBe(false);
  expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
  expect(texture.flipY).toBe(false);
  expect(texture.colorSpace).toBe(THREE.NoColorSpace);
  expect(texture.userData).toMatchObject({
    sourceTagId: 22,
    originalMipLevels: 3,
    rgbaBytes: 504,
    sourceEncoded: true,
  });
  const images = [texture.image, ...texture.mipmaps.map((level) => (level as THREE.CubeTexture).image)];
  for (let level = 0; level < images.length; level++)
    for (let face = 0; face < 6; face++) {
      expect(images[level][face]).toBeInstanceOf(THREE.DataTexture);
      expect((images[level][face] as THREE.DataTexture).image.data).toBe(
        [decoded.faces, ...decoded.mipFaces!][level][face].pixels,
      );
    }
  texture.dispose();
  expect(() => createDecodedReflectionCubeTexture({ ...decoded, bytes: decoded.bytes - 1 }, 22)).toThrow(
    /budget/,
  );
  expect(() => createDecodedReflectionCubeTexture({ ...decoded, mipFaces: [decoded.faces] }, 22)).toThrow(
    /layout/,
  );
});
it('never fabricates lower levels for legacy base-only or shortened native cube chains', () => {
  const decoded = decodeReflectionCube(cube(), source, 7, {}),
    base = createDecodedReflectionCubeTexture(decoded, 7);
  expect(base.mipmaps).toHaveLength(0);
  expect(base.generateMipmaps).toBe(false);
  expect(base.minFilter).toBe(THREE.LinearFilter);
  base.dispose();
  const shortened = originalCube(23);
  shortened.mipFaces!.pop();
  for (const face of [shortened.faces, ...shortened.mipFaces!].flat()) {
    face.mipLevels = 2;
    face.nativeMipmaps = 2;
  }
  const texture = createDecodedReflectionCubeTexture(decodeReflectionCube(shortened, source, 23, {}), 23);
  expect(texture.mipmaps).toHaveLength(1);
  expect(texture.userData.originalMipLevels).toBe(2);
  expect(texture.generateMipmaps).toBe(false);
  texture.dispose();
});
