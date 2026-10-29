import BuildTargets from './BuildTargets';
import{WorkspacePanel}from'./WorkspacePanels';
import RenderFeatures from './RenderFeatures';
import LiveForge from './LiveForge';
import MapSounds from './MapSounds';
import ForgeCollaboration from './ForgeCollaboration';
import { useEffect, useMemo, useRef, useState } from 'react';
import {useMapState} from '../mapSession';
import {
  Box,
  Copy,
  Download,
  Eye,
  EyeOff,
  Flag,
  Focus,
  Grid2X2,
  Hammer,
  Layers3,
  Lock,
  Move3D,
  Plus,
  Rotate3D,
  Scaling,
  Search,
  ShieldCheck,
  Trash2,
  Unlock,
  Users,
} from 'lucide-react';
import type { Bootstrap, JobEvent, OpenProject, Project, RuntimeId, Vec3 } from '../types';
import { call, native } from '../api';
import {sourceSpartan} from '../sourceSpartan';
import {
  brushNames,
  catalogAssets,
  createBrush,
  duplicateForgeNodes,
  forgeModes,
  forgeNodes,
  forgeTargets,
  mapForgeNodes,
  nodeCategory,
  nodeRotation,
  placeAsset,
  pointInsideForgeRoom,
  patchForgeNode,
  removeForgeNodes,
  snapPoint,
  transformForgeNode,
} from '../forge';
import type {
  BrushKind,
  ForgeAsset,
  ForgeMesh,
  ForgeMode,
  ForgeNode,
  ForgeObjective,
  GeometryReport,
  QuickForgeBuildReceipt,
  QuickForgeDocument,
} from '../forge';
import { HelpTip, IconButton, Notice, NumberField, PageTitle, Pill } from './ui';
import ForgeViewport from './ForgeViewport';
import EnvironmentControls from './EnvironmentControls';
import { environmentValue, validateEnvironment } from '../environment';
import { inspectScenarioRisks } from '../scenarioSafety';
import {auditClassicNetgame, classicModeChecklist, hillAreas, makeFourPointHill, makeTeleporterPair, netgameUsageId, nextFreeUsageId, nextFreeTeleportChannel, nextFreeRaceCheckpointId} from '../haloGametypeScenario';
import {makeFiveModeTestPlan} from '../haloModeTestPlan';
import {auditMultiplayerSpawns} from '../multiplayerSpawnAudit';
import type { ForgeCamera, ForgeSnapshot } from './ForgeViewport';
import Firefight from './Firefight';
import { sculptTerrain } from '../terrain';
import { analyzeCaveJoins } from '../caveJoinAnalysis';
import { auditCaveExtensions, applyCaveSeamSnap } from '../caveSeamRepair';
import { exactTerrainJoins, describeTerrainJoins } from '../terrainJoinAnalysis';
import { preflightSourceExport } from '../sourcePreflight';
import { makeHaloBspSourceReport } from '../haloBspSourceReport';
import { parseHaloWrl } from '../haloWrl';
import { matchWrlToSourceBrushes } from '../haloWrlSourceMatch';
import type { WrlDiagnostics } from '../haloWrl';
import { analyzeHaloToolLog } from '../haloToolDiagnostics';
import { makeCompilerTriageReport } from '../haloCompilerTriage';
import type { ToolLogReview } from '../haloToolDiagnostics';
import { snapBrushToAuthoredMesh } from '../snapGeometry';
import { createTagExchangeBundle, parseTagExchangeBundle, resolveTagExchangeBundle } from '../haloExchange';
import { downloadLocalText } from '../exportHelpers';
import type { SculptMode } from '../terrain';
import '../forge.css';

const templates = [
  {
    id: 'smallIndoorArena',
    name: 'Small Indoor Arena',
    detail: 'An original sealed room, a ramp, four cover pieces and four player starts.',
    glyph: '01',
  },
  {
    id: 'emptyArena',
    name: 'Empty Arena',
    detail: 'A sealed shell and four starts, ready for your own layout.',
    glyph: '02',
  },
  {
    id: 'symmetricalCtfArena',
    name: 'Symmetrical CTF Arena',
    detail: 'Original arena geometry with team starts and two flag positions.',
    glyph: '03',
  },
  {
    id: 'vehicleCombatArena',
    name: 'Vehicle Combat Arena',
    detail: 'A larger 40 × 48 shell. Add real vehicle tags and validate clearances.',
    glyph: '04',
  },
  {
    id: 'guiltySparkTestArena',
    name: 'Guilty Spark · Five-mode Test Arena',
    detail: 'Original arena with 32 all-mode starts (16/team), both CTF flags, two four-corner hills, Oddball, Race checkpoints and vehicle markers, paired teleporters. Source only.',
    glyph: 'QA',
  },
  {
    id: 'customBlank',
    name: 'Custom Blank Project',
    detail: 'Start from nothing. Add a sealed room and starts before building.',
    glyph: '05',
  },
];
type PaletteItem =
  | { type: 'brush'; kind: BrushKind }
  | { type: 'spawn' }
  | { type: 'hillPolygon' }
  | { type: 'teleportPair' }
  | { type: 'objective'; kind: ForgeObjective['kind'] }
  | { type: 'asset'; key: string }
  | { type: 'zone' };
const dragType = 'application/x-guiltyspark-forge';
interface Props {
  project: Project | null;
  data: Bootstrap;
  edit: (project: Project, description: string) => void;
  onSharedDocument: (document:QuickForgeDocument)=>void;
  onCreate: (title: string, template: string, target: RuntimeId) => Promise<void>;
  onSave: () => Promise<void>;
  onBuild: () => Promise<void>;
  onRuntimes: () => void;
  onSettings: () => void;
  onLive?:()=>void;
  notify: (message: string, tone?: string) => void;
  logs: JobEvent[];
  activeJob: string | null;
  epoch: number;
  dirty: boolean;
}
export default function QuickForge(props: Props) {
  const [wizard, setWizard] = useState(false);
  if (!props.project?.quickForge || wizard)
    return (
      <NewMapWizard
        preferredHalo={props.data.settings.preferredHalo}
        onCreate={async (...args) => {
          await props.onCreate(...args);
          setWizard(false);
        }}
        onCancel={props.project?.quickForge ? () => setWizard(false) : undefined}
      />
    );
  return (
    <ForgeEditor
      key={props.project.id}
      {...props}
      project={props.project}
      document={props.project.quickForge}
      onNew={() => setWizard(true)}
    />
  );
}
function NewMapWizard({ onCreate, onCancel,preferredHalo }: { onCreate: Props['onCreate']; onCancel?: () => void;preferredHalo?:RuntimeId|null }) {
  const [title, setTitle] = useState('Guilty Spark Test Arena'),
    [template, setTemplate] = useState('guiltySparkTestArena'),
    [target, setTarget] = useState<RuntimeId>(preferredHalo&&forgeTargets[preferredHalo]?preferredHalo:'mccSteam');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <div className="analysis-page forge-wizard">
      <PageTitle
        eyebrow="QUICKFORGE / NEW MAP"
        title="Make a place to play."
        description="Start with original editable geometry. Your map, asset references and game rules live in one Guilty Spark project."
      />
      <div className="forge-wizard-fields">
        <label>
          Map name
          <input
            aria-label="New map name"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          First runtime target
          <select
            aria-label="New map runtime"
            value={target}
            onChange={(e) => setTarget(e.target.value as RuntimeId)}
          >
            {Object.entries(forgeTargets).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="forge-template-grid">
        {templates.map((item) => (
          <button
            className={`forge-template ${template === item.id ? 'selected' : ''}`}
            aria-pressed={template === item.id}
            key={item.id}
            onClick={() => setTemplate(item.id)}
          >
            <span className="forge-template-art">
              <Box size={38} />
              <small>{item.glyph}</small>
            </span>
            <strong>{item.name}</strong>
            <span>{item.detail}</span>
            {template === item.id && <Pill tone="green">Selected</Pill>}
          </button>
        ))}
      </div>
      <Notice tone="info">
        Templates contain original geometry, not redistributed Halo levels. Place tags from your imported
        maps, assign compatible shaders and configure Halo Tool before compiling. An editor preview is not a
        playable cache.
      </Notice>
      {error && <Notice>{error}</Notice>}
      <div className="analysis-actions">
        {onCancel && <button onClick={onCancel}>Back to current map</button>}
        <button
          className="primary"
          disabled={busy || !native || !title.trim()}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await onCreate(title.trim(), template, target);
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Plus size={16} />
          {busy ? 'Creating map…' : 'Create editable map'}
        </button>
      </div>
      {!native && (
        <p className="subtle">
          Creating persistent projects and generating geometry require the desktop application.
        </p>
      )}
    </div>
  );
}
function ForgeEditor(props: Props & { project: Project; document: QuickForgeDocument; onNew: () => void }) {
  const { project, document: doc, data, edit, notify } = props;
  const [selected, setSelected] = useMapState<string[]>(project.id,'forge.selection',[]),
    [selectedZone, setSelectedZone] = useMapState<string | null>(project.id,'forge.zone',null);
  const [mode, setMode] = useMapState<'translate' | 'rotate' | 'scale'>(project.id,'forge.mode','translate'),
    [snap, setSnap] = useMapState(project.id,'forge.snap',0.5),
    [gridSnap, setGridSnap] = useMapState(project.id,'forge.gridSnap',true),
    [meshSnap, setMeshSnap] = useMapState(project.id,'forge.meshSnap',false),
    [grid, setGrid] = useMapState(project.id,'forge.grid',true),
    [wireframe, setWireframe] = useMapState(project.id,'forge.wireframe',false),
    [showHillAreas, setShowHillAreas] = useMapState(project.id,'forge.hills',true),
    [showGameRoutes, setShowGameRoutes] = useMapState(project.id,'forge.routes',true),
    [walkCollision, setWalkCollision] = useMapState(project.id,'forge.collision',true),
    [cutaway, setCutaway] = useMapState(project.id,'forge.cutaway',true),
    [cameraMode, setCameraMode] = useMapState<ForgeCamera>(project.id,'forge.cameraMode','orbit'),
    [frame, setFrame] = useState(0);
  const [tab, setTab] = useMapState<'palette' | 'properties' | 'firefight' | 'sound'>(project.id,'forge.inspector','palette');
  const [actorId,setActorId]=useState('');
  const [query, setQuery] = useMapState(project.id,'forge.query',''),
    [category, setCategory] = useMapState(project.id,'forge.category','all');
  const sources = data.entries.filter((entry) => entry.version !== null);
  const [sourceId, setSourceId] = useMapState(project.id,'forge.assetSource',sources[0]?.id ?? ''),
    [assets, setAssets] = useState<ForgeAsset[]>([]),
    [assetError, setAssetError] = useState('');
  const [sourceOpen, setSourceOpen] = useState<OpenProject | null>(null);
  const [referenceFilter, setReferenceFilter] = useState<Set<number> | null>(null);
  const exchangePicker = useRef<HTMLInputElement>(null);
  const currentSourceId = useRef(sourceId);
  currentSourceId.current = sourceId;
  const [snapshot, setSnapshot] = useState<ForgeSnapshot | null>(null),
    [report, setReport] = useState<GeometryReport | null>(null),
    [validatedDoc, setValidatedDoc] = useState<QuickForgeDocument | null>(null),
    [geometryError, setGeometryError] = useState(''),
    [previewBusy, setPreviewBusy] = useState(false);
  // Imported compiler evidence is memory-only, not part of saved source maps.
  const wrlPicker = useRef<HTMLInputElement>(null), toolLogPicker = useRef<HTMLInputElement>(null);
  const [wrlSource, setWrlSource] = useState<string | null>(null);
  const [wrlCentimetres, setWrlCentimetres] = useState(true);
  const [wrlVisible, setWrlVisible] = useState(true);
  const [wrlFocus, setWrlFocus] = useState(false);
  const [wrlLoadedSourceHash, setWrlLoadedSourceHash] = useState<string | null>(null);
  const [toolLog, setToolLog] = useState<ToolLogReview | null>(null);
  const [toolLogLoadedSourceHash, setToolLogLoadedSourceHash] = useState<string | null>(null);
  const [diagnosticError, setDiagnosticError] = useState('');
  const wrlParse = useMemo<{value:WrlDiagnostics|null;error:string}>(() => {
    if (!wrlSource) return {value:null,error:''};
    try{return {value:parseHaloWrl(wrlSource,wrlCentimetres),error:''};}
    catch(e){return {value:null,error:String(e)};}
  },[wrlSource,wrlCentimetres]);
  const [ghost, setGhost] = useState<Vec3 | null>(null),
    [dragging, setDragging] = useState<PaletteItem | null>(null);
  const dropPoint = useRef<((x: number, y: number) => Vec3 | null) | null>(null);
  const pointerDrag = useRef<{item:PaletteItem;x:number;y:number;pointerId:number;moved:boolean}|null>(null);
  const suppressPaletteClick = useRef(0);
  const cancelledPointer = useRef<number|null>(null);
  const pointerDrop = useRef<(item:PaletteItem,point:Vec3|null)=>void>(()=>{});
  pointerDrop.current=(item,point)=>{
    if(item.type==='hillPolygon'&&!point){notify('Point to an editable map surface to place a King hill.','error');return;}
    add(item,point??[0,0,0]);
  };
  useEffect(()=>{
    // Tauri's Windows file-drop handler replaces WebView2 HTML5 drag/drop.
    // Pointer-driven internal drags keep OS map/archive drops working too.
    const inside=(x:number,y:number)=>{
      const rect=window.document.querySelector('.forge-viewport')?.getBoundingClientRect();
      return !!rect&&x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom;
    };
    const clear=()=>{pointerDrag.current=null;setDragging(null);setGhost(null);};
    const move=(event:PointerEvent)=>{
      const drag=pointerDrag.current;if(!drag||event.pointerId!==drag.pointerId)return;
      if(!drag.moved&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<6)return;
      drag.moved=true;event.preventDefault();setDragging(drag.item);
      setGhost(inside(event.clientX,event.clientY)?dropPoint.current?.(event.clientX,event.clientY)??null:null);
    };
    const up=(event:PointerEvent)=>{
      if(cancelledPointer.current===event.pointerId){suppressPaletteClick.current=Date.now()+250;cancelledPointer.current=null;return;}
      const drag=pointerDrag.current;if(!drag||event.pointerId!==drag.pointerId)return;
      if(drag.moved){
        suppressPaletteClick.current=Date.now()+250;
        if(inside(event.clientX,event.clientY))pointerDrop.current(drag.item,dropPoint.current?.(event.clientX,event.clientY)??null);
      }
      clear();
    };
    const cancel=(event:KeyboardEvent)=>{if(event.key==='Escape'&&pointerDrag.current){event.preventDefault();cancelledPointer.current=pointerDrag.current.pointerId;clear();}};
    window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up);
    window.addEventListener('pointercancel',clear);window.addEventListener('keydown',cancel);
    return()=>{pointerDrag.current=null;window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',clear);window.removeEventListener('keydown',cancel);};
  },[]);
  const nodes = useMemo(() => forgeNodes(doc), [doc]);
  const spawnModelSource=useMemo(()=>{const biped=sourceSpartan(sourceOpen?.inspection);const asset=biped&&sourceOpen?catalogAssets(sourceOpen).find(asset=>asset.tagId===biped.id):null;
    return asset?{...placeAsset(asset,[0,0,0]),id:'spawn-preview'}:null;},[sourceOpen]);
  const caveReview = useMemo(() => analyzeCaveJoins(doc), [doc]);
  const caveSafety = useMemo(() => {
    try { return {result:auditCaveExtensions(doc),error:''}; }
    catch(error) { return {result:null,error:String(error)}; }
  },[doc]);
  const scenarioRisks = useMemo(() => inspectScenarioRisks(doc,project.firefight,sourceOpen?.inspection), [doc,project.firefight,sourceOpen]);
  const scenarioRiskErrors = scenarioRisks.some(r=>r.severity==='error');
  const netgameIssues = useMemo(() => auditClassicNetgame(doc), [doc]);
  const netgameBlocked = netgameIssues.some(i=>i.severity==='error');
  const gameChecklist = useMemo(() => classicModeChecklist(doc), [doc]);
  const spawnReview = useMemo(() => auditMultiplayerSpawns(doc), [doc]);
  const terrainJoins = useMemo(() => exactTerrainJoins(doc.geometry), [doc.geometry]);
  const chosen = nodes.filter((node) => selected.includes(node.value.id));
  const preflight = useMemo(() => preflightSourceExport(doc, snapshot, report, validatedDoc, previewBusy), [doc, snapshot, report, validatedDoc, previewBusy]);
  const meshReview = preflight.meshIntegrity;
  // A WRL describes the geometry of one compiler attempt; never present it as
  // diagnostic evidence for edited geometry without an explicit new import.
  const wrlStale = !!wrlSource && (wrlLoadedSourceHash == null || !preflight.sameDocument ||
    report?.sourceSha256 !== wrlLoadedSourceHash);
  const toolLogStale = !!toolLog && (toolLogLoadedSourceHash == null || !preflight.sameDocument ||
    report?.sourceSha256 !== toolLogLoadedSourceHash);
  const wrlBrushMatch = useMemo<{value:ReturnType<typeof matchWrlToSourceBrushes>|null;error:string}>(() => {
    if (wrlStale || !wrlParse.value || !preflight.sameDocument || !snapshot)
      return {value:null,error:''};
    try { return {value:matchWrlToSourceBrushes(snapshot.mesh,wrlParse.value),error:''}; }
    catch(e) { return {value:null,error:String(e)}; }
  }, [wrlStale, wrlParse.value, preflight.sameDocument, snapshot]);
  const compilerTriage = useMemo(() => {
    if (!preflight.sameDocument || !report?.sourceSha256 ||
        (!toolLog || toolLogStale) && (!wrlParse.value || wrlStale)) return null;
    try {
      return makeCompilerTriageReport({
        sourceSha256:report.sourceSha256,preflight,
        toolLog:toolLogStale ? null : toolLog,
        toolLogLoadedSourceHash:toolLogStale ? null : toolLogLoadedSourceHash,
        wrl:wrlStale ? null : wrlParse.value,
        wrlLoadedSourceHash:wrlStale ? null : wrlLoadedSourceHash,
        brushAssociation:wrlStale ? null : wrlBrushMatch.value,
      });
    } catch { return null; } // Imported evidence is optional, never bypasses source export guards.
  }, [preflight,report?.sourceSha256,toolLog,toolLogStale,toolLogLoadedSourceHash,
      wrlParse.value,wrlStale,wrlLoadedSourceHash,wrlBrushMatch.value]);

  const [receipt, setReceipt] = useState<QuickForgeBuildReceipt | null>(null),
    [buildError, setBuildError] = useState(''),
    [exporting, setExporting] = useState(false),
    [expandedBuild, setExpandedBuild] = useState(false);
  const latestProject = useRef(project);
  latestProject.current = project;
  const mutableNodes = chosen.filter((node) => !node.value.locked);
  const errors = useMemo(
    () =>
      new Set(
        report?.issues.filter((issue) => issue.severity === 'error').flatMap((issue) => issue.brushIds) ?? [],
      ),
    [report],
  );
  useEffect(() => {
    let alive = true;
    setPreviewBusy(true);
    setGeometryError('');
    setReport(null);
    setValidatedDoc(null);
    const timer = setTimeout(() => {
      void Promise.allSettled([
        call<ForgeMesh>('quickforge_preview', { document: doc }),
        call<GeometryReport>('quickforge_validate', { document: doc }),
      ]).then(([mesh, validation]) => {
        if (!alive) return;
        if (mesh.status === 'fulfilled') setSnapshot({ mesh: mesh.value, document: doc });
        if (validation.status === 'fulfilled') { setReport(validation.value); setValidatedDoc(doc); }
        const failures = [mesh, validation]
          .filter((result) => result.status === 'rejected')
          .map((result) => String((result as PromiseRejectedResult).reason));
        setGeometryError(failures.join(' '));
        setPreviewBusy(false);
      });
    }, 100);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [doc]);
  useEffect(() => {
    let alive = true;
    setAssets([]);
    setSourceOpen(null);
    setReferenceFilter(null);
    setAssetError('');
    if (!sourceId) return;
    call<OpenProject>('open_project', { id: sourceId })
      .then((open) => {
        if (alive) { setSourceOpen(open); setAssets(catalogAssets(open)); }
      })
      .catch((e) => {
        if (alive) setAssetError(String(e));
      });
    return () => {
      alive = false;
    };
  }, [sourceId]);
  useEffect(() => {
    let alive = true;
    call<QuickForgeBuildReceipt | null>('quickforge_build_report', { projectId: project.id })
      .then((value) => {
        if (alive) setReceipt(value);
      })
      .catch((e) => {
        if (alive) setBuildError(String(e));
      });
    return () => {
      alive = false;
    };
  }, [project.id, props.epoch, props.activeJob]);
  function commit(next: QuickForgeDocument, description: string) {
    edit({ ...latestProject.current, quickForge: next }, description);
  }
  function selectMeshDiagnosticTriangle(triangles: number[]) {
    const triangle = triangles[0];
    if (!snapshot || !preflight.sameDocument || !Number.isSafeInteger(triangle)) return;
    const indexOffset = triangle * 3;
    const affected = snapshot.mesh.parts.find(part => indexOffset >= part.indexStart && indexOffset < part.indexStart + part.indexCount);
    if (!affected) { notify('This triangle has no corresponding editable source brush. Inspect the geometry diagnostic report.', 'error'); return; }
    setSelected([affected.brushId]);
    setTab('properties');
    notify(`Selected source brush for diagnostic triangle ${triangle}. Fix its geometry and regenerate the preview before rerunning Tool.`);
  }
  function select(id: string | null, additive: boolean) {
    setSelectedZone(null);
    setSelected((items) =>
      !id
        ? []
        : additive
          ? items.includes(id)
            ? items.filter((item) => item !== id)
            : [...items, id]
          : [id],
    );
    if (id) setTab('properties');
  }
  function changeNode(update: (node: ForgeNode) => ForgeNode, description: string) {
    try {
      commit(
        mapForgeNodes(doc, (node) => (selected.includes(node.value.id) ? update(node) : node)),
        description,
      );
    } catch (e) {
      notify(String(e), 'error');
    }
  }
  function duplicate() {
    const copy = duplicateForgeNodes(doc, selected);
    if (copy.ids.length) {
      commit(copy.document, `Duplicate ${copy.ids.length} QuickForge object(s)`);
      setSelected(copy.ids);
    }
  }
  function remove() {
    if (selectedZone && project.firefight) {
      edit(
        {
          ...project,
          firefight: {
            ...project.firefight,
            spawnZones: project.firefight.spawnZones.filter((zone) => zone.id !== selectedZone),
          },
        },
        'Delete AI spawn zone',
      );
      setSelectedZone(null);
    } else if (mutableNodes.length) {
      commit(removeForgeNodes(doc, selected), `Delete ${mutableNodes.length} QuickForge object(s)`);
      setSelected([]);
    }
  }
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (
        (event.target as HTMLElement)?.closest(
          'input,textarea,select,[contenteditable="true"],[role="dialog"]',
        )
      )
        return;
      if (document.querySelector('canvas[data-gs-fly-active="true"]')) return;
      if (event.ctrlKey || event.metaKey) {
        if (event.key.toLowerCase() === 'd') {
          event.preventDefault();
          duplicate();
        }
        if (event.key.toLowerCase() === 'a') {
          event.preventDefault();
          setSelected(
            nodes.filter((node) => !node.value.locked && node.value.visible).map((node) => node.value.id),
          );
        }
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        remove();
      }
      if (event.key === 'Escape') {
        setSelected([]);
        setSelectedZone(null);
      }
      if (cameraMode !== 'orbit') return;
      if (event.key.toLowerCase() === 'w') setMode('translate');
      if (event.key.toLowerCase() === 'e') setMode('rotate');
      if (event.key.toLowerCase() === 'r' && mutableNodes.length === 1 && mutableNodes[0].type === 'brush')
        setMode('scale');
      if (event.key.toLowerCase() === 'f') {setWrlFocus(false);setFrame((value) => value + 1);}
      if (event.key.toLowerCase() === 'g') setGridSnap((value) => !value);
      if (event.key.toLowerCase() === 'm') setMeshSnap((value) => !value);
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [doc, selected, selectedZone, project.firefight, cameraMode]);
  function addPolygonHill(rawPoint: Vec3 = [0, 0, 0]) {
    const usageId=nextFreeUsageId(doc,'hill');
    if(usageId===null || doc.objectives.length+4>200){notify('No free hill index or not enough Halo CE netgame flag slots (200 maximum).','error');return;}
    try {
      const markers=makeFourPointHill(snapPoint(rawPoint,gridSnap?snap:0),usageId,2.5,2.5);
      commit({...doc,objectives:[...doc.objectives,...markers]},`Add polygonal King hill ${usageId}`);
      setSelected([markers[0].id]);setTab('properties');
      notify(`Added hill ${usageId}: 4 convex-hull corner markers, 5×5 world units. Source-only; compile the scenario in Halo Tool/Sapien.`);
    } catch(e){notify(String(e),'error');}
  }
  function addTeleportPair(rawPoint: Vec3 = [0,0,0]) {
    const channel=nextFreeTeleportChannel(doc);
    if(channel===null || doc.objectives.length+2>200){notify('No free teleporter channel (0–15) or netgame flag capacity.','error');return;}
    try {
      const start=snapPoint(rawPoint,gridSnap?snap:0);
      const end:[number,number,number]=[start[0]+4,start[1],start[2]];
      const markers=makeTeleporterPair(start,end,channel);
      commit({...doc,objectives:[...doc.objectives,...markers]},`Add paired CE teleporter channel ${channel}`);
      setSelected([markers[0].id]);setTab('properties');
      notify(`Created linked teleporter channel ${channel}. Move BOTH endpoints with XYZ handles; confirm terrain clearance in Halo.`);
    }catch(e){notify(String(e),'error');}
  }
  function enableAllGameStarts(){
    if(!doc.spawns.length){notify('Add player starting markers first.','error');return;}
    commit({...doc,spawns:doc.spawns.map(s=>({...s,gameModes:['allGames']}))},'Allow existing player starts for all five Halo CE modes');
    notify('Enabled all-five-mode eligibility for authored starts. Review team indices and safe spawn distances in Sapien before game tests.');
  }
  function add(item: PaletteItem, rawPoint: Vec3 = [0, 0, 0]) {
    const point = snapPoint(rawPoint, gridSnap ? snap : 0);
    if(item.type!=='brush'&&!pointInsideForgeRoom(doc,[point[0],point[1],point[2]+0.1])){
      notify('Choose a surface inside the sealed room. This drop is outside its source boundaries; no object was added.','error');return;
    }
    if (item.type === 'hillPolygon') { addPolygonHill(point); return; }
    if (item.type === 'teleportPair') { addTeleportPair(point); return; }
    let next = structuredClone(doc),
      id = '';
    if (item.type === 'brush') {
      if (doc.geometry.length >= 256) {
        notify('QuickForge currently supports at most 256 brushes.', 'error');
        return;
      }
      let brush = createBrush(item.kind, point, doc.materials[0]?.id ?? 'default');
      if (meshSnap) {
        try {
          const hit = snapBrushToAuthoredMesh(brush, doc.geometry);
          if (hit) {
            brush = { ...brush, position: hit.position };
            notify(`Snapped ${hit.kind === 'cave-rim' ? 'matching tunnel rims' : hit.kind === 'terrain-edge' ? 'matching terrain heightfield edges' : 'brush faces'} to authored source geometry. Game collision is not compiled.`);
          }
        } catch (error) { notify(`Mesh snap skipped: ${String(error)}`, 'error'); }
      }
      next.geometry.push(brush);
      id = brush.id;
    }
    if (item.type === 'spawn') {
      id = crypto.randomUUID();
      next.spawns.push({
        id,
        name: `Player start ${doc.spawns.length + 1}`,
        position: [point[0], point[1], point[2] + 0.1],
        facing: 0,
        team: doc.gameMode === 'teamSlayer' || doc.gameMode === 'ctf' ? doc.spawns.length % 2 : 0,
        gameModes: [doc.gameMode],
        visible: true,
        locked: false,
      });
    }
    if (item.type === 'objective') {
      if (doc.objectives.length>=200){notify('Classic Halo CE supports at most 200 netgame flags.','error');return;}
      if(item.kind==='raceVehicle' && doc.objectives.filter(o=>o.kind==='raceVehicle').length>=16){notify('Halo CE allows at most 16 Race vehicle spawn markers.','error');return;}
      const orphanEntry=doc.objectives.find(o=>o.kind==='teleportFrom'&&!doc.objectives.some(x=>x.kind==='teleportTo'&&netgameUsageId(x)===netgameUsageId(o)));
      const orphanExit=doc.objectives.find(o=>o.kind==='teleportTo'&&!doc.objectives.some(x=>x.kind==='teleportFrom'&&netgameUsageId(x)===netgameUsageId(o)));
      const nextId = item.kind==='raceCheckpoint'
        ? nextFreeRaceCheckpointId(doc)
        : item.kind==='raceVehicle'?0
        : item.kind==='teleportFrom'?(orphanExit?netgameUsageId(orphanExit):nextFreeTeleportChannel(doc))
        : item.kind==='teleportTo'?(orphanEntry?netgameUsageId(orphanEntry):nextFreeTeleportChannel(doc))
        : nextFreeUsageId(doc,item.kind);
      if (nextId===null || nextId>(item.kind==='raceCheckpoint'?31:15)){
        notify(`There is no free valid ${item.kind} usage ID. Edit or remove an existing marker first.`,'error');return;
      }
      id = crypto.randomUUID();
      next.objectives.push({
        id,
        name: `${item.kind} ${doc.objectives.length + 1}`,
        kind: item.kind,
        position: [point[0],point[1],point[2]+0.1],
        facing: 0,
        team: item.kind === 'raceCheckpoint' ? -1 : nextId,
        sequence: item.kind === 'raceCheckpoint' ? nextId : 0,
        visible: true,
        locked: false,
      });
    }
    if (item.type === 'asset') {
      const asset = assets.find((a) => a.key === item.key);
      if (!asset) {
        notify('This asset source is no longer selected. Choose it in the palette again.', 'error');
        return;
      }
      const placement = placeAsset(asset, [point[0], point[1], point[2] + 0.1]);
      next.placements.push(placement);
      id = placement.id;
    }
    if (item.type === 'zone') {
      if (!project.firefight) {
        notify('Create Firefight rules from an imported actor source first.');
        setTab('firefight');
        return;
      }
      id = crypto.randomUUID();
      edit(
        {
          ...project,
          firefight: {
            ...project.firefight,
            spawnZones: [
              ...project.firefight.spawnZones,
              { id, position: [point[0], point[1], point[2] + 0.1], radius: 2, enabled: true },
            ],
          },
        },
        'Place AI spawn zone',
      );
      setSelectedZone(id);
      setSelected([]);
      setTab('firefight');
      return;
    }
    commit(next, `Place ${item.type === 'brush' ? brushNames[item.kind] : item.type}`);
    setSelected([id]);
    setSelectedZone(null);
    setTab('properties');
  }
  function draggable(item: PaletteItem) {
    return {
      draggable: false,
      onPointerDown:(event:React.PointerEvent)=>{
        if(event.button!==0||event.pointerType==='touch')return;
        cancelledPointer.current=null;
        pointerDrag.current={item,x:event.clientX,y:event.clientY,pointerId:event.pointerId,moved:false};
      },
      onClickCapture:(event:React.MouseEvent)=>{
        if(Date.now()<suppressPaletteClick.current){event.preventDefault();event.stopPropagation();}
      },
      onDragStart: (event: React.DragEvent) => {
        event.preventDefault();
      },
      onDragEnd: () => {
        setDragging(null);
        setGhost(null);
      },
    };
  }
  async function loadWrl(file:File) {
    if (!/\.wrl$/i.test(file.name) || file.size===0 || file.size>2*1024*1024) {
      setDiagnosticError('Select a local .wrl Halo Tool file under 2 MiB.'); return;
    }
    try {
      const expectedDocument=doc;
      const raw=await file.text();
      if (latestProject.current.quickForge !== expectedDocument) throw new Error('Editor geometry changed during WRL import; reselect the diagnostic after your edit.');
      parseHaloWrl(raw,wrlCentimetres);
      setWrlSource(raw);
      setWrlLoadedSourceHash(preflight.sameDocument && report ? report.sourceSha256 : null);
      setWrlVisible(true);setWrlFocus(true);
      setDiagnosticError('');setFrame(v=>v+1);
      notify('Loaded local Halo Tool error geometry as a read-only overlay; it is not source geometry or compiled collision.');
    } catch(e){setDiagnosticError(`WRL rejected: ${String(e)}`);}
  }
  async function loadToolLog(file:File) {
    if (file.size===0 || file.size>512*1024 || !/\.(txt|log)$/i.test(file.name)) {
      setDiagnosticError('Select a .txt or .log Halo Tool report under 512 KiB.');return;
    }
    try {
      const expectedDocument=doc;
      const raw=await file.text();
      if(latestProject.current.quickForge !== expectedDocument)
        throw new Error('Source geometry changed during Tool log import; select the log after the current edit completes.');
      const result=analyzeHaloToolLog(raw);
      setToolLog(result);
      setToolLogLoadedSourceHash(preflight.sameDocument && report ? report.sourceSha256 : null);
      setDiagnosticError('');
    } catch(e){setDiagnosticError(`Tool log rejected: ${String(e)}`);}
  }
  async function exportSources() {
    if (!preflight.ready) { setExpandedBuild(true); setBuildError(`Source preflight blocked export: ${preflight.blockers.join(' | ')}`); return; }
    if (netgameBlocked) {setExpandedBuild(true);setBuildError(`Unsafe netgame flag data: ${netgameIssues.filter(i=>i.severity==='error').map(i=>i.message).join(' | ')}`);return;}
    const expectedDoc = doc;
    setExporting(true);
    setBuildError('');
    setExpandedBuild(true);
    try {
      await props.onSave();
      if (latestProject.current.quickForge !== expectedDoc) throw new Error('QuickForge changed while saving; rerun preflight before exporting.');
      setReceipt(await call<QuickForgeBuildReceipt>('quickforge_export', { projectId: project.id }));
    } catch (e) {
      setBuildError(String(e));
    } finally {
      setExporting(false);
    }
  }
  const filteredAssets = assets.filter(
    (asset) =>
      (!referenceFilter || referenceFilter.has(asset.tagId)) &&
      (category === 'all' || asset.class === category) &&
      `${asset.name} ${asset.path} ${asset.class}`.toLowerCase().includes(query.toLowerCase()),
  );
  const projectLogs = props.logs.filter((log) => log.projectId === project.id),
    lastLog = projectLogs.at(-1);
  const staleReceipt =
    !!receipt &&
    (props.dirty || (!!receipt.sources && !!report && receipt.sources.sourceSha256 !== report.sourceSha256));
  return (
    <div className="forge-workspace">
      <div className="forge-topbar">
        <div>
          <Layers3 size={18} />
          <strong>QuickForge</strong>
          <Pill>Original geometry</Pill>
          <span>
            {doc.geometry.length} brushes · {doc.placements.length} tag references · {doc.spawns.length}{' '}
            starts
          </span>
        </div>
        <button className="small-button" onClick={props.onNew}>
          <Plus size={13} />
          New map
        </button>
      </div>
      <div className="forge-main">
        <WorkspacePanel id="forge-palette" label="Build tools"><aside className="forge-hierarchy">
          <div className="forge-panel-heading">
            <strong>Scene hierarchy</strong>
            <Pill>{nodes.length}</Pill>
          </div>
          <p className="forge-hint">
            Shift-click to select several. Locked items cannot be moved or deleted.
          </p>
          {[...new Set(nodes.map(nodeCategory))].map((group) => (
            <div className="forge-tree-group" key={group}>
              <h3>{group}</h3>
              {nodes
                .filter((node) => nodeCategory(node) === group)
                .map((node) => (
                  <div
                    className={`forge-tree-row ${selected.includes(node.value.id) ? 'selected' : ''} ${errors.has(node.value.id) ? 'invalid' : ''}`}
                    key={node.value.id}
                  >
                    <button
                      className="forge-tree-select"
                      onClick={(event) =>
                        select(node.value.id, event.shiftKey || event.ctrlKey || event.metaKey)
                      }
                      title={node.value.name}
                    >
                      <span>
                        {node.type === 'brush' ? (
                          <Box size={13} />
                        ) : node.type === 'spawn' ? (
                          <Users size={13} />
                        ) : (
                          <Flag size={13} />
                        )}
                      </span>
                      <span>{node.value.name || node.value.id.slice(0, 8)}</span>
                    </button>
                    <button
                      aria-label={`${node.value.visible ? 'Hide' : 'Show'} ${node.value.name}`}
                      onClick={() =>
                        commit(
                          mapForgeNodes(doc, (n) =>
                            n.value.id === node.value.id
                              ? patchForgeNode(n, { visible: !n.value.visible })
                              : n,
                          ),
                          'Toggle editor visibility',
                        )
                      }
                    >
                      {node.value.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                    </button>
                    <button
                      aria-label={`${node.value.locked ? 'Unlock' : 'Lock'} ${node.value.name}`}
                      onClick={() =>
                        commit(
                          mapForgeNodes(doc, (n) =>
                            n.value.id === node.value.id
                              ? patchForgeNode(n, { locked: !n.value.locked })
                              : n,
                          ),
                          'Toggle object lock',
                        )
                      }
                    >
                      {node.value.locked ? <Lock size={12} /> : <Unlock size={12} />}
                    </button>
                  </div>
                ))}
            </div>
          ))}
          {!!project.firefight?.spawnZones.length && (
            <div className="forge-tree-group">
              <h3>AI spawn zones</h3>
              {project.firefight.spawnZones.map((zone, i) => (
                <button
                  className={`forge-tree-select ${selectedZone === zone.id ? 'selected' : ''}`}
                  key={zone.id}
                  onClick={() => {
                    setSelectedZone(zone.id);
                    setSelected([]);
                    setTab('firefight');
                  }}
                >
                  <Flag size={13} />
                  Zone {i + 1}
                </button>
              ))}
            </div>
          )}
          {!nodes.length && <p className="forge-hint">Add a sealed room from the palette to begin.</p>}
          <div className="forge-hierarchy-footer">
            <button className="small-button" disabled={!mutableNodes.length} onClick={duplicate}>
              <Copy size={13} />
              Duplicate
            </button>
            <button
              className="small-button"
              disabled={!mutableNodes.length && !selectedZone}
              onClick={remove}
            >
              <Trash2 size={13} />
              Delete
            </button>
          </div>
        </aside></WorkspacePanel>
        <section className="forge-center">
          <ForgeCollaboration projectId={project.id} document={doc} entries={data.entries} onShared={props.onSharedDocument} onSave={props.onSave}/>
          {props.onLive&&<button className="small-button" onClick={props.onLive}>Open live 3D mode</button>}
          <LiveForge project={project} document={doc} selected={selected}/>
          <div className="forge-toolbar">
            <IconButton
              label="Translate (W)"
              active={mode === 'translate'}
              onClick={() => setMode('translate')}
            >
              <Move3D size={17} />
            </IconButton>
            <IconButton label="Rotate (E)" active={mode === 'rotate'} onClick={() => setMode('rotate')}>
              <Rotate3D size={17} />
            </IconButton>
            <IconButton
              label="Resize brush (R)"
              active={mode === 'scale'}
              disabled={mutableNodes.length !== 1 || mutableNodes[0]?.type !== 'brush'}
              onClick={() => setMode('scale')}
            >
              <Scaling size={17} />
            </IconButton>
            <span className="toolbar-divider" />
            <IconButton label="Show grid" active={grid} onClick={() => setGrid(!grid)}>
              <Grid2X2 size={16} />
            </IconButton>
            <IconButton label="Frame arena (F)" onClick={() => {setWrlFocus(false);setFrame((v) => v + 1);}}>
              <Focus size={16} />
            </IconButton>
            <button type="button" className={gridSnap ? 'small-button active' : 'small-button'}
              aria-label="Toggle grid snapping (G)" aria-pressed={gridSnap} title="G: snap placements and transforms to an adjustable world-coordinate grid. Turn off for unrestricted positioning. Mesh Snap is independent."
              onClick={() => setGridSnap(!gridSnap)}>Grid snap {gridSnap ? 'on' : 'off'}</button>
            <select aria-label="Grid snap spacing" title="Distance between grid lines, in Halo world units. Applies only while Grid Snap is on." value={snap} onChange={(e) => setSnap(Number(e.target.value))}>
              <option value={0}>No grid interval</option>
              <option value={0.25}>¼ unit</option>
              <option value={0.5}>½ unit</option>
              <option value={1}>1 unit</option>
              <option value={2}>2 units</option>
            </select>
            <button type="button" className={meshSnap ? 'small-button active' : 'small-button'}
              aria-label="Toggle source mesh face, cave rim, and terrain edge snapping (M)" aria-pressed={meshSnap}
              title="M: align rectangular brush faces, matching cave rings and equal-height terrain borders. Exact cave and terrain seams lose duplicate source walls. No compiled Halo collision is created."
              onClick={() => setMeshSnap(!meshSnap)}>Mesh snap {meshSnap ? 'on' : 'off'}</button>
            <HelpTip help="Select an asset or brush to show the transform gizmo: red X, green Y and blue Z arrows. W move, E rotate, R resize brush. Hold RIGHT MOUSE to look; RMB + WASD flies; R/F up/down, Shift boost. Grid Snap and Mesh Snap are independent. Terrain/cave joints only qualify when exact; Halo Tool remains authoritative."/>
            <select
              title="Hold RMB to look and use WASD to fly (R/F up/down, Shift boost) in Orbit and Free fly. First person previews your map with optional collision based on regenerated source triangles—not Halo engine physics."
              aria-label="QuickForge camera"
              value={cameraMode}
              onChange={(e) => setCameraMode(e.target.value as ForgeCamera)}
            >
              <option value="orbit">Orbit</option>
              <option value="fly">Free fly</option>
              <option value="walk">First person</option>
              <option value="machinima">Machinima director</option>
            </select>
            {cameraMode==='machinima'&&<select aria-label="Machinima actor starting point" value={actorId||doc.spawns[0]?.id||''} onChange={event=>setActorId(event.target.value)}>{doc.spawns.map(spawn=><option key={spawn.id} value={spawn.id}>{spawn.name}</option>)}</select>}
            {cameraMode === 'walk' && <label title="Walk uses source triangle surfaces for bounded body collision and gravity. Changes are rebuilt during editing; this is not compiled Halo collision.">
              <input type="checkbox" checked={walkCollision} onChange={e=>setWalkCollision(e.target.checked)}/>
              Source collision
            </label>}
            <label>
              <input type="checkbox" checked={wireframe} onChange={(e) => setWireframe(e.target.checked)} />
              Wire
            </label>
            <label title="Show actual authored 1-point (2×2) or 3–8-point convex King-of-the-Hill zones as NON-COLLIDING editor overlays. Halo compiles the actual netgame flag records.">
              <input type="checkbox" checked={showHillAreas} onChange={event=>setShowHillAreas(event.target.checked)}/>
              Hill zones
            </label>
            <label title="Visualize ordered Race checkpoint paths and source-only teleporter channel links. These lines are never exported as Halo geometry or collision.">
              <input type="checkbox" checked={showGameRoutes} onChange={event=>setShowGameRoutes(event.target.checked)}/>
              Race / teleport paths
            </label>
            <label>
              <input type="checkbox" checked={cutaway} onChange={(e) => setCutaway(e.target.checked)} />
              Cutaway roof
            </label>
          </div>
          <div
            className={`forge-viewport ${dragging ? 'drag-active' : ''}`}
            onDragOver={(event) => {
              if (!dragging && !event.dataTransfer.types.includes(dragType)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
              const point = dropPoint.current?.(event.clientX, event.clientY);
              if (point) {
                const gridPoint = snapPoint(point, gridSnap ? snap : 0);
                if (meshSnap && dragging?.type === 'brush') {
                  const ghostBrush = createBrush(dragging.kind, gridPoint, doc.materials[0]?.id ?? 'default');
                  try {
                    const hit = snapBrushToAuthoredMesh(ghostBrush, doc.geometry);
                    setGhost(hit?.position ?? gridPoint);
                  } catch { setGhost(gridPoint); }
                } else setGhost(gridPoint);
              }
            }}
            onDragLeave={() => setGhost(null)}
            onDrop={(event) => {
              event.preventDefault();
              try {
                const text = event.dataTransfer.getData(dragType);
                const item: PaletteItem = text ? JSON.parse(text) : dragging;
                if (item && ['brush', 'spawn', 'objective', 'asset', 'zone', 'hillPolygon', 'teleportPair'].includes(item.type)) {
                  const hit=dropPoint.current?.(event.clientX, event.clientY) ?? ghost;
                  if (item.type==='hillPolygon' && !hit) throw new Error('Point to an editable map surface to place a King hill. No geometry is changed.');
                  add(item, hit ?? [0, 0, 0]);
                }
              } catch (e) {
                notify(`Drop could not be applied: ${String(e)}`, 'error');
              } finally {
                setGhost(null);
                setDragging(null);
              }
            }}
          >
            <ForgeViewport
              sessionId={project.id}
              renderFeatures={project.renderFeatures}
              document={doc}
              showHillAreas={showHillAreas}
              showGameRoutes={showGameRoutes}
              snapshot={snapshot}
              selected={selected}
              onSelect={select}
              onTransform={(updated) => {
                try {
                  let snapped: ForgeNode[] = updated;
                  const only = updated[0];
                  if (meshSnap && mode === 'translate' && updated.length === 1 && only.type === 'brush') {
                    const hit = snapBrushToAuthoredMesh(only.value, doc.geometry);
                    if (hit) {
                      notify(`Aligned ${hit.kind === 'cave-rim' ? 'matching cave rims' : hit.kind === 'terrain-edge' ? 'matching terrain tile edges' : 'source brush faces'}; exact matching cave rims and terrain borders are joined by the source generator. Halo collision remains unverified.`);
                      snapped = [{type: 'brush', value: {...only.value, position: hit.position}}];
                    }
                  }
                  const byId = new Map(snapped.map((node) => [node.value.id, node]));
                  commit(
                    mapForgeNodes(doc, (node) => byId.get(node.value.id) ?? node),
                    `Transform ${updated.length} object(s)`,
                  );
                } catch (e) {
                  notify(String(e), 'error');
                }
              }}
              mode={mode}
              snap={gridSnap ? snap : 0}
              grid={grid}
              wireframe={wireframe}
              cutaway={cutaway}
              cameraMode={cameraMode}
              spawnModelSource={spawnModelSource??undefined}
              actorId={actorId}
              walkCollision={walkCollision}
              wrlOverlay={wrlStale ? null : wrlParse.value}
              showWrlOverlay={wrlVisible && !wrlStale}
              focusWrlOverlay={wrlFocus && !wrlStale}
              frame={frame}
              errors={errors}
              dropPoint={dropPoint}
              ghost={ghost}
              zones={project.firefight?.spawnZones ?? []}
            selectedZone={selectedZone}
            onZoneSelect={(id) => { setSelectedZone(id); setSelected([]); setTab('firefight'); }}
            onZoneMove={(id, position) => { if (project.firefight) edit({ ...project, firefight: { ...project.firefight, spawnZones: project.firefight.spawnZones.map((zone) => zone.id === id ? { ...zone, position } : zone) } }, 'Move AI spawn zone'); }}
            onError={(message) => notify(message, 'error')}
            />
            <div className="forge-viewport-badges">
              <Pill tone={preflight.ready ? 'green' : 'amber'}>
                {previewBusy
                  ? 'Updating geometry…'
                  : preflight.ready
                    ? 'Current geometry validated'
                    : 'Source preflight pending / blocked'}
              </Pill>
              {wrlSource && <Pill tone={wrlStale ? 'amber' : 'green'}>Halo Tool WRL {wrlStale ? 'STALE · reimport after build' : `${wrlParse.value?.segments.length ?? 0} edges / ${wrlParse.value?.faces.length ?? 0} faces`}</Pill>}
              {cutaway && <Pill>Roof hidden in editor only</Pill>}
              {cameraMode === 'walk' && <Pill tone={walkCollision && snapshot ? 'green' : 'amber'}>Source collision {walkCollision && snapshot ? 'simulation ON' : 'OFF / pending'} · NOT Halo physics</Pill>}
              <Pill>Grid snap {gridSnap ? `${snap}u` : 'off'} · Mesh snap {meshSnap ? 'on' : 'off'}</Pill>
              <span className="forge-axis-legend" aria-label="Move gizmo: X red, Y green, Z blue" title="Select a brush or asset, choose Move (W), and drag one colored arrow to adjust a single coordinate. Changes update source geometry and the next live collision preview."><b className="gs-axis-x">X</b><b className="gs-axis-y">Y</b><b className="gs-axis-z">Z</b> gizmo</span>
              {terrainJoins.length>0 && <><Pill tone="green">{terrainJoins.length} terrain source seam{terrainJoins.length===1?'':'s'}</Pill><HelpTip help={describeTerrainJoins(doc)}/></>}
            </div>
            {cameraMode === 'walk' && (
              <button className="forge-enter-walk" title="Click to lock mouse and walk on locally generated source mesh. W/A/S/D moves; Shift sprints; Escape releases. No live connection to Halo.">Enter walk sandbox · Esc releases</button>
            )}
            <div className="forge-viewport-note">
              {cameraMode === 'fly'
                ? 'Hold RMB + drag to look · RMB + WASD fly · R/F up/down · Shift boost'
                : cameraMode === 'walk'
                  ? walkCollision ? 'WASD walk · Shift sprint · Esc releases pointer · source mesh collision/gravity simulated (not Halo runtime).' : 'WASD move · Source collision disabled: free camera translation.'
                  : 'Orbit: left-drag · Hold RMB + WASD to fly/look · wheel zoom · Shift-click multi-select'}
              <br />
              G: grid snap · M: mesh snap. Mesh snapping moves source geometry only; it never recompiles collision or portals.
              <br />
              Halo placements load their actual world models from the preserved source map. Unavailable model dependencies appear in the viewport status.
            </div>
          </div>
        </section>
        <WorkspacePanel id="forge-inspector" label="Inspector"><aside className="forge-inspector">
          <div className="forge-panel-tabs">
            <button className={tab === 'palette' ? 'selected' : ''} onClick={() => setTab('palette')}>
              Palette
            </button>
            <button className={tab === 'properties' ? 'selected' : ''} onClick={() => setTab('properties')}>
              Properties
            </button>
            <button className={tab === 'firefight' ? 'selected' : ''} onClick={() => setTab('firefight')}>
              Firefight
            </button>
            <button className={tab === 'sound' ? 'selected' : ''} onClick={() => setTab('sound')}>Sound</button>
          </div>
          <div className="forge-inspector-scroll">
            <RenderFeatures project={project} edit={props.edit}/>
            {tab==='sound'&&<><label>Sound source map<select aria-label="QuickForge sound source map" value={sourceId} onChange={e=>setSourceId(e.target.value)}><option value="">Choose an imported source map</option>{sources.map(source=><option key={source.id} value={source.id}>{source.title}</option>)}</select></label>{sourceOpen?.inspection?<MapSounds key={sourceOpen.project.id} project={project} edit={props.edit} projectId={sourceOpen.project.id} inspection={sourceOpen.inspection}/>:<p>Open an imported map as a sound source. Emitter positions belong to this QuickForge map; original audio stays in its preserved source project.</p>}</>}
            {tab === 'palette' && (
              <>
                <div className="forge-panel-heading">
                  <strong>Original geometry</strong>
                  <Pill>Editable</Pill>
                  <HelpTip help="Drag to place a source brush, or click to add at the origin. Snap G/M governs alignment. All primitives regenerate a source mesh and undergo bounded validation; only Halo Tool/Invader can create verified game collision."/>
                </div>
                <div className="forge-brush-palette">
                  {(Object.keys(brushNames) as BrushKind[]).map((kind) => (
                    <button
                      key={kind}
                      {...draggable({ type: 'brush', kind })}
                      title={kind==='terrain' ? 'Editable gridded terrain. Sculpt hills and align identical boundary samples with Mesh Snap (M). The walk sandbox uses its generated triangles; Halo collision needs Tool.' : kind==='caveTunnel' ? 'Hollow annular cave tunnel. Matching opposite-facing rims can source-weld. A cave-to-room entrance still needs CSG, portals and collision compilation.' : `${brushNames[kind]}: editable source geometry; choose this brush, then use Properties or the transform gizmo. Build requires compatible Halo Tool.`}
                      onClick={() => add({ type: 'brush', kind })}
                    >
                      <Box size={19} />
                      <span>{brushNames[kind]}</span>
                    </button>
                  ))}
                </div>
                <p className="forge-hint">
                  Click to add at the origin, or drag onto a floor or surface. Resize using Properties or the
                  scale gizmo.
                </p>
                <div className="forge-panel-heading">
                  <strong>Scenario tools</strong>
                  <HelpTip help="Spawn points, objective markers and AI zones author scenario metadata. They do not create game entities until the scenario/tag pipeline compiles them."/>
                </div>
                <div className="forge-brush-palette">
                  <button title="Add a player starting marker to the scenario source; the Halo scenario must be compiled and tested for spawn validity." {...draggable({ type: 'spawn' })} onClick={() => add({ type: 'spawn' })}>
                    <Users size={18} />
                    Player start
                  </button>
                  {(
                    [
                      ['ctfFlag', 'CTF flag'],
                      ['hill', 'Hill'],
                      ['oddball', 'Oddball'],
                      ['raceCheckpoint', 'Race checkpoint'],
                      ['raceVehicle', 'Race vehicle start'],
                      ['teleportFrom', 'Teleporter entrance'],
                      ['teleportTo', 'Teleporter exit'],
                    ] as const
                  ).map(([kind, title]) => (
                    <button
                      key={kind}
                      {...draggable({ type: 'objective', kind })}
                      title={`Add a ${title} objective marker to the source scenario. Requires a compatible gametype and engine validation.`}
                      onClick={() => add({ type: 'objective', kind })}
                    >
                      <Flag size={17} />
                      {title}
                    </button>
                  ))}
                  <button title="Place an editor Firefight AI zone. Actual AI encounters, navigation and networking must be built into the Halo scenario and verified in-game." {...draggable({ type: 'zone' })} onClick={() => add({ type: 'zone' })}>
                    <Flag size={17} />
                    AI spawn zone
                  </button>
                </div>
                <div className="forge-gametype-panel">
                  <div className="forge-panel-heading"><strong>Halo CE game modes</strong><HelpTip help="A Halo 1 multiplayer scenario can support all five classic modes simultaneously. Map objective flags define actual gameplay areas; selection of a game type alone does not add flags or native game rules." /></div>
                  <p className="forge-hint">Click a mode to work on it. These checks reflect EDITABLE source only; Sapien, Tool and real gameplay must still confirm the netgame records.</p>
                  <button type="button" className="small-button" title="Create a read-only five-mode manual QA checklist for Sapien, Tool, live map loading and two-client tests. Every test is NOT RUN; no game results are invented."
                    onClick={()=>{try{
                      const plan=makeFiveModeTestPlan(doc);
                      const name=doc.name.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,48)||'guilty_spark';
                      downloadLocalText(`${name}_five_mode_test_plan.json`,JSON.stringify(plan,null,2),'application/json;charset=utf-8');
                      notify('Five stock Halo 1 game-mode QA plan exported. All 20 live checks are NOT RUN; use Creator Studio to record real evidence.');
                    }catch(e){notify(`Five-mode QA plan refused: ${String(e)}`,'error');}}}>
                    Export five-mode manual QA plan (.json)
                  </button>
                  <div className="forge-panel-heading"><strong>Spawn layout · source review</strong><HelpTip help="Reclaimers/Bungie spawn design guidance, not a simulation of Halo spawn collision or CTF scoring. Historic recommendation: 16 per team, with real game testing required."/></div>
                  <p className="forge-hint">{doc.spawns.length} authored starts · CTF red {spawnReview.ctfTeamEligible.red} / blue {spawnReview.ctfTeamEligible.blue} · {spawnReview.totalFindings} advisory finding(s). <strong>Not tested in Halo.</strong></p>
                  <button type="button" className="small-button" title="Export a bounded, non-executable source-only spawn layout review; does not include coordinates or copied game content."
                    onClick={()=>{try{
                      const filename=doc.name.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,48)||'guilty_spark';
                      downloadLocalText(`${filename}_spawn_review.json`,JSON.stringify(spawnReview,null,2),'application/json;charset=utf-8');
                      notify('Spawn source-review JSON exported; validate real spawns and CTF team safety in Halo before signoff.');
                    }catch(e){notify(`Spawn review export failed: ${String(e)}`,'error');}}}>Export spawn layout review (.json)</button>
                  {spawnReview.findings.length>0&&<details><summary>Spawn design cautions · {spawnReview.totalFindings}</summary>
                    {spawnReview.findings.map((finding,index)=><button type="button" className="forge-issue" key={`${finding.code}-${index}`} title="Focus the source marker(s), then manually verify in Sapien and Halo" onClick={()=>{if(finding.ids.length){setSelected(finding.ids);setTab('properties');}}}><strong>{finding.severity}: {finding.code}</strong><span>{finding.message}</span></button>)}
                    {spawnReview.omittedFindings>0&&<p className="forge-hint">{spawnReview.omittedFindings} additional cautions not displayed.</p>}
                  </details>}
                  <div className="forge-gametype-matrix">
                    {gameChecklist.map(entry=><button type="button" key={entry.mode} className={doc.gameMode===entry.mode?'active':''} title={entry.notes.length?entry.notes.join('; '):'Source-only marker checklist passes; game not yet tested.'} onClick={()=>commit({...doc,gameMode:entry.mode},`Select ${entry.label} map rules`)}>
                      <span>{entry.label}</span><span>{entry.ready?'Source checks ✓':`${entry.notes.length} checks`}</span>
                    </button>)}
                  </div>
                  <div className="forge-brush-palette">
                    <button type="button" title="Place four editable hill boundary markers as a 5×5 convex square with one shared usage ID. Each corner is movable with XYZ arrows. Compiled Halo CE King game rules read these flags." {...draggable({type:'hillPolygon'})} onClick={()=>addPolygonHill()}><Flag size={17}/> Add four-corner hill · drag into map</button>
                    <button type="button" title="Create one entrance and one exit on a fresh Halo CE teleporter channel, in a single undoable project edit. Endpoints must be moved and verified for collision and loop safety." {...draggable({type:'teleportPair'})} onClick={()=>addTeleportPair()}><Flag size={17}/> Add linked teleporter pair</button>
                    <button type="button" title="Opt all existing player starts into the five stock Halo CE multiplayer modes. Review teams/locations; this does not validate engine spawn clearance." disabled={!doc.spawns.length} onClick={enableAllGameStarts}><Users size={17}/> Starts: all five modes</button>
                  </div>
                  <p className="forge-hint">King: one marker = 2×2 zone; 3–8 markers with the same hill ID = convex area. <strong>Never use exactly two.</strong> Crazy King needs multiple hill groups. Race checkpoints use consecutive IDs (0–31); Race vehicle markers are separate (maximum 16). Teleporter entrances/exits share channel 0–15; both ends are required.</p>
                  {hillAreas(doc.objectives).map(a=><p key={a.usageId} className="forge-hint">Hill {a.usageId}: {a.markerIds.length} point{a.markerIds.length===1?'':'s'} · {a.valid?(a.shape==='single'?'2×2 single point':'convex polygon'):'INVALID / cannot export'}</p>)}
                  {netgameIssues.length>0&&<details open={netgameBlocked}><summary title="Review engine-critical netgame flag integrity. Severe errors block safe export.">Netgame check · {netgameIssues.filter(i=>i.severity==='error').length} blockers / {netgameIssues.filter(i=>i.severity==='warning').length} cautions</summary>
                    {netgameIssues.map((i,n)=><button type="button" key={`${i.code}-${n}`} className={`forge-issue ${i.severity}`} onClick={()=>{if(i.ids.length){setSelected(i.ids);setTab('properties');}}}><strong>{i.severity}: {i.code}</strong><span>{i.message}</span></button>)}
                  </details>}
                </div>
                <div className="forge-panel-heading">
                  <strong>Imported Halo tag references</strong>
                  <HelpTip help="Imported .map cache references identify real weapon, vehicle, character and scenery tag paths. A tag reference is not a .tag file; use verified extraction and build workflows to transfer game assets."/>
                </div>
                <label className="forge-field">
                  Source project
                  <select
                    aria-label="Asset source project"
                    value={sourceId}
                    onChange={(e) => setSourceId(e.target.value)}
                  >
                    <option value="">Import a Halo map first</option>
                    {sources.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.title} · cache {entry.version}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="forge-source-transfer">
                  <p className="forge-hint">Transfer references between compatible local maps. Exact source SHA-256, cache version, class, path, and tag ID are checked. This does <strong>not</strong> extract binary Halo tags.</p>
                  <div className="forge-transfer-buttons">
                    <button title="Export tag identities and dependency metadata, not the .tag bytes. Compatible maps must verify the original source SHA-256." type="button" className="small-button" disabled={!sourceOpen || !filteredAssets.length} onClick={() => {
                      try {
                        if (!sourceOpen) throw new Error('Select an imported map');
                        const bundle=createTagExchangeBundle(sourceOpen,filteredAssets.slice(0,128).map(asset=>asset.tagId));
                        downloadLocalText(`gs_tag_refs_${sourceOpen.inspection!.sha256.slice(0,10)}.json`,JSON.stringify(bundle,null,2),'application/json');
                        notify(`Exported ${bundle.tags.length} tag identities and dependencies (references only, not game data).`);
                      } catch (e) { notify(`Export rejected: ${String(e)}`,'error'); }
                    }}>Export visible refs</button>
                    <button title="Load a previously exported tag-reference JSON and verify it against this exact source map. Does not import model/tag binaries." type="button" className="small-button" disabled={!sourceOpen} onClick={() => exchangePicker.current?.click()}>Import refs</button>
                    {referenceFilter && <button type="button" className="small-button" onClick={() => setReferenceFilter(null)}>Clear filter</button>}
                  </div>
                  <input ref={exchangePicker} type="file" accept=".json,application/json" hidden aria-label="Import tag reference JSON"
                    onChange={(event) => {
                      const file=event.currentTarget.files?.[0];event.currentTarget.value='';
                      if (!file) return;
                      if (!sourceOpen || file.size>524288 || !file.size) {notify('Select a source map and a JSON manifest under 512 KiB.','error');return;}
                      const expected=sourceOpen.inspection?.sha256;
                      void file.text().then(text=>{
                        if (currentSourceId.current !== sourceOpen.project.id || sourceOpen.inspection?.sha256!==expected) throw new Error('Map source changed during import');
                        const bundle=parseTagExchangeBundle(text);
                        const resolved=resolveTagExchangeBundle(bundle,sourceOpen);
                        if (resolved.missing.length) throw new Error(`${resolved.missing.length} tag identities could not be verified against this exact map`);
                        const allowable=new Set(resolved.matched.filter(tag=>assets.some(a=>a.tagId===tag.id)).map(tag=>tag.id));
                        if (!allowable.size) throw new Error('No placeable tag references in this bundle');
                        setReferenceFilter(allowable);
                        notify(`${allowable.size} exact source tag references available in the palette. ${resolved.unresolvedDependencies} dependencies need extraction/review; game content was not imported.`);
                      }).catch(error=>notify(`Reference import rejected: ${String(error)}`,'error'));
                    }} />
                  {referenceFilter && <p className="forge-hint">Reference shelf: {referenceFilter.size} verified tags. Click or drag a tag below to place its source reference.</p>}
                </div>
                <div className="search-input">
                  <Search size={13} />
                  <input
                    aria-label="Search asset palette"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search actual tag paths…"
                  />
                </div>
                <select
                  aria-label="Asset class"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="all">All placeable classes</option>
                  {(
                    [
                      ['weap', 'Weapons'],
                      ['eqip', 'Equipment / powerups'],
                      ['vehi', 'Vehicles'],
                      ['scen', 'Scenery'],
                      ['bipd', 'Characters'],
                      ['itmc', 'Item collections'],
                    ] as const
                  ).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
                {assetError && <Notice>{assetError}</Notice>}
                <p className="forge-hint">
                  These are real source tag references. Extraction, dependencies and target compatibility are
                  checked by the build; no Halo model is substituted.
                </p>
                <div className="forge-asset-palette">
                  {filteredAssets.slice(0, 150).map((asset) => (
                    <button
                      key={asset.key}
                      {...draggable({ type: 'asset', key: asset.key })}
                      onClick={() => add({ type: 'asset', key: asset.key })}
                      title={asset.path}
                    >
                      <span className="tag-class">{asset.class}</span>
                      <span>
                        <strong>{asset.name}</strong>
                        <small>{asset.path}</small>
                        <em>Cache {asset.cacheVersion} · source world model</em>
                      </span>
                    </button>
                  ))}
                </div>
                {filteredAssets.length > 150 && (
                  <p className="forge-hint">
                    Showing 150 of {filteredAssets.length}. Narrow the search to find another tag.
                  </p>
                )}
                {!filteredAssets.length && (
                  <p className="forge-hint">
                    No matching placeable tags. Select an imported source with the required content.
                  </p>
                )}
              </>
            )}
            {tab === 'properties' && (
              <ForgeProperties document={doc} chosen={chosen} changeNode={changeNode} commit={commit} notify={notify} />
            )}
            {tab === 'firefight' && (
              <Firefight
                project={project}
                entries={data.entries}
                edit={edit}
                compact
                selectedZone={selectedZone}
                onSelectZone={(id) => {
                  setSelectedZone(id);
                  setSelected([]);
                }}
              />
            )}
          </div>
        </aside></WorkspacePanel>
      </div>
      <section className={`forge-build-panel ${expandedBuild ? 'expanded' : ''}`}>
        <div className="forge-build-heading">
          <button className="forge-build-summary" onClick={() => setExpandedBuild(!expandedBuild)}>
            <Hammer size={17} />
            <strong>{project.title}</strong>
            <Pill tone={receipt?.status === 'validated' && !staleReceipt ? 'green' : 'muted'}>
              {props.activeJob
                ? (lastLog?.phase ?? 'Building')
                : staleReceipt
                  ? 'Last result · edits changed'
                  : (receipt?.status ?? 'Not built')}
            </Pill>
            <span>
              {report
                ? `${report.vertices} vertices · ${report.triangles} triangles`
                : 'Geometry validation pending'}
            </span>
          </button>
          <div className="forge-build-actions">
            <button disabled={exporting || !!props.activeJob || !preflight.ready || scenarioRiskErrors || netgameBlocked} title={preflight.ready && !scenarioRiskErrors && !netgameBlocked ? 'Export validated JMS sources in an isolated staging folder; not a playable Halo cache.' : preflight.blockers.join(' ')} onClick={() => void exportSources()}>
              <Download size={14} />
              {exporting ? 'Exporting…' : 'Export JMS sources'}
            </button>
            <button
              className="primary"
              disabled={exporting || !!props.activeJob || !preflight.ready || scenarioRiskErrors || netgameBlocked}
              title={preflight.ready && !scenarioRiskErrors && !netgameBlocked ? 'Run the configured Halo Tool against an isolated build; compiler and game evidence remain required.' : preflight.blockers.join(' ')}
              onClick={() => {
                if (!preflight.ready || scenarioRiskErrors || netgameBlocked) { setBuildError([...preflight.blockers,...scenarioRisks.filter(x=>x.severity==='error').map(x=>x.message)].join(' | ')); return; }
                setBuildError('');
                setExpandedBuild(true);
                void props.onBuild().catch((e) => setBuildError(String(e)));
              }}
            >
              <Hammer size={14} />
              {props.activeJob ? 'Build running…' : 'Build & check playtest'}
            </button>
          </div>
        </div>
        {props.activeJob && (
          <div className="progress-track">
            <div style={{ width: `${Math.max(lastLog?.progress ?? 0, 2)}%` }} />
          </div>
        )}
        {(expandedBuild || !!geometryError || !!buildError) && (
          <div className="forge-build-content">
            {project&&<BuildTargets project={project} defaults={data.settings} onChange={p=>props.edit(p,'Configure engine build targets')}/> }
            <div>
              <div className="forge-build-config">
                <label>
                  Runtime target
                  <select
                    aria-label="Build runtime target"
                    disabled={!!project?.activeBuildTarget}
                    value={doc.runtimeId}
                    onChange={(e) =>
                      commit(
                        { ...doc, runtimeId: e.target.value as RuntimeId },
                        'Change QuickForge runtime target',
                      )
                    }
                  >
                    {Object.entries(forgeTargets).map(([id, title]) => (
                      <option key={id} value={id}>
                        {title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Build quality
                  <select
                    value={doc.buildQuality}
                    onChange={(e) =>
                      commit(
                        { ...doc, buildQuality: e.target.value as 'draft' | 'final' },
                        'Change build quality',
                      )
                    }
                  >
                    <option value="draft">Draft</option>
                    <option value="final">Final</option>
                  </select>
                </label>
              </div>
              <p className="forge-hint">
                Halo Tool: {data.settings.hekDirectory ?? 'not configured'}
                <br />
                Source tag root: {data.settings.hekTagsDirectory ?? 'not configured'}
              </p>
              <div className="analysis-actions">
                <button className="small-button" onClick={props.onSettings}>
                  Configure build tools
                </button>
                <button className="small-button" onClick={props.onRuntimes}>
                  Runtime &amp; host options
                </button>
                {props.activeJob && (
                  <button
                    className="small-button"
                    onClick={() =>
                      void call('cancel_build', { jobId: props.activeJob }).catch((e) =>
                        notify(String(e), 'error'),
                      )
                    }
                  >
                    Cancel build
                  </button>
                )}
              </div>
              {caveReview.ports.length > 0 && <Notice tone="info">
                Cave topology preflight: {caveReview.ports.length} tunnel mouths, {caveReview.weldedPairs} matching source seam pairs, {caveReview.unpaired.length} unmatched mouths.
                Matching polygon rims are welded during Rust preview/JMS generation by removing duplicate annular cap faces. This does not cut through a room or terrain, nor compile Halo collision, portals, PVS, lighting or navigation.
                {caveReview.candidates.some(c=>!c.sourceWeldEligible) && ' Some neighboring mouths have incompatible geometry or ambiguous matching.'}
              </Notice>}
              {(caveSafety.error || (caveSafety.result?.issues.length ?? 0) > 0) && <details className="forge-tool-diagnostics" open>
                <summary title="Source-only extension collision guard. Repairs are limited to a unique, exact polygon rim translation, never compiled BSP mutation.">Tunnel extension / collision safety · {caveSafety.result?.issues.length ?? 0} issue(s)</summary>
                {caveSafety.error && <Notice tone="warning">Cave inspection failed closed: {caveSafety.error}</Notice>}
                {caveSafety.result?.issues.slice(0,16).map((issue,index)=><div key={`${issue.code}-${index}`} className={`forge-issue ${issue.severity}`}>
                  <strong>{issue.code}</strong><span>{issue.message}</span>
                  <button type="button" className="small-button" onClick={()=>{setSelected(issue.brushIds);setTab('properties');}}>Select related brushes</button>
                </div>)}
                {caveSafety.result?.corrections.map((proposal,index)=><button key={`${proposal.movingBrushId}-${proposal.targetBrushId}-${index}`}
                  type="button" className="small-button" title="Recheck the current source, then translate only the unlocked tunnel. Creates a normal undoable QuickForge edit. Does NOT repair Halo collision tags."
                  disabled={exporting || !!props.activeJob}
                  onClick={()=>{try{
                    const next=applyCaveSeamSnap(doc,proposal);
                    commit(next,`Snap tunnel ${proposal.movingBrushId} to exact source rim`);
                    setSelected([proposal.movingBrushId]);setTab('properties');
                    notify('Source tunnel rim snapped. Revalidate generated mesh and compile with Halo Tool to check BSP collision.');
                  }catch(e){notify(`Tunnel source correction refused: ${String(e)}`,'error');}}}>
                  Snap verified source seam · {proposal.distance.toFixed(3)} units (undoable)
                </button>)}
                <p className="forge-hint">A tunnel touching a solid room wall is NOT a carved doorway. Unsupported room/terrain Boolean cuts and compiled BSP collision must be rebuilt and tested in Halo Tool.</p>
              </details>}
              <p className="forge-hint">
                Source export is not a compiled BSP or playable map. Packaging and launch require a validated
                target output. No host or lobby is simulated.
              </p>
            </div>
            <div className="forge-build-diagnostics">
              <Notice tone={preflight.ready ? 'info' : 'warning'}>Source integrity preflight: {preflight.ready ? `${preflight.triangles} validated source triangles; editing session matches current Rust geometry report. Export is permitted, but playability is not verified.` : preflight.blockers.join(' | ')}</Notice>
              {scenarioRisks.length > 0 && <details className="forge-tool-diagnostics" open={scenarioRiskErrors}>
                <summary title="Conservative checks against old scenario-editor failure modes: colliding player starts, conflicting tag origins, AI budgets and missing resources. Real game validation is still required.">Legacy scenario safety · {scenarioRisks.filter(r=>r.severity==='error').length} blockers / {scenarioRisks.filter(r=>r.severity==='warning').length} cautions</summary>
                {scenarioRisks.map((risk,index)=><div key={`${risk.code}-${index}`} className={`forge-issue ${risk.severity}`}>
                  <strong>{risk.severity} · {risk.code}</strong><span>{risk.message}</span>
                </div>)}
              </details>}
              {preflight.warnings.length > 0 && <p className="forge-hint" title={preflight.warnings.join(' | ')}>Source cautions: {preflight.warnings.length} · hover to read</p>}
              {meshReview && <details className="forge-tool-diagnostics" aria-label="BSP source topology review">
                <summary title="Position-based seam analysis of current QuickForge source mesh; the Halo BSP compiler remains the authority.">
                  BSP source topology · {meshReview.boundaryEdges} open / {meshReview.nonManifoldEdges} non-manifold / {meshReview.windingConflicts} winding-conflicted / {meshReview.tJunctionEdges} possible T-junction edges
                </summary>
                <p className="forge-hint">{meshReview.checkedTriangles} triangles across {meshReview.connectedShellCandidates} connected source shell candidates ({meshReview.edgeClosedShellCandidates} edge-closed; {meshReview.openShellCandidates} with exposed edges). {meshReview.degenerateTriangles} collapsed triangles; {meshReview.duplicateFaces} duplicate faces; {meshReview.shortEdges} short edges. Vertex-on-edge T-junction scan: {meshReview.tJunctionScanComplete ? 'complete within bounded budget' : 'INCOMPLETE — do not interpret zero as clean'} ({meshReview.tJunctionCandidatesChecked.toLocaleString()} point candidates checked).</p>
                <p className="forge-hint">Flat-shaded vertices are matched by position for this read-only check. Open edges can be intentional with special Halo materials; even an edge-closed source is NOT proven watertight, collision-safe, portal-valid or playable. Inspect actual Halo Tool structure logs and WRL results.</p>
                <div className="analysis-actions">
                  <button className="small-button" title="Export source-only counts and triangle indices tied to the current Rust source SHA-256. No map, coordinates, tag paths or game data are included." onClick={() => {
                    try {
                      const payload = makeHaloBspSourceReport(report?.sourceSha256 ?? '', preflight);
                      const safeName = (doc.name || 'source').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,48) || 'source';
                      downloadLocalText(`${safeName}_bsp_topology_review.json`, JSON.stringify(payload,null,2), 'application/json;charset=utf-8');
                    } catch(e) { notify(String(e),'error'); }
                  }}>Export BSP topology review</button>
                  {([['Open edge',meshReview.exampleBoundaryTriangles],['Non-manifold edge',meshReview.exampleNonManifoldTriangles],['Winding conflict',meshReview.exampleWindingTriangles],['Possible T-junction',meshReview.exampleTJunctionTriangles],['Degenerate triangle',meshReview.exampleDegenerateTriangles],['Duplicate face',meshReview.exampleDuplicateTriangles]] as [string,number[]][]).map(([label,examples]) => examples.length ?
                    <button className="small-button" key={label} title={`Select the editable brush containing source triangle ${examples[0]}. No geometry is modified.`} onClick={() => selectMeshDiagnosticTriangle(examples)}>Select {label.toLowerCase()} brush</button> : null)}
                </div>
              </details>}
              <div className="forge-tool-diagnostics">
                <div className="forge-panel-heading">
                  <strong>Halo Tool error geometry</strong>
                  <HelpTip help="Load a .wrl produced by Halo 1 Tool after a structure build. Its red/green/yellow error edges and faces appear on top of QuickForge. This is independent of the editor's simulated collision; repair source geometry and rerun Tool. Halo 2+ VRML 2 is not supported." />
                </div>
                <div className="analysis-actions">
                  <button className="small-button" title="Read a local Halo 1 Tool .wrl (VRML 1.0). Never writes to source maps or runs Tool." onClick={() => wrlPicker.current?.click()}>Import Tool .wrl</button>
                  <button className="small-button" title="Read a saved local Halo Tool stdout/stderr log and associate it with the currently validated source revision. Editing the source invalidates this association." onClick={() => toolLogPicker.current?.click()}>Inspect Tool log</button>
                  {wrlSource && <>
                    <button className="small-button" title="Show or hide the read-only compiler error overlay." disabled={wrlStale} onClick={() => setWrlVisible(v => !v)}>{wrlVisible ? 'Hide errors' : 'Show errors'}</button>
                    <button className="small-button" title="Move the camera to imported compiler error geometry; press Frame arena to return." disabled={wrlStale || !wrlParse.value} onClick={() => {setWrlFocus(true);setFrame(v=>v+1);}}>Frame WRL</button>
                    <button className="small-button" title="Forget local compiler diagnostic geometry, not the actual source files." onClick={() => {setWrlSource(null);setWrlFocus(false);setWrlLoadedSourceHash(null);setFrame(v=>v+1);}}>Clear WRL</button>
                  </>}
                  {toolLog && <button className="small-button" onClick={() => {setToolLog(null);setToolLogLoadedSourceHash(null);}} title="Clear in-memory log classification and its source association only.">Clear log</button>}
                </div>
                <input hidden type="file" accept=".wrl" ref={wrlPicker} aria-label="Import Halo 1 Tool WRL diagnostic" onChange={event => {
                  const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(file)void loadWrl(file);
                }}/>
                <input hidden type="file" accept=".txt,.log,text/plain" ref={toolLogPicker} aria-label="Import Halo Tool log" onChange={event => {
                  const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(file)void loadToolLog(file);
                }}/>
                {wrlSource && <label className="forge-hint" title="Halo 1 Tool WRL coordinates normally use source centimetres, while Guilty Spark works in world metres.">
                  <input type="checkbox" checked={wrlCentimetres} onChange={event => setWrlCentimetres(event.target.checked)} /> Convert WRL centimetres into editor units (÷100)
                </label>}
                {wrlSource && !wrlStale && <p className="forge-hint">Compiler diagnostic source association is user-selected, not cryptographically verified. Confirm the WRL came from your current build before treating its markings as relevant.</p>}
                {wrlStale && <Notice tone="warning">The source geometry has changed since this WRL was loaded. Its overlay is hidden until you recompile and import fresh error geometry.</Notice>}
                {toolLogStale && <Notice tone="warning">The source geometry changed after importing this Tool log (or validation was still pending). Its findings are hidden until you recompile and import a current log.</Notice>}
                {wrlBrushMatch.value && <details className="forge-tool-diagnostics" aria-label="WRL source brush association">
                  <summary title="Approximate match of imported Tool WRL error geometry to current authored brush bounds; does not identify an exact fault or repair a BSP.">Locate possible WRL issue brushes · {wrlBrushMatch.value.candidates.length} candidate(s)</summary>
                  <p className="forge-hint">Reviewed {wrlBrushMatch.value.sampledPrimitives} of {wrlBrushMatch.value.totalPrimitives} Tool error primitives. {wrlBrushMatch.value.ambiguousPrimitives} ambiguous and {wrlBrushMatch.value.unmatchedPrimitives} outside the 0.25-unit search radius. Matching is an unverified proximity hint, not source attribution; reimport after every geometry change.</p>
                  <div className="analysis-actions">
                    {wrlBrushMatch.value.candidates.map(candidate => <button type="button" className="small-button" key={candidate.brushId} title={`Select probable source brush. ${candidate.diagnosticSamples} diagnostic samples; nearest ${candidate.closestDistance.toFixed(3)} editor units. This does not edit geometry.`} onClick={() => {
                      setSelected([candidate.brushId]); setTab('properties');
                      notify('Selected a source brush near imported Tool WRL geometry. Check the actual Tool error and verify the source and units before editing.');
                    }}>Inspect {doc.geometry.find(brush=>brush.id===candidate.brushId)?.name ?? 'source brush'} ({candidate.diagnosticSamples})</button>)}
                  </div>
                </details>}
                {wrlBrushMatch.error && <Notice tone="warning">WRL-to-brush matching skipped: {wrlBrushMatch.error}</Notice>}
                {wrlParse.error && <Notice>{wrlParse.error}</Notice>}
                {diagnosticError && <Notice>{diagnosticError}</Notice>}
                {toolLog && !toolLogStale && <>
                  <p className="forge-hint">Tool log: {toolLog.diagnostics.length} known geometry messages; {toolLog.unclassified} other warnings/errors. No parsed output establishes a playable map.</p>
                  {toolLog.diagnostics.slice(0,40).map((item,index) => <div className={`forge-issue ${item.level}`} key={`${item.line}-${index}`}>
                    <strong>Line {item.line} · {item.code}</strong>
                    <span>{item.message}</span>
                    <small>{item.action}</small>
                  </div>)}
                </>}
                {compilerTriage && <details className="forge-tool-diagnostics" aria-label="Halo Tool compiler attempt triage">
                  <summary title="User-associated local diagnostics; this report is NOT a verified build receipt or game-success certificate.">
                    Compiler triage · {compilerTriage.status === 'source-export-blocked' ? 'Source blocked' :
                      compilerTriage.status === 'compiler-errors-observed' ? 'Tool errors observed' : 'Needs compiler/game verification'}
                  </summary>
                  <p className="forge-hint">Source SHA-256: {compilerTriage.sourceSha256.slice(0,12)}… · {compilerTriage.toolLog.knownMessages} recognized Tool messages · {compilerTriage.toolLog.unclassifiedMessages} unclassified · {compilerTriage.wrl.errorEdges} WRL edges / {compilerTriage.wrl.errorFaces} WRL faces. Imported files are associated with the source by your selection, NOT cryptographically linked to one native compiler run.</p>
                  {compilerTriage.nextActions.map((action,i)=><p key={i} className="forge-hint">{i+1}. {action}</p>)}
                  <div className="analysis-actions">
                    <button className="small-button" title="Export bounded failure counts and classifier codes, current source hash and next review actions. Excludes raw logs, filenames, paths, WRL coordinates, map bytes and assets. Does not claim the BSP compiled." onClick={() => {
                      try {
                        const safeName = (doc.name || 'source').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,48) || 'source';
                        downloadLocalText(`${safeName}_compiler_triage.json`,JSON.stringify(compilerTriage,null,2),'application/json;charset=utf-8');
                      } catch(e) {notify(String(e),'error');}
                    }}>Export sanitized compiler triage</button>
                  </div>
                </details>}
              </div>

              {geometryError && <Notice>{geometryError}</Notice>}
              {buildError && <Notice>{buildError}</Notice>}
              {report?.issues.map((issue, i) => (
                <button
                  className={`forge-issue ${issue.severity}`}
                  key={`${issue.code}-${i}`}
                  onClick={() => {
                    setSelected(issue.brushIds);
                    setTab('properties');
                  }}
                >
                  <strong>
                    {issue.severity} · {issue.code}
                  </strong>
                  <span>{issue.message}</span>
                </button>
              ))}
              {receipt && (
                <>
                  <h3>Last native job · {receipt.status}</h3>
                  <p>
                    {(receipt.durationMs / 1000).toFixed(2)} seconds · {receipt.jobId}
                  </p>
                  {receipt.blockers.map((message, i) => (
                    <Notice key={i}>{message}</Notice>
                  ))}
                  {receipt.warnings.map((message, i) => (
                    <p className="forge-hint" key={i}>
                      {message}
                    </p>
                  ))}
                  {receipt.sources && (
                    <details>
                      <summary>Generated source paths and dependencies</summary>
                      <code>{receipt.sources.jmsPath}</code>
                      <code>{receipt.sources.scenarioPlanPath}</code>
                      <pre>
                        {JSON.stringify(
                          {
                            dependencies: receipt.sources.dependencies,
                            commands: receipt.sources.commands,
                            sourceSha256: receipt.sources.sourceSha256,
                            toolIdentities: receipt.toolIdentities,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  )}
                </>
              )}
              {projectLogs.length > 0 && (
                <div className="forge-job-log" role="log" aria-label="QuickForge build log">
                  {projectLogs.slice(-80).map((log, i) => (
                    <div key={i} className={log.severity}>
                      <strong>{log.phase}</strong> {log.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ForgeProperties({
  document: doc,
  chosen,
  changeNode,
  commit,
  notify,
}: {
  document: QuickForgeDocument;
  chosen: ForgeNode[];
  changeNode: (update: (node: ForgeNode) => ForgeNode, description: string) => void;
  commit: (doc: QuickForgeDocument, description: string) => void;
  notify: Props['notify'];
}) {
  const node = chosen.length === 1 ? chosen[0] : null;
  const [terrainX, setTerrainX] = useState(4);
  const [terrainY, setTerrainY] = useState(4);
  const [terrainRadius, setTerrainRadius] = useState(2);
  const [terrainStrength, setTerrainStrength] = useState(0.75);
  const [sculptError, setSculptError] = useState('');
  function applySculpt(mode: SculptMode) {
    try {
      changeNode(current => current.type === 'brush' && current.value.kind === 'terrain'
        ? { ...current, value: sculptTerrain(current.value, terrainX, terrainY, terrainRadius, terrainStrength, mode) } : current,
        `Terrain ${mode}`);
      setSculptError('');
    } catch(e) { setSculptError(String(e)); }
  }
  const position = node?.value.position ?? [0, 0, 0],
    rotation = node ? nodeRotation(node) : [0, 0, 0];
  function transform(axis: number, value: number, property: 'position' | 'rotation' | 'dimensions') {
    if (!node) return;
    changeNode((current) => {
      if (current.value.locked) return current;
      const pos = [...current.value.position] as Vec3,
        rot = [...nodeRotation(current)] as Vec3,
        scale: Vec3 = [1, 1, 1];
      if (property === 'position') pos[axis] = value;
      else if (property === 'rotation') rot[axis] = (value * Math.PI) / 180;
      else if (current.type === 'brush') scale[axis] = value / current.value.dimensions[axis];
      return transformForgeNode(current, pos, rot, scale);
    }, `Edit ${property}`);
  }
  return (
    <>
      <div className="forge-panel-heading">
        <strong>{chosen.length ? `${chosen.length} selected` : 'Map properties'}</strong>
        <Pill>{node ? nodeCategory(node) : doc.gameMode}</Pill>
      </div>
      {node ? (
        <fieldset disabled={node.value.locked}>
          <label className="forge-field">
            Name
            <input
              aria-label="Selected object name"
              value={node.value.name}
              maxLength={160}
              onChange={(e) =>
                changeNode(
                  (n) => patchForgeNode(n, { name: e.target.value }),
                  'Rename QuickForge object',
                )
              }
            />
          </label>
          <h4>Position · world units</h4>
          <div className="forge-vector">
            {['X', 'Y', 'Z'].map((axis, i) => (
              <label key={axis}>
                {axis}
                <NumberField
                  label={`Position ${axis}`}
                  value={position[i]}
                  min={-2048}
                  max={2048}
                  onCommit={(value) => transform(i, value, 'position')}
                />
              </label>
            ))}
          </div>
          <h4>Rotation · degrees</h4>
          <div className="forge-vector">
            {['X', 'Y', 'Z'].map((axis, i) => (
              <label key={axis}>
                {axis}
                <NumberField
                  label={`Rotation ${axis}`}
                  value={(rotation[i] * 180) / Math.PI}
                  min={-36000}
                  max={36000}
                  disabled={(node.type === 'spawn' || node.type === 'objective') && i !== 2}
                  onCommit={(value) => transform(i, value, 'rotation')}
                />
              </label>
            ))}
          </div>
          {node.type === 'brush' && (
            <>
              <h4>Dimensions · world units</h4>
              <div className="forge-vector">
                {['Width', 'Depth', 'Height'].map((axis, i) => (
                  <label key={axis}>
                    {axis}
                    <NumberField
                      label={`Brush ${axis.toLowerCase()}`}
                      value={node.value.dimensions[i]}
                      min={0.1}
                      max={512}
                      onCommit={(value) => transform(i, value, 'dimensions')}
                    />
                  </label>
                ))}
              </div>
              <label className="forge-field">
                Material
                <select
                  value={node.value.materialId}
                  onChange={(e) =>
                    changeNode(
                      (n) =>
                        n.type === 'brush' ? { ...n, value: { ...n.value, materialId: e.target.value } } : n,
                      'Assign brush material',
                    )
                  }
                >
                  {doc.materials.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.name}
                    </option>
                  ))}
                </select>
              </label>
              {node.value.kind === 'stairs' && (
                <label className="forge-field">
                  Steps
                  <NumberField
                    label="Stair steps"
                    value={node.value.steps}
                    min={1}
                    max={64}
                    step={1}
                    onCommit={(value) =>
                      changeNode(
                        (n) =>
                          n.type === 'brush' ? { ...n, value: { ...n.value, steps: Math.round(value) } } : n,
                        'Change stair count',
                      )
                    }
                  />
                </label>
              )}
              {node.value.kind === 'terrain' && <div className="forge-sculpt-panel">
                <h4>Terrain sculpt · source height grid</h4>
                <p className="forge-hint">Edits a saved heightfield, then rebuilds the preview mesh and JMS source. This does not modify an imported Halo BSP, create portals, or merge overlapping solids.</p>
                <div className="forge-vector">
                  <label>Grid X<NumberField label="Terrain grid X" value={Math.min(terrainX,node.value.steps)} min={0} max={node.value.steps} step={1} onCommit={n=>setTerrainX(Math.round(n))}/></label>
                  <label>Grid Y<NumberField label="Terrain grid Y" value={Math.min(terrainY,node.value.steps)} min={0} max={node.value.steps} step={1} onCommit={n=>setTerrainY(Math.round(n))}/></label>
                  <label>Radius<NumberField label="Terrain brush radius" value={terrainRadius} min={0} max={32} step={1} onCommit={n=>setTerrainRadius(Math.round(n))}/></label>
                </div>
                <label className="forge-field">Sculpt strength<NumberField label="Terrain sculpt strength" value={terrainStrength} min={0.01} max={16} step={0.25} onCommit={setTerrainStrength}/></label>
                <div className="forge-brush-palette">
                  {(['raise','lower','flatten','smooth'] as const).map(mode=><button key={mode} type="button" onClick={()=>applySculpt(mode)}>{mode}</button>)}
                </div>
                {sculptError && <Notice>{sculptError}</Notice>}
              </div>}
              {node.value.kind === 'caveTunnel' && <div className="forge-sculpt-panel">
                <h4>Hollow cave tunnel</h4>
                <label className="forge-field">Radial subdivisions<NumberField label="Cave radial subdivisions" value={node.value.steps} min={8} max={64} step={1} onCommit={value => changeNode(current => current.type==='brush' ? {...current,value:{...current.value,steps:Math.round(value)}} : current,'Resize cave tube subdivisions')}/></label>
                <Notice tone="info">The tunnel is a manifold source shell. Exact matching tunnel rims are joined by removing shared cap faces in the Rust JMS generator. Terrain/room openings, collision, Halo portals, PVS, navigation and gameplay still require real compiler validation.</Notice>
              </div>}
              <p className="forge-hint">
                This edits source geometry. Hidden and locked flags affect the editor only; all authored
                geometry is exported.
              </p>
            </>
          )}
          {node.type === 'placement' && (
            <>
              <div className="forge-tag-reference">
                <Pill>{node.value.tagClass}</Pill>
                <code>{node.value.tagPath}</code>
                <small>Source project: {node.value.sourceProjectId ?? 'unresolved'}</small>
                <code>{node.value.sourceSha256 ?? 'Missing source hash'}</code>
              </div>
              <label className="forge-field">
                Respawn (seconds)
                <NumberField
                  label="Respawn seconds"
                  value={node.value.respawnSeconds}
                  min={0}
                  max={3600}
                  step={1}
                  onCommit={(value) =>
                    changeNode(
                      (n) =>
                        n.type === 'placement'
                          ? { ...n, value: { ...n.value, respawnSeconds: Math.round(value) } }
                          : n,
                      'Set respawn time',
                    )
                  }
                />
              </label>
              <p className="forge-hint">
                Reference marker only. The actual source tag and target placement support must pass
                dependency/build validation.
              </p>
            </>
          )}
          {(node.type === 'spawn' || node.type === 'placement' || node.type === 'objective' && node.value.kind === 'ctfFlag') && (
            <label className="forge-field">
              {node.type === 'objective' ? 'CTF flag team' : 'Team'}
              <select
                value={node.value.team}
                onChange={(e) =>
                  changeNode(
                    (n) =>
                      n.type !== 'brush' ? patchForgeNode(n, { team: Number(e.target.value) }) : n,
                    'Assign team',
                  )
                }
              >
                <option value={-1}>Neutral / none</option>
                <option value={0}>Red / team 0</option>
                <option value={1}>Blue / team 1</option>
              </select>
            </label>
          )}
          {node.type === 'objective' && node.value.kind !== 'ctfFlag' && node.value.kind !== 'raceVehicle' && (
            <div className="forge-sculpt-panel">
              <label className="forge-field" title={node.value.kind==='hill'?'Hill usage ID groups 1 or 3–8 markers into the same area. 0 is the initial hill for King and Crazy King.':node.value.kind==='oddball'?'Oddball markers have consecutive indices starting at 0; at most 16.':node.value.kind==='teleportFrom'||node.value.kind==='teleportTo'?'Teleporter entry and exit markers with the same channel are linked. An unpaired channel is blocked from export.':'Race checkpoint indices must begin at 0, follow the course and have no gaps; maximum is 32.'}>
                {node.value.kind==='hill'?'Hill grouping ID':node.value.kind==='oddball'?'Ball spawn index':node.value.kind==='teleportFrom'||node.value.kind==='teleportTo'?'Teleporter channel':'Race checkpoint order'}
                <NumberField label="Netgame usage ID" value={netgameUsageId(node.value)} min={0} max={node.value.kind==='raceCheckpoint'?31:15} step={1}
                  onCommit={value=>changeNode(current=>current.type==='objective' ? {...current,value:{...current.value,team:current.value.kind==='raceCheckpoint'?-1:Math.round(value),sequence:current.value.kind==='raceCheckpoint'?Math.round(value):current.value.sequence}} : current,'Edit Halo netgame usage ID')}/>
              </label>
              <p className="forge-hint">{node.value.kind==='hill'?'One marker creates a 2×2 hill; 3–8 markers sharing this ID create a convex boundary. Two can crash Halo CE. Move each corner with the XYZ gizmo.':node.value.kind==='raceCheckpoint'?'This order is saved as the native race_track usage ID; face the marker along the course.':node.value.kind==='teleportFrom'||node.value.kind==='teleportTo'?'Pair entrance and exit on the SAME channel, review facing direction and verify placement in a real game to avoid loops.':'Each Oddball spawn index must be unique and sequential; index 0 spawns first.'}</p>
            </div>
          )}
          {node.type==='objective' && node.value.kind==='raceVehicle' && <p className="forge-hint">Race vehicle marker: Halo uses this for Race-mode vehicle starting positions. Face it down the course and test vehicle clearance in-game. Its native usage ID is ignored.</p>}
          {node.type === 'spawn' && (
            <label className="forge-field">
              Spawn game mode
              <select
                value={node.value.gameModes[0] ?? doc.gameMode}
                onChange={(e) =>
                  changeNode(
                    (n) =>
                      n.type === 'spawn' ? { ...n, value: { ...n.value, gameModes: [e.target.value] } } : n,
                    'Set spawn mode',
                  )
                }
              >
                <option value="allGames">All five CE multiplayer modes</option>
                {Object.entries(forgeModes).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </fieldset>
      ) : chosen.length > 1 ? (
        <p className="forge-hint">
          Use the translate/rotate gizmo to transform this group. Duplicate and delete preserve undo history;
          locked items are excluded. Resize one brush at a time.
        </p>
      ) : (
        <>
          <label className="forge-field">
            Game mode
            <select
              aria-label="QuickForge game mode"
              value={doc.gameMode}
              onChange={(e) =>
                commit({ ...doc, gameMode: e.target.value as ForgeMode }, 'Change map game mode')
              }
            >
              {Object.entries(forgeModes).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <p className="forge-hint">
            Changing mode does not invent supported runtime behavior. Review starts/objectives and native
            build diagnostics for the selected target.
          </p>
        </>
      )}
      {node?.value.locked && <Notice>This object is locked. Unlock it in the hierarchy to edit it.</Notice>}
      <details className="forge-details" open={!chosen.length}>
        <summary>Materials &amp; world settings</summary>
        {doc.materials.map((material) => (
          <div className="forge-material" key={material.id}>
            <label className="forge-field">
              Material name
              <input
                value={material.name}
                onChange={(e) =>
                  commit(
                    {
                      ...doc,
                      materials: doc.materials.map((m) =>
                        m.id === material.id ? { ...m, name: e.target.value } : m,
                      ),
                    },
                    'Rename material',
                  )
                }
              />
            </label>
            <label className="forge-field">
              Existing shader tag path
              <input
                placeholder="levels\...\shader_name"
                value={material.shaderPath ?? ''}
                onChange={(e) =>
                  commit(
                    {
                      ...doc,
                      materials: doc.materials.map((m) =>
                        m.id === material.id ? { ...m, shaderPath: e.target.value || null } : m,
                      ),
                    },
                    'Assign source shader',
                  )
                }
              />
            </label>
            <label className="forge-field">
              Preview color
              <input
                type="color"
                value={`#${material.color
                  .map((n) =>
                    Math.round(Math.max(0, Math.min(1, n)) * 255)
                      .toString(16)
                      .padStart(2, '0'),
                  )
                  .join('')}`}
                onChange={(e) => {
                  const value = e.target.value;
                  const color = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255) as Vec3;
                  commit(
                    {
                      ...doc,
                      materials: doc.materials.map((m) => (m.id === material.id ? { ...m, color } : m)),
                    },
                    'Change material preview color',
                  );
                }}
              />
            </label>
          </div>
        ))}
        <button
          className="small-button full"
          onClick={() =>
            commit(
              {
                ...doc,
                materials: [
                  ...doc.materials,
                  {
                    id: crypto.randomUUID(),
                    name: `Material ${doc.materials.length + 1}`,
                    shaderPath: null,
                    color: [0.35, 0.5, 0.6],
                  },
                ],
              },
              'Add material',
            )
          }
        >
          Add material
        </button>
        <label className="forge-field">
          Existing sky tag path
          <input
            value={doc.skyPath ?? ''}
            onChange={(e) => commit({ ...doc, skyPath: e.target.value || null }, 'Assign sky tag')}
            placeholder="sky tag path (build dependency)"
          />
        </label>
        <details className="forge-details gs-environment-panel">
          <summary title="Adjust editor lighting, ambient color, sun direction and fog in real time. Saves with this source map, but does not patch Halo sky or fog tags.">Environment lighting &amp; fog · live preview</summary>
          <EnvironmentControls value={environmentValue(doc.environment)} persisted skyPath={doc.skyPath}
            onChange={next=>{
              try { validateEnvironment(next);commit({...doc,environment:next},'Change environment lighting/fog preview'); }
              catch(e){notify(`Environment change rejected: ${String(e)}`,'error');}
            }}/>
        </details>
        <p className="forge-hint">These colors are live editor intent, not compiled shader/sky/fog tags. A real Halo lighting change requires selecting an authorized sky tag and compiling new lightmaps.</p>
      </details>
    </>
  );
}
