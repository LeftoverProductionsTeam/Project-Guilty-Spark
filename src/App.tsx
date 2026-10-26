import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpRight,
  BookOpen,
  GraduationCap,
  Compass,
  Heart,
  Box,
  ChevronRight,
  CircleHelp,
  FileCode2,
  FolderOpen,
  Globe2,
  Search,
  Hammer,
  Layers3,
  Flame,
  Home,
  Unplug,
  Server,
  LibraryBig,
  LoaderCircle,
  Plus,
  Palette,
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
  RuntimeId,
  Settings,
  Workspace,
} from './types';
import { browserBootstrap, call, native } from './api';
import { applyInterfacePreferences, readInterfacePreferences, saveInterfacePreferences } from './interfacePreferences';
import type { CueName, LocalCueReference } from './interfacePreferences';
import { UiCuePlayer } from './uiCuePlayer';
import { pinOwnedInterfaceBitmap, matchesOwnedInterfaceBitmap, decodeBoundedInterfaceBitmap } from './ownedInterfaceBitmap';
import type { OwnedBitmapPreview } from './ownedBitmapPreview';
import { historyReducer, initialHistory, thumbnail } from './editor';
import { firstVisitWorkspace, markFirstVisitSeen, WORKSPACE_TOOLTIPS } from './firstRun';
import { Empty, IconButton, Pill, Toast } from './components/ui';
import Library from './components/Library';
import CommunityMaps from './components/CommunityMaps';
import WorkspaceFinder from './components/WorkspaceFinder';
import WorkbenchGuide from './components/WorkbenchGuide';
import { WORKBENCH_GUIDES } from './workbenchGuide';
import type { WorkspaceFinderItem } from './workspaceFinder';
import Tags from './components/Tags';
import Build from './components/Build';
const World = lazy(() => import('./components/World'));
const Assets = lazy(() => import('./components/Workspaces').then((m) => ({ default: m.Assets })));
const Preferences = lazy(() => import('./components/Workspaces').then((m) => ({ default: m.Preferences })));
const Preservation = lazy(() => import('./components/Workspaces').then((m) => ({ default: m.Preservation })));
const Scenario = lazy(() => import('./components/Workspaces').then((m) => ({ default: m.Scenario })));
const Compare = lazy(() => import('./components/Compare'));
const Runtimes = lazy(() => import('./components/Runtimes'));
const LiveLab = lazy(() => import('./components/Runtimes').then((m) => ({ default: m.LiveLab })));
const QuickForge = lazy(() => import('./components/QuickForge'));
const Firefight = lazy(() => import('./components/Firefight'));
const InterfaceStudio = lazy(() => import('./components/InterfaceStudio'));
const CreatorStudio = lazy(() => import('./components/CreatorStudio'));
const Academy = lazy(() => import('./components/Academy'));
const GettingStarted = lazy(() => import('./components/GettingStarted'));
const CommunityThanks = lazy(() => import('./components/CommunityThanks'));
const nav = [
  { id: 'get-started', label: 'Start here', icon: Compass },
  { id: 'library', label: 'Map library', icon: LibraryBig },
  { id: 'map-finder', label: 'Community maps', icon: Globe2 },
  { id: 'quickforge', label: 'QuickForge', icon: Layers3 },
  { id: 'academy', label: 'Modding Academy', icon: GraduationCap },
  { id: 'community', label: 'Community Thanks', icon: Heart },
  { id: 'firefight', label: 'Firefight rules', icon: Flame },
  { id: 'world', label: 'World editor', icon: Box },
  { id: 'tags', label: 'Tag editor', icon: FileCode2 },
  { id: 'assets', label: 'Asset workshop', icon: Hammer },
  { id: 'scenario', label: 'AI & scenario', icon: Users },
  { id: 'build', label: 'Build & playtest', icon: ArrowUpRight },
  { id: 'compare', label: 'Compare variants', icon: ArrowLeftRight },
  { id: 'runtimes', label: 'Runtimes & friends', icon: Server },
  { id: 'live', label: 'Live Lab', icon: Unplug },
  { id: 'interface', label: 'Interface Studio', icon: Palette },
  { id: 'creator', label: 'Creator Studio', icon: BookOpen },
] as const;
const finderItems: readonly WorkspaceFinderItem[] = [
  ...nav.map(({id,label}) => ({id,label,help:WORKSPACE_TOOLTIPS[id] ?? '',keywords:`${WORKBENCH_GUIDES[id].can} ${WORKBENCH_GUIDES[id].cannot} ${WORKBENCH_GUIDES[id].tip}`})),
  {id:'preservation',label:'Preservation record',help:WORKSPACE_TOOLTIPS.preservation ?? '',keywords:WORKBENCH_GUIDES.preservation.tip},
  {id:'settings',label:'Settings & tools',help:WORKSPACE_TOOLTIPS.settings ?? '',keywords:WORKBENCH_GUIDES.settings.tip},
];
export default function App() {
  const [data, setData] = useState<Bootstrap>(browserBootstrap);
  const [ready, setReady] = useState(!native);
  const [history, dispatch] = useReducer(historyReducer, initialHistory);
  const [inspection, setInspection] = useState<OpenProject['inspection']>(null);
  const [meshes, setMeshes] = useState<Record<string, MeshData>>({});
  const [workspace, setWorkspace] = useState<Workspace>(firstVisitWorkspace);
  const [focusTagId, setFocusTagId] = useState<number | null>(null);
  const [interfacePreferences, setInterfacePreferences] = useState(readInterfacePreferences);
  const interfacePreferencesRef = useRef(interfacePreferences);
  interfacePreferencesRef.current = interfacePreferences;
  const audioPlayer = useRef<UiCuePlayer | null>(null);
  const playInterfaceCue = useCallback((cue: CueName) => {
    if (!audioPlayer.current) audioPlayer.current = new UiCuePlayer();
    void audioPlayer.current.play(cue, interfacePreferencesRef.current);
  }, []);
  useEffect(() => {
    saveInterfacePreferences(interfacePreferences);
    applyInterfacePreferences(interfacePreferences, document.documentElement);
  }, [interfacePreferences]);
  useEffect(() => () => { audioPlayer.current?.dispose(); audioPlayer.current = null; }, []);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: string } | null>(null);
  const [logs, setLogs] = useState<JobEvent[]>([]);
  const [activeJob, setActiveJob] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [createModal, setCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('Untitled workshop');
  const [dragging, setDragging] = useState(false);
  const [help, setHelp] = useState(false);
  const [showFinder, setShowFinder] = useState(false);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const buildRequest = useRef(0);
  const current = history.current;
  const [ownedHeaderArt,setOwnedHeaderArt] = useState<{url:string;tagId:number}|null>(null);
  const [ownedHeaderLoading,setOwnedHeaderLoading] = useState(false);
  const [ownedHeaderStatus,setOwnedHeaderStatus] = useState('No local Halo bitmap selected.');
  const bitmapPreference=interfacePreferences.bitmap;
  // The profile persists only a tag ID + project + SHA. The bitmap is decoded
  // from a local, exact-source preserved map after opening that project, then
  // held in a revocable, memory-only blob URL. No copied game image is saved.
  useEffect(() => {
    let disposed=false;
    let ownedUrl:string|null=null;
    setOwnedHeaderArt(null);
    setOwnedHeaderLoading(false);
    if(!bitmapPreference) {setOwnedHeaderStatus('No local Halo bitmap selected.');return;}
    if(!matchesOwnedInterfaceBitmap(bitmapPreference,current,inspection)) {
      setOwnedHeaderStatus('Open the exact Halo source map to restore this local artwork.');return;
    }
    if(!native){setOwnedHeaderStatus('Game-owned artwork requires the desktop app.');return;}
    const selected=bitmapPreference;
    setOwnedHeaderLoading(true);
    setOwnedHeaderStatus('Reading verified local bitmap…');
    void (async()=>{
      try {
        const response=await call<OwnedBitmapPreview>('preview_owned_cache_bitmap',{
          projectId:selected.projectId,bitmapTagId:selected.bitmapTagId,imageIndex:0,
        });
        if(disposed)return;
        const image=decodeBoundedInterfaceBitmap(response,selected,
          current?.source?.resourceSha256?.['bitmaps.map'] ?? null);
        const canvas=document.createElement('canvas');
        canvas.width=image.width;canvas.height=image.height;
        const ctx=canvas.getContext('2d');
        if(!ctx)throw new Error('Local WebView canvas is unavailable');
        ctx.putImageData(new ImageData(new Uint8ClampedArray(image.pixels),image.width,image.height),0,0);
        const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Could not encode local bitmap preview')),'image/png'));
        if(disposed)return;
        ownedUrl=URL.createObjectURL(blob);
        setOwnedHeaderArt({url:ownedUrl,tagId:selected.bitmapTagId});
        setOwnedHeaderStatus(`Verified local bitmap #${selected.bitmapTagId} · ${image.width} × ${image.height}. Header art is memory-only.`);
      } catch(error) {
        if(!disposed)setOwnedHeaderStatus(`Bitmap preview unavailable: ${String(error)}`);
      } finally{if(!disposed)setOwnedHeaderLoading(false);}
    })();
    return()=>{disposed=true;if(ownedUrl)URL.revokeObjectURL(ownedUrl);};
  },[bitmapPreference,current?.id,current?.source?.sha256,inspection?.sha256,
     current?.source?.resourceSha256?.['bitmaps.map']]);
  const historyRef = useRef(history);
  historyRef.current = history;
  const notice = useCallback((message: string, tone = 'info') => {
    setToast({ message, tone });
    if (tone === 'success') playInterfaceCue('confirm');
    else if (tone === 'error') playInterfaceCue('warning');
  }, [playInterfaceCue]);
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
        if (success && result !== null) notice(success, 'success');
        else if (typeof result === 'string') notice(result, 'info');
        await refresh();
      } catch (e) {
        notice(String(e), 'error');
      }
    },
    [notice, refresh],
  );
  const save = useCallback(
    (announce = false): Promise<void> => {
      const p = historyRef.current.current;
      if (!p) return Promise.resolve();
      const operation = saveQueue.current.then(async () => {
        try {
          await call('save_project', { project: p });
          if (historyRef.current.current === p) dispatch({ type: 'saved' });
          if (announce) notice('Project saved. Your original map is unchanged.', 'success');
          await refresh();
        } catch (e) {
          notice(String(e), 'error');
          throw e;
        }
      });
      saveQueue.current = operation.catch(() => {});
      return operation;
    },
    [notice, refresh],
  );
  useEffect(() => {
    if (!help && !createModal) return;
    const previous = document.activeElement;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
        ) ?? [],
      );
    const focus = focusable();
    if (!dialog?.contains(document.activeElement)) focus[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        setHelp(false);
        setCreateModal(false);
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const first = items[0],
        last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !dialog?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [help, createModal]);
  useEffect(() => {
    if (!native) return;
    const unlisten = getCurrentWindow().onCloseRequested(async (event) => {
      event.preventDefault();
      if (closingRef.current) return;
      closingRef.current = true;
      // Commit a focused numeric draft before collecting the final project snapshot.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      setClosing(true);
      try {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        await save();
        await call('close_application');
      } catch (error) {
        closingRef.current = false;
        setClosing(false);
        notice(
          `The project could not be saved before closing. The window remains open. ${String(error)}`,
          'error',
        );
      }
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [notice, save]);
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
        const request = ++buildRequest.current;
        if (p)
          void call<OpenProject>('open_project', { id: p.id })
            .then((open) => {
              if (request === buildRequest.current) dispatch({ type: 'builds', project: open.project });
            })
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
      if (closingRef.current) {
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape') {
        setCreateModal(false);
        setHelp(false);
        setShowFinder(false);
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'k') {
          e.preventDefault();
          // Avoid placing another dialog over modal confirmation or help.
          setShowFinder(open => !open && !createModal && !help);
          return;
        }
        if (e.key.toLowerCase() === 's') {
          e.preventDefault();
          void save(true).catch(() => {});
        }
        if (e.key.toLowerCase() === 'z') {
          if(e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable="true"]')) return;
          e.preventDefault();
          dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
        }
        if (e.key.toLowerCase() === 'y') {
          if(e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable="true"]')) return;
          e.preventDefault();
          dispatch({ type: 'redo' });
        }
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [save,help,createModal]);
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
        setWorkspace(imported[0].project.quickForge ? 'quickforge' : imported[0].inspection?.mesh.positions.length ? 'world' : 'tags');
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
  async function openProject(id: string, stayInWorkspace?: Workspace) {
    setFocusTagId(null);
    setBusy(true);
    try {
      if (historyRef.current.dirty) await save();
      const open = await call<OpenProject>('open_project', { id });
      await load(open);
      setWorkspace(stayInWorkspace ?? (open.project.quickForge ? 'quickforge' : 'world'));
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
  async function createQuickForge(title: string, template: string, target: RuntimeId) {
    setBusy(true);
    try {
      if (historyRef.current.dirty) await save();
      const open = await call<OpenProject>('create_quickforge_project', { title, template, target });
      await load(open); setWorkspace('quickforge'); await refresh();
    } finally { setBusy(false); }
  }
  async function buildQuickForge() {
    const project = historyRef.current.current;
    if (!project?.quickForge) return;
    await save();
    const jobId = await call<string>('quickforge_build', { projectId: project.id });
    setActiveJob(jobId);
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
    if (workspace === 'get-started') return <GettingStarted data={data} project={current} navigate={target => {markFirstVisitSeen();setWorkspace(target);}}/>;
    if (workspace === 'community') return <CommunityThanks/>;
    if (workspace === 'map-finder') return <CommunityMaps onImport={()=>void importFiles()} onLibrary={()=>setWorkspace('library')} busy={busy}/>;
    if (workspace === 'library')
      return (
        <Library
          data={data}
          onImport={() => void importFiles()}
          onNew={() => setCreateModal(true)}
          onNewMap={() => setWorkspace('quickforge')}
          onFindMaps={() => setWorkspace('map-finder')}
          onOpen={(e) => void openProject(e.id)}
          onInbox={() => void action(() => call('reveal_folder', { kind: 'inbox' }))}
          onInitializeInbox={() =>
            void action(async () => {
              setData(await call<Bootstrap>('initialize_mcc_inbox'));
            }, 'MCC Inbox initialized.')
          }
          busy={busy}
        />
      );
    if (workspace === 'interface') return <InterfaceStudio
      preferences={interfacePreferences} onChange={setInterfacePreferences} onPreview={playInterfaceCue}
      bitmapTags={matchesOwnedInterfaceBitmap(bitmapPreference,current,inspection) || (!bitmapPreference && !!current?.source && !!inspection && inspection.sha256.toLowerCase()===current.source.sha256.toLowerCase())
        ? (inspection?.tags.filter(tag=>tag.class==='bitm').map(tag=>({id:tag.id,path:tag.path})) ?? [])
        : (current?.source && inspection?.sha256.toLowerCase()===current.source.sha256.toLowerCase()
          ? (inspection?.tags.filter(tag=>tag.class==='bitm').map(tag=>({id:tag.id,path:tag.path})) ?? []) : [])}
      bitmapStatus={ownedHeaderStatus} bitmapLoading={ownedHeaderLoading} bitmapActive={!!ownedHeaderArt}
      onChooseBitmap={(id)=>{try{
        if(!current || !inspection)throw new Error('Import/open a preserved Halo map before choosing an interface bitmap');
        const pinned=pinOwnedInterfaceBitmap(current,inspection,id);
        setInterfacePreferences(previous=>({...previous,bitmap:pinned}));
      }catch(error){notice(String(error),'error');}}}
      onClearBitmap={()=>setInterfacePreferences(previous=>({...previous,bitmap:null}))}
      canBrowseSounds={!!inspection?.tags.some((tag) => tag.class === 'snd!')}
      onOpenTags={() => {
        setFocusTagId(inspection?.tags.find((tag) => tag.class === 'snd!')?.id ?? null);
        setWorkspace('tags');
      }} />;
    if (workspace === 'settings')
      return (
        <Preferences
          data={data}
          onApply={applySettings}
          onAction={action}
          onRuntimes={() => setWorkspace('runtimes')}
        />
      );
    if (workspace === 'quickforge') return <QuickForge key={current?.id ?? 'new'} project={current} data={data} edit={edit} onCreate={createQuickForge} onSave={() => save()} onBuild={buildQuickForge} onRuntimes={() => setWorkspace('runtimes')} onSettings={() => setWorkspace('settings')} notify={notice} logs={logs} activeJob={activeJob} epoch={epoch} dirty={history.dirty} />;
    if (workspace === 'compare')
      return (
        <Compare entries={data.entries} currentId={current?.id} dirty={history.dirty} onSave={() => save()} />
      );
    if (workspace === 'runtimes')
      return <Runtimes project={current} dirty={history.dirty} onSave={() => save()} settings={data.settings} onSettings={() => setWorkspace('settings')} onOpenWorkspace={setWorkspace} />;
    if (workspace === 'academy') return <Academy project={current} inspection={inspection} settings={data.settings} navigate={setWorkspace} />;
    if (workspace === 'live') return <LiveLab onBuild={() => setWorkspace('build')} onQuickForge={() => setWorkspace('quickforge')} />;
    if (!current) return commonEmpty;
    switch (workspace) {
      case 'firefight': return <Firefight key={current.id} project={current} entries={data.entries} edit={edit} />;
      case 'creator': return <CreatorStudio project={current} inspection={inspection} edit={edit} notify={notice} onOpenRuntimes={() => setWorkspace('runtimes')} />;
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
              onOpenTag={(tagId) => { setFocusTagId(tagId); setWorkspace('tags'); }}
            />
          </Suspense>
        );
      case 'tags':
        return (
          <Tags key={current.id} project={current} inspection={inspection} entries={data.entries}
            onSelectMap={(id) => { void openProject(id, 'tags'); }} edit={edit} notify={notice}
            focusTagId={focusTagId}
            onAssignSound={(cue: CueName, ref: LocalCueReference) => {
              setInterfacePreferences((previous) => ({ ...previous, cues: { ...previous.cues, [cue]: ref } }));
              notice(`Assigned ${cue} sound locally. Enable UI audio in Interface Studio to hear it.`, 'success');
            }} />
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
        return current.quickForge ? <QuickForge key={current.id} project={current} data={data} edit={edit} onCreate={createQuickForge} onSave={() => save()} onBuild={buildQuickForge} onRuntimes={() => setWorkspace('runtimes')} onSettings={() => setWorkspace('settings')} notify={notice} logs={logs} activeJob={activeJob} epoch={epoch} dirty={history.dirty} /> : current.source ? (
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
            onResources={() =>
              void action(async () => {
                const projectId = current.id;
                await save();
                const open = await call<OpenProject | null>('choose_project_resources', { projectId });
                if (open && historyRef.current.current?.id === projectId) await load(open);
                return open;
              }, 'Source resource directory updated and source inspection refreshed.')
            }
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
    <>
      <div className="application" inert={closing || undefined}>
        <header className="app-header" style={ownedHeaderArt && matchesOwnedInterfaceBitmap(bitmapPreference,current,inspection)
          ? { backgroundImage: `linear-gradient(90deg,rgba(7,17,26,.96) 0%,rgba(9,24,35,.9) 44%,rgba(8,22,33,.58) 100%),url("${ownedHeaderArt.url}")`,backgroundSize:'cover',backgroundPosition:'center' }
          : undefined}>
          <button className="brand" onClick={() => setWorkspace('library')} aria-label="Guilty Spark home">
            <img src="/spark.svg" alt="" />
            <div>
              <strong>GUILTY SPARK</strong>
              <span>HALO MODERN EVOLVED</span>
            </div>
            <Pill>0.3.1 · C32</Pill>
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
              {data.installation.mccPath ? 'MCC found' : native ? 'Runtime not found' : 'Browser preview'}
            </Pill>
            <button className="gs-header-find" title="Search all Spark tools and workspaces (Ctrl+K)" onClick={()=>{setHelp(false);setCreateModal(false);setShowFinder(true);}}><Search size={15}/>Find tools <kbd>Ctrl K</kbd></button>
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
                title={WORKSPACE_TOOLTIPS[id]}
                aria-label={label}
                aria-description={WORKSPACE_TOOLTIPS[id]}
                onClick={() => {markFirstVisitSeen(); setWorkspace(id); playInterfaceCue('select'); }}
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
              <span>Settings &amp; tools</span>
            </button>
            <div className="local-only">
              <ShieldCheck size={13} />
              Local. Source-safe. Yours.
            </div>
          </div>
        </aside>
        <main className={`main-content workspace-${workspace}`}>
          {current && !['library','settings','community','get-started'].includes(workspace) && (
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
          {ready && <WorkbenchGuide key={workspace} workspace={workspace}
            evidence={{ desktop:native, project:!!current, source:!!current?.source,
              inspectedSource:!!current?.source && !!inspection && inspection.sha256.toLowerCase()===current.source.sha256.toLowerCase(),
              forge:!!current?.quickForge,
              toolFolder:!!data.settings.hekDirectory || !!data.settings.invaderDirectory,
              unsaved:history.dirty, runningJob:!!activeJob }}
            onNavigate={target=>{markFirstVisitSeen();setWorkspace(target);playInterfaceCue('select');}} />}
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
                  ? 'Unsaved project changes'
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
            <p>Drop Halo .map files, ZIP archives or .gsproject descriptors to import.</p>
          </div>
        )}
        {showFinder && !help && !createModal && <WorkspaceFinder items={finderItems} onNavigate={target=>{markFirstVisitSeen();setWorkspace(target);}} onClose={()=>setShowFinder(false)}/>}
        {createModal && (
          <div className="modal-backdrop">
            <form
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="new-workspace-title"
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
              <h2 id="new-workspace-title">Make room for an idea.</h2>
              <p>
                A persistent scene for your own geometry. Halo maps can be imported as separate source
                projects.
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
            <div className="modal help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title">
              <button className="modal-close" onClick={() => setHelp(false)} aria-label="Close help">
                <X size={18} />
              </button>
              <div className="eyebrow">QUICK REFERENCE</div>
              <h2 id="help-title">A familiar spark of possibility.</h2>
              <p>
                Import your own Halo map, inspect its tags and placements, then configure Invader in Settings
                to build an MCC cache. Excession metadata is required before packaging.
              </p>
              <div className="shortcut-list">
                {[
                  ['Find tools, BSP help or community maps', 'Ctrl + K'],
                  ['Context-aware field guide', 'Why / what next at top of workspace'],
                  ['Dismiss help tooltip', 'Esc while focused'],
                  ['Save project', 'Ctrl + S'],
                  ['Undo / redo', 'Ctrl + Z / Ctrl + Shift + Z'],
                  ['Move / rotate / scale', 'W / E / R'],
                  ['Fly camera', 'Hold RMB + WASD; R/F up/down'],
                  ['Grid / mesh snap', 'G / M'],
                  ['Clear selection', 'Esc'],
                ].map(([label, key]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <kbd>{key}</kbd>
                  </div>
                ))}
              </div>
              <p className="subtle">
                QuickForge refreshes editable source meshes and simulated collision. Compiled Halo collision, portals, AI synchronization and live engine editing remain separate and require real runtime testing.
              </p>
              <button className="primary full" onClick={() => setHelp(false)}>
                Back to the workbench
                <ArrowLeft size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
      {closing && (
        <div className="modal-backdrop">
          <div className="modal" role="status">
            <LoaderCircle className="spin" size={24} />
            <h2>Saving before closing…</h2>
            <p>Your project will finish saving before the window closes.</p>
          </div>
        </div>
      )}
    </>
  );
}
function UploadGlyph() {
  return (
    <div className="empty-icon">
      <FolderOpen size={36} />
    </div>
  );
}
