import AssetSourceBrowser from './AssetSourceBrowser';
import LibraryAssetPreview from './LibraryAssetPreview';
import { useMemo, useRef, useState } from 'react';
import { discoverAssetSources, loadAssetSource } from '../assetSources';
import type { AssetSourceInventory } from '../assetSources';
import { native } from '../api';
import type { PointerEvent, ReactNode } from 'react';
import { useMapState } from '../mapSession';
import type { ViewportAsset } from '../viewportAssets';
import type { MapDocument } from '../mapDocuments';
import type { Vec3 } from '../types';
import '../viewportAssets.css';
export interface ViewportLibraryControls {
  documents: MapDocument[];
  onImportModel: (position?: Vec3, path?: string) => Promise<void>;
  onImportSound: (position?: Vec3, path?: string) => Promise<boolean>;
  onPlaceMesh: (item: ViewportAsset, position: Vec3, replaceId?: string | null) => Promise<void>;
  onSaveMap: (id: string) => Promise<void>;
  busy: boolean;
}

export default function ViewportAssetLibrary({
  projectId,
  assets,
  begin,
  activate,
  replace,
  canReplace,
  importModel,
  importSound,
  busy = false,
  importing = false,
  scenarioTools,
}: {
  projectId: string;
  assets: ViewportAsset[];
  begin: (item: ViewportAsset, event: PointerEvent) => void;
  activate: (item: ViewportAsset, event?: {detail: number}) => void;
  replace: (item: ViewportAsset) => void;
  canReplace: boolean;
  importModel?: () => void;
  importSound?: () => void;
  busy?: boolean;
  importing?: boolean;
  scenarioTools?: ReactNode;
}) {
  const [inventory, setInventory] = useState<AssetSourceInventory | null>(null), [sourceBusy, setSourceBusy] = useState(false), [sourceError, setSourceError] = useState('');
  const loading = useRef(false);
  async function chooseSource(value: string) {
    if (!value.startsWith('discovered:')) {setSource(value); return;}
    if (loading.current) return;
    loading.current = true; setSourceBusy(true); setSourceError('');
    try {const sources = await loadAssetSource(value.slice(11)); setSource(sources[sources.length - 1].project.id);}
    catch (error) {setSourceError(String(error));}
    finally {loading.current = false; setSourceBusy(false);}
  }
  async function refreshSources() {if(native)try{setInventory(await discoverAssetSources());}catch(error){setSourceError(String(error));}}
  const unavailable = busy || sourceBusy;
  const [query, setQuery] = useMapState(projectId, 'viewport.library.query', ''),
    [source, setSource] = useMapState(projectId, 'viewport.library.source', 'all'),
    [kind, setKind] = useMapState(projectId, 'viewport.library.kind', 'all');
  const sources = useMemo(
    () => [...new Map(assets.map((item) => [item.sourceId, item.sourceTitle+(item.sourceEdition ? ' · '+item.sourceEdition : '')])).entries()],
    [assets],
  );
  const shown = useMemo(
    () =>
      assets.filter(
        (item) =>
          (source === 'all' || item.sourceId === source) &&
          (kind === 'all' ||
            (kind === 'models' ? item.kind === 'model' || item.kind === 'mesh' :
             kind === 'sounds' ? item.kind === 'sound' || item.kind === 'customSound' :
             item.kind === 'model' && item.asset.class === (kind === 'doors' ? 'mach' : kind))) &&
          `${item.name} ${item.path}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [assets, source, kind, query],
  );
  return (
    <div className="viewport-asset-library" aria-busy={unavailable}>
      {importing && <p role="status">Preparing native dependencies… Placement is committed only after validation.</p>}
      <p>
        Drag a preview onto the map. Native models extract and import their recursive tags before placement.
      </p>
      <AssetSourceBrowser onLoaded={(open) => setSource(open.project.id)} onInventory={setInventory} />
      {sourceBusy && <p role="status">Reading source assets…</p>}
      {sourceError && <small role="alert">{sourceError}</small>}
      <div className="asset-library-filters">
        <label>
          Source map
          <select
            aria-label="Asset library map"
            value={source}
            disabled={unavailable}
            onFocus={() => void refreshSources()}
            onChange={(event) => void chooseSource(event.target.value)}
          >
            <option value="all">All loaded sources</option>
            {sources.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
            {!!inventory?.maps.length && <optgroup label="Connected runtimes & linked folders">{inventory.maps.map(candidate => (
              <option key={candidate.id} value={'discovered:'+candidate.id}>{candidate.name} · {candidate.location} · {candidate.engine}</option>
            ))}</optgroup>}
          </select>
        </label>
        <label>
          Show
          <select
            aria-label="Asset library type"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="all">Models and sounds</option>
            <option value="models">All models</option>
            <option value="scen">Scenery</option>
            <option value="vehi">Vehicles</option>
            <option value="weap">Weapons</option>
            <option value="eqip">Equipment</option>
            <option value="bipd">Bipeds</option>
            <option value="doors">Doors & devices</option>
            <option value="sounds">Sounds</option>
          </select>
        </label>
        <input
          aria-label="Search loaded assets"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="warthog, pistol, wind…"
        />
        <div className="button-row">
          {importModel && (
            <button disabled={unavailable} onClick={importModel}>
              Import OBJ model
            </button>
          )}
          {importSound && (
            <button disabled={unavailable} onClick={importSound}>
              Import WAV / OGG sound
            </button>
          )}
        </div>
      </div>
      {scenarioTools}
      {kind==='doors'&&<p className="subtle">Drag a door preview onto the map, then drop a Trigger volume nearby. Select either to connect an action in the Inspector.</p>}
      <div className="viewport-asset-list">
        {shown.slice(0, 150).map((item) => (
          <article key={item.key}>
            <div
              className="asset-preview-drag"
              onDragStart={event => event.preventDefault()}
              onPointerDownCapture={event => {
                if (!unavailable && !(event.target as HTMLElement).closest('button,input,select,textarea,a')) {
                  event.preventDefault();
                  begin(item, event);
                }
              }}
            >
              <LibraryAssetPreview item={item} />
            </div>
            <button
              className="viewport-asset-source"
              disabled={unavailable}
              onPointerDown={(event) => begin(item, event)}
              onClick={(event) => activate(item, event)}
              title={`${item.path}\n${item.sourceTitle}`}
              aria-label={`Add ${item.name} at view`}
            >
              <strong>{item.name}</strong>
              <small>
                {item.kind === 'sound'
                  ? item.looping
                    ? 'Looping sound'
                    : 'Sound'
                  : item.kind === 'customSound'
                    ? 'Custom sound'
                    : item.kind === 'mesh'
                      ? 'Custom OBJ'
                      : item.kind === 'model'
                        ? item.asset.class
                        : 'Asset'}{' '}
                · {item.sourceTitle}{item.sourceEdition ? ' · '+item.sourceEdition : ''}
              </small>
              <code>{item.path}</code>
            </button>
            {(item.kind === 'model' || item.kind === 'mesh') && (
              <button
                disabled={unavailable || !canReplace}
                onClick={() => replace(item)}
                aria-label={`Replace selected with ${item.name}`}
              >
                Replace selected
              </button>
            )}
          </article>
        ))}
      </div>
      {!shown.length && <p>{kind==='doors'?'No doors in the loaded sources. Use Installed maps & downloads to load assets from a campaign map such as a10.':'No matching assets. Open another map or import a custom model or sound.'}</p>}
      {shown.length > 150 && (
        <small>150 of {shown.length} shown. Narrow the search to find another asset.</small>
      )}
      <p className="subtle">
        QuickForge/Workshop builds native tag placements and closed OBJ static scenery with assigned Halo
        materials. Imported compiled-map model additions/replacements still require a supported rebuild.
        Sounds here use the editor’s saved spatial mix.
      </p>
    </div>
  );
}
