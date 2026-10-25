import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, RefreshCw, Search } from 'lucide-react';
import { call } from '../api';
import { compareProjects } from '../compare';
import type { LibraryEntry, OpenProject } from '../types';
import { Empty, Notice, PageTitle, Pill } from './ui';

export default function Compare({
  entries,
  currentId,
  dirty,
  onSave,
}: {
  entries: LibraryEntry[];
  currentId?: string;
  dirty: boolean;
  onSave: () => Promise<void>;
}) {
  const maps = entries.filter((entry) => entry.version !== null);
  const [leftId, setLeftId] = useState(
    currentId && maps.some((e) => e.id === currentId) ? currentId : (maps[0]?.id ?? ''),
  );
  const [rightId, setRightId] = useState(maps.find((e) => e.id !== leftId)?.id ?? '');
  const [pair, setPair] = useState<[OpenProject, OpenProject] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(150);
  useEffect(() => {
    let alive = true;
    setPair(null);
    setError('');
    if (!leftId || !rightId) return;
    setLoading(true);
    Promise.all([
      call<OpenProject>('open_project', { id: leftId }),
      call<OpenProject>('open_project', { id: rightId }),
    ])
      .then((value) => {
        if (alive) setPair(value);
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
  }, [leftId, rightId, epoch, saved, dirty]);
  const comparison = useMemo(() => (pair ? compareProjects(pair[0], pair[1], saved) : null), [pair, saved]);
  const rows = useMemo(
    () =>
      comparison?.rows.filter(
        (row) =>
          (category === 'all' || row.category === category) &&
          (status === 'all' || row.status === status) &&
          `${row.subject} ${row.property} ${row.before} ${row.after}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ) ?? [],
    [comparison, category, status, query],
  );
  useEffect(() => setLimit(150), [category, status, query, comparison]);
  async function refresh() {
    try {
      if (dirty) await onSave();
      setEpoch((v) => v + 1);
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <div className="analysis-page">
      <PageTitle
        eyebrow="PRESERVATION / SEMANTIC COMPARISON"
        title="Compare map variants"
        description="Find decoded changes by tag identity and scenario structure. Original files stay intact."
        actions={
          <button onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={15} />
            {dirty ? 'Save & refresh' : 'Refresh comparison'}
          </button>
        }
      />
      {maps.length < 2 ? (
        <Empty icon={<ArrowLeftRight size={28} />} title="Import two map variants">
          Use Import map or archive in the library to add restoration candidates, then compare them here.
        </Empty>
      ) : (
        <>
          <div className="compare-selectors">
            <label>
              Before / baseline
              <select aria-label="Baseline map" value={leftId} onChange={(e) => setLeftId(e.target.value)}>
                {maps.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.title} · cache {entry.version} · {entry.id.slice(0, 6)}
                  </option>
                ))}
              </select>
            </label>
            <button
              aria-label="Swap compared maps"
              onClick={() => {
                setLeftId(rightId);
                setRightId(leftId);
              }}
            >
              <ArrowLeftRight size={18} />
            </button>
            <label>
              After / candidate
              <select aria-label="Candidate map" value={rightId} onChange={(e) => setRightId(e.target.value)}>
                {maps.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.title} · cache {entry.version} · {entry.id.slice(0, 6)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="checkbox-label">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
            Include saved project overlays and workshop assets
          </label>
          {saved && dirty && (
            <Notice>
              Unsaved changes are excluded. Use Save &amp; refresh to compare the latest project overlays.
            </Notice>
          )}
          {leftId === rightId && <Notice tone="info">Both selectors refer to the same project.</Notice>}
          {error && <Notice>{error}</Notice>}
          {loading && (
            <div className="loading" role="status">
              Reading preserved maps…
            </div>
          )}
          {pair && comparison && (
            <>
              <div className="compare-identities">
                {pair.map((open, i) => (
                  <div key={i}>
                    <strong>
                      {i === 0 ? 'Before' : 'After'} · {open.project.title}
                    </strong>
                    <span>
                      {open.inspection?.header.engine ?? 'Uninspected'} · cache{' '}
                      {open.inspection?.header.version ?? '?'}
                    </span>
                    <code>{open.inspection?.sha256 ?? 'No source hash'}</code>
                    {open.project.source?.archive && (
                      <small>Archive entry: {open.project.source.archive.entryPath}</small>
                    )}
                  </div>
                ))}
              </div>
              <div className="analysis-summary">
                <Pill tone="blue">{comparison.matchedTags} matched tag identities</Pill>
                <Pill>{comparison.unchangedAuditedTags} unchanged audited tags</Pill>
                {(['added', 'removed', 'changed', 'unknown'] as const).map((value) => (
                  <Pill key={value} tone={value === 'unknown' ? 'amber' : 'muted'}>
                    {comparison.rows.filter((row) => row.status === value).length} {value}
                  </Pill>
                ))}
              </div>
              <details className="analysis-coverage" open>
                <summary>Comparison coverage and limits</summary>
                <div>
                  {comparison.coverage.map((item) => (
                    <div key={item.area}>
                      <strong>
                        {item.area}
                        <Pill tone={item.status === 'unknown' ? 'amber' : 'muted'}>{item.status}</Pill>
                      </strong>
                      <p>{item.detail}</p>
                    </div>
                  ))}
                </div>
              </details>
              <div className="analysis-filters">
                <div className="search-input">
                  <Search size={15} />
                  <input
                    aria-label="Search differences"
                    placeholder="Search subjects and values…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Difference category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="all">All categories</option>
                  {[...new Set(comparison.rows.map((row) => row.category))].sort().map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                <select
                  aria-label="Difference status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="all">All statuses</option>
                  {['added', 'removed', 'changed', 'unknown'].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </div>
              <div className="difference-list">
                {rows.slice(0, limit).map((row) => (
                  <article className={`difference-row diff-${row.status}`} key={row.id}>
                    <div>
                      <Pill tone={row.status === 'unknown' ? 'amber' : 'blue'}>{row.status}</Pill>
                      <span className="subtle">{row.category}</span>
                    </div>
                    <h3>{row.subject}</h3>
                    <strong>{row.property}</strong>
                    <div className="difference-values">
                      <div>
                        <small>Before</small>
                        <code>{row.before}</code>
                      </div>
                      <div>
                        <small>After</small>
                        <code>{row.after}</code>
                      </div>
                    </div>
                    {row.detail && <p>{row.detail}</p>}
                  </article>
                ))}
              </div>
              {!rows.length && (
                <Notice tone="info">
                  No decoded differences match this view. Undecoded tag and asset contents remain unknown.
                </Notice>
              )}
              {rows.length > limit && (
                <button className="full" onClick={() => setLimit((v) => v + 150)}>
                  Show 150 more ({rows.length - limit} remaining)
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
