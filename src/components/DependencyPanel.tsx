import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, FolderOpen, RefreshCw, Wrench, X } from 'lucide-react';
import { call, native } from '../api';
import type { Bootstrap, OpenProject, Project, RuntimeId } from '../types';
import {
  dependencyContextMatches,
  dependencyStateLabel,
  mergeDependencyChoice,
  type DependencyAction,
  type DependencyActionPlan,
  type DependencyChoiceResult,
  type DependencyReport,
} from '../dependencyGuide';
import './dependencyPanel.css';
import BaboonTools from './BaboonTools';
import CustomEditionSetup from './CustomEditionSetup';

export default function DependencyPanel({
  project,
  runtime,
  onSetupChanged,
  onProjectUpdated,
  onChooseAssets,
}: {
  project: Project | null;
  runtime: RuntimeId;
  onSetupChanged?: (bootstrap: Bootstrap) => void;
  onProjectUpdated?: (opened: OpenProject) => void;
  onChooseAssets?: () => void;
}) {
  const [report, setReport] = useState<DependencyReport | null>(null);
  const [plan, setPlan] = useState<DependencyActionPlan | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const current = useRef({ project, runtime });
  current.current = { project, runtime };
  const generation = useRef(0),
    activePlan = useRef<DependencyActionPlan | null>(null);
  activePlan.current = plan;
  const discard = useCallback((value: DependencyActionPlan | null) => {
    if (native && value) void call('discard_dependency_action', { planId: value.id }).catch(() => {});
  }, []);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    if (!native) return;
    setBusy(true);
    setError('');
    try {
      const result = await call<DependencyReport>('dependency_report', {
        runtimeId: runtime,
        projectId: project?.id ?? null,
      });
      if (
        request === generation.current &&
        dependencyContextMatches(result, current.current.runtime, current.current.project)
      )
        setReport(result);
    } catch (e) {
      if (request === generation.current) setError(String(e));
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }, [runtime, project?.id]);
  useEffect(() => {
    setReport(null);
    setPlan(null);
    setReviewed(false);
    setNotice('');
    void refresh();
    return () => {
      generation.current++;
      discard(activePlan.current);
    };
  }, [refresh, discard]);

  async function act(action: DependencyAction) {
    if (action.kind === 'chooseAssets') {
      onChooseAssets?.();
      return;
    }
    const request = generation.current,
      before = current.current.project;
    if (before && !onProjectUpdated && ['chooseResources', 'chooseSetting'].includes(action.kind)) {
      setError('Open this guide from Settings so the selected map can receive its dependency changes.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    discard(plan);
    setPlan(null);
    setReviewed(false);
    try {
      const args = { runtimeId: runtime, projectId: before?.id ?? null, actionId: action.id };
      if (action.requiresReview) {
        const result = await call<DependencyActionPlan>('prepare_dependency_action', args);
        if (
          request !== generation.current ||
          !dependencyContextMatches(result, current.current.runtime, current.current.project)
        )
          discard(result);
        else setPlan(result);
      } else {
        const result = await call<DependencyChoiceResult>('choose_dependency_path', args);
        if (request !== generation.current) return;
        if (result.bootstrap) onSetupChanged?.(result.bootstrap);
        if (result.opened && before && current.current.project) {
          const merged = mergeDependencyChoice(current.current.project, before, result.opened, action.id);
          onProjectUpdated?.(merged);
          setNotice('Setup updated. Your current scene, tag edits and map history were retained.');
        }
        await refresh();
      }
    } catch (e) {
      if (request === generation.current) setError(String(e));
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }
  async function run() {
    if (!plan || !reviewed) return;
    const request = generation.current,
      chosen = plan;
    setBusy(true);
    setError('');
    try {
      const result = await call<{ detail: string; outcome: string }>('run_dependency_action', {
        planId: chosen.id,
        confirmed: true,
      });
      if (request === generation.current) {
        setPlan(null);
        setReviewed(false);
        setNotice(result.detail);
      }
    } catch (e) {
      if (request === generation.current) {
        setError(String(e));
        setPlan(null);
        setReviewed(false);
      }
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }
  return (
    <section className="dependency-panel" aria-label="Dependencies and setup">
      {runtime === 'haloCustomEdition' && <CustomEditionSetup onConnected={async () => { await refresh(); if (onSetupChanged) onSetupChanged(await call<Bootstrap>('bootstrap')); }} />}
      <BaboonTools project={project}/>
      <header>
        <div>
          <Wrench size={17} />
          <h3>Dependencies &amp; setup</h3>
        </div>
        <button type="button" disabled={!native || busy} onClick={() => void refresh()}>
          <RefreshCw size={14} /> Refresh checks
        </button>
      </header>
      <p>
        Check the tools, source data and model / animation files needed by{' '}
        {project?.title ?? 'your selected Halo'}. Choices are remembered; this guide does not restart
        onboarding.
      </p>
      {!native && (
        <p className="dependency-notice">
          Open the desktop application for installed-file checks and folder selection. The browser preview
          cannot inspect this computer.
        </p>
      )}
      {error && (
        <p role="alert" className="dependency-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="dependency-notice">
          {notice}
        </p>
      )}
      {plan && (
        <article className="dependency-review" aria-label="Review dependency action">
          <header>
            <h4>{plan.label}</h4>
            <button
              type="button"
              aria-label="Cancel dependency action"
              disabled={busy}
              onClick={() => {
                discard(plan);
                setPlan(null);
                setReviewed(false);
              }}
            >
              <X size={15} />
            </button>
          </header>
          <p>{plan.detail}</p>
          <dl>
            <dt>Destination</dt>
            <dd>{plan.uri}</dd>
            <dt>Opens with</dt>
            <dd>
              {plan.executable} ({plan.executableArchitecture})
            </dd>
            <dt>SHA-256</dt>
            <dd className="dependency-hash">{plan.executableSha256}</dd>
          </dl>
          <p>
            Preview expires after 90 seconds. Spark rechecks this path, its hash and your current setup before
            opening it.
          </p>
          <label>
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
              disabled={busy}
            />{' '}
            I reviewed this destination and installed launch file.
          </label>
          <button type="button" disabled={!reviewed || busy} onClick={() => void run()}>
            <CheckCircle2 size={14} />{' '}
            {plan.actionId === 'h1a.install' ? 'Open Steam install UI' : 'Open official page'}
          </button>
        </article>
      )}
      {report?.items.map((item) => (
        <article key={item.id} className="dependency-item">
          <div className="dependency-item-title">
            <h4>{item.label}</h4>
            <span data-state={item.state}>{dependencyStateLabel[item.state]}</span>
          </div>
          <p>{item.detail}</p>
          {item.path && (
            <p className="dependency-path">
              <FolderOpen size={12} />
              {item.path}
              {item.architecture ? ` · ${item.architecture}` : ''}
            </p>
          )}
          {item.sha256 && (
            <details>
              <summary>Inspected file identity</summary>
              <code className="dependency-hash">{item.sha256}</code>
            </details>
          )}
          <div className="dependency-actions">
            {item.actions.map((action) => (
              <button
                key={action.id}
                type="button"
                disabled={busy || (action.kind === 'chooseAssets' && !onChooseAssets)}
                onClick={() => void act(action)}
              >
                {action.label}
              </button>
            ))}
          </div>
        </article>
      ))}
      {report?.diagnostics.map((line) => (
        <p key={line} className="dependency-footnote">
          {line}
        </p>
      ))}
      {busy && <p role="status">Checking setup…</p>}
    </section>
  );
}
