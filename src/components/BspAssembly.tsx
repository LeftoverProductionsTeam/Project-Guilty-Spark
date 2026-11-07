import { useEffect, useRef, useState } from 'react';
import { call, native } from '../api';
import { useMapState } from '../mapSession';
import type {NativeSurfacePick} from '../nativeSurfacePick';
import type { LibraryEntry, MapInspection, Project, Vec3 } from '../types';
import BitmapPreview from './BitmapPreview';
import { addInfantryTunnel, assemblySignature, rotateAssemblyAtEntrance, transformAssembly } from '../bspAssembly';
import type { BspAssembly as Plan, BspOption, AssemblyReport } from '../bspAssembly';
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
  const [pickedSurface]=useMapState<NativeSurfacePick|null>(project.id,'world.surface-selection',()=>null);
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
    [routeView,setRouteView]=useMapState<'primary'|'infantry'>(project.id,'bsp.route','primary'),
    [entrancePivot, setEntrancePivot] = useMapState(project.id, 'bsp.entrancePivot', false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [report, setReport] = useState<AssemblyReport | null>(null);
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
  const applied = assemblySignature(draft) === assemblySignature(project.bspAssembly ?? null);
  function update(change: Partial<Plan>) {
    if (draft) {
      const next = { ...draft, ...change };
      latest.current = { ...latest.current, signature: assemblySignature(next) };
      setDraft(next);
      setReport(null);
      setError('');
    }
  }
  const infantry=routeView==='infantry'&&!!draft?.infantryTunnel;
  const routeDraft=draft&&infantry?{...draft,tunnelPoints:draft.infantryTunnel!.points,tunnelWidth:draft.infantryTunnel!.width,tunnelHeight:draft.infantryTunnel!.height,tunnelShaderPath:draft.infantryTunnel!.shaderPath}:draft;
  function updateRoute(change:Partial<Plan>){
    if(infantry&&draft?.infantryTunnel){const route=draft.infantryTunnel;update({infantryTunnel:{...route,
      points:change.tunnelPoints??route.points,width:change.tunnelWidth??route.width,height:change.tunnelHeight??route.height,shaderPath:change.tunnelShaderPath??route.shaderPath}});}
    else update(change);
  }
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
          {pickedSurface&&project.source&&pickedSurface.sourceHash===project.source.sha256&&<p className="subtle" role="status">Selected BSP {pickedSurface.bspIndex+1}. Connect or extend with a rebuilt tunnel below. Reshaping compiled landscape faces is still in development; face extrusion, clipping and vertex editing currently require editable BSP Workshop source.</p>}
          <MegaworldAtlas projectId={project.id} assembly={project.bspAssembly} sourceSha={project.source?.sha256}/>
          <p>
            Add a campaign or multiplayer section and join it with a real tunnel. Spark rebuilds one MCC world
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
                void perform(async (current) => {
                  const request = { ...latest.current };
                  const matches = () =>
                    current() &&
                    latest.current.signature === request.signature &&
                    latest.current.donor === request.donor &&
                    latest.current.index === request.index;
                  await onSave();
                  if (!matches()) return;
                  const plan = await call<Plan>('plan_bsp_assembly', {
                    projectId: project.id,
                    donorProjectId: donor,
                    donorBspIndex: index,
                  });
                  if (matches()) {
                    setDraft(plan);
                    setReport(null);
                  }
                })
              }
            >
              {busy ? 'Working…' : 'Plan connected tunnel'}
            </button>
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
              <div className="bsp-actions" aria-label="Connection routes">
                <label>Route <select aria-label="Connection route" value={infantry?'infantry':'primary'} onChange={e=>setRouteView(e.target.value as 'primary'|'infantry')} disabled={busy}>
                  <option value="primary">{draft.openRoad?'Primary road':'Primary tunnel'}</option>
                  {draft.infantryTunnel&&<option value="infantry">Infantry tunnel</option>}
                </select></label>
                <button disabled={busy||!!draft.infantryTunnel} onClick={()=>{try{update(addInfantryTunnel(draft));setRouteView('infantry');}catch(error){setError(String(error));}}}>Add infantry tunnel</button>
                {infantry&&<button disabled={busy} onClick={()=>{update({infantryTunnel:undefined});setRouteView('primary');}}>Remove infantry tunnel</button>}
                {!infantry&&<label><input type="checkbox" aria-label="Open-sky road" checked={draft.openRoad??false} disabled={busy} onChange={e=>update({openRoad:e.target.checked,...(e.target.checked?{tunnelWidth:Math.max(4,draft.tunnelWidth),tunnelHeight:Math.max(4,draft.tunnelHeight)}:{})})}/> Open sky above road</label>}
              </div>
              <p className="subtle">{infantry?'Adjust the separate infantry route below. Its entrances must stay on the original ground.':'The primary route can be widened for vehicles. Open sky uses the native sky boundary.'} Both routes are checked and rebuilt together; walking and driving require a Halo playtest.</p>
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
                  disabled={busy || routeDraft!.tunnelPoints.length >= 16}
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
                    onEdit({ ...project, bspAssembly: draft }, 'Connect imported BSP with a tunnel')
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
                        projectId: project.id,
                      });
                      if (matches()) setReport(checked);
                    })
                  }
                >
                  Check tunnel clearance
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
                  <p>{draft.infantryTunnel?'Both primary and infantry routes passed the source checks. ':''}Build next to check compiled collision, then walk and drive in Halo.</p>
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
