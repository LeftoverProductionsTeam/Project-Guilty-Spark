import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { call, native } from '../api';
import { useMapState } from '../mapSession';
import {donorPoint, selectedSeamEdge} from '../seamEdges';
import type {NativeSurfacePick} from '../nativeSurfacePick';
import type { LibraryEntry, MapInspection, Project, RuntimeRegistration, Vec3 } from '../types';
import { runtimeProfileLabel } from '../runtimeWorkbench';
import BitmapPreview from './BitmapPreview';
import { addInfantryTunnel, addHighGroundRoute, addFlatLandBridge, makeThreeRouteSeam, flattenTerrainConnector,fillTerrainToRidge, assemblySignature, nativeSealVertices, rotateAssemblyAtEntrance, transformAssembly, NATIVE_BSP_SWITCH_PREVIEW } from '../bspAssembly';
import type { BspAssembly as Plan, BspOption, AssemblyReport, SeamEdge, NativeBspSwitchPreview } from '../bspAssembly';
import { NumberField } from './ui';
import {mergeZoneOnlyUpdate} from '../visibilityZones';
import '../bspAssembly.css';
import MegaworldAtlas from './MegaworldAtlas';
import MapSourceDrop from './MapSourceDrop';
import {useRevealWorkspacePanel} from './WorkspacePanels';
import { useWorkspaceActivity } from './WorkspaceActivity';
import { volumeCenter } from '../nativeTriggerVolume';
import type { NativeVolumeGeometry } from '../nativeOperations';
interface NativeBspTransitions {
  cacheSha256: string;
  bspCount: number;
  bspTagPaths?: string[];
  transitions: {triggerIndex: number; triggerName: string; sourceBsp: number; destinationBsp: number; arrivalMarker?: number; geometry?: NativeVolumeGeometry}[];
}

function NativeBspTransitionReport({projectId, sourceSha256, partCount, onViewBsp}: {projectId: string; sourceSha256: string; partCount: number; onViewBsp: (slot:number) => void}) {
  const [report, setReport] = useState<NativeBspTransitions | null>(null);
  const [, setPreview] = useMapState<NativeBspSwitchPreview | null>(projectId, NATIVE_BSP_SWITCH_PREVIEW, () => null);
  function viewBsp(slot: number) { setPreview(null); onViewBsp(slot); }
  const [sourceFilter, setSourceFilter] = useState(-1);
  const transitions = report?.transitions.filter(row => sourceFilter < 0 || row.sourceBsp === sourceFilter) ?? [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function inspectTransitions() {
    setBusy(true);
    setError('');
    try {
      const result = await call<NativeBspTransitions>('inspect_native_bsp_transitions', {projectId, sourceSha256});
      if (result.cacheSha256 !== sourceSha256) throw Error('The native readback belongs to another map.');
      setReport(result);
    } catch (issue) {
      setReport(null);
      setError(String(issue));
    } finally { setBusy(false); }
  }
  return <section aria-label="Native BSP transitions">
    <p>Review the switch volumes compiled into this map. BSP indices start at 0. The switch changes the active BSP for the whole scenario. Independent regional simulation needs runtime support.</p>
    <button type="button" disabled={!native || busy} onClick={() => void inspectTransitions()}>{busy ? "Reading native scenario…" : "Inspect native BSP transitions"}</button>
    {error && <p role="alert" className="bsp-error">{error}</p>}
    {report && <details open>
      <summary>{report.bspCount} BSPs · {report.transitions.length} compiled switches</summary>
      {!!report.bspTagPaths?.length && <ol start={0} aria-label="Native structure tags">{report.bspTagPaths.map((path, index) => <li key={index}><code className="path-text" title={path}>{path}</code></li>)}</ol>}
      {report.transitions.length > 0 && <label>Filter switches by source BSP
        <select value={sourceFilter} onChange={event => setSourceFilter(Number(event.target.value))}>
          <option value={-1}>All source BSPs</option>
          {Array.from({length:report.bspCount},(_,slot)=><option key={slot} value={slot}>BSP {slot}</option>)}
        </select>
      </label>}
      {transitions.length > 0 ? <ul aria-label="Compiled BSP switches">{transitions.map((row, index) => <li key={index}>
        <strong>BSP {row.sourceBsp} → BSP {row.destinationBsp} · {row.triggerName || "Unnamed volume"}</strong>
        <div>Volume {row.triggerIndex}{row.arrivalMarker !== undefined && ' · Arrival marker '+row.arrivalMarker}</div>
        {row.geometry ? <p>Center {volumeCenter(row.geometry).map(value=>value.toFixed(2)).join(' / ')} · Size {row.geometry.dimensions.map(value=>value.toFixed(2)).join(' × ')}</p>
          : <p>Oriented volume geometry unavailable.</p>}
        <div className="button-row">
          <button type="button" disabled={row.sourceBsp>=partCount} onClick={()=>viewBsp(row.sourceBsp)}>View source BSP {row.sourceBsp}</button>
          <button type="button" disabled={row.destinationBsp>=partCount} onClick={()=>viewBsp(row.destinationBsp)}>View destination BSP {row.destinationBsp}</button>
          {row.geometry && <button type="button" disabled={row.sourceBsp>=partCount} onClick={()=>{
            if (!row.geometry) return;
            onViewBsp(row.sourceBsp);
            setPreview({...row, geometry:row.geometry, cacheSha256:sourceSha256});
          }}>Frame switch volume {row.triggerIndex}</button>}
        </div>
      </li>)}</ul> : <p>{report.transitions.length ? 'No switches from this source BSP.' : 'This scenario has no compiled trigger-volume switches.'}</p>}
    </details>}
  </section>;
}

function NativeGameplayBudget({ budget, cacheTarget }: {
  budget: NonNullable<AssemblyReport['nativeGameplayBudget']>;
  cacheTarget: 'CE609' | 'MCC13' | undefined;
}) {
  const [profiles, setProfiles] = useState<RuntimeRegistration[]>([]);
  useEffect(() => {
    if (!native) return;
    let active = true;
    void call<RuntimeRegistration[]>('list_runtime_registrations')
      .then(rows => { if (active) setProfiles(rows ?? []); })
      .catch(() => {}); // The native schema budget stays visible when profiles are unavailable.
    return () => { active = false; };
  }, []);
  const regional = budget.mcc13RegionalFlags;
  const mcc = cacheTarget === 'MCC13';
  const flags = mcc ? regional ?? budget.netgameFlags : budget.netgameFlags;
  const starts = mcc ? budget.mcc13RegionalStarts ?? budget.playerStarts : budget.playerStarts;
  const items = mcc ? budget.mcc13RegionalEquipment ?? budget.netgameEquipment : budget.netgameEquipment;
  const classic = cacheTarget === 'CE609';
  const rows = [
    { label: 'Player starts', ...starts, donor: classic ? 0 : starts.donor },
    { label: 'Multiplayer item placements', ...items },
    { label: 'Multiplayer flags and teleporter endpoints', ...flags, donor: classic ? 0 : flags.donor },
  ];
  return <details open={rows.some(row => row.existing + row.donor > row.limit)}>
    <summary>Native gameplay placement limits{cacheTarget ? ' · ' + cacheTarget : ''}</summary>
    <p>{classic ? 'This CE609 split build keeps the base player starts and flags, and adds donor pickups.' : 'Projected placement counts across the compiled scenario.'}</p>
    <ul>
      {rows.map(({ label, existing, donor, limit }) => {
        const total = existing + donor;
        return <li key={label}>
          {label} · {existing} base + {donor} donor = {total} / {limit}
          {total > limit && <strong> · {total - limit} over the native limit</strong>}
        </li>;
      })}
    </ul>
    {regional && <>
      {cacheTarget !== 'MCC13' && <p>MCC13 regional flags · {regional.existing + regional.donor} / {regional.limit} · Reviewed native build limit</p>}
      {profiles.map(profile => {
        const capabilities = profile.reviewedCompanion?.capabilities;
        const target = capabilities?.map_targets?.find(row => row.cache_version === 13 && row.invader_engine === 'mcc-cea');
        if (!target || (target.required_feature && !capabilities?.native_features?.includes(target.required_feature))) return null;
        const reviewed = [
          { label: 'Starts', count: budget.mcc13RegionalStarts, limit: target.max_player_starts },
          { label: 'Pickups', count: budget.mcc13RegionalEquipment, limit: target.max_netgame_equipment },
          { label: 'Flags', count: regional, limit: target.max_netgame_flags },
        ];
        if (reviewed.every(row => row.limit == null)) return null;
        return <div key={profile.id}>
          <p>{runtimeProfileLabel(profile)} · Saved runtime review</p>
          <ul>{reviewed.map(({ label, count, limit }) => {
            if (!count || limit == null) return null;
            const effective = Math.min(count.limit, limit);
            const total = count.existing + count.donor;
            return <li key={label}>{label} · {total} / {effective}
              {total > effective && <strong> · {total - effective} over the build or runtime limit</strong>}
            </li>;
          })}</ul>
        </div>;
      })}
      <p>Regional gameplay needs a compatible multiplayer runtime and multiple native BSPs.</p>
    </>}
  </details>;
}

export default function BspAssembly({
  project,
  inspection,
  entries,
  onEdit,
  onSave,
  onBuild,
}: {
  project: Project;
  inspection?:MapInspection|null;
  entries: LibraryEntry[];
  onEdit: (p: Project, description: string) => void;
  onSave: () => Promise<void>;
  onBuild: () => void;
}) {
  const {active}=useWorkspaceActivity();
  const revealPanel=useRevealWorkspacePanel();
  const sourceSha256 = project.source?.sha256;
  const nativePartitioned = sourceSha256 && inspection?.sha256 === sourceSha256
    && (inspection.mesh.parts?.length ?? 0) > 1 && [609, 13].includes(inspection.header.version);
  const baseParts = inspection?.mesh.parts ?? [];
  const canExtend = !!nativePartitioned && inspection.header.version === 13
    && inspection.header.scenarioType === 1 && baseParts.length < 16
    && !!project.inheritedBspConnections?.some(plan => plan.separateNativeBsps);
  const buildRuntime = project.buildTargets?.find(target => target.id === project.activeBuildTarget)?.runtimeId;
  const [baseIndex, setBaseIndex] = useMapState(project.id, 'bsp.baseSection', project.bspAssembly?.baseBspIndex ?? 0);
  const [viewedBsp, setViewedBsp] = useMapState(project.id, 'world.bsp', 0);
  const sourceShaders=inspection&&project.source&&inspection.sha256===project.source.sha256?inspection.tags.filter(tag=>tag.class==='senv'):[];
  const sourceMetal=sourceShaders.find(tag=>/metal.*plate.*floor/i.test(tag.path))??sourceShaders.find(tag=>/metal.*flat/i.test(tag.path));
  const [pickedSurface,setPickedSurface]=useMapState<NativeSurfacePick|null>(project.id,'world.surface-selection',()=>null);
  const [sealText, setSealText] = useMapState(project.id, 'bsp.nativeSealVertices', '');
  const [sealLift, setSealLift] = useMapState(project.id, 'bsp.nativeSealLift', 0);
  const [nativeBspIndex, setNativeBspIndex] = useMapState(project.id, 'bsp.nativePartitionPreview', 0);
  const [edgeTarget,setEdgeTarget]=useMapState<'base'|'donor'|null>(project.id,'bsp.edgeTarget',null);
  const [pickingLanding, setPickingLanding] = useMapState<'connector'|'ridge'|null>(project.id, 'bsp.pickingLanding', null);
  const [edgePicks,setEdgePicks]=useMapState<{base?:SeamEdge;donor?:SeamEdge}>(project.id,'bsp.edgePicks',()=>({}));
  const activeNow=useRef(active);activeNow.current=active;
  const [importedDonor, setImportedDonor] = useState<LibraryEntry>();
  const admitsDonor = (entry: LibraryEntry) => entry.id !== project.id && entry.sha256 !== sourceSha256
    && !!entry.sha256 && (canExtend ? entry.version === 609 : [6, 7, 13, 609].includes(entry.version ?? 0));
  const donors = importedDonor && !entries.some(entry => entry.id === importedDonor.id)
    ? [...entries, importedDonor] : entries;
  const candidates = donors.filter(admitsDonor);
  const [open, setOpen] = useMapState(project.id, 'bsp.open', false),
    [donor, setDonor] = useMapState(
      project.id,
      'bsp.donor',
      project.bspAssembly?.donorProjectId ?? candidates[0]?.id ?? '',
    );
  const [sectionList, setSectionList] = useState<{ donor: string; values: BspOption[] } | null>(null),
    [optionsError, setOptionsError] = useState(''),
    [index, setIndex] = useMapState(project.id, 'bsp.section', project.bspAssembly?.donorBspIndex ?? 0),
    [draft, setDraft] = useMapState<Plan | null>(project.id, 'bsp.draft', () => project.bspAssembly ?? null),
    [appliedSource, setAppliedSource] = useMapState(
      project.id,
      'bsp.applied',
      assemblySignature(project.bspAssembly ?? null),
    ),
    [routeView,setRouteView]=useMapState<'primary'|'infantry'|'highGround'|`section:${string}`>(project.id,'bsp.route','primary'),
    [entrancePivot, setEntrancePivot] = useMapState(project.id, 'bsp.entrancePivot', false),
    [direction, setDirection] = useMapState(project.id, 'bsp.tunnelDirection', 0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [report, setReport] = useState<AssemblyReport | null>(null);
  const draftNow=useRef(draft);draftNow.current=draft;
  const operation = useRef(0),
    mounted = useRef(false);
  const latest = useRef({ projectId: project.id, signature: assemblySignature(draft), donor, index, baseIndex });
  latest.current = { projectId: project.id, signature: assemblySignature(draft), donor, index, baseIndex };
  const options = sectionList?.donor === donor ? sectionList.values : [];
  const loadingOptions = native && open && !!donor && sectionList?.donor !== donor && !optionsError;
  const selectionMatches = !!draft && draft.donorProjectId === donor && draft.donorBspIndex === index && (draft.baseBspIndex ?? 0) === baseIndex;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operation.current++;
    };
  }, []);
  useEffect(() => {
    if (!active) {
      // Parking the editor preserves its draft and GPU state, but a result
      // requested in a previous active context must still be reviewed again.
      operation.current++;
      setBusy(false);
    }
  }, [active]);
  useEffect(() => {
    const signature = assemblySignature(project.bspAssembly ?? null);
    let previous = appliedSource;
    let previousPlan:Plan|null=null;
    try {
      previousPlan=JSON.parse(appliedSource);
      previous = assemblySignature(previousPlan);
    } catch {
      /* Replace an invalid saved identity. */
    }
    if (signature !== previous) {
      setDraft(mergeZoneOnlyUpdate(previousPlan,project.bspAssembly??null,draft));
      setReport(null);
    }
    if (signature !== appliedSource) setAppliedSource(signature);
  }, [project.bspAssembly, appliedSource]);
  useEffect(() => {
    let cancelled = false;
    setSectionList(null);
    setOptionsError('');
    if (native && open && donor && (!nativePartitioned || canExtend))
      void call<BspOption[]>('bsp_assembly_options', { projectId: donor, assemblyProjectId: project.id }).then(
        (value) => {
          if (!cancelled) {
            setSectionList({ donor, values: value });
            if (!value.some((p) => p.index === index)) setIndex(value[0]?.index ?? 0);
          }
        },
        (e) => {
          if (!cancelled) setOptionsError(String(e));
        },
      );
    return () => {
      cancelled = true;
    };
  }, [donor, open, nativePartitioned, canExtend]);
  async function perform(action: (current: () => boolean) => Promise<void>) {
    const request = ++operation.current,
      owner = project.id;
    const signature = latest.current.signature;
    const current = () =>
      mounted.current && activeNow.current && operation.current === request && latest.current.projectId === owner;
    setBusy(true);
    setError('');
    try {
      await action(current);
    } catch (e) {
      if (current() && latest.current.signature === signature) setError(String(e));
    } finally {
      if (current()) setBusy(false);
    }
  }
  async function proposeConnection(terrainSeam:boolean){
    await perform(async(current)=>{
      const request={...latest.current};
      const matches=()=>current()&&latest.current.signature===request.signature&&latest.current.donor===request.donor&&latest.current.index===request.index&&latest.current.baseIndex===request.baseIndex;
      await onSave();if(!matches())return;
      const plan=await call<Plan>('plan_bsp_assembly',{projectId:project.id,donorProjectId:donor,donorBspIndex:index,baseBspIndex:canExtend?baseIndex:undefined,terrainSeam,...(!terrainSeam&&direction!==0?{directionDegrees:direction}:{})});
      if(matches()){setDraft(plan);setRouteView('primary');setReport(null);}
    });
  }
  const applied = assemblySignature(draft) === assemblySignature(project.bspAssembly ?? null);
  const savedPlan = project.bspAssembly;
  const donorPositionApplied = !!draft && !!savedPlan && draft.donorProjectId === savedPlan.donorProjectId
    && draft.donorBspIndex === savedPlan.donorBspIndex && draft.yawDegrees === savedPlan.yawDegrees
    && draft.translation.every((axis, index) => axis === savedPlan.translation[index]);
  function update(change: Partial<Plan>) {
    if (draft) {
      const next = { ...draft, ...change };
      latest.current = { ...latest.current, signature: assemblySignature(next) };
      draftNow.current=next;setDraft(next);
      setReport(null);
      setError('');
    }
  }
  const infantry=routeView==='infantry'&&!!draft?.infantryTunnel;
  const ridge=routeView==='highGround'&&!!draft?.highGround;
  const routeKey=infantry?'infantryTunnel':ridge?'highGround':null;
  const selectedSection=draft?.sections?.find(section=>routeView===`section:${section.id}`);
  const secondary=selectedSection??(routeKey&&draft?.[routeKey]);
  const routeDraft=draft&&secondary?{...draft,tunnelPoints:secondary.points,tunnelWidth:secondary.width,tunnelHeight:secondary.height,tunnelShaderPath:secondary.shaderPath,archSegments:selectedSection?.archSegments,openRoad:selectedSection?.openRoad??false}:draft;
  function updateRoute(change:Partial<Plan>){
    if(selectedSection){update({sections:draft!.sections!.map(section=>section.id===selectedSection.id?{...section,points:change.tunnelPoints??section.points,width:change.tunnelWidth??section.width,height:change.tunnelHeight??section.height,shaderPath:change.tunnelShaderPath??section.shaderPath,...('archSegments' in change?{archSegments:change.archSegments}:{}),...('openRoad' in change?{openRoad:change.openRoad}:{})}:section)});}
    else if(routeKey&&secondary){const route=secondary;update({[routeKey]:{...route,
      points:change.tunnelPoints??route.points,width:change.tunnelWidth??route.width,height:change.tunnelHeight??route.height,shaderPath:change.tunnelShaderPath??route.shaderPath}});}
    else update(change);
  }
  useEffect(()=>{
    if(!edgeTarget||!draft||!pickedSurface)return;
    const base = edgeTarget === 'base';
    const hash = base ? project.source?.sha256 : draft.donorSource.sha256;
    const bsp = base ? draft.baseBspIndex ?? 0 : draft.donorBspIndex;
    if (pickingLanding) {
      if (pickedSurface.sourceHash !== hash || pickedSurface.bspIndex !== bsp) return;
      const point = base ? pickedSurface.point : donorPoint(pickedSurface.point, draft);
      if (pickingLanding==='ridge') {
        if (!draft.highGround) return;
        const points=draft.highGround.points;
        update({highGround:{...draft.highGround,points:points.map((old,index)=>index===(base?0:points.length-1)?point:old)}});
      } else {
        update({ tunnelPoints: draft.tunnelPoints.map((old, index) => index === (base ? 0 : 1) ? point : old) });
      }
      setEdgeTarget(null);
      setPickingLanding(null);
      setPickedSurface(null);
      return;
    }
    const edge=hash?selectedSeamEdge(pickedSurface,hash,bsp):null;if(!edge)return;
    setEdgePicks(previous=>({...previous,[edgeTarget]:edge}));setEdgeTarget(edgeTarget==='base'?'donor':null);setPickedSurface(null);
  },[pickedSurface,edgeTarget,pickingLanding,project.source?.sha256,draft?.donorSource.sha256,draft?.donorBspIndex,draft?.baseBspIndex]);
  async function previewDraft(value:Plan|null=draftNow.current, intactConnector = false){
    if(!value||!selectionMatches||busy)return;
    await perform(async current=>{
      const signature=assemblySignature(value);
      const checked=await call<AssemblyReport>('preview_bsp_assembly',{projectId:project.id,includeGeometry:true,draft:value,nativeBspIndex:value.separateNativeBsps ? nativeBspIndex : undefined,...(intactConnector ? { intactConnector: true } : {})});
      if(current()&&latest.current.signature===signature&&latest.current.donor===value.donorProjectId&&latest.current.index===value.donorBspIndex&&latest.current.baseIndex===(value.baseBspIndex??0)){setReport(checked);if(checked.viewport)window.dispatchEvent(new CustomEvent('gs:bsp-source-preview',{detail:checked.viewport}));}
    });
  }
  function previewSliderKey(event: KeyboardEvent<HTMLInputElement>) {
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)) void previewDraft();
  }
  function armEdge(target:'base'|'donor', landing:typeof pickingLanding = null){setPickedSurface(null);setPickingLanding(landing);setEdgeTarget(target);}
  function vector(value: Vec3, onChange: (v: Vec3) => void, label: string) {
    return (
      <div className="bsp-vector">
        <span>{label}</span>
        {(['X', 'Y', 'Z'] as const).map((axis, i) => (
          <label key={axis}>
            {axis}
            <NumberField
              value={value[i]}
              min={-2048}
              max={2048}
              step={0.05}
              label={`${label} ${axis}`}
              onCommit={(v) => onChange(value.map((old, k) => (k === i ? v : old)) as Vec3)}
            />
          </label>
        ))}
      </div>
    );
  }
  return (
    <details className="bsp-assembly" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        {nativePartitioned ? 'Native BSP transitions' : 'Connect another map’s BSP'}{project.bspAssembly ? ` · ${project.bspAssembly.donorTitle}` : ''}
      </summary>
      {(!nativePartitioned || canExtend) && (
        <MapSourceDrop single disabled={busy || !active}
          viewport={active ? {projectId: project.id, sourceSlot: canExtend ? viewedBsp : undefined, reveal: () => {setOpen(true);revealPanel('construction');}} : undefined} onImported={([entry], sourceSlot) => {
          if (!admitsDonor(entry)) return canExtend ? 'Choose a different CE609 donor for this MCC13 world.' : 'Choose a different supported Halo map.';
          setImportedDonor(entry);
          const selectedRegion = canExtend && sourceSlot !== undefined ? baseParts[sourceSlot] : undefined;
          if (selectedRegion && sourceSlot !== undefined) setBaseIndex(sourceSlot);
          setDonor(entry.id);
          setIndex(0);
          setError('');
          return entry.title + (selectedRegion ? ' selected for '+selectedRegion.name+'.' : ' selected.') + ' Choose its BSP section and plan the connection.';
        }} />
      )}
      {open && (
        <div className="bsp-assembly-body">
          {report?.connectorTriangles!==undefined&&<p className="subtle" aria-label="Connector triangle budget">Connector: {report.connectorTriangles.toLocaleString()} triangles · {report.viewport?.retainsDonor ? 'connector export' : 'full source'}: {report.outputTriangles.toLocaleString()}. Native compilation and gameplay remain separate.</p>}
          {pickedSurface&&project.source&&pickedSurface.sourceHash===project.source.sha256&&<p className="subtle" role="status">Selected BSP {pickedSurface.bspIndex+1}. Connect or extend with a rebuilt tunnel below. Reshaping compiled landscape faces is still in development; face extrusion, clipping and vertex editing currently require editable BSP Workshop source.</p>}
          <MegaworldAtlas projectId={project.id} assembly={project.bspAssembly} sourceSha={project.source?.sha256} layout={project.megaworldLayout} onLayout={(layout,description)=>onEdit({...project,megaworldLayout:layout},description)}/>
          {nativePartitioned && <NativeBspTransitionReport key={sourceSha256} projectId={project.id} sourceSha256={sourceSha256!} partCount={baseParts.length} onViewBsp={setViewedBsp}/>}
          {(!nativePartitioned || canExtend) && <>
          <details className="bsp-help">
            <summary>Connection help</summary>
            {canExtend ? <p>Use a walkable entrance and build for MCC13 to keep existing BSP slots and switches.</p>
              : <p>Choose terrain or a tunnel between two original BSPs. Rebuilding creates collision and new lightmaps. Campaign actors and scripts use their own transfer tools.</p>}
          </details>
          {!native && <p>Open the desktop app to inspect and compile owned Halo geometry.</p>}
          {Boolean(project.inheritedBspConnections?.length) && (
            <p className="subtle">
              The next native build rechecks {project.inheritedBspConnections?.length} inherited
              {' '}connections alongside the new route.
            </p>
          )}
          <div className="bsp-actions">
            {canExtend && <label>Connect from BSP
              <select value={baseIndex} onChange={event => {
                const slot = Number(event.target.value);
                setBaseIndex(slot);
                setViewedBsp(slot);
              }} disabled={busy}>
                {baseParts.map((part, slot) => <option key={slot} value={slot}>BSP {slot} · {part.name}</option>)}
              </select>
            </label>}
            <label>
              Donor map
              <select
                aria-label="BSP donor map"
                value={donor}
                onChange={(e) => {
                  setDonor(e.target.value);
                  setIndex(0);
                  setError('');
                }}
                disabled={busy}
              >
                <option value="">Choose an imported map</option>
                {project.bspAssembly&&!candidates.some(entry=>entry.id===project.bspAssembly!.donorProjectId)&&<option value={project.bspAssembly.donorProjectId}>{project.bspAssembly.donorTitle} · saved source</option>}
                {candidates.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Section
              <select
                aria-label="Donor BSP section"
                value={index}
                onChange={(e) => setIndex(Number(e.target.value))}
                disabled={busy || !options.length}
              >
                {!options.length && (
                  <option value={index}>
                    {loadingOptions ? 'Loading BSP sections…' : 'No sections available'}
                  </option>
                )}
                {options.map((p) => (
                  <option key={p.index} value={p.index}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            {canExtend ? <label>Tunnel direction (degrees)
              <NumberField label="Tunnel direction (degrees)" min={-360} max={360} step={1}
                value={direction} onCommit={setDirection} disabled={busy}/>
            </label> : <label>
              Tunnel direction
              <select value={direction} disabled={busy} onChange={(event) => setDirection(Number(event.target.value))}>
                <option value={0}>East</option>
                <option value={60}>Northeast</option>
                <option value={120}>Northwest</option>
                <option value={180}>West</option>
                <option value={240}>Southwest</option>
                <option value={300}>Southeast</option>
              </select>
            </label>}
            <button
              disabled={!native || busy || !donor || !options.some((option) => option.index === index)}
              onClick={() =>
                void proposeConnection(false)
              }
            >
              {busy ? 'Working…' : 'Plan connected tunnel'}
            </button>
            {!canExtend && <button disabled={!native||busy||!donor||!options.some(option=>option.index===index)} onClick={()=>void proposeConnection(true)}>Plan adjacent terrain</button>}
          </div>
          {optionsError && (
            <p role="alert" className="bsp-error">
              Could not inspect the selected donor: {optionsError}
            </p>
          )}
          {draft && (
            <>
              <div className="bsp-draft-heading">
                <strong>Connection draft · {draft.donorTitle}</strong>
                <span>
                  {routeDraft!.tunnelPoints
                    .slice(1)
                    .reduce(
                      (total, point, i) =>
                        total + Math.hypot(...point.map((v, k) => v - routeDraft!.tunnelPoints[i][k])),
                      0,
                    )
                    .toFixed(1)}{' '}
                  world units · {routeDraft!.tunnelPoints.length - 2} bends
                </span>
              </div>
              <details>
                <summary>Native boundary seals{draft.nativeSeals?.length ? ' · ' + draft.nativeSeals.length : ''}</summary>
                <p>Enter the ordered vertices of the donor opening in world units. Divide raw WRL coordinates by 100. A nonzero apex offset raises or lowers the center of a triangular seal. Apply the connection and preview the donor BSP before building.</p>
                <label>Boundary vertices
                  <textarea rows={4} maxLength={512} value={sealText} onChange={event => setSealText(event.target.value)} />
                </label>
                <label>Seal apex Z offset <NumberField label="Seal apex Z offset" value={sealLift} min={-0.25} max={0.25} step={0.002} onCommit={setSealLift}/></label>
                <div className="bsp-actions">
                  <button disabled={busy || !sealText.trim() || (draft.nativeSeals?.length ?? 0) >= 8} onClick={() => {
                    try {
                      const vertices = nativeSealVertices(sealText);
                      if (sealLift !== 0 && (vertices.length !== 3 || Math.abs(sealLift) < 0.002)) {
                        throw new Error("Raised seals need three vertices and a Z offset of at least 0.002 world units.");
                      }
                      const seal = sealLift === 0 ? vertices : {vertices: vertices as [Vec3, Vec3, Vec3], lift: sealLift};
                      update({ nativeSeals: [...(draft.nativeSeals ?? []), seal] });
                      setSealText('');
                    } catch (error) {
                      setError(String(error));
                    }
                  }}>Add boundary seal</button>
                  {draft.nativeSeals?.map((seal, index) => <button type="button" key={JSON.stringify(seal)} disabled={busy}
                    onClick={() => update({ nativeSeals: draft.nativeSeals!.filter((_, i) => i !== index) })}>
                    Remove seal {index + 1}
                  </button>)}
                </div>
              </details>
              {!draft.separateNativeBsps && <>
              <div className="bsp-actions" aria-label="Connection routes">
                <label>Route <select aria-label="Connection route" value={selectedSection?`section:${selectedSection.id}`:infantry?'infantry':ridge?'highGround':'primary'} onChange={e=>setRouteView(e.target.value as typeof routeView)} disabled={busy}>
                  <option value="primary">{draft.openRoad?'Primary road':'Primary tunnel'}</option>
                  {draft.infantryTunnel&&<option value="infantry">Infantry tunnel</option>}
                  {draft.highGround&&<option value="highGround">High-ground route</option>}
                {(draft.sections??[]).map(section=><option key={section.id} value={`section:${section.id}`}>{section.name}</option>)}
                </select></label>
                <button disabled={busy||!!draft.infantryTunnel} onClick={()=>{try{update(addInfantryTunnel(draft));setRouteView('infantry');}catch(error){setError(String(error));}}}>Add infantry tunnel</button>
                <button disabled={busy||!!draft.highGround} onClick={()=>{try{update(addHighGroundRoute(draft));setRouteView('highGround');}catch(error){setError(String(error));}}}>Add high-ground route</button>
                <button disabled={busy||!!draft.infantryTunnel&&!!draft.highGround&&draft.tunnelWidth>=6&&draft.tunnelHeight>=4} onClick={()=>{try{update(makeThreeRouteSeam(draft));setRouteView('primary');}catch(error){setError(String(error));}}}>Make three-route seam</button>
                <button disabled={busy} onClick={()=>{try{update(addFlatLandBridge(draft));setRouteView('highGround');}catch(error){setError(String(error));}}}
                  title="Shape a wide, level deck between the landings, with graded ramps and a separate lower tunnel.">
                  {draft.highGround?'Shape ridge as flat land bridge':'Add flat land bridge & cave'}
                </button>
                {routeKey&&<button disabled={busy} onClick={()=>{update({[routeKey]:undefined});setRouteView('primary');}}>Remove {infantry?'infantry tunnel':'high-ground route'}</button>}
                {selectedSection&&<button disabled={busy} onClick={()=>{update({sections:draft.sections!.filter(section=>section.id!==selectedSection.id)});setRouteView('primary');}}>Remove seam section</button>}
                {!routeKey&&<label><input type="checkbox" aria-label="Open-sky road" checked={routeDraft!.openRoad??false} disabled={busy} onChange={e=>updateRoute({openRoad:e.target.checked,archSegments:undefined,...(e.target.checked?{tunnelWidth:Math.max(4,routeDraft!.tunnelWidth),tunnelHeight:Math.max(4,routeDraft!.tunnelHeight)}:{})})}/> Open sky above road</label>}
              </div>
              <p className="subtle" aria-label="Seam route requirements">Player cave: {draft.infantryTunnel?'drafted':'missing'} · Warthog route: {draft.tunnelWidth>=6&&draft.tunnelHeight>=4?'design width set':'widen the primary passage'} · Canyon tops: {draft.highGround?'drafted':'missing'}. Drafts are not gameplay acceptance.</p>
              {ridge&&<div className="bsp-actions">
                <button disabled={busy||!selectionMatches} onClick={()=>{setViewedBsp(draft.baseBspIndex??0);armEdge('base','ridge');}}>Pick ridge start on this BSP</button>
                <button disabled={busy||!selectionMatches} onClick={()=>armEdge('donor','ridge')}>Pick ridge end on donor BSP</button>
                <button disabled={busy||routeDraft!.tunnelWidth>=6} onClick={()=>updateRoute({tunnelWidth:6})}>Widen ridge for Warthog</button>
                {draft.terrainSeam&&<button disabled={busy} onClick={()=>{try{
                  const filled=fillTerrainToRidge(draft);
                  if(filled===draft){setError('The terrain shoulders already reach the ridge deck.');return;}
                  update({terrainSeam:filled.terrainSeam});
                }catch(error){setError(String(error));}}}>Fill terrain to ridge</button>}
                <small>A six-unit ridge also checks both sides of the deck for missing collision floor. Drive the compiled route to verify handling.</small>
              </div>}
              <p className="subtle">{ridge?'Pick both canyon-top floors, then use bends to shape ramps and overlooks.':infantry?'Keep both cave entrances on the original ground.':'Choose an enclosed passage or an open canyon road.'}</p>
              </>}
              {!draft.separateNativeBsps && <details className="bsp-edge-controls"><summary>Edge stitching{draft.sections?.length ? ` · ${draft.sections.length}` : ""}</summary>
                <div className="bsp-actions">
                  <button disabled={busy||!applied} aria-pressed={edgeTarget==='base'} onClick={()=>armEdge('base')}>Pick edge in this BSP</button>
                  <button disabled={busy||!applied} aria-pressed={edgeTarget==='donor'} onClick={()=>armEdge('donor')}>Pick edge in donor BSP</button>
                  <button disabled={busy||!native||!applied||!edgePicks.base||!edgePicks.donor||(draft.sections?.length??0)>=8} onClick={()=>void perform(async current=>{
                    const signature=assemblySignature(draft);await onSave();if(!current()||latest.current.signature!==signature)return;
                    const next=await call<Plan>('plan_bsp_assembly',{projectId:project.id,donorProjectId:donor,donorBspIndex:index,edges:[edgePicks.base,edgePicks.donor]});
                    if(current()&&latest.current.signature===signature){update(next);setRouteView(`section:${next.sections!.at(-1)!.id}`);setEdgePicks({});}
                  })}>Add seam section from edges</button>
                  {edgeTarget&&<button onClick={()=>setEdgeTarget(null)}>Cancel edge selection</button>}
                </div>
                <p role="status">{edgeTarget?`Click an edge on ${edgeTarget==='base'?'this region, then an edge on the donor':'the donor region'}.`:`Edges: ${edgePicks.base?'this BSP selected':'pick this BSP'} · ${edgePicks.donor?'donor selected':'pick donor'}.`} Apply the connection before picking edges.</p>
              </details>}
              {pickedSurface&&project.source?.sha256===pickedSurface.sourceHash&&pickedSurface.bspIndex===(draft.baseBspIndex??0)&&<button disabled={busy} onClick={()=>updateRoute({tunnelPoints:routeDraft!.tunnelPoints.map((p,i)=>i===0?[...pickedSurface.point]:p)})}>Use selected landscape for entrance</button>}
              {!selectionMatches && (
                <div className="bsp-selection-warning" role="status">
                  <p>
                    This draft connects {draft.donorTitle}. Plan the selected map and section to replace it,
                    or return to this draft.
                  </p>
                  <button
                    disabled={busy}
                    onClick={() => {
                      setDonor(draft.donorProjectId);
                      setIndex(draft.donorBspIndex);
                      setBaseIndex(draft.baseBspIndex ?? 0);
                      if (canExtend) setViewedBsp(draft.baseBspIndex ?? 0);
                    }}
                  >
                    Return to current draft
                  </button>
                </div>
              )}
              <ol className="bsp-workflow" aria-label="Connection steps">
                <li data-done={selectionMatches}>1 · Plan</li>
                <li data-done={!!report && selectionMatches}>2 · Preview</li>
                <li data-done={applied && selectionMatches}>3 · Apply</li>
                <li>4 · Build &amp; test in Halo</li>
              </ol>
              <p>
                Position <strong>{draft.donorTitle}</strong> relative to this map. Coordinates use Halo world
                units; Z is up. Moving the section also moves its tunnel mouth.
              </p>
              {selectedSection&&<label className="bsp-section-name">Section name<input aria-label="Seam section name" maxLength={60} value={selectedSection.name} onChange={e=>update({sections:draft.sections!.map(section=>section.id===selectedSection.id?{...section,name:e.target.value}:section)})}/></label>}
              {(!draft.terrainSeam||!!selectedSection)&&!routeKey&&<label>Opening <select aria-label="Seam opening shape" value={routeDraft!.archSegments?'arch':routeDraft!.openRoad?'road':'tunnel'} disabled={busy} onChange={e=>updateRoute({archSegments:e.target.value==='arch'?6:undefined,openRoad:e.target.value==='road',...(e.target.value==='road'?{tunnelWidth:Math.max(4,routeDraft!.tunnelWidth),tunnelHeight:Math.max(4,routeDraft!.tunnelHeight)}:{})})}><option value="tunnel">Rectangular tunnel</option><option value="arch">Arch through both sides</option><option value="road">Open canyon road</option></select></label>}
              <div className="bsp-seam-sliders">
                <label>Width <output>{routeDraft!.tunnelWidth.toFixed(1)}</output><input type="range" aria-label="Seam preview width" min={routeDraft!.openRoad?3:.8} max={16} step={.1} value={routeDraft!.tunnelWidth} onChange={e=>updateRoute({tunnelWidth:Number(e.target.value)})} onPointerUp={()=>void previewDraft()} onKeyUp={previewSliderKey}/></label>
                <label>Head clearance <output>{routeDraft!.tunnelHeight.toFixed(1)}</output><input type="range" aria-label="Seam preview height" min={routeDraft!.openRoad?3:1} max={16} step={.1} value={routeDraft!.tunnelHeight} onChange={e=>updateRoute({tunnelHeight:Number(e.target.value)})} onPointerUp={()=>void previewDraft()} onKeyUp={previewSliderKey}/></label>
                {routeDraft!.archSegments&&<label>Arch facets <output>{routeDraft!.archSegments}</output><input type="range" aria-label="Seam arch facets" min={2} max={12} step={1} value={routeDraft!.archSegments} onChange={e=>updateRoute({archSegments:Number(e.target.value)})} onPointerUp={()=>void previewDraft()} onKeyUp={previewSliderKey}/></label>}
                <button disabled={busy||!native||!selectionMatches} onClick={()=>void previewDraft()}>{busy?'Rebuilding preview…':'Preview draft & triangles'}</button>
                <span>Release a slider or adjust it with the arrow, Home/End or Page Up/Down keys to rebuild the exact preview and triangle count. Apply keeps it as one undoable source edit; native compilation is still required.</span>
              </div>
              <div className="bsp-actions bsp-build-actions" aria-label="Connection actions">
                <button
                  disabled={busy || applied || !selectionMatches}
                  onClick={() =>
                    onEdit({ ...project, bspAssembly: draft }, draft.terrainSeam?'Join adjacent native terrain':'Connect imported BSP with a tunnel')
                  }
                >
                  Apply connection
                </button>
                <button
                  disabled={busy || !applied || !project.bspAssembly || !selectionMatches}
                  onClick={() =>
                    void perform(async (current) => {
                      const request = { projectId: project.id, signature: assemblySignature(draft) };
                      await onSave();
                      const matches = () =>
                        current() &&
                        latest.current.projectId === request.projectId &&
                        latest.current.signature === request.signature;
                      if (!matches()) return;
                      const checked = await call<AssemblyReport>('preview_bsp_assembly', {
                        projectId: project.id, includeGeometry:true,
                        nativeBspIndex: draft.separateNativeBsps ? nativeBspIndex : undefined,
                      });
                      if (matches()) {setReport(checked);if(checked.viewport)window.dispatchEvent(new CustomEvent('gs:bsp-source-preview',{detail:checked.viewport}));}
                    })
                  }
                >
                  {draft.separateNativeBsps ? 'Preview native BSP & clearance' : 'Preview joined seam & clearance'}
                </button>
                <button
                  disabled={busy || !applied || !project.bspAssembly || !selectionMatches}
                  onClick={() =>
                    void perform(async (current) => {
                      const signature = assemblySignature(draft);
                      await onSave();
                      if (current() && latest.current.signature === signature) onBuild();
                    })
                  }
                >
                  {draft.separateNativeBsps ? 'Open Build & playtest' : 'Build & playtest connection'}
                </button>
              </div>
              <div className="bsp-settings">
                {vector(
                  draft.translation,
                  (v) => update(transformAssembly(draft, v, draft.yawDegrees)),
                  'Section position',
                )}
                <label>
                  Yaw
                  <NumberField
                    value={draft.yawDegrees}
                    min={-360}
                    max={360}
                    step={1}
                    label="BSP section yaw"
                    onCommit={(v) =>
                      update(
                        entrancePivot
                          ? rotateAssemblyAtEntrance(draft, v)
                          : transformAssembly(draft, draft.translation, v),
                      )
                    }
                  />
                </label>
                <label>
                  Tunnel width
                  <NumberField
                    value={routeDraft!.tunnelWidth}
                    min={0.8}
                    max={16}
                    step={0.1}
                    label="Tunnel width"
                    onCommit={(v) => updateRoute({ tunnelWidth: v })}
                  />
                </label>
                <label>
                  Clear height
                  <NumberField
                    value={routeDraft!.tunnelHeight}
                    min={1}
                    max={16}
                    step={0.1}
                    label="Tunnel clear height"
                    onCommit={(v) => updateRoute({ tunnelHeight: v })}
                  />
                </label>
              </div>
              {draft.terrainSeam&&<div className="bsp-settings">
                <label>Shoulders<NumberField value={draft.terrainSeam.shoulderWidth} min={2} max={24} step={0.5} label="Terrain shoulder width" onCommit={value=>update({terrainSeam:{...draft.terrainSeam!,shoulderWidth:value}})}/></label>
                <label>Bank height<NumberField value={draft.terrainSeam.bankHeight} min={0} max={12} step={0.25} label="Terrain bank height" onCommit={value=>update({terrainSeam:{...draft.terrainSeam!,bankHeight:value}})}/></label>
                <button disabled={busy||draft.terrainSeam.bankHeight===0} onClick={()=>{setDraft(flattenTerrainConnector(draft));setReport(null);}}>Start with flat connector</button>
                <span>Low-poly strip between the original edges; source texture scale stays intact. Start flat, then shape the shoulders and banks. Apply, check source and compile before playtesting.</span>
              </div>}
              <div className="bsp-toggles">
                <label>
                  <input
                    type="checkbox"
                    checked={entrancePivot}
                    onChange={(e) => setEntrancePivot(e.target.checked)}
                  />{' '}
                  Rotate around tunnel entrance
                </label>
                <label>
                  <input
                    type="checkbox"
                    aria-label="Include donor scenery"
                    checked={draft.includeDonorScenery ?? false}
                    disabled={busy}
                    onChange={(e) => update({ includeDonorScenery: e.target.checked })}
                  />{' '}
                  Include donor source scenery (single-BSP maps)
                </label>
              </div>
              <p>
                Retain the donor’s scenery models and placement settings in the compiled map. Scenery follows
                the section transform; matching editable tags are required. Donor weapons, vehicles,
                objectives, scripts and named-object bindings are separate.
              </p>
              <div className="bsp-waypoints">
                {routeDraft!.tunnelPoints.map((point, i) => (
                  <div key={i}>
                    {vector(
                      point,
                      (value) =>
                        updateRoute({ tunnelPoints: routeDraft!.tunnelPoints.map((p, k) => (k === i ? value : p)) }),
                      i === 0
                        ? 'Destination floor'
                        : i === routeDraft!.tunnelPoints.length - 1
                          ? 'Imported floor'
                          : `Bend ${i}`,
                    )}
                    {i > 0 && i < routeDraft!.tunnelPoints.length - 1 && (
                      <button
                        onClick={() => updateRoute({ tunnelPoints: routeDraft!.tunnelPoints.filter((_, k) => k !== i) })}
                      >
                        Remove bend
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="bsp-settings">
                <label>
                  Donor editable tags
                  <input
                    aria-label="Donor editable tags"
                    value={draft.donorTagsDirectory}
                    onChange={(e) => update({ donorTagsDirectory: e.target.value })}
                  />
                  <button
                    type="button"
                    disabled={!native || busy}
                    onClick={() =>
                      void perform(async (current) => {
                        const signature = assemblySignature(draft);
                        const folder = await call<string | null>('choose_setting_path', {
                          key: 'hekTagsDirectory',
                        });
                        if (folder && current() && latest.current.signature === signature)
                          update({ donorTagsDirectory: folder });
                      })
                    }
                  >
                    Browse donor tags
                  </button>
                  {!draft.donorTagsDirectory.trim() && <small>Connect matching editable tags before building this map.</small>}
                </label>
                <label>
                  Tunnel shader
                  <input
                    aria-label="Tunnel environment shader"
                    list={project.id+"-connection-materials"}
                    value={routeDraft!.tunnelShaderPath}
                    onChange={(e) => updateRoute({ tunnelShaderPath: e.target.value })}
                  />
                  <datalist id={project.id+'-connection-materials'}>{sourceShaders.map(tag=><option key={tag.id} value={tag.path}/>)}</datalist>
                </label>
                <div className="bsp-material-actions">
                  {sourceMetal&&<button onClick={()=>updateRoute({tunnelShaderPath:sourceMetal.path})}>Use source metal</button>}
                  {(()=>{const shader=sourceShaders.find(tag=>tag.path===routeDraft!.tunnelShaderPath),bitmap=shader?.references.find(ref=>ref.class==='bitm'&&/base map|diffuse map/i.test(ref.label));return bitmap&&<details><summary>Preview material bitmap</summary><BitmapPreview project={project} tagId={bitmap.targetId}/></details>;})()}
                </div>
              </div>
              <fieldset>
                <legend>Build layout</legend>
                <label><input type="checkbox" checked={draft.separateNativeBsps ?? false} disabled={busy || canExtend}
                  onChange={event => update({ separateNativeBsps: event.target.checked, preserveDonorBsp: event.target.checked && draft.preserveDonorBsp })} /> Separate native BSPs</label>
                {draft.separateNativeBsps && <>
                  <p>{canExtend ? 'Spark keeps the existing BSPs and prepares the donor and its passage for preview. Native build verifies the new switch volumes, clearance, and regional placements.' : 'Use one straight enclosed passage. Spark builds paired switch volumes and bakes each BSP. Choose MCC13 for donor starts and teleporters.'}</p>
                  {canExtend && baseParts.length <= 14 && <div>
                    <label><input type="checkbox" checked={draft.preserveDonorBsp ?? false} disabled={busy || (!draft.preserveDonorBsp && (draft.yawDegrees !== 0 || !!draft.nativeSeals?.length))}
                      onChange={event => update({ preserveDonorBsp: event.target.checked })} /> Preserve donor BSP in native build</label>
                    <button type="button" disabled={busy || !native || !selectionMatches || draft.yawDegrees !== 0}
                      onClick={() => void previewDraft(draft, true)}>Preview connector with donor intact</button>
                    <div className="bsp-actions">
                      <button type="button" disabled={busy || !selectionMatches || !donorPositionApplied} onClick={() => { setViewedBsp(draft.baseBspIndex ?? 0); armEdge('base', 'connector'); }}>Pick current BSP landing</button>
                      <button type="button" disabled={busy || !selectionMatches || !donorPositionApplied} onClick={() => armEdge('donor', 'connector')}>Pick donor landing</button>
                    </div>
                    <p className="subtle">Apply the donor position before picking landings. Adjust either floor point with the coordinate fields. With preservation enabled, apply and save the connection, then build for MCC13. The new connector gets its own BSP slot.</p>
                  </div>}
                  {!canExtend && <label>Preview native BSP <select value={nativeBspIndex} disabled={busy}
                    onChange={event => {setNativeBspIndex(Number(event.target.value)); setReport(null);}}>
                    <option value={0}>BSP 0 · Current region</option>
                    <option value={1}>BSP 1 · Donor region</option>
                  </select></label>}
                </>}
              </fieldset>
              <div className="bsp-actions">
                <button
                  disabled={busy || draft.separateNativeBsps || !!draft.terrainSeam&&!routeKey&&!selectedSection || routeDraft!.tunnelPoints.length >= 16}
                  onClick={() => {
                    const a = routeDraft!.tunnelPoints.at(-2)!,
                      b = routeDraft!.tunnelPoints.at(-1)!;
                    updateRoute({
                      tunnelPoints: [
                        ...routeDraft!.tunnelPoints.slice(0, -1),
                        a.map((v, i) => (v + b[i]) / 2) as Vec3,
                        b,
                      ],
                    });
                  }}
                >
                  Add tunnel bend
                </button>
                <button
                  disabled={busy || !project.bspAssembly}
                  onClick={() => onEdit({ ...project, bspAssembly: null }, 'Remove BSP connection')}
                >
                  Remove connection
                </button>
                {!applied && project.bspAssembly && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      const saved = project.bspAssembly!;
                      setDraft(saved);
                      setDonor(saved.donorProjectId);
                      setIndex(saved.donorBspIndex);
                      setBaseIndex(saved.baseBspIndex ?? 0);
                      if (canExtend) setViewedBsp(saved.baseBspIndex ?? 0);
                      setReport(null);
                      setError('');
                    }}
                  >
                    Reset draft to applied connection
                  </button>
                )}
              </div>
              {!applied && (
                <p role="status">
                  Apply these settings before checking or building. Ctrl+Z restores the previous connection.
                </p>
              )}
              {report && selectionMatches && (
                <div role="status">
                  <strong>
                    Source clearance checked at {report.walkSamples} points ·{' '}
                    {report.outputTriangles.toLocaleString()} triangles.
                  </strong>
                  {(report.donorScenery ?? 0) > 0 && (
                    <p>{report.donorScenery} donor scenery placements will be retained in the build.</p>
                  )}
                  {!!report.intactSwitches?.length && <p>Planned native switches: {report.intactSwitches.join(' · ')}</p>}
                  {report.nativePartitions && <p>BSP {report.nativePartitions.selected} · {report.nativePartitions.overlapSamples} shared corridor-floor samples · Largest floor difference {report.nativePartitions.maxFloorDelta.toFixed(4)} world units.</p>}
                  {report.nativeGameplayBudget && <NativeGameplayBudget budget={report.nativeGameplayBudget}
                    cacheTarget={draft.separateNativeBsps && (canExtend || buildRuntime === 'mccSteam') ? 'MCC13'
                      : draft.separateNativeBsps && (buildRuntime === 'haloCustomEdition' || buildRuntime === 'chupathingyCe') ? 'CE609' : undefined} />}
                  {report.nativeGameplayBudgetError && <p>Gameplay placement budget unavailable. {report.nativeGameplayBudgetError}</p>}
                  {report.routeClearance?.map(route=><p key={route.label}>{route.label}: {route.walkSamples} biped samples · design width {route.width} · clear height {route.clearHeight}.</p>)}
                  <p>{draft.separateNativeBsps ? 'Build next to check the compiled BSPs. Test both directions of the passage and the switch volumes in a supported runtime.' : 'Build next to check compiled collision. Walk the cave and high ground, drive the road in both directions, then test cross-region sniper visibility in Halo.'}</p>
                  {report.warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </div>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="bsp-error">
              {error}
            </p>
          )}
          </>}
        </div>
      )}
    </details>
  );
}
