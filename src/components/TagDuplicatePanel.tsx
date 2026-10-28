import { useMemo, useState } from 'react';
import type { MapInspection, Project, Tag } from '../types';
import { queueTagDuplicate } from '../tagDuplicates';
import { useMapState } from '../mapSession';
import { Notice } from './ui';
export default function TagDuplicatePanel({
  project,
  inspection,
  source,
  edit,
}: {
  project: Project;
  inspection: MapInspection;
  source: Tag;
  edit: (project: Project, description: string) => void;
}) {
  const referrers = useMemo(
      () =>
        inspection.tags.filter(
          (t) => t.id !== source.id && t.references.some((r) => r.targetId === source.id),
        ),
      [inspection, source.id],
    ),
    defaultOwner = referrers[0]?.id ?? inspection.tags.find((t) => t.class === 'scnr')?.id ?? -1;
  const [path, setPath] = useMapState(project.id, `duplicate-tag-path:${source.id}`, `${source.path}_copy`),
    [owner, setOwner] = useMapState(project.id, `duplicate-tag-owner:${source.id}`, defaultOwner),
    [query, setQuery] = useState(''),
    [error, setError] = useState('');
  const linked = useMemo(() => new Set(referrers.map((t) => t.id)), [referrers]);
  const candidates = useMemo(
      () =>
        inspection.tags
          .filter(
            (t) =>
              t.id !== source.id &&
              t.class !== 'sbsp' &&
              (t.path.toLowerCase().includes(query.toLowerCase()) || t.id === owner),
          )
          .sort(
            (a, b) =>
              Number(b.id === owner) - Number(a.id === owner) ||
              Number(linked.has(b.id)) - Number(linked.has(a.id)),
          )
          .slice(0, 100),
      [inspection, source.id, query, owner, linked],
    ),
    plans = project.tagDuplicates ?? [];
  return (
    <details className="analysis-card tag-duplicate-panel">
      <summary>Duplicate real tag · {plans.length} queued</summary>
      <p>
        Build an independent tag from this source and redirect references in one selected tag. Dependencies
        remain shared. The source cache stays unchanged; open the compiled result to edit the new tag.
      </p>
      <label>
        New tag path (without extension)
        <input aria-label="Duplicate tag path" value={path} onChange={(e) => setPath(e.target.value)} />
      </label>
      <label>
        Find referencing tag
        <input
          aria-label="Find duplicate referencing tag"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by tag path…"
        />
      </label>
      <label>
        Redirect references in
        <select
          aria-label="Duplicate referencing tag"
          value={owner}
          onChange={(e) => setOwner(Number(e.target.value))}
        >
          {candidates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.path} · {t.class}
              {referrers.some((r) => r.id === t.id) ? ' · linked' : ''}
            </option>
          ))}
        </select>
      </label>
      <p className="subtle">
        The build verifies a real dependency before changing it. Campaign script names and placement indices
        are preserved. Requires the native MCC editing kit, matching editable tags and Invader. A completed
        build still needs an engine load test.
      </p>
      <button
        disabled={['scnr', 'sbsp', 'matg'].includes(source.class)}
        onClick={() => {
          try {
            edit(queueTagDuplicate(project, inspection, source, owner, path), `Duplicate tag ${source.path}`);
            setError('');
          } catch (error) {
            setError(String(error));
          }
        }}
      >
        Queue tag duplicate for rebuild
      </button>
      {plans.length > 0 && (
        <ul>
          {plans.map((plan) => (
            <li key={plan.id}>
              <code>{plan.path}</code>{' '}
              <button
                className="small-button"
                onClick={() =>
                  edit(
                    { ...project, tagDuplicates: plans.filter((p) => p.id !== plan.id) },
                    'Remove queued tag duplicate',
                  )
                }
              >
                Remove duplicate {plan.path}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </details>
  );
}
