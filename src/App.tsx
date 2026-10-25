import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Box,
  ChevronRight,
  CircleHelp,
  FileCode2,
  FolderOpen,
  Hammer,
  Home,
  LibraryBig,
  LoaderCircle,
  Plus,
  Redo2,
  Save,
  Settings2,
  ShieldCheck,
  Undo2,
  Users,
  X,
} from 'lucide-react';
import type {
  AssetResult,
  Bootstrap,
  JobEvent,
  MeshData,
  OpenProject,
  Project,
  Settings,
  Workspace,
} from './types';
import { browserBootstrap, call, native } from './api';
import { historyReducer, initialHistory, thumbnail } from './editor';
import { Empty, IconButton, Pill, Toast } from './components/ui';
import Library from './components/Library';
import Tags from './components/Tags';
import Build from './components/Build';
const World = lazy(() => import('./components/World'));
const Assets = lazy(() => import('./components/Workspaces').then((m) => ({ default: m.Assets })));
const Preferences = lazy(() => import('./components/Workspaces').then((m) => ({ default: m.Preferences })));
const Preservation = lazy(() => import('./components/Workspaces').then((m) => ({ default: m.Preservation })));
const Scenario = lazy(() => import('./components/Workspaces').then((m) => ({ default: m.Scenario })));
const nav = [
  { id: 'library', label: 'Map library', icon: LibraryBig },
  { id: 'world', label: 'World editor', icon: Box },
  { id: 'tags', label: 'Tag editor', icon: FileCode2 },
  { id: 'assets', label: 'Asset workshop', icon: Hammer },
  { id: 'scenario', label: 'AI & scenario', icon: Users },
  { id: 'build', label: 'Build & playtest', icon: ArrowUpRight },
] as const;
export default function App() {
  const [data, setData] = useState<Bootstrap>(browserBootstrap);
  const [ready, setReady] = useState(!native);
  const [history, dispatch] = useReducer(historyReducer, initialHistory);
  const [inspection, setInspection] = useState<OpenProject['inspection']>(null);
  const [meshes, setMeshes] = useState<Record<string, MeshData>>({});
  const [workspace, setWorkspace] = useState<Workspace>('library');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: string } | null>(null);
  const [logs, setLogs] = useState<JobEvent[]>([]);
  const [activeJob, setActiveJob] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [createModal, setCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('Untitled workshop');
  const [dragging, setDragging] = useState(false);
  const [help, setHelp] = useState(false);
  const current = history.current;
  const historyRef = useRef(history);
  historyRef.current = history;
  const notice = useCallback((message: string, tone = 'info') => setToast({ message, tone }), []);
  const refresh = useCallback(async () => {
    if (!native) return;
    const next = await call<Bootstrap>('bootstrap');
    setData(next);
    setEpoch((v) => v + 1);
  }, []);
  const action = useCallback(
    async (f: () => Promise<unknown>, success?: string) => {
      try {
        const result = await f();
        if (success) notice(success, 'success');
        else if (typeof result === 'string') notice(result, 'info');
        await refresh();
      } catch (e) {
        notice(String(e), 'error');
      }
    },
    [notice, refresh],
  );
  const save = useCallback(
    async (announce = false) => {
      const p = historyRef.current.current;
      if (!p) return;
      try {
        await call('save_project', { project: p });
        if (historyRef.current.current === p) dispatch({ type: 'saved' });
        if (announce) notice('Project saved. Your original map is unchanged.', 'success');
        await refresh();
      } catch (e) {
        notice(String(e), 'error');
        throw e;
      }
    },
    [notice, refresh],
  );
  const load = useCallback(
    async (open: OpenProject) => {
      dispatch({ type: 'load', project: open.project });
      setInspection(open.inspection);
      setMeshes({});
      if (open.inspection) {
        try {
          const preview = thumbnail(open.inspection.mesh);
          if (preview) localStorage.setItem(`spark:thumbnail:${open.inspection.sha256}`, preview);
        } catch {
          /* Geometry preview caching must not block imports. */
        }
      }
      for (const asset of open.project.assets) {
        try {
          const mesh = await call<MeshData>('asset_mesh', { id: open.project.id, assetId: asset.id });
          setMeshes((m) => ({ ...m, [asset.id]: mesh }));
        } catch (e) {
          notice(`Asset ${asset.name}: ${String(e)}`, 'error');
        }
      }
    },
    [notice],
  );
  useEffect(() => {
    if (!native) return;
    let alive = true;
    call<Bootstrap>('bootstrap')
      .then((d) => {
        if (alive) {
          setData(d);
          setLogs(d.logs);
          setReady(true);
        }
      })
      .catch((e) => {
        notice(String(e), 'error');
        setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [notice]);
  useEffect(() => {
    if (!native) return;
    const unsubs: Promise<() => void>[] = [];
    unsubs.push(
      listen<JobEvent>('spark:job', ({ payload }) => {
        setLogs((v) => [...v, payload].slice(-2000));
        if (payload.progress > 0 && payload.progress < 100) setActiveJob(payload.jobId);
        if (payload.progress === 100) {
          setActiveJob(null);
        }
        if (payload.severity === 'error' || payload.phase === 'blocked')
          notice(payload.message, payload.severity === 'error' ? 'error' : 'info');
      }),
    );
    unsubs.push(
      listen('spark:library-changed', () => {
        void refresh();
        const p = historyRef.current.current;
        if (p)
          void call<OpenProject>('open_project', { id: p.id })
            .then((open) => dispatch({ type: 'builds', project: open.project }))
            .catch((e) => notice(String(e), 'error'));
      }),
    );
    unsubs.push(
      listen<string>('spark:imported', ({ payload }) => {
        notice(
          'Inbox map imported. Open it from your library to inspect the compatibility report.',
          'success',
        );
        void refresh();
      }),
    );
    unsubs.push(
      getCurrentWindow().onDragDropEvent(({ payload }) => {
        if (payload.type === 'enter' || payload.type === 'over') setDragging(true);
        else if (payload.type === 'leave') setDragging(false);
        else if (payload.type === 'drop') {
          setDragging(false);
          void importFiles(payload.paths);
        }
      }),
    );
    return () => {
      for (const p of unsubs) void p.then((fn) => fn());
    };
  }, [notice, refresh]);
  useEffect(() => {
    if (!native || !history.dirty || !current) return;
    const timer = setTimeout(() => {
      void save().catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
  }, [current, history.dirty, save]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 's') {
          e.preventDefault();
          void save(true).catch(() => {});
        }
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
        }
        if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          dispatch({ type: 'redo' });
        }
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [save]);
  function edit(project: Project, description: string) {
    dispatch({ type: 'edit', project, description });
  }
  async function importFiles(paths?: string[]) {
    setBusy(true);
    try {
      if (historyRef.current.dirty) await save();
      const imported = await call<OpenProject[]>(
        paths ? 'import_paths' : 'import_dialog',
        paths ? { paths } : undefined,
      );
      if (imported.length) {
        await load(imported[0]);
        setWorkspace(imported[0].inspection?.mesh.positions.length ? 'world' : 'tags');
        notice(
          `${imported.length} project${imported.length === 1 ? '' : 's'} imported. Source data preserved.`,
          'success',
        );
        await refresh();
      }
    } catch (e) {
      notice(String(e), 'error');
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function openProject(id: string) {
    setBusy(true);
    try {
      if (historyRef.current.dirty) await save();
      await load(await call<OpenProject>('open_project', { id }));
      setWorkspace('world');
    } catch (e) {
      notice(String(e), 'error');
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    if (!newTitle.trim()) return;
    setBusy(true);
    try {
      if (historyRef.current.dirty) await save();
      await load(await call<OpenProject>('create_project', { title: newTitle.trim() }));
      setCreateModal(false);
      setWorkspace('assets');
      await refresh();
    } catch (e) {
      notice(String(e), 'error');
    } finally {
      setBusy(false);
    }
  }
  async function importAsset() {
    if (!current) return;
    setBusy(true);
    try {
      if (historyRef.current.dirty) await save();
      const result = await call<AssetResult | null>('import_asset', { id: current.id });
      if (result) {
        dispatch({ type: 'load', project: result.project });
        setMeshes((v) => ({ ...v, [result.asset.id]: result.mesh }));
        notice(result.warnings.join(' '), 'info');
        await refresh();
      }
    } catch (e) {
      notice(String(e), 'error');
    } finally {
      setBusy(false);
    }
  }
  async function startBuild() {
    if (!current) return;
    try {
      if (historyRef.current.dirty) await save();
      const job = await call<string>('start_build', { id: current.id });
      setActiveJob(job);
      notice('Conversion started. The build log records tool output and validation results.', 'success');
    } catch (e) {
      notice(String(e), 'error');
    }
  }
  async function applySettings(settings: Settings) {
    await action(async () => {
      const d = await call<Bootstrap>('save_settings', { settings });
      setData(d);
    }, 'Preferences saved. Runtime detection and Inbox watching refreshed.');
  }
  const commonEmpty = (
    <Empty icon={<FolderOpen size={30} />} title="Choose a world to work on">
      Open a project from your library, import a Halo map, or create an asset workspace.
      <div className="empty-actions">
        <button onClick={() => setWorkspace('library')}>
          <LibraryBig size={15} />
          Map library
        </button>
        <button className="primary" onClick={() => void importFiles()}>
          Import map
        </button>
      </div>
    </Empty>
  );
  function content() {
    if (workspace === 'library')
      return (
        <Library
          data={data}
          onImport={() => void importFiles()}
          onNew={() => setCreateModal(true)}
          onOpen={(e) => void openProject(e.id)}
          onInbox={() => void action(() => call('reveal_folder', { kind: 'inbox' }))}
          busy={busy}
        />
      );
    if (workspace === 'settings')
      return <Preferences data={data} onApply={applySettings} onAction={action} />;
    if (!current) return commonEmpty;
    switch (workspace) {
      case 'world':
        return (
          <Suspense fallback={<div className="loading">Loading world editor…</div>}>
            <World
              key={current.id}
              project={current}
              inspection={inspection}
              assetMeshes={meshes}
              edit={edit}
              notify={notice}
            />
          </Suspense>
        );
      case 'tags':
        return (
          <Tags key={current.id} project={current} inspection={inspection} edit={edit} notify={notice} />
        );
      case 'assets':
        return (
          <Assets
            key={current.id}
            project={current}
            meshes={meshes}
            onImport={() => void importAsset()}
            onWorld={() => setWorkspace('world')}
          />
        );
      case 'scenario':
        return <Scenario inspection={inspection} onWorld={() => setWorkspace('world')} />;
      case 'preservation':
        return <Preservation project={current} edit={edit} />;
      case 'build':
        return current.source ? (
          <Build
            project={current}
            data={data}
            logs={logs}
            activeJob={activeJob}
            dirty={history.dirty}
            epoch={epoch}
            onStart={() => void startBuild()}
            onAction={action}
            onSettings={() => setWorkspace('settings')}
            onRefresh={() =>
              void action(async () => {
                await call('refresh_installation');
                await refresh();
              })
            }
          />
        ) : (
          <Empty icon={<Hammer size={30} />} title="A source map is required for a Halo build">
            Asset workspaces can be saved and edited. Converting workshop geometry into Halo tags is not
            implemented.
          </Empty>
        );
    }
  }
  return (
    <div className="application">
      <header className="app-header">
        <button className="brand" onClick={() => setWorkspace('library')} aria-label="Guilty Spark home">
          <img src="/spark.svg" alt="" />
          <div>
            <strong>GUILTY SPARK</strong>
            <span>HALO MODERN EVOLVED</span>
          </div>
          <Pill>0.1</Pill>
        </button>
        <div className="header-context">
          <span>LOCAL WORKBENCH</span>
          <ChevronRight size={12} />
          <strong>{current?.title ?? 'Map library'}</strong>
          {current && (
            <span
              className={history.dirty ? 'unsaved-dot' : 'saved-dot'}
              title={history.dirty ? 'Unsaved changes' : 'Saved'}
            />
          )}
        </div>
        <div className="header-actions">
          <Pill tone={data.installation.mccPath ? 'green' : 'muted'}>
            <span className="live-dot" />
            {data.installation.mccPath ? 'MCC connected' : native ? 'Runtime not found' : 'Browser preview'}
          </Pill>
          <IconButton label="Help & shortcuts" onClick={() => setHelp(true)}>
            <CircleHelp size={18} />
          </IconButton>
        </div>
      </header>
      <aside className="sidebar">
        <div className="sidebar-label">WORKSPACES</div>
        <nav>
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              className={workspace === id ? 'nav-item selected' : 'nav-item'}
              key={id}
              onClick={() => setWorkspace(id)}
            >
              <Icon size={17} />
              <span>{label}</span>
              {id === 'library' && <small>{data.entries.length}</small>}
              {id === 'build' && activeJob && <span className="live-dot pulse" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-project">
          <div className="sidebar-label">CURRENT PROJECT</div>
          {current ? (
            <>
              <div className="current-project-name">
                <span className="project-glyph">
                  <Box size={17} />
                </span>
                <span>
                  <strong>{current.title}</strong>
                  <small>
                    {current.source
                      ? `Cache ${current.source.cacheVersion} · source preserved`
                      : 'Asset workspace'}
                  </small>
                </span>
              </div>
              <button
                className="small-button full"
                onClick={() =>
                  void action(async () => {
                    await save();
                    return call('export_project', { id: current.id });
                  }, 'Project descriptor exported. Referenced source and asset files must remain available.')
                }
              >
                <Save size={13} />
                Export .gsproject
              </button>
            </>
          ) : (
            <p>
              No project open.
              <br />
              Your next idea starts here.
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="restoration-card">
            <div>
              <span className="pending-dot" />
              PRESERVATION TARGET
            </div>
            <strong>Zombie Apocalypse</strong>
            <span>Historical restoration · pending</span>
            <small>Fonzie / Fonzeh · MacGamingMods</small>
          </div>
          <button
            className={workspace === 'preservation' ? 'nav-item selected' : 'nav-item'}
            onClick={() => setWorkspace('preservation')}
          >
            <BookOpen size={17} />
            <span>Preservation record</span>
          </button>
          <button
            className={workspace === 'settings' ? 'nav-item selected' : 'nav-item'}
            onClick={() => setWorkspace('settings')}
          >
            <Settings2 size={17} />
            <span>Settings &amp; runtimes</span>
          </button>
          <div className="local-only">
            <ShieldCheck size={13} />
            Local. Source-safe. Yours.
          </div>
        </div>
      </aside>
      <main className={`main-content workspace-${workspace}`}>
        {current && workspace !== 'library' && workspace !== 'settings' && (
          <div className="editor-bar">
            <div className="breadcrumb">
              <button onClick={() => setWorkspace('library')}>Library</button>
              <ChevronRight size={12} />
              <span>{current.title}</span>
              <Pill>{current.source?.engine ?? 'Asset workspace'}</Pill>
            </div>
            <div>
              <IconButton
                label="Undo (Ctrl+Z)"
                onClick={() => dispatch({ type: 'undo' })}
                disabled={!history.past.length}
              >
                <Undo2 size={16} />
              </IconButton>
              <IconButton
                label="Redo (Ctrl+Shift+Z)"
                onClick={() => dispatch({ type: 'redo' })}
                disabled={!history.future.length}
              >
                <Redo2 size={16} />
              </IconButton>
              <span className="toolbar-divider" />
              <button className="small-button" onClick={() => void save(true).catch(() => {})}>
                <Save size={14} />
                {history.dirty ? 'Save changes' : 'Saved'}
              </button>
            </div>
          </div>
        )}
        {!ready ? (
          <div className="loading">
            <LoaderCircle className="spin" size={22} />
            Connecting to the local workbench…
          </div>
        ) : (
          <Suspense fallback={<div className="loading">Loading workspace…</div>}>{content()}</Suspense>
        )}
      </main>
      <footer className="statusbar">
        <div>
          <span className="live-dot" />
          {busy
            ? 'Working…'
            : activeJob
              ? 'Conversion job running'
              : history.dirty
                ? 'Saving project…'
                : 'Workbench ready'}
          {!native && <span>· Native services unavailable in browser</span>}
        </div>
        <div>
          {current && (
            <span>
              {current.tagEdits.length} tag edits · {current.scene.length} objects
            </span>
          )}
          <span>API v1</span>
          <span>NO TELEMETRY</span>
        </div>
      </footer>
      {busy && (
        <div className="busy-indicator">
          <LoaderCircle className="spin" size={17} />
          Processing source data…
        </div>
      )}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      {dragging && (
        <div className="drag-overlay">
          <UploadGlyph />
          <h2>Bring a world into your workbench.</h2>
          <p>Drop Halo .map files or .gsproject descriptors to import.</p>
        </div>
      )}
      {createModal && (
        <div className="modal-backdrop">
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <button
              className="modal-close"
              type="button"
              onClick={() => setCreateModal(false)}
              aria-label="Close new workspace"
            >
              <X size={18} />
            </button>
            <div className="empty-icon">
              <Plus size={24} />
            </div>
            <div className="eyebrow">NEW ASSET WORKSPACE</div>
            <h2>Make room for an idea.</h2>
            <p>
              A persistent scene for your own geometry. Halo maps can be imported as separate source projects.
            </p>
            <label>
              Workspace name
              <input
                autoFocus
                value={newTitle}
                maxLength={200}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </label>
            <button className="primary full" disabled={busy || !newTitle.trim()}>
              Create workspace
              <ArrowUpRight size={15} />
            </button>
          </form>
        </div>
      )}
      {help && (
        <div className="modal-backdrop">
          <div className="modal help-modal">
            <button className="modal-close" onClick={() => setHelp(false)} aria-label="Close help">
              <X size={18} />
            </button>
            <div className="eyebrow">QUICK REFERENCE</div>
            <h2>A familiar spark of possibility.</h2>
            <p>
              Import your own Halo map, inspect its tags and placements, then configure Invader in Settings to
              build an MCC cache. Excession metadata is required before packaging.
            </p>
            <div className="shortcut-list">
              {[
                ['Save project', 'Ctrl + S'],
                ['Undo / redo', 'Ctrl + Z / Ctrl + Shift + Z'],
                ['Translate / rotate / scale', 'W / E / R'],
                ['Frame the scene', 'F'],
                ['Clear selection', 'Esc'],
              ].map(([label, key]) => (
                <div key={label}>
                  <span>{label}</span>
                  <kbd>{key}</kbd>
                </div>
              ))}
            </div>
            <p className="subtle">
              World markers show actual placements; BSP previews show collision geometry. Live editing, AI
              synchronization, VR, and asset-to-Halo compilation are not connected.
            </p>
            <button className="primary full" onClick={() => setHelp(false)}>
              Back to the workbench
              <ArrowLeft size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
function UploadGlyph() {
  return (
    <div className="empty-icon">
      <FolderOpen size={36} />
    </div>
  );
}
