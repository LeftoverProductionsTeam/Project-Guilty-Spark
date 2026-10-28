import { useEffect, useRef, useState } from 'react';
import { call, native } from '../api';
import { useMapState } from '../mapSession';
import type { LibraryEntry, Project, Vec3 } from '../types';
import { assemblySignature, transformAssembly } from '../bspAssembly';
import type { BspAssembly as Plan, BspOption, AssemblyReport } from '../bspAssembly';
import { NumberField } from './ui';
import '../bspAssembly.css';
export default function BspAssembly({
  project,
  entries,
  onEdit,
  onSave,
  onBuild,
}: {
  project: Project;
  entries: LibraryEntry[];
  onEdit: (p: Project, description: string) => void;
  onSave: () => Promise<void>;
  onBuild: () => void;
}) {
  const candidates = entries.filter(
    (e) => e.id !== project.id && e.sha256 && [6, 7, 13, 609].includes(e.version ?? 0),
  );
  const [open, setOpen] = useMapState(project.id, 'bsp.open', false),
    [donor, setDonor] = useMapState(
      project.id,
      'bsp.donor',
      project.bspAssembly?.donorProjectId ?? candidates[0]?.id ?? '',
    );
  const [options, setOptions] = useState<BspOption[]>([]),
    [index, setIndex] = useMapState(project.id, 'bsp.section', project.bspAssembly?.donorBspIndex ?? 0),
    [draft, setDraft] = useMapState<Plan | null>(project.id, 'bsp.draft', () => project.bspAssembly ?? null),
    [appliedSource, setAppliedSource] = useMapState(
      project.id,
      'bsp.applied',
      JSON.stringify(project.bspAssembly ?? null),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [report, setReport] = useState<AssemblyReport | null>(null);
  const latest = useRef({ projectId: project.id, signature: assemblySignature(draft) });
  latest.current = { projectId: project.id, signature: assemblySignature(draft) };
  useEffect(() => {
    const signature = JSON.stringify(project.bspAssembly ?? null);
    if (signature !== appliedSource) {
      setDraft(project.bspAssembly ?? null);
      setAppliedSource(signature);
      setReport(null);
    }
  }, [project.bspAssembly, appliedSource]);
  useEffect(() => {
    let cancelled = false;
    setOptions([]);
    if (native && open && donor)
      void call<BspOption[]>('bsp_assembly_options', { projectId: donor }).then(
        (value) => {
          if (!cancelled) {
            setOptions(value);
            if (!value.some((p) => p.index === index)) setIndex(value[0]?.index ?? 0);
          }
        },
        (e) => {
          if (!cancelled) setError(String(e));
        },
      );
    return () => {
      cancelled = true;
    };
  }, [donor, open]);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const applied = assemblySignature(draft) === assemblySignature(project.bspAssembly ?? null);
  function update(change: Partial<Plan>) {
    if (draft) {
      const next = { ...draft, ...change };
      latest.current = { projectId: project.id, signature: assemblySignature(next) };
      setDraft(next);
      setReport(null);
    }
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
                onChange={(e) => setDonor(e.target.value)}
                disabled={busy}
              >
                <option value="">Choose an imported map</option>
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
                {options.map((p) => (
                  <option key={p.index} value={p.index}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={!native || busy || !donor || !options.length}
              onClick={() =>
                void perform(async () => {
                  await onSave();
                  const plan = await call<Plan>('plan_bsp_assembly', {
                    projectId: project.id,
                    donorProjectId: donor,
                    donorBspIndex: index,
                  });
                  setDraft(plan);
                  setReport(null);
                })
              }
            >
              {busy ? 'Working…' : 'Plan connected tunnel'}
            </button>
          </div>
          {draft && (
            <>
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
                    onCommit={(v) => update(transformAssembly(draft, draft.translation, v))}
                  />
                </label>
                <label>
                  Tunnel width
                  <NumberField
                    value={draft.tunnelWidth}
                    min={0.8}
                    max={16}
                    step={0.1}
                    label="Tunnel width"
                    onCommit={(v) => update({ tunnelWidth: v })}
                  />
                </label>
                <label>
                  Clear height
                  <NumberField
                    value={draft.tunnelHeight}
                    min={1}
                    max={16}
                    step={0.1}
                    label="Tunnel clear height"
                    onCommit={(v) => update({ tunnelHeight: v })}
                  />
                </label>
              </div>
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
              <p>
                Retain the donor’s scenery models and placement settings in the compiled map. Scenery
                follows the section transform; matching editable tags are required. Donor weapons,
                vehicles, objectives, scripts and named-object bindings are separate.
              </p>
              <div className="bsp-waypoints">
                {draft.tunnelPoints.map((point, i) => (
                  <div key={i}>
                    {vector(
                      point,
                      (value) =>
                        update({ tunnelPoints: draft.tunnelPoints.map((p, k) => (k === i ? value : p)) }),
                      i === 0
                        ? 'Destination floor'
                        : i === draft.tunnelPoints.length - 1
                          ? 'Imported floor'
                          : `Bend ${i}`,
                    )}
                    {i > 0 && i < draft.tunnelPoints.length - 1 && (
                      <button
                        onClick={() => update({ tunnelPoints: draft.tunnelPoints.filter((_, k) => k !== i) })}
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
                  <button type="button" disabled={!native || busy} onClick={()=>void perform(async()=>{
                    const folder=await call<string|null>('choose_setting_path',{key:'hekTagsDirectory'});
                    if(folder)update({donorTagsDirectory:folder});
                  })}>Browse donor tags</button>
                </label>
                <label>
                  Tunnel shader
                  <input
                    aria-label="Tunnel environment shader"
                    value={draft.tunnelShaderPath}
                    onChange={(e) => update({ tunnelShaderPath: e.target.value })}
                  />
                </label>
              </div>
              <div className="bsp-actions">
                <button
                  disabled={busy || draft.tunnelPoints.length >= 16}
                  onClick={() => {
                    const a = draft.tunnelPoints.at(-2)!,
                      b = draft.tunnelPoints.at(-1)!;
                    update({
                      tunnelPoints: [
                        ...draft.tunnelPoints.slice(0, -1),
                        a.map((v, i) => (v + b[i]) / 2) as Vec3,
                        b,
                      ],
                    });
                  }}
                >
                  Add tunnel bend
                </button>
                <button
                  disabled={busy || applied}
                  onClick={() =>
                    onEdit({ ...project, bspAssembly: draft }, 'Connect imported BSP with a tunnel')
                  }
                >
                  Apply connection
                </button>
                <button
                  disabled={busy || !applied || !project.bspAssembly}
                  onClick={() =>
                    void perform(async () => {
                      const request = { projectId: project.id, signature: assemblySignature(draft) };
                      await onSave();
                      const matches = () => latest.current.projectId === request.projectId && latest.current.signature === request.signature;
                      if (!matches()) return;
                      const checked = await call<AssemblyReport>('preview_bsp_assembly', { projectId: project.id });
                      if (matches()) setReport(checked);
                    })
                  }
                >
                  Check tunnel clearance
                </button>
                <button
                  disabled={busy || !applied || !project.bspAssembly}
                  onClick={() =>
                    void perform(async () => {
                      await onSave();
                      onBuild();
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
              </div>
              {!applied && (
                <p role="status">
                  Apply these settings before checking or building. Ctrl+Z restores the previous connection.
                </p>
              )}
              {report && (
                <div role="status">
                  <strong>
                    Source clearance checked at {report.walkSamples} points ·{' '}
                    {report.outputTriangles.toLocaleString()} triangles.
                  </strong>
                  {(report.donorScenery ?? 0) > 0 && (
                    <p>{report.donorScenery} donor scenery placements will be retained in the build.</p>
                  )}
                  <p>Build next to check the compiled collision, then walk the tunnel in Halo.</p>
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
