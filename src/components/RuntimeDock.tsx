import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play,
  TestTube2,
  Layers3,
  FileCode2,
  Hammer,
  Package,
  Search,
  Server,
  Wrench,
  RefreshCw,
  ChevronUp,
  X,
  LoaderCircle,
} from 'lucide-react';
import { call, native } from '../api';
import { useMapState, writeMapSession } from '../mapSession';
import type { Project, RuntimeId, Settings, Workspace } from '../types';
import type {
  RuntimeWorkbenchReport,
  RuntimeDockAction,
  ToolLaunchPlan,
  ToolProcessView,
} from '../runtimeWorkbench';
import { availabilityLabel, evidenceLabel, runtimeNames } from '../runtimeWorkbench';
import { Notice } from './ui';
import WorkingTagChanges, { useWorkingTagChanges } from './WorkingTagChanges';
import { integrityBlocks, type NativeTagIntegrityReport } from '../nativeTagIntegrity';
import BspAudioEditor, { type BspAudioRequest } from './BspAudioEditor';
import BaboonTools from './BaboonTools';
import NativeTagOperations from './NativeTagOperations';
import '../runtimeWorkbench.css';

const actions = [
  ['play', 'Play Halo', Play],
  ['testScene', 'Test Scene', TestTube2],
  ['editLevel', 'Edit level', Layers3],
  ['editTags', 'Edit tags', FileCode2],
  ['build', 'Build', Hammer],
  ['publish', 'Publish', Package],
  ['findGames', 'Find games', Search],
  ['host', 'Host', Server],
  ['legacy', 'Legacy tools', Wrench],
] as const;

export default function RuntimeDock({
  project,
  settings,
  dirty,
  working,
  epoch,
  onSave,
  onNavigate,
  onOpenCompiled,
}: {
  project: Project | null;
  settings: Settings;
  dirty: boolean;
  working: boolean;
  epoch: number;
  onSave: () => Promise<void>;
  onNavigate: (workspace: Workspace) => void;
  onOpenCompiled: (buildId: string) => void;
}) {
  const id = project?.id ?? 'global';
  const [runtime, setRuntime] = useMapState<RuntimeId>(
    id,
    'hosting.runtime',
    project?.quickForge?.runtimeId ?? settings.preferredHalo ?? 'mccSteam',
  );
  const [report, setReport] = useState<RuntimeWorkbenchReport | null>(null);
  const [details, setDetails] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [plan, setPlan] = useState<ToolLaunchPlan | null>(null),
    [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState('');
  const toolTags = useWorkingTagChanges(
    project?.id ?? null,
    runtime === 'mccSteam' ? (report?.workingSource?.buildId ?? null) : null,
    report?.workingSource?.tagsDirectory ?? null,
  );
  const [handoffIntegrity, setHandoffIntegrity] = useState<{
    projectId: string;
    integrity?: NativeTagIntegrityReport;
  } | null>(null);
  useEffect(() => {
    const listener = (event: Event) => {
      const value = (event as CustomEvent<{ projectId: string; integrity?: NativeTagIntegrityReport }>)
        .detail;
      if (value?.projectId === project?.id) setHandoffIntegrity(value);
    };
    window.addEventListener('guilty-spark-tag-integrity', listener);
    return () => window.removeEventListener('guilty-spark-tag-integrity', listener);
  }, [project?.id]);
  const invalidToolFiles = toolTags.report?.integrity?.invalidFiles ?? 0;
  const invalidHandoffFiles =
    handoffIntegrity?.projectId === project?.id ? (handoffIntegrity?.integrity?.invalidFiles ?? 0) : 0;
  const generation = useRef(0);
  const currentReport = useRef(report);
  currentReport.current = report;
  const detailsDialog = useRef<HTMLElement | null>(null);
  const planDialog = useRef<HTMLElement | null>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    if (!details && !plan) return;
    const element = plan ? planDialog.current : detailsDialog.current,
      prior = document.activeElement as HTMLElement | null;
    if (!element) return;
    const controls = () =>
      [
        ...element.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]',
        ),
      ].filter((node) => node.offsetParent !== null);
    const frame = requestAnimationFrame(() => controls()[0]?.focus());
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault();
        event.stopPropagation();
        setDetails(false);
        setPlan(null);
      }
      if (event.key === 'Tab') {
        const items = controls(),
          first = items[0],
          last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    element.addEventListener('keydown', keydown, true);
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener('keydown', keydown, true);
      if (prior?.isConnected) prior.focus();
    };
  }, [details, !!plan]);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    if (!native) return;
    setBusy(true);
    setError('');
    try {
      const next = await call<RuntimeWorkbenchReport>('runtime_workbench_report', {
        runtimeId: runtime,
        projectId: project?.id ?? null,
      });
      if (request === generation.current) setReport(next);
    } catch (e) {
      if (request === generation.current) {
        setReport(null);
        setError(String(e));
      }
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }, [runtime, project?.id, settings.hekDirectory, settings.hekFlavor, settings.hekTagsDirectory, epoch]);
  useEffect(() => {
    const listener = (event: Event) => {
      if ((event as CustomEvent<{ projectId: string }>).detail?.projectId === project?.id) void refresh();
    };
    window.addEventListener('guilty-spark-native-source-changed', listener);
    return () => window.removeEventListener('guilty-spark-native-source-changed', listener);
  }, [project?.id, refresh]);
  useEffect(() => {
    setReport(null);
    setPlan(null);
    setConsent(false);
    setNotice('');
    void refresh();
    return () => {
      generation.current++;
    };
  }, [refresh]);
  useEffect(() => {
    if (!native || !report?.processes.some((p) => p.status === 'running')) return;
    let alive = true;
    const timer = setInterval(
      () =>
        void call<ToolProcessView[]>('runtime_tool_processes')
          .then((processes) => {
            if (alive) {
              const changed = processes.some(
                (p) => currentReport.current?.processes.find((old) => old.id === p.id)?.status !== p.status,
              );
              setReport((previous) => (previous ? { ...previous, processes } : previous));
              if (changed) void refresh();
            }
          })
          .catch(() => {}),
      3000,
    );
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [report?.processes.some((p) => p.status === 'running'), refresh]);

  function routeServers(tab: 'servers' | 'hosting') {
    writeMapSession(id, 'hosting.tab', tab);
    onNavigate('runtimes');
  }
  useEffect(() => {
    const request = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId: string; actionId: string; runtimeId?: RuntimeId }>)
        .detail;
      if (
        detail?.projectId !== project?.id ||
        !['editTags', 'editLevel', 'testScene', 'workingTags'].includes(detail.actionId)
      )
        return;
      setDetails(true);
      if (detail.runtimeId && detail.runtimeId !== runtime) {
        setRuntime(detail.runtimeId);
        return;
      }
      if (detail.actionId === 'workingTags') return;
      if (working || busy) {
        setError('Wait for the active operation before preparing a native editor.');
        return;
      }
      const action = report?.actions.find((action) => action.id === detail.actionId);
      if (action) void act(action);
    };
    window.addEventListener('guilty-spark-runtime-tool', request);
    return () => window.removeEventListener('guilty-spark-runtime-tool', request);
  }, [project?.id, report, runtime, dirty, working, busy]);
  async function act(action: RuntimeDockAction) {
    setError('');
    setNotice('');
    if (action.id === 'findGames') {
      routeServers('servers');
      return;
    }
    if (action.id === 'host') {
      routeServers('hosting');
      return;
    }
    if (action.id === 'legacy') {
      onNavigate('academy');
      return;
    }
    if (action.id === 'build' || action.id === 'publish') {
      onNavigate(project?.quickForge && action.id === 'build' ? 'quickforge' : 'build');
      return;
    }
    if (action.availability === 'running') {
      setDetails(true);
      return;
    }
    if (action.availability !== 'ready') {
      setDetails(true);
      return;
    }
    if (dirty) {
      setDetails(true);
      setError('Save this map before preparing an external game or tool launch.');
      return;
    }
    setBusy(true);
    const request = generation.current;
    try {
      if (action.id === 'play') {
        const message = await call<string>('launch_registered_runtime', { runtimeId: runtime });
        if (request === generation.current) setNotice(message);
      } else if (project) {
        const preview = await call<ToolLaunchPlan>('prepare_runtime_tool', {
          runtimeId: runtime,
          projectId: project.id,
          actionId: action.id,
        });
        if (request === generation.current) {
          setConsent(false);
          setPlan(preview);
        }
      }
    } catch (e) {
      if (request === generation.current) {
        setError(String(e));
        setDetails(true);
      }
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }
  async function launch() {
    if (!plan || !consent || dirty) return;
    setBusy(true);
    setError('');
    const request = generation.current;
    try {
      const process = await call<ToolProcessView>('launch_runtime_tool', {
        planId: plan.id,
        confirmed: consent,
      });
      if (request === generation.current) {
        setNotice(process.detail);
        setPlan(null);
        setConsent(false);
        await refresh();
      }
    } catch (e) {
      if (request === generation.current) {
        setError(String(e));
        setPlan(null);
        setDetails(true);
      }
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }
  async function buildWorkingTags(bspAudio?: BspAudioRequest) {
    if (
      !project ||
      dirty ||
      working ||
      busy ||
      toolTags.report?.status === 'saving' ||
      integrityBlocks(toolTags.report?.integrity)
    )
      return;
    const request = generation.current;
    setBusy(true);
    setError('');
    try {
      await call<string>('build_working_tags', { projectId: project.id, ...(bspAudio ? { bspAudio } : {}) });
      if (request === generation.current) {
        setDetails(false);
        setNotice(
          'Compiling a separate map from the saved working tag edits. Open the completed working-tag build from dock details.',
        );
        onNavigate('build');
      }
    } catch (e) {
      if (request === generation.current) setError(String(e));
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }
  const selected = Object.hasOwn(runtimeNames, runtime) ? runtime : 'mccSteam';
  return (
    <>
      <footer className="runtime-dock" aria-label="Runtime & Tools Dock">
        <div className="runtime-dock-heading">
          <strong>Runtime &amp; tools</strong>
          <span>{project?.title ?? 'Choose a map to use its tools'}</span>
          <span className="runtime-dock-save">
            {working ? 'Working…' : dirty ? 'Unsaved changes' : 'Saved'}
          </span>
          {!!toolTags.report?.changedFiles && (
            <button className="runtime-dock-tag-changes" onClick={() => setDetails(true)}>
              {toolTags.report.changedFiles} saved tool edit{toolTags.report.changedFiles === 1 ? '' : 's'}
            </button>
          )}
          {(invalidToolFiles > 0 || invalidHandoffFiles > 0) && (
            <button role="alert" className="runtime-dock-tag-changes" onClick={() => setDetails(true)}>
              Native save integrity warning · {invalidToolFiles + invalidHandoffFiles} files
            </button>
          )}
          <button
            className="runtime-dock-details"
            aria-label="Runtime and tool details"
            aria-expanded={details}
            onClick={() => setDetails((v) => !v)}
          >
            <ChevronUp size={12} />
            Details
          </button>
        </div>
        <div className="runtime-dock-actions">
          <label className="runtime-dock-picker">
            <span className="gs-sr-only">Active map runtime</span>
            <select
              aria-label="Active map runtime"
              value={selected}
              onChange={(e) => setRuntime(e.target.value as RuntimeId)}
            >
              {Object.entries(runtimeNames).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {actions.map(([id, label, Icon]) => {
            const action = report?.actions.find((a) => a.id === id);
            const state = action?.availability ?? 'setupRequired';
            const running = report?.processes.some(
              (p) => p.projectId === project?.id && p.actionId === id && p.status === 'running',
            );
            return (
              <button
                key={id}
                data-state={running ? 'running' : state}
                disabled={
                  busy ||
                  working ||
                  (!native && !['build', 'publish', 'findGames', 'host', 'legacy'].includes(id))
                }
                title={
                  action
                    ? `${action.description}\n${action.nextAction}`
                    : native
                      ? 'Inspect the current runtime and configure its matching tools.'
                      : 'Native runtime inspection requires the desktop app.'
                }
                onClick={() =>
                  action
                    ? void act(action)
                    : ['findGames', 'host', 'legacy', 'build', 'publish'].includes(id)
                      ? void act({
                          id,
                          operation: id,
                          label,
                          availability: 'setupRequired',
                          description: '',
                          nextAction: '',
                          requiresConfirmation: false,
                        })
                      : setDetails(true)
                }
              >
                <span>
                  <Icon size={13} />
                  {label}
                </span>
                <small>{!native ? 'Desktop' : running ? 'Running' : availabilityLabel[state]}</small>
              </button>
            );
          })}
        </div>
        {notice && (
          <div className="runtime-dock-notice" role="status">
            {notice}
            <button aria-label="Dismiss runtime message" onClick={() => setNotice('')}>
              <X size={12} />
            </button>
          </div>
        )}
        {error && !details && (
          <div className="runtime-dock-notice" role="alert">
            {error}
          </div>
        )}
      </footer>
      {runtime === 'mccSteam' && <BaboonTools project={project} dirty={dirty} epoch={epoch} monitorOnly />}
      {details && (
      <div className="modal-backdrop">
        <section
          ref={detailsDialog}
          className="modal runtime-details-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="runtime-details-title"
        >
          <div className="section-heading">
            <h2 id="runtime-details-title">{runtimeNames[selected]} · runtime &amp; tools</h2>
            <button aria-label="Close runtime details" onClick={() => setDetails(false)}>
              <X size={18} />
            </button>
          </div>
          {!native && (
            <Notice tone="info">
              Use the desktop app to inspect the installed runtime, tools and owned content.
            </Notice>
          )}
          {error && <Notice>{error}</Notice>}
          {dirty && (
            <Notice tone="info">
              This map has unsaved changes.{' '}
              <button
                onClick={() =>
                  void onSave()
                    .then(refresh)
                    .catch((e) => setError(String(e)))
                }
              >
                Save map
              </button>
            </Notice>
          )}
          {report?.sourceIssue && (
            <Notice tone="info">
              {report.sourceIssue}{' '}
              <button
                onClick={() => {
                  setDetails(false);
                  onNavigate(project?.quickForge ? 'quickforge' : project ? 'build' : 'library');
                }}
              >
                Open map / build sources
              </button>
            </Notice>
          )}
          {report?.toolsIssue && (
            <Notice tone="info">
              {report.toolsIssue}{' '}
              <button
                onClick={() => {
                  setDetails(false);
                  onNavigate('settings');
                }}
              >
                Set up matching tools
              </button>
            </Notice>
          )}
          <div className="button-row">
            <button disabled={busy || !native} onClick={() => void refresh()}>
              <RefreshCw size={13} />
              Refresh inspection
            </button>
            <button
              onClick={() => {
                setDetails(false);
                routeServers('servers');
              }}
            >
              Play &amp; servers
            </button>
          </div>
          {project && report?.workingSource && <WorkingTagChanges {...toolTags} />}
          {runtime === 'mccSteam' && <BaboonTools project={project} dirty={dirty} epoch={epoch} />}
          {runtime === 'mccSteam' && project && report?.workingSource && (
            <NativeTagOperations project={project} dirty={dirty} epoch={epoch} />
          )}
          {project && report?.workingSource && runtime === 'mccSteam' && (
            <BspAudioEditor
              key={project.id + report.workingSource.buildId}
              projectId={project.id}
              parentBuildId={report.workingSource.buildId}
              blocked={
                busy ||
                working ||
                dirty ||
                toolTags.report?.status === 'saving' ||
                !!report.sourceIssue ||
                !!report.toolsIssue ||
                report.processes.some((p) => p.projectId === project.id && p.status === 'running')
              }
              onBuild={buildWorkingTags}
            />
          )}
          {project && (
            <div className="button-row">
              <button
                disabled={
                  !native ||
                  !report ||
                  busy ||
                  working ||
                  dirty ||
                  toolTags.report?.status === 'saving' ||
                  integrityBlocks(toolTags.report?.integrity) ||
                  !!report?.sourceIssue ||
                  !!report?.toolsIssue ||
                  report?.processes.some((p) => p.projectId === project.id && p.status === 'running')
                }
                onClick={() => void buildWorkingTags()}
              >
                <Hammer size={13} />
                Build working tag edits
              </button>
              {report?.workingBuild && (
                <button
                  disabled={busy || working || dirty}
                  onClick={() => {
                    setDetails(false);
                    onOpenCompiled(report.workingBuild!.id);
                  }}
                >
                  Open working-tags build
                </button>
              )}
              <small>
                Save and close the native tools first. This preserves working tag changes in a new cache; the
                ordinary build regenerates source.
              </small>
            </div>
          )}
          {report && (
            <>
              <p className="subtle">
                {report.report.target.family} · {report.report.target.edition} ·{' '}
                {report.report.target.distribution} · {report.report.target.platform} /{' '}
                {report.report.target.architecture}
              </p>
              <div className="runtime-capability-list">
                {report.report.capabilities.map((item) => (
                  <div key={item.operation}>
                    <strong>{item.operation.replace(/([A-Z])/g, ' $1')}</strong>
                    <span>
                      {availabilityLabel[item.availability]} · {evidenceLabel[item.evidenceLevel]}
                    </span>
                    <p>{item.detail}</p>
                    {item.gates.length > 0 && <small>{item.gates.map((g) => g.detail).join(' ')}</small>}
                  </div>
                ))}
              </div>
              <details>
                <summary>Retained runtime and research targets ({report.profiles.length})</summary>
                {report.profiles.map((profile) => (
                  <p key={profile.profileId}>
                    <strong>{profile.label}</strong> ·{' '}
                    {profile.implementedAdapter ? 'Operation-specific adapter' : 'Research target'}
                    <br />
                    <small>{profile.detail}</small>
                  </p>
                ))}
              </details>
              {report.processes.map((process) => (
                <p key={process.id}>
                  {process.actionId} · PID {process.processId} · {process.status}
                  {process.exitCode !== null && ` (${process.exitCode})`}
                  <br />
                  <small>{process.detail}</small>
                </p>
              ))}
            </>
          )}
        </section>
      </div>
      )}
      {plan && (
        <div className="modal-backdrop">
          <section
            ref={planDialog}
            className="modal runtime-details-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="runtime-launch-title"
          >
            <div className="section-heading">
              <h2 id="runtime-launch-title">
                Open{' '}
                {plan.actionId === 'testScene'
                  ? 'Standalone scene test'
                  : plan.actionId === 'editLevel'
                    ? 'Sapien'
                    : 'Guerilla'}
              </h2>
              <button disabled={busy} aria-label="Cancel tool launch" onClick={() => setPlan(null)}>
                <X size={18} />
              </button>
            </div>
            <p>{plan.detail}</p>
            <dl className="runtime-launch-paths">
              <dt>Executable</dt>
              <dd>{plan.executable}</dd>
              <dt>SHA-256</dt>
              <dd>{plan.executableSha256}</dd>
              <dt>Tool architecture</dt>
              <dd>{plan.executableArchitecture}</dd>
              <dt>Working tags</dt>
              <dd>{plan.tagsDirectory}</dd>
              <dt>Scenario</dt>
              <dd>{plan.scenarioFile}</dd>
            </dl>
            <details>
              <summary>Exact launch arguments and startup script</summary>
              <pre>
                {JSON.stringify(plan.arguments, null, 2)}
                {plan.startupScript && `\n${plan.startupScript}`}
              </pre>
            </details>
            <label className="toggle-setting">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              Allow this installed tool to open and edit this derived working tag folder.
            </label>
            <div className="button-row">
              <button disabled={!consent || busy || dirty} onClick={() => void launch()}>
                {busy ? <LoaderCircle size={14} className="spin" /> : <Play size={14} />}Open tool
              </button>
              <button disabled={busy} onClick={() => setPlan(null)}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
