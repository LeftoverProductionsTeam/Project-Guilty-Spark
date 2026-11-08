import { useEffect, useRef, useState } from 'react';
import { call, native } from '../api';
import { useMapState } from '../mapSession';
import {selectedSeamEdge} from '../seamEdges';
import type {NativeSurfacePick} from '../nativeSurfacePick';
import type { LibraryEntry, MapInspection, Project, Vec3 } from '../types';
import BitmapPreview from './BitmapPreview';
import { addInfantryTunnel, addHighGroundRoute, makeThreeRouteSeam, flattenTerrainConnector, assemblySignature, rotateAssemblyAtEntrance, transformAssembly } from '../bspAssembly';
import type { BspAssembly as Plan, BspOption, AssemblyReport, SeamEdge } from '../bspAssembly';
import { NumberField } from './ui';
import {mergeZoneOnlyUpdate} from '../visibilityZones';
import '../bspAssembly.css';
import MegaworldAtlas from './MegaworldAtlas';
import { useWorkspaceActivity } from './WorkspaceActivity';
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
  const sourceShaders=inspection&&project.source&&inspection.sha256===project.source.sha256?inspection.tags.filter(tag=>tag.class==='senv'):[];
  const sourceMetal=sourceShaders.find(tag=>/metal.*plate.*floor/i.test(tag.path))??sourceShaders.find(tag=>/metal.*flat/i.test(tag.path));
  const [pickedSurface,setPickedSurface]=useMapState<NativeSurfacePick|null>(project.id,'world.surface-selection',()=>null);
  const [edgeTarget,setEdgeTarget]=useMapState<'base'|'donor'|null>(project.id,'bsp.edgeTarget',null);
  const [edgePicks,setEdgePicks]=useMapState<{base?:SeamEdge;donor?:SeamEdge}>(project.id,'bsp.edgePicks',()=>({}));
  const activeNow=useRef(active);activeNow.current=active;
  const candidates = entries.filter(
    (e) => e.id !== project.id && e.sha256 && [6, 7, 13, 609].includes(e.version ?? 0),
  );
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
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [report, setReport] = useState<AssemblyReport | null>(null);
  const draftNow=useRef(draft);draftNow.current=draft;
  const operation = useRef(0),
    mounted = useRef(false);
  const latest = useRef({ projectId: project.id, signature: assemblySignature(draft), donor, index });
  latest.current = { projectId: project.id, signature: assemblySignature(draft), donor, index };
  const options = sectionList?.donor === donor ? sectionList.values : [];
  const loadingOptions = native && open && !!donor && sectionList?.donor !== donor && !optionsError;
  const selectionMatches = !!draft && draft.donorProjectId === donor && draft.donorBspIndex === index;
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
    if (native && open && donor)
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
  }, [donor, open]);
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
      const matches=()=>current()&&latest.current.signature===request.signature&&latest.current.donor===request.donor&&latest.current.index===request.index;
      await onSave();if(!matches())return;
      const plan=await call<Plan>('plan_bsp_assembly',{projectId:project.id,donorProjectId:donor,donorBspIndex:index,terrainSeam});
      if(matches()){setDraft(plan);setRouteView('primary');setReport(null);}
    });
  }
  const applied = assemblySignature(draft) === assemblySignature(project.bspAssembly ?? null);
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
    const hash=edgeTarget==='base'?project.source?.sha256:draft.donorSource.sha256,bsp=edgeTarget==='base'?0:draft.donorBspIndex;
    const edge=hash?selectedSeamEdge(pickedSurface,hash,bsp):null;if(!edge)return;
    setEdgePicks(previous=>({...previous,[edgeTarget]:edge}));setEdgeTarget(edgeTarget==='base'?'donor':null);setPickedSurface(null);
  },[pickedSurface,edgeTarget,project.source?.sha256,draft?.donorSource.sha256,draft?.donorBspIndex]);
  async function previewDraft(value:Plan|null=draftNow.current){
    if(!value||!project.bspAssembly||busy)return;
    await perform(async current=>{
      const signature=assemblySignature(value);
      const checked=await call<AssemblyReport>('preview_bsp_assembly',{projectId:project.id,includeGeometry:true,draft:value});
      if(current()&&latest.current.signature===signature){setReport(checked);if(checked.viewport)window.dispatchEvent(new CustomEvent('gs:bsp-source-preview',{detail:checked.viewport}));}
    });
  }
  function armEdge(target:'base'|'donor'){setPickedSurface(null);setEdgeTarget(target);}
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
        Connect another map’s BSP{project.bspAssembly ? ` · ${project.bspAssembly.donorTitle}` : ''}
      </summary>
      {open && (
        <div className="bsp-assembly-body">
          {report?.connectorTriangles!==undefined&&<p className="subtle" aria-label="Connector triangle budget">Connector: {report.connectorTriangles.toLocaleString()} triangles · full source: {report.outputTriangles.toLocaleString()}. Native compilation and gameplay remain separate.</p>}
          {pickedSurface&&project.source&&pickedSurface.sourceHash===project.source.sha256&&<p className="subtle" role="status">Selected BSP {pickedSurface.bspIndex+1}. Connect or extend with a rebuilt tunnel below. Reshaping compiled landscape faces is still in development; face extrusion, clipping and vertex editing currently require editable BSP Workshop source.</p>}
          <MegaworldAtlas projectId={project.id} assembly={project.bspAssembly} sourceSha={project.source?.sha256} layout={project.megaworldLayout} onLayout={(layout,description)=>onEdit({...project,megaworldLayout:layout},description)}/>
          <p>
            Add a campaign or multiplayer section and join it with a real tunnel. Spark rebuilds one native world
            with collision and new lightmaps. Your original maps stay preserved. Campaign actors and scripts
            are separate.
          </p>
          {!native && <p>Open the desktop app to inspect and compile owned Halo geometry.</p>}
          <div className="bsp-actions">
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
            <button
              disabled={!native || busy || !donor || !options.some((option) => option.index === index)}
              onClick={() =>
                void proposeConnection(false)
              }
            >
              {busy ? 'Working…' : 'Plan connected tunnel'}
            </button>
            <button disabled={!native||busy||!donor||!options.some(option=>option.index===index)} onClick={()=>void proposeConnection(true)}>Plan adjacent terrain</button>
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
              <fieldset className="bsp-edge-controls"><legend>Edge-to-edge seam sections</legend>
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
                <p role="status">{edgeTarget?`Click an edge on ${edgeTarget==='base'?'this region, then an edge on the donor':'the donor region'}.`:`Edges: ${edgePicks.base?'this BSP selected':'pick this BSP'} · ${edgePicks.donor?'donor selected':'pick donor'}.`} Apply the donor first. Each section keeps its own width, path and roof; original architecture stays intact outside the cut.</p>
              </fieldset>
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
                {routeKey&&<button disabled={busy} onClick={()=>{update({[routeKey]:undefined});setRouteView('primary');}}>Remove {infantry?'infantry tunnel':'high-ground route'}</button>}
                {selectedSection&&<button disabled={busy} onClick={()=>{update({sections:draft.sections!.filter(section=>section.id!==selectedSection.id)});setRouteView('primary');}}>Remove seam section</button>}
                {!routeKey&&<label><input type="checkbox" aria-label="Open-sky road" checked={routeDraft!.openRoad??false} disabled={busy} onChange={e=>updateRoute({openRoad:e.target.checked,archSegments:undefined,...(e.target.checked?{tunnelWidth:Math.max(4,routeDraft!.tunnelWidth),tunnelHeight:Math.max(4,routeDraft!.tunnelHeight)}:{})})}/> Open sky above road</label>}
              </div>
              <p className="subtle" aria-label="Seam route requirements">Player cave: {draft.infantryTunnel?'drafted':'missing'} · Warthog route: {draft.tunnelWidth>=6&&draft.tunnelHeight>=4?'design width set':'widen the primary passage'} · Canyon tops: {draft.highGround?'drafted':'missing'}. Drafts are not gameplay acceptance.</p>
              <p className="subtle">{ridge?'Open ridge with access ramps. Adjust its floor points onto walkable canyon tops on both maps; use bends for overlooks. Source checks must pass before compiling.':infantry?'Separate player cave. Keep both entrances on the original ground.':'Widen the primary passage for a Warthog cave or choose open sky for a canyon road.'} All routes rebuild together. Vehicle handling, continuous mountain access and sniper sightlines require a Halo playtest.</p>
              {pickedSurface&&project.source?.sha256===pickedSurface.sourceHash&&pickedSurface.bspIndex===0&&<button disabled={busy} onClick={()=>updateRoute({tunnelPoints:routeDraft!.tunnelPoints.map((p,i)=>i===0?[...pickedSurface.point]:p)})}>Use selected landscape for entrance</button>}
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
                    }}
                  >
                    Return to current draft
                  </button>
                </div>
              )}
              <ol className="bsp-workflow" aria-label="Connection steps">
                <li data-done={selectionMatches}>1 · Plan</li>
                <li data-done={applied && selectionMatches}>2 · Apply</li>
                <li data-done={!!report && selectionMatches}>3 · Check source</li>
                <li>4 · Build &amp; test in Halo</li>
              </ol>
              <p>
                Position <strong>{draft.donorTitle}</strong> relative to this map. Coordinates use Halo world
                units; Z is up. Moving the section also moves its tunnel mouth.
              </p>
              {selectedSection&&<label className="bsp-section-name">Section name<input aria-label="Seam section name" maxLength={60} value={selectedSection.name} onChange={e=>update({sections:draft.sections!.map(section=>section.id===selectedSection.id?{...section,name:e.target.value}:section)})}/></label>}
              {(!draft.terrainSeam||!!selectedSection)&&!routeKey&&<label>Opening <select aria-label="Seam opening shape" value={routeDraft!.archSegments?'arch':routeDraft!.openRoad?'road':'tunnel'} disabled={busy} onChange={e=>updateRoute({archSegments:e.target.value==='arch'?6:undefined,openRoad:e.target.value==='road',...(e.target.value==='road'?{tunnelWidth:Math.max(4,routeDraft!.tunnelWidth),tunnelHeight:Math.max(4,routeDraft!.tunnelHeight)}:{})})}><option value="tunnel">Rectangular tunnel</option><option value="arch">Arch through both sides</option><option value="road">Open canyon road</option></select></label>}
              <div className="bsp-seam-sliders">
                <label>Width <output>{routeDraft!.tunnelWidth.toFixed(1)}</output><input type="range" aria-label="Seam preview width" min={routeDraft!.openRoad?3:.8} max={16} step={.1} value={routeDraft!.tunnelWidth} onChange={e=>updateRoute({tunnelWidth:Number(e.target.value)})} onPointerUp={()=>void previewDraft()} onKeyUp={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key))void previewDraft();}}/></label>
                <label>Head clearance <output>{routeDraft!.tunnelHeight.toFixed(1)}</output><input type="range" aria-label="Seam preview height" min={routeDraft!.openRoad?3:1} max={16} step={.1} value={routeDraft!.tunnelHeight} onChange={e=>updateRoute({tunnelHeight:Number(e.target.value)})} onPointerUp={()=>void previewDraft()} onKeyUp={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key))void previewDraft();}}/></label>
                {routeDraft!.archSegments&&<label>Arch facets <output>{routeDraft!.archSegments}</output><input type="range" aria-label="Seam arch facets" min={2} max={12} step={1} value={routeDraft!.archSegments} onChange={e=>updateRoute({archSegments:Number(e.target.value)})} onPointerUp={()=>void previewDraft()}/></label>}
                <button disabled={busy||!native||!project.bspAssembly||!selectionMatches} onClick={()=>void previewDraft()}>{busy?'Rebuilding preview…':'Preview draft & triangles'}</button>
                <span>Release a slider to rebuild the exact preview and triangle count. Apply keeps it as one undoable source edit; native compilation is still required.</span>
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
              <div className="bsp-actions">
                <button
                  disabled={busy || !!draft.terrainSeam&&!routeKey&&!selectedSection || routeDraft!.tunnelPoints.length >= 16}
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
                      });
                      if (matches()) {setReport(checked);if(checked.viewport)window.dispatchEvent(new CustomEvent('gs:bsp-source-preview',{detail:checked.viewport}));}
                    })
                  }
                >
                  Preview joined seam & clearance
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
                  Build & playtest connection
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
                  {report.routeClearance?.map(route=><p key={route.label}>{route.label}: {route.walkSamples} biped samples · design width {route.width} · clear height {route.clearHeight}.</p>)}
                  <p>Build next to check compiled collision. Walk the cave and high ground, drive the road in both directions, then test cross-region sniper visibility in Halo.</p>
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
        </div>
      )}
    </details>
  );
}
