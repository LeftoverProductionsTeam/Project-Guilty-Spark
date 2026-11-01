import type { ReactNode } from 'react';
import { Check, FolderOpen, Gamepad2, RefreshCw, Settings2 } from 'lucide-react';
import { native } from '../api';
import { useMapState } from '../mapSession';
import { runtimeNames } from '../runtimeWorkbench';
import type { Bootstrap, Project, RuntimeId } from '../types';
import { primaryRuntimes, useRuntimeConnections } from '../useRuntimeConnections';
import { Notice } from './ui';
import { useRevealWorkspacePanel } from './WorkspacePanels';
import ToolEcosystem from './ToolEcosystem';
import '../gamesTools.css';


export default function GamesTools({
  data,
  project,
  busy,
  onSelectMap,
  onLibrary,
  onSetup,
  onOpenWorkspace,
  children,
}: {
  data: Bootstrap;
  project: Project | null;
  busy: boolean;
  onSelectMap: (id: string) => void;
  onLibrary: () => void;
  onSetup: (id: RuntimeId) => void;
  onOpenWorkspace: (target: 'tags' | 'build' | 'quickforge') => void;
  children: ReactNode;
}) {
  const [runtime, setRuntime] = useMapState<RuntimeId>(
    project?.id ?? 'global',
    'hosting.runtime',
    project?.quickForge?.runtimeId ?? data.settings.preferredHalo ?? 'mccSteam',
  );
  const [search, setSearch] = useMapState(project?.id ?? 'global', `tools.search.${runtime}`, '');
  const [advanced, setAdvanced] = useMapState('global', 'tools.advanced', false);
  const { reports, detected, checking, connecting, error, refresh, connect } = useRuntimeConnections(data);
  const reveal = useRevealWorkspacePanel();
  const installation = reports.find((report) => report.id === runtime)?.installation;
  const candidate = detected.find(item => item.runtimeId === runtime);
  return (
    <div className="analysis-page games-tools-page">
      <header className="games-tools-heading">
        <h1>Games &amp; tools</h1>
        <span>Choose your Halo to see its editors.</span>
        <button disabled={!native || checking} onClick={() => void refresh()}>
          <RefreshCw size={14} />
          {checking ? 'Checking…' : 'Recheck connections'}
        </button>
      </header>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="halo-runtime-grid" role="group" aria-label="Halo versions">
        {primaryRuntimes.map((id) => {
          const found = reports.find((report) => report.id === id)?.installation;
          const available = detected.find(item => item.runtimeId === id);
          const connected = found?.validation === 'pass';
          const status = connected
            ? 'Connected'
            : found
              ? 'Needs attention'
              : available
                ? (available.contentReady ? 'Detected' : 'Needs content')
              : checking
                ? 'Checking…'
                : 'Not connected';
          return (
            <button
              key={id}
              className="halo-runtime-card"
              data-connected={connected}
              aria-pressed={runtime === id}
              aria-label={`${runtimeNames[id]} · ${status}`}
              title={
                found || available
                  ? `${runtimeNames[id]}: ${found?.root ?? available?.root}`
                  : `Connect ${runtimeNames[id]} to use its installed tools and content`
              }
              onClick={() => setRuntime(id)}
            >
              <Gamepad2 size={17} />
              <strong>{runtimeNames[id]}</strong>
              <span>
                {connected && <Check size={11} />} {status}
              </span>
            </button>
          );
        })}
      </div>
      <div className="games-tools-context">
        <label>
          Map
          <select
            aria-label="Map for external tools"
            disabled={busy}
            value={project?.id ?? ''}
            onChange={(event) => {
              if (event.target.value) onSelectMap(event.target.value);
            }}
          >
            <option value="" disabled>
              Choose a map…
            </option>
            {data.entries.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title} · {entry.engine}
              </option>
            ))}
            {project && !data.entries.some((entry) => entry.id === project.id) && (
              <option value={project.id}>{project.title}</option>
            )}
          </select>
        </label>
        <button onClick={onLibrary}>
          <FolderOpen size={14} />
          Open a map
        </button>
        <label className="games-tools-search">
          Find tool
          <input
            aria-label="Search runtime tools"
            placeholder="Editor, compiler, model…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <button disabled={connecting !== null} onClick={() => candidate?.contentReady && !installation ? void connect(candidate) : onSetup(runtime)} title={candidate?.detail}>
          <Settings2 size={14} />
          {connecting === runtime ? 'Connecting…' : installation?.validation === 'pass' ? 'Connect tools' : candidate?.contentReady ? 'Connect detected Halo' : 'Connect this Halo'}
        </button>
      </div>
      <div className="games-tools-save-flow">
        <span>
          <strong>Edit → save in the tool → review in Spark.</strong> Working map saves are checked every 2
          seconds. Clean maps reload; unsaved Spark changes stay separate. Managed native tags require
          integrity review and a rebuild.
        </span>
        <button disabled={!project?.source} onClick={() => reveal('source-changes')}>
          Review external changes
        </button>
        <button
          disabled={!project}
          onClick={() => onOpenWorkspace('build')}
          title="Build, conversion and legacy export targets"
        >
          Export / convert
        </button>
      </div>
      <ToolEcosystem
        key={`${project?.id ?? 'global'}:${runtime}`}
        project={project}
        runtime={runtime}
        settings={data.settings}
        compact
        heading={`${runtimeNames[runtime]} tools`}
        search={search}
        onSettings={() => onSetup(runtime)}
        onOpenWorkspace={onOpenWorkspace}
      />
      <details
        className="games-tools-advanced"
        open={advanced}
        onToggle={(event) => setAdvanced(event.currentTarget.open)}
      >
        <summary>Advanced folders, backups &amp; preferences</summary>
        {children}
      </details>
    </div>
  );
}
