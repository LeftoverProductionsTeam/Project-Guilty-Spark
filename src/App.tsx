import {cycleWorkArea,hasKeyboardDialog,navigateComposite} from './keyboardNavigation';
import { retainAssetSource } from './assetSources';
import {previewBudgets} from './resourceBudgets';
import {runtimeTextureSource,defaultPreviewMaterials} from './runtimeTexturePreview';
import {publishTextureResources,textureResourceScope} from './textureResourceScope';
import type { NativeAssetImport } from './types';
import type { ForgeMaterial } from './forge';
import { prepareAssetImport, attachAssetImport, prepareSoundImport } from './nativeAssetImport';
import LaunchProgress from './components/LaunchProgress';
import MegaWorldWizard from './components/MegaWorldWizard';
import {useWorkflowHistory} from './useWorkflowHistory';
import {captureWorkflowPlace,restoreWorkflowPlace} from './workflowPlace';
import {useWorkspaceWindows,wasLayoutWriter} from './useWorkspaceWindows';
import type {SavedWorkspaceLayout,SavedWorkspaceWindow} from './useWorkspaceWindows';
import OpenWork from './components/OpenWork';
import type {LearningSection,WorkflowRoute} from './workflowHistory';
import {librarySoundEmitters} from './viewportAssets';
import {projectMutationPending} from './projectMutation';
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
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
  Check,
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
  LibraryEntry,
  JobEvent,
  MapInspection,
  MeshData,
  OpenProject,
  ImportReport,
  Project,
  ProjectBuildHistory,
  RuntimeId,
  Settings,
  Workspace,
  Vec3,
} from './types';
import type {ViewportAsset} from './viewportAssets';
import {createEmitter,emptySoundScene} from './spatialAudio';
import { browserBootstrap, call, native } from './api';
import { applyInterfacePreferences, readInterfacePreferences, saveInterfacePreferences, INTERFACE_STORAGE_KEY } from './interfacePreferences';
import type { CueName, LocalCueReference } from './interfacePreferences';
import { UiCuePlayer } from './uiCuePlayer';
import { pinOwnedInterfaceBitmap, matchesOwnedInterfaceBitmap, decodeBoundedInterfaceBitmap } from './ownedInterfaceBitmap';
import type { OwnedBitmapPreview } from './ownedBitmapPreview';
import { initialHistory, thumbnail } from './editor';
import type {HistoryAction} from './editor';
import {activeDocument,documentReducer,emptyMapDocuments} from './mapDocuments';
import {applyLibraryReceipt,checkedSaveReceipt,applyBuildHistory} from './libraryReceipts';
import {createLatestRefresh} from './latestRefresh';
import {WindowHistories,queuedWindowRefresh} from './windowHistory';
import MapTabs from './components/MapTabs';
import RuntimeDock from './components/RuntimeDock';
import {EditorAudioProvider,EditorSoundControls} from './components/EditorAudio';
import ExternalMapSync from './components/ExternalMapSync';
import {hasSourceBoundEdits} from './externalMapSync';
import SettingsPanel from './components/SettingsPanel';
const StorageSettings=lazy(()=>import('./components/StorageSettings'));
const GamesTools = lazy(() => import('./components/GamesTools'));
import MapTools from './components/MapTools';
import WorkspaceSession from './components/WorkspaceSession';
import RetainedLevelView from './components/RetainedLevelView';
import type { MapDocument } from './mapDocuments';
import WorkspacePanels,{WorkspacePanel,closeOtherHeaderMenus,headerMenuKeyDown}from'./components/WorkspacePanels';
import NavigationSettings from'./components/NavigationSettings';
import {readMapSession,writeMapSession,useMapState,copyMapViewSession,configureMapViewWindow} from './mapSession';
import AssetTransfer,{transferTag} from './components/AssetTransfer';
import type {TransferSelection} from './components/AssetTransfer';
import {readHistoryLimit,saveHistoryLimit} from './historyPreferences';
import { firstVisitWorkspace, markFirstVisitSeen, WORKSPACE_TOOLTIPS } from './firstRun';
import {ResizeEdges} from './components/WindowFrame';
import SparkEmblem from './components/SparkEmblem';
import ShowcaseChoice from './components/ShowcaseChoice';
import {startLaunchVoice} from './launchVoice';
import HeaderRuntime from './components/HeaderRuntime';
import { Empty, IconButton, Pill, Toast, Notice } from './components/ui';
import Library from './components/Library';
import CommunityMaps from './components/CommunityMaps';
import type {MapDownloadAction} from './components/MapDownload';
import DependencyPanel from './components/DependencyPanel';
import WorkspaceFinder from './components/WorkspaceFinder';
import WorkbenchGuide from './components/WorkbenchGuide';
import LevelEditorWorkspace from './components/LevelEditorWorkspace';
import {workspaceCatalog as nav, mapWorkspaces, navGroups, finderItems, canonicalWorkspace, workspaceLabel} from './workspaceCatalog';
import { canDetachPanel, requestedPanel } from './detachedPanels';
import Tags from './components/Tags';
import Build from './components/Build';
const World = lazy(() => import('./components/World'));
const Assets = lazy(() => import('./components/Workspaces').then((m) => ({ default: m.Assets })));
const Preferences = lazy(() => import('./components/Workspaces').then((m) => ({ default: m.Preferences })));
const Preservation = lazy(() => import('./components/Workspaces').then((m) => ({ default: m.Preservation })));
const Scenario = lazy(() => import('./components/Workspaces').then((m) => ({ default: m.Scenario })));
const Compare = lazy(() => import('./components/Compare'));
const Runtimes = lazy(() => import('./components/Runtimes'));
const NewMapWizard = lazy(() => import('./components/QuickForge').then(module => ({default:module.NewMapWizard})));
const QuickForge = lazy(() => import('./components/QuickForge'));
const Firefight = lazy(() => import('./components/Firefight'));
const InterfaceStudio = lazy(() => import('./components/InterfaceStudio'));
const CreatorStudio = lazy(() => import('./components/CreatorStudio'));
const MachinimaWorkspace = lazy(() => import('./components/MachinimaWorkspace'));
const DockedDirector = lazy(() => import('./components/DirectorWindow'));
const LearningCenter = lazy(() => import('./components/LearningCenter'));
const GettingStarted = lazy(() => import('./components/GettingStarted'));
const Features = lazy(() => import('./components/Features'));
const CommunityThanks = lazy(() => import('./components/CommunityThanks'));
configureMapViewWindow(native?getCurrentWindow().label:null);
function requestedWorkspace():Workspace|null{const value=new URLSearchParams(location.search).get('workspace');if(value==='how-to'||value==='academy')return 'learning';return nav.some(item=>item.id===value)||value==='settings'||value==='preservation'?value as Workspace:null;}
function returnWorkspace():Workspace|null{const value=new URLSearchParams(location.search).get('returnWorkspace');return nav.some(item=>item.id===value)?value as Workspace:null;}
function initialLearningSection():LearningSection{const query=new URLSearchParams(location.search);if(query.get('workspace')==='academy'||query.has('lesson'))return 'academy';if(query.get('workspace')==='how-to')return 'guides';const saved=query.get('workspace')==='learning'?query.get('section')??readMapSession<string>('global','learning.section','guides'):readMapSession<string>('global','learning.section','guides');return saved==='academy'||saved==='glossary'?saved:'guides';}
function rememberedWorkspace(project:Project,inspection?:MapInspection|null):Workspace{const fallback:Workspace=project.quickForge?'quickforge':inspection?.header.scenarioType===2?'tags':'world';const stored=readMapSession<Workspace>(project.id,'workspace',fallback);return mapWorkspaces.includes(stored)?stored:fallback;}
export default function App() {
  const [data, setData] = useState<Bootstrap>(browserBootstrap);
  const [ready, setReady] = useState(!native);
  const [initialDocumentReady,setInitialDocumentReady]=useState(()=>!new URLSearchParams(location.search).has('project'));
  const [documents,dispatchDocument]=useReducer(documentReducer,readHistoryLimit(),emptyMapDocuments);
  const windowHistories=useRef(new WindowHistories());
  const closingDocuments=useRef(new Set<string>());
  const [windowWriters,setWindowWriters]=useState<Record<string,boolean>>({});
  const [windowHistoryErrors,setWindowHistoryErrors]=useState<Record<string,string>>({});
  const [closePrompt,setClosePrompt]=useState<string[]|null>(null);
  const closeChoice=useRef<((choice:'save'|'discard'|'cancel')=>void)|null>(null);
  const resolveClose=useCallback((choice:'save'|'discard'|'cancel')=>{const resolve=closeChoice.current;closeChoice.current=null;setClosePrompt(null);resolve?.(choice);},[]);
  const chooseClose=useCallback((projects:Project[]):Promise<'save'|'discard'|'cancel'>=>{
    if(!projects.length)return Promise.resolve('discard');
    if(closeChoice.current)return Promise.resolve('cancel');
    setHelp(false);setCreateModal(false);setShowFinder(false);
    setClosePrompt(projects.map(project=>project.title));return new Promise(resolve=>{closeChoice.current=resolve;});
  },[]);
  const windowWritersRef=useRef(windowWriters);windowWritersRef.current=windowWriters;
  const resourceIdentities=JSON.stringify(documents.documents.map(d=>[d.id,textureResourceScope(d.history.current?.source)]));
  useEffect(()=>{for(const doc of documents.documents){if(doc.history.current)publishTextureResources(doc.history.current);}},[resourceIdentities]);
  const activeMap=activeDocument(documents),history=activeMap?.history??{...initialHistory,limit:documents.limit};
  const dispatch=useCallback((action:HistoryAction)=>dispatchDocument({type:'history',action}),[]);
  useEffect(()=>saveHistoryLimit(history.limit),[history.limit]);
  const inspection=activeMap?.inspection??null,meshes=activeMap?.meshes??{};
  const visitedLevelViews=useRef(new Set<string>());
  const visitedWorkspaces=useRef(new Map<string,{workspace:Workspace;projectId:string|null}>());
  const visitedHome=useRef(false);
  const [workspace, setWorkspaceState] = useState<Workspace>(()=>requestedWorkspace()??firstVisitWorkspace());
  const [learningSection,setLearningSection]=useState<LearningSection>(initialLearningSection);
  useEffect(()=>writeMapSession('global','learning.section',learningSection),[learningSection]);
  const [sharedHistory,setSharedHistory]=useState<Record<string,{undo:boolean;redo:boolean}>>({});
  useEffect(()=>{const update=(event:Event)=>{const {projectId,view,paused}=(event as CustomEvent).detail??{};if(typeof projectId!=='string')return;setSharedHistory(old=>({...old,[projectId]:{undo:!paused&&!!view?.canUndo,redo:!paused&&!!view?.canRedo}}));};window.addEventListener('guilty-spark-studio-status',update);return()=>window.removeEventListener('guilty-spark-studio-status',update);},[]);
  // Menu visibility belongs to this WebView, never shared persisted preferences.
  const[sidebarOpen,setSidebarOpen]=useState(false);
  useLayoutEffect(()=>{if(sidebarOpen)(document.querySelector<HTMLElement>('#gs-workspace-navigation [aria-current="page"]')??document.querySelector<HTMLElement>('#gs-workspace-navigation .nav-item'))?.focus();},[sidebarOpen]);
  const toggleNavigation=()=>setSidebarOpen(open=>!open);
  useEffect(()=>{if(!sidebarOpen)return;const dismiss=(event:globalThis.PointerEvent)=>{if((event.target as HTMLElement).closest('#gs-workspace-navigation,.gs-navigation-toggle'))return;setSidebarOpen(false);};document.addEventListener('pointerdown',dismiss,true);return()=>document.removeEventListener('pointerdown',dismiss,true);},[sidebarOpen,setSidebarOpen]);
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&sidebarOpen&&!document.querySelector('[role="dialog"]')){event.preventDefault();event.stopImmediatePropagation();setSidebarOpen(false);document.querySelector<HTMLButtonElement>('.gs-navigation-toggle')?.focus();}else if((event.ctrlKey||event.metaKey)&&event.code==='Backslash'&&!event.altKey&&!event.shiftKey){event.preventDefault();event.stopImmediatePropagation();setSidebarOpen(open=>!open);}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[sidebarOpen,setSidebarOpen]);
  const [settingsTab,setSettingsTabState]=useState<WorkflowRoute['settingsTab']>(()=>{const section=new URLSearchParams(location.search).get('section');return section==='dependencies'||section==='interface'||section==='storage'?section:'tools';});
  const workspaceRef=useRef(workspace),workspaceNavigation=useRef(0);
  workspaceRef.current=workspace;
  const setWorkspace=useCallback((next:Workspace)=>{workspaceNavigation.current++;if(next==='how-to'||next==='academy'){setLearningSection(next==='academy'?'academy':'guides');next='learning';}if(next===workspaceRef.current)return;window.dispatchEvent(new Event('gs:save-viewport-context'));workspaceRef.current=next;setWorkspaceState(next);},[]);
  const setSettingsTab=useCallback((next:WorkflowRoute['settingsTab'])=>setSettingsTabState(next),[]);
  const bootRouteHandled=useRef(false);
  useEffect(()=>{if(!ready||bootRouteHandled.current)return;bootRouteHandled.current=true;if(data.settings.onboardingCompleted){markFirstVisitSeen();if(workspace==='get-started'&&!requestedWorkspace())setWorkspace('library');}},[ready,data.settings.onboardingCompleted]);
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
  useEffect(()=>{const changed=(event:StorageEvent)=>{if(event.key===INTERFACE_STORAGE_KEY)setInterfacePreferences(readInterfacePreferences());};window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed);},[]);
  useEffect(() => () => { audioPlayer.current?.dispose(); audioPlayer.current = null; }, []);
  useEffect(()=>{if(!native||!ready)return;const timer=setTimeout(()=>{void startLaunchVoice(data,()=>interfacePreferencesRef.current);},300);return()=>clearTimeout(timer);},[ready,data.dataDirectory]);
  useEffect(()=>{if(native&&(!interfacePreferences.launchVoiceEnabled||interfacePreferences.launchVoiceVolume<=0))void call('stop_launch_voice').catch(()=>{});},[interfacePreferences.launchVoiceEnabled,interfacePreferences.launchVoiceVolume]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: string } | null>(null);
  const [logs, setLogs] = useState<JobEvent[]>([]);
  const [activeJob, setActiveJob] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [createModal, setCreateModal] = useState<boolean | 'multiplayer' | 'megaworld'>(false);
  const [studioGuide,setStudioGuide]=useState(false);
  const returnPanelRequested=useRef(false);
  useEffect(()=>{
    if(!native)return;
    const returning=()=>{returnPanelRequested.current=true;void getCurrentWindow().close().catch(error=>{returnPanelRequested.current=false;notice(String(error),'error');});};
    window.addEventListener('gs:return-panel-to-origin',returning);
    return()=>window.removeEventListener('gs:return-panel-to-origin',returning);
  },[]);
  const [newTitle, setNewTitle] = useState('Untitled workshop');
  const [dragging, setDragging] = useState(false);
  const [help, setHelp] = useState(false);
  const [showFinder, setShowFinder] = useState(false);
  useEffect(()=>{if(native)document.documentElement.dataset.gsNativeFrame='true';},[]);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const libraryRefresh = useRef<ReturnType<typeof createLatestRefresh<void,Bootstrap>> | null>(null);
  const current = history.current;
  const unsaved=history.dirty||!!data.entries.find(entry=>entry.id===current?.id)?.sessionOnly;
  const warnedUnsaved=useRef(new Set<string>());
  useEffect(()=>{
    if(!native||!ready||current||!data.installation.mccPath)return;
    const timer=setTimeout(()=>{void import('./homeShowcase').then(module=>module.preloadHomeModels(data)).catch(()=>{/* Optional showcase never blocks workbench startup. */});},250);
    return()=>clearTimeout(timer);
  },[ready,!!current,data.dataDirectory,data.installation.mccPath]);
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
  function selectSettingsTab(tab:WorkflowRoute['settingsTab']){setSettingsTab(tab);setWorkspace('settings');}
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
     textureResourceScope(current?.source)]);
  const historyRef = useRef(history);
  historyRef.current = history;
  const documentsRef=useRef(documents);
  documentsRef.current=documents;
  const workflow=useWorkflowHistory({workspace,projectId:activeMap?.id??null,settingsTab,learningSection},mapWorkspaces,route=>{
    const target=documentsRef.current.documents.find(d=>d.id===route.projectId)?.history.current;
    if(mapWorkspaces.includes(route.workspace)&&!restoreWorkflowPlace(route,target)){notice('This place belongs to an older source revision. The current map stays open.','warning');return;}
    if(route.projectId&&documentsRef.current.documents.some(d=>d.id===route.projectId))dispatchDocument({type:'select',id:route.projectId});
    setSettingsTabState(route.settingsTab);if(route.learningSection)setLearningSection(route.learningSection);workspaceNavigation.current++;workspaceRef.current=route.workspace;setWorkspaceState(route.workspace);
  },route=>!mapWorkspaces.includes(route.workspace)||(route.projectId?documentsRef.current.documents.some(d=>d.id===route.projectId):!documentsRef.current.activeId),route=>mapWorkspaces.includes(route.workspace)?captureWorkflowPlace(route,documentsRef.current.documents.find(d=>d.id===route.projectId)?.history.current):route);
  const workspaceWindows=useWorkspaceWindows({workspace,project:activeMap?.id??null,section:workspace==='learning'?learningSection:workspace==='settings'?settingsTab:null,dirty:history.dirty,documents:documents.documents.map(d=>d.id)},ready&&initialDocumentReady,()=>documentsRef.current.documents.flatMap(document=>{
    const project=document.history.current;if(!project)return [];
    const place=captureWorkflowPlace({workspace:workspaceRef.current,projectId:project.id,settingsTab},project).place;
    return place?[{project:project.id,...place}]:[];
  }));
  function routeTitle(route:WorkflowRoute|null,direction:'Back'|'Forward'){
    if(!route)return direction==='Back'?'No previous workspace':'No next workspace';
    const label=route.workspace==='learning'?`Learning center · ${route.learningSection??'guides'}`:nav.find(item=>item.id===route.workspace)?.label??(route.workspace==='settings'?(route.settingsTab==='dependencies'?'Dependencies & setup':'Games & tools'):route.workspace);
    const map=documents.documents.find(d=>d.id===route.projectId)?.history.current?.title;
    return direction+' to '+label+(map?' · '+map:'')+' (Alt+'+(direction==='Back'?'Left':'Right')+')';
  }

  const applyHistory=useCallback((type:'undo'|'redo')=>{
    const active=document.activeElement;
    const targetId=active instanceof HTMLElement?active.closest<HTMLElement>('[data-history-project]')?.dataset.historyProject??documentsRef.current.activeId:documentsRef.current.activeId;
    if(targetId&&projectMutationPending(targetId))return;
    const apply=()=>{if(!targetId||projectMutationPending(targetId))return;const h=documentsRef.current.documents.find(d=>d.id===targetId)?.history;const candidate=type==='undo'?h?.past.at(-1):h?.future[0];const localOnly=(p:Project)=>JSON.stringify({...p,quickForge:null,modifiedAt:'',history:[],builds:[]});const hasUnsharedChange=!!candidate&&!!h?.current&&localOnly(candidate)!==localOnly(h.current);if(!hasUnsharedChange&&!window.dispatchEvent(new CustomEvent('guilty-spark-studio-undo',{cancelable:true,detail:{projectId:targetId,redo:type==='redo'}})))return;
      // A following Ctrl+S can run in this same animation frame. Publish the
      // history revision before its save callback captures a project snapshot.
      flushSync(()=>dispatchDocument({type:'history',id:targetId,action:{type}}));};
    if(native&&targetId&&!windowHistories.current.writable(targetId))return;
    if(active instanceof HTMLInputElement&&['number','range'].includes(active.type)){
      active.blur();requestAnimationFrame(apply);
    }else apply();
  },[]);
  const notice = useCallback((message: string, tone = 'info') => {
    setToast({ message, tone });
    if (tone === 'success') playInterfaceCue('confirm');
    else if (tone === 'error') playInterfaceCue('warning');
  }, [playInterfaceCue]);
  useEffect(()=>{
    if(!native)return;
    for(const doc of documents.documents){if(windowWriters[doc.id]===true&&!closingDocuments.current.has(doc.id))void windowHistories.current.persist(doc.id,doc.history).catch(e=>{setWindowHistoryErrors(old=>({...old,[doc.id]:String(e)}));notice(`Window history: ${String(e)}`,'error');});}
  },[documents,windowWriters,notice]);
  useEffect(()=>{
    if(!native)return;
    let alive=true;
    const queue=queuedWindowRefresh(async id=>{
      if(closingDocuments.current.has(id))return;
      const {status,history}=await windowHistories.current.attach(id);if(!alive||closingDocuments.current.has(id)||!documentsRef.current.documents.some(d=>d.id===id))return;
      setWindowWriters(old=>({...old,[id]:status.writable}));
      if(history)dispatchDocument({type:'window-history',id,history});
    },e=>notice(`Window synchronization: ${String(e)}`,'error'));
    const stop=listen<{projectId:string;revision?:number;owner?:string}>('spark:window-history',({payload})=>{
      if(closingDocuments.current.has(payload.projectId)||!documentsRef.current.documents.some(d=>d.id===payload.projectId))return;
      // Save also emits a clean-head notification without a new revision. Its
      // own writer already applies that receipt; rereading it can race the next
      // edit and replace it with the preceding saved snapshot. An ownership
      // return still needs a read when this window was an observer.
      if(payload.owner===getCurrentWindow().label&&windowWritersRef.current[payload.projectId]===true)return;
      if(payload.revision&&payload.revision<=windowHistories.current.revision(payload.projectId))return;
      // Acknowledge callbacks can race this notification; serialize the read
      // behind local pending commits, never replace an unacknowledged draft.
      queue.request(payload.projectId);
    });return()=>{alive=false;queue.dispose();void stop.then(stop=>stop());};
  },[notice]);
  useEffect(() => {
    if (!native) return;
    const queue=createLatestRefresh<void,Bootstrap>(()=>call<Bootstrap>('bootstrap'),next=>{
      setData(next);
      setEpoch(v=>v+1);
    });
    libraryRefresh.current=queue;
    return()=>{queue.dispose();if(libraryRefresh.current===queue)libraryRefresh.current=null;};
  },[]);
  const refresh = useCallback(async () => {
    if (!native) return;
    return libraryRefresh.current?.request();
  }, []);
  const action = useCallback(
    async (f: () => Promise<unknown>, success?: string) => {
      try {
        const result = await f();
        if (success && result !== null) notice(success, 'success');
        else if (typeof result === 'string') notice(result, 'info');
        await refresh();
      } catch (e) {
        notice(String(e),'error');
      }
    },
    [notice, refresh],
  );
  const save = useCallback(
    (announce = false,id?:string,forceStage=false): Promise<void> => {
      const p = id?documentsRef.current.documents.find(d=>d.id===id)?.history.current:historyRef.current.current;
      if (!p) return Promise.resolve();
      if(!announce&&!forceStage&&closingDocuments.current.has(p.id))return Promise.resolve();
      const operation = saveQueue.current.then(async () => {
        try {
          if(native){if(windowWritersRef.current[p.id]===false)return;const h=documentsRef.current.documents.find(d=>d.id===p.id)?.history;if(h?.current===p)await windowHistories.current.persist(p.id,h);await windowHistories.current.flush(p.id);}
          const entry=checkedSaveReceipt(p,await call<LibraryEntry>(announce||!native?'save_project':'update_project', { project: p }));
          setData(data=>applyLibraryReceipt(data,entry));
          void libraryRefresh.current?.invalidateActive()?.catch(error=>notice(String(error),'error'));
          if(announce)dispatchDocument({type:'saved',id:p.id,project:p});
          if (announce) notice('Project saved. Your original map is unchanged.', 'success');
        } catch (e) {
          notice(String(e), 'error');
          throw e;
        }
      });
      saveQueue.current = operation.catch(() => {});
      return operation;
    },
    [notice],
  );
  useEffect(()=>{
    if(!native)return;
    const timer=window.setInterval(()=>{
      const id=historyRef.current.current?.id;if(!id||closingDocuments.current.has(id))return;
      const project=historyRef.current.current;
      if(!project||(project.automaticBackupRetention??data.settings.snapshotRetention??0)===0)return;
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
        if(busy){event.preventDefault();return;}
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
  }, [help, createModal, busy]);
  useEffect(() => {
    if (!native) return;
    const unlisten = getCurrentWindow().onCloseRequested(async (event) => {
      event.preventDefault();
      if (closingRef.current) return;
      closingRef.current = true;
      // Commit a focused numeric draft before collecting the final project snapshot.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      try {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const dirty=documentsRef.current.documents.filter(doc=>doc.history.dirty&&windowHistories.current.writable(doc.id));
        for(const doc of dirty)closingDocuments.current.add(doc.id);
        const choice=returnPanelRequested.current?'discard':await chooseClose(dirty.flatMap(doc=>doc.history.current?[doc.history.current]:[]));
        if(choice==='cancel'){for(const doc of dirty)closingDocuments.current.delete(doc.id);closingRef.current=false;return;}
        setClosing(true);
        for(const doc of dirty){
          if(choice==='save')await save(true,doc.id);
          else if(!returnPanelRequested.current){closingDocuments.current.add(doc.id);await windowHistories.current.flush(doc.id);await call('discard_project_changes',{id:doc.id});windowHistories.current.block(doc.id);}
        }
        if(returnPanelRequested.current)for(const doc of dirty)await save(false,doc.id,true);
        await windowHistories.current.flush();
        const query=new URLSearchParams(location.search),original=query.get('project');
        if(original&&documentsRef.current.documents.some(d=>d.id===original)&&windowHistories.current.writable(original))
          await call('return_project_to_main',{id:original,workspace:returnWorkspace()??requestedWorkspace()??'world',panel:query.get('panel'),allowMissingMain:!returnPanelRequested.current,activate:returnPanelRequested.current});
        if(!original&&requestedPanel())await call('return_workspace_panel',{allowMissingOrigin:true});
        await call('close_application');
      } catch (error) {
        returnPanelRequested.current=false;
        closingRef.current = false;
        setClosing(false);
        closingDocuments.current.clear();
        notice(
          `The project could not be saved before closing. The window remains open. ${String(error)}`,
          'error',
        );
      }
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [notice, save, chooseClose]);
  const load = useCallback(
    async (open: OpenProject,writer?:boolean,activate=true) => {
      const observe=writer===undefined?new URLSearchParams(location.search).get('observe')==='1':!writer;
      if(native&&!observe)await call('claim_project_document',{id:open.project.id});
      const attached=native?await windowHistories.current.attach(open.project.id):null;
      dispatchDocument({type:'open',open,activate});
      if(attached){setWindowWriters(old=>({...old,[open.project.id]:attached.status.writable}));if(attached.history)dispatchDocument({type:'window-history',id:open.project.id,history:attached.history});}
      if(native&&(!attached||attached.status.writable)&&open.project.source){const version=open.project.source.cacheVersion;
        const command=[6,7,609].includes(version)?'auto_connect_classic_textures':version===13&&(!open.project.source.resourceSha256?.['mcc-textures']||!open.project.source.resourceSha256?.['mcc-shared-bitmaps.map'])?'connect_mcc_texture_resources':null;
        if(command)void call<OpenProject|null>(command,{projectId:open.project.id}).then(result=>{if(result)dispatchDocument({type:'resources',project:result.project,inspection:result.inspection});}).catch(e=>{if(version===13)notice('MCC texture resources: '+String(e),'error');});
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
  const applyResourceMetadata=useCallback(async(open:OpenProject)=>{const existing=documentsRef.current.documents.find(d=>d.id===open.project.id);if(existing)dispatchDocument({type:'resources',project:open.project,inspection:open.inspection});else await load(open);},[load]);
  useEffect(()=>{const opened=(event:Event)=>{const result=(event as CustomEvent<OpenProject>).detail;if(!result?.project?.id)return;void (async()=>{try{await save();await load(result);writeMapSession(result.project.id,'bsp.open',true);setWorkspace('world');await refresh();}catch(e){notice(String(e),'error');}})();};window.addEventListener('gs:atlas-open',opened);return()=>window.removeEventListener('gs:atlas-open',opened);},[load,save,refresh,notice,setWorkspace]);
  const applyDependencyChoice=useCallback((open:OpenProject)=>{
    const existing=documentsRef.current.documents.find(d=>d.id===open.project.id);
    if(!existing)return;
    dispatchDocument({type:'history',id:open.project.id,action:{type:'edit',project:open.project,description:'Update map dependency setup'}});
    if(open.inspection)dispatchDocument({type:'resources',project:open.project,inspection:open.inspection});
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
      await call('update_project',{project:{...opened.project,buildTargets:prior.buildTargets,activeBuildTarget:prior.activeBuildTarget}});
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
    refresh()
      .then((d) => {
        if (alive && d) {
          setLogs(d.logs);
          setReady(true);
        }
      })
      .catch((e) => {
        if(alive){notice(String(e),'error');setReady(true);}
      });
    return () => {
      alive = false;
    };
  }, [notice,refresh]);
  const initialWindowProject=useRef(false);
  useEffect(()=>{
    if(!native||!ready)return;
    let alive=true;
    const pending=listen<{id:string;workspace:Workspace|null;panel?:string|null;activate?:boolean}>('spark:reattach-project',({payload})=>{
      if(!/^[0-9a-f-]{36}$/i.test(payload.id))return;
      void call<OpenProject>('open_project',{id:payload.id}).then(async opened=>{
        if(!alive)return;
        // An ordinary close returns ownership/content in the background. Never
        // restore a captured active tab after async reads: the user may already
        // have chosen a different map or workspace while the handoff settled.
        await load(opened,undefined,payload.activate!==false);
        if(alive&&payload.activate!==false){setWorkspace(payload.workspace??rememberedWorkspace(opened.project,opened.inspection));
          if(payload.panel)requestAnimationFrame(()=>window.dispatchEvent(new CustomEvent('guilty-spark-reveal-drawer',{detail:{id:payload.panel}})));}
      }).catch(error=>notice(`Returned map remains saved in your library: ${String(error)}`,'error'));
    });
    return()=>{alive=false;void pending.then(stop=>stop());};
  },[ready,load,notice,setWorkspace]);
  useEffect(()=>{
    if(!native||!ready)return;
    const pending=listen<{workspace:Workspace;panel:string|null}>('spark:reattach-panel',({payload})=>{
      if(!nav.some(item=>item.id===payload.workspace))return;
      setWorkspace(payload.workspace);
      if(payload.panel)requestAnimationFrame(()=>window.dispatchEvent(new CustomEvent('guilty-spark-reveal-drawer',{detail:{id:payload.panel}})));
    });
    const recover=()=>void call('recover_workspace_window').catch(error=>notice(`Window placement: ${String(error)}`,'error'));
    window.addEventListener('focus',recover);
    return()=>{window.removeEventListener('focus',recover);void pending.then(stop=>stop());};
  },[ready,notice,setWorkspace]);
  useEffect(()=>{const query=new URLSearchParams(location.search),id=query.get('project');if(!native||!ready||!id||initialWindowProject.current)return;initialWindowProject.current=true;if(!/^[0-9a-f-]{36}$/i.test(id)){notice('Invalid map window identity.','error');return;}void call<OpenProject>('open_project',{id}).then(async open=>{await load(open);const tag=Number(query.get('tag'));if(query.get('panel')==='object-tags'&&query.has('tag')&&open.inspection?.tags.some(t=>t.id===tag))writeMapSession(open.project.id,'tags.focus',tag);setWorkspace(requestedWorkspace()??rememberedWorkspace(open.project,open.inspection));}).catch(e=>notice(String(e),'error')).finally(()=>setInitialDocumentReady(true));},[ready,load,notice]);
  useEffect(() => {
    if (!native) return;
    let alive=true;
    const failed=(error:unknown)=>{if(alive)notice(String(error),'error');};
    const builds=createLatestRefresh<string,ProjectBuildHistory>(id=>call<ProjectBuildHistory>('project_build_history',{id}),receipt=>{
      const current=historyRef.current.current;
      if(current?.id===receipt.projectId)dispatch({type:'builds',project:applyBuildHistory(current,receipt)});
    });
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
      listen<{projectId:string;saved:boolean}>('spark:document-discarded',({payload})=>{
        if(closingDocuments.current.has(payload.projectId))return;
        if(!payload.saved){windowHistories.current.forgetDiscarded(payload.projectId);dispatchDocument({type:'close',id:payload.projectId});}
        else void windowHistories.current.attach(payload.projectId).then(next=>{setWindowWriters(old=>({...old,[payload.projectId]:next.status.writable}));if(next.history)dispatchDocument({type:'window-history',id:payload.projectId,history:next.history});}).catch(failed);
        void refresh().catch(failed);
      }),
    );
    unsubs.push(listen('spark:runtime-connections-changed',()=>window.dispatchEvent(new Event('guilty-spark-runtime-connections-changed'))));
    unsubs.push(
      listen('spark:library-changed', () => {
        void refresh().catch(failed);
        const p = historyRef.current.current;
        if (p) void builds.request(p.id).catch(failed);
      }),
    );
    unsubs.push(
      listen<string>('spark:imported', ({ payload }) => {
        notice(
          'Inbox map imported. Open it from your library to inspect the compatibility report.',
          'success',
        );
        void refresh().catch(failed);
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
      alive=false;
      builds.dispose();
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
  useEffect(()=>{
    const needsFirstSave=data.entries.some(entry=>entry.id===current?.id&&entry.sessionOnly);
    if(!data.memoryFirst||!current||!history.dirty||(!needsFirstSave&&(current.automaticBackupRetention??data.settings.snapshotRetention??0)>0)||warnedUnsaved.current.has(current.id))return;
    warnedUnsaved.current.add(current.id);
    notice(needsFirstSave?'This new map stays in memory until its first Save. Save once to make it recoverable after a crash or exit.':'Edits stay in memory until you choose Save. Automatic recovery is off; a crash or exit loses unsaved work.','info');
  },[data.memoryFirst,data.entries,data.settings.snapshotRetention,current?.id,current?.automaticBackupRetention,history.dirty,notice]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if(e.defaultPrevented||e.isComposing)return;
      if(e.key==='F6'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
        e.preventDefault();if(!hasKeyboardDialog())cycleWorkArea(e.shiftKey);return;
      }
      if(e.key==='F1'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey){
        e.preventDefault();if(!hasKeyboardDialog())setHelp(true);return;
      }
      if((e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==='w'){
        e.preventDefault();if(!hasKeyboardDialog()&&!busy&&!closingRef.current&&documentsRef.current.activeId)void closeMap(documentsRef.current.activeId);return;
      }
      if(e.ctrlKey&&e.altKey&&e.key.toLowerCase()==='o'){e.preventDefault();setInterfacePreferences(p=>({...p,windowOpacity:1,windowTintStrength:0}));return;}
      if (closingRef.current&&!closeChoice.current) {
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
          // A donor tag drawer can belong to a different map than the viewport.
          // Capture that identity before committing its focused numeric draft.
          const field=document.activeElement instanceof HTMLElement?document.activeElement:null;
          const id=(e.target instanceof HTMLElement?e.target.closest<HTMLElement>('[data-history-project]')?.dataset.historyProject:undefined)??documentsRef.current.activeId;
          if(!id)return;
          field?.blur();
          requestAnimationFrame(()=>{
            void save(true,id).catch(() => {});
            if(field?.isConnected&&document.activeElement===document.body)field.focus();
          });
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
  }, [save,help,createModal,applyHistory,busy]);
  function edit(project: Project, description: string) {
    if(native&&!windowHistories.current.writable(project.id)){notice('This view follows the editing window. Choose Edit here in Changes to take over safely.');return;}
    dispatchDocument({type:'history',id:project.id,action:{type:'edit',project,description}});
  }
  function materialDefaults(projectId:string,materials:ForgeMaterial[]){
    if(native&&!windowHistories.current.writable(projectId))return;
    dispatchDocument({type:'history',id:projectId,action:{type:'forge-defaults',projectId,materials}});
  }
  async function importFiles(paths?: string[], destination?: 'build') {
    setBusy(true);
    try {
      if (historyRef.current.dirty) await save();
      const result = await call<ImportReport | OpenProject[]>(
        paths ? 'import_paths' : 'import_dialog',
        paths ? { paths, includeReport: true } : { includeReport: true },
      );
      // Arrays remain valid for existing/offline integrations. The native
      // studio receives both outcomes without losing successful documents.
      const { projects: imported, failures } = Array.isArray(result) ? { projects: result, failures: [] } : result;
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
      if (failures.length) {
        notice(`${imported.length ? `${imported.length} project${imported.length === 1 ? '' : 's'} opened. ` : ''}${failures.length} file${failures.length === 1 ? '' : 's'} could not be opened.\n${failures.map(failure => `${failure.path.split(/[\\/]/).pop()}: ${failure.message}`).join('\n')}`, 'error');
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
    const requestedNavigation=workspaceNavigation.current;
    const existing=documentsRef.current.documents.find(d=>d.id===id);if(existing){dispatchDocument({type:'select',id});setWorkspace(stayInWorkspace??rememberedWorkspace(existing.history.current!,existing.inspection));return;}
    setBusy(true);
    try {
      if (historyRef.current.dirty) await save();
      const open = await call<OpenProject>('open_project', { id });
      await load(open);
      // Compare navigation intent, including leaving and returning to the same route.
      if(workspaceNavigation.current===requestedNavigation)setWorkspace(stayInWorkspace ?? rememberedWorkspace(open.project,open.inspection));
    } catch (e) {
      notice(String(e), 'error');
    } finally {
      setBusy(false);
    }
  }
  async function openStudioProject(id:string) {
    writeMapSession(id,'studio.openRequest',true);
    await openProject(id,'quickforge');
    // A retained editor is already mounted, so its initial saved-request effect
    // will not run again. Use the same reveal event as the header indicator.
    requestAnimationFrame(()=>window.dispatchEvent(new CustomEvent('guilty-spark-live-studio-open',{detail:{projectId:id}})));
  }
  function selectMap(id:string){if(document.activeElement instanceof HTMLElement)document.activeElement.blur();requestAnimationFrame(()=>{window.dispatchEvent(new Event('gs:save-viewport-context'));const map=documentsRef.current.documents.find(d=>d.id===id);dispatchDocument({type:'select',id});if(map?.history.current)setWorkspace(rememberedWorkspace(map.history.current,map.inspection));});}
  async function flushWindowHandoff(id:string){
    if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
    await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));await save(false,id,true);
    await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    const latest=documentsRef.current.documents.find(d=>d.id===id);
    if(latest&&native&&windowHistories.current.writable(id))await windowHistories.current.persist(id,latest.history);
    await windowHistories.current.flush(id);window.dispatchEvent(new Event('gs:save-viewport-context'));
  }
  async function detachTagPanel(id:string,tagId:number):Promise<boolean>{
    if(!native||busy||activeJob||closingDocuments.current.has(id))return false;
    if(!documentsRef.current.documents.some(d=>d.id===id)||!windowHistories.current.writable(id)){notice('Open this source map for editing before detaching its tags.');return false;}
    closingDocuments.current.add(id);setBusy(true);
    try{
      await flushWindowHandoff(id);
      await call('open_project_window',{id,workspace:'tags',panel:'object-tags',focusTag:tagId,originWorkspace:workspaceRef.current});
      const attached=await windowHistories.current.attach(id);setWindowWriters(old=>({...old,[id]:attached.status.writable}));
      if(attached.history)dispatchDocument({type:'window-history',id,history:attached.history});
      return true;
    }catch(error){notice(String(error),'error');return false;}
    finally{closingDocuments.current.delete(id);setBusy(false);}
  }
  async function detachWorkspacePanel(panel:string):Promise<boolean>{
    if(!native||busy||activeJob||!canDetachPanel(workspaceRef.current,panel,!!current))return false;
    const id=current?.id;
    if(id&&(!windowHistories.current.writable(id)||closingDocuments.current.has(id))){notice('Choose Edit here in Changes before moving this editing panel.');return false;}
    if(id)closingDocuments.current.add(id);setBusy(true);
    try{
      if(id){
        await flushWindowHandoff(id);
        await call('open_project_window',{id,workspace:workspaceRef.current,originWorkspace:workspaceRef.current,panel});
        const attached=await windowHistories.current.attach(id);setWindowWriters(old=>({...old,[id]:attached.status.writable}));
        if(attached.history)dispatchDocument({type:'window-history',id,history:attached.history});
      }else await call('open_workspace_window',{workspace:workspaceRef.current,panel});
      return true;
    }catch(error){notice(String(error),'error');return false;}
    finally{if(id)closingDocuments.current.delete(id);setBusy(false);}
  }
  async function closeMap(id:string,separateWindow:boolean|'main'=false,another=false){
    if(closingDocuments.current.has(id))return false;
    const handoffWorkspace=separateWindow==='main'?returnWorkspace()??workspaceRef.current:workspaceRef.current,
      handoffSection=handoffWorkspace==='settings'?settingsTab:handoffWorkspace==='learning'?learningSection:null;
    // Stop background journal writes before transferring the native writer
    // lease. Saving the focused edit below is the final acknowledged write.
    closingDocuments.current.add(id);
    if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
    setBusy(true);try{
      await flushWindowHandoff(id);
      const document=documentsRef.current.documents.find(doc=>doc.id===id);
      if(!separateWindow&&document?.history.dirty&&windowHistories.current.writable(id)){
        const choice=await chooseClose(document.history.current?[document.history.current]:[]);
        if(choice==='cancel')return false;
        if(choice==='save')await save(true,id);
        else if(native){await call('discard_project_changes',{id});windowHistories.current.block(id);}
      }
      if(separateWindow){if(!native)throw new Error('Separate editor windows require the desktop application.');await call(separateWindow==='main'?'return_project_to_main':'open_project_window',{id,workspace:handoffWorkspace,...(handoffSection&&separateWindow!=='main'?{section:handoffSection}:{}),...(another?{another:true}:{}),...(separateWindow==='main'?{panel:new URLSearchParams(location.search).get('panel')}:{} )});}else if(native)await call('release_project_document',{id});await windowHistories.current.release(id);const state=documentsRef.current;if(state.activeId===id){const index=state.documents.findIndex(d=>d.id===id),remaining=state.documents.filter(d=>d.id!==id),next=remaining[Math.min(index,remaining.length-1)];setWorkspace(next?.history.current?rememberedWorkspace(next.history.current):'library');}dispatchDocument({type:'close',id});return true;
    }catch(e){notice(String(e),'error');return false;}finally{closingDocuments.current.delete(id);setBusy(false);}
  }
  async function popoutWorkspace(){if(!native){notice('Workspace windows require the desktop application.');return;}if(current&&mapWorkspaces.includes(workspaceRef.current)){if(busy||activeJob){notice('Finish the current map operation before moving its workspace to another window.');return;}await closeMap(current.id,true);return;}try{const section=workspaceRef.current==='learning'?learningSection:workspaceRef.current==='settings'?settingsTab:null;await call('open_workspace_window',{workspace:workspaceRef.current,section,context:section==='academy'?readMapSession<string>('global','learning.lesson','preservation'):null});notice('Workspace opened in a resizable window. Drag it to another monitor.','success');}catch(e){notice(String(e),'error');}}
  async function openWorkspaceView(target:Workspace,another=false){
    if(!native){notice('Workspace windows require the desktop application.');return;}
    try{
      if(current&&mapWorkspaces.includes(target)){
        if(busy){notice('Finish the current map operation before opening another view.');return;}
        if(windowHistories.current.writable(current.id))await flushWindowHandoff(current.id);
        await call('open_project_window',{id:current.id,workspace:target,observe:true,another});
      }else await call('open_workspace_window',{workspace:target,section:target==='learning'?learningSection:target==='settings'?settingsTab:null,another});
      await workspaceWindows.refresh();
    }catch(e){notice(String(e),'error');}
  }
  async function returnToPlace(route:WorkflowRoute){
    if(mapWorkspaces.includes(route.workspace)&&route.projectId&&!documentsRef.current.documents.some(d=>d.id===route.projectId)){
      await openProject(route.projectId,route.workspace);await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    }
    workflow.restore(route);
  }
  const layoutOperation=useRef(false),startupLayout=useRef(false);
  const [desktopOrb]=useMapState('global','workspace.desktopOrb',false);
  useEffect(()=>{
    if(!native||!ready||getCurrentWindow().label!=='main')return;
    void call('show_spark_companion',{visible:desktopOrb===true}).catch(e=>notice(String(e),'error'));
  },[ready,desktopOrb]);
  useEffect(()=>{
    if(!native)return;const subscription=listen('spark:command-hub',()=>window.dispatchEvent(new CustomEvent('gs:open-work',{detail:{open:true}})));
    return()=>{void subscription.then(unlisten=>unlisten());};
  },[]);
  const [layoutName,setLayoutName]=useMapState('global','workspace.layoutName','Studio');
  const [layoutNames,setLayoutNames]=useState<string[]>([]);
  const listWorkspaceLayouts=()=>{if(native)void call<string[]>('workspace_layout_names').then(setLayoutNames).catch(e=>notice(String(e),'error'));};
  async function saveWorkspaceLayout(){
    if(!native||layoutOperation.current)return;layoutOperation.current=true;
    try{await windowHistories.current.flush();await workspaceWindows.capture();const layout=await call<SavedWorkspaceLayout>('save_workspace_layout',{name:layoutName});listWorkspaceLayouts();notice(`Saved “${layoutName.trim()}” · ${layout.windows.length} workspace window${layout.windows.length===1?'':'s'}. Source changes keep their own recovery history.`,'success');}
    catch(e){notice(String(e),'error');}finally{layoutOperation.current=false;}
  }
  async function restoreWindowView(row:SavedWorkspaceWindow){
    const failures:string[]=[];
    const restoredIds:string[]=[];
    const ids=[...new Set([...row.view.documents,...(row.view.project?[row.view.project]:[])])];
    for(const id of ids){
      try{
        const existing=documentsRef.current.documents.find(d=>d.id===id)?.history.current;
        const open=existing?null:await call<OpenProject>('open_project',{id});
        const project=existing??open!.project,place=row.view.places?.find(p=>p.project===id);
        const expected=place?place.sourceSha256:(id===row.view.project?row.sourceSha256:undefined);
        if(expected!==undefined&&(project.source?.sha256??null)!==expected)throw Error('Its source revision changed; saved view was not applied');
        if(open){
          const wantsWriter=wasLayoutWriter(row,id);
          try{await load(open,wantsWriter);}catch(reason){
            const owner=await call<import('./windowHistory').WindowHistoryStatus>('read_workspace_history',{projectId:id});
            if(!wantsWriter||!owner.owner||owner.owner===workspaceWindows.label)throw reason;
            await load(open,false);failures.push(`Map ${id}: another open window keeps its editing ownership; restored as a view`);
          }
        }
        if(place)restoreWorkflowPlace({workspace:row.view.workspace,projectId:id,settingsTab,place},project);
        restoredIds.push(id);
      }catch(reason){failures.push(`Map ${id}: ${String(reason)}`);}
    }
    await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    // Loads dispatch asynchronously. Keep every successfully loaded ID even if
    // React has not committed the last document ref when this frame runs.
    const order=[...restoredIds,...documentsRef.current.documents.map(d=>d.id).filter(id=>!restoredIds.includes(id))];
    dispatchDocument({type:'reorder',ids:order});
    if(row.view.project&&restoredIds.includes(row.view.project))dispatchDocument({type:'select',id:row.view.project});
    if(row.view.section&&row.view.workspace==='settings')setSettingsTabState(row.view.section as WorkflowRoute['settingsTab']);
    if(row.view.section&&row.view.workspace==='learning')setLearningSection(row.view.section as LearningSection);
    setWorkspace(row.view.workspace);
    await call('update_workspace_view',{view:{...row.view,documents:order,places:[]}});
    return failures;
  }
  async function restoreWorkspaceLayout(){
    if(!native||layoutOperation.current||busy)return;layoutOperation.current=true;setBusy(true);
    const failures:string[]=[];
    try{
      const name=layoutName;const layout=await call<SavedWorkspaceLayout>('read_workspace_layout',{name});await save();
      const main=layout.windows.find(row=>row.main)!;
      failures.push(...await restoreWindowView(main));
      await call('restore_workspace_placement',{label:workspaceWindows.label,index:layout.windows.indexOf(main),name});
      for(const [index,row] of layout.windows.entries()){
        if(row.main)continue;
        try{
          const p=row.view.project?(documentsRef.current.documents.find(d=>d.id===row.view.project)?.history.current??(await call<OpenProject>('open_project',{id:row.view.project})).project):null;
          if(row.view.project&&(!p||(p.source?.sha256??null)!==row.sourceSha256))throw Error('Saved map is unavailable or its source identity changed');
          const label=await call<string>(row.view.project?'open_project_window':'open_workspace_window',row.view.project?
            {id:row.view.project,workspace:row.view.workspace,section:row.view.section,observe:!row.writable,panel:row.panel,focusTag:row.focusTag,originWorkspace:row.panel?row.view.workspace:null,another:true}:
            {workspace:row.view.workspace,section:row.view.section,panel:row.panel,another:true});
          // New native windows are registered before their first WebView frame.
          await call('restore_workspace_placement',{label,index,name});
        }catch(e){failures.push(`${row.view.workspace}: ${String(e)}`);}
      }
      await workspaceWindows.refresh();
      notice(failures.length?`Layout restored with ${failures.length} unavailable place${failures.length===1?'':'s'}: ${failures.join(' · ')}`:'Workspace windows restored. Existing source histories and other open windows are preserved.',failures.length?'warning':'success');
    }catch(e){notice(String(e),'error');}finally{setBusy(false);layoutOperation.current=false;}
  }
  const restoredWindow=useRef(false);
  useEffect(()=>{
    if(!native||!ready||!initialDocumentReady)return;
    let alive=true;
    const apply=async()=>{
      if(restoredWindow.current)return;
      try{const row=await call<SavedWorkspaceWindow|null>('workspace_restore_context');if(!row||!alive)return;restoredWindow.current=true;
        const failures=await restoreWindowView(row);if(failures.length)notice(`Workspace restored with unavailable views: ${failures.join(' · ')}`,'warning');
      }catch(reason){notice(`Saved workspace: ${String(reason)}`,'error');}
    };
    const subscription=listen('spark:restore-workspace-view',()=>void apply());void apply();
    return()=>{alive=false;void subscription.then(stop=>stop());};
  },[ready,initialDocumentReady]);
  useEffect(()=>{
    if(!native||!ready||startupLayout.current||getCurrentWindow().label!=='main'||new URLSearchParams(location.search).has('workspace')||new URLSearchParams(location.search).has('project'))return;
    startupLayout.current=true;if(interfacePreferences.restoreWorkspaceLayout)void restoreWorkspaceLayout();
  },[ready]);
  async function transferAsset(selection: TransferSelection) {
    const target=historyRef.current.current;
    if(!target)return;
    setBusy(true);
    try {
      if (selection.kind === 'tag') {
        const binding = await prepareAssetImport(target, selection.asset);
        const latest = documentsRef.current.documents.find((d) => d.id === target.id)?.history.current;
        if (!latest)
          throw Error('The target map was closed during import. Extracted tags remain in managed storage.');
        const next = transferTag(attachAssetImport(latest, binding), selection.asset);
        edit(next, 'Import and place ' + selection.asset.name);
        notice(
          `${binding.fileCount} native tags imported with their dependencies. Build the map copy to use the placement in Halo.`,
          'success',
        );
      } else if (selection.kind === 'sound') {
        const binding = await prepareSoundImport(target, selection.item);
        const emitters=await librarySoundEmitters(selection.item,[0,0,0]);
        const latest = documentsRef.current.documents.find((d) => d.id === target.id)?.history.current;
        if (!latest) throw Error('The target map was closed during sound import');
        const next = binding ? attachAssetImport(latest, binding) : latest;
        const scene = next.audioPreview ?? emptySoundScene();
        if(scene.emitters.length+emitters.length>64)throw Error('The map sound emitter limit is full');
        edit(
          { ...next, audioPreview: { ...scene, emitters: [...scene.emitters, ...emitters] } },
          'Place transferred sound ' + selection.item.name,
        );
      } else {await save(false,target.id);const result=await call<AssetResult>('copy_project_asset',{sourceId:selection.sourceId,assetId:selection.assetId,targetId:target.id});dispatch({type:'assets',project:result.project});dispatchDocument({type:'mesh',id:target.id,assetId:result.asset.id,mesh:result.mesh});const latest=documentsRef.current.documents.find(d=>d.id===target.id)?.history.current??target;edit({...latest,assets:result.project.assets,scene:[...latest.scene,{id:crypto.randomUUID(),name:result.asset.name,kind:'Workshop mesh',tagId:null,assetId:result.asset.id,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],visible:true,sourceOffset:null,rotationOffset:null}]},'Place transferred OBJ '+result.asset.name);await refresh();notice('Verified OBJ copied and placed. Ctrl+Z removes the placement.','success');}
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
      notice(String(e),'error');
    } finally {
      setBusy(false);
    }
  }
  async function createQuickForge(title: string, template: string, target: RuntimeId) {
    setBusy(true);
    let previewDefaultsReady=false;
    try {
      if (historyRef.current.dirty) await save();
      const open = await call<OpenProject>('create_quickforge_project', { title, template, target });
      if(native){
        try{
          const source=await runtimeTextureSource(target),materials=defaultPreviewMaterials(source);
          if(open.project.quickForge&&materials.length){
            open.project={...open.project,quickForge:{...open.project.quickForge,materials:[...materials,...open.project.quickForge.materials.filter(m=>!materials.some(defaultMaterial=>defaultMaterial.id===m.id))]}};
            await call('update_project',{project:open.project});
            writeMapSession(open.project.id,'forge.materialSource',source.project.id);
            writeMapSession(open.project.id,'forge.assetSource',source.project.id);retainAssetSource(source);
            previewDefaultsReady=true;
          }
        }catch(error){notice('Choose an owned Halo texture source to finish the default materials: '+String(error),'info');}
      }
      await load(open);
      setWorkspace('quickforge');
      await refresh();
      if (native) {
        try {
          notice('Preparing your runtime’s real grass and metal materials…', 'info');
          const defaults = await call<{
            source: OpenProject;
            materials: ForgeMaterial[];
            bindings: NativeAssetImport[];
          }>('prepare_default_halo_materials', { projectId: open.project.id });
          const latest = documentsRef.current.documents.find((d) => d.id === open.project.id)?.history
            .current;
          if (latest?.quickForge) {
            let next = latest;
            for (const binding of defaults.bindings) next = attachAssetImport(next, binding);
            edit(
              {
                ...next,
                quickForge: {
                  ...latest.quickForge,
                  materials: [
                    ...defaults.materials.map((material) => {
                      const current = latest.quickForge!.materials.find((value) => value.id === material.id);
                      const initial = open.project.quickForge!.materials.find(
                        (value) => value.id === material.id,
                      );
                      return current && current.shaderPath !== initial?.shaderPath ? current : material;
                    }),
                    ...latest.quickForge.materials.filter(
                      (material) => !defaults.materials.some((value) => value.id === material.id),
                    ),
                  ],
                },
              },
              'Assign native Halo grass and metal defaults',
            );
            writeMapSession(latest.id, 'forge.assetSource', defaults.source.project.id);
            writeMapSession(latest.id, 'forge.materialSource', defaults.source.project.id);
            retainAssetSource(defaults.source);
            await refresh();
            notice(
              'Real grass and metal are ready. Terrain uses grass; new walls and boxes use metal.',
              'success',
            );
          }
        } catch (error) {
          notice((previewDefaultsReady?'Default textures are ready. Native building still needs matching source/tools: ':'Native defaults need source setup: ') + String(error), 'info');
        }
      }
    } finally {
      setBusy(false);
    }
  }
  async function buildQuickForge() {
    const project=historyRef.current.current;
    if (!project?.quickForge) return;
    await save();
    const jobId = await call<string>('quickforge_build', { projectId: project.id });
    setActiveJob(jobId);
  }
  async function importAsset(position?:Vec3,path?:string,expectedSha256?:string,expectedProjectId?:string) {
    const target=historyRef.current.current;
    if (!target) return;
    if(expectedProjectId&&target.id!==expectedProjectId){notice('Return to the handoff’s map before importing this geometry.','error');return;}
    setBusy(true);
    try {
      if (historyRef.current.dirty) await save();
      const result = await call<AssetResult | null>('import_asset', { id: target.id,...(path?{path}:{}),...(expectedSha256?{expectedSha256}:{}) });
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
      if (historyRef.current.dirty) await save(true);
      const job = await call<string>('start_build', { id: current.id });
      setActiveJob(job);
      notice('Conversion started. The build log records tool output and validation results.', 'success');
    } catch (e) {
      notice(String(e),'error');
    }
  }
  async function applySettings(settings: Settings) {
    try {
      const d = await call<Bootstrap>('save_settings', { settings });
      if (JSON.stringify([data.settings.mccDirectory,data.settings.steamDirectory,data.settings.resourceDirectory]) !==
        JSON.stringify([settings.mccDirectory,settings.steamDirectory,settings.resourceDirectory]))
        window.dispatchEvent(new Event('guilty-spark-runtime-connections-changed'));
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
  function forgeView(project:Project|null,map?:MapDocument){return <QuickForge library={{documents:documents.documents,onImportModel:importAsset,onImportSound:importSound,onPlaceMesh:placeLibraryMesh,onSaveMap:id=>save(true,id),busy}} key={project?.id??'new'} project={project} data={data} edit={edit} onDefaultMaterials={materials=>materialDefaults(project!.id,materials)} onSharedDocument={document=>dispatch({type:'forge-remote',projectId:project!.id,document})} onCreate={createQuickForge} onSave={()=>save(false,project?.id)} onBuild={buildQuickForge} onRuntimes={()=>setWorkspace('runtimes')} onLive={()=>setWorkspace('live')} onSettings={()=>setWorkspace('settings')} notify={notice} logs={logs} activeJob={activeJob} epoch={epoch+(map?.savedRevision??0)} dirty={map?.history.dirty??false}/>;}
  function sourceView(map?:MapDocument){const project=map?.history.current;return project?.quickForge?forgeView(project,map):project?<Suspense fallback={<div className="loading">Loading map viewer…</div>}><World library={{documents:documents.documents,onImportModel:importAsset,onImportSound:importSound,onPlaceMesh:placeLibraryMesh,onSaveMap:id=>save(true,id),busy}} key={project.id} project={project} inspection={map.inspection} assetMeshes={map.meshes} edit={edit} notify={notice} onSelectMap={id=>{void openProject(id,'quickforge');}} onBeforeResources={()=>save(false,project.id)} onResourcesConnected={applyResourceMetadata} onDetachTags={detachTagPanel} onOpenTag={(tagId,sourceId)=>{const owner=sourceId??project.id;writeMapSession(owner,'tags.focus',tagId);dispatchDocument({type:'select',id:owner});setFocusTagId(tagId);setWorkspace('tags');}}/></Suspense>:forgeView(null);}
  async function openRecordingDirector(){const project=historyRef.current.current;if(!project)return;try{await save();window.dispatchEvent(new CustomEvent('guilty-spark-flush-map-view',{detail:project.id}));let session=await call<import('./directorSession').DirectorSession>('director_session',{projectId:project.id});if(session.revision===0){const pose=readMapSession<{position:number[];target?:number[];quaternion:number[]}|null>(project.id,'camera.world.PerspectiveCamera',null);if(pose?.position.length===3&&pose.quaternion?.length===4){const[x,y,z,w]=pose.quaternion,p=pose.position,target=pose.target??[p[0]-2*(x*z+w*y),p[1]-2*(y*z-w*x),p[2]-(1-2*(x*x+y*y))];session=await call('director_update',{projectId:project.id,revision:session.revision,composition:{...session.composition,pose:{position:p,lookAt:target,fov:55,roll:0}},save:true});}}await call('director_popout',{projectId:project.id});setDockedDirector(false);if(workspace==='machinima')setWorkspace('world');notice('Recording Director opened. Use its display selector or drag it to another monitor.','success');}catch(e){notice(String(e),'error');}}
  function libraryView(){return (<Library
          data={data}
          onWorkspace={setWorkspace}
          onImport={() => void importFiles()}
          onRuntime={id=>{setDependencyRuntime(id);setSettingsTab('tools');setWorkspace('settings');}}
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
        />);}
  const inLevelEditor=workspace==='world'||workspace==='quickforge'||workspace==='live';
  const otherKey=`${mapWorkspaces.includes(workspace)?current?.id??'empty':'global'}:${workspace}`;
  if(ready&&!inLevelEditor&&workspace!=='library'){
    visitedWorkspaces.current.delete(otherKey);
    visitedWorkspaces.current.set(otherKey,{workspace,projectId:mapWorkspaces.includes(workspace)?current?.id??null:null});
  }
  for(const [key,view] of visitedWorkspaces.current)if(view.projectId&&!documents.documents.some(d=>d.id===view.projectId))visitedWorkspaces.current.delete(key);
  function retainedWorkspaces(){
    const warm=new Set([...visitedWorkspaces.current.keys()].slice(-previewBudgets().warmEditors));
    return [...visitedWorkspaces.current].map(([key,view])=>{
      const map=view.projectId?documents.documents.find(d=>d.id===view.projectId):activeMap;
      return <RetainedLevelView key={key} id={`workspace:${key}`} active={!inLevelEditor&&otherKey===key} graphicsResident={warm.has(key)}>
        <Suspense fallback={<div className="loading">Opening workspace…</div>}><WorkspaceSession id={view.projectId??'global'} workspace={view.workspace}>{workspaceContent(view.workspace,map)}</WorkspaceSession></Suspense>
      </RetainedLevelView>;
    });
  }
  if(ready&&workspace==='library')visitedHome.current=true;
  if(inLevelEditor&&ready){const id=current?.id??'new';visitedLevelViews.current.delete(id);visitedLevelViews.current.add(id);}
  for(const id of visitedLevelViews.current)if(id!=='new'&&!documents.documents.some(map=>map.id===id))visitedLevelViews.current.delete(id);
  function retainedLevels(){
    // Keep the two most recently used maps warm. The editor components, native
    // payloads, draft/history and camera session survive graphics retirement.
    const warm=new Set([...visitedLevelViews.current].filter(id=>id!=='new').slice(-previewBudgets().warmEditors));
    return [...visitedLevelViews.current].map(id=>{
    const map=documents.documents.find(map=>map.id===id),project=map?.history.current??null;
    const active=inLevelEditor&&id===(current?.id??'new');
    return <RetainedLevelView key={id} id={id} active={active} graphicsResident={warm.has(id)} renderGraphics={!requestedPanel(location.search,workspace)}>
      <Suspense fallback={<div className="loading">Opening level editor…</div>}>
        <LevelEditorWorkspace defaultRuntime={data.settings.preferredHalo??undefined} entries={data.entries} onBuild={()=>setWorkspace('build')} project={project} inspection={map?.inspection??null} assetMeshes={map?.meshes??{}} intent={active?workspace as 'world'|'quickforge'|'live':'world'} onSourceEdit={edit} onImportMap={()=>void importFiles()} onContinue={id=>void openProject(id,'world')} onDirector={()=>void openRecordingDirector()}
          source={sourceView(map)} newMap={forgeView(null)} notify={notice} onBeforeResources={()=>save(false,project?.id)} onResourcesConnected={applyResourceMetadata}
          onOpenMap={async()=>{await save(false,project?.id);const opened=await call<OpenProject>('live_mcc_import_map');await load(opened);await refresh();}}/>
      </Suspense>
    </RetainedLevelView>;
  });}
  function workspaceContent(target:Workspace,map:MapDocument|undefined) {
    // Retained workspaces always receive their own latest document. Never bind
    // a hidden editor to whichever map happens to be active in this window.
    const workspace=target,current=map?.history.current??null,inspection=map?.inspection??null,meshes=map?.meshes??{},history=map?.history??{...initialHistory,limit:documents.limit},activeMap=map;
    if (workspace === 'learning') return <LearningCenter project={current} inspection={inspection} settings={data.settings} section={learningSection} onSection={setLearningSection} navigate={setWorkspace}/>;
    if (workspace === 'get-started') return <GettingStarted data={data} project={current} onApply={applySettings} navigate={target => {markFirstVisitSeen();setWorkspace(target);}}/>;
    if (workspace === 'features') return <Features project={current} openMaps={documents.documents.length} navigate={setWorkspace}/>;
    if (workspace === 'community') return <CommunityThanks/>;
    if (workspace === 'map-finder') return <CommunityMaps onImport={()=>void importFiles()} onImportConvert={()=>void importFiles(undefined,'build')} currentMapTitle={current?.source?current.title:null} onConvertCurrent={()=>setWorkspace('build')} onLibrary={()=>setWorkspace('library')} busy={busy} onDownloaded={openDownloadedMaps} targetLabel={data.settings.preferredHalo==='mccSteam'||!data.settings.preferredHalo?'MCC Halo 1':data.settings.preferredHalo}/>;
    if (workspace === 'interface' || workspace === 'settings' && settingsTab === 'interface') return <SettingsPanel tab="interface" onTab={selectSettingsTab}><InterfaceStudio
      preferences={interfacePreferences} onChange={setInterfacePreferences} onPreview={playInterfaceCue}
      homeModelSettings={<ShowcaseChoice data={data}/>}
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
        <SettingsPanel tab={settingsTab} onTab={selectSettingsTab}>{settingsTab==='storage'?<StorageSettings project={current} settings={data.settings} onEditProject={edit} onBeforeSave={persist=>save(persist===true,current?.id)}/>:settingsTab==='dependencies'?<div className="analysis-page">
          <label className="field">Dependency target<select aria-label="Dependency target runtime" value={dependencyRuntime} onChange={e=>setDependencyRuntime(e.target.value as RuntimeId)}>
            <option value="mccSteam">Halo 1 · MCC (Steam)</option><option value="haloCustomEdition">Halo Custom Edition</option><option value="haloPc">Halo PC</option><option value="chupathingyCe">ChupathingyCE</option><option value="openCe">OpenCE</option><option value="haloPcTrial">Halo PC Trial</option><option value="macRetail">Halo Mac</option><option value="macDemo">Halo Mac Demo</option><option value="haloMd">HaloMD</option><option value="haloXbox">Halo Xbox</option>
          </select></label>
          <DependencyPanel project={current} runtime={dependencyRuntime} onSetupChanged={next=>{setData(next);setEpoch(value=>value+1);}} onProjectUpdated={applyDependencyChoice} onChooseAssets={()=>setWorkspace(current?'assets':'library')}/>
        </div>:<GamesTools data={data} project={current} busy={busy}
          onSelectMap={id=>void openProject(id,'settings')} onLibrary={()=>setWorkspace('library')}
          onSetup={id=>{setDependencyRuntime(id);openDependencySetup();}}
          onOpenWorkspace={target=>setWorkspace(target)}><Preferences embedded
          data={data}
          undoLimit={history.limit} onUndoLimit={limit=>dispatch({type:'history-limit',limit})}
          onApply={applySettings}
          onAction={action}
          onRuntimes={() => setWorkspace('runtimes')}
        /></GamesTools>}</SettingsPanel>
      );
    if (workspace === 'compare')
      return (
        <Compare entries={data.entries} currentId={current?.id} dirty={history.dirty} onSave={() => save()} />
      );
    if (workspace === 'runtimes')
      return <Runtimes project={current} dirty={history.dirty} onSave={() => save()} settings={data.settings} onSettings={openDependencySetup} onOpenWorkspace={setWorkspace} onCollaborate={()=>{setStudioGuide(true);requestAnimationFrame(()=>window.dispatchEvent(new CustomEvent('guilty-spark-reveal-drawer',{detail:{id:'co-edit-setup'}})));}} edit={edit} />;
    if (!current) return commonEmpty;
    switch (workspace) {
      case 'firefight': return <Firefight key={current.id} project={current} entries={data.entries} edit={edit} />;
      case 'creator': return <CreatorStudio project={current} inspection={inspection} edit={edit} notify={notice} onOpenRuntimes={() => setWorkspace('runtimes')} onBuild={()=>setWorkspace('build')}/>;
      case 'machinima': if(dockedDirector)return <DockedDirector key={current.id} projectId={current.id} embedded onPopout={()=>void openRecordingDirector()} onClose={()=>setDockedDirector(false)}/>;return <MachinimaWorkspace key={current.id} project={current} inspection={inspection} assetMeshes={meshes} data={data} edit={edit} notify={notice} onResourcesConnected={applyResourceMetadata} onSave={save} onLive={()=>setWorkspace('live')} onEditor={()=>setWorkspace('quickforge')} onDirector={()=>void openRecordingDirector()} onBuild={()=>setWorkspace('build')}/>;
      case 'tags':
        return (
          <Tags key={current.id} project={current} inspection={inspection} entries={data.entries} hasUnsavedChanges={history.dirty} onSave={()=>save(false,current.id)}
            onLevelEditor={()=>setWorkspace('quickforge')}
            onNativeEditor={()=>window.dispatchEvent(new CustomEvent('guilty-spark-runtime-tool',{detail:{projectId:current.id,actionId:'editTags'}}))}
            onSelectMap={(id) => { void openProject(id, 'tags'); }} edit={edit} notify={notice}
            focusTagId={documents.activeId===current.id?focusTagId:null} onFocusHandled={()=>writeMapSession(current.id,'tags.focus',null)}
            onResources={()=>void action(async()=>{const id=current.id;await save(false,id);const open=await call<OpenProject|null>('choose_project_resources',{projectId:id});if(open)await applyResourceMetadata(open);return open;},'Map resources connected; sound samples are verified when opened.')}
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
            onImportRevised={(path,sha256)=>importAsset(undefined,path,sha256,current.id)}
            onWorld={() => setWorkspace('world')}
          />
        );
      case 'scenario':
        return <Scenario inspection={inspection} onWorld={() => setWorkspace('world')} />;
      case 'preservation':
        return <Preservation project={current} inspection={inspection} edit={edit} onBeforeSave={save} onRestore={load} />;
      case 'build':
        return current.quickForge ? <QuickForge key={current.id} project={current} data={data} edit={edit} onDefaultMaterials={materials=>materialDefaults(current!.id,materials)} onSharedDocument={document=>dispatch({type:'forge-remote',projectId:current!.id,document})} onCreate={createQuickForge} onSave={() => save()} onBuild={buildQuickForge} onRuntimes={() => setWorkspace('runtimes')} onSettings={() => setWorkspace('settings')} notify={notice} logs={logs} activeJob={activeJob} epoch={epoch+(activeMap?.savedRevision??0)} dirty={history.dirty} /> : current.source ? (
          <Build
            key={current.id}
            edit={edit}
            onSave={persist=>save(persist===true,current.id)}
            onOpenCompiled={buildId=>void action(async()=>{await save();const opened=await call<OpenProject>('open_built_map',{projectId:current.id,buildId});await load(opened);await refresh();setWorkspace('quickforge');},'Compiled map preserved and opened in its own Level Editor tab.')}
            project={current}
            data={data}
            logs={logs}
            activeJob={activeJob}
            dirty={history.dirty}
            epoch={epoch+(activeMap?.savedRevision??0)}
            onStart={() => void startBuild()}
            onAction={action}
            onSettings={openDependencySetup}
            onResources={() =>
              void action(async () => {
                const projectId = current.id;
                await save(historyRef.current.dirty,projectId);
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
  const orbWorkspace = workspace === 'world' || workspace === 'live' ? 'quickforge' : workspace === 'interface' ? 'settings' : canonicalWorkspace(workspace);
  const orbWorkspaceTitle = workspaceLabel(orbWorkspace);
  return (
    <>
      <div className="gs-window-content" onKeyDown={navigateComposite}>
        <div className="application gs-drawers" data-panel-window={requestedPanel(location.search,workspace)??undefined} inert={closing || undefined} onWheelCapture={event=>{const field=event.target;if(field instanceof HTMLInputElement&&field.type==='number'&&document.activeElement===field)field.blur();}}>
          <header
            id="gs-window-header"
            className="app-header gs-compact-header"
            data-tauri-drag-region="deep"
            style={
              ownedHeaderArt && matchesOwnedInterfaceBitmap(bitmapPreference, current, inspection)
                ? {
                    backgroundImage: `linear-gradient(90deg,rgba(7,17,26,.96) 0%,rgba(9,24,35,.9) 44%,rgba(8,22,33,.58) 100%),url("${ownedHeaderArt.url}")`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }
                : undefined
            }
          >
            <button className="brand gs-spark-navigation gs-navigation-toggle" onClick={()=>setSidebarOpen(value=>!value)} aria-label="Toggle workspace navigation" aria-expanded={sidebarOpen} aria-controls="gs-workspace-navigation" aria-keyshortcuts="Control+\" onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setSidebarOpen(true);}}}>
              <SparkEmblem/>
            </button>
            <div id="gs-header-file-tools"/>
            {documents.documents.length ? (
              <MapTabs
                state={documents}
                disabled={busy || closing}
                onSelect={selectMap}
                onReorder={ids=>dispatchDocument({type:'reorder',ids})}
                onClose={(id) => void closeMap(id)}
                onWindow={(id) => closeMap(id, true, true)}
                onReturn={native&&getCurrentWindow().label.startsWith('editor-')?(id)=>void closeMap(id,'main'):undefined}

              />
            ) : (
              <div className="header-context">
                <span>LOCAL WORKBENCH</span>
                <ChevronRight size={12} />
                <strong>
                  {current?.title ?? nav.find((item) => item.id === workspace)?.label ?? 'Guilty Spark'}
                </strong>
                {current && (
                  <span
                    className={unsaved ? 'unsaved-dot' : 'saved-dot'}
                    title={unsaved ? 'In memory · choose Save to keep' : 'Saved'}
                  />
                )}
              </div>
            )}
            <div className="gs-titlebar-drag-space" data-tauri-drag-region="deep" aria-hidden="true" />
            <div id="gs-header-workspace-tools"/>
            <OpenWork workspace={workspace} documents={documents} entries={data.entries} windows={workspaceWindows.windows} recent={workflow.recent} error={workspaceWindows.error} jobs={logs}
              onNavigate={setWorkspace} onSelect={selectMap} onRecent={route=>void returnToPlace(route)}
              onFocus={label=>void workspaceWindows.focus(label).catch(e=>notice(String(e),'error'))} onRefresh={()=>void workspaceWindows.refresh()} onWindow={(target,another)=>void openWorkspaceView(target,another)}/>
            <details className="gs-studio-menu" onToggle={event=>{if(event.currentTarget.open)closeOtherHeaderMenus(event.currentTarget);}} onKeyDown={headerMenuKeyDown}>
              <summary aria-label="Studio options" title="Halo runtime, collaboration, tools and help">Studio <span aria-hidden="true">▾</span></summary>
            <div className="header-actions" role="menu" aria-label="Studio commands" onClickCapture={event=>{
              if(!(event.target instanceof Element)||!event.target.closest('button'))return;
              const menu=event.currentTarget.closest('details')!;menu.open=false;menu.querySelector<HTMLElement>('summary')?.focus();
            }}>
              <LiveStudioIndicator
                projectId={current?.id ?? null}
                canHost={!!current?.quickForge}
                onSetup={()=>{setStudioGuide(true);requestAnimationFrame(()=>window.dispatchEvent(new CustomEvent('guilty-spark-reveal-drawer',{detail:{id:'co-edit-setup'}})));}}
                onOpen={id=>{void openStudioProject(id);}}
              />
              <HeaderRuntime value={dependencyRuntime} onChange={id=>{setDependencyRuntime(id);void applySettings({...data.settings,preferredHalo:id}).catch(()=>{});}}/>
              <button
                className="gs-header-find"
                title="Search all Spark tools and workspaces (Ctrl+K)"
                onClick={() => {
                  setHelp(false);
                  setCreateModal(false);
                  setShowFinder(true);
                }}
              >
                <Search size={15} />
                Find tools <kbd>Ctrl K</kbd>
              </button>
              <button onClick={() => setHelp(true)} aria-keyshortcuts="F1"><CircleHelp size={16}/><span>Help & shortcuts</span></button>
            </div>
            </details>
            <div id="gs-window-actions" className="gs-window-actions" />
          </header>
          <aside
            id="gs-workspace-navigation"
            className="sidebar gs-navigation-drawer"
            aria-label="Workspace navigation"
            hidden={!sidebarOpen}
            onClickCapture={(e) => {
              if((e.target as HTMLElement).closest('.nav-item'))setSidebarOpen(false);
            }}
          >
            <div className="sidebar-label gs-nav-heading"><strong className="gs-current-workspace" aria-label="Current workspace" aria-live="polite" title={`Current workspace: ${orbWorkspaceTitle}`}>{orbWorkspaceTitle}</strong><button aria-label="Open work & recent places" onClick={()=>{setSidebarOpen(false);window.dispatchEvent(new Event('gs:open-work'));}}>Open work</button></div>
            <nav aria-label="Workspaces">
              {navGroups.map(([group, ids]) => (
                <div className={`gs-nav-group${group==='Home & first setup'?' gs-nav-home':''}`} key={group}>
                  <div className="sidebar-label">{group}</div>
                  {nav
                    .filter((item) => (ids as readonly string[]).includes(item.id))
                    .map(({ id, label, icon: Icon }) => (
                      <button
                        className={orbWorkspace === id ? 'nav-item selected' : 'nav-item'}
                        aria-current={orbWorkspace === id ? 'page' : undefined}
                        key={id}
                        title={WORKSPACE_TOOLTIPS[id]}
                        aria-label={label}
                        aria-description={WORKSPACE_TOOLTIPS[id]}
                        onClick={() => {
                          markFirstVisitSeen();
                          setWorkspace(id);
                          playInterfaceCue('select');
                        }}
                      >
                        <Icon size={17} />
                        <span>{label}</span>
                        {id === 'library' && <small>{data.entries.length}</small>}
                        {id === 'build' && activeJob && <span className="live-dot pulse" />}
                        {orbWorkspace === id && <Check size={13} className="gs-workspace-current-mark" aria-hidden="true" />}
                      </button>
                    ))}
                </div>
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
                aria-current={orbWorkspace === 'preservation' ? 'page' : undefined}
                onClick={() => setWorkspace('preservation')}
              >
                <BookOpen size={17} />
                <span>Preservation record</span>
                {orbWorkspace === 'preservation' && <Check size={13} className="gs-workspace-current-mark" aria-hidden="true" />}
              </button>
              <button
                className={orbWorkspace === 'settings' ? 'nav-item selected' : 'nav-item'}
                aria-current={orbWorkspace === 'settings' ? 'page' : undefined}
                onClick={() => setWorkspace('settings')}
              >
                <Settings2 size={17} />
                <span>Settings &amp; tools</span>
                {orbWorkspace === 'settings' && <Check size={13} className="gs-workspace-current-mark" aria-hidden="true" />}
              </button>
              <div className="local-only">
                <ShieldCheck size={13} />
                Local. Source-safe. Yours.
              </div>
            </div>
          </aside>
          <main className={`main-content workspace-${workspace}`}>
            <EditorAudioProvider
              project={current}
              inspection={inspection}
              active={
                !closing &&
                [
                  'world',
                  'quickforge',
                  'live',
                  'tags',
                  'assets',
                  'scenario',
                  'creator',
                  'firefight',
                  'build',
                  'preservation',
                ].includes(workspace)
              }
              resourceScope={JSON.stringify(
                documents.documents.map((document) => [
                  document.id,
                  {
                    map: document.history.current?.source?.resourceSha256,
                    audio: document.history.current?.source?.audioResources?.sha256,
                  },
                ]),
              )}
            >
              <WorkspacePanels
                onSaveLayout={native?()=>void saveWorkspaceLayout():undefined}
                onRestoreLayout={native?()=>void restoreWorkspaceLayout():undefined}
                layoutName={layoutName} layoutNames={layoutNames} onLayoutName={native?setLayoutName:undefined} onListLayouts={listWorkspaceLayouts}
                onPopout={() => void popoutWorkspace()}
                onNewWindow={() => void openWorkspaceView(workspaceRef.current, true)}
                fileActions={[
                  {id:'open-map',label:'Open map or archive…',run:()=>void importFiles(),disabled:busy},
                  {id:'new-multiplayer',group:'new',label:'Multiplayer Map',run:()=>setCreateModal('multiplayer'),disabled:busy},
                  {id:'new-megaworld',group:'new',label:'MegaWorld',run:()=>setCreateModal('megaworld'),disabled:busy},
                  {id:'new-project',group:'new',label:'Asset Workspace',run:()=>setCreateModal(true),disabled:busy},
                  ...(current ? [
                    {id:'save-project',label:'Save',shortcut:'Control+s',run:()=>void save(true,current.id).catch(()=>{}),disabled:!native||busy||windowWriters[current.id]===false},
                    {id:'save-as-project',label:'Save As…',hint:current.source||current.quickForge?'Review a native map copy; structural edits use the existing source compiler.':'Export a .gsproject descriptor; referenced assets stay in their current locations.',run:()=>{if(current.source||current.quickForge){writeMapSession(current.id,'smart-edit.open',true);setWorkspace('build');if(current.quickForge)requestAnimationFrame(()=>window.dispatchEvent(new CustomEvent('guilty-spark-reveal-drawer',{detail:{id:'forge-palette'}})));}else void action(async()=>{const id=current.id;await save(true,id);return call('export_project',{id});},'Project descriptor exported. Referenced source and asset files must remain available.');},disabled:!native||busy||windowWriters[current.id]===false},
                    {id:'export-project',label:'Export project descriptor…',hint:'.gsproject file; referenced assets stay in their current locations.',run:()=>void action(async()=>{const id=current.id;await save(true,id);return call('export_project',{id});},'Project descriptor exported. Referenced source and asset files must remain available.'),disabled:!native||busy||windowWriters[current.id]===false},
                    ...((current.source||current.quickForge)?[{id:'native-output',label:'Build / export map…',hint:'Review the saved source and native output through the existing build workflow.',run:()=>{setWorkspace('build');if(current.quickForge)requestAnimationFrame(()=>window.dispatchEvent(new CustomEvent('guilty-spark-reveal-drawer',{detail:{id:'forge-palette'}})));},disabled:busy}]:[]),
                    {id:'close-map',label:'Close map',shortcut:'Control+w',run:()=>void closeMap(current.id),disabled:busy},
                  ]:[]),
                ]}
                onDetachPanel={detachWorkspacePanel}
                canDetachPanel={panel=>canDetachPanel(workspace,panel,!!current)}
                onNavigationToggle={toggleNavigation}
                navigationOpen={sidebarOpen}
                id={current?.id ?? 'global'}
                workspace={['world', 'quickforge', 'live'].includes(workspace) ? 'level' : workspace}
                viewActions={current&&<EditorSoundControls projectId={current.id} />}
                actions={
                  <>
                    <div role="group" aria-label="Workflow navigation">
                      <IconButton
                        label="Back to previous workspace"
                        title={routeTitle(workflow.back, 'Back')}
                        onClick={workflow.goBack}
                        disabled={!workflow.back}
                      >
                        <ArrowLeft size={14} />
                      </IconButton>
                      <IconButton
                        label="Forward to next workspace"
                        title={routeTitle(workflow.forward, 'Forward')}
                        onClick={workflow.goForward}
                        disabled={!workflow.forward}
                      >
                        <ArrowRight size={14} />
                      </IconButton>
                    </div>
                  </>
                }
              >
                {documents.documents.map((document) => {
                  const project=document.history.current;
                  return project?.quickForge&&windowWriters[project.id]!==false?<ForgeCollaboration key={project.id} hidden={current?.id!==project.id} projectId={project.id} document={project.quickForge} entries={data.entries} onShared={next=>dispatch({type:'forge-remote',projectId:project.id,document:next})} onSave={()=>save(false,project.id)}/>:null;
                })}
                {current && (
                  <WorkspacePanel id="project-setup" label="Project setup">
                    <MapTools
                      key={current.id}
                      project={current}
                      settings={data.settings}
                      edit={edit}
                      onSave={() => save()}
                    />
                  </WorkspacePanel>
                )}
                {['world', 'quickforge', 'live', 'machinima'].includes(workspace) && (
                  <WorkspacePanel id="navigation" label="Camera">
                    <NavigationSettings />
                  </WorkspacePanel>
                )}
                <WorkspacePanel id="source-changes" label="Changes">
                  {current && (
                    <div className="gs-edit-history-controls" role="group" aria-label="Project edit history">
                      <span>{current.title} · edit history</span>
                      <IconButton
                        label="Undo (Ctrl+Z)"
                        onClick={() => applyHistory('undo')}
                        disabled={!history.past.length && !sharedHistory[current?.id ?? '']?.undo}
                      >
                        <Undo2 size={14} />
                      </IconButton>
                      <IconButton
                        label="Redo (Ctrl+Y / Ctrl+Shift+Z)"
                        onClick={() => applyHistory('redo')}
                        disabled={!history.future.length && !sharedHistory[current?.id ?? '']?.redo}
                      >
                        <Redo2 size={14} />
                      </IconButton>
                    </div>
                  )}
                  {native&&current&&<div className="gs-edit-history-controls" role="group" aria-label="Workspace window ownership">
                    <span>{windowWriters[current.id]===false?'Following the editing window':'Editing here · durable window history'}</span>
                    {windowWriters[current.id]===false?<button onClick={()=>void (async()=>{try{await call('take_project_document',{id:current.id});const next=await windowHistories.current.attach(current.id);setWindowWriters(old=>({...old,[current.id]:next.status.writable}));if(next.history)dispatchDocument({type:'window-history',id:current.id,history:next.history});}catch(e){notice(String(e),'error');}})()}>Edit here</button>:<button disabled={busy||!!activeJob} onClick={()=>void (async()=>{try{await save(false,current.id);await windowHistories.current.flush(current.id);await call('open_project_window',{id:current.id,workspace:workspaceRef.current,observe:true});}catch(e){notice(String(e),'error');}})()}>Open another view</button>}
                  </div>}
                  {native&&current&&windowHistoryErrors[current.id]&&<Notice tone="error">{windowHistoryErrors[current.id]} <button onClick={()=>void (async()=>{try{const h=documentsRef.current.documents.find(d=>d.id===current.id)?.history;if(!h)return;const recovered=await windowHistories.current.retainAndRefresh(current.id,h);if(recovered.history)dispatchDocument({type:'window-history',id:current.id,history:recovered.history});setWindowWriters(old=>({...old,[current.id]:recovered.status.writable}));setWindowHistoryErrors(old=>{const next={...old};delete next[current.id];return next;});notice(`Draft preserved at ${recovered.retained}. Showing the accepted revision.`,'success');}catch(e){notice(String(e),'error');}})()}>Save draft and use accepted revision</button></Notice>}
                  <ExternalMapSync
                    documents={documents.documents.flatMap((d) =>
                      d.history.current
                        ? [{ project: d.history.current, inspection: d.inspection, dirty: d.history.dirty }]
                        : [],
                    )}
                    onRevision={adoptExternalRevision}
                  />
                </WorkspacePanel>
                {current && (
                  <AssetTransfer
                    key={current.id}
                    data={data}
                    documents={documents.documents}
                    target={current}
                    busy={busy}
                    onTransfer={transferAsset}
                    onTags={() => {
                      setWorkspace('tags');
                    }}
                  />
                )}
                {current &&
                  ![
                    'library',
                    'settings',
                    'community',
                    'get-started',
                    'world',
                    'quickforge',
                    'live',
                  ].includes(workspace) && (
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
                          {unsaved ? 'Save changes' : 'Saved'}
                        </button>
                      </div>
                    </div>
                  )}
                {ready && (
                  <WorkspacePanel id="help" label="Help">
                    <WorkbenchGuide
                      key={workspace}
                      workspace={workspace}
                      evidence={{
                        desktop: native,
                        project: !!current,
                        source: !!current?.source,
                        inspectedSource:
                          !!current?.source &&
                          !!inspection &&
                          inspection.sha256.toLowerCase() === current.source.sha256.toLowerCase(),
                        forge: !!current?.quickForge,
                        toolFolder: !!data.settings.hekDirectory || !!data.settings.invaderDirectory,
                        unsaved,
                        runningJob: !!activeJob,
                      }}
                      onNavigate={(target) => {
                        markFirstVisitSeen();
                        setWorkspace(target);
                        playInterfaceCue('select');
                      }}
                    />
                  </WorkspacePanel>
                )}
                {studioGuide&&<WorkspacePanel id="co-edit-setup" label="Co-edit setup" defaultDock="right">
                  <p>Choose an editable map, then host or join SparkLink with a private LAN/VPN invitation. Steam invitations require an authorized Spark application integration.</p>
                  {documents.documents.filter(d=>d.history.current?.quickForge).map(d=><button key={d.id} onClick={()=>{setStudioGuide(false);void openStudioProject(d.id);}}>{d.history.current?.title} · open SparkLink</button>)}
                  <button disabled={busy} onClick={()=>void createQuickForge('Shared map','emptyArena',dependencyRuntime).then(()=>{const project=historyRef.current.current;if(project?.quickForge){writeMapSession(project.id,'studio.openRequest',true);window.dispatchEvent(new CustomEvent('guilty-spark-live-studio-open',{detail:{projectId:project.id}}));setStudioGuide(false);}})}>Create shared editable map</button>
                  <small>Editor collaboration and in-game multiplayer are separate connections. Each participant keeps a separate project copy.</small>
                </WorkspacePanel>}
                {!ready ? (
                  <LaunchProgress />
                ) : (
                  retainedWorkspaces()
                )}
                {ready&&visitedHome.current&&<RetainedLevelView id="home-library" active={workspace==='library'} graphicsResident>
                  <Suspense fallback={<div className="loading">Opening your library…</div>}>
                    <WorkspaceSession id="global" workspace="library">{libraryView()}</WorkspaceSession>
                  </Suspense>
                </RetainedLevelView>}
                {ready&&retainedLevels()}
              </WorkspacePanels>
            </EditorAudioProvider>
          </main>
          <RuntimeDock
            project={current}
            settings={data.settings}
            dirty={unsaved}
            working={busy || !!activeJob}
            epoch={epoch+(activeMap?.savedRevision??0)}
            onSave={() => save()}
            onNavigate={(next) => (next === 'settings' ? openDependencySetup() : setWorkspace(next))}
            onOpenCompiled={(buildId) => {
              if(current)void action(async()=>{await save();const opened=await call<OpenProject>('open_built_map',{projectId:current.id,buildId});await load(opened);await refresh();setWorkspace('quickforge');},'Working tag changes compiled, preserved and opened in a new map tab.');
            }}
          />
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
          {showFinder && !help && !createModal && (
            <WorkspaceFinder
              items={finderItems}
              project={current}
              settings={data.settings}
              onSettings={openDependencySetup}
              onNavigate={(target) => {
                markFirstVisitSeen();
                setWorkspace(target);
              }}
              onClose={() => setShowFinder(false)}
            />
          )}
          {(createModal==='multiplayer'||createModal==='megaworld')&&<div className="modal-backdrop"><div className="modal new-map-modal" role="dialog" aria-modal="true" aria-label={createModal==='multiplayer'?'New Multiplayer Map':'New MegaWorld'}>
            <button className="modal-close" aria-label="Close new map" disabled={busy} onClick={()=>setCreateModal(false)}><X size={18}/></button>
            <Suspense fallback={<p>Opening map creator…</p>}>{createModal==='multiplayer'?<NewMapWizard compact initialTitle="My Multiplayer Map" initialTemplate="customBlank" preferredHalo={data.settings.preferredHalo} onCancel={()=>setCreateModal(false)} onCreate={async(...args)=>{await createQuickForge(...args);setCreateModal(false);}}/>:<MegaWorldWizard entries={data.entries} onCancel={()=>setCreateModal(false)} onCreate={async(title,baseProjectId,donorProjectId)=>{
              setBusy(true);try{if(historyRef.current.dirty)await save();const open=await call<OpenProject>('create_megaworld_project',{title,baseProjectId,donorProjectId,donorBspIndex:0});writeMapSession(open.project.id,'bsp.open',true);writeMapSession(open.project.id,'bsp.donor',donorProjectId);await load(open);setWorkspace('quickforge');await refresh();setCreateModal(false);requestAnimationFrame(()=>window.dispatchEvent(new CustomEvent('guilty-spark-reveal-drawer',{detail:{id:'construction'}})));}finally{setBusy(false);}
            }}/>}</Suspense></div></div>}
          {createModal===true && (
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
                  Import your own Halo map, inspect its tags and placements, then configure Invader in
                  Settings to build an MCC cache. Excession metadata is required before packaging.
                </p>
                <div className="shortcut-list">
                  {[
                    ['Find tools, BSP help or community maps', 'Ctrl + K'],
                    ['Workspace guidance', 'Help drawer'],
                    ['Workspace navigation', 'Ctrl + \\'],
                    ['Back / Forward through your workflow', 'Alt + Left / Right or mouse side buttons'],
                    ['Open work and workspace windows', 'Ctrl + Shift + P'],
                    ['Next / previous map', 'Ctrl + Tab / Ctrl + Shift + Tab'],
                    ['Next / previous map (alternative)', 'Ctrl + Page Down / Page Up'],
                    ['Close map (with save prompt)', 'Ctrl + W'],
                    ['Next / previous work area', 'F6 / Shift + F6'],
                    ['Menus and workspace tabs', 'Arrow keys · Home / End · Enter / Space'],
                    ['Menu item by name', 'Type its first letters'],
                    ['Help & shortcuts', 'F1'],
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
                  QuickForge refreshes editable source meshes and simulated collision. Compiled Halo
                  collision, portals, AI synchronization and live engine editing remain separate and require
                  real runtime testing.
                </p>
                <button className="primary full" onClick={() => setHelp(false)}>
                  Back to the workbench
                  <ArrowLeft size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
        <ResizeEdges />
        {closePrompt && (
          <div className="modal-backdrop">
            <div className="modal" role="dialog" aria-modal="true" aria-labelledby="unsaved-title" onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();resolveClose('cancel');}if(event.key==='Tab'){const buttons=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));const first=buttons[0],last=buttons[buttons.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}}}>
              <h2 id="unsaved-title">Save changes before closing?</h2>
              <p>{closePrompt.slice(0,3).join(', ')}{closePrompt.length>3?` and ${closePrompt.length-3} more`:''}</p>
              <p className="subtle">Unsaved edits stay in memory. Discard removes these changes from every view of the map. With automatic recovery disabled, a crash or exit loses unsaved work.</p>
              <div className="button-row"><button className="primary" onClick={()=>resolveClose('save')}>Save changes</button><button onClick={()=>resolveClose('discard')}>Discard changes</button><button autoFocus onClick={()=>resolveClose('cancel')}>Cancel</button></div>
            </div>
          </div>
        )}
        {closing && !closePrompt && (
          <div className="modal-backdrop">
            <div className="modal" role="status">
              <LoaderCircle className="spin" size={24} />
              <h2>Closing workspace…</h2>
              <p>Finishing the selected Save or Discard action.</p>
            </div>
          </div>
        )}
      </div>
      <div className="gs-window-tint" aria-hidden="true" />
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
