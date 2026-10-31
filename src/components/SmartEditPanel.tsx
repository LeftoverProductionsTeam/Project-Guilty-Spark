import { useLayoutEffect, useRef, useState } from 'react';
import { call, native } from '../api';
import type { OpenProject, Project, RuntimeId } from '../types';
import { runtimeNames } from '../runtimeWorkbench';
import { changedEditInputs, editRevisionKey, editRouteNames, intentDescription } from '../smartEdit';
import type { EditExecution, EditPlan, EditPreference } from '../smartEdit';
import { useMapState } from '../mapSession';
import { Notice, Pill } from './ui';
import './smartEdit.css';

/** One saved revision and the same desktop router for the tag and world views. */
export default function SmartEditPanel({
  project,
  onSave,
  onSelectMap,
  notify,
}: {
  project: Project;
  onSave?: () => Promise<void>;
  onSelectMap?: (id: string) => void;
  notify: (message: string) => void;
}) {
  const [preference, setPreference] = useMapState<EditPreference>(
    project.id,
    'smart-edit.preference',
    'automatic',
  );
  const [runtimeId, setRuntimeId] = useMapState<RuntimeId>(
    project.id,
    'smart-edit.runtime',
    project.quickForge?.runtimeId ??
      project.buildTargets?.find((t) => t.id === project.activeBuildTarget)?.runtimeId ??
      'mccSteam',
  );
  const [plan, setPlan] = useState<EditPlan | null>(null),
    [result, setResult] = useState<EditExecution | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [invalidated, setInvalidated] = useState<string[]>([]);
  const generation = useRef(0),
    revision = editRevisionKey(project);
  const signature = JSON.stringify([revision, preference, runtimeId]);
  const scope = useRef({ id: project.id, revision });
  useLayoutEffect(() => {
    // Commit the request generation before the controls can receive input.
    // A ref changed during render can belong to an abandoned concurrent render;
    // a passive effect can run after the first click has already begun saving.
    generation.current++;
    const cancelledHere = scope.current.id === project.id && (busy || plan !== null);
    const changed = changedEditInputs(scope.current.revision, revision);
    const changedMap=scope.current.id!==project.id;
    scope.current = { id: project.id, revision };
    setPlan(null);
    if(changedMap)setResult(null);
    setInvalidated(cancelledHere ? changed : []);
    setError(
      cancelledHere
        ? `${changed.join(', ') || 'Save method'} changed. Review this map’s current save plan before continuing.`
        : '',
    );
    setBusy(false);
    return () => {
      generation.current++;
    };
  }, [signature]);
  async function perform(work: (generation: number) => Promise<void>) {
    const current = generation.current;
    setBusy(true);
    setError('');
    setInvalidated([]);
    try {
      await work(current);
    } catch (e) {
      if (current === generation.current) setError(String(e));
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  function preview() {
    void perform(async (current) => {
      await onSave?.();
      if (current !== generation.current) return;
      const next = await call<EditPlan>('smart_edit_plan', { projectId: project.id, runtimeId, preference });
      if (current === generation.current) {
        setPlan(next);
        setResult(null);
      }
    });
  }
  function execute() {
    if (!plan?.selectedRoute) return;
    void perform(async (current) => {
      // Save again so a keyboard edit made since preview cannot be lost. The
      // desktop refuses the old plan if that changed the saved revision.
      await onSave?.();
      if (current !== generation.current) return;
      const next = await call<EditExecution>('smart_edit_execute', { planId: plan.id });
      if (current !== generation.current) return;
      setResult(next);
      setPlan(null);
      notify(
        next.status === 'validated'
          ? 'Edited map copy validated. Open it in a new map tab to inspect it.'
          : 'Native build started. Follow its progress in Build & playtest.',
      );
    });
  }
  return (
    <details
      className="smart-edit"
      data-smart-edit-project={project.id}
      data-smart-edit-invalidated={invalidated.join(', ')}
    >
      <summary>
        Save a map copy <Pill>Smart routing</Pill>
      </summary>
      <p>
        Keep editing here. Spark checks whether these changes can use a direct copy or need native source
        tools. The original stays preserved.
      </p>
      <div className="smart-edit-options">
        <label>
          Output runtime
          <select
            aria-label="Smart edit runtime"
            value={runtimeId}
            disabled={busy}
            onChange={(e) => setRuntimeId(e.target.value as RuntimeId)}
          >
            {Object.entries(runtimeNames).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Save method
          <select
            aria-label="Smart edit method"
            value={preference}
            disabled={busy}
            onChange={(e) => setPreference(e.target.value as EditPreference)}
          >
            {Object.entries(editRouteNames).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button disabled={!native || busy} onClick={preview}>
        {busy ? 'Checking saved revision…' : 'Review save plan'}
      </button>
      {!native && <p className="subtle">Saving native maps requires the desktop app.</p>}
      {error && <Notice>{error}</Notice>}
      {plan && (
        <div className="smart-edit-plan" role="status">
          <strong>
            {plan.selectedRoute ? editRouteNames[plan.selectedRoute] : 'No verified route for this revision'}
          </strong>
          <span className="subtle">
            {runtimeNames[plan.runtimeId]}
            {plan.cacheVersion !== null ? ` · source cache ${plan.cacheVersion}` : ''} · {plan.intents.length}{' '}
            planned changes
          </span>
          {!!plan.intents.length && (
            <details>
              <summary>Changes in this copy</summary>
              <ul>
                {plan.intents.map((intent, i) => (
                  <li key={i}>{intentDescription(intent)}</li>
                ))}
              </ul>
            </details>
          )}
          {plan.selectedRoute && <p>{plan.choices.find((c) => c.route === plan.selectedRoute)?.reason}</p>}
          <details open={!plan.selectedRoute}>
            <summary>Other methods &amp; requirements</summary>
            <div className="smart-edit-routes">
              {plan.choices.map((choice) => (
                <div key={choice.route}>
                  <strong>
                    {editRouteNames[choice.route]} · {choice.available ? 'Available' : 'Needs another route'}
                  </strong>
                  <p>{choice.reason}</p>
                </div>
              ))}
            </div>
          </details>
          <details>
            <summary>Validation, tools & recovery</summary>
            <p>{plan.recovery}</p>
            <ul>
              {plan.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
            <p>
              Required tools:{' '}
              {plan.choices.find((c) => c.route === plan.selectedRoute)?.tools.join(', ') ??
                'See route requirements above'}
            </p>
            <code>Source SHA-256: {plan.sourceSha256 ?? 'Generated source'}</code>
            <code>Saved revision: {plan.projectFingerprint}</code>
          </details>
          <button className="primary" disabled={busy || !plan.selectedRoute} onClick={execute}>
            {plan.selectedRoute === 'directCache' ? 'Save validated map copy' : 'Run verified source build'}
          </button>
        </div>
      )}
      {result && (
        <div className="smart-edit-result" role="status">
          <strong>{result.status === 'validated' ? 'Validated copy ready' : 'Native build started'}</strong>
          <p>
            {result.record?.message ??
              'Follow the native compiler and validation results in Build & playtest. A started build is not a validated output.'}
          </p>
          {result.record?.output && <code>{result.record.output}</code>}
          {result.record?.output && (
            <button
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  await call('reveal_folder', { kind: 'buildOutput', id: `${project.id}:${result.jobId}` });
                })
              }
            >
              Show map folder
            </button>
          )}
          {result.status === 'validated' && (
            <button
              disabled={busy}
              onClick={() =>
                void perform(async (current) => {
                  const opened = await call<OpenProject>('open_built_map', {
                    projectId: project.id,
                    buildId: result.jobId,
                  });
                  if (current === generation.current) {
                    onSelectMap?.(opened.project.id);
                    notify('Validated edited copy added to the map library.');
                  }
                })
              }
            >
              {onSelectMap?'Open edited copy in a new tab':'Add edited copy to map library'}
            </button>
          )}
        </div>
      )}
    </details>
  );
}
