import { useEffect, useRef, useState } from 'react';
import { FolderOpen, ShieldCheck } from 'lucide-react';
import { call, native } from '../api';
import type { Project, MapInspection } from '../types';
import type { RecoveryPlan, RecoveryReceipt } from '../sourceRecovery';
import { useMapState } from '../mapSession';
import { Notice, Pill } from './ui';
import '../sourceRecovery.css';

export default function SourceRecovery({
  project,
  inspection,
}: {
  project: Project;
  inspection: MapInspection | null;
}) {
  const [tagId, setTagId] = useMapState<number | null>(project.id, 'recovery.tag', null);
  const selected =
    inspection?.tags.find((t) => t.id === tagId) ??
    inspection?.tags.find((t) => t.class === 'scnr') ??
    inspection?.tags[0];
  const [recoveryId, setRecoveryId] = useMapState<string | null>(
    project.id,
    `recovery.result.${selected?.id ?? 'none'}`,
    null,
  );
  const [plan, setPlan] = useState<RecoveryPlan | null>(null),
    [receipt, setReceipt] = useState<RecoveryReceipt | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const scope = useRef(0);
  useEffect(() => {
    scope.current++;
    setPlan(null);
    setReceipt(null);
    setError('');
    setBusy(false);
    const generation = scope.current;
    if (native && recoveryId)
      void call<RecoveryReceipt>('inspect_project_recovery', { recoveryId })
        .then((value) => {
          if (scope.current === generation) setReceipt(value);
        })
        .catch((e) => {
          if (scope.current === generation) setError(String(e));
        });
    return () => {
      scope.current++;
    };
  }, [project.id, project.source?.sha256, recoveryId, selected?.id]);
  async function run(action: (active: () => boolean) => Promise<void>) {
    const generation = scope.current;
    const active = () => generation === scope.current;
    setBusy(true);
    setError('');
    try {
      await action(active);
    } catch (e) {
      if (active()) setError(String(e));
    } finally {
      if (active()) setBusy(false);
    }
  }
  return (
    <section className="surface source-recovery" aria-label="Source Guardian recovery">
      <div className="section-heading">
        <h3>
          <ShieldCheck size={16} /> Recover a Halo Project
        </h3>
        <Pill>Source Guardian</Pill>
      </div>
      {!project.source || !inspection ? (
        <p>
          Open a map from your library to recover its native scenario or an asset with its dependencies.
          Original files stay preserved.
        </p>
      ) : (
        <>
          <p className="subtle">
            Recover standard tags and supported source files from <strong>{project.title}</strong> into a
            separate project. Review what can be recovered before writing.
          </p>
          <div className="recovery-actions">
            <label>
              Recovery root
              <select
                aria-label="Recovery root"
                disabled={busy}
                value={selected?.id ?? ''}
                onChange={(e) => {
                  setTagId(Number(e.target.value));
                  setPlan(null);
                  setReceipt(null);
                }}
              >
                {inspection.tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.class} · {tag.path}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={!native || busy || !selected}
              onClick={() =>
                void run(async (active) => {
                  const result = await call<RecoveryPlan>('review_project_recovery', {
                    projectId: project.id,
                    tagId: selected!.id,
                  });
                  if (active()) {
                    setPlan(result);
                    setReceipt(null);
                  }
                })
              }
            >
              {busy ? 'Working…' : 'Review recovery'}
            </button>
          </div>
          {plan && (
            <div className="recovery-review" aria-label="Recovery plan">
              <div className="recovery-summary">
                <strong>{plan.scope}</strong>
                <span>{plan.sourceEdition}</span>
                <span>
                  {Object.keys(plan.toolHashes).length} tools located · {plan.indexedTags} indexed tags
                </span>
              </div>
              <code className="path-text">{plan.requestedTag}</code>
              <details>
                <summary>Identity, dependencies &amp; recovery limits</summary>
                <code className="checksum">SHA-256 {plan.sourceSha256}</code>
                <code className="path-text">{plan.sourcePath}</code>
                <p>
                  Observed links: {plan.observedDependencies.length}. The cache reader covers known
                  relationships; full native dependency traversal runs after extraction.
                </p>
                {plan.observedDependencies.length > 0 && (
                  <ul>
                    {plan.observedDependencies.map((path) => (
                      <li key={path}>
                        <code>{path}</code>
                      </li>
                    ))}
                  </ul>
                )}
                <p>
                  {Object.keys(plan.resources).length} source resource identities pinned. Compatible viewer
                  textures do not authorize a native build.
                </p>
                <ul>
                  {plan.limitations.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              </details>
              {plan.blockers.length > 0 ? (
                <Notice tone="warning">{plan.blockers.join(' · ')}</Notice>
              ) : (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void run(async (active) => {
                      const result = await call<RecoveryReceipt>('recover_halo_project', {
                        projectId: project.id,
                        tagId: plan.tagId,
                        planIdentity: plan.identity,
                      });
                      if (active()) {
                        setRecoveryId(result.id);
                        setReceipt(result);
                      }
                    })
                  }
                >
                  Recover into a separate project
                </button>
              )}
            </div>
          )}
          {receipt && (
            <div className="recovery-result" aria-label="Recovered project">
              <strong>
                {receipt.reused ? 'Verified existing recovered project' : 'Native tags recovered'}
              </strong>
              <span>
                {receipt.nativeTags.length} tags parsed independently · {receipt.dependencyClosure.length}{' '}
                native dependencies · {receipt.recoveredData.length} reconstructed source files
              </span>
              <code className="path-text">{receipt.directory}</code>
              <div className="recovery-actions">
                <button
                  disabled={!native || busy}
                  onClick={() =>
                    void run(async () => {
                      await call('reveal_folder', { kind: 'recoveredProject', id: receipt.id });
                    })
                  }
                >
                  <FolderOpen size={14} /> Open recovered project
                </button>
                <span className="subtle">Native compilation and gameplay need separate validation.</span>
              </div>
              <details>
                <summary>Fidelity &amp; source gaps</summary>
                <p>
                  The tags are recovered native content. The data folder contains structural reconstruction
                  where available; original authoring history is not restored.
                </p>
                <ul>
                  {receipt.sourceRecoveryGaps.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
                <p>
                  Use the standard tags/data folders with compatible Halo tools. The recovery report is
                  optional provenance.
                </p>
              </details>
            </div>
          )}
        </>
      )}
      {error && (
        <div role="alert">
          <Notice tone="warning">{error}</Notice>
          {recoveryId && (
            <button
              disabled={!native || busy}
              onClick={() =>
                void run(async () => {
                  await call('reveal_folder', { kind: 'recoveredProject', id: recoveryId });
                })
              }
            >
              Open recovered files
            </button>
          )}
        </div>
      )}
    </section>
  );
}
