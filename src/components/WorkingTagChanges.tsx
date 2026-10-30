import { useEffect, useRef, useState } from 'react';
import { call, native } from '../api';
import { WorkingTagSync, type WorkingTagReport } from '../workingTagSync';
import { Notice } from './ui';
import NativeTagIntegrity from './NativeTagIntegrity';
export function useWorkingTagChanges(
  projectId: string | null,
  buildId: string | null,
  sourceIdentity: string | null = null,
) {
  const [report, setReport] = useState<WorkingTagReport | null>(null),
    [error, setError] = useState(''),
    [checking, setChecking] = useState(false);
  const controller = useRef<WorkingTagSync | null>(null);
  useEffect(() => {
    if (!native || !projectId || !buildId) {
      setReport(null);
      setError('');
      return;
    }
    let alive = true;
    setReport(null);
    setError('');
    const sync = new WorkingTagSync(
      projectId,
      buildId,
      {
        start: (projectId) => call('working_tag_watch_start', { projectId }),
        poll: (watchId, force) => call('working_tag_watch_poll', { watchId, force }),
        stop: (watchId) => call('working_tag_watch_stop', { watchId }),
      },
      (next) => {
        if (alive) {
          setReport(next);
        }
      },
      (message) => {
        if (alive) {
          setError(message);
        }
      },
    );
    controller.current = sync;
    void sync.poll();
    const timer = setInterval(() => void sync.poll(), 3000);
    return () => {
      alive = false;
      clearInterval(timer);
      sync.dispose();
      controller.current = null;
    };
  }, [projectId, buildId, sourceIdentity]);
  const scan = async () => {
    setChecking(true);
    try {
      await controller.current?.poll(true);
    } finally {
      setChecking(false);
    }
  };
  return {
    report: report?.projectId === projectId && report.buildId === buildId ? report : null,
    error,
    checking,
    scan,
  };
}
export default function WorkingTagChanges({
  report,
  error,
  checking,
  scan,
}: ReturnType<typeof useWorkingTagChanges>) {
  return (
    <section className="working-tag-changes" aria-label="Saved tool tag changes" aria-live="polite">
      <div className="button-row">
        <strong>Saved tool edits</strong>
        <span>
          {error
            ? 'Monitoring unavailable'
            : !report
              ? 'Connecting…'
              : report.status === 'saving'
                ? 'Waiting for a stable save…'
                : report.changedFiles
                  ? `${report.changedFiles} changed tag file${report.changedFiles === 1 ? '' : 's'}`
                  : `Watching ${report.totalFiles.toLocaleString()} tag files`}
        </span>
        <button disabled={checking} onClick={() => void scan()}>
          {checking ? 'Checking…' : 'Scan tool tags now'}
        </button>
      </div>
      <p className="subtle">
        {report?.basis === 'compiledBuild'
          ? 'Compared with this build’s verified tag inventory.'
          : report?.basis === 'acceptedNativeRevision'
            ? 'Compared with the accepted native source revision.'
            : 'Changes are compared with the files present when monitoring connected.'}{' '}
        Save notifications are checked every 3 seconds. A bounded background hash sweep also catches missed
        notifications and preserved timestamps; its detection delay depends on library size. Build working tag
        edits to compile a separate map, then open its result. The current cache and Spark draft are retained.
      </p>
      {report?.contentAudit && (
        <details>
          <summary>Background content checks · {report.contentAudit.completedSweeps} sweeps</summary>
          <p className="subtle">
            Last pass: {report.contentAudit.filesCheckedLastPoll} files,{' '}
            {(report.contentAudit.bytesReadLastPoll / 1048576).toFixed(1)} MiB read. Limits: 64 files / 8 MiB
            per poll, at most once every 2 seconds. A completed sweep is a byte check, not semantic or
            gameplay certification. Builds verify the complete source separately.
          </p>
        </details>
      )}
      {error && <Notice>{error}</Notice>}
      <NativeTagIntegrity
        report={report?.integrity}
        writerContext={report?.writerContext}
        evidence={report?.writerEvidence}
      />
      {!!report?.changes.length && (
        <details>
          <summary>
            Review {report.changedFiles} changed file{report.changedFiles === 1 ? '' : 's'}
          </summary>
          <ul>
            {report.changes.map((change) => (
              <li key={change.path}>
                <span>{change.kind}</span> <code>{change.path}</code>
              </li>
            ))}
          </ul>
          {report.listTruncated && <p>Showing the first 128 files. The total includes all changes.</p>}
        </details>
      )}
    </section>
  );
}
