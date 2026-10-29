import { useEffect, useRef, useState } from 'react';
import { Server, Save, RefreshCw, Unplug } from 'lucide-react';
import { call, native } from '../api';
import type { Project, RuntimeId } from '../types';
import { Notice, Pill } from './ui';

interface HostPlan {
  mode: string;
  requestedPlayers: number;
  readiness: string;
  configuration: {
    playlistRelativePath: string;
    playlistText: string;
    environment: Record<string, string>;
  } | null;
  gates: { code: string; detail: string }[];
  clientSteps: string[];
  testedPlayers: number | null;
  gameOutcome: string;
}
interface ControlView {
  connectionId: string;
  status: {
    name: string;
    version: string;
    networkVersion: number;
    state: string;
    map: string;
    gameType: string;
    players: number;
    maximumPlayers: number;
    minimumPlayers: number;
    public: boolean;
    uptimeSeconds: number;
  };
  commandsEnabled: boolean;
  detail: string;
}
export default function CommunityHostAdapter({
  runtime,
  project,
  onRuntime,
  onSetup,
}: {
  runtime: RuntimeId;
  project: Project | null;
  onRuntime: (id: RuntimeId) => void;
  onSetup: () => void;
}) {
  const [mode, setMode] = useState<'multiplayer' | 'campaign' | 'firefight'>('multiplayer'),
    [players, setPlayers] = useState(128),
    [map, setMap] = useState(project?.source?.scenarioPath.split(/[\\/]/).at(-1) ?? 'bloodgulch'),
    [variant, setVariant] = useState('slayer'),
    [name, setName] = useState('Spark private');
  const [plan, setPlan] = useState<HostPlan | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [address, setAddress] = useState('127.0.0.1:8080'),
    [token, setToken] = useState(''),
    [control, setControl] = useState<ControlView | null>(null);
  const generation = useRef(0),
    controlRef = useRef(control);
  controlRef.current = control;
  useEffect(() => {
    generation.current++;
    setPlan(null);
    setBusy(false);
    setError('');
    setMessage('');
  }, [runtime, mode, players, map, variant, name]);
  useEffect(
    () => () => {
      generation.current++;
      const current = controlRef.current;
      if (current)
        void call('community_control_disconnect', { connectionId: current.connectionId }).catch(() => {});
    },
    [],
  );
  const request = () => ({
    runtimeId: runtime,
    mode,
    name,
    maximumPlayers: players,
    minimumPlayers: 1,
    network: 'lan',
    public: false,
    listGames: false,
    controlAddress: address,
    entries: mode === 'multiplayer' ? [{ map, gameType: variant }] : [],
  });
  async function prepare() {
    const id = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const result = await call<HostPlan>('community_host_plan', { request: request() });
      if (id === generation.current) setPlan(result);
    } catch (e) {
      if (id === generation.current) setError(String(e));
    } finally {
      if (id === generation.current) setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError('');
    try {
      const folder = await call<string>('community_host_save', { request: request() });
      setMessage(`Private host profile and playlist saved to ${folder}. No server was started.`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function connect() {
    const request = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const next = await call<ControlView>('community_control_connect', { address, token });
      if (request === generation.current) {
        setControl(next);
        setToken('');
      } else await call('community_control_disconnect', { connectionId: next.connectionId });
    } catch (e) {
      if (request === generation.current) setError(String(e));
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }
  async function poll() {
    if (!control) return;
    setBusy(true);
    setError('');
    try {
      setControl(await call<ControlView>('community_control_poll', { connectionId: control.connectionId }));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    if (!control) return;
    setBusy(true);
    try {
      await call('community_control_disconnect', { connectionId: control.connectionId });
      setControl(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="analysis-card community-host-adapter" aria-label="Community host adapter">
      <div className="section-heading">
        <h2>
          <Server size={16} />
          Community host adapter
        </h2>
        <Pill>Private by default</Pill>
      </div>
      <p>
        Prepare a real documented host configuration and inspect an owned server through Delta Control.
        Capacity is a requested setting. Multiplayer 128, campaign eight and Firefight eight have separate
        engine and game-acceptance gates.
      </p>
      {!['chupathingyCe', 'openCe'].includes(runtime) && (
        <Notice tone="info">
          MCC's client does not implement the community host protocol.{' '}
          <button onClick={() => onRuntime('chupathingyCe')}>Choose ChupathingyCE host target</button>{' '}
          <button onClick={onSetup}>MCC / runtime setup</button>
        </Notice>
      )}
      <div className="button-row">
        <label>
          Mode
          <select
            aria-label="Community host mode"
            disabled={busy}
            value={mode}
            onChange={(e) => {
              const value = e.target.value as typeof mode;
              setMode(value);
              setPlayers(value === 'multiplayer' ? 128 : 8);
            }}
          >
            <option value="multiplayer">Multiplayer · up to 128 requested</option>
            <option value="campaign">Campaign · eight-player goal</option>
            <option value="firefight">Firefight · eight-player goal</option>
          </select>
        </label>
        <label>
          Maximum players
          <input
            aria-label="Community host maximum players"
            disabled={busy}
            type="number"
            min="1"
            max={mode === 'multiplayer' ? 128 : 8}
            value={players}
            onChange={(e) => setPlayers(Number(e.target.value))}
          />
        </label>
        <label>
          Name
          <input
            aria-label="Community host name"
            disabled={busy}
            value={name}
            maxLength={15}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {mode === 'multiplayer' && (
          <>
            <label>
              Map selector
              <input
                aria-label="Community host map"
                disabled={busy}
                value={map}
                maxLength={127}
                onChange={(e) => setMap(e.target.value)}
              />
            </label>
            <label>
              Game type
              <input
                aria-label="Community host game type"
                disabled={busy}
                value={variant}
                maxLength={39}
                onChange={(e) => setVariant(e.target.value)}
              />
            </label>
          </>
        )}
        <button disabled={!native || busy} onClick={() => void prepare()}>
          Check host adapter
        </button>
      </div>
      {error && <Notice>{error}</Notice>}
      {message && <Notice tone="info">{message}</Notice>}
      {plan && (
        <div aria-live="polite">
          <h3>
            {plan.readiness === 'readyForReview'
              ? 'Ready for owner review'
              : plan.readiness === 'setupRequired'
                ? 'Host setup required'
                : 'Engine adapter / acceptance required'}
          </h3>
          {plan.gates.map((g) => (
            <p key={g.code}>{g.detail}</p>
          ))}
          {plan.clientSteps.length > 0 && (
            <ol>
              {plan.clientSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          )}
          {plan.configuration && (
            <>
              <details>
                <summary>Exact private configuration / playlist</summary>
                <pre>{JSON.stringify(plan.configuration, null, 2)}</pre>
              </details>
              <button disabled={busy} onClick={() => void save()}>
                <Save size={14} />
                Save private host profile
              </button>
            </>
          )}
          <p className="subtle">
            Tested game players: {plan.testedPlayers ?? 'No accepted game test'}. Actual game outcome:{' '}
            {plan.gameOutcome}. Dedicated hosting currently targets the upstream Linux server; Windows does
            not silently install or launch WSL.
          </p>
        </div>
      )}
      <details>
        <summary>Connect to my existing local / forwarded Delta Control service</summary>
        <p>
          Use an owner-controlled server with its documented authenticated API enabled on loopback, or a
          manually configured local tunnel. Spark does not enable remote administration, public listing, UPnP
          or firewall rules.
        </p>
        <div className="button-row">
          <label>
            Loopback address
            <input
              aria-label="Delta Control address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={80}
              disabled={!!control||busy}
            />
          </label>
          <label>
            Control token
            <input
              aria-label="Delta Control token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              maxLength={256}
              disabled={!!control||busy}
            />
          </label>
          <button disabled={!native || busy || !!control || !token} onClick={() => void connect()}>
            Read authenticated status
          </button>
        </div>
        {control && (
          <>
            <p>
              <strong>{control.status.name}</strong> · {control.status.state} · {control.status.map} /{' '}
              {control.status.gameType}
              <br />
              {control.status.players}/{control.status.maximumPlayers} configured players · Network{' '}
              {control.status.networkVersion} ·{' '}
              {control.status.public ? 'Server reports public' : 'Server reports private'}
            </p>
            <p>{control.detail}</p>
            <div className="button-row">
              <button disabled={busy} onClick={() => void poll()}>
                <RefreshCw size={13} />
                Refresh server status
              </button>
              <button disabled={busy} onClick={() => void disconnect()}>
                <Unplug size={13} />
                Stop observing
              </button>
            </div>
          </>
        )}
      </details>
    </section>
  );
}
