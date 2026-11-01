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
  type WorkshopTransform,
} from '../studioClient';
import { Notice } from './ui';
import SteamSessionTools from './SteamSessionTools';
import StudioNativeContent from './StudioNativeContent';
import { studioRetryDelay } from '../studioRetry';
import { retainedStudioProposal, studioJoinDraft } from '../studioPending';
import { semanticJson } from '../semanticJson';
import { WorkspacePanel, useRevealWorkspacePanel } from './WorkspacePanels';
import '../hosting.css';
import './studio.css';
type Transport = 'lan' | 'steamSpacewar';
type NetworkInterface = {
  label: string;
  address: string;
  prefixLength: number;
  networkScope: 'private' | 'radminVpn';
};
export default function ForgeCollaboration({
  projectId,
  document: doc,
  entries,
  onShared,
  onSave,
  hidden = false,
}: {
  hidden?: boolean;
  projectId: string;
  document: QuickForgeDocument;
  entries: LibraryEntry[];
  onShared: (document: QuickForgeDocument) => void;
  onSave: () => Promise<void>;
}) {
  const reveal = useRevealWorkspacePanel();
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
  const [networks, setNetworks] = useState<NetworkInterface[]>([
    { label: 'Only this computer', address: '127.0.0.1', prefixLength: 8, networkScope: 'private' },
  ]);
  const [manualAddress, setManualAddress] = useState(false),
    [networkError, setNetworkError] = useState('');
  const retryAttempt = useRef(0);
  const dragPreview = useRef<{ brush: WorkshopTransform | null; sequence: number } | null>(null),
    previewSequence = useRef(0),
    sentPreviewSequence = useRef(0);
  useEffect(() => {
    const changed = (event: Event) => {
      const d = (event as CustomEvent<{ projectId: string; brush: WorkshopTransform | null }>).detail;
      if (d?.projectId === projectId)
        dragPreview.current = { brush: d.brush, sequence: ++previewSequence.current };
    };
    window.addEventListener('guilty-spark-workshop-drag', changed);
    return () => {
      dragPreview.current = null;
      window.removeEventListener('guilty-spark-workshop-drag', changed);
    };
  }, [projectId]);
  const latest = useRef({ doc, entries, onShared });
  latest.current = { doc, entries, onShared };
  const shared = useRef<View | null>(null),
    pending = useRef<Pending | null>(null),
    pendingLoaded = useRef(!native),
    pendingParked = useRef(false),
    blocked = useRef(false),
    accepting = useRef<string | null>(null),
    active = useRef(true),
    inFlight = useRef(false),
    nextPollAfter = useRef(0),
    actionRequest = useRef<number | null>(null),
    queuedReverse = useRef<{ sessionId: string; redo: boolean }[]>([]),
    drainReverse = useRef<() => void>(() => {}),
    operation = useRef(0),
    sessionRef = useRef<Info | null>(null);
  sessionRef.current = session;
  useEffect(() => {
    dragPreview.current = null;
    previewSequence.current = 0;
    sentPreviewSequence.current = 0;
    retryAttempt.current = 0;
    nextPollAfter.current = 0;
  }, [projectId, session?.sessionId]);
  const json = (d: QuickForgeDocument) => semanticJson(portableForge(d))!;
  const busy = working || restoring;
  async function refreshNetworks() {
    if (!native) return;
    try {
      const list = await call<NetworkInterface[]>('forge_session_networks');
      if (active.current) {
        setNetworks(list);
        setNetworkError('');
      }
    } catch (e) {
      if (active.current) {
        setNetworkError(String(e));
        setManualAddress(true);
      }
    }
  }
  useEffect(() => {
    if (expanded && transport === 'lan') void refreshNetworks();
  }, [expanded, transport, projectId]);
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
    pendingLoaded.current = !native;
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
            pendingLoaded.current = true;
            if (shared.current)
              pendingParked.current = studioJoinDraft(
                shared.current.sessionId,
                shared.current.document,
                latest.current.doc,
                value,
              ).parked;
            setRetained(value);
          }
        },
        (reason) => {
          if (!cancelled) {
            blocked.current = true;
            setPaused(true);
            setError('Pending source could not be restored. Sharing is paused: ' + String(reason));
          }
        },
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
      if ((e as CustomEvent<{ projectId: string }>).detail?.projectId === projectId) {
        setExpanded(true);
        reveal('sparklink');
      }
    };
    window.addEventListener('guilty-spark-live-studio-open', open);
    if (readMapSession(projectId, 'studio.openRequest', false)) {
      setExpanded(true);
      reveal('sparklink');
    }
    return () => window.removeEventListener('guilty-spark-live-studio-open', open);
  }, [projectId]);
  async function clear(packet: Pending) {
    await call('forge_studio_clear_pending', { projectId, operationId: packet.operationId });
    if (pending.current?.operationId === packet.operationId) {
      pending.current = null;
      pendingParked.current = false;
      if (active.current) setRetained(null);
    }
  }
  async function tick() {
    if (
      inFlight.current ||
      !pendingLoaded.current ||
      performance.now() < nextPollAfter.current ||
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
    let previewOnly = false;
    try {
      const before = shared.current;
      let sent = portableForge(latest.current.doc);
      const changed = json(sent) !== json(before.document);
      let next: View;
      if (pendingParked.current && changed)
        throw Error(
          'Review, restore or clear the retained pending edit before sharing new changes. The local draft remains retained.',
        );
      if (changed || (pending.current && !pendingParked.current)) {
        if (before.role === 'viewer')
          throw Error('This is a viewer session. The local draft is retained; shared content is unchanged.');
        const packet = retainedStudioProposal(id, before.revision, sent, pending.current, () =>
          crypto.randomUUID(),
        );
        if (!pending.current) {
          await call('forge_studio_save_pending', { projectId, pending: packet });
          pending.current = packet;
          setRetained(packet);
        }
        sent = packet.document;
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
      } else if (
        dragPreview.current &&
        dragPreview.current.sequence !== sentPreviewSequence.current &&
        before.role !== 'viewer'
      ) {
        previewOnly = true;
        const packet = dragPreview.current;
        next = await call<View>('forge_session_preview', {
          projectId,
          sessionId: id,
          revision: before.revision,
          brush: packet.brush,
        });
        sentPreviewSequence.current = packet.sequence;
      } else next = await call<View>('forge_session_poll', { projectId, sessionId: id });
      if (!active.current || next.sessionId !== id) return;
      setRoundTrip(Math.round(performance.now() - began));
      const newer = portableForge(latest.current.doc);
      accept(next, mergeForge(sent, newer, next.document));
      retryAttempt.current = 0;
      setError('');
      setRemoteConflict(null);
    } catch (e) {
      if (
        previewOnly &&
        /preview brush|Invalid\/out-of-bounds transform|Invalid Workshop|Invalid.*preview/i.test(String(e))
      ) {
        sentPreviewSequence.current = dragPreview.current?.sequence ?? sentPreviewSequence.current;
        if (active.current)
          setMessage(
            'This transient drag preview is outside the supported bounds. The acknowledged source is retained.',
          );
        return;
      }
      if (String(e).includes('SparkLink request rate exceeded')) {
        nextPollAfter.current = performance.now() + 1250;
        if (active.current)
          setMessage('Session busy · retaining the pending operation and retrying shortly.');
        return;
      }
      const delay = studioRetryDelay(e, retryAttempt.current);
      if (delay !== null && active.current) {
        retryAttempt.current++;
        nextPollAfter.current = performance.now() + delay;
        setError('');
        setMessage(
          `Connection interrupted · retry ${retryAttempt.current}/6 in ${delay / 1000}s. Your draft and pending operation are retained.`,
        );
        return;
      }
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
    pendingParked.current = !!pending.current;
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
    const localDraft = pendingParked.current ? packet.document : portableForge(latest.current.doc);
    await clear(packet);
    if (active.current) {
      accept(next, mergeForge(packet.document, localDraft, next.document));
      blocked.current = false;
      setPaused(false);
      setRemoteConflict(null);
    }
  }
  const people = view?.participants ?? [],
    differences = remoteConflict ? studioDifferences(latest.current.doc, remoteConflict.document) : [];
  if (hidden) return null;
  return (
    <WorkspacePanel id="sparklink" label="SparkLink">
      <details
        className="forge-live-panel studio-panel"
        open={expanded}
        onToggle={(e) => setExpanded(e.currentTarget.open)}
      >
        <summary>SparkLink · Shared source{session ? ' · active' : ''}</summary>
        <p className="subtle">
          Live Studio shares BSP brushes, source geometry, placements, spawns, materials and environment. Each
          creator keeps their camera. Admitted native fields and complete scenery assets share the same
          revision; game changes use separate verified adapters.
        </p>
        <StudioNativeContent
          projectId={projectId}
          document={doc}
          entries={entries}
          connected={!!session}
          viewer={view?.role === 'viewer'}
          onChange={onShared}
        />
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
                  Session network
                  <select
                    aria-label="Session network"
                    disabled={busy}
                    value={manualAddress || !networks.some((n) => n.address === address) ? 'manual' : address}
                    onChange={(e) => {
                      if (e.target.value === 'manual') {
                        setManualAddress(true);
                      } else {
                        setManualAddress(false);
                        setAddress(e.target.value);
                      }
                    }}
                  >
                    {networks.map((n) => (
                      <option key={n.address} value={n.address}>
                        {n.label} · {n.address}
                      </option>
                    ))}
                    <option value="manual">Enter a private address…</option>
                  </select>
                </label>
                <button type="button" disabled={busy} onClick={() => void refreshNetworks()}>
                  Refresh networks
                </button>
                {(manualAddress || !networks.some((n) => n.address === address)) && (
                  <label>
                    Host bind address
                    <input
                      aria-label="Studio bind address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value.trim())}
                    />
                    <small>
                      127.0.0.1 is for this PC. Choose this PC's private LAN/VPN IPv4 address before hosting
                      on another PC.
                    </small>
                  </label>
                )}
                {networkError && <small>{networkError}</small>}
              </>
            )}
            <label className="hosting-toggle">
              <input type="checkbox" checked={linkGame} onChange={(e) => setLinkGame(e.target.checked)} />{' '}
              Link the invitation to the connected Halo map
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
                    const retained = await call<Pending | null>('forge_studio_pending', { projectId });
                    if (!active.current) return;
                    pending.current = retained;
                    pendingLoaded.current = true;
                    setRetained(retained);
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
                    const resumed = studioJoinDraft(
                      next.sessionId,
                      next.document,
                      latest.current.doc,
                      pending.current,
                    );
                    pendingParked.current = resumed.parked;
                    accept(next, resumed.document);
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
                {transport === 'steamSpacewar' && (
                  <p>
                    Steam recovery is not yet verified. Select Private LAN / VPN to recover the retained
                    source session.
                  </p>
                )}
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
                      disabled={busy || transport === 'steamSpacewar'}
                      onClick={() =>
                        void perform(async () => {
                          await onSave();
                          const info = await call<Info>('forge_studio_recover', {
                            projectId,
                            directoryId: row.directoryId,
                            address,
                            displayName,
                            transport,
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
              {view?.operationLimit
                ? ` · ${view.acknowledgedOperations ?? 0}/${view.operationLimit} acknowledged operations`
                : ''}
            </p>
            {view?.operationLimit && view.operationLimit - (view.acknowledgedOperations ?? 0) < 256 && (
              <Notice>
                This session is nearing its acknowledged-operation limit. Save the converged source and host a
                fresh session before it fills. Current source, author history and pending drafts remain
                retained; the limit is not silently bypassed.
              </Notice>
            )}
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
                {session.transport === 'lan' && (
                  <label>
                    Private host IPv4
                    <input
                      aria-label="Private host IPv4"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                  </label>
                )}
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
                  <button onClick={() => setShowKey(!showKey)}>
                    {showKey ? 'Hide' : 'Show'} session key
                  </button>
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
              Source for session {retained.sessionId.slice(0, 8)} is saved locally with its operation
              identity.
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
                  pendingParked.current = false;
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
    </WorkspacePanel>
  );
}
