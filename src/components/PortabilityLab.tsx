import { useEffect, useRef, useState } from 'react';
import { call, native } from '../api';
import { useMapState } from '../mapSession';
import type { Project } from '../types';
import type {
  NativePreservation,
  PortabilityDiff,
  PortabilityProfile,
  PortabilityReport,
} from '../portability';
import { Notice } from './ui';

export default function PortabilityLab({
  project,
  dirty,
  onSave,
  onBuild,
  onSettings,
}: {
  project: Project;
  dirty: boolean;
  onSave: () => Promise<void>;
  onBuild: () => void;
  onSettings: () => void;
}) {
  const [profiles, setProfiles] = useState<PortabilityProfile[]>([]),
    [targets, setTargets] = useMapState<string[]>(project.id, 'portability.targets', ['halo1-mcc-steam']);
  const [report, setReport] = useState<PortabilityReport | null>(null),
    [preservation, setPreservation] = useState<NativePreservation | null>(null),
    [comparison, setComparison] = useState<PortabilityDiff | null>(null);
  const [buildId, setBuildId] = useMapState(project.id, 'portability.compare-build', ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [exported, setExported] = useState<{ json: string; markdown: string } | null>(null);
  const generation = useRef(0),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let alive = true;
    void call<PortabilityProfile[]>('portability_profiles')
      .then((value) => {
        if (alive) setProfiles(value);
      })
      .catch((reason) => {
        if (alive) setError(String(reason));
      });
    return () => {
      alive = false;
      mounted.current = false;
      generation.current++;
    };
  }, []);
  useEffect(() => {
    setReport(null);
    setPreservation(null);
    setComparison(null);
    setExported(null);
  }, [project.id, project.modifiedAt, dirty]);
  useEffect(() => {
    generation.current++;
    setBusy(false);
  }, [project.id]);
  async function run(task: (request: number) => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    const request = ++generation.current;
    try {
      await onSave();
      await task(request);
    } catch (reason) {
      if (mounted.current && request === generation.current) setError(String(reason));
    } finally {
      if (mounted.current && request === generation.current) setBusy(false);
    }
  }
  function current(request: number) {
    return mounted.current && request === generation.current;
  }
  const builds = project.builds.filter((build) => build.status === 'validated' && build.output);
  return (
    <section className="portability-lab" aria-label="Portability Lab">
      <p>
        Inspect native compatibility before preparing a separate conversion. Original maps and native tags
        stay preserved; Spark editing metadata remains outside game tags.
      </p>
      <ol className="portability-steps" aria-label="Portability workflow">
        {['Inspect', 'Compare', 'Prepare', 'Convert', 'Build', 'Validate', 'Play'].map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <fieldset className="surface portability-targets" disabled={busy}>
        <legend>Target runtimes · choose up to eight</legend>
        {profiles.map((profile) => (
          <label key={profile.profileId}>
            <input
              aria-label={profile.label}
              type="checkbox"
              checked={targets.includes(profile.profileId)}
              disabled={!targets.includes(profile.profileId) && targets.length >= 8}
              onChange={(event) => {
                setTargets(
                  event.target.checked
                    ? [...targets, profile.profileId]
                    : targets.filter((id) => id !== profile.profileId),
                );
                setReport(null);
                setExported(null);
              }}
            />
            <span>
              {profile.label}
              <small>
                {profile.target.platform} · {profile.target.architecture}
              </small>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="portability-actions">
        <button
          disabled={!native || busy || !targets.length}
          onClick={() =>
            void run(async (request) => {
              const result = await call<PortabilityReport>('inspect_portability', {
                projectId: project.id,
                targets,
              });
              if (current(request)) setReport(result);
            })
          }
        >
          {busy ? 'Checking native source…' : dirty ? 'Save & inspect portability' : 'Inspect portability'}
        </button>
        <button
          disabled={!native || busy}
          onClick={() =>
            void run(async (request) => {
              const result = await call<NativePreservation>('verify_native_preservation', {
                projectId: project.id,
              });
              if (current(request)) setPreservation(result);
            })
          }
        >
          Verify untouched native bytes
        </button>
        <button
          disabled={!native || busy || !report}
          onClick={() =>
            void run(async (request) => {
              const result = await call<{ json: string; markdown: string }>('save_portability_report', {
                projectId: project.id,
                targets,
              });
              if (current(request)) setExported(result);
            })
          }
        >
          Save JSON & readable report
        </button>
        <button onClick={onSettings}>Dependencies & tools</button>
        <button onClick={onBuild}>MCC build workflow</button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {exported && (
        <p role="status">
          Reports saved in this project’s portability-reports folder.<code>{exported.markdown}</code>
          <code>{exported.json}</code>
        </p>
      )}
      {preservation && (
        <section className="surface">
          <h3>
            {preservation.byteIdentical
              ? 'No-op native bytes are identical'
              : 'Untouched native bytes are preserved'}
          </h3>
          <p>
            {preservation.changedBytes.toLocaleString()} changed bytes across{' '}
            {preservation.permittedRanges.length} permitted field/placement ranges;{' '}
            {preservation.bytes.toLocaleString()} bytes checked.
          </p>
          <p className="subtle">{preservation.scope}</p>
        </section>
      )}
      {report && (
        <>
          <p>
            Source: <strong>{report.sourceEdition}</strong> · cache {report.sourceCacheVersion} ·{' '}
            {report.sourceTags.toLocaleString()} tags · {report.auditedFields.toLocaleString()} inspected
            fields
          </p>
          {report.targets.map((target) => (
            <section className="surface" key={target.profile.profileId}>
              <h3>{target.profile.label}</h3>
              <p>
                {target.cacheFamilyMatches
                  ? 'Cache family matches; native compatibility still needs the checks below.'
                  : 'Cache family compatibility is not established; review this target’s native tags and tools.'}
              </p>
              <p>{target.compiler}</p>
              {target.buildPreflight && (
                <p role="status">
                  {target.buildPreflight.ready
                    ? 'Ready for the existing build pipeline; game testing is separate.'
                    : 'Build preparation has unresolved dependencies or edits.'}
                </p>
              )}
              {target.buildPreflight?.blockers.map((blocker, index) => (
                <Notice key={index}>{blocker}</Notice>
              ))}
              {!target.conversionAvailable && (
                <p className="subtle">
                  Imported-map conversion to this exact runtime is not implemented. The profile preserves the
                  target in the compatibility workflow.
                </p>
              )}
              {target.findings.map((finding) => (
                <details
                  className="portability-finding"
                  key={finding.code}
                  open={finding.severity === 'blocker'}
                >
                  <summary>
                    <span>
                      {finding.severity === 'review'
                        ? 'Review'
                        : finding.severity === 'warning'
                          ? 'Warning'
                          : 'Blocked'}
                    </span>
                    {finding.title}
                    {finding.affectedTags > 0 && ` · ${finding.affectedTags} tags`}
                  </summary>
                  <p>{finding.detail}</p>
                  <p>{finding.nextAction}</p>
                  <a href={finding.source} target="_blank" rel="noreferrer">
                    Technical source
                  </a>
                </details>
              ))}
            </section>
          ))}
          <details>
            <summary>Audit scope and remaining checks</summary>
            {report.limitations.map((limit) => (
              <p key={limit}>{limit}</p>
            ))}
          </details>
        </>
      )}
      <section className="surface">
        <h3>Compare a validated derived build</h3>
        <p>
          Compare native class/path identities and inspected fields. Repacked offsets and datum IDs are
          resolved separately from semantic changes.
        </p>
        <label>
          Derived build
          <select
            aria-label="Portability comparison build"
            value={buildId}
            onChange={(event) => {
              setBuildId(event.target.value);
              setComparison(null);
            }}
          >
            <option value="">Choose a validated build</option>
            {builds.map((build) => (
              <option key={build.id} value={build.id}>
                {build.timestamp} · {build.target}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={!native || busy || !builds.some((build) => build.id === buildId)}
          onClick={() =>
            void run(async (request) => {
              const result = await call<PortabilityDiff>('compare_portability', {
                projectId: project.id,
                buildId,
              });
              if (current(request)) setComparison(result);
            })
          }
        >
          Compare semantic changes
        </button>
        {comparison && (
          <>
            <p>
              {comparison.unchangedAuditedFields.toLocaleString()} unchanged inspected fields ·{' '}
              {comparison.fieldChangeCount} changed · {comparison.unpairedAuditedFields} unavailable in target
              · {comparison.missingTagCount} missing tags · {comparison.addedTagCount} added tags
            </p>
            <p className="subtle">{comparison.scope}</p>
            {comparison.fieldChanges.map((change, index) => (
              <details key={index}>
                <summary>
                  {change.tagPath} · {change.field}
                </summary>
                <pre>{JSON.stringify({ before: change.before, after: change.after }, null, 2)}</pre>
              </details>
            ))}
            <details>
              <summary>Added and missing native tags</summary>
              <pre>
                {comparison.missingTags
                  .map((tag) => '- ' + tag)
                  .concat(comparison.addedTags.map((tag) => '+ ' + tag))
                  .join('\n') || 'No native class/path additions or removals.'}
              </pre>
            </details>
          </>
        )}
      </section>
    </section>
  );
}
