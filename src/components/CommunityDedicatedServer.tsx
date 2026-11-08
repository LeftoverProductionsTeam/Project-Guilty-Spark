import { useEffect, useRef, useState } from 'react';
import { Download, FolderOpen, Play, RotateCcw, Square } from 'lucide-react';
import { call, native } from '../api';
import { useMapState } from '../mapSession';
import type { Project } from '../types';
import { Notice, Pill } from './ui';
interface Installation {
  installed: boolean;
  version: string;
  downloadBytes: number;
  executable: string | null;
}
interface DedicatedView {
  id: string;
  phase: string;
  detail: string;
  map: string;
  gameType: string;
  processId: number | null;
  mapSha256: string;
  serverSha256: string;
  copiedBytes: number;
  sourceBuildId: string | null;
  restarts: number;
  originalInputsUnchanged: boolean | null;
  status: null | {
    version: string;
    state: string;
    map: string;
    gameType: string;
    players: number;
    maximumPlayers: number;
    networkVersion: number;
    public: boolean;
  };
}
interface Request {
  runtimeId: string;
  mode: string;
  name: string;
  maximumPlayers: number;
  minimumPlayers: number;
  network: string;
  public: boolean;
  listGames: boolean;
  controlAddress: string;
  entries: { map: string; gameType: string }[];
}
/** Controls for the existing native host adapter; configuration is not gameplay proof. */
export default function CommunityDedicatedServer({
  project,
  request,
}: {
  project: Project | null;
  request: () => Request;
}) {
  const [installation, setInstallation] = useState<Installation | null>(null),
    [view, setView] = useState<DedicatedView | null>(null),
    [busy, setBusy] = useState(false),
    [problem, setProblem] = useState(''),
    [useBuild, setUseBuild] = useState(false);
  const [clientAddresses, setClientAddresses] = useMapState(
    project?.id ?? 'global',
    'hosting.chupathingy.privateClientAddresses',
    '127.0.0.3',
  );
  const alive = useRef(true),
    polling = useRef(false);
  useEffect(() => {
    alive.current = true;
    void call<Installation>('community_server_installation')
      .then((v) => {
        if (alive.current) setInstallation(v);
      })
      .catch((e) => {
        if (alive.current) setProblem(String(e));
      });
    const poll = async () => {
      if (polling.current) return;
      polling.current = true;
      try {
        const v = await call<DedicatedView | null>('community_server_status');
        if (alive.current) setView(v);
      } catch (e) {
        if (alive.current) setProblem(String(e));
      } finally {
        polling.current = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, []);
  const active = !!view && !['failed', 'stopped'].includes(view.phase);
  const build = project?.builds
    .slice()
    .reverse()
    .find((b) => b.target === 'gbx-custom' && b.status === 'validated' && !!b.output && !!b.sha256);
  const buildName = build?.output
    ?.split(/[\\/]/)
    .at(-1)
    ?.replace(/\.map$/i, '');
  async function action(task: () => Promise<void>) {
    setBusy(true);
    setProblem('');
    try {
      await task();
    } catch (e) {
      if (alive.current) setProblem(String(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section className="community-dedicated" aria-label="Private Chupathingy dedicated server">
      <div className="section-heading">
        <h3>Private dedicated server</h3>
        <Pill>{installation?.installed ? installation.version : 'Setup required'}</Pill>
      </div>
      <div className="button-row">
        {!installation?.installed && (
          <>
            <button
              disabled={!native || busy || active}
              onClick={() =>
                void action(async () => {
                  const v = await call<Installation>('community_server_install');
                  if (alive.current) setInstallation(v);
                })
              }
            >
              <Download size={13} />
              Download verified server · 21 MB
            </button>
            <button
              disabled={!native || busy || active}
              onClick={() =>
                void action(async () => {
                  const v = await call<Installation | null>('community_server_locate');
                  if (v && alive.current) setInstallation(v);
                })
              }
            >
              <FolderOpen size={13} />
              Locate installed server
            </button>
          </>
        )}
        {project && (
          <label title="The saved project's current independently validated Custom Edition build is checked again before staging.">
            <input
              type="checkbox"
              checked={useBuild}
              disabled={busy || active || !build}
              onChange={(e) => setUseBuild(e.target.checked)}
            />
            Use current CE build{useBuild && buildName ? ` · ${buildName}` : ''}
          </label>
        )}
        <button
          disabled={!native || !installation?.installed || busy || active || (useBuild && !buildName)}
          onClick={() =>
            void action(async () => {
              const next = request();
              if (useBuild && buildName)
                next.entries = [{ map: `${buildName}@ce`, gameType: next.entries[0]?.gameType ?? 'slayer' }];
              const v = await call<DedicatedView>('community_server_start', {
                request: next,
                projectId: useBuild ? project?.id : null,
                clientAddresses: clientAddresses.split(',').map((value) => value.trim()),
              });
              if (alive.current) setView(v);
            })
          }
        >
          <Play size={13} />
          Start private dedicated server
        </button>
        {active && (
          <>
            <button
              disabled={busy || !['ready', 'inGame'].includes(view.phase)}
              onClick={() =>
                void action(() => call('community_server_action', { id: view.id, action: 'restart' }))
              }
            >
              <RotateCcw size={13} />
              Restart map
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void action(() => call('community_server_action', { id: view.id, action: 'stop' }))
              }
            >
              <Square size={13} />
              Stop server
            </button>
          </>
        )}
      </div>
      <details>
        <summary>Local trial routing</summary>
        <label>
          Client listening addresses
          <input
            aria-label="Private trial client addresses"
            value={clientAddresses}
            disabled={busy || active}
            onChange={(e) => setClientAddresses(e.target.value)}
            placeholder="127.0.0.3"
            maxLength={127}
          />
        </label>
        <p className="subtle">
          For separate game processes on this computer, list their loopback addresses separated by commas. The
          private server uses 127.0.0.2. Use 127.0.0.3 for one client; 127.0.0.1 is redirected by this engine.
          Other network addresses are refused.
        </p>
      </details>
      <p className="subtle">
        Windows x64 · loopback only · separate saves · original maps unchanged. This starts an ordinary
        multiplayer session; AI Apocalypse and persistent Extraction are not supplied by a playlist.
      </p>
      {problem && <Notice>{problem}</Notice>}
      {view && (
        <div aria-live="polite">
          <strong>
            {view.map} · {view.phase}
          </strong>
          <p>{view.detail}</p>
          {view.status && (
            <p>
              {view.status.players}/{view.status.maximumPlayers} players · native {view.status.state} · OpenCE
              compatibility {view.status.networkVersion} ·{' '}
              {view.status.public ? 'Public (unexpected)' : 'Private'}
            </p>
          )}
          {view.mapSha256 && (
            <details>
              <summary>Native map identity and session</summary>
              <p>
                SHA-256 <code>{view.mapSha256}</code>
              </p>
              <p>
                Compiled build: {view.sourceBuildId ?? 'Owned Xbox source'} · restart acknowledgements:{' '}
                {view.restarts} · staged {(view.copiedBytes / 1024 ** 2).toFixed(1)} MiB.
              </p>
              <p>
                Original input recheck:{' '}
                {view.originalInputsUnchanged === null
                  ? 'Pending session stop'
                  : view.originalInputsUnchanged
                    ? 'Unchanged'
                    : 'Changed; review required'}
                .
              </p>
              <p>
                Join from the matching Chupathingy client's System Link lobby. A loaded server is separate
                from player movement, AI combat and persistence acceptance.
              </p>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
