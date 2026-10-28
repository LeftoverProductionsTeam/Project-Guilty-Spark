import { useEffect, useState } from 'react';
import type { Bootstrap, OpenProject, Project } from '../types';
import type { MapDocument } from '../mapDocuments';
import { call } from '../api';
import { catalogAssets, placeAsset } from '../forge';
import type { ForgeAsset } from '../forge';
import { Notice } from './ui';
export type TransferSelection =
  { kind: 'tag'; asset: ForgeAsset } | { kind: 'obj'; sourceId: string; assetId: string };
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
  const sources = data.entries.filter((e) => e.id !== target.id),
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
  return (
    <section className="asset-transfer-panel" aria-label="Transfer map assets">
      <header>
        <div>
          <h3>Transfer assets into {target.title}</h3>
          <p>
            Preserved source references and verified local geometry. Transfers copy; the source stays
            available.
          </p>
        </div>
        <button onClick={onClose}>Close transfers</button>
      </header>
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
        {open?.project.assets
          .filter((a) => a.name.toLowerCase().includes(query.toLowerCase()))
          .map((a) => (
            <button
              key={a.id}
              disabled={busy}
              onClick={() =>
                void onTransfer({ kind: 'obj', sourceId: open.project.id, assetId: a.id }).catch((e) =>
                  setError(String(e)),
                )
              }
            >
              {a.name} · {a.triangles.toLocaleString()} triangles · copy OBJ
            </button>
          ))}
        {tags.slice(0, 200).map((a) => (
          <button
            key={a.key}
            disabled={busy || !target.quickForge}
            onClick={() => void onTransfer({ kind: 'tag', asset: a }).catch((e) => setError(String(e)))}
          >
            {a.name} · {a.class} · add source-linked model
          </button>
        ))}
      </div>
      {!target.quickForge && tags.length > 0 && (
        <Notice>
          Halo tag placements transfer into editable QuickForge projects. An imported compiled cache needs tag
          extraction, dependency staging and a rebuild before foreign tags can appear in gameplay. OBJ
          geometry can be copied here as workshop assets.
        </Notice>
      )}
      {tags.length > 200 && <p>Showing the first 200 tags; narrow the search to find more.</p>}
      {!sources.length && <p>Import another map in Map Library to choose its assets.</p>}
      {error && <Notice tone="error">{error}</Notice>}
      <button className="small-button" onClick={onTags}>
        Open recursive tag extraction & staging
      </button>
    </section>
  );
}
export function transferTag(project: Project, asset: ForgeAsset): Project {
  if (!project.quickForge)
    throw new Error('Choose an editable QuickForge target before transferring Halo tag placements.');
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
