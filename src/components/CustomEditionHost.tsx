import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, RefreshCw, Server, Square } from 'lucide-react';
import { call, native } from '../api';
import { Notice, Pill } from './ui';
import './CustomEditionHost.css';

interface Catalog {
  executableSha256: string;
  maps: { name: string; sha256: string }[];
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
  sessionDirectory: string | null;
  copiedBytes: number;
  observations: number;
  elapsedMs: number;
  consoleTail: string;
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

export default function CustomEditionHost({ onSetup }: { onSetup: () => void }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [view, setView] = useState<CeHostView | null>(null);
  const [map, setMap] = useState('bloodgulch'),
    [gameType, setGameType] = useState('slayer');
  const [maximumPlayers, setMaximumPlayers] = useState(2),
    [port, setPort] = useState(0);
  const [name, setName] = useState('Spark private');
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(native);
  const [error, setError] = useState(''),
    [setupError, setSetupError] = useState('');
  const mounted = useRef(false),
    polling = useRef(false);
  const generation = useRef(0),
    currentView = useRef(view);
  currentView.current = view;
  const refresh = useCallback(async () => {
    setLoading(true);
    setSetupError('');
    try {
      const next = await call<Catalog>('ce_host_catalog');
      if (mounted.current) {
        setCatalog(next);
        if (!active(currentView.current))
          setMap((previous) =>
            next.maps.some((item) => item.name === previous) ? previous : (next.maps[0]?.name ?? ''),
          );
      }
    } catch (e) {
      if (mounted.current) {
        setCatalog(null);
        setSetupError(String(e));
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);
  const poll = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    const token = generation.current;
    try {
      const next = await call<CeHostView | null>('ce_host_status');
      if (mounted.current && token === generation.current) {
        setView(next);
        if (active(next) && next) {
          setMap(next.map);
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
      window.clearInterval(timer);
    };
  }, [refresh, poll]);
  const selected = catalog?.maps.find((item) => item.name === map);
  async function start() {
    if (!selected || !catalog) return;
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
  const locked = busy || !!active(view);
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
              {catalog.maps.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
              {active(view) && view && !catalog.maps.some((item) => item.name === view.map) && (
                <option value={view.map}>Active snapshot · {view.map}</option>
              )}
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
          <button disabled={!native || loading || locked || !selected} onClick={() => void start()}>
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
          {!!view.port && active(view) && (
            <p>
              Direct IP: <code className="ce-host-address">127.0.0.1:{view.port}</code>
            </p>
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
