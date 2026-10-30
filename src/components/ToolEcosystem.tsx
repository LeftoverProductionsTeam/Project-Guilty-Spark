import { useCallback, useEffect, useRef, useState } from 'react';
import { call, native } from '../api';
import type { Project, RuntimeId, Settings } from '../types';
import { Notice, Pill } from './ui';
import BaboonTools from './BaboonTools';
import './nativeTools.css';
interface ToolDefinition {
  id: string;
  label: string;
  purpose: string;
  caveat: string;
  maintainer: string;
  sourceUrl: string;
  license: string;
  inputs: string[];
  integration: string;
  handler: string;
  version: string | null;
  releaseUrl?: string | null;
}
interface ToolRow {
  definition: ToolDefinition;
  assessment: {
    state: string;
    executableFound: boolean;
    compatibleSource: boolean;
    executableVerified: boolean;
    canUseWorkflow: boolean;
    detail: string;
  };
  executable: string | null;
  installationIssue: string | null;
  externalCompanion?: {
    registration: { path: string; executableSha256: string };
    available: boolean;
    detail: string;
  } | null;
}
interface EcosystemReport {
  projectId: string | null;
  context: { runtimeId: string; sourceKind: string; ownedNativeTags: boolean; cacheVersion?: number | null };
  sourceIssue: string | null;
  tools: ToolRow[];
  companionCandidates?: { id: string; label: string; reportedWorkflow: string; missingEvidence: string }[];
}
const stateNames: Record<string, string> = {
  installed: 'Ready for this source',
  availableForSetup: 'Set up tool',
  sourceUnsupported: 'Needs compatible source',
  cacheUnsupported: 'Needs a CE cache (609)',
  unverifiedVersion: 'Version needs review',
  requiresRuntime: 'Different runtime / kit',
  researchOnly: 'Upstream · handoff not verified',
};
export default function ToolEcosystem({
  project,
  runtime,
  settings,
  onSettings,
  onOpenWorkspace,
  search = '',
}: {
  search?: string;
  project: Project | null;
  runtime: RuntimeId;
  settings: Settings;
  onSettings: () => void;
  onOpenWorkspace: (target: 'tags' | 'build' | 'quickforge') => void;
}) {
  const [report, setReport] = useState<EcosystemReport | null>(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const projectId = project?.id ?? null;
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setReport(null);
    setError('');
    if (!native) return;
    setBusy(true);
    try {
      const next = await call<EcosystemReport>('tool_ecosystem_report', { runtimeId: runtime, projectId });
      if (current === generation.current) setReport(next);
    } catch (e) {
      if (current === generation.current) setError(String(e));
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }, [
    runtime,
    projectId,
    settings.hekDirectory,
    settings.hekFlavor,
    settings.invaderDirectory,
    project?.activeBuildTarget,
    project?.builds.length,
  ]);
  useEffect(() => {
    void refresh();
    return () => {
      generation.current++;
    };
  }, [refresh]);
  useEffect(() => {
    const changed = (event: Event) => {
      if ((event as CustomEvent<{ projectId: string }>).detail?.projectId === projectId) void refresh();
    };
    window.addEventListener('guilty-spark-native-source-changed', changed);
    return () => window.removeEventListener('guilty-spark-native-source-changed', changed);
  }, [projectId, refresh]);
  function open(tool: ToolDefinition) {
    const actionId = tool.id === 'haloTool' && report?.context.ownedNativeTags ? 'workingTags' : tool.handler;
    if (['editLevel', 'editTags', 'testScene', 'workingTags'].includes(actionId) && projectId) {
      onOpenWorkspace('quickforge');
      window.dispatchEvent(
        new CustomEvent('guilty-spark-runtime-tool', { detail: { projectId, actionId, runtimeId: runtime } }),
      );
    } else onOpenWorkspace(tool.handler === 'build' ? 'build' : 'tags');
  }
  async function companion(action: 'select' | 'launch' | 'forget') {
    const current = generation.current;
    if (
      action === 'launch' &&
      !window.confirm(
        'Launch your selected OpenCE Mantle application? Spark will pass no map or source path. Open an isolated copy inside Mantle; its startup and save behavior have not been tested by Spark.',
      )
    )
      return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const context = { runtimeId: runtime, projectId };
      if (action === 'select') {
        const path = await call<string | null>('choose_external_companion_path', context);
        if (!path || current !== generation.current) return;
        await call('register_external_companion', { ...context, path });
      } else if (action === 'forget') await call('forget_external_companion');
      else {
        const detail = await call<string>('launch_external_companion', {
          ...context,
          confirmExternalLaunch: true,
        });
        if (current === generation.current) setMessage(detail);
      }
      if (current === generation.current) await refresh();
    } catch (e) {
      if (current === generation.current) setError(String(e));
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  function card(row: ToolRow) {
    const { definition: tool, assessment } = row;
    return (
      <article className="gs-tool-card" key={tool.id}>
        <strong>{tool.label}</strong>
        <Pill tone={assessment.canUseWorkflow ? 'green' : 'muted'}>
          {stateNames[assessment.state] ?? assessment.state}
        </Pill>
        <p>{tool.purpose}</p>
        {assessment.executableFound&&['sapien','guerilla','tagTest','invaderEditor'].includes(tool.id)&&<button disabled={busy} onClick={()=>{setBusy(true);setError('');void call<string>('launch_discovered_tool',{runtimeId:runtime,projectId,toolId:tool.id}).then(setMessage,e=>setError(String(e))).finally(()=>setBusy(false));}}>Launch {tool.label}</button>}
        <p className="subtle">{assessment.detail}</p>
        {tool.integration === 'externalCompanion' && (
          <>
            <div className="button-row">
              <button type="button" disabled={busy} onClick={() => void companion('select')}>
                {row.externalCompanion ? 'Change installed application' : 'Select installed application'}
              </button>
              <button
                type="button"
                disabled={busy || !assessment.canUseWorkflow}
                onClick={() => void companion('launch')}
              >
                Launch Mantle
              </button>
              {row.externalCompanion && (
                <button type="button" disabled={busy} onClick={() => void companion('forget')}>
                  Forget selection
                </button>
              )}
            </div>
            {row.externalCompanion && <p className="subtle">{row.externalCompanion.detail}</p>}
          </>
        )}
        {!['upstreamOnly', 'externalCompanion'].includes(tool.integration) && tool.id !== 'baboon' && (
          <button
            type="button"
            className="small-button"
            disabled={!assessment.canUseWorkflow}
            onClick={() => open(tool)}
          >
            Open{' '}
            {tool.handler === 'editTags'
              ? 'tag editing'
              : tool.handler === 'editLevel'
                ? 'level editing'
                : tool.handler === 'testScene'
                  ? 'test scene'
                  : 'managed workflow'}
          </button>
        )}
        <details>
          <summary>Formats, source &amp; license</summary>
          <p>{tool.caveat}</p>
          <p>
            Inputs: {tool.inputs.join(', ')} ·{' '}
            {assessment.executableFound ? 'Executable found' : 'No verified executable found'}
            {tool.version ? ` · Reviewed ${tool.version}` : ''}
          </p>
          {row.installationIssue && <p>{row.installationIssue}</p>}
          <p>{tool.license}</p>
          {row.externalCompanion && (
            <p className="subtle">
              {row.externalCompanion.registration.path}
              <br />
              Registered SHA-256: <code>{row.externalCompanion.registration.executableSha256}</code>
            </p>
          )}
          <a href={tool.sourceUrl} target="_blank" rel="noreferrer">
            {tool.maintainer} · official source &amp; setup
          </a>
          {tool.releaseUrl && (
            <>
              {' '}
              ·{' '}
              <a href={tool.releaseUrl} target="_blank" rel="noreferrer">
                Official releases
              </a>
            </>
          )}
        </details>
      </article>
    );
  }
  return (
    <section className="analysis-card tool-ecosystem" aria-label="Source-aware editing tools">
      <div className="section-heading">
        <h2>Tools for this map</h2>
        <Pill>{report?.context.sourceKind ?? 'Choose a map'}</Pill>
      </div>
      <p>
        Tools use the map’s source format, selected Halo and matching editing kit. Installed programs and
        native editing readiness are checked separately.
      </p>
      <div className="button-row">
        <button type="button" onClick={onSettings}>
          Dependencies &amp; setup
        </button>
        <button type="button" disabled={busy || !native} onClick={() => void refresh()}>
          {busy ? 'Checking…' : 'Recheck tools'}
        </button>
      </div>
      {!native && (
        <Notice tone="info">
          The desktop app checks installed tools and map sources. No external application runs in this browser
          preview.
        </Notice>
      )}
      {error && <Notice>{error}</Notice>}
      {message && <Notice tone="info">{message}</Notice>}
      {report?.sourceIssue && (
        <Notice tone="info">
          {report.sourceIssue} Compiled maps remain available in Spark’s integrated editors.
        </Notice>
      )}
      {report && (
        <>
          <div className="gs-tool-grid">
            {report.tools
              .filter(row=>!search.trim()||`${row.definition.label} ${row.definition.purpose} ${row.assessment.executableFound?'installed':'install setup'}`.toLowerCase().includes(search.toLowerCase()))
              .filter(
                (row) =>
                  row.definition.integration !== 'upstreamOnly' && row.assessment.state !== 'requiresRuntime',
              )
              .filter(
                (row) =>
                  row.definition.integration !== 'externalCompanion' ||
                  !projectId ||
                  (report.context.cacheVersion === 609 && report.context.sourceKind === 'classicCache'),
              )
              .map(card)}
          </div>
          {report.tools.some((row) => row.definition.id === 'baboon' && row.assessment.canUseWorkflow) && (
            <BaboonTools project={project} />
          )}
          <details>
            <summary>Other Halo tools · compatibility &amp; handoff research</summary>
            <p className="subtle">
              These profiles describe upstream software. A verified Spark handoff has not been implemented;
              they grant no launch or download action.
            </p>
            <div className="gs-tool-grid">
              {report.tools.filter((row) => row.definition.integration === 'upstreamOnly').map(card)}
            </div>
          </details>
          {!!report.companionCandidates?.length && (
            <details>
              <summary>Companion candidates · evidence needed</summary>
              {report.companionCandidates.map((candidate) => (
                <section key={candidate.id}>
                  <strong>{candidate.label}</strong>
                  <p>{candidate.reportedWorkflow}</p>
                  <p className="subtle">{candidate.missingEvidence}</p>
                </section>
              ))}
            </details>
          )}
        </>
      )}
    </section>
  );
}
