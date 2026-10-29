import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Globe2, RefreshCw, Play, Search, ShieldCheck } from 'lucide-react';
import { call, native } from '../api';
import type { Project, RuntimeId } from '../types';
import type { CommunityJoinAssessment, CommunityListingView, CommunityServer } from '../runtimeWorkbench';
import { canHandoff, listingExpired, runtimeNames } from '../runtimeWorkbench';
import { useMapState } from '../mapSession';
import { Notice, Pill } from './ui';
import OwnedContentProbe from './OwnedContentProbe';
import InvitationJoin from './InvitationJoin';
import { matchesLobbyFilter, type LobbyFilter } from '../lobbyFilters';
import '../runtimeWorkbench.css';

export default function PlayAndServers({
  project,
  runtime,
  onRuntime,
  onSetup,
  onSettings,
  onHost,
  onFriends,
}: {
  project: Project | null;
  runtime: RuntimeId;
  onRuntime: (id: RuntimeId) => void;
  onSetup: () => void;
  onSettings: () => void;
  onHost: () => void;
  onFriends: () => void;
}) {
  const [provider, setProvider] = useMapState<'community' | 'mcc' | 'private'>(
    project?.id ?? 'global',
    'servers.provider',
    'community',
  );
  const [filter, setFilter] = useMapState(project?.id ?? 'global', 'servers.filter', '');
  const [lobbyFilter, setLobbyFilter] = useMapState<LobbyFilter>(
    project?.id ?? 'global',
    'servers.lobbyFilter',
    'all',
  );
  const [view, setView] = useState<CommunityListingView | null>(null),
    [selected, setSelected] = useState<CommunityServer | null>(null);
  const [assessment, setAssessment] = useState<CommunityJoinAssessment | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [listingBusy, setListingBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false),
    [time, setTime] = useState(Date.now());
  const generation = useRef(0);
  const listingGeneration = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++listingGeneration.current;
    generation.current++;
    setListingBusy(true);
    setError('');
    setAssessment(null);
    setConfirmed(false);
    try {
      const next = await call<CommunityListingView>('community_listing', { refresh: true });
      if (listingGeneration.current === request) {
        setView(next);
        setSelected((previous) =>
          previous ? (next.listing?.servers.find((server) => server.id === previous.id) ?? null) : null,
        );
      }
    } catch (e) {
      if (listingGeneration.current === request) setError(String(e));
    } finally {
      if (listingGeneration.current === request) setListingBusy(false);
    }
  }, []);
  useEffect(() => {
    if (native && provider === 'community' && !view) void refresh();
  }, [provider, refresh]);
  useEffect(()=>{
    if(!native||provider!=='community'||!view?.fetching||listingBusy)return;
    let stopped=false;const request=listingGeneration.current;
    // Another map window can own the bounded HTTPS refresh. Read its shared
    // result without starting a second provider request or waiting for the TTL.
    const timer=setTimeout(()=>void call<CommunityListingView>('community_listing',{refresh:false}).then(next=>{
      if(stopped||request!==listingGeneration.current)return;
      setView(next);setSelected(previous=>previous?(next.listing?.servers.find(server=>server.id===previous.id)??null):null);
    }).catch(e=>{if(!stopped&&request===listingGeneration.current)setError(String(e));}),500);
    return()=>{stopped=true;clearTimeout(timer);};
  },[provider,view,listingBusy]);
  useEffect(() => {
    setAssessment(null);
    setConfirmed(false);
    setMessage('');
    setError('');
    generation.current++;
    setBusy(false);
  }, [runtime, selected?.id]);
  useEffect(
    () => () => {
      generation.current++;
      listingGeneration.current++;
    },
    [],
  );
  useEffect(() => {
    const timer = setInterval(() => setTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const rows = useMemo(
    () =>
      (view?.listing?.servers ?? [])
        .filter((server) => matchesLobbyFilter(server, lobbyFilter))
        .filter((server) =>
          `${server.name} ${server.map.displayName} ${server.provider} ${server.protocol} ${server.gameType}`
            .toLowerCase()
            .includes(filter.toLowerCase()),
        )
        .slice(0, 512),
    [view, filter, lobbyFilter],
  );
  const stale = listingExpired(view, time),
    retry = Math.max(0, Math.ceil((view?.refreshAfterUnix ?? 0) - time / 1000));
  async function preflight() {
    if (!selected || stale) return;
    const request = ++generation.current;
    setBusy(true);
    setError('');
    setAssessment(null);
    setConfirmed(false);
    try {
      const next = await call<CommunityJoinAssessment>('community_join_preflight', {
        serverId: selected.id,
        runtimeId: runtime,
      });
      if (request === generation.current) setAssessment(next);
    } catch (e) {
      if (request === generation.current) setError(String(e));
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }
  async function join() {
    if (!selected || !confirmed || !canHandoff(assessment, view, time)) return;
    const request = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const result = await call<{ processId: number; status: string; detail: string }>('community_join', {
        serverId: selected.id,
        runtimeId: runtime,
        preflightId: assessment!.preflightId,
        confirmed,
      });
      if (request === generation.current) {
        setMessage(`PID ${result.processId} · ${result.status}. ${result.detail}`);
        setConfirmed(false);
      }
    } catch (e) {
      if (request === generation.current) setError(String(e));
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }
  async function openMcc() {
    setBusy(true);
    setError('');
    try {
      setMessage(await call<string>('launch_registered_runtime', { runtimeId: 'mccSteam' }));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="play-servers-workspace">
      <InvitationJoin
        mapId={project?.id ?? 'global'}
        runtime={runtime}
        onRuntime={onRuntime}
        onSetup={onSetup}
      />
      <div className="tabs workspace-tabs" aria-label="Game session providers">
        <button
          className={provider === 'community' ? 'selected' : ''}
          onClick={() => setProvider('community')}
        >
          <Globe2 size={14} />
          Community servers
        </button>
        <button className={provider === 'mcc' ? 'selected' : ''} onClick={() => setProvider('mcc')}>
          MCC sessions
        </button>
        <button className={provider === 'private' ? 'selected' : ''} onClick={() => setProvider('private')}>
          Private / LAN
        </button>
      </div>
      {error && (
        <Notice>
          {error} <button onClick={onSetup}>Open runtime setup</button>
        </Notice>
      )}
      {message && <Notice tone="info">{message}</Notice>}
      {provider === 'community' && (
        <>
          <section className="analysis-card community-server-browser" aria-label="Community server browser">
            <div className="section-heading">
              <h2>Delta List · live community games</h2>
              <button disabled={!native || busy || listingBusy || retry > 0} onClick={() => void refresh()}>
                <RefreshCw size={14} />
                {listingBusy ? 'Reading provider…' : retry > 0 ? `Refresh in ${retry}s` : 'Refresh games'}
              </button>
            </div>
            <p>
              Provider: Chupathingy Delta List. The game handles Delta / OpenCE wire negotiation; MCC uses its
              own sessions. Capacity and provider verification below are advertised metadata.
            </p>
            {!native && (
              <Notice tone="info">
                Open the desktop app to read the live provider listing and inspect a separately installed
                compatible runtime.
              </Notice>
            )}
            {!['chupathingyCe', 'openCe'].includes(runtime) && (
              <Notice tone="info">
                {runtimeNames[runtime]} uses a different game session protocol. Choose its provider above, or
                explicitly select a community runtime:{' '}
                <button onClick={() => onRuntime('chupathingyCe')}>Use ChupathingyCE</button>{' '}
                <button onClick={() => onRuntime('openCe')}>Use OpenCE</button>
              </Notice>
            )}
            {view?.error && <Notice>{view.error}</Notice>}
            <label className="server-filter">
              <Search size={14} />
              <input
                aria-label="Filter live games"
                type="search"
                value={filter}
                maxLength={120}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search server, map or protocol"
              />
            </label>
            <label>
              Show lobbies
              <select
                aria-label="Lobby provider filter"
                value={lobbyFilter}
                onChange={(e) => setLobbyFilter(e.target.value as LobbyFilter)}
              >
                <option value="all">All available advertised games</option>
                <option value="opence">OpenCE / legacy protocol</option>
                <option value="chupathingy">Chupathingy / Delta protocol</option>
                <option value="web">Advertised web/browser hosts</option>
                <option value="unknown">Unknown platform / protocol</option>
              </select>
            </label>
            <p className="subtle">
              All combines the public provider's advertisements. OpenCE and web games may share compatible
              protocols; host identity/platform can be unknown. MCC lobbies need MCC's own invitations or
              session interface and are not fabricated into this public list.
            </p>
            <p className="subtle">
              {rows.length} matching games · Active runtime: {runtimeNames[runtime]} ·{' '}
              {stale ? 'Listing expired / unavailable; refresh to check a join' : 'Listing current'}
            </p>
            <div className="server-browser-layout">
              <div className="community-server-rows" role="list" aria-label="Advertised games">
                {rows.map((server) => (
                  <button
                    key={server.id}
                    role="listitem"
                    aria-pressed={selected?.id === server.id}
                    className={selected?.id === server.id ? 'selected' : ''}
                    onClick={() => setSelected(server)}
                  >
                    <strong>{server.name || 'Unnamed game'}</strong>
                    <span>
                      {server.map.displayName} · {server.gameType || 'Unknown game type'}
                    </span>
                    <span>
                      {server.players}/{server.advertisedCapacity} advertised · {server.protocol} / legacy{' '}
                      {server.legacyNetworkVersion}
                    </span>
                    <small>
                      {server.locked ? 'Password required in game' : server.open ? 'Open' : 'Closed'} ·{' '}
                      {server.inProgress ? 'In progress' : 'Lobby'} · {server.region ?? 'Region unknown'}
                    </small>
                  </button>
                ))}
                {native && !busy && rows.length === 0 && (
                  <p>No matching advertised games. Refresh the provider or change the filter.</p>
                )}
              </div>
              <section className="community-join-details" aria-label="Selected game requirements">
                {selected ? (
                  <>
                    <h3>{selected.name || 'Unnamed game'}</h3>
                    <p>
                      {selected.provider} · {selected.protocol} · {selected.hosting}
                    </p>
                    <dl>
                      <dt>Required content family</dt>
                      <dd>
                        {selected.map.family} / {selected.map.pack ?? 'No map pack advertised'} /{' '}
                        {selected.map.name}
                      </dd>
                      <dt>Build / platform</dt>
                      <dd>
                        {selected.build ?? 'Not advertised'} / {selected.platform ?? 'Unknown'}
                      </dd>
                      <dt>Map/mod hash</dt>
                      <dd>Not supplied by this provider; the game must verify content before connection.</dd>
                      <dt>Capacity</dt>
                      <dd>
                        {selected.advertisedCapacity} advertised slots; performance not measured by Spark.
                      </dd>
                    </dl>
                    <p className="subtle">
                      {selected.providerVerified
                        ? 'Provider reports verification. This is separate from Spark game acceptance.'
                        : 'Provider does not claim this listing is verified.'}
                    </p>
                    <div className="button-row">
                      <button
                        disabled={!native || busy || listingBusy || stale}
                        onClick={() => void preflight()}
                      >
                        <ShieldCheck size={14} />
                        Check installed runtime &amp; map
                      </button>
                      <button onClick={onSetup}>Set up {runtimeNames[runtime]}</button>
                    </div>
                    {assessment && (
                      <div aria-live="polite">
                        <h4>
                          {assessment.readiness === 'blocked'
                            ? 'Requirements need attention'
                            : 'Ready for the game’s compatibility check'}
                        </h4>
                        {assessment.issues.map((issue) => (
                          <p key={issue.code}>
                            <strong>{issue.summary}</strong>
                            <br />
                            <small>{issue.setupRoute}</small>
                          </p>
                        ))}
                        {assessment.limitations.map((limit) => (
                          <p className="subtle" key={limit}>
                            {limit}
                          </p>
                        ))}
                        <p>
                          Inspected executable SHA-256: <code>{assessment.executableSha256}</code>
                          {assessment.dataRoot&&<><br/>Content folder: <code>{assessment.dataRoot}</code></>}
                        </p>
                        <p>Connection: {assessment.connectionOutcome}</p>
                      </div>
                    )}
                    {canHandoff(assessment, view, time) && (
                      <>
                        <label className="toggle-setting">
                          <input
                            type="checkbox"
                            checked={confirmed}
                            onChange={(e) => setConfirmed(e.target.checked)}
                          />
                          Open this invitation using the inspected {runtimeNames[runtime]} installation.
                        </label>
                        <button disabled={busy || !confirmed} onClick={() => void join()}>
                          <Play size={14} />
                          Hand invitation to game
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <p>Select a game to inspect its runtime, content and privacy requirements.</p>
                )}
              </section>
            </div>
            {(view?.listing?.rejectedRows ?? 0) > 0 && (
              <Notice>
                {view!.listing!.rejectedRows} malformed or unsupported advertisements were rejected.
              </Notice>
            )}
            <p className="subtle">
              Invitation tokens stay in native memory and are redacted from Spark’s reports. Launching a
              process does not establish a connection. No automatic downloads, port forwarding or public
              hosting occurs.
            </p>
          </section>
          <OwnedContentProbe onSettings={onSettings} />
        </>
      )}
      {provider === 'mcc' && (
        <section className="analysis-card">
          <h2>MCC · supported mod sessions</h2>
          <p>
            Open MCC through its Steam launch workflow, select Anti-Cheat Disabled (Mods and Limited
            Services), then use MCC’s own Custom Games, invitations and co-op menus with compatible builds and
            content.
          </p>
          <Notice tone="info">
            Spark has no verified authorized MCC lobby enumeration or connection-result API. A launcher
            handoff cannot report your lobby as joined.
          </Notice>
          <div className="button-row">
            <button disabled={!native || busy} onClick={() => void openMcc()}>
              <Play size={14} />
              Open MCC launch workflow
            </button>
            <button onClick={onHost}>Hosting &amp; mod package checks</button>
            <button onClick={onFriends}>Compare game content with a friend</button>
          </div>
          <OwnedContentProbe onSettings={onSettings} />
        </section>
      )}
      {provider === 'private' && (
        <section className="analysis-card">
          <h2>Private games and LAN / VPN</h2>
          <p>
            Keep game hosting and shared editor documents separate. Use the selected runtime’s supported
            private or system-link menus and compare the actual map/mod builds on both game clients.
          </p>
          <div className="button-row">
            <button onClick={onHost}>Private hosting workflow</button>
            <button onClick={onFriends}>Peer content preflight</button>
            <button onClick={onSetup}>Runtime &amp; tool setup</button>
          </div>
          <Notice tone="info">
            Spark’s existing LAN/VPN editor collaboration and optional Steam test bridge exchange editor
            changes. They do not synchronize game actors, AI, damage or live BSP replacements.
          </Notice>
        </section>
      )}
    </div>
  );
}
