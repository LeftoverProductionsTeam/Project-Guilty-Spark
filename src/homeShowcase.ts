import { call } from './api';
import type { Bootstrap, OpenProject } from './types';
import { catalogAssets } from './forge';
import type { ForgeAsset } from './forge';
import { retainAssetSource } from './assetSources';
import type { AssetSourceInventory } from './assetSources';

const sources = new Map<string, Promise<ForgeAsset[]>>();
const isMonitor = (asset: ForgeAsset) => /(?:^|[\\/])(?:monitor|343)[\\/]/i.test(asset.path);
function characters(source: OpenProject): ForgeAsset[] {
  const available = catalogAssets(source);
  const featured = available.filter(
    (asset) =>
      /monitor|343|cyborg|master.?chief/i.test(asset.path) && ['bipd', 'scen', 'vehi'].includes(asset.class),
  );
  return (featured.length ? featured : available.filter((asset) => asset.class === 'bipd')).sort(
    (a, b) => Number(isMonitor(b)) - Number(isMonitor(a)),
  );
}
async function connect(source: OpenProject): Promise<ForgeAsset[]> {
  if (source.inspection?.header.version === 13 && !source.project.source?.resourceSha256?.['mcc-textures']) {
    try {
      source = await call<OpenProject>('connect_mcc_texture_resources', { projectId: source.project.id });
    } catch {
      /* Embedded images remain eligible; missing dependencies stay explicit. */
    }
  }
  retainAssetSource(source);
  return characters(source);
}
/** Cache immutable source identities, not GPU objects or unverified pixels.
 * Each mounted preview still performs its normal source/resource checks. */
export function preloadHomeModels(data: Bootstrap): Promise<ForgeAsset[]> {
  const key = JSON.stringify([data.dataDirectory, data.installation.mccPath]);
  let pending = sources.get(key);
  if (pending) return pending;
  pending = (async () => {
    // An existing preserved campaign source needs one verified open, rather
    // than rescanning and reimporting the installed map on every app launch.
    const preserved = data.entries.find((row) => row.version === 13 && row.title.toLowerCase() === 'c40');
    if (preserved) {
      try {
        const found = await connect(await call<OpenProject>('open_project', { id: preserved.id }));
        if (found.some(isMonitor)) return found;
      } catch {
        /* Original integrity checks remain authoritative; try another source. */
      }
    }
    let inventory: AssetSourceInventory | undefined;
    try {
      inventory = await call<AssetSourceInventory>('discover_asset_sources');
      const monitor = inventory.maps.find(
        (row) => !row.archive && row.cacheVersion === 13 && /^c40\.map$/i.test(row.name),
      );
      if (monitor) {
        const source = (await call<OpenProject[]>('open_asset_source', { sourceId: monitor.id }))[0];
        if (source) {
          const found = await connect(source);
          if (found.some(isMonitor)) return found;
        }
      }
    } catch {
      /* A missing campaign source must not prevent an owned fallback. */
    }
    const saved = [...data.entries]
      .filter((row) => row.version !== null)
      .sort((a, b) => Number(b.version === 13) - Number(a.version === 13));
    for (const row of saved.slice(0, 3)) {
      try {
        const found = await connect(await call<OpenProject>('open_project', { id: row.id }));
        if (found.length) return found;
      } catch {
        /* Try another independently owned source. */
      }
    }
    const candidate =
      inventory?.maps.find(
        (row) => !row.archive && row.cacheVersion === 13 && /^(bloodgulch|d40)\.map$/i.test(row.name),
      ) ??
      inventory?.maps.find(
        (row) => !row.archive && row.cacheVersion === 609 && /^bloodgulch\.map$/i.test(row.name),
      );
    if (!candidate) return [];
    const source = (await call<OpenProject[]>('open_asset_source', { sourceId: candidate.id }))[0];
    return source ? connect(source) : [];
  })();
  if (sources.size >= 4) sources.delete(sources.keys().next().value!);
  sources.set(key, pending);
  void pending.then(
    (models) => {
      if (!models.length) sources.delete(key);
    },
    () => sources.delete(key),
  );
  return pending;
}
