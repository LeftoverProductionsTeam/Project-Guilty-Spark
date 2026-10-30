import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { call, native } from '../api';
import { useMapState, readMapSession } from '../mapSession';
import type { QuickForgeDocument } from '../forge';
import type { LibraryEntry } from '../types';
import { localForge, mergeForge, portableForge } from '../forgeSession';
import {
  announceStudio,
  studioDifferences,
  type StudioInfo as Info,
  type StudioView as View,
  type PendingStudioEdit as Pending,
  type StudioRecord,
} from '../studioClient';
import { Notice } from './ui';
import SteamSessionTools from './SteamSessionTools';
import '../hosting.css';
import './studio.css';
type Transport = 'lan' | 'steamSpacewar';
export default function ForgeCollaboration({
  projectId,
  document: doc,
  entries,
  onShared,
  onSave,
}: {
  projectId: string;
  document: QuickForgeDocument;
  entries: LibraryEntry[];
  onShared: (document: QuickForgeDocument) => void;
  onSave: () => Promise<void>;
}) {
  const [view, setView] = useState<View | null>(null),
    [session, setSession] = useState<Info | null>(null),
    [other, setOther] = useState<Info | null>(null);
  const [endpoint, setEndpoint] = useMapState(projectId, 'share.endpoint', ''),
    [key, setKey] = useState(''),
    [invite, setInvite] = useState('');
  const [transport, setTransport] = useMapState<Transport>(projectId, 'share.transport', 'lan'),
    [lan, setLan] = useMapState(projectId, 'share.lan', true),
    [address, setAddress] = useMapState(projectId, 'share.address', '127.0.0.1');
  const [displayName, setDisplayName] = useMapState(projectId, 'studio.name', 'Creator'),
    [legacy, setLegacy] = useState(false),
    [viewerInvite, setViewerInvite] = useState(false),
    [expanded, setExpanded] = useState(false);
  const [linkGame, setLinkGame] = useState(false),
    [steamReady, setSteamReady] = useState(false),
    [working, setWorking] = useState(false),
    [restoring, setRestoring] = useState(native),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [paused, setPaused] = useState(false),
    [showKey, setShowKey] = useState(false);
  const [history, setHistory] = useState<StudioRecord[]>([]),
    [retained, setRetained] = useState<Pending | null>(null),
    [remoteConflict, setRemoteConflict] = useState<View | null>(null),
    [roundTrip, setRoundTrip] = useState<number | null>(null);
  const latest = useRef({ doc, entries, onShared });
  latest.current = { doc, entries, onShared };
  const shared = useRef<View | null>(null),
    pending = useRef<Pending | null>(null),
    blocked = useRef(false),
    accepting = useRef<string | null>(null),
    active = useRef(true),
    inFlight = useRef(false),
    actionRequest = useRef<number | null>(null),
    queuedReverse = useRef<{ sessionId: string; redo: boolean }[]>([]),
    drainReverse = useRef<() => void>(() => {}),
    operation = useRef(0),
    sessionRef = useRef<Info | null>(null);
  sessionRef.current = session;
  const json = (d: QuickForgeDocument) => JSON.stringify(portableForge(d));
  const busy = working || restoring;
  useLayoutEffect(() => {
    accepting.current = null;
  }, [doc]);
  function accept(next: View, document = next.document) {
    shared.current = next;
    setView(next);
    announceStudio(projectId, next, sessionRef.current?.role === 'host');
    const local = localForge(document, latest.current.entries);
    if (json(latest.current.doc) !== json(local)) {
      accepting.current = json(local);
      latest.current.onShared(local);
    }
  }
  useEffect(() => {
    active.current = true;
    let cancelled = false;
    setRestoring(native);
    setWorking(false);
    if (native)
      void call<Info | null>('forge_session_status', { projectId })
        .then(
          (info) => {
            if (cancelled || !info) return;
            if (info.projectId !== projectId || info.owned === false) {
              setOther(info);
              return;
            }
            setSession(info);
            setTransport(info.transport);
            setEndpoint(info.endpoint);
            setKey(info.key ?? '');
            setLan(info.lan);
            setView(info.view);
            shared.current = info.view;
            const differs = !info.view || json(latest.current.doc) !== json(info.view.document);
            if (info.view) announceStudio(projectId, info.view, info.role === 'host', differs);
            blocked.current = differs;
            setPaused(differs);
            if (differs)
              setError(
                info.detail ??
                  'Session restored. Your local draft differs; preserve it before choosing the shared version.',
              );
          },
          (e) => {
            if (!cancelled) setError(String(e));
          },
        )
        .finally(() => {
          if (!cancelled) setRestoring(false);
        });
    if (native)
      void call<Pending | null>('forge_studio_pending', { projectId }).then(
        (value) => {
          if (!cancelled) {
            pending.current = value;
            setRetained(value);
          }
        },
        () => {},
      );
    return () => {
      cancelled = true;
      active.current = false;
      queuedReverse.current = [];
      operation.current++;
    };
  }, [projectId]);
  useEffect(() => {
    if (!expanded || !native) return;
    let current = true;
    void call<StudioRecord[]>('forge_studio_history', { projectId }).then(
      (rows) => {
        if (current) setHistory(rows);
      },
      () => {},
    );
    return () => {
      current = false;
    };
  }, [expanded, projectId, session?.sessionId]);
  useEffect(() => {
    const open = (e: Event) => {
      if ((e as CustomEvent<{ projectId: string }>).detail?.projectId === projectId) setExpanded(true);
    };
    window.addEventListener('guilty-spark-live-studio-open', open);
    if (readMapSession(projectId, 'studio.openRequest', false)) setExpanded(true);
    return () => window.removeEventListener('guilty-spark-live-studio-open', open);
  }, [projectId]);
  async function clear(packet: Pending) {
    await call('forge_studio_clear_pending', { projectId, operationId: packet.operationId });
    if (pending.current?.operationId === packet.operationId) {
      pending.current = null;
      if (active.current) setRetained(null);
    }
  }
  async function tick() {
    if (
      inFlight.current ||
      actionRequest.current !== null ||
      blocked.current ||
      !shared.current ||
      !sessionRef.current
    )
      return;
    if (accepting.current) {
      if (json(latest.current.doc) !== accepting.current) return;
      accepting.current = null;
    }
    inFlight.current = true;
    const id = sessionRef.current.sessionId,
      began = performance.now();
    try {
      const before = shared.current,
        sent = portableForge(latest.current.doc),
        changed = json(sent) !== json(before.document);
      let next: View;
      if (changed) {
        if (before.role === 'viewer')
          throw Error('This is a viewer session. The local draft is retained; shared content is unchanged.');
        let packet = pending.current;
        if (!packet || packet.sessionId !== id || json(packet.document) !== json(sent)) {
          packet = {
            sessionId: id,
            operationId: crypto.randomUUID(),
            revision: before.revision,
            document: sent,
          };
          await call('forge_studio_save_pending', { projectId, pending: packet });
          pending.current = packet;
          setRetained(packet);
        }
        next = await call<View>('forge_session_update', {
          projectId,
          sessionId: id,
          revision: packet.revision,
          document: packet.document,
          operationId: packet.operationId,
        });
        if (next.acknowledgedOperationId !== packet.operationId)
          throw Error('The host did not acknowledge this operation identity. Your pending edit is retained.');
        await clear(packet);
      } else next = await call<View>('forge_session_poll', { projectId, sessionId: id });
      if (!active.current || next.sessionId !== id) return;
      setRoundTrip(Math.round(performance.now() - began));
      const newer = portableForge(latest.current.doc);
      accept(next, mergeForge(sent, newer, next.document));
      setError('');
      setRemoteConflict(null);
    } catch (e) {
      if (active.current) {
        blocked.current = true;
        queuedReverse.current = [];
        setPaused(true);
        announceStudio(projectId, shared.current, sessionRef.current?.role === 'host', true);
        setError(`${String(e)} Your local draft is retained.`);
        void call<Info | null>('forge_session_status', { projectId }).then(
          (info) => {
            if (active.current && info?.view) setRemoteConflict(info.view);
          },
          () => {},
        );
      }
    } finally {
      inFlight.current = false;
      drainReverse.current();
    }
  }
  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => void tick(), 500);
    return () => clearInterval(timer);
  }, [session?.sessionId, projectId]);
  async function perform(action: () => Promise<void>) {
    if (actionRequest.current !== null) return;
    const request = ++operation.current;
    actionRequest.current = request;
    setWorking(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (e) {
      if (active.current && request === operation.current) setError(String(e));
    } finally {
      if (actionRequest.current === request) actionRequest.current = null;
      if (active.current && request === operation.current) setWorking(false);
      if (active.current) queueMicrotask(() => drainReverse.current());
    }
  }
  function reverse(redo = false) {
    if (!session || paused) return;
    if (queuedReverse.current.length >= 16) {
      setError('Wait for the queued shared history requests to finish before adding more.');
      return;
    }
    queuedReverse.current.push({ sessionId: session.sessionId, redo });
    drainReverse.current();
  }
  drainReverse.current = () => {
    const request = queuedReverse.current[0];
    if (!request || !active.current) return;
    if (!sessionRef.current || request.sessionId !== sessionRef.current.sessionId || blocked.current) {
      queuedReverse.current = [];
      return;
    }
    // Polls and preceding inverse transactions must finish before keyboard
    // requests run. Incoming React source application also stays serialized.
    if (inFlight.current || actionRequest.current !== null || restoring || accepting.current) return;
    if (pending.current || !shared.current || json(latest.current.doc) !== json(shared.current.document)) {
      queuedReverse.current = [];
      setError('Wait for the pending shared edit to be acknowledged before undoing it.');
      return;
    }
    queuedReverse.current.shift();
    void perform(async () => {
      try {
        const next = await call<View>('forge_session_reverse', {
          projectId,
          sessionId: request.sessionId,
          operationId: crypto.randomUUID(),
          redo: request.redo,
        });
        if (active.current) accept(next);
      } catch (error) {
        blocked.current = true;
        queuedReverse.current = [];
        setPaused(true);
        announceStudio(projectId, shared.current, sessionRef.current?.role === 'host', true);
        throw error;
      }
    });
  };
  useEffect(() => drainReverse.current(), [doc, view, working, restoring, session?.sessionId]);
  useEffect(() => {
    if (!session) return;
    const undo = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId: string; redo: boolean }>).detail;
      if (detail?.projectId !== projectId) return;
      event.preventDefault();
      if (
        pending.current ||
        (!accepting.current && shared.current && json(latest.current.doc) !== json(shared.current.document))
      ) {
        setError('Wait for the pending shared edit to be acknowledged before undoing it.');
        return;
      }
      void reverse(detail.redo);
    };
    window.addEventListener('guilty-spark-studio-undo', undo);
    return () => window.removeEventListener('guilty-spark-studio-undo', undo);
  }, [session?.sessionId, projectId, paused, busy]);
  function exportDraft(document = latest.current.doc) {
    const blob = new Blob(
        [
          JSON.stringify(
            { kind: 'guilty-spark-quickforge-draft', document: portableForge(document) },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
      url = URL.createObjectURL(blob),
      a = window.document.createElement('a');
    a.href = url;
    a.download = 'sparklink-local-draft.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function copyInvite() {
    if (!session) return;
    const text = await call<string>('forge_session_invite', {
      projectId,
      sessionId: session.sessionId,
      address,
      viewer: viewerInvite,
    });
    try {
      await navigator.clipboard.writeText(text);
      setMessage(`Private ${viewerInvite ? 'viewer' : 'editor'} invite copied.`);
    } catch {
      setInvite(text);
      setMessage('Select and copy the private invitation below.');
    }
  }
  async function useShared() {
    if (!session) return;
    const next = await call<View>('forge_session_resume', { projectId, sessionId: session.sessionId });
    if (!active.current) return;
    accept(next);
    blocked.current = false;
    setPaused(false);
    setRemoteConflict(null);
    setMessage(
      'Using the authoritative source. Any retained pending edit stays available until explicitly cleared.',
    );
  }
  async function retry() {
    if (!session || !pending.current) return;
    const packet = pending.current;
    if (packet.sessionId !== session.sessionId)
      throw Error(
        'This retained edit belongs to an earlier session. Restore/export it locally before joining another.',
      );
    await call('forge_session_resume', { projectId, sessionId: session.sessionId });
    const next = await call<View>('forge_session_update', {
      projectId,
      sessionId: session.sessionId,
      revision: packet.revision,
      document: packet.document,
      operationId: packet.operationId,
    });
    if (next.acknowledgedOperationId !== packet.operationId)
      throw Error('No matching acknowledgment received');
    await clear(packet);
    if (active.current) {
      accept(next, mergeForge(packet.document, portableForge(latest.current.doc), next.document));
      blocked.current = false;
      setPaused(false);
      setRemoteConflict(null);
    }
  }
  const people = view?.participants ?? [],
    differences = remoteConflict ? studioDifferences(latest.current.doc, remoteConflict.document) : [];
  return (
    <details
      className="forge-live-panel studio-panel"
      open={expanded}
      onToggle={(e) => setExpanded(e.currentTarget.open)}
    >
      <summary>SparkLink · Shared QuickForge{session ? ' · active' : ''}</summary>
      <p className="subtle">
        Live Studio shares source geometry, placements, spawns, materials and environment. Each creator keeps
        their camera. Native tag edits and binary asset imports are not shared yet; game changes use separate
        verified adapters.
      </p>
      {restoring && <p role="status">Restoring session controls…</p>}
      {other ? (
        <Notice>
          A session is active for <strong>{other.projectTitle}</strong>. Open its map/window to manage it.
        </Notice>
      ) : !session ? (
        <>
          <label>
            Your name
            <input
              aria-label="Studio display name"
              maxLength={48}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
          <label>
            Editor connection
            <select
              aria-label="Editor connection"
              disabled={busy}
              value={transport}
              onChange={(e) => setTransport(e.target.value as Transport)}
            >
              <option value="lan">Private LAN / VPN · TLS</option>
              <option value="steamSpacewar">Steam · Spacewar test (480)</option>
            </select>
          </label>
          {transport === 'steamSpacewar' ? (
            <SteamSessionTools onReady={setSteamReady} />
          ) : (
            <>
              <label className="hosting-toggle">
                <input type="checkbox" checked={lan} onChange={(e) => setLan(e.target.checked)} /> Allow
                collaborators on a chosen private LAN / VPN address
              </label>
              <label>
                Host bind address
                <input
                  aria-label="Studio bind address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value.trim())}
                />
                <small>
                  127.0.0.1 is for this PC. Choose this PC's private LAN/VPN IPv4 address before hosting on
                  another PC.
                </small>
              </label>
            </>
          )}
          <label className="hosting-toggle">
            <input type="checkbox" checked={linkGame} onChange={(e) => setLinkGame(e.target.checked)} /> Link
            the invitation to the connected Halo map
          </label>
          <button
            disabled={
              !native || busy || !displayName.trim() || (transport === 'steamSpacewar' && !steamReady)
            }
            onClick={() =>
              void perform(async () => {
                await onSave();
                if (!active.current) return;
                const result = await call<Info>('forge_session_host', {
                  projectId,
                  document: portableForge(latest.current.doc),
                  lan,
                  transport,
                  linkGame,
                  studio: !legacy,
                  displayName,
                  bindAddress: address,
                });
                if (!active.current) return;
                setSession(result);
                sessionRef.current = result;
                setEndpoint(result.endpoint);
                setKey(result.key ?? '');
                blocked.current = false;
                setPaused(false);
                if (result.view) accept(result.view);
              })
            }
          >
            Host editing session
          </button>
          <div className="hosting-join">
            <label>
              Private Spark invite
              <textarea
                aria-label="Private Spark invite"
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
                rows={3}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <button
              disabled={!native || busy || !invite.trim()}
              onClick={() =>
                void perform(async () => {
                  await onSave();
                  if (!active.current) return;
                  const next = await call<View>('forge_session_join', {
                    projectId,
                    endpoint: '',
                    key: '',
                    transport,
                    invite: invite.trim(),
                    displayName,
                  });
                  if (!active.current) return;
                  const info = await call<Info>('forge_session_status', { projectId });
                  setSession(info);
                  sessionRef.current = info;
                  setEndpoint(info.endpoint);
                  setKey(info.key ?? '');
                  setTransport(info.transport);
                  blocked.current = false;
                  setPaused(false);
                  accept(next);
                  setInvite('');
                })
              }
            >
              Join private invite
            </button>
          </div>
          {!!history.length && (
            <details>
              <summary>Recover an acknowledged host session</summary>
              <p>
                Recovery keeps its source and author history. It uses a fresh private invitation; friends
                rejoin with their retained identities.
              </p>
              {history.map((row) => (
                <div className="studio-history-row" key={row.directoryId}>
                  <span>
                    {row.title} · {new Date(row.createdAt).toLocaleString()}
                  </span>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        await onSave();
                        const info = await call<Info>('forge_studio_recover', {
                          projectId,
                          directoryId: row.directoryId,
                          address,
                          displayName,
                        });
                        if (!active.current) return;
                        setSession(info);
                        sessionRef.current = info;
                        setEndpoint(info.endpoint);
                        setKey(info.key ?? '');
                        blocked.current = false;
                        setPaused(false);
                        if (info.view) accept(info.view);
                      })
                    }
                  >
                    Recover session
                  </button>
                </div>
              ))}
            </details>
          )}
          <details>
            <summary>Advanced · legacy address/key connection</summary>
            <p className="subtle">
              Legacy direct LAN traffic is unencrypted and its host is not durable. Modern sessions use the
              complete TLS invitation; there is no automatic downgrade.
            </p>
            <label>
              <input type="checkbox" checked={legacy} onChange={(e) => setLegacy(e.target.checked)} /> Host
              legacy cleartext LAN mode
            </label>
            <label>
              Host address
              <input
                aria-label="Shared editor address"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value.trim())}
              />
            </label>
            <label>
              Session key
              <input
                aria-label="Shared editor key"
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value.trim())}
                autoComplete="off"
              />
            </label>
            <button
              disabled={!native || busy || !endpoint || key.length !== 32}
              onClick={() =>
                void perform(async () => {
                  await onSave();
                  const next = await call<View>('forge_session_join', {
                    projectId,
                    endpoint,
                    key,
                    transport,
                    displayName,
                  });
                  if (!active.current) return;
                  const info = await call<Info>('forge_session_status', { projectId });
                  setSession(info);
                  sessionRef.current = info;
                  blocked.current = false;
                  setPaused(false);
                  accept(next);
                })
              }
            >
              Join and use shared map
            </button>
          </details>
        </>
      ) : (
        <>
          <p role="status">
            {paused
              ? 'Paused · local draft retained'
              : `${view?.peers ?? 1}/8 creators · shared revision ${view?.revision ?? 0}`}{' '}
            · {view?.role ?? session.role} ·{' '}
            {session.transport === 'steamSpacewar'
              ? 'Steam SDK'
              : view?.encrypted
                ? 'TLS 1.3'
                : 'Legacy cleartext'}
            {roundTrip !== null ? ` · ${roundTrip} ms response` : ''}
          </p>
          <div className="studio-people">
            {people.map((person) => (
              <div key={person.id}>
                <span className={person.online ? 'studio-online' : 'subtle'}>
                  {person.name} · {person.role}
                  {person.online ? '' : ' · offline'}
                </span>
                {session.role === 'host' && person.id !== 'host' && (
                  <>
                    <select
                      aria-label={`Role for ${person.name}`}
                      value={person.role}
                      disabled={busy}
                      onChange={(e) =>
                        void perform(async () => {
                          accept(
                            await call<View>('forge_session_role', {
                              projectId,
                              sessionId: session.sessionId,
                              participantId: person.id,
                              role: e.target.value,
                              revoke: false,
                            }),
                          );
                        })
                      }
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button
                      className="small-button"
                      disabled={busy}
                      onClick={() =>
                        void perform(async () => {
                          accept(
                            await call<View>('forge_session_role', {
                              projectId,
                              sessionId: session.sessionId,
                              participantId: person.id,
                              role: 'viewer',
                              revoke: true,
                            }),
                          );
                          setMessage(
                            'Participant revoked. Existing join invitations were rotated; copy new invitations for future joins.',
                          );
                        })
                      }
                    >
                      Revoke
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          {session.role === 'host' && (
            <div className="studio-invitation">
              <label>
                Private host IPv4
                <input
                  aria-label="Private host IPv4"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={viewerInvite}
                  onChange={(e) => setViewerInvite(e.target.checked)}
                />{' '}
                Invite as viewer
              </label>
              <div className="analysis-actions">
                <button disabled={busy} onClick={() => void perform(copyInvite)}>
                  Copy private invite
                </button>
                <button onClick={() => setShowKey(!showKey)}>{showKey ? 'Hide' : 'Show'} session key</button>
                {showKey && <code>{key}</code>}
              </div>
            </div>
          )}
          <div className="analysis-actions">
            <button disabled={busy || paused || !view?.canUndo} onClick={() => void reverse()}>
              Undo my shared edit
            </button>
            <button disabled={busy || paused || !view?.canRedo} onClick={() => void reverse(true)}>
              Redo my shared edit
            </button>
            <button onClick={() => exportDraft()}>Export local draft</button>
            {paused ? (
              <button disabled={busy} onClick={() => void perform(useShared)}>
                Use shared version and resume
              </button>
            ) : (
              <button
                disabled={busy}
                onClick={() => {
                  blocked.current = true;
                  setPaused(true);
                  setMessage('Sharing paused. Your local draft remains editable.');
                }}
              >
                Pause sharing
              </button>
            )}
            {pending.current && (
              <button disabled={busy} onClick={() => void perform(retry)}>
                Retry retained edit
              </button>
            )}
            <button
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  blocked.current = true;
                  await onSave();
                  queuedReverse.current = [];
                  await call('forge_session_leave', { projectId, sessionId: session.sessionId });
                  if (!active.current) return;
                  setSession(null);
                  sessionRef.current = null;
                  setView(null);
                  shared.current = null;
                  setKey('');
                  setInvite('');
                  setShowKey(false);
                  setPaused(false);
                  announceStudio(projectId, null);
                })
              }
            >
              Leave session
            </button>
          </div>
          {view?.game && (
            <p className="subtle">
              Linked map identity: {view.game.scenario}. Source synchronization does not certify in-game
              changes.
            </p>
          )}
          {!!view?.leases?.length && (
            <p className="subtle">
              Structure ownership:{' '}
              {view.leases
                .map(
                  (lease) =>
                    `${people.find((person) => person.id === lease.author)?.name ?? 'Creator'} · ${lease.target}`,
                )
                .join('; ')}
            </p>
          )}
          <details>
            <summary>Shared activity · {view?.history?.length ?? 0} recent transactions</summary>
            <ol>
              {view?.history?.map((row) => (
                <li key={row.id}>
                  r{row.revision} ·{' '}
                  {people.find((person) => person.id === row.author)?.name ?? row.author.slice(0, 8)} ·{' '}
                  {row.kind}
                </li>
              ))}
            </ol>
          </details>
          {differences.length > 0 && (
            <details open>
              <summary>Review local and authoritative differences</summary>
              <div className="studio-differences">
                {differences.map((row) => (
                  <div key={row.target}>
                    <code>{row.target}</code>
                    <span>Shared: {row.shared}</span>
                    <span>Mine: {row.mine}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
          <p className="subtle">
            {view?.durable
              ? 'The host journals accepted source before acknowledging it.'
              : 'This legacy host keeps its shared state in memory.'}{' '}
            Cameras and recording capture stay local. Native tags/assets and game replication are separate
            capabilities.
          </p>
        </>
      )}
      {retained && (
        <details>
          <summary>Retained unacknowledged local edit</summary>
          <p>
            Source for session {retained.sessionId.slice(0, 8)} is saved locally with its operation identity.
          </p>
          <div className="analysis-actions">
            <button onClick={() => exportDraft(retained.document)}>Export retained draft</button>
            <button
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  await clear(retained);
                  setMessage(
                    'Retained edit cleared by your request. Your current local draft and acknowledged shared source are unchanged.',
                  );
                })
              }
            >
              Clear retained edit
            </button>
            <button
              disabled={busy}
              onClick={() => {
                blocked.current = true;
                setPaused(true);
                latest.current.onShared(localForge(retained.document, latest.current.entries));
                setMessage(
                  'Restored the retained draft locally. Review it before retrying or joining another session.',
                );
              }}
            >
              Restore retained draft locally
            </button>
          </div>
        </details>
      )}
      {invite && session && (
        <textarea
          aria-label="Invite to copy"
          readOnly
          value={invite}
          rows={3}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
      {message && <p role="status">{message}</p>}
      {error && <Notice tone="error">{error}</Notice>}
      <p className="subtle">
        Keep invitations private. TLS pins the host certificate supplied in the invitation; names are chosen
        labels. No firewall rule, public listener, cloud account or game-file transfer is configured
        automatically.
      </p>
    </details>
  );
}
