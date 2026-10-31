import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, RefreshCw, Server, Square } from 'lucide-react';
import { call, native } from '../api';
import { Notice, Pill } from './ui';
import './CustomEditionHost.css';

interface BuildSource {
  projectId: string;
  buildId: string;
  projectTitle?: string;
  projectFingerprint?: string;
}
interface MapChoice {
  name: string;
  sha256: string;
  sourceBuild?: BuildSource | null;
}
interface Catalog {
  executableSha256: string;
  maps: MapChoice[];
  projectId?: string | null;
  projectIssue?: string | null;
}
interface ClientView {
  phase: string;
  detail: string;
  processId: number | null;
  gameDirectory: string;
  profileDirectory: string;
  executableSha256: string;
  verifiedFiles: number;
  verifiedBytes: number;
  verificationMs: number;
  launchCount: number;
  exitCode: number | null;
  connectionVerified: boolean;
  mode?: 'setup' | 'playtest' | null;
  elapsedMs?: number;
  visibleWindow?: boolean | null;
}
export interface CeHostView {
  id: string;
  phase: string;
  detail: string;
  map: string;
  gameType: string;
  maximumPlayers: number;
  name: string;
  requestedPort: number;
  port: number;
  processId: number | null;
  executableSha256: string;
  mapSha256: string;
  sourceBuild?: BuildSource | null;
  sessionDirectory: string | null;
  copiedBytes: number;
  observations: number;
  elapsedMs: number;
  consoleTail: string;
  client?: ClientView | null;
  status: {
    name: string;
    version: string;
    map: string;
    gameType: string;
    state: string;
    players: number;
    maximumPlayers: number;
    dedicated: boolean;
  } | null;
}
const active = (view: CeHostView | null) => view && !['stopped', 'failed'].includes(view.phase);
const mapKey = (name: string, build?: BuildSource | null) => (build ? 'build:' + build.buildId : name);
const phaseNames: Record<string, string> = {
  preparing: 'Preparing private copy',
  starting: 'Starting',
  running: 'Map loaded',
  rechecking: 'Checking map status',
  unresponsive: 'No current map reply',
  stopping: 'Stopping',
  stopped: 'Stopped',
  failed: 'Needs attention',
};

export default function CustomEditionHost({
  onSetup,
  projectId,
  dirty = false,
  onBuild,
  savedRevision,
}: {
  onSetup: () => void;
  projectId?: string;
  dirty?: boolean;
  onBuild?: () => void;
  savedRevision?: string | null;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [view, setView] = useState<CeHostView | null>(null);
  const [map, setMap] = useState('bloodgulch'),
    [gameType, setGameType] = useState('slayer');
  const [maximumPlayers, setMaximumPlayers] = useState(2),
    [port, setPort] = useState(0);
  const [name, setName] = useState('Spark private');
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(native);
  const [clientBusy, setClientBusy] = useState(false);
  const clientGeneration = useRef(0);
  const [error, setError] = useState(''),
    [setupError, setSetupError] = useState('');
  const mounted = useRef(false),
    polling = useRef(false);
  const generation = useRef(0);
  const catalogGeneration = useRef(0),
    catalogProject = useRef<string | null | undefined>(undefined);
  const refresh = useCallback(async () => {
    setLoading(true);
    setSetupError('');
    const token = ++catalogGeneration.current;
    try {
      const next = await call<Catalog>('ce_host_catalog', { projectId: projectId ?? null });
      if (mounted.current && token === catalogGeneration.current) {
        setCatalog(next);
      }
    } catch (e) {
      if (mounted.current && token === catalogGeneration.current) {
        setCatalog(null);
        setSetupError(String(e));
      }
    } finally {
      if (mounted.current && token === catalogGeneration.current) setLoading(false);
    }
  }, [projectId, savedRevision]);
  useEffect(() => {
    if (!catalog || active(view)) return;
    const projectChanged = catalogProject.current !== (catalog.projectId ?? null);
    catalogProject.current = catalog.projectId ?? null;
    const built = catalog.maps.find((item) => item.sourceBuild);
    setMap((previous) => {
      if (projectChanged && catalog.projectId)
        return built ? mapKey(built.name, built.sourceBuild) : 'unbuilt:' + catalog.projectId;
      if (catalog.maps.some((item) => mapKey(item.name, item.sourceBuild) === previous)) return previous;
      if (catalog.projectId && (previous.startsWith('build:') || previous.startsWith('unbuilt:')))
        return built ? mapKey(built.name, built.sourceBuild) : previous; // Never select a stock namesake.
      return mapKey((built ?? catalog.maps[0])?.name ?? '', (built ?? catalog.maps[0])?.sourceBuild);
    });
  }, [catalog, view]);
  const poll = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    const token = generation.current;
    try {
      const next = await call<CeHostView | null>('ce_host_status');
      if (mounted.current && token === generation.current) {
        setView(next);
        if (active(next) && next) {
          setMap(mapKey(next.map, next.sourceBuild));
          setGameType(next.gameType);
          setMaximumPlayers(next.maximumPlayers);
          setName(next.name);
          setPort(next.requestedPort);
        }
      }
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      polling.current = false;
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (native) {
      void refresh();
      void poll();
    }
    const timer = native ? window.setInterval(() => void poll(), 2000) : undefined;
    // Workspace navigation keeps the native host alive. Closing its owning
    // Spark window stops it; remount reads the same window-scoped session.
    return () => {
      mounted.current = false;
      generation.current++;
      catalogGeneration.current++;
      window.clearInterval(timer);
    };
  }, [refresh, poll]);
  const selected = catalog?.maps.find((item) => mapKey(item.name, item.sourceBuild) === map);
  async function start() {
    if (!selected || !catalog || (selected.sourceBuild && dirty)) return;
    const token = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const next = await call<CeHostView>('ce_host_start', {
        request: {
          map: selected.name,
          mapSha256: selected.sha256,
          executableSha256: catalog.executableSha256,
          gameType,
          maximumPlayers,
          port,
          name,
          ...(selected.sourceBuild
            ? {
                sourceBuild: {
                  projectId: selected.sourceBuild.projectId,
                  buildId: selected.sourceBuild.buildId,
                },
              }
            : {}),
        },
      });
      if (mounted.current && token === generation.current) setView(next);
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function stop() {
    if (!view) return;
    generation.current++;
    setBusy(true);
    setError('');
    try {
      await call('ce_host_stop', { sessionId: view.id });
      await poll();
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function clientAction(action: 'prepare' | 'launch' | 'setup' | 'stop') {
    if (!view) return;
    const token = ++generation.current;
    const clientToken = ++clientGeneration.current;
    setClientBusy(true);
    setError('');
    try {
      const next = await call<CeHostView>('ce_host_client_action', { sessionId: view.id, action });
      if (mounted.current && token === generation.current) setView(next);
    } catch (e) {
      if (mounted.current && token === generation.current) {
        setError(String(e));
        await poll();
      }
    } finally {
      if (mounted.current && clientToken === clientGeneration.current) setClientBusy(false);
    }
  }
  const locked = busy || !!active(view);
  const client = view?.client;
  const clientOpen = client?.phase === 'open';
  const clientChecking = clientBusy || client?.phase === 'checking';
  return (
    <section className="analysis-card ce-private-host" aria-label="Custom Edition private host">
      <div className="section-heading">
        <h2>
          <Server size={16} /> Custom Edition · private game
        </h2>
        <Pill>On this computer</Pill>
        <button
          disabled={!native || loading || busy}
          onClick={() => void refresh()}
          title="Recheck the installed game, native maps and file identities"
        >
          <RefreshCw size={14} /> Refresh maps
        </button>
      </div>
      <p>
        Choose a native CE map and start a dedicated server from a verified private copy. Your installed game
        stays intact.
      </p>
      {!native && (
        <Notice tone="info">Open the desktop app to use the installed Custom Edition server.</Notice>
      )}
      {setupError && (
        <Notice tone="info">
          {setupError} <button onClick={onSetup}>Connect Custom Edition</button>
        </Notice>
      )}
      {loading && <p role="status">Checking installed CE maps…</p>}
      {catalog && !catalog.maps.length && (
        <Notice>
          No compatible CE multiplayer maps found. Add a real compiled version-609 map to the registered
          game's maps folder, then refresh.
        </Notice>
      )}
      {projectId && (catalog?.projectIssue || dirty) && (
        <div className="ce-host-project">
          <small>
            {dirty
              ? 'Save and build your changes before hosting this project version.'
              : catalog?.projectIssue}
          </small>
          {onBuild && <button onClick={onBuild}>Build this map</button>}
        </div>
      )}
      {catalog && catalog.maps.length > 0 && (
        <div className="ce-host-fields">
          <label>
            Map
            <select
              aria-label="Private CE map"
              disabled={locked}
              value={map}
              onChange={(e) => setMap(e.target.value)}
            >
              {!selected && !active(view) && map && (
                <option value={map} disabled>
                  Project build unavailable · rebuild this map
                </option>
              )}
              {catalog.maps.some((item) => item.sourceBuild) && (
                <optgroup label="Validated project build">
                  {catalog.maps
                    .filter((item) => item.sourceBuild)
                    .map((item) => (
                      <option
                        key={mapKey(item.name, item.sourceBuild)}
                        value={mapKey(item.name, item.sourceBuild)}
                      >
                        {item.sourceBuild?.projectTitle ?? item.name} · saved CE build
                      </option>
                    ))}
                </optgroup>
              )}
              <optgroup label="Installed CE maps">
                {catalog.maps
                  .filter((item) => !item.sourceBuild)
                  .map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
              </optgroup>
              {active(view) &&
                view &&
                !catalog.maps.some(
                  (item) => mapKey(item.name, item.sourceBuild) === mapKey(view.map, view.sourceBuild),
                ) && <option value={mapKey(view.map, view.sourceBuild)}>Active snapshot · {view.map}</option>}
            </select>
          </label>
          <label>
            Game type
            <select
              aria-label="Private CE game type"
              disabled={locked}
              value={gameType}
              onChange={(e) => setGameType(e.target.value)}
            >
              <option value="slayer">Slayer</option>
              <option value="ctf">Capture the flag</option>
              <option value="oddball">Oddball</option>
              <option value="king">King of the hill</option>
              <option value="race">Race</option>
            </select>
          </label>
          <label>
            Players
            <input
              aria-label="Private CE player limit"
              type="number"
              min={1}
              max={16}
              disabled={locked}
              value={maximumPlayers}
              onChange={(e) => setMaximumPlayers(Number(e.target.value))}
            />
          </label>
          <button
            disabled={!native || loading || locked || !selected || (!!selected.sourceBuild && dirty)}
            onClick={() => void start()}
          >
            <Play size={14} /> Start private server
          </button>
        </div>
      )}
      {catalog && (
        <details className="ce-host-options">
          <summary>Name &amp; port</summary>
          <div className="ce-host-fields">
            <label>
              Server name
              <input
                aria-label="Private CE server name"
                disabled={locked}
                maxLength={31}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Port · 0 chooses automatically
              <input
                aria-label="Private CE port"
                disabled={locked}
                type="number"
                min={0}
                max={65534}
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
              />
            </label>
          </div>
        </details>
      )}
      {error && (
        <div role="alert">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {view && (
        <div className="ce-host-session">
          <div className="button-row">
            <strong role="status">{phaseNames[view.phase] ?? view.phase}</strong>
            <span>{view.map}</span>
            {view.sourceBuild && <Pill>Saved project snapshot</Pill>}
            {view.status && (
              <Pill>
                {view.status.players} / {view.status.maximumPlayers} players
              </Pill>
            )}
            {active(view) && (
              <button disabled={busy || view.phase === 'stopping'} onClick={() => void stop()}>
                <Square size={13} /> Stop private server
              </button>
            )}
          </div>
          <p>{view.detail}</p>
          {view.sourceBuild && (
            <p className="subtle">
              CE clients need this saved map copy to join. The installed stock map is unchanged.
            </p>
          )}
          {!!view.port && active(view) && (
            <p>
              Direct IP: <code className="ce-host-address">127.0.0.1:{view.port}</code>
            </p>
          )}
          {active(view) && (
            <section className="ce-host-client" aria-label="Matching CE playtest">
              <div className="button-row">
                <strong>Playtest this copy</strong>
                {!clientOpen && (
                  <button
                    disabled={!native || busy || clientChecking || view.phase !== 'running'}
                    onClick={() => void clientAction('prepare')}
                  >
                    {clientChecking ? 'Checking client…' : 'Prepare matching client'}
                  </button>
                )}
                {client?.phase === 'ready' && (
                  <button
                    disabled={!native || busy || clientChecking || view.phase !== 'running'}
                    onClick={() => void clientAction('launch')}
                  >
                    <Play size={13} /> Launch CE playtest
                  </button>
                )}
                {(clientOpen || clientChecking) && (
                  <button disabled={!native || busy} onClick={() => void clientAction('stop')}>
                    <Square size={13} /> Stop playtest
                  </button>
                )}
              </div>
              <p className="subtle" aria-live="polite">
                {client?.detail ?? 'Use this exact map and its resources with a separate Halo test profile.'}
              </p>
              {clientOpen && client?.visibleWindow === false && (client.elapsedMs ?? 0) >= 15000 && (
                <div role="alert">
                  <Notice tone="warning">
                    Halo has no visible game window. Its process is running, but startup has not been
                    confirmed. Stop playtest, check the CE installation and retry. Your private server stays
                    available.
                    <button onClick={onSetup}>Open CE checks</button>
                  </Notice>
                </div>
              )}
              <details className="ce-client-help">
                <summary>First-run help</summary>
                <p className="subtle">
                  For a fresh test profile, open CE setup, complete Halo's own license/profile prompts, then
                  close Halo. Prepare again and launch the playtest. You can also join through Halo →
                  Multiplayer → Direct IP using the address above.
                </p>
                <div className="button-row">
                  <button
                    disabled={
                      !native ||
                      busy ||
                      clientChecking ||
                      client?.phase !== 'ready' ||
                      view.phase !== 'running'
                    }
                    onClick={() => void clientAction('setup')}
                  >
                    Open CE setup
                  </button>
                  <button onClick={onSetup}>Check CE installation</button>
                </div>
              </details>
            </section>
          )}
          <details>
            <summary>Session details &amp; output</summary>
            <dl>
              <dt>Private copy</dt>
              <dd>{view.sessionDirectory ?? 'Preparing…'}</dd>
              <dt>Copied</dt>
              <dd>{(view.copiedBytes / 1048576).toFixed(1)} MiB</dd>
              <dt>Native replies</dt>
              <dd>{view.observations}</dd>
              <dt>Game version</dt>
              <dd>{view.status?.version ?? 'No current native reply'}</dd>
              <dt>Map identity</dt>
              <dd>{view.mapSha256}</dd>
              {client && (
                <>
                  <dt>Client files checked</dt>
                  <dd>
                    {client.verifiedFiles} · {(client.verifiedBytes / 1048576).toFixed(1)} MiB ·{' '}
                    {client.verificationMs} ms
                  </dd>
                  <dt>Test profile</dt>
                  <dd>{client.profileDirectory}</dd>
                  <dt>Client identity</dt>
                  <dd>{client.executableSha256}</dd>
                  <dt>Client process</dt>
                  <dd>
                    {client.processId ?? 'Not running'} ·{' '}
                    {client.mode === 'setup' ? 'profile setup' : 'join unverified'}
                    {client.elapsedMs ? ` · ${Math.floor(client.elapsedMs / 1000)} s` : ''}
                  </dd>
                </>
              )}
              {view.sourceBuild && (
                <>
                  <dt>Saved build</dt>
                  <dd>
                    {view.sourceBuild.projectTitle} · {view.sourceBuild.buildId}
                  </dd>
                  <dt>Saved revision</dt>
                  <dd>{view.sourceBuild.projectFingerprint}</dd>
                </>
              )}
              <dt>Dedicated executable</dt>
              <dd>{view.executableSha256}</dd>
            </dl>
            <pre>{view.consoleTail || 'No console output captured.'}</pre>
          </details>
        </div>
      )}
      <small className="subtle">
        Classic CE supports up to 16 configured players. This test host listens on loopback with public
        listing disabled. Join with Custom Edition → Multiplayer → Direct IP. A loaded map or zero-player
        reply does not verify a client join or gameplay. Editor sharing stays in SparkLink.
      </small>
    </section>
  );
}
