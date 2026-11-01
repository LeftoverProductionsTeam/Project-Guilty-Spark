import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, FolderOpen, Gamepad2, RefreshCw, Settings2 } from 'lucide-react';
import { call, native } from '../api';
import { useMapState } from '../mapSession';
import { runtimeNames } from '../runtimeWorkbench';
import type { Bootstrap, Project, RuntimeId, RuntimeReport } from '../types';
import { Notice } from './ui';
import { useRevealWorkspacePanel } from './WorkspacePanels';
import ToolEcosystem from './ToolEcosystem';
import '../gamesTools.css';

const runtimes: RuntimeId[] = ['mccSteam', 'openCe', 'chupathingyCe', 'haloCustomEdition'];

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
  const [reports, setReports] = useState<RuntimeReport[]>([]),
    [checking, setChecking] = useState(false),
    [error, setError] = useState('');
  const generation = useRef(0),
    reveal = useRevealWorkspacePanel();
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    if (!native) return;
    setChecking(true);
    setError('');
    try {
      const next = await call<RuntimeReport[]>('runtime_report');
      if (generation.current === version) setReports(next);
    } catch (e) {
      if (generation.current === version) {
        setReports([]);
        setError(String(e));
      }
    } finally {
      if (generation.current === version) setChecking(false);
    }
  }, [data.settings.mccDirectory, data.settings.steamDirectory]);
  useEffect(() => {
    void refresh();
    return () => {
      generation.current++;
    };
  }, [refresh]);
  const installation = reports.find((report) => report.id === runtime)?.installation;
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
        {runtimes.map((id) => {
          const found = reports.find((report) => report.id === id)?.installation;
          const connected = found?.validation === 'pass';
          const status = connected
            ? 'Connected'
            : found
              ? 'Needs attention'
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
                found
                  ? `${runtimeNames[id]}: ${found.root}`
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
        <button onClick={() => onSetup(runtime)}>
          <Settings2 size={14} />
          {installation?.validation === 'pass' ? 'Connect tools' : 'Connect this Halo'}
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
