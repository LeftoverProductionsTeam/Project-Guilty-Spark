import { useCallback, useEffect, useState } from 'react';
import { HardDrive, RefreshCw, Trash2 } from 'lucide-react';
import { call, native } from '../api';
import { nativePreviewResourceStats, trimNativePreviewResources } from '../nativePreviewResources';
import { previewBudgets, savePreviewBudgets, type PreviewBudgets } from '../resourceBudgets';
import './storageSettings.css';
interface Limits {
  previewBytes: number;
  stagingBytes: number;
  diagnosticsBytes: number;
  compilerBytes: number;
  totalBytes: number;
  perOperationBytes: number;
  minimumFreeBytes: number;
  abandonedDays: number;
}
interface Entry {
  id: string;
  category: string;
  path: string;
  state: string;
  logicalBytes: number;
  allocatedBytes: number | null;
  protected: boolean;
  description: string;
}
interface Plan {
  token: string;
  eligible: Entry[];
  protected: string[];
  bytes: number;
}
interface Report {
  managed: {
    root: string;
    limits: Limits;
    entries: Entry[];
    accountedBytes: number;
    freeBytes: number | null;
    legacyNote: string;
  };
  folders: {
    id: string;
    label: string;
    group: 'halo' | 'spark';
    path: string;
    measurement: { logicalBytes: number; allocatedBytes: number | null; files: number } | null;
    policy: string;
  }[];
  cleanup: Plan;
  note: string;
}
interface HaloUsage {
  folders: Report['folders'];
  total: NonNullable<Report['folders'][number]['measurement']>;
  skippedLinks: number;
  measuredAt: string;
}
const size = (bytes: number | null) =>
  bytes === null
    ? 'Unavailable'
    : bytes < 1024
      ? `${bytes} B`
      : bytes < 1024 ** 2
        ? `${(bytes / 1024).toFixed(1)} KiB`
        : bytes < 1024 ** 3
          ? `${(bytes / 1024 ** 2).toFixed(1)} MiB`
          : `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
const fields: [keyof Limits, string][] = [
  ['totalBytes', 'Managed generated data'],
  ['stagingBytes', 'Native build staging'],
  ['previewBytes', 'Persistent previews'],
  ['compilerBytes', 'Compiler intermediates'],
  ['diagnosticsBytes', 'Diagnostics'],
  ['perOperationBytes', 'One operation'],
  ['minimumFreeBytes', 'Keep disk space free'],
];
export default function StorageSettings() {
  const [previews, setPreviews] = useState<PreviewBudgets>(previewBudgets);
  const [haloUsage, setHaloUsage] = useState<HaloUsage | null>(null);
  const [measuring, setMeasuring] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null),
    [limits, setLimits] = useState<Limits | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [selected, setSelected] = useState<string[]>([]),
    [review, setReview] = useState(false),
    [approved, setApproved] = useState(false),
    [page, setPage] = useState(0);
  const refresh = useCallback(async () => {
    if (!native) return;
    setBusy(true);
    setError('');
    try {
      const next = await call<Report>('storage_overview');
      setReport(next);
      setHaloUsage(null);
      setLimits(next.managed.limits);
      setSelected([]);
      setReview(false);
      setApproved(false);
      setPage(0);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const measureFolder = async (folder: Report['folders'][number]) => {
    if (!native || measuring || folder.measurement) return;
    setMeasuring(folder.path);
    setError('');
    const currentRoot = report?.managed.root;
    try {
      const result = await call<Report['folders'][number]>('storage_measure_folder', { folderId: folder.id });
      setReport((current) => {
        if (!current || current.managed.root !== currentRoot) return current;
        return {
          ...current,
          folders: current.folders.map((item) => (item.path === result.path ? result : item)),
        };
      });
    } catch (problem) {
      setError(String(problem));
    } finally {
      setMeasuring(null);
    }
  };
  const measureHalos = async () => {
    if (!native || !report || busy || measuring) return;
    const root = report.managed.root;
    setMeasuring('halos');
    setError('');
    try {
      const result = await call<HaloUsage>('storage_measure_halos');
      setHaloUsage(result);
      setReport((current) => {
        if (!current || current.managed.root !== root) return current;
        return {
          ...current,
          folders: current.folders.map(
            (folder) => result.folders.find((item) => item.id === folder.id) ?? folder,
          ),
        };
      });
    } catch (problem) {
      setError(String(problem));
    } finally {
      setMeasuring(null);
    }
  };
  const cleanup = async () => {
    if (!report || !approved || !selected.length) return;
    setBusy(true);
    setError('');
    try {
      await call('storage_cleanup', { plan: report.cleanup, ids: selected, confirmed: true });
      await refresh();
    } catch (e) {
      setError(String(e));
      setBusy(false);
      setApproved(false);
    }
  };
  const memory = nativePreviewResourceStats();
  const eligible = report?.cleanup.eligible ?? [];
  const pages = Math.max(1, Math.ceil(eligible.length / 8));
  const folderRow = (folder: Report['folders'][number]) => (
    <details
      key={folder.id}
      onToggle={(event) => {
        if (event.currentTarget.open) void measureFolder(folder);
      }}
    >
      <summary>
        <strong>{folder.label}</strong>
        <span>
          {folder.measurement
            ? `${size(folder.measurement.allocatedBytes ?? folder.measurement.logicalBytes)} · ${folder.measurement.files.toLocaleString()} files`
            : measuring === folder.path || (measuring === 'halos' && folder.group === 'halo')
              ? 'Measuring…'
              : 'Open to measure'}
        </span>
      </summary>
      <p>{folder.policy}</p>
      <code>{folder.path}</code>
      {folder.measurement && (
        <small>
          {size(folder.measurement.logicalBytes)} file data · {size(folder.measurement.allocatedBytes)}{' '}
          allocated
        </small>
      )}
      {!folder.measurement && (
        <button disabled={!!measuring || busy} onClick={() => void measureFolder(folder)}>
          Measure folder
        </button>
      )}
    </details>
  );
  return (
    <section className="gs-storage" aria-label="Storage and cache settings">
      <header>
        <div>
          <h2>
            <HardDrive size={18} />
            Storage &amp; Cache
          </h2>
          <p>Keep source and working builds safe. Review generated files before removing them.</p>
        </div>
        <button disabled={!native || busy || !!measuring} onClick={() => void refresh()}>
          <RefreshCw size={14} />
          Inspect storage
        </button>
      </header>
      {!native && (
        <p role="status">Open the desktop app to inspect local files and configure disk budgets.</p>
      )}
      {busy && <p role="status">Checking storage…</p>}
      {error && (
        <p className="gs-storage-error" role="alert">
          {error}
        </p>
      )}
      <div className="gs-storage-stats">
        <span>
          <b>{size(report?.managed.accountedBytes ?? 0)}</b>Managed generated data
        </span>
        <span>
          <b>{size(report?.managed.freeBytes ?? null)}</b>Disk space available
        </span>
        <span>
          <b>
            {size(memory.bytes)} / {size(memory.maxBytes)}
          </b>
          Decoded preview memory
        </span>
      </div>
      {report && (
        <>
          <section className="gs-storage-halos" aria-label="Halo directory storage">
            <header>
              <h3>Halo directories</h3>
              <button
                disabled={!report.folders.some((folder) => folder.group === 'halo') || busy || !!measuring}
                onClick={() => void measureHalos()}
              >
                Measure all Halo folders
              </button>
            </header>
            <p>
              {haloUsage ? (
                <>
                  <strong>{size(haloUsage.total.allocatedBytes ?? haloUsage.total.logicalBytes)}</strong>{' '}
                  across {haloUsage.folders.length} connected folders · overlapping folders counted once
                  {haloUsage.total.allocatedBytes !== null
                    ? ' · shared physical files counted once'
                    : ' · file sizes shown; physical allocation unavailable'}
                </>
              ) : (
                'See installed games, connected content and linked map folders. Sizes include every file in each folder.'
              )}
            </p>
            {haloUsage && (
              <small>
                Measured {new Date(haloUsage.measuredAt).toLocaleString()}.{' '}
                {haloUsage.skippedLinks
                  ? `${haloUsage.skippedLinks} linked entries were skipped; connect their original folders to include them.`
                  : 'Original game files stay protected.'}
              </small>
            )}
            {!report.folders.some((folder) => folder.group === 'halo') && (
              <small>Connect a Halo installation or link a map folder in Games &amp; tools.</small>
            )}
            <div className="gs-storage-folders">
              {report.folders.filter((folder) => folder.group === 'halo').map(folderRow)}
            </div>
          </section>
          <div className="gs-storage-folders">
            {report.folders.filter((folder) => folder.group !== 'halo').map(folderRow)}
          </div>
          <small>{report.note}</small>
        </>
      )}
      {limits && (
        <details className="gs-storage-limits" open>
          <summary>Storage limits</summary>
          <div className="gs-storage-limit-grid">
            {fields.map(([key, label]) => (
              <label key={key}>
                {label}
                <span>
                  <input
                    type="number"
                    min={key === 'minimumFreeBytes' ? 0 : 1 / 1024}
                    max={4096}
                    step={0.25}
                    value={Math.round((limits[key] / 1024 ** 3) * 1000) / 1000}
                    onChange={(e) => {
                      const value = e.target.valueAsNumber;
                      if (Number.isFinite(value))
                        setLimits({ ...limits, [key]: Math.round(value * 1024 ** 3) });
                    }}
                  />
                  GiB
                </span>
              </label>
            ))}
            <label>
              Interrupted job review age
              <span>
                <input
                  type="number"
                  min={0}
                  max={3650}
                  value={limits.abandonedDays}
                  onChange={(e) => {
                    if (Number.isInteger(e.target.valueAsNumber))
                      setLimits({ ...limits, abandonedDays: e.target.valueAsNumber });
                  }}
                />
                days
              </span>
            </label>
          </div>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await call('storage_set_limits', { limits });
                await refresh();
              } catch (e) {
                setError(String(e));
                setBusy(false);
              }
            }}
          >
            Save limits
          </button>
          <small>
            New native operations reserve space before copying. Existing sources, research and accepted builds
            stay protected.
          </small>
        </details>
      )}
      <details className="gs-storage-limits">
        <summary>Preview memory &amp; graphics</summary>
        <div className="gs-storage-limit-grid">
          {(
            [
              ['decodedMiB', 'Decoded preview cache', 16, 512],
              ['textureMiB', 'Textures per viewport', 64, 1024],
              ['warmEditors', 'Warm map renderers', 1, 4],
            ] as const
          ).map(([key, label, min, max]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                min={min}
                max={max}
                step={1}
                value={previews[key]}
                onChange={(e) => setPreviews({ ...previews, [key]: e.target.valueAsNumber })}
              />
              {key === 'warmEditors' ? 'maps' : 'MiB'}
            </label>
          ))}
        </div>
        <button
          onClick={() => {
            try {
              savePreviewBudgets(previews);
              trimNativePreviewResources();
              setError('');
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          Save preview limits
        </button>
        <small>
          Texture limits estimate owned texture payloads; geometry, shaders and driver overhead are separate.
          Existing scenes are preserved. Warm-renderer changes take effect on navigation; texture changes
          apply to new image loads.
        </small>
      </details>
      {report && (
        <details className="gs-storage-cleanup" open>
          <summary>
            Temporary files · {eligible.length} eligible · {size(report.cleanup.bytes)}
          </summary>
          {!eligible.length ? (
            <p>
              No verified temporary files are eligible. Original sources and historical jobs are retained.
            </p>
          ) : (
            <>
              {eligible.slice(page * 8, page * 8 + 8).map((entry) => (
                <label className="gs-storage-entry" key={entry.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(entry.id)}
                    disabled={busy}
                    onChange={(e) => {
                      setSelected(
                        e.target.checked ? [...selected, entry.id] : selected.filter((id) => id !== entry.id),
                      );
                      setReview(false);
                      setApproved(false);
                    }}
                  />
                  <span>
                    <strong>{entry.description}</strong>
                    <code>{entry.path}</code>
                  </span>
                  <b>{size(entry.allocatedBytes ?? entry.logicalBytes)}</b>
                </label>
              ))}
              <div className="gs-storage-actions">
                <button disabled={!page} onClick={() => setPage(page - 1)}>
                  Previous
                </button>
                <span>
                  {page + 1} / {pages}
                </span>
                <button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
                  Next
                </button>
                <button disabled={!selected.length || busy} onClick={() => setReview(true)}>
                  <Trash2 size={14} />
                  Review selected files
                </button>
              </div>
            </>
          )}
          {review && (
            <div className="gs-storage-confirm">
              <p>Remove only these {selected.length} generated entries:</p>
              <ul>
                {eligible
                  .filter((e) => selected.includes(e.id))
                  .map((e) => (
                    <li key={e.id}>
                      <code>{e.path}</code> · {size(e.allocatedBytes ?? e.logicalBytes)}
                    </li>
                  ))}
              </ul>
              <label>
                <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} />I
                have reviewed these paths and want to remove the selected temporary files.
              </label>
              <button disabled={!approved || busy} onClick={() => void cleanup()}>
                Remove reviewed temporary files
              </button>
            </div>
          )}
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await call('storage_recover_accounting');
                await refresh();
              } catch (e) {
                setError(String(e));
                setBusy(false);
              }
            }}
          >
            Recheck interrupted-job accounting
          </button>
        </details>
      )}
    </section>
  );
}
