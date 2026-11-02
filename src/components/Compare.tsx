import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { call } from '../api';
import { compareProjects } from '../compare';
import type { LibraryEntry, OpenProject } from '../types';
import { useMapState } from '../mapSession';
import { Empty, Notice, Pill } from './ui';
import { WorkspacePanel } from './WorkspacePanels';

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
  const maps = useMemo(() => entries.filter((entry) => entry.version !== null), [entries]);
  const scope = currentId ?? 'global';
  const [leftId, setLeftId] = useMapState(
    scope,
    'compare.before',
    currentId && maps.some((e) => e.id === currentId) ? currentId : (maps[0]?.id ?? ''),
  );
  const [rightId, setRightId] = useMapState(
    scope,
    'compare.after',
    maps.find((e) => e.id !== leftId)?.id ?? '',
  );
  const [pair, setPair] = useState<[OpenProject, OpenProject] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useMapState(scope, 'compare.saved', false);
  const [epoch, setEpoch] = useState(0);
  const [category, setCategory] = useMapState(scope, 'compare.category', 'all');
  const [status, setStatus] = useMapState(scope, 'compare.status', 'all');
  const [query, setQuery] = useMapState(scope, 'compare.query', '');
  const [page, setPage] = useMapState(scope, 'compare.page', 0);
  const [pageSize, setPageSize] = useState(12);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!maps.some((entry) => entry.id === leftId)) setLeftId(maps[0]?.id ?? '');
    if (!maps.some((entry) => entry.id === rightId))
      setRightId(maps.find((entry) => entry.id !== leftId)?.id ?? '');
  }, [maps, leftId, rightId, setLeftId, setRightId]);
  useEffect(() => {
    let alive = true;
    setPair(null);
    setError('');
    if (!leftId || !rightId) {
      setLoading(false);
      return;
    }
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
  const counts = useMemo(() => {
    const result = { added: 0, removed: 0, changed: 0, unknown: 0 };
    for (const row of comparison?.rows ?? []) result[row.status]++;
    return result;
  }, [comparison]);
  const hasComparison = comparison !== null;
  useEffect(() => {
    const element = list.current;
    if (!element) return;
    // Fill the available workspace with rows. Only an expanded value needs
    // scrolling; smaller windows get a shorter page, not clipped controls.
    const measure = () => setPageSize(Math.max(3, Math.min(100, Math.floor(element.clientHeight / 32))));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasComparison]);
  const lastPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1);
  const visiblePage = Math.max(0, Math.min(Math.floor(page), lastPage));
  const firstRow = visiblePage * pageSize;
  async function refresh() {
    try {
      if (dirty) await onSave();
      setEpoch((v) => v + 1);
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <div className="analysis-page compare-page">
      <header className="compare-toolbar">
        <h1 title="Compare decoded tag values and scenario structure. Original files stay intact.">
          Compare variants
        </h1>
        {maps.length >= 2 && (
          <div className="compare-selectors">
            <label>
              Before
              <select
                aria-label="Baseline map"
                value={leftId}
                onChange={(e) => {
                  setLeftId(e.target.value);
                  setPage(0);
                }}
              >
                {maps.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.title} · cache {entry.version} · {entry.id.slice(0, 6)}
                  </option>
                ))}
              </select>
            </label>
            <button
              aria-label="Swap compared maps"
              title="Swap before and after"
              onClick={() => {
                setLeftId(rightId);
                setRightId(leftId);
                setPage(0);
              }}
            >
              <ArrowLeftRight size={15} />
            </button>
            <label>
              After
              <select
                aria-label="Candidate map"
                value={rightId}
                onChange={(e) => {
                  setRightId(e.target.value);
                  setPage(0);
                }}
              >
                {maps.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.title} · cache {entry.version} · {entry.id.slice(0, 6)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <div className="compare-actions">
          <button
            aria-label={dirty ? 'Save & refresh comparison' : 'Refresh comparison'}
            title={dirty ? 'Save & refresh comparison' : 'Refresh comparison'}
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw size={14} />
            {dirty && <span>Save &amp; refresh</span>}
          </button>
        </div>
      </header>
      {maps.length < 2 ? (
        <Empty icon={<ArrowLeftRight size={28} />} title="Import two map variants">
          Use Import map or archive in the library to add restoration candidates, then compare them here.
        </Empty>
      ) : (
        <>
          <WorkspacePanel id="compare-info" label="Comparison info" defaultDock="right">
            <div className="compare-info">
              <p>
                Compares decoded tag values and scenario structure. Original files stay intact; undecoded
                content remains unknown.
              </p>
              <label className="checkbox-label">
                <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
                Include saved edits and workshop assets
              </label>
              {pair && comparison && (
                <>
                  <p className="subtle">
                    {comparison.matchedTags} matched tag identities · {comparison.unchangedAuditedTags}{' '}
                    unchanged audited tags
                  </p>
                  <details className="compare-source-details">
                    <summary>Source identities &amp; archive details</summary>
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
                  </details>
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
                </>
              )}
            </div>
          </WorkspacePanel>
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
              <div className="compare-controls">
                <div className="analysis-summary">
                  <span title={`${comparison.unchangedAuditedTags} unchanged audited tags`}>
                    {comparison.matchedTags} matched
                  </span>
                  {(['added', 'removed', 'changed', 'unknown'] as const).map((value) => (
                    <Pill key={value} tone={value === 'unknown' ? 'amber' : 'muted'}>
                      {counts[value]} {value}
                    </Pill>
                  ))}
                </div>
                <div className="analysis-filters">
                  <div className="search-input">
                    <Search size={15} />
                    <input
                      aria-label="Search differences"
                      placeholder="Search tags or values…"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setPage(0);
                      }}
                    />
                  </div>
                  <select
                    aria-label="Difference category"
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      setPage(0);
                    }}
                  >
                    <option value="all">All categories</option>
                    {[...new Set(comparison.rows.map((row) => row.category))].sort().map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Difference status"
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      setPage(0);
                    }}
                  >
                    <option value="all">All statuses</option>
                    {['added', 'removed', 'changed', 'unknown'].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="difference-columns" aria-hidden="true">
                <span />
                <span>Status</span>
                <span>Tag / subject</span>
                <span>Field</span>
                <span>Before</span>
                <span>After</span>
              </div>
              <div className="difference-list" ref={list} aria-label="Comparison results">
                {rows.slice(firstRow, firstRow + pageSize).map((row) => (
                  <details className={`difference-row diff-${row.status}`} key={row.id}>
                    <summary>
                      <ChevronRight className="difference-expander" size={13} />
                      <Pill tone={row.status === 'unknown' ? 'amber' : 'blue'}>{row.status}</Pill>
                      <strong title={row.subject}>{row.subject}</strong>
                      <span className="subtle" title={row.category}>
                        {row.property}
                      </span>
                      <code title={row.before}>{row.before}</code>
                      <code title={row.after}>{row.after}</code>
                    </summary>
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
                    <small className="difference-category">{row.category}</small>
                  </details>
                ))}
              </div>
              {!rows.length && (
                <Notice tone="info">
                  No decoded differences match this view. Undecoded tag and asset contents remain unknown.
                </Notice>
              )}
              <nav className="compact-pagination" aria-label="Difference pages">
                <span aria-live="polite">
                  {rows.length
                    ? `${firstRow + 1}–${Math.min(rows.length, firstRow + pageSize)} of ${rows.length}`
                    : '0 results'}
                </span>
                <button disabled={!visiblePage} onClick={() => setPage(visiblePage - 1)}>
                  Previous
                </button>
                <button disabled={visiblePage >= lastPage} onClick={() => setPage(visiblePage + 1)}>
                  Next
                </button>
              </nav>
            </>
          )}
        </>
      )}
    </div>
  );
}
