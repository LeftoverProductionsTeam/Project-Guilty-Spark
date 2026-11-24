import { useState } from 'react';
import { call, native } from '../api';
import type { LibraryEntry } from '../types';

type Field = { class: string; path: string; field: string; label: string; matchingProjectIds: string[] };
type FieldSearch = { fields: Field[]; unreadableMaps: { projectId: string; problem: string }[] };
type Edit = { before: number; after: number; kind: string; unit: string; sourceSha256: string; cacheVersion: number };
type Preview = { rows: { projectId: string; edit: Edit | null; problem: string | null }[]; reviewSha256: string | null; recoverable: boolean };
type Outcome = { batchId: string; published: boolean; recoverable: boolean; problem: string | null; rows: { projectId: string; status: string; detail: string; output: string | null; sha256: string | null }[] };

export default function MultiMapBatchEditing({ entries, onOpenMccTools }: { entries: LibraryEntry[]; onOpenMccTools: () => void }) {
  const savedMaps = entries.filter((entry) => entry.version != null && !entry.sessionOnly);
  const [selected, setSelected] = useState<string[]>([]);
  const ids = selected.filter((id) => savedMaps.some((entry) => entry.id === id));
  const [mapQuery, setMapQuery] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<FieldSearch>();
  const [field, setField] = useState<Field>();
  const [value, setValue] = useState('');
  const [preview, setPreview] = useState<Preview>();
  const [outcome, setOutcome] = useState<Outcome>();
  const [problem, setProblem] = useState('');
  const [pending, setPending] = useState(false);
  const [job, setJob] = useState<string>();
  const [cancelRequested, setCancelRequested] = useState(false);
  const title = (id: string) => entries.find((entry) => entry.id === id)?.title ?? id;
  const rule = field && { class: field.class, path: field.path, field: field.field, value: Number(value) };
  const filtered = savedMaps.filter((entry) => `${entry.title} ${entry.engine}`.toLowerCase().includes(mapQuery.toLowerCase()));
  const unreadable = search?.unreadableMaps.filter((map) => ids.includes(map.projectId)) ?? [];
  const compatible = field ? ids.filter((id) => field.matchingProjectIds.includes(id)) : [];
  const missing = field ? ids.filter((id) => !compatible.includes(id) && !unreadable.some((map) => map.projectId === id)) : [];
  const canReview = !!rule && !!value.trim() && Number.isFinite(rule.value);

  function select(next: string[]) {
    setSelected(next);
    setSearch(undefined);
    setField(undefined);
    setPreview(undefined);
  }

  async function perform(action: () => Promise<void>) {
    setPending(true);
    setProblem('');
    try {
      await action();
    } catch (error) {
      setProblem(String(error));
    } finally {
      setPending(false);
    }
  }

  function review(maps: string[]) {
    if (!canReview || !rule || maps.length < 2 || maps.length > 32) return;
    setSelected(maps);
    setPreview(undefined);
    setOutcome(undefined);
    void perform(async () => {
      setPreview(await call<Preview>('preview_numeric_batch', { ids: maps, rule }));
    });
  }

  return (
    <details className="panel multi-map-batch">
      <summary>Multi Map Batch Editing</summary>
      <p>Review one numeric tag change across saved imported maps and build a separate set of MCC map files.</p>
      {!native ? <p>Batch review and compilation are available in the desktop app.</p> : (
        <>
          <button type="button" disabled={pending || Boolean(job)} onClick={() => {
            setPreview(undefined);
            setProblem('');
            onOpenMccTools();
          }}>MCC editing tools</button>
          <fieldset disabled={pending || Boolean(job)}>
            <legend>Source maps · {ids.length} selected</legend>
            <label>Find saved maps <input value={mapQuery} onChange={(event) => setMapQuery(event.target.value)} /></label>
            <button type="button" disabled={!savedMaps.some((entry) => entry.scenarioType === 0)} onClick={() => select(savedMaps.filter((entry) => entry.scenarioType === 0).map((entry) => entry.id))}>
              Select saved solo maps
            </button>
            <button type="button" disabled={!ids.length} onClick={() => select([])}>Clear selection</button>
            {ids.length > 32 && <p role="alert">Choose at most 32 maps for one batch.</p>}
            <div className="batch-map-list">
              {filtered.map((entry) => (
                <label key={entry.id}>
                  <input type="checkbox" checked={ids.includes(entry.id)} onChange={(event) => select(event.target.checked ? [...ids, entry.id] : ids.filter((id) => id !== entry.id))} />
                  <span>{entry.title} · cache {entry.version}</span>
                </label>
              ))}
              {!filtered.length && <p>No matching saved maps.</p>}
            </div>
          </fieldset>
          <fieldset disabled={pending || Boolean(job)}>
            <legend>Numeric tag edit</legend>
            <form onSubmit={(event) => {
              event.preventDefault();
              if (!ids.length || ids.length > 32) return;
              setSearch(undefined);
              setField(undefined);
              setPreview(undefined);
              void perform(async () => {
                setSearch(await call<FieldSearch>('search_batch_fields', { ids, query }));
              });
            }}>
              <label>Tag or field <input value={query} maxLength={192} onChange={(event) => setQuery(event.target.value)} /></label>
              <button type="submit" disabled={!ids.length || ids.length > 32}>Find fields and check selected maps</button>
            </form>
            {search && <label>
              Numeric tag field
              <select aria-label="Numeric tag field" value={field ? JSON.stringify(field) : ''} onChange={(event) => {
                setField(search.fields.find((match) => JSON.stringify(match) === event.target.value));
                setPreview(undefined);
              }}>
                <option value="">Choose a field</option>
                {search.fields.map((match) => {
                  const count = ids.filter((id) => match.matchingProjectIds.includes(id)).length;
                  return count > 0 && <option key={JSON.stringify(match)} value={JSON.stringify(match)}>{match.label} · {match.path} ({match.class}) · {count}/{ids.length} maps</option>;
                })}
              </select>
            </label>}
            {search?.fields.length === 0 && <p>No editable numeric fields match in {title(ids[0])}.</p>}
            {unreadable.map((map) => <p key={map.projectId} role="status">{title(map.projectId)} · {map.problem}</p>)}
            {missing.length > 0 && <p>Missing or incompatible field in {missing.map(title).join(', ')}.</p>}
            <label>New value <input type="number" step="any" value={value} onChange={(event) => {
              setValue(event.target.value);
              setPreview(undefined);
            }} /></label>
            <button type="button" disabled={!canReview || ids.length < 2 || ids.length > 32}
              onClick={() => review(ids)}>Review every map</button>
            {compatible.length >= 2 && compatible.length < ids.length && (
              <button type="button" disabled={!canReview}
                onClick={() => review(compatible)}>Review {compatible.length} compatible maps</button>
            )}
          </fieldset>
          {preview && (
            <>
              <ul aria-label="Per-map review">
                {preview.rows.map(({ projectId, edit, problem: issue }) => (
                  <li key={projectId}><strong>{title(projectId)}</strong>{edit
                    ? <> · cache {edit.cacheVersion} · {edit.before} → {edit.after} {edit.unit} · <code title={edit.sourceSha256}>{edit.sourceSha256.slice(0, 12)}</code></>
                    : <> · {issue}</>}</li>
                ))}
              </ul>
              <button type="button" disabled={!preview.reviewSha256 || pending || Boolean(job)} onClick={() => {
                const batchId = crypto.randomUUID();
                setJob(batchId);
                setCancelRequested(false);
                setOutcome(undefined);
                void perform(async () => {
                  try {
                    const result = await call<Outcome>('build_numeric_batch', { ids, rule, reviewSha256: preview.reviewSha256, batchId });
                    setOutcome(result);
                    setPreview({ ...preview, recoverable: result.recoverable });
                  } finally {
                    setJob(undefined);
                  }
                });
              }}>{preview.recoverable ? 'Resume and verify batch' : 'Build and verify batch'}</button>
            </>
          )}
          {job && <button type="button" disabled={cancelRequested} onClick={() => {
            setCancelRequested(true);
            void call('cancel_build', { jobId: job }).catch((error) => {
              setProblem(String(error));
              setCancelRequested(false);
            });
          }}>{cancelRequested ? 'Cancellation requested' : 'Cancel batch'}</button>}
          {pending && <p role="status">{job ? 'Compiling and checking each reviewed map…' : 'Reading saved maps…'}</p>}
          {problem && <p role="alert">{problem}</p>}
          {outcome && (
            <>
              <p role="status">{outcome.published ? 'Batch published to your local Spark data folder.' : outcome.problem}</p>
              {outcome.recoverable && <p>Verified maps were kept privately. Resume this same review to continue.</p>}
              {outcome.published && <button type="button" onClick={() => void call('reveal_folder', { kind: 'mapBatch', id: outcome.batchId }).catch((error) => setProblem(String(error)))}>Open batch output</button>}
              <ul aria-label="Per-map build results">
                {outcome.rows.map((row) => <li key={row.projectId}>{title(row.projectId)} · {row.status} · {row.detail}{outcome.published && row.sha256 && <> · {row.output} <code title={row.sha256}>{row.sha256.slice(0, 12)}</code></>}</li>)}
              </ul>
            </>
          )}
        </>
      )}
    </details>
  );
}
