import {useState} from 'react';
import {call} from '../api';
import {relocateRuntimeRegistration} from '../runtimeWorkbench';
import type {RuntimeReport,RuntimeRegistration,RuntimeInstallation} from '../types';
import {Notice,Pill} from './ui';
const tone=(status:string)=>status==='pass'?'green':'amber';

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
  const [inspection, setInspection] = useState<RuntimeInstallation | null>(null);
  const [inspected, setInspected] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const fingerprint = JSON.stringify(draft);
  async function browse(kind: 'executable' | 'root' | 'dataRoot') {
    try {
      const value = await call<string | null>('choose_runtime_path', { kind });
      if (value) setDraft(d => kind==='root' ? relocateRuntimeRegistration(d,value) : {...d,[kind]:value});
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
      window.dispatchEvent(new Event('guilty-spark-runtime-connections-changed'));
      setMessage('Registration saved. Runtime files were not changed.');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="analysis-card registration" open={initialOpen}>
      <summary>{installation ? 'Update' : 'Connect'} {report.name} folders</summary>
      <p className="subtle">
        Inspection reads paths and hashes the executable. Registration records a local configuration; it does
        not install or run downloaded code. Use your installed runtime, not an executable from an untrusted
        mod archive.
      </p>
      <fieldset disabled={busy}>
        <p className="subtle">Moved your game? Choose its installation folder. Paths inside that folder move together; separate data folders stay where you selected them. Inspect, then save.</p>
        {(['root', 'executable', 'dataRoot'] as const).map((kind) => (
          <label key={kind}>
            {kind === 'root'
              ? 'Installation directory'
              : kind === 'executable'
                ? 'Installed executable'
                : 'Runtime data root (contains maps / maps_ce / other runtime folders)'}
            <div className="path-input">
              <input
                aria-label={kind === 'root' ? 'Installation directory' : kind === 'executable' ? 'Installed executable' : 'Runtime data root'}
                value={draft[kind] ?? ''}
                onChange={(e) =>
                  setDraft((d) => kind === 'root' ? relocateRuntimeRegistration(d, e.target.value) : ({ ...d, [kind]: e.target.value || (kind === 'dataRoot' ? null : '') }))
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

