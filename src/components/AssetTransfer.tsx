import AssetSourceBrowser from './AssetSourceBrowser';
import { useAssetLibrarySources } from '../useAssetLibrarySources';
import LibraryAssetPreview from './LibraryAssetPreview';
import {WorkspacePanel,useRevealWorkspacePanel} from './WorkspacePanels';
import {viewportAssetCatalog,placeLibraryModel} from '../viewportAssets';
import type {ViewportAsset} from '../viewportAssets';
import {beginAssetTransfer} from '../assetDragRegistry';
import { useEffect, useState } from 'react';
import type { Bootstrap, OpenProject, Project } from '../types';
import type { MapDocument } from '../mapDocuments';
import { call } from '../api';
import { catalogAssets, placeAsset } from '../forge';
import type { ForgeAsset } from '../forge';
import { Notice } from './ui';
export type TransferSelection =
  { kind: 'tag'; asset: ForgeAsset } | { kind: 'obj'; sourceId: string; assetId: string } | {kind:'sound';item:Exclude<ViewportAsset,{kind:'model'}>};
export default function AssetTransfer({
  data,
  documents,
  target,
  busy,
  onTransfer,
  onClose,
  onTags,
}: {
  data: Bootstrap;
  documents: MapDocument[];
  target: Project;
  busy: boolean;
  onTransfer: (selection: TransferSelection) => Promise<void>;
  onClose: () => void;
  onTags: () => void;
}) {
  const reveal=useRevealWorkspacePanel();
  useEffect(()=>{reveal('asset-transfer');},[target.id]);
  const librarySources = useAssetLibrarySources(documents);
  const sources = [
      ...data.entries,
      ...librarySources.flatMap((row) => {
        const p = row.history.current;
        return p && !data.entries.some((entry) => entry.id === p.id) ? [{ id: p.id, title: p.title }] : [];
      }),
    ].filter((e) => e.id !== target.id),
    [sourceId, setSourceId] = useState(sources[0]?.id ?? ''),
    [open, setOpen] = useState<OpenProject | null>(null),
    [query, setQuery] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    setOpen(null);
    setError('');
    if (!sourceId) return;
    const cached = documents.find((d) => d.id === sourceId);
    if (cached?.history.current) {
      setOpen({ project: cached.history.current, inspection: cached.inspection });
      return;
    }
    setLoading(true);
    void call<OpenProject>('open_project', { id: sourceId })
      .then((value) => {
        if (alive) setOpen(value);
      })
      .catch((e) => {
        if (alive) setError(String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [sourceId, documents]);
  const tags = open
    ? catalogAssets(open).filter((a) => (a.name + ' ' + a.path).toLowerCase().includes(query.toLowerCase()))
    : [];
  const assets=open?viewportAssetCatalog([{history:{current:open.project},inspection:open.inspection}]).filter(item=>(item.name+' '+item.path).toLowerCase().includes(query.toLowerCase())):[];
  return (
    <WorkspacePanel id="asset-transfer" label="Transfer assets" defaultDock="right">
      <section className="asset-transfer-panel" aria-label="Transfer map assets">
        <header>
          <div>
            <h3>Transfer assets into {target.title}</h3>
            <p>
              Real model previews, recursive native tag imports and verified local geometry. The source stays
              available.
            </p>
          </div>
          <button onClick={onClose}>Close transfers</button>
        </header>
        <AssetSourceBrowser
          onLoaded={(source) => {
            setSourceId(source.project.id);
            setOpen(source);
          }}
        />
        <div className="asset-transfer-tools">
          <select
            aria-label="Asset source map"
            value={sourceId}
            disabled={busy}
            onChange={(e) => setSourceId(e.target.value)}
          >
            <option value="">Choose another map…</option>
            {sources.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
          <input
            type="search"
            aria-label="Find transferable asset"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="warthog, assault rifle, scenery…"
          />
          {loading && <span>Reading preserved map…</span>}
        </div>
        <div className="asset-transfer-list">
          {assets.slice(0, 150).map((item) => (
            <article key={item.key} className="gs-transfer-card">
              <div
                onPointerDown={(event) => {
                  if (!busy && !(event.target as HTMLElement).closest('button,input,a'))
                    beginAssetTransfer(item, target.id, event);
                }}
              >
                <LibraryAssetPreview item={item} />
              </div>
              <button
                disabled={busy}
                onPointerDown={(event) => beginAssetTransfer(item, target.id, event)}
                onClick={() =>
                  void onTransfer(
                    item.kind === 'model'
                      ? { kind: 'tag', asset: item.asset }
                      : item.kind === 'sound' || item.kind === 'customSound'
                        ? { kind: 'sound', item }
                        : { kind: 'obj', sourceId: item.sourceId, assetId: item.asset.id },
                  ).catch((e) => setError(String(e)))
                }
              >
                <strong>{item.name}</strong>
                <small>{item.kind} · drag into the viewport</small>
              </button>
            </article>
          ))}
        </div>
        {!target.quickForge && tags.length > 0 && (
          <Notice>
            Source-linked models can be placed in this editor. Foreign tags need extraction, dependency
            staging and a compatible native rebuild before appearing in gameplay.
          </Notice>
        )}
        {assets.length > 150 && <p>Showing the first 150 assets; narrow the search to find more.</p>}
        {!sources.length && <p>Import another map in Map Library to choose its assets.</p>}
        {error && <Notice tone="error">{error}</Notice>}
        <button className="small-button" onClick={onTags}>
          Open recursive tag extraction & staging
        </button>
      </section>
    </WorkspacePanel>
  );
}
export function transferTag(project: Project, asset: ForgeAsset): Project {
  if (!project.quickForge) return placeLibraryModel(project,asset,[0,0,0]).project;
  if (!asset.sourceProjectId || !asset.sourceSha256 || asset.tagId === null)
    throw new Error('The asset must have a preserved source map and tag identity.');
  if (project.quickForge.placements.length >= 1024)
    throw new Error('The QuickForge placement limit is 1024.');
  const position = project.quickForge.spawns[0]?.position ?? [0, 0, 0];
  return {
    ...project,
    quickForge: {
      ...project.quickForge,
      placements: [...project.quickForge.placements, placeAsset(asset, [...position])],
    },
  };
}
