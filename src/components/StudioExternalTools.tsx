import { useEffect, useRef, useState } from 'react';
import { call, native } from '../api';
import { useMapState } from '../mapSession';
import type { QuickForgeDocument } from '../forge';
import { Notice } from './ui';

interface Context {
  id: string;
  tagsDirectory: string;
  tag: string;
  beforeRadius: number;
  revision: number;
  sourceSha256: string;
  candidateSha256: string;
  baselineSha256: string;
}
interface Review {
  id: string;
  sourceSha256: string;
  candidateSha256: string;
  beforeRadius: number;
  boundingRadius: number;
  changed: boolean;
  revision: number;
  serialization: 'exactNativeReplay' | 'equivalentNativeSerialization';
  detail: string;
}
/** Local tool forks never enter the peer transport. Only an explicitly reviewed
 * supported field is proposed through the existing ordered source controller. */
export default function StudioExternalTools({
  projectId,
  document: doc,
  connected,
  viewer,
  onChange,
}: {
  projectId: string;
  document: QuickForgeDocument;
  connected: boolean;
  viewer: boolean;
  onChange: (doc: QuickForgeDocument) => void;
}) {
  const [id, setId] = useMapState(projectId, 'studio.external.id', '');
  const [context, setContext] = useState<Context | null>(null),
    [review, setReview] = useState<Review | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const latest = useRef(doc);
  latest.current = doc;
  const observed = useRef(''),
    checked = useRef(''),
    queued = useRef(''),
    working = useRef(false);
  async function inspect(candidateId: string) {
    const value = await call<Review>('studio_external_review', { projectId, id: candidateId });
    setReview(value);
    setError('');
    return value;
  }
  useEffect(() => {
    if (!native || !id) return;
    let active = true;
    observed.current = '';
    checked.current = '';
    queued.current = '';
    setContext(null);
    setReview(null);
    async function poll() {
      if (working.current) return;
      working.current = true;
      try {
        const value = await call<Context>('studio_external_status', { projectId, id });
        if (!active) return;
        setContext(value);
        if (
          connected &&
          !viewer &&
          value.candidateSha256 !== value.baselineSha256 &&
          value.candidateSha256 === observed.current &&
          value.candidateSha256 !== checked.current &&
          value.candidateSha256 !== queued.current
        ) {
          checked.current = value.candidateSha256;
          const result = await call<Review>('studio_external_review', { projectId, id });
          if (active) {
            setReview(result);
            setError('');
          }
        }
        observed.current = value.candidateSha256;
      } catch (reason) {
        if (active) {
          setReview(null);
          setError(String(reason));
        }
      } finally {
        working.current = false;
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [projectId, id, connected, viewer]);
  async function run(action: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (reason) {
      setError(String(reason));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return (
    <details className="studio-external-tools">
      <summary>External editor · shared native field</summary>
      <p className="subtle">
        Keep editing together while a compatible native editor changes a private tag copy. This handoff
        currently merges pistol bounding radius; other changes stay in the retained fork for separate review.
      </p>
      <button
        disabled={!native || !connected || viewer || busy}
        onClick={() =>
          void run(async () => {
            const value = await call<Context>('studio_external_prepare', { projectId });
            setId(value.id);
            setContext(value);
            setReview(null);
            setMessage(
              'Private native source prepared. Open the tag below in your compatible native editor.',
            );
          })
        }
      >
        {context ? 'Prepare new tool fork' : 'Prepare tool fork'}
      </button>
      {context && (
        <>
          <label>
            External native tag
            <input
              aria-label="Shared external native tag"
              readOnly
              value={`${context.tagsDirectory.replace(/[/\\]$/, '')}/${context.tag}`}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <p className="subtle">
            Forked from shared revision {context.revision}. Saved files are checked every two seconds; a
            stable change is reviewed once. Writer identity is unknown unless a tool launch was explicitly
            observed.
          </p>
          <button
            disabled={!connected || viewer || busy}
            onClick={() =>
              void run(async () => {
                const result = await inspect(id);
                setMessage(result.detail);
              })
            }
          >
            Review external save
          </button>
          {review && (
            <div>
              <p>
                {review.beforeRadius} → {review.boundingRadius}
              </p>
              <p className="subtle">{review.detail}</p>
              <button
                disabled={
                  !connected || viewer || busy || !review.changed || queued.current === review.candidateSha256
                }
                onClick={() =>
                  void run(async () => {
                    const result = await inspect(id);
                    const current = latest.current,
                      native = current.native;
                    if (!native || native.source.inventorySha256 !== result.sourceSha256)
                      throw Error('The map source changed; the external candidate is retained.');
                    const radius = native.fields[0]?.boundingRadius ?? native.source.boundingRadius;
                    if (!result.changed || radius === result.boundingRadius) {
                      setMessage('This value is already reflected in the shared field.');
                      return;
                    }
                    if (radius !== result.beforeRadius)
                      throw Error('Conflict: the shared field changed. Your tool fork is retained.');
                    onChange({
                      ...current,
                      native: {
                        ...native,
                        fields: [{ id: 'pistolBoundingRadius', boundingRadius: result.boundingRadius }],
                      },
                    });
                    queued.current = result.candidateSha256;
                    setMessage(
                      'Sent for authoritative review. Watch the committed value and SparkLink status for acknowledgement.',
                    );
                  })
                }
              >
                Propose reviewed field edit
              </button>
            </div>
          )}
        </>
      )}
      {busy && <p role="status">Checking private native source…</p>}
      {message && <p role="status">{message}</p>}
      {error && <Notice tone="error">{error}</Notice>}
    </details>
  );
}
