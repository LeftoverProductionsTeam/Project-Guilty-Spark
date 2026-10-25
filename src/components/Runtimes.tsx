import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderOpen, RefreshCw, Server, ShieldCheck, Upload, Download, Unplug } from 'lucide-react';
import { call, native } from '../api';
import type {
  CapabilityEvidence,
  MultiplayerMode,
  PeerManifest,
  PeerPreflight,
  Project,
  RuntimeId,
  RuntimeInstallation,
  RuntimeInventory,
  RuntimeRegistration,
  RuntimeReport,
} from '../types';
import { Empty, Notice, PageTitle, Pill } from './ui';

const editable = new Set<RuntimeId>(['chupathingyCe', 'openCe', 'haloPc', 'haloCustomEdition']);
const labels: Record<string, string> = {
  importMaps: 'Import maps',
  convertMaps: 'Convert content',
  installMod: 'Create mod package',
  registerMod: 'Register mod root',
  unregisterMod: 'Unregister mod root',
  removeMod: 'Remove owned package',
  readLogs: 'Read runtime logs',
  discoverRunning: 'Find running game',
  inspectMaps: 'Inspect maps',
  editMaps: 'Edit audited fields',
  rebuildMaps: 'Rebuild maps',
  launchRuntime: 'Open runtime',
  launchMap: 'Launch this map',
  hostMultiplayer: 'Multiplayer hosting',
  campaignCoop: 'Campaign co-op',
  networkedAi: 'Networked AI',
  liveEditing: 'Live editing',
  vr: 'VR',
};
const tone = (status: string) =>
  status === 'pass' || status === 'supported'
    ? 'green'
    : status === 'fail' || status === 'unsupported'
      ? 'amber'
      : 'muted';

function Evidence({ item }: { item: CapabilityEvidence }) {
  return (
    <div className="capability-row">
      <div>
        <strong>{labels[item.key] ?? item.key}</strong>
        <Pill tone={tone(item.status)}>{item.status}</Pill>
        <Pill tone={tone(item.testStatus)}>{item.testStatus}</Pill>
      </div>
      <p>{item.detail}</p>
      <small>Evidence: {item.evidence}</small>
      {item.sources.map((source) => (
        <a
          key={source.url}
          href={/^https?:\/\//i.test(source.url) ? source.url : undefined}
          target="_blank"
          rel="noreferrer"
        >
          {source.title}
          {source.revision && ` · ${source.revision}`}
        </a>
      ))}
    </div>
  );
}

export default function Runtimes({
  project,
  dirty,
  onSave,
}: {
  project: Project | null;
  dirty: boolean;
  onSave: () => Promise<void>;
}) {
  const [reports, setReports] = useState<RuntimeReport[]>([]);
  const [selected, setSelected] = useState<RuntimeId>('mccSteam');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'runtime' | 'friends'>('runtime');
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await call<RuntimeReport[]>('runtime_report');
      if (alive.current) setReports(next);
    } catch (e) {
      if (alive.current) setError(String(e));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    if (native) void refresh();
    return () => {
      alive.current = false;
    };
  }, [refresh]);
  const report = reports.find((item) => item.id === selected);
  return (
    <div className="analysis-page">
      <PageTitle
        eyebrow="RUNTIMES / LOCAL CAPABILITY EVIDENCE"
        title="Runtimes & friends"
        description="Keep installation evidence, map compatibility and peer checks separate from gameplay verification."
        actions={
          <button disabled={loading || !native} onClick={() => void refresh()}>
            <RefreshCw size={15} />
            Refresh reports
          </button>
        }
      />
      {!native && (
        <Notice tone="info">
          Runtime discovery and file hashing require the desktop application. Browser preview has no runtime
          evidence.
        </Notice>
      )}
      {error && <Notice>{error}</Notice>}
      <div className="tabs workspace-tabs">
        <button className={tab === 'runtime' ? 'selected' : ''} onClick={() => setTab('runtime')}>
          Runtime adapters
        </button>
        <button className={tab === 'friends' ? 'selected' : ''} onClick={() => setTab('friends')}>
          Friends preflight
        </button>
      </div>
      {loading && !reports.length && (
        <div className="loading" role="status">
          Inspecting runtime configuration…
        </div>
      )}
      {reports.length > 0 && (
        <label className="runtime-picker">
          Runtime / preservation family
          <select
            aria-label="Runtime adapter"
            value={selected}
            onChange={(e) => setSelected(e.target.value as RuntimeId)}
          >
            {reports.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {report &&
        (tab === 'runtime' ? (
          <RuntimeDetails key={selected} report={report} onRegistered={setReports} />
        ) : (
          <Friends
            key={`${selected}:${project?.id ?? ''}`}
            report={report}
            project={project}
            dirty={dirty}
            onSave={onSave}
          />
        ))}
    </div>
  );
}

function RuntimeDetails({
  report,
  onRegistered,
}: {
  report: RuntimeReport;
  onRegistered: (reports: RuntimeReport[]) => void;
}) {
  const [inventory, setInventory] = useState<RuntimeInventory | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(100);
  const installation = report.installation;
  const launch = report.capabilities.find((item) => item.key === 'launchRuntime');
  const canLaunch = installation?.validation === 'pass' && launch?.status === 'supported';
  useEffect(() => {
    setInventory(null);
    setLimit(100);
  }, [installation?.root, installation?.dataRoot, installation?.executableSha256]);
  async function scan() {
    setBusy(true);
    setInventory(null);
    setError('');
    try {
      setInventory(await call<RuntimeInventory>('runtime_inventory', { runtimeId: report.id }));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function open() {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      setMessage(await call<string>('launch_registered_runtime', { runtimeId: report.id }));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="analysis-card">
        <div className="section-heading">
          <h2>{report.name}</h2>
          <Pill>Adapter {report.adapterVersion}</Pill>
          <Pill>{report.hostPlatform}</Pill>
        </div>
        {installation ? (
          <>
            <div className="metadata-grid">
              <div>
                <small>Installation identity</small>
                <strong>{installation.identity}</strong>
              </div>
              <div>
                <small>Local validation</small>
                <Pill tone={tone(installation.validation)}>{installation.validation}</Pill>
              </div>
              <div>
                <small>Declared runtime build</small>
                <strong>{installation.version ?? 'Unknown'}</strong>
              </div>
              <div>
                <small>Declared network version</small>
                <strong>{installation.networkVersion ?? 'Unknown'}</strong>
              </div>
            </div>
            <dl className="path-list">
              <dt>Installation root</dt>
              <dd>{installation.root}</dd>
              <dt>Data root</dt>
              <dd>{installation.dataRoot}</dd>
              <dt>Executable</dt>
              <dd>{installation.executable ?? 'Not detected'}</dd>
              <dt>Executable SHA-256</dt>
              <dd>{installation.executableSha256 ?? 'Not hashed'}</dd>
            </dl>
            {installation.diagnostics.map((value, i) => (
              <Notice key={i}>{value}</Notice>
            ))}
          </>
        ) : (
          <p className="subtle">No validated installation is configured for this adapter.</p>
        )}
        {report.diagnostics.map((value, i) => (
          <Notice key={i} tone="info">
            {value}
          </Notice>
        ))}
        <div className="analysis-actions">
          <button disabled={!installation || busy} onClick={() => void scan()}>
            <Server size={15} />
            {busy ? 'Working…' : 'Inspect installed maps'}
          </button>
          <button disabled={!canLaunch || busy} onClick={() => void open()}>
            <FolderOpen size={15} />
            {report.id === 'mccSteam' ? 'Open Steam launch selector' : 'Open runtime'}
          </button>
        </div>
        <p className="subtle">
          {report.id === 'mccSteam'
            ? 'Steam opens its official launch selector. Choose the intended anti-cheat mode manually.'
            : 'Open runtime starts the configured application only.'}{' '}
          Launch test: {launch?.testStatus ?? 'unknown'}. Direct map launch, mod loading and gameplay remain
          unverified.
        </p>
        {error && <Notice>{error}</Notice>}
        {message && <Notice tone="info">{message}</Notice>}
      </section>
      {editable.has(report.id) && (
        <Registration
          report={report}
          onRegistered={(next) => {
            setInventory(null);
            onRegistered(next);
          }}
        />
      )}
      <section className="analysis-card">
        <h2>Capability evidence</h2>
        <p className="subtle">
          A documented or upstream capability marked untested is not a verified operation in this workbench.
        </p>
        <div className="capability-grid">
          {report.capabilities.map((item) => (
            <Evidence key={item.key} item={item} />
          ))}
        </div>
      </section>
      <section className="analysis-card">
        <h2>Map families</h2>
        <div className="capability-grid">
          {report.mapFamilies.map((family) => (
            <Evidence
              key={family.family}
              item={{
                ...family,
                key: `${family.family} · cache ${family.cacheVersions.join(', ') || 'unknown'}`,
              }}
            />
          ))}
        </div>
      </section>
      {inventory && (
        <section className="analysis-card">
          <h2>Installed map & resource inventory</h2>
          <p className="subtle">
            Read-only inspection of the configured data directory. A readable cache is not proof that this
            runtime can play it.
          </p>
          {inventory.diagnostics.map((d, i) => (
            <Notice key={i}>{d}</Notice>
          ))}
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Relative path</th>
                  <th>Family / cache</th>
                  <th>Inspection</th>
                  <th>SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {inventory.maps.slice(0, limit).map((map) => (
                  <tr key={map.relativePath}>
                    <td>
                      {map.relativePath}
                      <small>{map.detail}</small>
                    </td>
                    <td>
                      {map.family} / {map.cacheVersion ?? 'unknown'}
                    </td>
                    <td>{map.valid ? 'Parsed' : 'Invalid'}</td>
                    <td>
                      <code>{map.sha256 ?? 'Unavailable'}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {inventory.maps.length > limit && (
            <button onClick={() => setLimit((v) => v + 100)}>Show more maps</button>
          )}
          {!inventory.maps.length && <p>No maps were found in this inventory.</p>}
          <h3>Resources</h3>
          {inventory.resources.map((resource) => (
            <div className="resource-row" key={resource.relativePath}>
              <strong>{resource.relativePath}</strong>
              <code>{resource.sha256 ?? 'Unavailable'}</code>
            </div>
          ))}
          {!inventory.resources.length && <p className="subtle">No shared resource files found.</p>}
        </section>
      )}
    </>
  );
}

function Registration({
  report,
  onRegistered,
}: {
  report: RuntimeReport;
  onRegistered: (reports: RuntimeReport[]) => void;
}) {
  const installation = report.installation;
  const [draft, setDraft] = useState<RuntimeRegistration>({
    id: installation?.registrationId ?? crypto.randomUUID(),
    runtimeId: report.id,
    root: installation?.root ?? '',
    executable: installation?.executable ?? '',
    dataRoot: installation?.dataRoot ?? null,
    version: installation?.version ?? null,
    networkVersion: installation?.networkVersion ?? null,
  });
  const [inspection, setInspection] = useState<RuntimeInstallation | null>(null);
  const [inspected, setInspected] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const fingerprint = JSON.stringify(draft);
  async function browse(kind: 'executable' | 'root' | 'dataRoot') {
    try {
      const value = await call<string | null>('choose_runtime_path', { kind });
      if (value) setDraft((d) => ({ ...d, [kind]: value }));
    } catch (e) {
      setError(String(e));
    }
  }
  async function inspect() {
    setBusy(true);
    setInspection(null);
    setMessage('');
    setError('');
    try {
      setInspection(await call<RuntimeInstallation>('inspect_runtime_registration', { registration: draft }));
      setInspected(fingerprint);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function register() {
    setBusy(true);
    setError('');
    try {
      onRegistered(await call<RuntimeReport[]>('register_runtime', { registration: draft }));
      setMessage('Registration saved. Runtime files were not changed.');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="analysis-card registration">
      <summary>Register an existing {report.name} installation</summary>
      <p className="subtle">
        Inspection reads paths and hashes the executable. Registration records a local configuration; it does
        not install or run downloaded code. Use your installed runtime, not an executable from an untrusted
        mod archive.
      </p>
      <fieldset disabled={busy}>
        {(['root', 'executable', 'dataRoot'] as const).map((kind) => (
          <label key={kind}>
            {kind === 'root'
              ? 'Installation directory'
              : kind === 'executable'
                ? 'Installed executable'
                : 'Runtime data root (contains maps / maps_ce / other runtime folders)'}
            <div className="path-input">
              <input
                value={draft[kind] ?? ''}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [kind]: e.target.value || (kind === 'dataRoot' ? null : '') }))
                }
              />
              <button onClick={() => void browse(kind)}>Browse</button>
            </div>
          </label>
        ))}
        <div className="compare-selectors">
          <label>
            Runtime build (user declaration)
            <input
              value={draft.version ?? ''}
              maxLength={128}
              onChange={(e) => setDraft((d) => ({ ...d, version: e.target.value || null }))}
              placeholder="Unknown until you supply a build token"
            />
          </label>
          <label>
            Network version (user declaration)
            <input
              value={draft.networkVersion ?? ''}
              maxLength={128}
              onChange={(e) => setDraft((d) => ({ ...d, networkVersion: e.target.value || null }))}
              placeholder="Unknown until you supply a network token"
            />
          </label>
        </div>
        <div className="analysis-actions">
          <button disabled={!draft.root || !draft.executable} onClick={() => void inspect()}>
            Inspect registration
          </button>
          <button
            className="primary"
            disabled={inspection?.validation !== 'pass' || inspected !== fingerprint}
            onClick={() => void register()}
          >
            Save registration
          </button>
        </div>
      </fieldset>
      {inspection && inspected === fingerprint && (
        <>
          <Pill tone={tone(inspection.validation)}>{inspection.validation}</Pill>
          <p>
            Executable SHA-256:{' '}
            <code className="wrap-code">{inspection.executableSha256 ?? 'Unavailable'}</code>
          </p>
          {inspection.diagnostics.map((d, i) => (
            <Notice key={i}>{d}</Notice>
          ))}
        </>
      )}
      {error && <Notice>{error}</Notice>}
      {message && <Notice tone="info">{message}</Notice>}
    </details>
  );
}

const modeNames: Record<MultiplayerMode, string> = {
  mccCoopCampaign: 'MCC co-op campaign',
  mccCustomMultiplayer: 'MCC custom multiplayer',
  nativeCoop: 'Native co-op',
  nativeMultiplayer: 'Native multiplayer',
  legacyMultiplayer: 'Legacy multiplayer',
};
function Friends({
  report,
  project,
  dirty,
  onSave,
}: {
  report: RuntimeReport;
  project: Project | null;
  dirty: boolean;
  onSave: () => Promise<void>;
}) {
  const [mode, setMode] = useState<MultiplayerMode>(
    report.id === 'mccSteam'
      ? 'mccCustomMultiplayer'
      : ['haloPc', 'haloCustomEdition'].includes(report.id)
        ? 'legacyMultiplayer'
        : 'nativeMultiplayer',
  );
  const [antiCheat, setAntiCheat] = useState('unknown');
  const [local, setLocal] = useState<PeerManifest | null>(null);
  const [peer, setPeer] = useState<PeerManifest | null>(null);
  const [result, setResult] = useState<PeerPreflight | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [manifestProject, setManifestProject] = useState<Project | null>(null);
  const stale = dirty || (!!local && manifestProject !== project);
  useEffect(() => {
    setLocal(null);
    setResult(null);
  }, [
    mode,
    antiCheat,
    report.installation?.executableSha256,
    report.installation?.version,
    report.installation?.networkVersion,
  ]);
  useEffect(() => {
    if (stale) setResult(null);
  }, [stale]);
  async function perform(f: () => Promise<void>) {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await f();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Notice tone="info">
        This compares local, shareable file manifests. Imported declarations are untrusted. “Manifests agree”
        means compared fields align; no connection, hosting, AI synchronization or two-PC gameplay has been
        tested.
      </Notice>
      <section className="analysis-card">
        <h2>1. Create your local manifest</h2>
        <p>{project?.source ? project.title : 'Open a source-map project to create a manifest.'}</p>
        <fieldset disabled={busy}>
          <label>
            Intended session mode
            <select value={mode} onChange={(e) => setMode(e.target.value as MultiplayerMode)}>
              {Object.entries(modeNames).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Anti-cheat state (your declaration, not detected)
            <select value={antiCheat} onChange={(e) => setAntiCheat(e.target.value)}>
              <option value="unknown">Unknown</option>
              <option value="disabled">I have disabled anti-cheat for this session</option>
              <option value="enabled">Anti-cheat is enabled</option>
            </select>
          </label>
          <div className="analysis-actions">
            <button
              className="primary"
              disabled={!project?.source}
              onClick={() =>
                void perform(async () => {
                  setLocal(null);
                  setResult(null);
                  if (dirty) await onSave();
                  const manifest = await call<PeerManifest>('create_peer_manifest', {
                    projectId: project!.id,
                    runtimeId: report.id,
                    mode,
                    antiCheatDisabled: antiCheat === 'unknown' ? null : antiCheat === 'disabled',
                  });
                  setLocal(manifest);
                  setManifestProject(project);
                })
              }
            >
              <ShieldCheck size={15} />
              {dirty ? 'Save & create manifest' : 'Create manifest'}
            </button>
            <button
              disabled={!local || stale}
              onClick={() =>
                void perform(async () => {
                  const path = await call<string | null>('export_peer_manifest', { manifest: local });
                  if (path) setMessage(`Manifest exported to ${path}`);
                })
              }
            >
              <Download size={15} />
              Export my manifest
            </button>
          </div>
        </fieldset>
        {stale && local && (
          <Notice>
            The project changed since this manifest was created. Create a fresh manifest before exporting or
            comparing.
          </Notice>
        )}
        {local && <ManifestSummary title="Your manifest" manifest={local} />}
        <p className="subtle">
          Exports contain version declarations and content hashes. Installation paths, account names and
          network addresses are excluded.
        </p>
      </section>
      <section className="analysis-card">
        <h2>2. Compare a friend’s manifest</h2>
        <div className="analysis-actions">
          <button
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                const incoming = await call<PeerManifest | null>('choose_peer_manifest');
                if (incoming) {
                  setPeer(incoming);
                  setResult(null);
                }
              })
            }
          >
            <Upload size={15} />
            Import peer manifest
          </button>
          <button
            disabled={busy || !local || !peer || stale}
            onClick={() =>
              void perform(async () => {
                setResult(null);
                setResult(await call<PeerPreflight>('compare_peer_manifest', { local, peer }));
              })
            }
          >
            Compare manifests
          </button>
        </div>
        {peer && <ManifestSummary title="Peer declaration (untrusted)" manifest={peer} />}
      </section>
      {error && <Notice>{error}</Notice>}
      {message && <Notice tone="info">{message}</Notice>}
      {result && (
        <section className="analysis-card preflight-result">
          <h2>
            {result.status === 'pass'
              ? 'Manifests agree'
              : result.status === 'fail'
                ? 'Manifest mismatch'
                : 'Preflight blocked'}
          </h2>
          <Pill tone={tone(result.status)}>{result.status}</Pill>
          <p>Scope: manifest comparison only. Gameplay verified: no.</p>
          {result.checks.map((check, index) => (
            <div className="preflight-check" key={`${check.key}-${index}`}>
              <Pill tone={tone(check.status)}>{check.status}</Pill>
              <strong>{check.key}</strong>
              <p>{check.detail}</p>
            </div>
          ))}
          {result.diagnostics.map((d, i) => (
            <Notice key={i}>{d}</Notice>
          ))}
        </section>
      )}
    </>
  );
}
function ManifestSummary({ title, manifest }: { title: string; manifest: PeerManifest }) {
  return (
    <details className="manifest-summary">
      <summary>
        {title} · {manifest.runtimeId} · {manifest.platform}
      </summary>
      <div className="metadata-grid">
        <div>
          <small>Runtime build</small>
          <strong>{manifest.runtimeBuild ?? 'Unknown'}</strong>
        </div>
        <div>
          <small>Network version</small>
          <strong>{manifest.networkVersion ?? 'Unknown'}</strong>
        </div>
        <div>
          <small>Build verification</small>
          <strong>{manifest.buildVerified ? 'Verified output' : 'Missing proof'}</strong>
        </div>
        <div>
          <small>Resource set</small>
          <strong>{manifest.resourceSetVerified ? 'Verified set' : 'Missing proof'}</strong>
        </div>
      </div>
      <pre>{JSON.stringify(manifest, null, 2)}</pre>
    </details>
  );
}

export function LiveLab({ onBuild }: { onBuild: () => void }) {
  return (
    <div className="analysis-page">
      <PageTitle
        eyebrow="LIVE LAB / BRIDGE STATUS"
        title="Live editing needs a verified bridge"
        description="The workbench currently edits saved project overlays and rebuilds caches."
      />
      <section className="analysis-card live-status">
        <Unplug size={30} />
        <div>
          <h2>Disconnected · no live bridge implemented</h2>
          <p>
            Runtime discovery and opening a game process do not establish an editor connection. No telemetry,
            command acknowledgement, live property mutation, spawning, AI dispatch or VR session is available.
          </p>
        </div>
        <Pill tone="amber">Blocked</Pill>
      </section>
      <section className="analysis-card">
        <h2>Available workflow</h2>
        <ol className="workflow-steps">
          <li>Edit audited tag fields and source placements in the workbench.</li>
          <li>Save the project and run the configured extraction / rebuild pipeline.</li>
          <li>Review validation and packaging results before manually testing in the intended runtime.</li>
        </ol>
        <button className="primary" onClick={onBuild}>
          Open Build &amp; playtest
        </button>
        <p className="subtle">
          Rebuild status is file validation evidence. It does not certify visual behavior, collision, AI,
          multiplayer or VR in a running game.
        </p>
      </section>
    </div>
  );
}
