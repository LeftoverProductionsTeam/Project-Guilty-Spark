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
}
interface EcosystemReport {
  projectId: string | null;
  context: { runtimeId: string; sourceKind: string; ownedNativeTags: boolean };
  sourceIssue: string | null;
  tools: ToolRow[];
}
const stateNames: Record<string, string> = {
  installed: 'Ready for this source',
  availableForSetup: 'Set up tool',
  sourceUnsupported: 'Needs compatible source',
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
}: {
  project: Project | null;
  runtime: RuntimeId;
  settings: Settings;
  onSettings: () => void;
  onOpenWorkspace: (target: 'tags' | 'build' | 'quickforge') => void;
}) {
  const [report, setReport] = useState<EcosystemReport | null>(null),
    [error, setError] = useState(''),
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
  function card(row: ToolRow) {
    const { definition: tool, assessment } = row;
    return (
      <article className="gs-tool-card" key={tool.id}>
        <strong>{tool.label}</strong>
        <Pill tone={assessment.canUseWorkflow ? 'green' : 'muted'}>
          {stateNames[assessment.state] ?? assessment.state}
        </Pill>
        <p>{tool.purpose}</p>
        <p className="subtle">{assessment.detail}</p>
        {tool.integration !== 'upstreamOnly' && tool.id !== 'baboon' && (
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
          <a href={tool.sourceUrl} target="_blank" rel="noreferrer">
            {tool.maintainer} · official source &amp; setup
          </a>
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
      {report?.sourceIssue && (
        <Notice tone="info">
          {report.sourceIssue} Compiled maps remain available in Spark’s integrated editors.
        </Notice>
      )}
      {report && (
        <>
          <div className="gs-tool-grid">
            {report.tools
              .filter(
                (row) =>
                  row.definition.integration !== 'upstreamOnly' && row.assessment.state !== 'requiresRuntime',
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
        </>
      )}
    </section>
  );
}
