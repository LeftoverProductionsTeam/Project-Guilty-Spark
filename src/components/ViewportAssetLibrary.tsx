import AssetSourceBrowser from './AssetSourceBrowser';
import LibraryAssetPreview from './LibraryAssetPreview';
import { useMemo } from 'react';
import type { PointerEvent } from 'react';
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
}: {
  projectId: string;
  assets: ViewportAsset[];
  begin: (item: ViewportAsset, event: PointerEvent) => void;
  activate: (item: ViewportAsset) => void;
  replace: (item: ViewportAsset) => void;
  canReplace: boolean;
  importModel?: () => void;
  importSound?: () => void;
  busy?: boolean;
}) {
  const [query, setQuery] = useMapState(projectId, 'viewport.library.query', ''),
    [source, setSource] = useMapState(projectId, 'viewport.library.source', 'all'),
    [kind, setKind] = useMapState(projectId, 'viewport.library.kind', 'all');
  const sources = useMemo(
    () => [...new Map(assets.map((item) => [item.sourceId, item.sourceTitle])).entries()],
    [assets],
  );
  const shown = useMemo(
    () =>
      assets.filter(
        (item) =>
          (source === 'all' || item.sourceId === source) &&
          (kind === 'all' ||
            (kind === 'models'
              ? item.kind === 'model' || item.kind === 'mesh'
              : item.kind === 'sound' || item.kind === 'customSound')) &&
          `${item.name} ${item.path}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [assets, source, kind, query],
  );
  return (
    <div className="viewport-asset-library">
      <p>
        Drag a preview onto the map. Native models extract and import their recursive tags before placement.
      </p>
      <AssetSourceBrowser onLoaded={(open) => setSource(open.project.id)} />
      <label>
        Source map
        <select
          aria-label="Asset library map"
          value={source}
          onChange={(event) => setSource(event.target.value)}
        >
          <option value="all">All loaded sources</option>
          {sources.map(([id, title]) => (
            <option key={id} value={id}>
              {title}
            </option>
          ))}
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
          <option value="models">Models</option>
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
          <button disabled={busy} onClick={importModel}>
            Import OBJ model
          </button>
        )}
        {importSound && (
          <button disabled={busy} onClick={importSound}>
            Import WAV / OGG sound
          </button>
        )}
      </div>
      <div className="viewport-asset-list">
        {shown.slice(0, 150).map((item) => (
          <article key={item.key}>
            <div
              onPointerDown={(event) => {
                if (!busy && !(event.target as HTMLElement).closest('button,input,a')) begin(item, event);
              }}
            >
              <LibraryAssetPreview item={item} />
            </div>
            <button
              className="viewport-asset-source"
              disabled={busy}
              onPointerDown={(event) => begin(item, event)}
              onClick={() => activate(item)}
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
                · {item.sourceTitle}
              </small>
              <code>{item.path}</code>
            </button>
            {(item.kind === 'model' || item.kind === 'mesh') && (
              <button
                disabled={busy || !canReplace}
                onClick={() => replace(item)}
                aria-label={`Replace selected with ${item.name}`}
              >
                Replace selected
              </button>
            )}
          </article>
        ))}
      </div>
      {!shown.length && <p>No matching assets. Open another map or import a custom model or sound.</p>}
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
