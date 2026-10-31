import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenProject, Project, MapInspection } from './types';
import type { VerifiedBatchImage } from './ownedBitmapBatch';
const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('./api', () => ({ call: mock.call }));
vi.mock('./mapSession', () => ({ readMapSession: () => 'mccSteam' }));
import { defaultPreviewMaterials, fillRuntimeTexturePreviews } from './runtimeTexturePreview';
const sourceHash = 'a'.repeat(64),
  runtimeHash = 'b'.repeat(64),
  packHash = 'c'.repeat(64);
const tag = (id: number, path = 'textures/grass') => ({ id, path, class: 'bitm' });
const inspection = {
  header: { version: 6 },
  sha256: sourceHash,
  tags: [tag(1), tag(2, 'textures/embedded')],
} as MapInspection;
const project = { id: 'source', source: { sha256: sourceHash, resourceSha256: {} } } as Project;
const runtime = {
  project: { id: 'runtime', source: { sha256: runtimeHash, resourceSha256: { 'mcc-textures': packHash } } },
  inspection: { sha256: runtimeHash, tags: [tag(9)] },
} as unknown as OpenProject;
function preview() {
  const bytes = new Uint8Array(132),
    v = new DataView(bytes.buffer);
  bytes.set([68, 68, 83, 32]);
  for (const [at, n] of [
    [4, 124],
    [12, 1],
    [16, 1],
    [20, 4],
    [76, 32],
    [80, 0x41],
    [88, 32],
    [92, 0xff0000],
    [96, 0xff00],
    [100, 0xff],
    [104, 0xff000000],
  ])
    v.setUint32(at, n, true);
  bytes.set([30, 150, 60, 255], 128);
  return {
    bitmapTagId: 9,
    imageIndex: 0,
    width: 1,
    height: 1,
    format: 'BGRA8',
    sourceSha256: runtimeHash,
    resourceSha256: packHash,
    sourceKind: 'verified-resource',
    ddsBase64: btoa(String.fromCharCode(...bytes)),
  };
}
const target = { bitmapTagId: 1, imageIndex: 0, sourceSha256: sourceHash, resourceSha256: null };
const refusal = (code = 'missing-resource'): VerifiedBatchImage => ({
  bitmapTagId: 1,
  imageIndex: 0,
  image: null,
  sourceKind: null,
  error: 'Missing pixels',
  errorCode: code,
});
const mapping = { sourceBitmapTagId: 1, bitmapTagId: 9, imageIndex: 0, width: 1, height: 1, format: 'BGRA8' };
beforeEach(() => {
  mock.call.mockReset();
  mock.call.mockImplementation(async (command: string) => {
    if (command === 'runtime_texture_source') return structuredClone(runtime);
    if (command === 'compatible_bitmap_targets') return [mapping];
    if (command === 'preview_owned_cache_bitmap_batch')
      return {
        sourceSha256: runtimeHash,
        resourceSha256: packHash,
        items: [{ bitmapTagId: 9, imageIndex: 0, preview: preview() }],
      };
    throw Error(command);
  });
});
describe('viewer-only compatible runtime pixels', () => {
  it('uses exact native mappings and runtime pins while preserving the source map and embedded image', async () => {
    const original = structuredClone(project),
      embedded = {
        ...refusal(),
        bitmapTagId: 2,
        image: { width: 1, height: 1, pixels: new Uint8Array([1, 2, 3, 4]), format: 'BGRA8' },
        sourceKind: 'internal-cache',
        error: null,
      } as VerifiedBatchImage;
    const decoded = new Map([
      ['1:0', refusal()],
      ['2:0', embedded],
    ]);
    const result = await fillRuntimeTexturePreviews(
      project,
      inspection,
      [target, { ...target, bitmapTagId: 2 }],
      decoded,
    );
    expect([...result.get('1:0')!.image!.pixels]).toEqual([60, 150, 30, 255]);
    expect(result.get('1:0')).toMatchObject({
      bitmapTagId: 1,
      compatibleBitmapTagId: 9,
      compatibleRuntime: 'mccSteam',
      compatibleSourceSha256: runtimeHash,
    });
    expect(result.get('2:0')).toBe(embedded);
    expect(decoded.get('1:0')!.image).toBeNull();
    expect(project).toEqual(original);
    expect(mock.call).toHaveBeenCalledWith('compatible_bitmap_targets', {
      projectId: 'source',
      runtimeProjectId: 'runtime',
      requests: [{ bitmapTagId: 1, imageIndex: 0 }],
    });
  });
  it('refuses stale verification failures rather than concealing changed resources', async () => {
    for (const code of ['verification-failed', 'unsupported-layout']) {
      const decoded = new Map([['1:0', refusal(code)]]);
      expect(await fillRuntimeTexturePreviews(project, inspection, [target], decoded)).toBe(decoded);
    }
    expect(mock.call).not.toHaveBeenCalled();
  });
  it('refuses unsolicited mappings, contradictory layouts and wrongly pinned pixels', async () => {
    for (const broken of [
      { ...mapping, sourceBitmapTagId: 2 },
      { ...mapping, width: 2 },
      { ...mapping, format: 'DXT3' },
    ]) {
      mock.call.mockImplementation(async (command: string) =>
        command === 'compatible_bitmap_targets'
          ? [broken]
          : {
              sourceSha256: runtimeHash,
              resourceSha256: packHash,
              items: [{ bitmapTagId: 9, imageIndex: 0, preview: preview() }],
            },
      );
      const decoded = new Map([['1:0', refusal()]]);
      expect(
        (await fillRuntimeTexturePreviews(project, inspection, [target], decoded)).get('1:0')!.image,
      ).toBeNull();
    }
    mock.call.mockImplementation(async (command: string) =>
      command === 'compatible_bitmap_targets'
        ? [mapping]
        : {
            sourceSha256: runtimeHash,
            resourceSha256: packHash,
            items: [
              { bitmapTagId: 9, imageIndex: 0, preview: { ...preview(), resourceSha256: 'd'.repeat(64) } },
            ],
          },
    );
    const decoded = new Map([['1:0', refusal()]]);
    expect(await fillRuntimeTexturePreviews(project, inspection, [target], decoded)).toBe(decoded);
  });
  it('assigns only actual owned native shader paths to metal and grass defaults', () => {
    const owned = {
      inspection: {
        tags: [
          { class: 'senv', path: 'levels\\test\\bloodgulch\\shaders\\cap_metal' },
          { class: 'senv', path: 'levels/test/bloodgulch/shaders/blood ground' },
        ],
      },
    } as OpenProject;
    expect(defaultPreviewMaterials(owned).map((m) => [m.id, m.shaderPath])).toEqual([
      ['surface', 'levels/test/bloodgulch/shaders/cap_metal'],
      ['grass', 'levels/test/bloodgulch/shaders/blood ground'],
    ]);
    expect(defaultPreviewMaterials({ inspection: { tags: [] } } as unknown as OpenProject)).toEqual([]);
  });
});
