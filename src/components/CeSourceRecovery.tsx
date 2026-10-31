import { useEffect, useRef, useState } from 'react';
import { call, native } from '../api';
import { useMapState, writeMapSession } from '../mapSession';
import type { EngineBuildTarget, Project } from '../types';
import './ceSourceRecovery.css';

interface Correction {
  tag: string;
  fields: number;
  explanation: string;
}
interface Review {
  planId: string;
  projectId: string;
  targetId: string;
  files: number;
  sourceTags: string;
  corrections: Correction[];
}
interface Status {
  jobId: string;
  projectId: string;
  targetId: string;
  status: 'copying' | 'ready' | 'failed';
  message: string;
  tagsDirectory: string | null;
  receiptPath: string | null;
}
export default function CeSourceRecovery({
  project,
  target,
  onSave,
  onUse,
}: {
  project: Project;
  target: EngineBuildTarget;
  onSave: () => Promise<void>;
  onUse: (tags: string) => void;
}) {
  const [review, setReview] = useState<Review | null>(null),
    [status, setStatus] = useState<Status | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const scope = useRef(0);
  const jobKey = `ce-recovery.${target.id}`;
  const [jobId, setJobId] = useMapState<string | null>(project.id, jobKey, null);
  useEffect(() => {
    scope.current++;
    setReview(null);
    setStatus(null);
    setError('');
    setBusy(false);
    return () => {
      scope.current++;
    };
  }, [project.id, target.id, target.tagsDirectory, target.invaderDirectory, project.activeBuildTarget]);
  useEffect(() => {
    if (!native || !jobId) return;
    let alive = true,
      running = false,
      terminal = false;
    const poll = async () => {
      if (running || terminal) return;
      running = true;
      try {
        const next = await call<Status>('ce_source_recovery_status', {
          projectId: project.id,
          jobId,
        });
        if (next.projectId !== project.id || next.targetId !== target.id)
          throw Error('Source recovery belongs to a different target.');
        if (alive) {
          setStatus(next);
          if (next.status !== 'copying') {
            terminal = true;
            clearInterval(timer);
          }
        }
      } catch (e) {
        if (alive) {
          setError(String(e));
          terminal = true;
          clearInterval(timer);
        }
      } finally {
        running = false;
      }
    };
    const timer = setInterval(() => void poll(), 2000);
    void poll();
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [project.id, target.id, jobId]);
  async function action(work: () => Promise<void>) {
    const token = scope.current;
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (e) {
      if (token === scope.current) setError(String(e));
    } finally {
      if (token === scope.current) setBusy(false);
    }
  }
  return (
    <details className="ce-source-recovery" aria-label="Stock CE source recovery">
      <summary>Stock CE source recovery · optional</summary>
      <p>
        For the exact known extracted stock tags rejected by Invader. Creates a separate copy; changes three
        tags and seven fields. This changes behaviour and is not lossless.
      </p>
      <button
        className="small-button"
        disabled={
          !native ||
          busy ||
          status?.status === 'copying' ||
          project.activeBuildTarget !== target.id ||
          !target.tagsDirectory
        }
        onClick={() =>
          void action(async () => {
            const token = scope.current;
            await onSave();
            const next = await call<Review>('prepare_ce_source_recovery', {
              projectId: project.id,
              targetId: target.id,
            });
            if (token === scope.current) {
              setReview(next);
              setStatus(null);
              setJobId(null);
            }
          })
        }
      >
        Review known CE corrections
      </button>
      {project.activeBuildTarget !== target.id && <small>Select this CE target first.</small>}
      {review && (
        <>
          <p>
            {review.files.toLocaleString()} source files checked. Review each correction before creating a
            copy.
          </p>
          <ul>
            {review.corrections.map((c) => (
              <li key={c.tag}>
                <strong>
                  {c.fields} field{c.fields === 1 ? '' : 's'} · {c.tag.split('/').at(-1)}
                </strong>
                <span>{c.explanation}</span>
              </li>
            ))}
          </ul>
          <button
            className="small-button"
            disabled={busy}
            onClick={() =>
              void action(async () => {
                const token = scope.current;
                const next = await call<Status>('create_ce_source_recovery', {
                  planId: review.planId,
                  confirmed: true,
                });
                writeMapSession(project.id, jobKey, next.jobId);
                if (token === scope.current) {
                  setJobId(next.jobId);
                  setStatus(next);
                  setReview(null);
                }
              })
            }
          >
            Create separate corrected CE tagset
          </button>
        </>
      )}
      {status && <p role="status">{status.message}</p>}
      {status?.status === 'ready' && status.tagsDirectory && (
        <>
          <button
            className="small-button"
            disabled={busy}
            onClick={() =>
              void action(async () => {
                const token = scope.current;
                await onSave();
                const checked = await call<Status>('check_ce_source_recovery', {
                  projectId: project.id,
                  jobId: status.jobId,
                });
                if (token === scope.current && checked.tagsDirectory) {
                  setJobId(null);
                  setStatus(null);
                  onUse(checked.tagsDirectory);
                }
              })
            }
          >
            Use corrected source for this CE target
          </button>
          <small>
            Native compilation and an in-game test are still required. Originals, tool reports and hashes are
            retained with the copy.
          </small>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
