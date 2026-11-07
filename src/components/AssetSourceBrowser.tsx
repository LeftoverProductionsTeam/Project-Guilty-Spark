import { useEffect, useRef, useState } from 'react';
import { call, native } from '../api';
import type { AssetSourceInventory } from '../assetSources';
import { discoverAssetSources, loadAssetSource, updateAssetSourceInventory } from '../assetSources';
import type { OpenProject } from '../types';
export default function AssetSourceBrowser({ onLoaded, onInventory }: { onLoaded?: (source: OpenProject) => void; onInventory?: (inventory: AssetSourceInventory) => void }) {
  const callback = useRef(onInventory), revision = useRef(0); callback.current = onInventory;
  const [inventory, setInventory] = useState<AssetSourceInventory | null>(null),
    [selected, setSelected] = useState(''),
    [query, setQuery] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function scan(refresh = false) {
    setError('');
    try {
      const request = ++revision.current, found = await discoverAssetSources(refresh);
      if (request !== revision.current) return;
      setInventory(found); callback.current?.(found);
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    if (native) void scan();
    const changed = () => {if (native) void scan();};
    window.addEventListener('guilty-spark-runtime-connections-changed', changed);
    return () => {revision.current++; window.removeEventListener('guilty-spark-runtime-connections-changed', changed);};
  }, []);
  async function load() {
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    try {
      for (const source of await loadAssetSource(selected)) onLoaded?.(source);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const rows =
    inventory?.maps.filter((row) =>
      `${row.name} ${row.location} ${row.engine}`.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
  return (
    <details className="asset-source-browser">
      <summary>Installed maps & downloads {inventory && `· ${inventory.maps.length}`}</summary>
      <div className="asset-source-controls">
        <input
          aria-label="Find map asset source"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Map, runtime or folder…"
        />
        <select
          aria-label="Discovered asset source"
          value={selected}
          disabled={busy}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Choose a map or archive…</option>
          {rows.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name} · {row.location} · {row.engine}
            </option>
          ))}
        </select>
        <div className="button-row">
          <button disabled={!selected || busy} onClick={() => void load()}>
            {busy ? 'Reading & preserving source…' : 'Load assets'}
          </button>
          <button disabled={busy || !native} onClick={() => void scan(true)}>
            Rescan
          </button>
          <button
            disabled={busy || !native}
            onClick={() =>
              void call<AssetSourceInventory | null>('link_asset_source_folder')
                .then((value) => {
                  if (value) {revision.current++; updateAssetSourceInventory(value); setInventory(value); callback.current?.(value);}
                })
                .catch((e) => setError(String(e)))
            }
          >
            Link folder
          </button>
        </div>
        <small>
          Browse installed Halo folders, linked maps, Downloads and Spark’s Inbox. Maps are preserved on
          selection; ZIP imports use the checked archive importer.
        </small>
        {inventory?.notices.map((notice, i) => (
          <small key={i}>{notice}</small>
        ))}
        {error && <small role="alert">{error}</small>}
      </div>
    </details>
  );
}
