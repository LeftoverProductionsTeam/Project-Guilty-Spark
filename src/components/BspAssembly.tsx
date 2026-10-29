import { useEffect, useRef, useState } from 'react';
import { call, native } from '../api';
import { useMapState } from '../mapSession';
import type { LibraryEntry, Project, Vec3 } from '../types';
import { assemblySignature, rotateAssemblyAtEntrance, transformAssembly } from '../bspAssembly';
import type { BspAssembly as Plan, BspOption, AssemblyReport } from '../bspAssembly';
import { NumberField } from './ui';
import {mergeZoneOnlyUpdate} from '../visibilityZones';
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
  const [sectionList, setSectionList] = useState<{ donor: string; values: BspOption[] } | null>(null),
    [optionsError, setOptionsError] = useState(''),
    [index, setIndex] = useMapState(project.id, 'bsp.section', project.bspAssembly?.donorBspIndex ?? 0),
    [draft, setDraft] = useMapState<Plan | null>(project.id, 'bsp.draft', () => project.bspAssembly ?? null),
    [appliedSource, setAppliedSource] = useMapState(
      project.id,
      'bsp.applied',
      assemblySignature(project.bspAssembly ?? null),
    ),
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
      void call<BspOption[]>('bsp_assembly_options', { projectId: donor }).then(
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
      mounted.current && operation.current === request && latest.current.projectId === owner;
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
                onChange={(e) => {
                  setDonor(e.target.value);
                  setIndex(0);
                  setError('');
                }}
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
                  {draft.tunnelPoints
                    .slice(1)
                    .reduce(
                      (total, point, i) =>
                        total + Math.hypot(...point.map((v, k) => v - draft.tunnelPoints[i][k])),
                      0,
                    )
                    .toFixed(1)}{' '}
                  world units · {draft.tunnelPoints.length - 2} bends
                </span>
              </div>
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
