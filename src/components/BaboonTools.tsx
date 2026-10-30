import { useCallback, useEffect, useRef, useState } from 'react';
import { call, native } from '../api';
import type { Project } from '../types';
import { Notice, Pill } from './ui';
import { baboonReleaseUrl, type BaboonDashboard, type BaboonPoll, type BaboonReconciled } from '../baboon';
import './baboonTools.css';
import NativeTagIntegrity from './NativeTagIntegrity';
import ToolFindings from './ToolFindings';
import { integrityBlocks } from '../nativeTagIntegrity';

/** One registration; each map receives its own native source and portable kit context. */
export default function BaboonTools({
  project = null,
  tagId,
  dirty = false,
  epoch = 0,
}: {
  project?: Project | null;
  tagId?: number;
  dirty?: boolean;
  epoch?: number;
}) {
  const [report, setReport] = useState<BaboonDashboard | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [observed, setObserved] = useState<BaboonPoll | null>(null);
  const [review, setReview] = useState<BaboonReconciled | null>(null);
  const [busy, setBusy] = useState(false),
    [expanded, setExpanded] = useState(false);
  const [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const generation = useRef(0),
    lastIntegrity = useRef(''),
    projectId = project?.id ?? null;
  const refresh = useCallback(async () => {
    if (!native) return;
    const version = generation.current;
    try {
      const next = await call<BaboonDashboard>('baboon_report', { projectId });
      if (version !== generation.current) return;
      setReport(next);
      setSessionId(next.sessionId);
    } catch (e) {
      if (version === generation.current) setError(String(e));
    }
  }, [projectId]);
  useEffect(() => {
    generation.current++;
    setObserved(null);
    setReview(null);
    setReport(null);
    setSessionId(null);
    setError('');
    setMessage('');
    setBusy(false);
    void refresh();
    return () => {
      generation.current++;
    };
  }, [projectId, tagId, epoch, project?.builds.length, refresh]);
  useEffect(() => {
    if (
      !native ||
      (!expanded &&
        !observed?.running &&
        observed?.changes.status !== 'saving' &&
        !observed?.integrity?.pendingFiles) ||
      !sessionId ||
      !projectId
    )
      return;
    let stopped = false,
      pending = false;
    const version = generation.current;
    const poll = async () => {
      if (pending) return;
      pending = true;
      try {
        const result = await call<BaboonPoll>('baboon_poll', { projectId, sessionId });
        if (!stopped && version === generation.current) {
          setObserved(result);
          const signature = JSON.stringify([projectId, sessionId, result.integrity, result.writerContext]);
          if (signature !== lastIntegrity.current) {
            lastIntegrity.current = signature;
            window.dispatchEvent(
              new CustomEvent('guilty-spark-tag-integrity', {
                detail: {
                  projectId,
                  sessionId,
                  integrity: result.integrity,
                  writerContext: result.writerContext,
                },
              }),
            );
            if (result.integrity?.invalidFiles) setExpanded(true);
          }
        }
      } catch (e) {
        if (!stopped && version === generation.current) setError(String(e));
      } finally {
        pending = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [
    expanded,
    sessionId,
    projectId,
    observed?.running,
    observed?.changes.status,
    observed?.integrity?.pendingFiles,
  ]);
  async function perform(work: () => Promise<void>) {
    const version = generation.current;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
    } catch (e) {
      if (version === generation.current) setError(String(e));
    } finally {
      if (version === generation.current) setBusy(false);
    }
  }
  async function register() {
    const version = generation.current;
    await perform(async () => {
      const directory = await call<string | null>('choose_setting_path', { key: 'baboonDirectory' });
      if (!directory || version !== generation.current) return;
      await call('baboon_register', { directory });
      if (version !== generation.current) return;
      await refresh();
      if (version === generation.current)
        setMessage('Verified the Baboon executable and matching Halo 1 definitions. No tag has been opened.');
    });
  }
  async function open() {
    if (!projectId || dirty) return;
    const version = generation.current;
    await perform(async () => {
      const prepared = await call<{ sessionId: string; tag: string; files: number }>('baboon_prepare', {
        projectId,
        tagId: tagId ?? null,
      });
      if (version !== generation.current) return;
      setSessionId(prepared.sessionId);
      setReview(null);
      const result = await call<BaboonPoll>('baboon_launch', { projectId, sessionId: prepared.sessionId });
      if (version !== generation.current) return;
      setObserved(result);
      await refresh();
      if (version === generation.current)
        setMessage(
          `Sent ${prepared.tag} to Baboon in this map’s isolated editing kit (${prepared.files} native files). Save there, then keep the stable changes below.`,
        );
    });
  }
  async function reconcile() {
    if (!projectId || !sessionId || dirty) return;
    const version = generation.current;
    await perform(async () => {
      const result = await call<BaboonReconciled>('baboon_reconcile', { projectId, sessionId });
      if (version !== generation.current) return;
      setReview(result);
      setMessage(result.reason);
      const observed = await call<BaboonPoll>('baboon_poll', { projectId, sessionId });
      if (version === generation.current) setObserved(observed);
    });
  }
  async function restore() {
    if (!projectId || !sessionId || dirty) return;
    const version = generation.current;
    await perform(async () => {
      const message = await call<string>('baboon_restore_start', { projectId, sessionId });
      if (version === generation.current) setMessage(message);
    });
  }
  return (
    <details className="baboon-tools" onToggle={(e) => setExpanded(e.currentTarget.open)}>
      <summary>
        Baboon · native tag editing{' '}
        <Pill tone={report?.installed ? 'green' : 'muted'}>
          {report?.installed ? `Verified ${report.installed.version}` : 'Set up'}
        </Pill>
      </summary>
      <p>
        Full loose-tag editing by Zoephie’s Baboon and blam-tags. Spark keeps a starting source copy, watches
        saved changes and builds a new working revision.
      </p>
      {!native && (
        <Notice tone="info">Open the Windows desktop app to inspect and launch an installed editor.</Notice>
      )}
      <div className="button-row">
        <a href={baboonReleaseUrl} target="_blank" rel="noreferrer">
          Official Baboon release &amp; setup
        </a>
        <button type="button" disabled={!native || busy} onClick={() => void register()}>
          Choose Baboon folder
        </button>
        <button type="button" disabled={!native || busy} onClick={() => void refresh()}>
          Recheck
        </button>
      </div>
      {!report?.installed && (
        <p className="subtle">
          Extract the complete Windows 0.3.2 portable ZIP. Keep its definitions folder beside Baboon.exe, then
          choose that folder. Spark downloads no software automatically.
        </p>
      )}
      {report?.setupIssue && <Notice tone="info">{report.setupIssue}</Notice>}
      {report?.sourceIssue && (
        <Notice tone="info">
          {report.sourceIssue} Legacy Demo/Mac caches remain available in Spark’s integrated editor and
          compatible classic companions.
        </Notice>
      )}
      {projectId && (
        <button
          type="button"
          disabled={!native || busy || dirty || !report?.sourceReady || !report?.installed}
          onClick={() => void open()}
        >
          {busy
            ? 'Preparing native source…'
            : tagId != null
              ? 'Edit this tag with Baboon'
              : 'Open this map’s scenario in Baboon'}
        </button>
      )}
      {dirty && (
        <p className="subtle">
          Save and build the current map before handing its tags to another editor. Your Spark draft stays
          open.
        </p>
      )}
      {report?.sessions && report.sessions.length > 1 && (
        <label>
          Previous handoff{' '}
          <select
            value={sessionId ?? ''}
            onChange={(e) => {
              setSessionId(e.target.value || null);
              setObserved(null);
              setReview(null);
            }}
          >
            {report.sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.tag} · {s.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
      )}
      {observed && (
        <div className="baboon-saved-changes" aria-live="polite">
          <NativeTagIntegrity report={observed.integrity} writerContext={observed.writerContext} />
          {observed.changes.changedFiles > 0 && (
            <Notice>
              External editor rewrite: this save may include changes beyond the field you edited. Spark
              accepts complete files and cannot certify every native field. Review the saved files before
              keeping them. Your starting source is retained; Restore starting source creates a separate
              recovery revision.
            </Notice>
          )}
          <strong>{observed.tag}</strong>
          <p>
            {observed.running ? 'Baboon is open' : 'Baboon is closed'} ·{' '}
            {observed.changes.status === 'saving'
              ? 'Waiting for a stable save'
              : `${observed.changes.changedFiles} saved native file changes`}{' '}
            · {observed.revisions.length} retained working revisions
          </p>
          {observed.changes.changes.length > 0 && (
            <ul>
              {observed.changes.changes.slice(0, 8).map((c) => (
                <li key={c.path}>
                  {c.kind} · {c.path}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            disabled={
              busy ||
              dirty ||
              integrityBlocks(observed.integrity) ||
              observed.changes.status === 'saving' ||
              observed.changes.changedFiles === 0
            }
            onClick={() => void reconcile()}
          >
            Keep saved changes as a new working revision
          </button>
          <button type="button" disabled={busy || dirty} onClick={() => void restore()}>
            Restore starting source to a new revision
          </button>
          <p className="subtle">
            Close native editors, then use Runtime &amp; Tools → Build working tag edits. The preserved map
            and previous compiled build stay available.
          </p>
        </div>
      )}
      {review && !review.accepted && review.review.changes.length > 0 && (
        <Notice>
          {review.reason}
          <ul>
            {review.review.changes
              .filter((c) => c.conflict || c.requiresNativeReview)
              .slice(0, 8)
              .map((c) => (
                <li key={c.path}>
                  {c.path} ·{' '}
                  {c.conflict ? 'both tools changed this file' : 'native scenario/BSP/source review required'}
                </li>
              ))}
          </ul>
        </Notice>
      )}
      {message && <p role="status">{message}</p>}
      {error && <Notice>{error}</Notice>}
      <details>
        <summary>Compatibility and recovery details</summary>
        <ToolFindings/>
        <p>
          Verified Windows executable identity and matching definitions. The current Spark handoff targets MCC
          Halo 1 loose tags; it does not open arbitrary compiled .map files. Starting copies and new revisions
          remain in this map’s native handoff job. No Halo tag fields are added by Spark.
        </p>
        {report?.installed && (
          <>
            <p>
              Executable: <code>{report.installed.executable}</code> · {report.installed.version}
            </p>
            <p>
              Executable SHA-256: <code>{report.installed.executableSha256}</code>
            </p>
            <p>
              Definitions SHA-256: <code>{report.installed.definitionsSha256}</code>
            </p>
          </>
        )}
        <p className="subtle">
          Baboon also declares these editing-kit contexts:{' '}
          {report?.compatibleKits.map((k) => k.names.join('/')).join(', ')}. Those declarations are separate
          from Spark’s tested handoff and game-runtime support.
        </p>
      </details>
    </details>
  );
}
