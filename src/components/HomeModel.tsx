import { useEffect, useState } from 'react';
import { call, native } from '../api';
import type { Bootstrap, OpenProject } from '../types';
import type { ForgeAsset } from '../forge';
import { catalogAssets } from '../forge';
import type { AssetSourceInventory } from '../assetSources';
import { retainAssetSource } from '../assetSources';
import NativeModelPreview from './NativeModelPreview';

// Retain the native source and its exact identities across workspace visits. The
// campaign cache is read once in the background, never on the launch critical path.
const featuredSources = new Map<string, Promise<ForgeAsset[]>>();
const isMonitor = (asset: ForgeAsset) => /(?:^|[\\/])(?:monitor|343)[\\/]/i.test(asset.path);
function characters(source: OpenProject): ForgeAsset[] {
  const available = catalogAssets(source);
  const featured = available.filter(
    (asset) =>
      /monitor|343|cyborg|master.?chief/i.test(asset.path) && ['bipd', 'scen', 'vehi'].includes(asset.class),
  );
  return featured.length ? featured : available.filter((asset) => asset.class === 'bipd');
}
async function connect(source: OpenProject): Promise<OpenProject> {
  if (source.inspection?.header.version === 13 && !source.project.source?.resourceSha256?.['mcc-textures']) {
    try {
      source = await call<OpenProject>('connect_mcc_texture_resources', { projectId: source.project.id });
    } catch {
      // Self-contained images still work; absent authored images remain explicit.
    }
  }
  retainAssetSource(source);
  return source;
}
function preloadMonitor(data: Bootstrap): Promise<ForgeAsset[]> {
  let pending = featuredSources.get(data.dataDirectory);
  if (!pending) {
    pending = (async () => {
      const inventory = await call<AssetSourceInventory>('discover_asset_sources');
      const candidate = inventory.maps.find(
        (row) => !row.archive && row.cacheVersion === 13 && /^c40\.map$/i.test(row.name),
      );
      if (!candidate) return [];
      const source = (await call<OpenProject[]>('open_asset_source', { sourceId: candidate.id }))[0];
      return source ? characters(await connect(source)).filter(isMonitor) : [];
    })();
    featuredSources.set(data.dataDirectory, pending);
    // A missing installation is not a permanent negative cache. Rescanning or
    // returning home after connecting it must be able to try again.
    void pending.then(
      (models) => {
        if (!models.length) featuredSources.delete(data.dataDirectory);
      },
      () => {
        featuredSources.delete(data.dataDirectory);
      },
    );
  }
  return pending;
}

export default function HomeModel({ data }: { data: Bootstrap }) {
  const [models, setModels] = useState<ForgeAsset[]>([]),
    [index, setIndex] = useState(0),
    [message, setMessage] = useState('Finding your Halo models…');
  useEffect(() => {
    let alive = true;
    if (!native) {
      setMessage('Connect an owned Halo installation to preview its models.');
      return;
    }
    void (async () => {
      let opened: OpenProject | undefined;
      const saved = [...data.entries]
        .filter((row) => row.version !== null)
        .sort((a, b) => (a.version === 13 ? -1 : 1) - (b.version === 13 ? -1 : 1));
      for (const row of saved.slice(0, 3)) {
        const source = await call<OpenProject>('open_project', { id: row.id });
        if (!alive) return;
        if (catalogAssets(source).some((asset) => asset.class === 'bipd' || /monitor|343/.test(asset.path))) {
          opened = source;
          break;
        }
      }
      if (!opened) {
        const found = await call<AssetSourceInventory>('discover_asset_sources');
        if (!alive) return;
        const candidate =
          found.maps.find(
            (row) => !row.archive && row.cacheVersion === 13 && /^(bloodgulch|c40|d40)\.map$/i.test(row.name),
          ) ??
          found.maps.find(
            (row) => !row.archive && row.cacheVersion === 609 && /^bloodgulch\.map$/i.test(row.name),
          );
        if (candidate) {
          setMessage(`Reading models from ${candidate.name}…`);
          opened = (await call<OpenProject[]>('open_asset_source', { sourceId: candidate.id }))[0];
        }
      }
      if (!alive) return;
      if (!opened) {
        setMessage('Link a Halo maps folder in the asset drawer to show its actual models here.');
        return;
      }
      opened = await connect(opened);
      if (!alive) return;
      const choices = characters(opened);
      if (!choices.length) {
        setMessage('No supported character models in this map.');
        return;
      }
      setModels(choices);
      const monitorIndex = choices.findIndex(isMonitor);
      setIndex(monitorIndex >= 0 ? monitorIndex : Math.floor(Math.random() * choices.length));
      if (monitorIndex < 0) {
        // Keep the immediately available character visible while the real
        // monitor source is prepared. Failures retain that working fallback.
        void preloadMonitor(data)
          .then((monitors) => {
            if (!alive || !monitors.length) return;
            const seen = new Set<string>();
            setModels(
              [...monitors, ...choices].filter((asset) => {
                const key = `${asset.sourceProjectId}:${asset.tagId}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              }),
            );
            setIndex(0);
          })
          .catch(() => {
            /* The existing character stays visible. */
          });
      }
    })().catch((error) => {
      if (alive) setMessage(String(error));
    });
    return () => {
      alive = false;
    };
  }, [data.dataDirectory]);
  const model = models[index % Math.max(1, models.length)];
  return (
    <div className="home-native-model">
      {model ? (
        <NativeModelPreview asset={model} showcase />
      ) : (
        <span className="model-preview-loading">{message}</span>
      )}
      {model && (
        <div className="home-model-caption">
          <span>{model.name} · actual Halo model</span>
          {models.length > 1 && (
            <button onClick={() => setIndex((value) => (value + 1) % models.length)}>Next model</button>
          )}
        </div>
      )}
    </div>
  );
}
