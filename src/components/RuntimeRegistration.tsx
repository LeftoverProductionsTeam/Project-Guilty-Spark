import { useEffect, useState } from 'react';
import { call, native } from '../api';
import { relocateRuntimeRegistration } from '../runtimeWorkbench';
import type { RuntimeReport, RuntimeRegistration, RuntimeInstallation } from '../types';
import { Notice, Pill } from './ui';
const tone = (status: string) => (status === 'pass' ? 'green' : 'amber');

export default function Registration({
  report,
  onRegistered,
  initialOpen = false,
}: {
  report: RuntimeReport;
  initialOpen?: boolean;
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
  const [profiles, setProfiles] = useState<RuntimeRegistration[]>([]);
  useEffect(() => {
    let current = true;
    if (native)
      void call<RuntimeRegistration[]>('list_runtime_registrations')
        .then((items) => {
          if (current) setProfiles(items);
        })
        .catch((e) => {
          if (current) setError(String(e));
        });
    return () => {
      current = false;
    };
  }, [report.id, report.installation?.registrationId]);
  async function useProfile(id: string) {
    const chosen = profiles.find((item) => item.id === id);
    if (!chosen) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      onRegistered(await call<RuntimeReport[]>('activate_runtime_registration', { registrationId: id }));
      setDraft(chosen);
      setInspection(null);
      window.dispatchEvent(new Event('guilty-spark-runtime-connections-changed'));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function prepareCe() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await call<{ copied: string[]; reused: string[]; bytesCopied: number }>(
        'prepare_runtime_ce_resources',
        { registrationId: draft.id, expectedDataRoot: draft.dataRoot || draft.root },
      );
      setMessage(
        'Custom Edition support ready: ' +
          result.copied.length +
          ' banks added, ' +
          result.reused.length +
          ' reused. Original files are unchanged.',
      );
      window.dispatchEvent(new Event('guilty-spark-runtime-connections-changed'));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const [inspection, setInspection] = useState<RuntimeInstallation | null>(null);
  const [inspected, setInspected] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const fingerprint = JSON.stringify(draft);
  async function browse(kind: 'executable' | 'root' | 'dataRoot') {
    try {
      const value = await call<string | null>('choose_runtime_path', { kind });
      if (value)
        setDraft((d) => (kind === 'root' ? relocateRuntimeRegistration(d, value) : { ...d, [kind]: value }));
    } catch (e) {
      setError(String(e));
    }
  }
  async function inspect() {
    setBusy(true);
    setInspection(null);
    setInspected('');
    setMessage('');
    setError('');
    try {
      setInspection(await call<RuntimeInstallation>('inspect_runtime_registration', { registration: draft }));
      if (draft.dataRoot && draft.dataRoot !== draft.root) await call('inspect_runtime_launch',{registration:draft});
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
      window.dispatchEvent(new Event('guilty-spark-runtime-connections-changed'));
      setProfiles(await call<RuntimeRegistration[]>('list_runtime_registrations'));
      setMessage('Registration saved. Runtime files were not changed.');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="analysis-card registration" open={initialOpen}>
      <summary>
        {installation ? 'Update' : 'Connect'} {report.name} folders
      </summary>
      <p className="subtle">
        Inspection reads paths and hashes the executable. Registration records a local configuration; it does
        not install or run downloaded code. Use your installed runtime, not an executable from an untrusted
        mod archive.
      </p>
      <fieldset disabled={busy}>
        {profiles.filter((item) => item.runtimeId === report.id).length > 0 && (
          <label>
            Saved engine
            <select
              aria-label="Saved engine profile"
              value={profiles.some((item) => item.id === draft.id) ? draft.id : ''}
              onChange={(event) => void useProfile(event.target.value)}
            >
              {!profiles.some((item) => item.id === draft.id) && <option value="">New engine</option>}
              {profiles
                .filter((item) => item.runtimeId === report.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.root.replaceAll('\\', '/').split('/').filter(Boolean).at(-1)}
                    {item.version ? ' · ' + item.version : ''}
                  </option>
                ))}
            </select>
          </label>
        )}
        {report.id === 'openCe' && (
          <button
            onClick={() => {
              setDraft({
                id: crypto.randomUUID(),
                runtimeId: report.id,
                root: '',
                executable: '',
                dataRoot: null,
                version: null,
                networkVersion: null,
              });
              setInspection(null);
              setMessage(
                'Connect another installed OpenCE engine, such as Faber. Existing profiles stay available.',
              );
            }}
          >
            Add another OpenCE engine
          </button>
        )}
        <p className="subtle">
          Moved your game? Choose its installation folder. Paths inside that folder move together; separate
          data folders stay where you selected them. Inspect, then save.
        </p>
        {(['root', 'executable', 'dataRoot'] as const).map((kind) => (
          <label key={kind}>
            {kind === 'root'
              ? 'Installation directory'
              : kind === 'executable'
                ? 'Installed executable'
                : 'Runtime data root (contains maps / maps_ce / other runtime folders)'}
            <div className="path-input">
              <input
                aria-label={
                  kind === 'root'
                    ? 'Installation directory'
                    : kind === 'executable'
                      ? 'Installed executable'
                      : 'Runtime data root'
                }
                value={draft[kind] ?? ''}
                onChange={(e) =>
                  setDraft((d) =>
                    kind === 'root'
                      ? relocateRuntimeRegistration(d, e.target.value)
                      : { ...d, [kind]: e.target.value || (kind === 'dataRoot' ? null : '') },
                  )
                }
              />
              <button onClick={() => void browse(kind)}>Browse</button>
            </div>
          </label>
        ))}
        {(report.id === 'openCe' || report.id === 'chupathingyCe') && (
          <div className="runtime-shared-content">
            <label>
              Share an existing content library
              <select
                aria-label="Shared runtime content"
                value=""
                onChange={(event) => {
                  if (event.target.value) setDraft((d) => ({ ...d, dataRoot: event.target.value }));
                }}
              >
                <option value="">Choose a connected library…</option>
                {Array.from(
                  new Map(
                    profiles
                      .filter((item) => item.runtimeId === 'openCe' || item.runtimeId === 'chupathingyCe')
                      .map((item) => [item.dataRoot || item.root, item]),
                  ).entries(),
                ).map(([root, item]) => (
                  <option key={root} value={root}>
                    {item.root.replaceAll('\\', '/').split('/').filter(Boolean).at(-1)} · maps
                  </option>
                ))}
              </select>
            </label>
            <p className="subtle">
              One content folder for supported engines: Xbox maps in maps; CE maps and banks in maps_ce.
              Executables stay separate. Save this profile before setup. Stock CE and MCC keep their native
              layouts.
            </p>
            <button
              disabled={!profiles.some((item) => item.id === draft.id)}
              onClick={() => void prepareCe()}
            >
              Set up Custom Edition maps
            </button>
            <small>
              Finds the three banks in your connected CE installation, verifies them, and adds only missing
              files. Different existing banks are preserved.
            </small>
          </div>
        )}
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
            disabled={!inspection || (inspection.validation !== 'pass' && report.id !== 'arenaEvolved') || inspected !== fingerprint}
            onClick={() => void register()}
          >
            {report.id==='arenaEvolved'?'Save folders (launch unverified)':'Save registration'}
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
