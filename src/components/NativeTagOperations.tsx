import { useCallback, useEffect, useRef, useState } from 'react';
import { call, native } from '../api';
import type { Project } from '../types';
import {
  notifyNativeSource,
  type NativeOperation,
  type NativeTagContext,
  type NativePreview,
  type NativeAccepted,
  type NativeDependencies,
} from '../nativeOperations';
import { Notice, Pill } from './ui';
import './nativeTools.css';
import BaboonTools from './BaboonTools';

/** Lazy, map-bound native operations. Reading a compiled tag does not grant
 * editing access to its native source; the desktop checks that separately. */
export default function NativeTagOperations({
  project,
  tagId,
  dirty = false,
  epoch = 0,
}: {
  project: Project;
  tagId?: number;
  dirty?: boolean;
  epoch?: number;
}) {
  const [expanded, setExpanded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [context, setContext] = useState<NativeTagContext | null>(null),
    [radius, setRadius] = useState('');
  const [preview, setPreview] = useState<NativePreview | null>(null),
    [accepted, setAccepted] = useState<NativeAccepted | null>(null),
    [dependencies, setDependencies] = useState<NativeDependencies | null>(null);
  const generation = useRef(0);
  const projectId = project.id;
  const [nativeTag, setNativeTag] = useState<number | null>(null),
    [choices, setChoices] = useState<{ id: number; class: string; path: string }[]>([]);
  const selectedTagId = tagId ?? nativeTag;
  useEffect(() => {
    setNativeTag(null);
    setChoices([]);
  }, [projectId, tagId]);
  useEffect(() => {
    if (!expanded || tagId !== undefined || !native) return;
    let active = true;
    void call<typeof choices>('native_tag_inventory', { projectId })
      .then((rows) => {
        if (active) setChoices(rows);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [expanded, projectId, tagId, project.builds.length]);
  const refresh = useCallback(async () => {
    if (!native) return;
    const current = generation.current;
    try {
      const result = await call<NativeTagContext>('native_tag_context', { projectId, tagId: selectedTagId });
      if (current !== generation.current) return;
      setContext(result);
      setRadius(result.boundingRadius?.toString() ?? '');
    } catch (e) {
      if (current === generation.current) {
        setContext(null);
        setError(String(e));
      }
    }
  }, [projectId, selectedTagId]);
  useEffect(() => {
    generation.current++;
    setContext(null);
    setPreview(null);
    setAccepted(null);
    setDependencies(null);
    setError('');
    setBusy(false);
    return () => {
      generation.current++;
    };
  }, [projectId, selectedTagId, epoch]);
  useEffect(() => {
    if (expanded) void refresh();
  }, [expanded, refresh, epoch, project.builds.length]);
  async function perform(work: (current: number) => Promise<void>) {
    const current = generation.current;
    setBusy(true);
    setError('');
    try {
      await work(current);
    } catch (e) {
      if (current === generation.current) setError(String(e));
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  function makePreview(operation: NativeOperation) {
    if (dirty) return;
    void perform(async (current) => {
      const result = await call<NativePreview>('native_operation_preview', {
        projectId,
        tagId: selectedTagId,
        operation,
      });
      if (current !== generation.current) return;
      setPreview(result);
      setAccepted(null);
    });
  }
  function accept(restore = false) {
    if (!preview || dirty) return;
    void perform(async (current) => {
      const result = await call<NativeAccepted>('native_operation_accept', {
        projectId,
        operationId: preview.id,
        restore,
      });
      notifyNativeSource(projectId);
      if (current !== generation.current) return;
      setAccepted(result);
      setPreview({ ...preview, currentState: restore ? 'before' : 'after' });
      await refresh();
    });
  }
  return (
    <details className="native-tag-operations" onToggle={(e) => setExpanded(e.currentTarget.open)}>
      <summary>
        Invader · native checks &amp; reviewed edits <Pill>Working source</Pill>
      </summary>
      <p className="subtle">
        Check native dependencies or preview a specific tag edit. Accepted edits become a separate source
        revision; use Build working tag edits to compile a new map.
      </p>
      {!native && <Notice tone="info">Open the desktop app to use installed native tools.</Notice>}
      {tagId === undefined && choices.length > 0 && (
        <label className="native-history">
          Native tag
          <select
            aria-label="Native tag"
            value={nativeTag ?? ''}
            disabled={busy}
            onChange={(e) => setNativeTag(e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">Map scenario</option>
            {choices.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.class} · {tag.path}
              </option>
            ))}
          </select>
        </label>
      )}
      {context && (
        <>
          <code className="native-tag-path">{context.tag}</code>
          {!!context.history.length && (
            <label className="native-history">
              Retained previews &amp; recovery
              <select
                aria-label="Retained native previews"
                value={preview?.id ?? ''}
                onChange={(e) => {
                  setPreview(context.history.find((item) => item.id === e.target.value) ?? null);
                  setAccepted(null);
                }}
              >
                <option value="">Choose a retained edit…</option>
                {context.history.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.fieldChanges[0]?.after.trim()} ·{' '}
                    {item.currentState === 'after'
                      ? 'current tag matches edit'
                      : item.currentState === 'before'
                        ? 'current tag matches original'
                        : 'later changes need review'}{' '}
                    · {item.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="button-row">
            <button
              type="button"
              disabled={busy || !native}
              onClick={() =>
                void perform(async (current) => {
                  const result = await call<NativeDependencies>('native_dependency_check', {
                    projectId,
                    tagId: selectedTagId,
                  });
                  if (current === generation.current) setDependencies(result);
                })
              }
            >
              Check native dependencies
            </button>
            <button type="button" disabled={busy} onClick={() => void refresh()}>
              Refresh source
            </button>
          </div>
          {context.boundingRadius !== null && (
            <div className="native-field-edit">
              <label>
                Native bounding radius
                <input
                  aria-label="Native bounding radius"
                  type="number"
                  min="0"
                  max="100000"
                  step="0.01"
                  value={radius}
                  disabled={busy || dirty}
                  onChange={(e) => {
                    setRadius(e.target.value);
                    if (!accepted) setPreview(null);
                  }}
                />
              </label>
              <button
                type="button"
                disabled={
                  busy ||
                  dirty ||
                  !context.canEdit ||
                  radius.trim() === '' ||
                  !Number.isFinite(Number(radius)) ||
                  Number(radius) < 0 ||
                  Number(radius) > 100000 ||
                  Number(radius) === context.boundingRadius
                }
                onClick={() => makePreview({ kind: 'boundingRadius', value: Number(radius) })}
              >
                Preview radius edit
              </button>
            </div>
          )}
          {context.lensFlareScale !== null && (
            <div className="button-row">
              <span>Lens-flare rotation scale (Invader degrees): {context.lensFlareScale}</span>
              <button
                type="button"
                disabled={busy || dirty || !context.canRepair}
                onClick={() => makePreview({ kind: 'lensFlareScaleRepair' })}
              >
                Preview legacy 360-radian → 0 repair
              </button>
            </div>
          )}
          {(context.editIssue || context.repairIssue) && (
            <Notice tone="info">{context.editIssue ?? context.repairIssue}</Notice>
          )}
        </>
      )}
      {dirty && (
        <Notice tone="info">Save your Spark draft before previewing or accepting native edits.</Notice>
      )}
      {busy && <p role="status">Checking native source…</p>}
      {error && <Notice>{error}</Notice>}
      {dependencies && (
        <section aria-label="Native dependency result">
          <Pill tone={dependencies.complete ? 'green' : 'amber'}>
            {dependencies.complete ? 'References present' : 'Needs review'}
          </Pill>
          <p>{dependencies.detail}</p>
          <details>
            <summary>
              {dependencies.dependencies.length} native references · {dependencies.tool}
            </summary>
            <ul>
              {dependencies.dependencies.map((row) => (
                <li key={row.path}>
                  <code>{row.path}</code>
                  {(!row.present || row.reportedBroken) && ' · broken / missing'}
                </li>
              ))}
            </ul>
            <pre>{dependencies.output}</pre>
          </details>
        </section>
      )}
      {preview && (
        <section aria-label="Native edit preview">
          <strong>{preview.tag}</strong>
          <p>{preview.detail}</p>
          <ul>
            {preview.fieldChanges.map((change, i) => (
              <li key={i}>
                <code>{change.before}</code> → <code>{change.after}</code>
              </li>
            ))}
          </ul>
          <p className="subtle">
            {preview.changedBytes} binary bytes differ. Writer: {preview.toolId}; the accepted revision
            retains the complete native file. Unexposed fields still require native review.
          </p>
          <div className="button-row">
            <button
              type="button"
              disabled={busy || dirty || preview.currentState !== 'before'}
              onClick={() => accept()}
            >
              Accept as new source revision
            </button>
            <button
              type="button"
              disabled={busy || dirty || preview.currentState !== 'after'}
              onClick={() => accept(true)}
            >
              Restore before-edit tag
            </button>
          </div>
        </section>
      )}
      {accepted && (
        <Notice tone="info">
          {accepted.detail} {accepted.files.toLocaleString()} native files retained.
        </Notice>
      )}
      {context && tagId === undefined && (
        <BaboonTools project={project} tagId={selectedTagId ?? undefined} dirty={dirty} epoch={epoch} />
      )}
    </details>
  );
}
