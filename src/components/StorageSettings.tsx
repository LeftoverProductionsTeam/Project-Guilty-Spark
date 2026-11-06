import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderOpen, HardDrive, RefreshCw, Trash2 } from 'lucide-react';
import { call, native } from '../api';
import type { Project, Settings } from '../types';
import { NumberField } from './ui';
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
interface BackupUsage { count: number; logicalBytes: number; allocatedBytes: number | null }
interface BackupOverview {
  projectId: string;
  automaticRetention: number;
  automaticAtCapacity: boolean;
  automaticBlockedReason: string | null;
  inherited: boolean;
  automatic: BackupUsage;
  manual: BackupUsage;
  safety: BackupUsage;
  legacy: BackupUsage;
  recovery: { present: boolean; valid: boolean; logicalBytes: number; allocatedBytes: number | null };
  total: BackupUsage;
  cleanup: {
    projectId: string;
    sourceSha256: string | null;
    retention: number;
    entries: { id: string; sha256: string; bytes: number }[];
  };
}
interface ModLocations {
  modDirectory: string;
  defaultDirectory: string;
  runtimeExportDirectories: Record<string, string>;
  exists: boolean;
  note: string;
}
const exportRuntimes = [
  ['mccSteam', 'MCC Halo 1'],
  ['haloCustomEdition', 'Custom Edition'],
  ['openCe', 'OpenCE'],
  ['chupathingyCe', 'Chupathingy'],
] as const;
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
const backupPresets = [0, 1, 3, 5, 10];
export function automaticBackupLimit(project: Pick<Project, 'automaticBackupRetention'>, settings: Pick<Settings, 'snapshotRetention'>) {
  return project.automaticBackupRetention ?? settings.snapshotRetention ?? 0;
}
export function BackupRetentionSelect({ value, disabled = false, onChange }: {
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const [custom, setCustom] = useState(!backupPresets.includes(value));
  useEffect(() => { if (!backupPresets.includes(value)) setCustom(true); }, [value]);
  return <div className="gs-storage-retention">
    <label>Maximum automatic map backups
      <select aria-label="Maximum automatic map backups" value={custom ? 'custom' : String(value)} disabled={disabled}
        onChange={event => {
          const next = event.target.value;
          setCustom(next === 'custom');
          if (next !== 'custom') onChange(Number(next));
          else if (value === 0) onChange(1);
        }}>
        <option value="0">None (default)</option><option value="1">1</option><option value="3">3</option>
        <option value="5">5</option><option value="10">10</option><option value="custom">Custom…</option>
      </select>
    </label>
    {custom && <NumberField label="Custom automatic backup limit" value={Math.max(1, value)} min={1} max={100} step={1} disabled={disabled}
      onCommit={next => { if (Number.isInteger(next) && next >= 1 && next <= 100) onChange(next); }} />}
  </div>;
}
export default function StorageSettings({ project = null, settings = {}, onEditProject, onBeforeSave }: {
  project?: Project | null;
  settings?: Pick<Settings, 'snapshotRetention'>;
  onEditProject?: (project: Project, title: string) => void;
  onBeforeSave?: (persist?: boolean) => Promise<void>;
}) {
  const [previews, setPreviews] = useState<PreviewBudgets>(previewBudgets);
  const [locations, setLocations] = useState<ModLocations | null>(null);
  const [locationsBusy, setLocationsBusy] = useState(false);
  const [backup, setBackup] = useState<BackupOverview | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupError, setBackupError] = useState('');
  const [backupMessage, setBackupMessage] = useState('');
  const [backupReview, setBackupReview] = useState(false);
  const [backupApproved, setBackupApproved] = useState(false);
  const activeProject = useRef(project?.id);
  const projectGeneration = useRef(0);
  if (activeProject.current !== project?.id) {
    activeProject.current = project?.id;
    ++projectGeneration.current;
  }
  const backupRequest = useRef(0);
  const refreshBackups = useCallback(async (projectId: string) => {
    const request = ++backupRequest.current;
    const next = await call<BackupOverview>('project_backup_overview', { projectId });
    if (activeProject.current === projectId && request === backupRequest.current) {
      setBackup(next);
      setBackupReview(false);
      setBackupApproved(false);
    }
  }, []);
  useEffect(() => {
    ++backupRequest.current;
    setBackup(null);
    setBackupBusy(false);
    setBackupError('');
    setBackupMessage('');
    setBackupReview(false);
    setBackupApproved(false);
    if (native && project) void refreshBackups(project.id).catch(problem => {
      if (activeProject.current === project.id) setBackupError(String(problem));
    });
  }, [project?.id, refreshBackups]);
  useEffect(() => { setBackupReview(false); setBackupApproved(false); }, [project?.automaticBackupRetention]);
  async function backupAction(operation: (projectId: string) => Promise<void>, persist = false) {
    if (!native || !project || !onBeforeSave || backupBusy) return;
    const id = project.id;
    const generation = projectGeneration.current;
    setBackupBusy(true);
    setBackupError('');
    setBackupMessage('');
    try {
      await onBeforeSave(persist);
      if (activeProject.current !== id || generation !== projectGeneration.current) return;
      await operation(id);
      if (activeProject.current === id && generation === projectGeneration.current) await refreshBackups(id);
    } catch (problem) {
      if (activeProject.current === id && generation === projectGeneration.current) setBackupError(String(problem));
    } finally {
      if (activeProject.current === id && generation === projectGeneration.current) setBackupBusy(false);
    }
  }
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
      const [next, nextLocations] = await Promise.all([
        call<Report>('storage_overview'),
        call<ModLocations>('storage_mod_locations'),
      ]);
      setReport(next);
      setLocations(nextLocations);
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
  async function modLocationAction(runtimeId: string | null, action: 'choose' | 'reset' | 'open') {
    if (!native || locationsBusy) return;
    setLocationsBusy(true);
    setError('');
    try {
      if (action === 'open') {
        await call('storage_open_mod_location', { runtimeId });
        setLocations(await call<ModLocations>('storage_mod_locations'));
      } else {
        setLocations(await call<ModLocations>('storage_choose_mod_location', { runtimeId, reset: action === 'reset' }));
      }
    } catch (problem) {
      setError(String(problem));
    } finally {
      setLocationsBusy(false);
    }
  }
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
  const retention = project ? automaticBackupLimit(project, settings) : 0;
  const unsavedBackupLimit = backup !== null && backup.automaticRetention !== retention;
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
        <div className="gs-storage-actions">
          <button disabled={!native || busy} onClick={() => {
            void call('reveal_folder', { kind: 'data' }).catch(problem => setError(String(problem)));
          }}><FolderOpen size={14} />Open Spark folder</button>
          <button disabled={!native || busy || !!measuring} onClick={() => void refresh()}>
            <RefreshCw size={14} />Inspect storage
          </button>
        </div>
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
      {locations && <section className="gs-storage-project gs-storage-locations" aria-label="Mods and export locations">
        <div className="gs-storage-location-row">
          <div><h3>Mods &amp; exports</h3><code title={locations.modDirectory}>{locations.modDirectory}</code></div>
          <button disabled={locationsBusy} onClick={() => void modLocationAction(null, 'choose')}>Choose folder</button>
          <button disabled={locationsBusy || locations.modDirectory === locations.defaultDirectory} onClick={() => void modLocationAction(null, 'reset')}>Use default</button>
          <button disabled={locationsBusy} onClick={() => void modLocationAction(null, 'open')}><FolderOpen size={14} />Open</button>
        </div>
        <small>{locations.note}</small>
        <details><summary>Separate export locations per Halo</summary>
          <div className="gs-storage-runtime-locations">{exportRuntimes.map(([runtimeId, label]) => <div className="gs-storage-location-row" key={runtimeId}>
            <strong>{label}</strong>
            <code title={locations.runtimeExportDirectories[runtimeId] ?? locations.modDirectory}>{locations.runtimeExportDirectories[runtimeId] ?? 'Use mod folder'}</code>
            <button disabled={locationsBusy} aria-label={`Choose ${label} export folder`} title={`Choose ${label} export folder`} onClick={() => void modLocationAction(runtimeId, 'choose')}><FolderOpen size={14} /></button>
            <button disabled={locationsBusy || !locations.runtimeExportDirectories[runtimeId]} onClick={() => void modLocationAction(runtimeId, 'reset')}>Reset</button>
            <button disabled={locationsBusy} aria-label={`Open ${label} export folder`} onClick={() => void modLocationAction(runtimeId, 'open')}>Open</button>
          </div>)}</div>
        </details>
      </section>}
      <section className="gs-storage-project" aria-label="Current project backups">
        <header><h3>{project ? `${project.title} · backups` : 'Project backups'}</h3>
          {backup && <span>{size(backup.total.allocatedBytes ?? backup.total.logicalBytes)} used</span>}
        </header>
        {project ? <>
          <div className="gs-storage-backup-controls">
            <BackupRetentionSelect key={project.id} value={retention} disabled={!native || backupBusy || !onEditProject}
              onChange={automaticBackupRetention => onEditProject?.({ ...project, automaticBackupRetention }, 'Change automatic backup limit')} />
            <button disabled={!native || backupBusy || !onBeforeSave} onClick={() => void backupAction(async () => {
              setBackupMessage('Backup limit saved for this project.');
            }, true)}>{backupBusy ? 'Working…' : 'Save limit'}</button>
            <button disabled={!native || backupBusy || !onBeforeSave} onClick={() => void backupAction(async projectId => {
              await call('create_project_snapshot', { projectId, reason: 'manual' });
              if (activeProject.current === projectId) setBackupMessage('Manual backup created.');
            }, true)}>Back up now</button>
          </div>
          <small>Per map, across revisions. At the limit, review old automatic backups to free a slot. None keeps live Undo in memory; recovery uses your last explicit Save.</small>
          {unsavedBackupLimit && <small role="status">Save the new limit before reviewing old automatic backups.</small>}
          {backup && <>
            <div className="gs-storage-backup-usage">
              <span>{backup.automatic.count} automatic · {size(backup.automatic.allocatedBytes ?? backup.automatic.logicalBytes)}</span>
              <span>{backup.manual.count} manual</span><span>{backup.safety.count} safety checkpoints</span>
              <span>Crash recovery · {backup.recovery.present ? size(backup.recovery.allocatedBytes ?? backup.recovery.logicalBytes) : 'Not needed yet'}</span>
            </div>
            {backup.automaticAtCapacity && !unsavedBackupLimit && <p role="status">Limit reached; review automatic backups to free a slot.</p>}
            {backup.automaticBlockedReason && !backup.automaticAtCapacity && !unsavedBackupLimit && <small role="status">{backup.automaticBlockedReason}</small>}
            <details><summary>What is kept</summary>
              <p>Backups save project edits without duplicating original maps. Reviewing automatic backups leaves manual backups, build/restore safety checkpoints and recovery files intact.</p>
              {backup.inherited && <p>This map uses its existing default limit. Choose a limit above to give it a separate policy.</p>}
              {backup.legacy.count > 0 && <p>{backup.legacy.count} older checkpoints · {size(backup.legacy.allocatedBytes ?? backup.legacy.logicalBytes)} remain protected.</p>}
              {backup.recovery.present && !backup.recovery.valid && <p role="alert">The recovery file needs review. It will not be removed here.</p>}
              <p>Use Preservation record to preview and restore a backup.</p>
            </details>
            {backup.cleanup.entries.length > 0 && <button className="gs-storage-backup-review" disabled={backupBusy || unsavedBackupLimit || !onBeforeSave}
              aria-expanded={backupReview} onClick={() => { setBackupReview(!backupReview); setBackupApproved(false); }}>
              <Trash2 size={14} />Review {backup.cleanup.entries.length} old automatic backups
            </button>}
            {backupReview && !unsavedBackupLimit && <div className="gs-storage-confirm">
              <p>Remove {backup.cleanup.entries.length} reviewed automatic backups from this project ({size(backup.cleanup.entries.reduce((sum, entry) => sum + entry.bytes, 0))}). Manual and safety checkpoints stay.</p>
              <ul className="gs-storage-backup-list" aria-label="Automatic backups selected for removal">{backup.cleanup.entries.map(entry => <li key={entry.id}>
                <span><code>{entry.id}</code><b>{size(entry.bytes)}</b></span><code>SHA-256 {entry.sha256}</code>
              </li>)}</ul>
              <label><input type="checkbox" checked={backupApproved} onChange={event => setBackupApproved(event.target.checked)} />Remove these reviewed automatic backups.</label>
              <button disabled={!backupApproved || backupBusy} onClick={() => void backupAction(async projectId => {
                const result = await call<{ files: number; logicalBytes: number }>('cleanup_project_backups', { projectId, plan: backup.cleanup, confirmed: true });
                if (activeProject.current === projectId) setBackupMessage(`Removed ${result.files} old automatic backups (${size(result.logicalBytes)}).`);
              })}>Remove reviewed backups</button>
            </div>}
          </>}
          {backupMessage && <p role="status">{backupMessage}</p>}
          {backupError && <p className="gs-storage-error" role="alert">{backupError}</p>}
        </> : <p>Open a map or workspace to set its backup limit and view its storage usage.</p>}
      </section>
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
        <details className="gs-storage-limits">
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
