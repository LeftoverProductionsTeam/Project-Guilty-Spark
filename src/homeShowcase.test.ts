import { beforeEach, expect, it, vi } from 'vitest';
import type { Bootstrap, OpenProject } from './types';
const mock = vi.hoisted(() => ({ call: vi.fn(), retain: vi.fn() }));
vi.mock('./api', () => ({ call: mock.call }));
vi.mock('./assetSources', () => ({ retainAssetSource: mock.retain }));
vi.mock('./forge', () => ({ catalogAssets: (open: { testAssets?: unknown[] }) => open.testAssets ?? [] }));
import { preloadHomeModels } from './homeShowcase';
const bootstrap = (id: string) =>
  ({ dataDirectory: id, installation: { mccPath: 'installed-MCC' }, entries: [] }) as unknown as Bootstrap;
const model = {
  name: 'monitor',
  path: 'characters/monitor/monitor',
  class: 'bipd',
  sourceProjectId: 'owned-c40',
  sourceSha256: 'a'.repeat(64),
  tagId: 7,
};
const source = {
  project: { id: 'owned-c40', source: { resourceSha256: { 'mcc-textures': 'b'.repeat(64) } } },
  inspection: { header: { version: 13 } },
  testAssets: [model],
} as unknown as OpenProject;
beforeEach(() => {
  mock.call.mockReset();
  mock.retain.mockReset();
});
it('shares one source preparation between preloading and home without retaining decoded pixels', async () => {
  mock.call.mockImplementation(async (command) =>
    command === 'discover_asset_sources'
      ? { maps: [{ id: 'campaign', name: 'c40.map', cacheVersion: 13 }] }
      : [source],
  );
  const data = bootstrap('deduplicated');
  const preload = preloadHomeModels(data),
    home = preloadHomeModels(data);
  expect(home).toBe(preload);
  expect(await home).toEqual([model]);
  expect(await preloadHomeModels(data)).toEqual([model]);
  expect(mock.call.mock.calls.map((args) => args[0])).toEqual([
    'discover_asset_sources',
    'open_asset_source',
  ]);
  expect(mock.retain).toHaveBeenCalledWith(source);
});
it('reopens an existing preserved monitor source before scanning or reimporting its installed map', async () => {
  mock.call.mockResolvedValue(source);
  const data = bootstrap('preserved');
  data.entries = [{ id: 'owned-c40', version: 13, title: 'c40' }] as Bootstrap['entries'];
  expect(await preloadHomeModels(data)).toEqual([model]);
  expect(mock.call.mock.calls).toEqual([['open_project', { id: 'owned-c40' }]]);
});
it('retries after missing content and keeps separately connected installations isolated', async () => {
  mock.call.mockResolvedValue({ maps: [] });
  const data = bootstrap('retry');
  expect(await preloadHomeModels(data)).toEqual([]);
  expect(await preloadHomeModels(data)).toEqual([]);
  expect(mock.call).toHaveBeenCalledTimes(2);
  const other = { ...data, installation: { ...data.installation, mccPath: 'new-owned-install' } };
  expect(await preloadHomeModels(other)).toEqual([]);
  expect(mock.call).toHaveBeenCalledTimes(3);
});
