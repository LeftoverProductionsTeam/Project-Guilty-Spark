import {useWorkflowHistory} from './useWorkflowHistory';
import type {WorkflowRoute} from './workflowHistory';
import {librarySoundEmitters} from './viewportAssets';
import {projectMutationPending} from './projectMutation';
import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import LiveStudioIndicator from './components/LiveStudioIndicator';
import ForgeCollaboration from './components/ForgeCollaboration';
import {
  ArrowLeft,
  ArrowRight,
  ArrowLeftRight,
  ArrowUpRight,
  BookOpen,
  GraduationCap,
  Compass,
  Clapperboard,
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
  MapInspection,
  MeshData,
  OpenProject,
  Project,
  RuntimeId,
  Settings,
  Workspace,
  Vec3,
} from './types';
import type {ViewportAsset} from './viewportAssets';
import {createEmitter,emptySoundScene} from './spatialAudio';
import { browserBootstrap, call, native } from './api';
import { applyInterfacePreferences, readInterfacePreferences, saveInterfacePreferences } from './interfacePreferences';
import type { CueName, LocalCueReference } from './interfacePreferences';
import { UiCuePlayer } from './uiCuePlayer';
import { pinOwnedInterfaceBitmap, matchesOwnedInterfaceBitmap, decodeBoundedInterfaceBitmap } from './ownedInterfaceBitmap';
import type { OwnedBitmapPreview } from './ownedBitmapPreview';
import { initialHistory, thumbnail } from './editor';
import type {HistoryAction} from './editor';
import {activeDocument,documentReducer,emptyMapDocuments} from './mapDocuments';
import MapTabs from './components/MapTabs';
import RuntimeDock from './components/RuntimeDock';
import {EditorAudioProvider,EditorSoundControls} from './components/EditorAudio';
import ExternalMapSync from './components/ExternalMapSync';
import {hasSourceBoundEdits} from './externalMapSync';
import SettingsPanel from './components/SettingsPanel';
import MapTools from './components/MapTools';
import WorkspaceSession from './components/WorkspaceSession';
import WorkspacePanels,{WorkspacePanel}from'./components/WorkspacePanels';
import NavigationSettings from'./components/NavigationSettings';
import {readMapSession,writeMapSession,useMapState,copyMapViewSession} from './mapSession';
import AssetTransfer,{transferTag} from './components/AssetTransfer';
import type {TransferSelection} from './components/AssetTransfer';
import {readHistoryLimit,saveHistoryLimit} from './historyPreferences';
import { firstVisitWorkspace, markFirstVisitSeen, WORKSPACE_TOOLTIPS } from './firstRun';
import {ResizeEdges,dragWindow,maximizeWindow} from './components/WindowFrame';
import { Empty, IconButton, Pill, Toast } from './components/ui';
import Library from './components/Library';
import CommunityMaps from './components/CommunityMaps';
import type {MapDownloadAction} from './components/MapDownload';
import DependencyPanel from './components/DependencyPanel';
import WorkspaceFinder from './components/WorkspaceFinder';
import WorkbenchGuide from './components/WorkbenchGuide';
import LevelEditorWorkspace from './components/LevelEditorWorkspace';
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
const QuickForge = lazy(() => import('./components/QuickForge'));
const Firefight = lazy(() => import('./components/Firefight'));
const InterfaceStudio = lazy(() => import('./components/InterfaceStudio'));
const CreatorStudio = lazy(() => import('./components/CreatorStudio'));
const MachinimaWorkspace = lazy(() => import('./components/MachinimaWorkspace'));
const DockedDirector = lazy(() => import('./components/DirectorWindow'));
const Academy = lazy(() => import('./components/Academy'));
const GettingStarted = lazy(() => import('./components/GettingStarted'));
const HowTo = lazy(() => import('./components/HowTo'));
const Features = lazy(() => import('./components/Features'));
const CommunityThanks = lazy(() => import('./components/CommunityThanks'));
const nav = [
  { id: 'get-started', label: 'Start here', icon: Compass },
  { id: 'features', label: 'Features & workflows', icon: BookOpen },
  { id: 'how-to', label: 'How-to & Glossary', icon: BookOpen },
  { id: 'library', label: 'Map library', icon: LibraryBig },
  { id: 'map-finder', label: 'Community maps', icon: Globe2 },
  { id: 'quickforge', label: 'Level editor', icon: Layers3 },
  { id: 'academy', label: 'Modding Academy', icon: GraduationCap },
  { id: 'community', label: 'Community Thanks', icon: Heart },
  { id: 'firefight', label: 'Firefight rules', icon: Flame },
  { id: 'world', label: 'World editor', icon: Box },
  { id: 'tags', label: 'Tag editor', icon: FileCode2 },
  { id: 'assets', label: 'Asset workshop', icon: Hammer },
  { id: 'scenario', label: 'AI & scenario', icon: Users },
  { id: 'build', label: 'Build & playtest', icon: ArrowUpRight },
  { id: 'compare', label: 'Compare variants', icon: ArrowLeftRight },
  { id: 'runtimes', label: 'Online', icon: Server },
  { id: 'live', label: 'Live Lab', icon: Unplug },
  { id: 'interface', label: 'Interface Studio', icon: Palette },
  { id: 'creator', label: 'Creator Studio', icon: BookOpen },
  { id: 'machinima', label: 'Machinima', icon: Clapperboard },
] as const;
const mapWorkspaces:Workspace[]=['world','quickforge','live','tags','assets','scenario','build','firefight','creator','machinima','preservation'];
function requestedWorkspace():Workspace|null{const value=new URLSearchParams(location.search).get('workspace');return nav.some(item=>item.id===value)||value==='settings'||value==='preservation'?value as Workspace:null;}
function rememberedWorkspace(project:Project,inspection?:MapInspection|null):Workspace{const fallback:Workspace=project.quickForge?'quickforge':inspection?.header.scenarioType===2?'tags':'world';const stored=readMapSession<Workspace>(project.id,'workspace',fallback);return mapWorkspaces.includes(stored)?stored:fallback;}
const navGroups = [["Level Editor",["quickforge"]],["Tags & Assets",["tags","assets","compare"]],["Gameplay Creator",["machinima","scenario","firefight","creator"]],["Projects & Testing",["library","build","runtimes"]],["Learn & Community",["get-started","features","how-to","academy","map-finder","community"]]] as const;
const finderItems: readonly WorkspaceFinderItem[] = [
  {id:'quickforge',label:'QuickForge',help:'Open the map viewer. QuickForge tools follow the open document.',keywords:'level editor geometry brushes tunnels forge'},
  ...nav.map(({id,label}) => ({id,label,help:WORKSPACE_TOOLTIPS[id] ?? '',keywords:`${WORKBENCH_GUIDES[id].can} ${WORKBENCH_GUIDES[id].cannot} ${WORKBENCH_GUIDES[id].tip}`})),
  {id:'preservation',label:'Preservation record',help:WORKSPACE_TOOLTIPS.preservation ?? '',keywords:WORKBENCH_GUIDES.preservation.tip},
  {id:'settings',label:'Settings & tools',help:WORKSPACE_TOOLTIPS.settings ?? '',keywords:WORKBENCH_GUIDES.settings.tip},
];
export default function App() {
  const [data, setData] = useState<Bootstrap>(browserBootstrap);
  const [ready, setReady] = useState(!native);
  const [documents,dispatchDocument]=useReducer(documentReducer,readHistoryLimit(),emptyMapDocuments);
  const activeMap=activeDocument(documents),history=activeMap?.history??{...initialHistory,limit:documents.limit};
  const dispatch=useCallback((action:HistoryAction)=>dispatchDocument({type:'history',action}),[]);
  useEffect(()=>saveHistoryLimit(history.limit),[history.limit]);
  const inspection=activeMap?.inspection??null,meshes=activeMap?.meshes??{};
  const [workspace, setWorkspaceState] = useState<Workspace>(()=>requestedWorkspace()??firstVisitWorkspace());
  const [sharedHistory,setSharedHistory]=useState<Record<string,{undo:boolean;redo:boolean}>>({});
  useEffect(()=>{const update=(event:Event)=>{const {projectId,view,paused}=(event as CustomEvent).detail??{};if(typeof projectId!=='string')return;setSharedHistory(old=>({...old,[projectId]:{undo:!paused&&!!view?.canUndo,redo:!paused&&!!view?.canRedo}}));};window.addEventListener('guilty-spark-studio-status',update);return()=>window.removeEventListener('guilty-spark-studio-status',update);},[]);
  const[sidebarOpen,setSidebarOpen]=useMapState('global','chrome.sidebar',false);
  const toggleNavigation=()=>setSidebarOpen(open=>!open);
  useEffect(()=>{if(!sidebarOpen)return;const dismiss=(event:globalThis.PointerEvent)=>{if((event.target as HTMLElement).closest('#gs-workspace-navigation,.gs-navigation-toggle'))return;setSidebarOpen(false);};document.addEventListener('pointerdown',dismiss,true);return()=>document.removeEventListener('pointerdown',dismiss,true);},[sidebarOpen,setSidebarOpen]);
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&sidebarOpen&&!document.querySelector('[role="dialog"]')){event.preventDefault();event.stopImmediatePropagation();setSidebarOpen(false);document.querySelector<HTMLButtonElement>('.gs-navigation-toggle')?.focus();}else if((event.ctrlKey||event.metaKey)&&event.code==='Backslash'&&!event.altKey&&!event.shiftKey){event.preventDefault();event.stopImmediatePropagation();setSidebarOpen(open=>!open);}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[sidebarOpen,setSidebarOpen]);
  const [settingsTab,setSettingsTabState]=useState<'tools'|'dependencies'>('tools');
  const setWorkspace=useCallback((next:Workspace)=>{if(next===workspaceRef.current)return;window.dispatchEvent(new Event('gs:save-viewport-context'));workspaceRef.current=next;setWorkspaceState(next);},[]);
  const setSettingsTab=useCallback((next:'tools'|'dependencies')=>setSettingsTabState(next),[]);
  const workspaceRef=useRef(workspace);workspaceRef.current=workspace;
  const bootRouteHandled=useRef(false);
  useEffect(()=>{if(!ready||bootRouteHandled.current)return;bootRouteHandled.current=true;if(data.settings.onboardingCompleted){markFirstVisitSeen();if(workspace==='get-started')setWorkspace('library');}},[ready,data.settings.onboardingCompleted]);
  const [focusTagId, setFocusTagId] = useMapState<number | null>(activeMap?.id??'no-map','tags.focus',null);
  useEffect(()=>{if(activeMap&&mapWorkspaces.includes(workspace))writeMapSession(activeMap.id,'workspace',workspace);},[activeMap?.id,workspace]);
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
  const [assetTransferOpen,setAssetTransferOpen]=useState(false);
  const [newTitle, setNewTitle] = useState('Untitled workshop');
  const [dragging, setDragging] = useState(false);
  const [help, setHelp] = useState(false);
  const [showFinder, setShowFinder] = useState(false);
  useEffect(()=>{if(native)document.documentElement.dataset.gsNativeFrame='true';},[]);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const buildRequest = useRef(0);
  const current = history.current;
  useEffect(()=>{
    if(!native||!current?.source||current.source.audioResources)return;
    let disposed=false;
    void call<OpenProject|null>('auto_connect_sound_resources',{projectId:current.id}).then(open=>{
      if(open&&!closingRef.current)dispatchDocument({type:'resources',project:open.project,kind:'audio'});
    }).catch(reason=>{if(!disposed)notice('Sound resources: '+String(reason),'error');});
    return()=>{disposed=true;};
  },[current?.id,current?.source?.sha256,data.installation.mccPath]);
  const[dockedDirector,setDockedDirector]=useMapState(current?.id??'global','director.docked',false);
  useEffect(()=>{if(!native)return;const stop=listen<string>('spark:director-docked',({payload})=>{if(typeof payload!=='string')return;writeMapSession(payload,'director.docked',true);if(historyRef.current.current?.id===payload)setWorkspace('machinima');});return()=>{void stop.then(stop=>stop());};},[]);
  const [dependencyRuntime,setDependencyRuntime]=useMapState<RuntimeId>(current?.id??'global','hosting.runtime',current?.quickForge?.runtimeId??current?.buildTargets?.find(t=>t.id===current.activeBuildTarget)?.runtimeId??data.settings.preferredHalo??'mccSteam');
  function openDependencySetup(){setSettingsTab('dependencies');setWorkspace('settings');}
  function selectSettingsTab(tab:'tools'|'interface'|'dependencies'){if(tab==='interface')setWorkspace('interface');else{setSettingsTab(tab);setWorkspace('settings');}}
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
  const documentsRef=useRef(documents);documentsRef.current=documents;
  const workflow=useWorkflowHistory({workspace,projectId:activeMap?.id??null,settingsTab},mapWorkspaces,route=>{
    if(route.projectId&&documentsRef.current.documents.some(d=>d.id===route.projectId))dispatchDocument({type:'select',id:route.projectId});
    setSettingsTabState(route.settingsTab);workspaceRef.current=route.workspace;setWorkspaceState(route.workspace);
  },route=>!mapWorkspaces.includes(route.workspace)||(route.projectId?documentsRef.current.documents.some(d=>d.id===route.projectId):!documentsRef.current.activeId));
  function routeTitle(route:WorkflowRoute|null,direction:'Back'|'Forward'){
    if(!route)return direction==='Back'?'No previous workspace':'No next workspace';
    const label=nav.find(item=>item.id===route.workspace)?.label??(route.workspace==='settings'?(route.settingsTab==='dependencies'?'Dependencies & setup':'Games & tools'):route.workspace);
    const map=documents.documents.find(d=>d.id===route.projectId)?.history.current?.title;
    return direction+' to '+label+(map?' · '+map:'')+' (Alt+'+(direction==='Back'?'Left':'Right')+')';
  }

  const applyHistory=useCallback((type:'undo'|'redo')=>{
    const active=document.activeElement;
    const targetId=active instanceof HTMLElement?active.closest<HTMLElement>('[data-history-project]')?.dataset.historyProject??documentsRef.current.activeId:documentsRef.current.activeId;
    if(targetId&&projectMutationPending(targetId))return;
    const apply=()=>{if(!targetId||projectMutationPending(targetId))return;const h=documentsRef.current.documents.find(d=>d.id===targetId)?.history;const candidate=type==='undo'?h?.past.at(-1):h?.future[0];const localOnly=(p:Project)=>JSON.stringify({...p,quickForge:null,modifiedAt:'',history:[],builds:[]});const hasUnsharedChange=!!candidate&&!!h?.current&&localOnly(candidate)!==localOnly(h.current);if(!hasUnsharedChange&&!window.dispatchEvent(new CustomEvent('guilty-spark-studio-undo',{cancelable:true,detail:{projectId:targetId,redo:type==='redo'}})))return;dispatchDocument({type:'history',id:targetId,action:{type}});};
    if(active instanceof HTMLInputElement&&['number','range'].includes(active.type)){
      active.blur();requestAnimationFrame(apply);
    }else apply();
  },[]);
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
    (announce = false,id?:string): Promise<void> => {
      const p = id?documentsRef.current.documents.find(d=>d.id===id)?.history.current:historyRef.current.current;
      if (!p) return Promise.resolve();
      const operation = saveQueue.current.then(async () => {
        try {
          await call('save_project', { project: p });
          dispatchDocument({type:'saved',id:p.id,project:p});
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
  useEffect(()=>{
    if(!native)return;
    const timer=window.setInterval(()=>{
      const id=historyRef.current.current?.id;if(!id)return;
      void save().then(()=>call('create_project_snapshot',{projectId:id,reason:'periodic'}))
        .catch(e=>notice(`Periodic snapshot could not be saved: ${String(e)}`,'error'));
    },Math.max(1,data.settings.snapshotIntervalMinutes??10)*60_000);
    return ()=>window.clearInterval(timer);
  },[save,notice,data.settings.snapshotIntervalMinutes]);
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
        for(const doc of documentsRef.current.documents){const p=doc.history.current;if(p&&doc.history.dirty){await call('save_project',{project:p});dispatchDocument({type:'saved',id:p.id,project:p});}}
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
      if(native)await call('claim_project_document',{id:open.project.id});
      dispatchDocument({type:'open',open});
      if(native&&open.project.source){const version=open.project.source.cacheVersion;
        const command=[6,7,609].includes(version)&&!open.project.source.resourceSha256?.['bitmaps.map']?'auto_connect_classic_textures':version===13&&(!open.project.source.resourceSha256?.['mcc-textures']||!open.project.source.resourceSha256?.['mcc-shared-bitmaps.map'])?'connect_mcc_texture_resources':null;
        if(command)void call<OpenProject|null>(command,{projectId:open.project.id}).then(result=>{if(result)dispatchDocument({type:'resources',project:result.project});}).catch(e=>{if(version===13)notice('MCC texture resources: '+String(e),'error');});
      }
      if (open.inspection) {
        try {
          const preview = thumbnail(open.inspection.mesh);
          if (preview) localStorage.setItem(`spark:thumbnail:${open.inspection.sha256}`, preview);
        } catch {
          /* Geometry preview caching must not block imports. */
        }
      }
      for (const asset of open.project.assets) {
        if(asset.kind!=='obj')continue;
        try {
          const mesh = await call<MeshData>('asset_mesh', { id: open.project.id, assetId: asset.id });
          dispatchDocument({type:'mesh',id:open.project.id,assetId:asset.id,mesh});
        } catch (e) {
          notice(`Asset ${asset.name}: ${String(e)}`, 'error');
        }
      }
    },
    [notice],
  );
  const applyResourceMetadata=useCallback(async(open:OpenProject)=>{const existing=documentsRef.current.documents.find(d=>d.id===open.project.id);if(existing)dispatchDocument({type:'resources',project:open.project});else await load(open);},[load]);
  const applyDependencyChoice=useCallback((open:OpenProject)=>{
    const existing=documentsRef.current.documents.find(d=>d.id===open.project.id);
    if(!existing)return;
    dispatchDocument({type:'history',id:open.project.id,action:{type:'edit',project:open.project,description:'Update map dependency setup'}});
    if(open.inspection)dispatchDocument({type:'resources',project:open.project});
    setEpoch(value=>value+1);
  },[]);
  const adoptExternalRevision=useCallback(async(previousId:string,opened:OpenProject,mode:'replaceClean'|'openSeparate')=>{
    if (documentsRef.current.activeId===previousId && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur(); await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    }
    let previous=documentsRef.current.documents.find(d=>d.id===previousId);
    if (!previous?.history.current) return;
    await call('claim_project_document',{id:opened.project.id});
    const prior=previous.history.current;
    if (!opened.project.buildTargets?.length && prior.buildTargets?.length && prior.source?.cacheVersion===opened.project.source?.cacheVersion) {
      // Keep chosen tool profiles; no edits, cache offsets or old build receipts
      // are copied. The normal native conversion preflight rechecks this source.
      await call('save_project',{project:{...opened.project,buildTargets:prior.buildTargets,activeBuildTarget:prior.activeBuildTarget}});
      opened=await call<OpenProject>('open_project',{id:opened.project.id});
    }
    previous=documentsRef.current.documents.find(d=>d.id===previousId);
    if (!previous?.history.current) {await call('release_project_document',{id:opened.project.id});return;}
    const replace=mode==='replaceClean'&&!previous.history.dirty&&!hasSourceBoundEdits(previous.history.current,previous.inspection);
    window.dispatchEvent(new CustomEvent('guilty-spark-flush-map-view',{detail:previousId}));
    if (!documentsRef.current.documents.some(d=>d.id===opened.project.id)) copyMapViewSession(previousId,opened.project.id,previous.inspection,opened.inspection);
    dispatchDocument({type:'external-revision',previousId,open:opened,replaceClean:replace});
    if (replace) {
      // React applies the reducer's final dirty/source checks before ownership is
      // released. A late edit can retain the old document as a separate tab.
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      if(!documentsRef.current.documents.some(d=>d.id===previousId))await call('release_project_document',{id:previousId});
    }
    if (documentsRef.current.activeId===previousId && workspaceRef.current==='live') setWorkspace('world');
    await refresh();
    notice(replace?'External save detected. Map and tags refreshed; the previous source revision is preserved.':'External save opened separately. Existing Spark edits remain in their original map tab.','info');
  },[refresh,notice]);
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
  const initialWindowProject=useRef(false);
  useEffect(()=>{const id=new URLSearchParams(location.search).get('project');if(!native||!ready||!id||initialWindowProject.current)return;initialWindowProject.current=true;if(!/^[0-9a-f-]{36}$/i.test(id)){notice('Invalid map window identity.','error');return;}void call<OpenProject>('open_project',{id}).then(async open=>{await load(open);setWorkspace(requestedWorkspace()??rememberedWorkspace(open.project,open.inspection));}).catch(e=>notice(String(e),'error'));},[ready,load,notice]);
  useEffect(() => {
    if (!native) return;
    const unsubs: Promise<() => void>[] = [];
    unsubs.push(
      listen<JobEvent>('spark:job', ({ payload }) => {
        setLogs((v) => [...v, payload].slice(-2000));
        if (payload.progress > 0 && payload.progress < 100) setActiveJob(payload.jobId);
        if (payload.progress === 100) {
          setActiveJob(current=>current===payload.jobId?null:current);
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
          const animations=payload.paths.filter(path=>/\.(jma|jmm|jmo|jmr|jmt|jmz|fbx|model_animations)$/i.test(path));
          const assets=payload.paths.filter(path=>/\.(obj|wav|ogg)$/i.test(path));
          if(assets.length){if(assets.length!==payload.paths.length){notice('Drop maps/animations and custom assets separately.','info');return;}if(assets.length>16){notice('Import at most 16 custom files per drop.','error');return;}const event=new CustomEvent('guilty-spark-asset-file-drop',{cancelable:true,detail:{paths:assets,x:payload.position.x/window.devicePixelRatio,y:payload.position.y/window.devicePixelRatio}});window.dispatchEvent(event);if(!event.defaultPrevented)void importDroppedAssets(assets);}
          else if(animations.length)void importAnimations(animations);
          else void importFiles(payload.paths);
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
      if(e.ctrlKey&&e.altKey&&e.key.toLowerCase()==='o'){e.preventDefault();setInterfacePreferences(p=>({...p,windowOpacity:1,windowTintStrength:0}));return;}
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
          const id=e.target instanceof HTMLElement?e.target.closest<HTMLElement>('[data-history-project]')?.dataset.historyProject:undefined;
          void save(true,id).catch(() => {});
        }
        if (e.key.toLowerCase() === 'z') {
          const text=e.target instanceof Element?e.target.closest('input,textarea,[contenteditable="true"]'):null;
          if(text&&!(text instanceof HTMLInputElement&&['number','range'].includes(text.type)))return;
          e.preventDefault();
          applyHistory(e.shiftKey?'redo':'undo');
        }
        if (e.key.toLowerCase() === 'y') {
          const text=e.target instanceof Element?e.target.closest('input,textarea,[contenteditable="true"]'):null;
          if(text&&!(text instanceof HTMLInputElement&&['number','range'].includes(text.type)))return;
          e.preventDefault();
          applyHistory('redo');
        }
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [save,help,createModal,applyHistory]);
  function edit(project: Project, description: string) {
    dispatchDocument({type:'history',id:project.id,action:{type:'edit',project,description}});
  }
  async function importFiles(paths?: string[], destination?: 'build') {
    setBusy(true);
    try {
      if (historyRef.current.dirty) await save();
      const imported = await call<OpenProject[]>(
        paths ? 'import_paths' : 'import_dialog',
        paths ? { paths } : undefined,
      );
      if (imported.length) {
        for(const open of imported)await load(open);
        dispatchDocument({type:'select',id:imported[0].project.id});
        setWorkspace(destination && imported[0].project.source ? destination : imported[0].project.quickForge ? 'quickforge' : imported[0].inspection?.header.scenarioType===2 ? 'tags' : imported[0].inspection?.mesh.positions.length ? 'world' : 'tags');
        notice(
          `${imported.length} project${imported.length === 1 ? '' : 's'} imported. Source data preserved.${destination && imported[0].project.source ? ' Review the MCC conversion checks and prepare the installed tools.' : ''}`,
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
  async function openDownloadedMaps(imported:OpenProject[],destination:MapDownloadAction){
    if(!imported.length)return;
    setBusy(true);
    try{
      if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      if(historyRef.current.dirty)await save();
      for(const open of imported){
        // Reopening an imported download must retain an already open draft.
        if(!documentsRef.current.documents.some(d=>d.id===open.project.id))await load(open);
      }
      dispatchDocument({type:'select',id:imported[0].project.id});
      setWorkspace(destination==='convert'?'build':destination==='tags'||imported[0].inspection?.header.scenarioType===2?'tags':'world');
      await refresh();
      notice(`${imported.length} downloaded map${imported.length===1?'':'s'} opened. Original downloads and existing map drafts are preserved.${destination==='convert'?' Review the target runtime, required tools and conversion checks before building.':''}`,'success');
    }finally{setBusy(false);}
  }
  async function importAnimations(paths:string[]){
    const project=historyRef.current.current;if(!project){notice('Open a map or source project before dropping animations.','error');return;}
    setBusy(true);try{const imported=await call<import('./animation').AnimationAsset[]>('import_animation_sources',{projectId:project.id,paths});const current=documentsRef.current.documents.find(d=>d.id===project.id)?.history.current;
      if(imported.length&&current){dispatchDocument({type:'history',id:project.id,action:{type:'edit',project:{...current,animations:[...(current.animations??[]),...imported]},description:'Drop animation sources into the project'}});dispatchDocument({type:'select',id:project.id});setWorkspace('machinima');notice(`Imported ${imported.length} animation source${imported.length===1?'':'s'}. Choose a biped in Machinima.`,'success');}
    }catch(error){notice(String(error),'error');}finally{setBusy(false);}
  }
  async function openProject(id: string, stayInWorkspace?: Workspace) {
    const requestedFrom=workspaceRef.current;
    const existing=documentsRef.current.documents.find(d=>d.id===id);if(existing){dispatchDocument({type:'select',id});setWorkspace(stayInWorkspace??rememberedWorkspace(existing.history.current!,existing.inspection));return;}
    setBusy(true);
    try {
      if (historyRef.current.dirty) await save();
      const open = await call<OpenProject>('open_project', { id });
      await load(open);
      if(workspaceRef.current===requestedFrom)setWorkspace(stayInWorkspace ?? rememberedWorkspace(open.project,open.inspection));
    } catch (e) {
      notice(String(e), 'error');
    } finally {
      setBusy(false);
    }
  }
  function selectMap(id:string){if(document.activeElement instanceof HTMLElement)document.activeElement.blur();requestAnimationFrame(()=>{const map=documentsRef.current.documents.find(d=>d.id===id);dispatchDocument({type:'select',id});if(map?.history.current)setWorkspace(rememberedWorkspace(map.history.current,map.inspection));});}
  async function closeMap(id:string,separateWindow=false){
    if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
    setBusy(true);try{await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));await save(false,id);window.dispatchEvent(new Event('gs:save-viewport-context'));if(separateWindow){if(!native)throw new Error('Separate editor windows require the desktop application.');await call('open_project_window',{id,workspace:workspaceRef.current});}else if(native)await call('release_project_document',{id});const state=documentsRef.current;if(state.activeId===id){const index=state.documents.findIndex(d=>d.id===id),remaining=state.documents.filter(d=>d.id!==id),next=remaining[Math.min(index,remaining.length-1)];setWorkspace(next?.history.current?rememberedWorkspace(next.history.current):'library');}dispatchDocument({type:'close',id});}catch(e){notice(String(e),'error');}finally{setBusy(false);}
  }
  async function popoutWorkspace(){if(!native){notice('Workspace windows require the desktop application.');return;}if(current&&mapWorkspaces.includes(workspaceRef.current)){if(busy||activeJob){notice('Finish the current map operation before moving its workspace to another window.');return;}await closeMap(current.id,true);return;}try{await call('open_workspace_window',{workspace:workspaceRef.current,context:null});}catch(e){notice(String(e),'error');}}
  async function transferAsset(selection:TransferSelection){
    const target=historyRef.current.current;if(!target)return;setBusy(true);
    try{if(selection.kind==='tag'){const next=transferTag(target,selection.asset);edit(next,'Transfer source-linked '+selection.asset.name);notice('Source-linked model added to the map. Its original map and tag identities are preserved.','success');}
      else if(selection.kind==='sound'){const emitters=await librarySoundEmitters(selection.item,[0,0,0]);const scene=target.audioPreview??emptySoundScene();if(scene.emitters.length+emitters.length>64)throw Error('The map sound emitter limit is full');edit({...target,audioPreview:{...scene,emitters:[...scene.emitters,...emitters]}},'Place transferred sound '+selection.item.name);}
      else{await save(false,target.id);const result=await call<AssetResult>('copy_project_asset',{sourceId:selection.sourceId,assetId:selection.assetId,targetId:target.id});dispatch({type:'assets',project:result.project});dispatchDocument({type:'mesh',id:target.id,assetId:result.asset.id,mesh:result.mesh});const latest=documentsRef.current.documents.find(d=>d.id===target.id)?.history.current??target;edit({...latest,assets:result.project.assets,scene:[...latest.scene,{id:crypto.randomUUID(),name:result.asset.name,kind:'Workshop mesh',tagId:null,assetId:result.asset.id,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],visible:true,sourceOffset:null,rotationOffset:null}]},'Place transferred OBJ '+result.asset.name);await refresh();notice('Verified OBJ copied and placed. Ctrl+Z removes the placement.','success');}
    }finally{setBusy(false);}
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
  async function importAsset(position?:Vec3,path?:string) {
    const target=historyRef.current.current;
    if (!target) return;
    setBusy(true);
    try {
      if (historyRef.current.dirty) await save();
      const result = await call<AssetResult | null>('import_asset', { id: target.id,...(path?{path}:{}) });
      if (result) {
        dispatchDocument({type:'history',id:target.id,action:{type:'assets',project:result.project}});
        dispatchDocument({type:'mesh',id:result.project.id,assetId:result.asset.id,mesh:result.mesh});
        const latest=documentsRef.current.documents.find(document=>document.id===target.id)?.history.current;
        if(latest){const imported=result.project.scene.find(object=>object.assetId===result.asset.id);if(imported)edit({...latest,assets:result.project.assets,scene:[...latest.scene,{...imported,position:position??imported.position}]},'Place imported OBJ '+result.asset.name);}
        notice(result.warnings.join(' ')||'Model imported into this map. Its source preview can be moved and replaced.','info');
        await refresh();
      }
    } catch (e) {
      notice(String(e), 'error');
    } finally {
      setBusy(false);
    }
  }
  async function importSound(position?:Vec3,path?:string){
    const target=historyRef.current.current;if(!target)return false;setBusy(true);
    try{await save(false,target.id);const result=await call<{project:Project;asset:import('./types').Asset}|null>('import_custom_sound',{projectId:target.id,...(path?{path}:{})});if(!result)return false;
      dispatchDocument({type:'history',id:target.id,action:{type:'assets',project:result.project}});
      const latest=documentsRef.current.documents.find(document=>document.id===target.id)?.history.current;if(!latest)return false;
      const scene=latest.audioPreview??emptySoundScene();if(scene.emitters.length>=64)throw Error('The sound scene is full; the file is retained in the asset library.');
      const emitter=createEmitter(0,result.asset.name.slice(0,120),position??[0,0,0]);emitter.sourceProjectId=target.id;emitter.sourceSha256=result.asset.sha256;emitter.customSound={assetId:result.asset.id,sha256:result.asset.sha256};emitter.loop=false;emitter.event='manual';emitter.bus='effects';
      edit({...latest,assets:result.project.assets,audioPreview:{...scene,emitters:[...scene.emitters,emitter]}},'Place custom sound '+result.asset.name);writeMapSession(target.id,'sound-emitter-selection',emitter.id);await refresh();notice('Custom sound imported into the saved spatial mix.','success');return true;
    }catch(reason){notice(String(reason),'error');return false;}finally{setBusy(false);}
  }
  async function importDroppedAssets(paths:string[],point?:Vec3){
    const target=historyRef.current.current?.id;if(!target){notice('Open a map or asset project before importing custom files.','info');return;}
    for(const path of paths){if(historyRef.current.current?.id!==target){notice('Remaining files were not imported because the active map changed.','info');break;}if(/\.obj$/i.test(path))await importAsset(point,path);else await importSound(point,path);}
  }
  async function placeLibraryMesh(item:ViewportAsset,position:Vec3,replaceId?:string|null){
    if(item.kind!=='mesh')return;
    const target=historyRef.current.current;if(!target)return;setBusy(true);
    try{
      let asset=item.asset;
      if(item.sourceId!==target.id){await save(false,target.id);const result=await call<AssetResult>('copy_project_asset',{sourceId:item.sourceId,assetId:item.asset.id,targetId:target.id});asset=result.asset;dispatchDocument({type:'history',id:target.id,action:{type:'assets',project:result.project}});dispatchDocument({type:'mesh',id:target.id,assetId:asset.id,mesh:result.mesh});}
      const latest=documentsRef.current.documents.find(document=>document.id===target.id)?.history.current;if(!latest)return;
      const old=replaceId?latest.scene.find(object=>object.id===replaceId):undefined;if(replaceId&&!old)throw Error('The selected object is no longer available.');
      const object={...(old??{id:crypto.randomUUID(),position,rotation:[0,0,0] as Vec3,scale:[1,1,1] as Vec3,visible:true,sourceOffset:null,rotationOffset:null}),name:asset.name,kind:'Workshop mesh',tagId:null,assetId:asset.id,sourceModel:null};
      edit({...latest,assets:latest.assets.some(value=>value.id===asset.id)?latest.assets:[...latest.assets,asset],scene:old?latest.scene.map(value=>value.id===old.id?object:value):[...latest.scene,object]},`${old?'Replace':'Place'} custom model ${asset.name}`);writeMapSession(target.id,'world.selection',object.id);writeMapSession(target.id,'forge.workshopSelection',object.id);
    }catch(reason){notice(String(reason),'error');}finally{setBusy(false);}
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
    try {
      const d = await call<Bootstrap>('save_settings', { settings });
      setData(d);
      notice('Preferences saved.','success');
    } catch(error) {notice(String(error),'error');throw error;}
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
  function forgeView(project:Project|null){return <QuickForge library={{documents:documents.documents,onImportModel:importAsset,onImportSound:importSound,onPlaceMesh:placeLibraryMesh,onSaveMap:id=>save(true,id),busy}} key={project?.id??'new'} project={project} data={data} edit={edit} onSharedDocument={document=>dispatch({type:'forge-remote',projectId:project!.id,document})} onCreate={createQuickForge} onSave={()=>save()} onBuild={buildQuickForge} onRuntimes={()=>setWorkspace('runtimes')} onLive={()=>setWorkspace('live')} onSettings={()=>setWorkspace('settings')} notify={notice} logs={logs} activeJob={activeJob} epoch={epoch} dirty={project?history.dirty:false}/>;}
  function sourceView(){return current?.quickForge?forgeView(current):current?<Suspense fallback={<div className="loading">Loading map viewer…</div>}><World library={{documents:documents.documents,onImportModel:importAsset,onImportSound:importSound,onPlaceMesh:placeLibraryMesh,onSaveMap:id=>save(true,id),busy}} key={current.id} project={current} inspection={inspection} assetMeshes={meshes} edit={edit} notify={notice} onBeforeResources={save} onResourcesConnected={applyResourceMetadata} onOpenTag={(tagId,sourceId)=>{if(sourceId&&sourceId!==current.id){writeMapSession(sourceId,'tags.focus',tagId);dispatchDocument({type:'select',id:sourceId});}else setFocusTagId(tagId);setWorkspace('tags');}}/></Suspense>:forgeView(null);}
  async function openRecordingDirector(){const project=historyRef.current.current;if(!project)return;try{await save();window.dispatchEvent(new CustomEvent('guilty-spark-flush-map-view',{detail:project.id}));let session=await call<import('./directorSession').DirectorSession>('director_session',{projectId:project.id});if(session.revision===0){const pose=readMapSession<{position:number[];target?:number[];quaternion:number[]}|null>(project.id,'camera.world.PerspectiveCamera',null);if(pose?.position.length===3&&pose.quaternion?.length===4){const[x,y,z,w]=pose.quaternion,p=pose.position,target=pose.target??[p[0]-2*(x*z+w*y),p[1]-2*(y*z-w*x),p[2]-(1-2*(x*x+y*y))];session=await call('director_update',{projectId:project.id,revision:session.revision,composition:{...session.composition,pose:{position:p,lookAt:target,fov:55,roll:0}},save:true});}}await call('director_popout',{projectId:project.id});setDockedDirector(false);if(workspace==='machinima')setWorkspace('world');notice('Recording Director opened. Use its display selector or drag it to another monitor.','success');}catch(e){notice(String(e),'error');}}
  function content(){
    if(workspace==='world'||workspace==='quickforge'||workspace==='live')return <LevelEditorWorkspace entries={data.entries} onBuild={()=>setWorkspace('build')} project={current} inspection={inspection} assetMeshes={meshes} intent={workspace} onSourceEdit={edit} onImportMap={()=>void importFiles()} onContinue={id=>void openProject(id,'world')} onDirector={()=>void openRecordingDirector()}
      source={sourceView()} newMap={forgeView(null)} notify={notice} onBeforeResources={save} onResourcesConnected={applyResourceMetadata}
      onOpenMap={async()=>{await save();const opened=await call<OpenProject>('live_mcc_import_map');await load(opened);await refresh();}}/>;
    return workspaceContent();
  }
  function workspaceContent() {
    if (workspace === 'how-to') return <HowTo navigate={setWorkspace}/>;
    if (workspace === 'get-started') return <GettingStarted data={data} project={current} onApply={applySettings} navigate={target => {markFirstVisitSeen();setWorkspace(target);}}/>;
    if (workspace === 'features') return <Features project={current} openMaps={documents.documents.length} navigate={setWorkspace}/>;
    if (workspace === 'community') return <CommunityThanks/>;
    if (workspace === 'map-finder') return <CommunityMaps onImport={()=>void importFiles()} onImportConvert={()=>void importFiles(undefined,'build')} currentMapTitle={current?.source?current.title:null} onConvertCurrent={()=>setWorkspace('build')} onLibrary={()=>setWorkspace('library')} busy={busy} onDownloaded={openDownloadedMaps} targetLabel={data.settings.preferredHalo==='mccSteam'||!data.settings.preferredHalo?'MCC Halo 1':data.settings.preferredHalo}/>;
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
    if (workspace === 'interface') return <SettingsPanel tab="interface" onTab={selectSettingsTab}><InterfaceStudio
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
      }} /></SettingsPanel>;
    if (workspace === 'settings')
      return (
        <SettingsPanel tab={settingsTab} onTab={selectSettingsTab}>{settingsTab==='dependencies'?<div className="analysis-page">
          <label className="field">Dependency target<select aria-label="Dependency target runtime" value={dependencyRuntime} onChange={e=>setDependencyRuntime(e.target.value as RuntimeId)}>
            <option value="mccSteam">Halo 1 · MCC (Steam)</option><option value="haloCustomEdition">Halo Custom Edition</option><option value="haloPc">Halo PC</option><option value="chupathingyCe">ChupathingyCE</option><option value="openCe">OpenCE</option><option value="haloPcTrial">Halo PC Trial</option><option value="macRetail">Halo Mac</option><option value="macDemo">Halo Mac Demo</option><option value="haloMd">HaloMD</option><option value="haloXbox">Halo Xbox</option>
          </select></label>
          <DependencyPanel project={current} runtime={dependencyRuntime} onSetupChanged={next=>{setData(next);setEpoch(value=>value+1);}} onProjectUpdated={applyDependencyChoice} onChooseAssets={()=>setWorkspace(current?'assets':'library')}/>
        </div>:<Preferences
          data={data}
          undoLimit={history.limit} onUndoLimit={limit=>dispatch({type:'history-limit',limit})}
          onApply={applySettings}
          onAction={action}
          onRuntimes={() => setWorkspace('runtimes')}
        />}</SettingsPanel>
      );
    if (workspace === 'compare')
      return (
        <Compare entries={data.entries} currentId={current?.id} dirty={history.dirty} onSave={() => save()} />
      );
    if (workspace === 'runtimes')
      return <Runtimes project={current} dirty={history.dirty} onSave={() => save()} settings={data.settings} onSettings={openDependencySetup} onOpenWorkspace={setWorkspace} edit={edit} />;
    if (workspace === 'academy') return <Academy project={current} inspection={inspection} settings={data.settings} navigate={setWorkspace} />;
    if (!current) return commonEmpty;
    switch (workspace) {
      case 'firefight': return <Firefight key={current.id} project={current} entries={data.entries} edit={edit} />;
      case 'creator': return <CreatorStudio project={current} inspection={inspection} edit={edit} notify={notice} onOpenRuntimes={() => setWorkspace('runtimes')} onBuild={()=>setWorkspace('build')}/>;
      case 'machinima': if(dockedDirector)return <DockedDirector key={current.id} projectId={current.id} embedded onPopout={()=>void openRecordingDirector()} onClose={()=>setDockedDirector(false)}/>;return <MachinimaWorkspace key={current.id} project={current} inspection={inspection} assetMeshes={meshes} data={data} edit={edit} notify={notice} onResourcesConnected={applyResourceMetadata} onSave={save} onLive={()=>setWorkspace('live')} onEditor={()=>setWorkspace('quickforge')} onDirector={()=>void openRecordingDirector()} onBuild={()=>setWorkspace('build')}/>;
      case 'tags':
        return (
          <Tags key={current.id} project={current} inspection={inspection} entries={data.entries} hasUnsavedChanges={history.dirty}
            onNativeEditor={()=>window.dispatchEvent(new CustomEvent('guilty-spark-runtime-tool',{detail:{projectId:current.id,actionId:'editTags'}}))}
            onSelectMap={(id) => { void openProject(id, 'tags'); }} edit={edit} notify={notice}
            focusTagId={focusTagId} onFocusHandled={()=>setFocusTagId(null)}
            onResources={()=>void action(async()=>{const id=current.id;await save();const open=await call<OpenProject|null>('choose_project_resources',{projectId:id});if(open)await applyResourceMetadata(open);return open;},'Map resources connected; sound samples are verified when opened.')}
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
        return <Preservation project={current} edit={edit} onBeforeSave={save} onRestore={load} />;
      case 'build':
        return current.quickForge ? <QuickForge key={current.id} project={current} data={data} edit={edit} onSharedDocument={document=>dispatch({type:'forge-remote',projectId:current!.id,document})} onCreate={createQuickForge} onSave={() => save()} onBuild={buildQuickForge} onRuntimes={() => setWorkspace('runtimes')} onSettings={() => setWorkspace('settings')} notify={notice} logs={logs} activeJob={activeJob} epoch={epoch} dirty={history.dirty} /> : current.source ? (
          <Build
            key={current.id}
            edit={edit}
            onSave={()=>save(false,current.id)}
            onOpenCompiled={buildId=>void action(async()=>{await save();const opened=await call<OpenProject>('open_built_map',{projectId:current.id,buildId});await load(opened);await refresh();setWorkspace('quickforge');},'Compiled map preserved and opened in its own Level Editor tab.')}
            project={current}
            data={data}
            logs={logs}
            activeJob={activeJob}
            dirty={history.dirty}
            epoch={epoch}
            onStart={() => void startBuild()}
            onAction={action}
            onSettings={openDependencySetup}
            onResources={() =>
              void action(async () => {
                const projectId = current.id;
                await save();
                const open = await call<OpenProject | null>('choose_project_resources', { projectId });
                if (open) await applyResourceMetadata(open);
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
      <div className="gs-window-content">
      <div className="application gs-drawers" inert={closing || undefined}>
        <header id="gs-window-header" className="app-header gs-compact-header" onPointerDown={event=>void dragWindow(event).catch(e=>notice(String(e),'error'))}
          onDoubleClick={event=>{if(!(event.target as HTMLElement).closest('button,a,input,select'))void maximizeWindow().catch(e=>notice(String(e),'error'));}}
          style={ownedHeaderArt && matchesOwnedInterfaceBitmap(bitmapPreference,current,inspection)
          ? { backgroundImage: `linear-gradient(90deg,rgba(7,17,26,.96) 0%,rgba(9,24,35,.9) 44%,rgba(8,22,33,.58) 100%),url("${ownedHeaderArt.url}")`,backgroundSize:'cover',backgroundPosition:'center' }
          : undefined}>
          <button className="brand" onClick={() => setWorkspace('library')} aria-label="Guilty Spark home">
            <img src="/spark.svg" alt="" />
            <div>
              <strong>GUILTY SPARK</strong>
              <span>HALO MODERN EVOLVED</span>
            </div>
            <Pill>0.4.0 · C40 dev</Pill>
          </button>
          {documents.documents.length?<MapTabs state={documents} disabled={busy||closing} onSelect={selectMap} onClose={id=>void closeMap(id)} onWindow={id=>void closeMap(id,true)} onAssets={()=>{setAssetTransferOpen(true);requestAnimationFrame(()=>window.dispatchEvent(new CustomEvent('guilty-spark-reveal-drawer',{detail:{id:'asset-transfer'}})));}}/>:<div className="header-context">
            <span>LOCAL WORKBENCH</span>
            <ChevronRight size={12} />
            <strong>{current?.title ?? nav.find(item=>item.id===workspace)?.label ?? 'Guilty Spark'}</strong>
            {current && (
              <span
                className={history.dirty ? 'unsaved-dot' : 'saved-dot'}
                title={history.dirty ? 'Unsaved changes' : 'Saved'}
              />
            )}
          </div>}
          <div className="header-actions">
            <LiveStudioIndicator projectId={current?.id??null} canHost={!!current?.quickForge} onOpen={id=>{writeMapSession(id,'studio.openRequest',true);void openProject(id,'quickforge').then(()=>requestAnimationFrame(()=>window.dispatchEvent(new CustomEvent('guilty-spark-live-studio-open',{detail:{projectId:id}}))));}}/>
            <Pill tone={data.installation.mccPath ? 'green' : 'muted'}>
              <span className="live-dot" />
              {data.installation.mccPath ? 'MCC found' : native ? 'Runtime not found' : 'Browser preview'}
            </Pill>
            <button className="gs-header-find" title="Search all Spark tools and workspaces (Ctrl+K)" onClick={()=>{setHelp(false);setCreateModal(false);setShowFinder(true);}}><Search size={15}/>Find tools <kbd>Ctrl K</kbd></button>
            <IconButton label="Help & shortcuts" onClick={() => setHelp(true)}>
              <CircleHelp size={18} />
            </IconButton>
          </div>
          <div id="gs-window-actions" className="gs-window-actions" />
        </header>
        <aside id="gs-workspace-navigation" className="sidebar gs-navigation-drawer" aria-label="Workspace navigation" hidden={!sidebarOpen} onClickCapture={e=>{if((e.target as HTMLElement).closest('.nav-item'))setSidebarOpen(false);}}>
          <div className="sidebar-label">WORKSPACES</div>
          <nav aria-label="Workspaces">
            {navGroups.map(([group,ids])=><div className="gs-nav-group" key={group}><div className="sidebar-label">{group}</div>{nav.filter(item=>(ids as readonly string[]).includes(item.id)).map(({ id, label, icon: Icon }) => (
              <button
                className={workspace === id || (id==='quickforge'&&(workspace==='world'||workspace==='live')) ? 'nav-item selected' : 'nav-item'}
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
            ))}</div>)}
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
                    <strong title={current.title}>{current.title}</strong>
                    <small>
                      {current.source
                        ? `Cache ${current.source.cacheVersion} · source preserved`
                        : 'Asset workspace'}
                    </small>
                  </span>
                </div>
                <button
                  className="small-button full"
                  aria-label="Export .gsproject"
                  title="Save and export this project's descriptor"
                  onClick={() =>
                    void action(async () => {
                      await save();
                      return call('export_project', { id: current.id });
                    }, 'Project descriptor exported. Referenced source and asset files must remain available.')
                  }
                >
                  <Save size={13} />
                  <span className="sidebar-export-label">Export .gsproject</span>
                </button>
              </>
            ) : (
              <p>No project open.</p>
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
              className={workspace === 'settings'||workspace==='interface' ? 'nav-item selected' : 'nav-item'}
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
          <EditorAudioProvider project={current} inspection={inspection} active={!closing&&['world','quickforge','live','tags','assets','scenario','creator','firefight','build','preservation'].includes(workspace)} resourceScope={JSON.stringify(documents.documents.map(document=>[document.id,{map:document.history.current?.source?.resourceSha256,audio:document.history.current?.source?.audioResources?.sha256}]))}>
          <WorkspacePanels onPopout={()=>void popoutWorkspace()} onNavigationToggle={toggleNavigation} navigationOpen={sidebarOpen} id={current?.id??'global'} workspace={['world','quickforge','live'].includes(workspace)?'level':workspace} actions={<>{current&&<EditorSoundControls projectId={current.id}/>}<div role="group" aria-label="Workflow navigation"><IconButton label="Back to previous workspace" title={routeTitle(workflow.back,'Back')} onClick={workflow.goBack} disabled={!workflow.back}><ArrowLeft size={14}/></IconButton><IconButton label="Forward to next workspace" title={routeTitle(workflow.forward,'Forward')} onClick={workflow.goForward} disabled={!workflow.forward}><ArrowRight size={14}/></IconButton></div></>}>
          {documents.documents.map(document=>{const project=document.history.current;return project?.quickForge?<ForgeCollaboration key={project.id} hidden={current?.id!==project.id} projectId={project.id} document={project.quickForge} entries={data.entries} onShared={next=>dispatch({type:'forge-remote',projectId:project.id,document:next})} onSave={()=>save(false,project.id)}/>:null;})}
            {current&&<WorkspacePanel id="project-setup" label="Project setup"><MapTools key={current.id} project={current} settings={data.settings} edit={edit} onSave={()=>save()}/></WorkspacePanel>}
          {['world','quickforge','live','machinima'].includes(workspace)&&<WorkspacePanel id="navigation" label="Camera"><NavigationSettings/></WorkspacePanel>}
          <WorkspacePanel id="source-changes" label="Changes">{current&&<div className="gs-edit-history-controls" role="group" aria-label="Project edit history"><span>{current.title} · edit history</span><IconButton label="Undo (Ctrl+Z)" onClick={()=>applyHistory('undo')} disabled={!history.past.length&&!sharedHistory[current?.id??'']?.undo}><Undo2 size={14}/></IconButton><IconButton label="Redo (Ctrl+Y / Ctrl+Shift+Z)" onClick={()=>applyHistory('redo')} disabled={!history.future.length&&!sharedHistory[current?.id??'']?.redo}><Redo2 size={14}/></IconButton></div>}<ExternalMapSync documents={documents.documents.flatMap(d=>d.history.current?[{project:d.history.current,inspection:d.inspection,dirty:d.history.dirty}]:[])} onRevision={adoptExternalRevision}/></WorkspacePanel>
          {assetTransferOpen&&current&&<AssetTransfer key={current.id} data={data} documents={documents.documents} target={current} busy={busy} onTransfer={transferAsset} onClose={()=>setAssetTransferOpen(false)} onTags={()=>{setAssetTransferOpen(false);setWorkspace('tags');}}/>}
          {current && !['library','settings','community','get-started','world','quickforge','live'].includes(workspace) && (
            <div className="editor-bar">
              <div className="breadcrumb">
                <button onClick={() => setWorkspace('library')}>Library</button>
                <ChevronRight size={12} />
                <span>{current.title}</span>
                <Pill>{current.source?.engine ?? 'Asset workspace'}</Pill>
              </div>
              <div>
                <button className="small-button" onClick={() => void save(true).catch(() => {})}>
                  <Save size={14} />
                  {history.dirty ? 'Save changes' : 'Saved'}
                </button>
              </div>
            </div>
          )}
          {ready && <WorkspacePanel id="help" label="Help"><WorkbenchGuide key={workspace} workspace={workspace}
            evidence={{ desktop:native, project:!!current, source:!!current?.source,
              inspectedSource:!!current?.source && !!inspection && inspection.sha256.toLowerCase()===current.source.sha256.toLowerCase(),
              forge:!!current?.quickForge,
              toolFolder:!!data.settings.hekDirectory || !!data.settings.invaderDirectory,
              unsaved:history.dirty, runningJob:!!activeJob }}
            onNavigate={target=>{markFirstVisitSeen();setWorkspace(target);playInterfaceCue('select');}} /></WorkspacePanel>}
          {!ready ? (
            <div className="loading">
              <LoaderCircle className="spin" size={22} />
              Connecting to the local workbench…
            </div>
          ) : (
            <Suspense fallback={<div className="loading">Loading workspace…</div>}><WorkspaceSession key={`${current?.id??'global'}:${['world','quickforge','live'].includes(workspace)?'level':workspace}`} id={current?.id??'global'} workspace={['world','quickforge','live'].includes(workspace)?'level':workspace}>{content()}</WorkspaceSession></Suspense>
          )}
          </WorkspacePanels>
          </EditorAudioProvider>
        </main>
        <RuntimeDock project={current} settings={data.settings} dirty={history.dirty} working={busy || !!activeJob} epoch={epoch} onSave={() => save()} onNavigate={next=>next==='settings'?openDependencySetup():setWorkspace(next)} onOpenCompiled={buildId=>{if(current)void action(async()=>{await save();const opened=await call<OpenProject>('open_built_map',{projectId:current.id,buildId});await load(opened);await refresh();setWorkspace('quickforge');},'Working tag changes compiled, preserved and opened in a new map tab.');}}/>
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
        {showFinder && !help && !createModal && <WorkspaceFinder items={finderItems} project={current} settings={data.settings} onSettings={openDependencySetup} onNavigate={target=>{markFirstVisitSeen();setWorkspace(target);}} onClose={()=>setShowFinder(false)}/>}
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
                  ['Workspace guidance', 'Help drawer'],
                  ['Workspace navigation', 'Ctrl + \\'],
                  ['Back / Forward through your workflow', 'Alt + Left / Right or mouse side buttons'],
                  ['Window and project header', 'Ctrl + Shift + \\'],
                  ['Fullscreen / restore', 'F11 / Escape'],
                  ['Dismiss help tooltip', 'Esc while focused'],
                  ['Save project', 'Ctrl + S'],
                  ['Undo / redo', 'Ctrl + Z / Ctrl + Shift + Z'],
                  ['Move / rotate / scale', 'W / E / R'],
                  ['Fly camera', 'Hold RMB + WASD; Q down / E up; wheel changes speed'],
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
      <ResizeEdges/>
      {closing && (
        <div className="modal-backdrop">
          <div className="modal" role="status">
            <LoaderCircle className="spin" size={24} />
            <h2>Saving before closing…</h2>
            <p>Your project will finish saving before the window closes.</p>
          </div>
        </div>
      )}
      </div>
      <div className="gs-window-tint" aria-hidden="true"/>
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
