import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AssetSourceInventory } from './assetSources';
const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('./api', () => ({ call: mock.call }));
const inventory = (id: string): AssetSourceInventory => ({maps: [{id, name: id+'.map', location: 'Linked runtime', engine: 'Halo Xbox', cacheVersion: 5, archive: false, bytes: 100}], notices: [], elapsedMs: 1});
beforeEach(() => {vi.resetModules(); mock.call.mockReset(); vi.stubGlobal('window', new EventTarget()); vi.useFakeTimers(); vi.setSystemTime(0);});
afterEach(() => {vi.useRealTimers(); vi.unstubAllGlobals();});
it('coalesces simultaneous catalogs, expires metadata without reading assets, and permits retry after discovery failure', async () => {
  const {discoverAssetSources} = await import('./assetSources');
  const first=inventory('first');mock.call.mockResolvedValueOnce(first);
  const a=discoverAssetSources(), b=discoverAssetSources();expect(b).toBe(a);expect(await a).toEqual(first);
  expect(await discoverAssetSources()).toEqual(first);expect(mock.call.mock.calls).toEqual([['discover_asset_sources']]);
  vi.setSystemTime(30001);mock.call.mockRejectedValueOnce(Error('Runtime unavailable'));
  await expect(discoverAssetSources()).rejects.toThrow('Runtime unavailable');
  mock.call.mockResolvedValueOnce(inventory('reconnected'));expect((await discoverAssetSources()).maps[0].id).toBe('reconnected');
  expect(mock.call).toHaveBeenCalledTimes(3);
});
it('a folder link supersedes a pending old scan for every selector and reuses its returned native inventory', async () => {
  const {discoverAssetSources,updateAssetSourceInventory} = await import('./assetSources');
  let finish!: (value: AssetSourceInventory) => void;mock.call.mockImplementationOnce(() => new Promise(resolve => {finish=resolve;}));
  const pending=discoverAssetSources();const linked=inventory('new-folder');updateAssetSourceInventory(linked);
  finish(inventory('obsolete'));expect(await pending).toEqual(linked);expect(await discoverAssetSources()).toEqual(linked);
  expect(mock.call).toHaveBeenCalledTimes(1);
});
it('a runtime connection invalidates an in-flight catalog and a late response cannot restore the disconnected source list', async () => {
  const {discoverAssetSources} = await import('./assetSources');
  let finish!: (value: AssetSourceInventory) => void;mock.call.mockImplementationOnce(() => new Promise(resolve => {finish=resolve;}));
  const pending=discoverAssetSources();window.dispatchEvent(new Event('guilty-spark-runtime-connections-changed'));
  const connected=inventory('connected');mock.call.mockResolvedValueOnce(connected);expect(await discoverAssetSources()).toEqual(connected);
  finish(inventory('disconnected'));expect(await pending).toEqual(connected);expect(await discoverAssetSources()).toEqual(connected);
  expect(mock.call).toHaveBeenCalledTimes(2);
});

it('an obsolete discovery failure cannot replace a successful linked-folder result with an error',async()=>{
 const {discoverAssetSources,updateAssetSourceInventory}=await import('./assetSources');let fail!:(reason:Error)=>void;
 mock.call.mockImplementationOnce(()=>new Promise((_,reject)=>{fail=reject;}));const old=discoverAssetSources();const linked=inventory('linked');updateAssetSourceInventory(linked);fail(Error('Old disconnected root'));
 expect(await old).toEqual(linked);expect(await discoverAssetSources()).toEqual(linked);expect(mock.call).toHaveBeenCalledTimes(1);
});
