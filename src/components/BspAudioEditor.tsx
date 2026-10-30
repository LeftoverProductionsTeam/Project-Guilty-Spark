import { useEffect, useRef, useState } from 'react';
import { call, native } from '../api';
import { useMapState } from '../mapSession';
import { Notice } from './ui';
export interface AudioDependency {
  path: string;
  sha256: string;
}
interface Palette {
  name: string;
  tagPath: string | null;
}
interface Cluster {
  index: number;
  background: number | null;
  environment: number | null;
  bounds: [[number, number, number], [number, number, number]] | null;
}
interface Bsp {
  index: number;
  tagPath: string;
  clusters: Cluster[];
  backgroundPalette: Palette[];
  environmentPalette: Palette[];
  portalCount: number;
}
interface Report {
  parentBuildId: string;
  inspection: { sourceSha256: string; bsps: Bsp[] };
  bspTagHashes: Record<string, string>;
  backgrounds: AudioDependency[];
  environments: AudioDependency[];
}
interface AudioChange {
  cluster: number;
  background: AudioDependency | null;
  environment: AudioDependency | null;
}
export interface BspAudioRequest {
  parentBuildId: string;
  sourceSha256: string;
  bspIndex: number;
  bspTag: string;
  bspTagSha256: string;
  changes: AudioChange[];
}
function validDraft(value: unknown): value is BspAudioRequest {
  if (!value || typeof value !== 'object') return false;
  const draft = value as BspAudioRequest;
  return (
    ['parentBuildId', 'sourceSha256', 'bspTag', 'bspTagSha256'].every(
      (key) => typeof (draft as unknown as Record<string, unknown>)[key] === 'string',
    ) &&
    Number.isInteger(draft.bspIndex) &&
    Array.isArray(draft.changes) &&
    draft.changes.length <= 256 &&
    draft.changes.every(
      (c) =>
        c &&
        Number.isInteger(c.cluster) &&
        [c.background, c.environment].every(
          (d) => d === null || (!!d && typeof d.path === 'string' && typeof d.sha256 === 'string'),
        ),
    )
  );
}
const normalized = (path: string) => path.replaceAll('\\', '/').toLowerCase();
export default function BspAudioEditor({
  projectId,
  parentBuildId,
  blocked,
  onBuild,
}: {
  projectId: string;
  parentBuildId: string;
  blocked: boolean;
  onBuild: (request: BspAudioRequest) => Promise<void>;
}) {
  const [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  const [bspIndex, setBsp] = useMapState(projectId, 'bsp-audio.bsp', 0),
    [clusterIndex, setCluster] = useMapState(projectId, 'bsp-audio.cluster', 0);
  const [storedDraft, setDraft] = useMapState<BspAudioRequest | null>(
    projectId,
    'bsp-audio.draft',
    () => null,
  );
  const draft = validDraft(storedDraft) ? storedDraft : null;
  const [background, setBackground] = useState(''),
    [environment, setEnvironment] = useState('');
  const epoch = useRef(0);
  useEffect(() => {
    epoch.current++;
    setReport(null);
    setError('');
    setLoading(false);
    return () => {
      epoch.current++;
    };
  }, [projectId, parentBuildId]);
  const bsp = report?.inspection.bsps.find((b) => b.index === bspIndex) ?? report?.inspection.bsps[0];
  const cluster = bsp?.clusters.find((c) => c.index === clusterIndex) ?? bsp?.clusters[0];
  const stale =
    !!draft &&
    !!report &&
    (draft.parentBuildId !== report.parentBuildId ||
      draft.sourceSha256 !== report.inspection.sourceSha256 ||
      draft.bspTagSha256 !== report.bspTagHashes[draft.bspTag]);
  const differentBsp = !!draft && !!bsp && draft.bspIndex !== bsp.index;
  useEffect(() => {
    if (!bsp || !cluster) return;
    const staged =
      draft && draft.parentBuildId === report?.parentBuildId && draft.bspIndex === bsp.index
        ? draft.changes.find((c) => c.cluster === cluster.index)
        : null;
    const choose = (items: AudioDependency[], path: string | null | undefined, extension: string) =>
      items.find((d) => normalized(d.path) === normalized(`${path}.${extension}`))?.path ??
      (path ? `${path}.${extension}` : '');
    setBackground(
      staged
        ? (staged.background?.path ?? '')
        : choose(
            report!.backgrounds,
            cluster.background === null ? null : bsp.backgroundPalette[cluster.background]?.tagPath,
            'sound_looping',
          ),
    );
    setEnvironment(
      staged
        ? (staged.environment?.path ?? '')
        : choose(
            report!.environments,
            cluster.environment === null ? null : bsp.environmentPalette[cluster.environment]?.tagPath,
            'sound_environment',
          ),
    );
  }, [bsp, cluster, report, draft]);
  async function inspect() {
    const ticket = ++epoch.current;
    setLoading(true);
    setError('');
    try {
      const value = await call<Report>('inspect_bsp_audio_workspace', { projectId });
      if (ticket === epoch.current) {
        if (value.parentBuildId !== parentBuildId)
          throw Error('Working build changed; refresh dock inspection first.');
        setReport(value);
      }
    } catch (error) {
      if (ticket === epoch.current) setError(String(error));
    } finally {
      if (ticket === epoch.current) setLoading(false);
    }
  }
  const bg = report?.backgrounds.find((d) => d.path === background),
    env = report?.environments.find((d) => d.path === environment);
  const missing = (!!background && !bg) || (!!environment && !env);
  function stage(all = false) {
    if (!report || !bsp || !cluster || stale || differentBsp || missing) return;
    const changes = (all ? bsp.clusters : [cluster]).map((c) => ({
      cluster: c.index,
      background: bg ?? null,
      environment: env ?? null,
    }));
    const combined = [
      ...(draft?.changes ?? []).filter((c) => !changes.some((n) => n.cluster === c.cluster)),
      ...changes,
    ].sort((a, b) => a.cluster - b.cluster);
    if (combined.length > 256) {
      setError('A revision supports at most 256 cluster changes.');
      return;
    }
    const tag = `${bsp.tagPath}.scenario_structure_bsp`;
    setDraft({
      parentBuildId: report.parentBuildId,
      sourceSha256: report.inspection.sourceSha256,
      bspIndex: bsp.index,
      bspTag: tag,
      bspTagSha256: report.bspTagHashes[tag],
      changes: combined,
    });
    setError('');
  }
  return (
    <details className="bsp-audio-editor">
      <summary>BSP ambience &amp; sound environments</summary>
      <p>
        Create a separate compiled map with explicit cluster audio bindings. The open cache and working tags
        stay unchanged.
      </p>
      <button disabled={!native || blocked || loading} onClick={() => void inspect()}>
        {loading ? 'Inspecting BSP audio…' : 'Inspect BSP audio'}
      </button>
      {error && <Notice tone="error">{error}</Notice>}
      {report &&
        (!bsp || !cluster ? (
          <p>No referenced BSP clusters are available in this cache.</p>
        ) : (
          <>
            <div className="bsp-audio-grid">
              <label>
                BSP
                <select
                  aria-label="BSP audio structure"
                  disabled={blocked || loading}
                  value={bsp.index}
                  onChange={(e) => setBsp(Number(e.target.value))}
                >
                  {report.inspection.bsps.map((b) => (
                    <option key={b.index} value={b.index}>
                      {b.tagPath}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cluster
                <select
                  aria-label="BSP audio cluster"
                  disabled={blocked || loading}
                  value={cluster.index}
                  onChange={(e) => setCluster(Number(e.target.value))}
                >
                  {bsp.clusters.map((c) => (
                    <option key={c.index} value={c.index}>
                      Cluster {c.index} ·{' '}
                      {c.background === null ? 'no background' : bsp.backgroundPalette[c.background]?.name} ·{' '}
                      {c.environment === null
                        ? 'no environment'
                        : bsp.environmentPalette[c.environment]?.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Background loop
                <select
                  aria-label="BSP background loop"
                  disabled={blocked || loading}
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                >
                  <option value="">None · clear binding</option>
                  {background && !bg && (
                    <option value={background}>Missing editable tag · {background}</option>
                  )}
                  {report.backgrounds.map((d) => (
                    <option key={d.path} value={d.path}>
                      {d.path}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sound environment
                <select
                  aria-label="BSP sound environment"
                  disabled={blocked || loading}
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                >
                  <option value="">None · clear binding</option>
                  {environment && !env && (
                    <option value={environment}>Missing editable tag · {environment}</option>
                  )}
                  {report.environments.map((d) => (
                    <option key={d.path} value={d.path}>
                      {d.path}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="subtle">
              {bsp.clusters.length} clusters · {bsp.portalCount} portals.{' '}
              {cluster.bounds
                ? `Cluster bounds: ${cluster.bounds[0].map((v) => v.toFixed(2)).join(', ')} → ${cluster.bounds[1].map((v) => v.toFixed(2)).join(', ')}`
                : 'No subcluster bounds are recorded.'}
            </p>
            {(stale || differentBsp) && (
              <Notice tone="warn">
                {stale
                  ? 'The saved draft belongs to an older working build or BSP file.'
                  : 'One BSP can be changed per revision.'}{' '}
                Clear the staged draft before choosing new bindings.
              </Notice>
            )}
            {missing && (
              <Notice tone="warn">
                A selected source dependency is missing from these working tags. Connect matching editable
                tags and rebuild/open the working map first.
              </Notice>
            )}
            <div className="button-row">
              <button
                disabled={blocked || loading || stale || differentBsp || missing}
                onClick={() => stage()}
              >
                Stage cluster binding
              </button>
              <button
                disabled={blocked || loading || stale || differentBsp || missing || bsp.clusters.length > 256}
                onClick={() => stage(true)}
              >
                Stage all {bsp.clusters.length} clusters
              </button>
            </div>
          </>
        ))}
      {!!draft?.changes.length && (
        <>
          {!report && <p className="subtle">Inspect BSP audio again before building this saved draft.</p>}
          <p>
            {draft.changes.length} staged cluster {draft.changes.length === 1 ? 'binding' : 'bindings'} ·{' '}
            {draft.bspTag}
          </p>
          <div className="bsp-audio-draft">
            {draft.changes.map((c) => (
              <div key={c.cluster}>
                Cluster {c.cluster}: {c.background?.path ?? 'no background'} ·{' '}
                {c.environment?.path ?? 'no environment'}{' '}
                <button
                  disabled={blocked || loading}
                  onClick={() =>
                    setDraft(
                      draft.changes.length === 1
                        ? null
                        : { ...draft, changes: draft.changes.filter((old) => old.cluster !== c.cluster) },
                    )
                  }
                >
                  Remove cluster {c.cluster} binding
                </button>
              </div>
            ))}
          </div>
          <div className="button-row">
            <button
              disabled={blocked || loading || !report || stale || differentBsp}
              onClick={() => void onBuild(draft)}
            >
              Build BSP audio revision
            </button>
            <button disabled={blocked || loading} onClick={() => setDraft(null)}>
              Clear BSP audio draft
            </button>
          </div>
        </>
      )}
      <small>
        Requires a validated MCC H1A build, matching job-owned tags and Invader edit. Cluster IDs and bounds
        come from the compiled BSP. A changed working BSP must be rebuilt/opened first. Native sound
        environments are compiled into tags; editor reverb and game audio acceptance remain separate.
      </small>
    </details>
  );
}
