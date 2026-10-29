import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { call, native } from '../api';
import type { OpenProject } from '../types';
import {
  ExternalMapSyncController,
  type ExternalMapDocument,
  type ExternalRevision,
  type ExternalRevisionMode,
  type ExternalWatchReport,
} from '../externalMapSync';
import { Notice } from './ui';
import{usePanelAttention}from'./WorkspacePanels';
import '../externalMapSync.css';

export default function ExternalMapSync({
  documents,
  onRevision,
}: {
  documents: ExternalMapDocument[];
  onRevision: (
    previousId: string,
    opened: OpenProject,
    mode: ExternalRevisionMode,
    watchedPath: string,
  ) => Promise<void> | void;
}) {
  const latest = useRef({ documents, onRevision });
  latest.current = { documents, onRevision };
  const controller = useRef<ExternalMapSyncController | null>(null);
  const [reports, setReports] = useState<Record<string, ExternalWatchReport>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [accepting, setAccepting] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [copyError, setCopyError] = useState('');
  useEffect(() => {
    if (!native) return;
    let alive = true;
    const instance = new ExternalMapSyncController(
      {
        start: (projectId) => call<ExternalWatchReport>('external_map_watch_start', { projectId }),
        poll: (watchId, forceMetadata = false) =>
          call<ExternalWatchReport>('external_map_watch_poll', { watchId, forceMetadata }),
        stop: (watchId) => call('external_map_watch_stop', { watchId }),
        import: (watchId, candidateSha256) =>
          call<ExternalRevision>('external_map_change_import', { watchId, candidateSha256 }),
      },
      {
        documents: () => latest.current.documents,
        report: (report) => {
          if (alive) {
            setReports((previous) =>
              previous[report.projectId]?.status === report.status &&
              previous[report.projectId]?.candidate?.sha256 === report.candidate?.sha256 &&
              previous[report.projectId]?.message === report.message
                ? previous
                : { ...previous, [report.projectId]: report },
            );
            setErrors((previous) =>
              !previous[report.projectId] ? previous : { ...previous, [report.projectId]: '' },
            );
          }
        },
        error: (id, message) => {
          if (alive) {
            setErrors((previous) => ({ ...previous, [id]: message }));
            setReports((previous) =>
              previous[id]
                ? { ...previous, [id]: { ...previous[id], status: 'error', candidate: null, message } }
                : previous,
            );
          }
        },
        revision: (id, opened, mode, path) => latest.current.onRevision(id, opened, mode, path),
      },
    );
    controller.current = instance;
    void instance.poll();
    const timer = setInterval(() => void instance.poll(), 2000);
    return () => {
      alive = false;
      clearInterval(timer);
      instance.dispose();
      controller.current = null;
    };
  }, []);
  if (!native) return null;
  const ids = new Set(documents.map((document) => document.project.id));
  const attention = Object.values(reports).filter(
    (report) => ids.has(report.projectId) && ['changed', 'incomplete', 'unavailable'].includes(report.status),
  );
  const failures = Object.entries(errors).filter(([id, message]) => ids.has(id) && message);
  const overLimit = documents.filter((document) => document.project.source).length > 32;
  usePanelAttention('source-changes',attention.length+failures.length);
  const mapped = documents.filter((document) => document.project.source);
  if (!mapped.length) return null;
  const watched = mapped.filter(
    (document) => reports[document.project.id] && reports[document.project.id].status !== 'error',
  ).length;
  const pending = Object.values(reports).filter(
    (report) => ids.has(report.projectId) && ['saving', 'changed', 'incomplete'].includes(report.status),
  ).length;
  async function copyPath(path: string) {
    try {
      await navigator.clipboard.writeText(path);
      setCopyError('');
    } catch {
      setCopyError('Clipboard unavailable. Select and copy the visible path.');
    }
  }
  return (
    <div className="external-map-sync" aria-label="External map changes" aria-live="polite">
      <div className="external-map-sync-status">
        <span>
          <strong>Changes from other editors</strong> · {watched} map{watched === 1 ? '' : 's'} monitored
          {watched < mapped.length ? ` · ${mapped.length - watched} starting / unavailable` : ''}
          {pending ? ` · ${pending} pending` : ''}
          {failures.length ? ` · ${failures.length} errors` : ''}
        </span>
        <button
          disabled={scanning || accepting !== null}
          onClick={async () => {
            setScanning(true);
            try {
              await controller.current?.poll(true);
            } finally {
              setScanning(false);
            }
          }}
        >
          <RefreshCw size={12} />
          {scanning ? 'Checking…' : 'Scan now'}
        </button>
      </div>
      <details>
        <summary>External editor files</summary>
        <p>
          Save this working map from HMT, Eschaton or another editor. Spark checks metadata every 2 seconds,
          waits for a stable save, then inspects changed bytes. Clean maps refresh as a new preserved
          revision; Spark authoring is kept separately. Loose SDK tag edits still need a map build.
        </p>
        {mapped.map((document) => (
          <div className="external-map-sync-paths" key={document.project.id}>
            <strong>{document.project.title}</strong>
            <span>{reports[document.project.id]?.status ?? 'Starting watcher'}</span>
            <label>
              Working map{' '}
              <code>{reports[document.project.id]?.path ?? document.project.source!.originalPath}</code>
              <button
                onClick={() =>
                  void copyPath(reports[document.project.id]?.path ?? document.project.source!.originalPath)
                }
              >
                Copy working path
              </button>
            </label>
            <label>
              Preserved copy (read-only) <code>{document.project.source!.preservedPath}</code>
              <button onClick={() => void copyPath(document.project.source!.preservedPath)}>
                Copy preserved path
              </button>
            </label>
          </div>
        ))}
        {copyError && <p role="status">{copyError}</p>}
      </details>
      {overLimit && (
        <Notice tone="info">
          External-save monitoring covers the first 32 open maps. Close a map to monitor another.
        </Notice>
      )}
      {attention.map((report) => (
        <Notice key={report.projectId} tone={report.status === 'changed' ? 'info' : undefined}>
          <strong>
            {documents.find((document) => document.project.id === report.projectId)?.project.title}
          </strong>{' '}
          · {report.message}
          {report.candidate && (
            <>
              <br />
              <small>
                {report.path} · {report.candidate.sha256.slice(0, 12)} · cache {report.candidate.cacheVersion}
              </small>
              <br />
              <button
                disabled={accepting !== null}
                onClick={async () => {
                  setAccepting(report.projectId);
                  try {
                    await controller.current?.accept(report);
                  } finally {
                    setAccepting(null);
                  }
                }}
              >
                <RefreshCw size={13} />
                {accepting === report.projectId
                  ? 'Opening external save…'
                  : 'Open changed map and keep Spark edits'}
              </button>
            </>
          )}
        </Notice>
      ))}
      {failures.map(([id, message]) => (
        <Notice key={id}>{message} Existing Spark edits and preserved source remain available.</Notice>
      ))}
    </div>
  );
}
