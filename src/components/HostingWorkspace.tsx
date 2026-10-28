import { useEffect, useState } from 'react';
import { call, native } from '../api';
import { useMapState } from '../mapSession';
import type { Project, RuntimeReport } from '../types';
import { Notice, Pill } from './ui';
import SteamSessionTools from './SteamSessionTools';
import '../hosting.css';
type Action = 'testSolo' | 'hostLan' | 'hostPrivateOnline' | 'joinFriend' | 'dedicatedServer';
interface Result {
  plan: {
    title: string;
    status: string;
    testStatus: string;
    automatic: boolean;
    steps: string[];
    limitations: string[];
    sources: { title: string; url: string }[];
  };
  mapTitle: string | null;
  scenarioType: number | null;
  cacheVersion: number | null;
}
export default function HostingWorkspace({
  project,
  dirty,
  report,
  onBuild,
  onCreator,
  onEditor,
  onFriends,
}: {
  project: Project | null;
  dirty: boolean;
  report: RuntimeReport;
  onBuild: () => void;
  onCreator: () => void;
  onEditor: () => void;
  onFriends: () => void;
}) {
  const [action, setAction] = useMapState<Action>(
    project?.id ?? 'global',
    'hosting.action',
    'hostPrivateOnline',
  );
  const [result, setResult] = useState<Result | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setError('');
    setLoading(native);
    if (native)
      void call<Result>('runtime_hosting_plan', {
        runtimeId: report.id,
        action,
        projectId: project?.id ?? null,
      })
        .then(
          (value) => {
            if (!cancelled) setResult(value);
          },
          (e) => {
            if (!cancelled) setError(String(e));
          },
        )
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    return () => {
      cancelled = true;
    };
  }, [report.id, action, project?.id, project?.source?.sha256]);
  return (
    <section className="analysis-card" aria-label="Hosting and servers">
      <h2>Hosting &amp; servers</h2>
      <div className="hosting-context">
        <strong>{project?.title ?? 'Choose a map for a matching hosting guide'}</strong>
        <Pill>{report.name}</Pill>
        {result?.scenarioType != null && (
          <Pill>{['Campaign', 'Multiplayer', 'Interface'][result.scenarioType] ?? 'Unknown map type'}</Pill>
        )}
        <Pill>Gameplay session unverified</Pill>
      </div>
      <label>
        What do you want to do?
        <select
          aria-label="Hosting action"
          value={action}
          onChange={(e) => setAction(e.target.value as Action)}
        >
          <option value="testSolo">Test alone</option>
          <option value="hostLan">Host on LAN</option>
          <option value="hostPrivateOnline">Host a private online game</option>
          <option value="joinFriend">Join a friend</option>
          <option value="dedicatedServer">Dedicated server</option>
        </select>
      </label>
      {loading && <p role="status">Preparing this map's hosting guide…</p>}
      {error && <Notice tone="error">{error}</Notice>}
      {dirty && (
        <Notice>
          Save and build your latest map edits before a game test. This guide does not apply unsaved changes
          to Halo.
        </Notice>
      )}
      {report.id === 'mccSteam' && result?.cacheVersion != null && result.cacheVersion !== 13 && (
        <Notice>
          The open source is a classic cache. Build and inspect its MCC revision before trying to host it in
          MCC.
        </Notice>
      )}
      {result && (
        <>
          <h3>{result.plan.title}</h3>
          <p>
            Documented support: {result.plan.status} · Local test: {result.plan.testStatus} ·{' '}
            {result.plan.automatic ? 'Automated operation' : 'Manual game setup'}
          </p>
          <ol className="hosting-steps">
            {result.plan.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="analysis-actions">
            <button disabled={!project} onClick={onBuild}>
              Build &amp; inspect map
            </button>
            <button disabled={!project} onClick={onCreator}>
              Server rotation &amp; game types
            </button>
            <button onClick={onFriends}>Check peer manifests</button>
            <button disabled={!project} onClick={onEditor}>
              Shared editor session
            </button>
          </div>
          <details>
            <summary>Limits and sources</summary>
            {result.plan.limitations.map((line) => (
              <p key={line}>{line}</p>
            ))}
            {result.plan.sources.map((source) => (
              <p key={source.url}>
                <a
                  href={/^https:\/\//.test(source.url) ? source.url : undefined}
                  target="_blank"
                  rel="noreferrer"
                >
                  {source.title}
                </a>
              </p>
            ))}
          </details>
        </>
      )}
      {!native && <p>Open Spark on the desktop to inspect the matching runtime and hosting plan.</p>}
      <details>
        <summary>Steam editor connection · Spacewar test (480)</summary>
        <SteamSessionTools />
        <p>
          Use Shared QuickForge to host or join with a private invite. Steam transports Spark source; the
          running Halo match remains its own session.
        </p>
      </details>
    </section>
  );
}
