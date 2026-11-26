import { useEffect, useState } from 'react';
import { call, native } from '../api';
import { primaryRuntimes } from '../useRuntimeConnections';
import { runtimeNames,runtimeProfileName,runtimeProfileLabel,type OpenCeFlavor } from '../runtimeWorkbench';
import type { RuntimeId, RuntimeRegistration } from '../types';
export default function HeaderRuntime({
  value,
  onChange,onSetupFlavor, label, ariaLabel = 'Active Halo runtime', className = 'gs-runtime-switch', includeCompatibility = false,
}: {
  value: RuntimeId;
  onChange: (id: RuntimeId) => void;
  onSetupFlavor?:(flavor:OpenCeFlavor)=>void;
  label?: string;
  ariaLabel?: string;
  className?: string;
  includeCompatibility?: boolean;
}) {
  const [profiles, setProfiles] = useState<RuntimeRegistration[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    const refresh = () => {
      if (native)
        void call<RuntimeRegistration[]>('list_runtime_registrations')
          .then((items) => {
            if (current) setProfiles(items);
          })
          .catch((e) => {
            if (current) setError(String(e));
          });
    };
    refresh();
    window.addEventListener('guilty-spark-runtime-connections-changed', refresh);
    return () => {
      current = false;
      window.removeEventListener('guilty-spark-runtime-connections-changed', refresh);
    };
  }, []);
  const selected = profiles.find((item) => item.runtimeId === value);
  const multiple = profiles.filter((item) => item.runtimeId === value).length > 1||!!selected&&runtimeProfileName(selected)!==runtimeNames[value];
  const change = async (key: string) => {
    if(key==='setup:opence'||key==='setup:openh1'||key==='setup:faber'||key==='setup:forerunner'){onSetupFlavor?.(key.slice(6) as OpenCeFlavor);return;}
    if (!key.startsWith('profile:')) {
      onChange(key as RuntimeId);
      return;
    }
    const profile = profiles.find((item) => item.id === key.slice(8));
    if (!profile) return;
    setBusy(true);
    setError('');
    try {
      await call('activate_runtime_registration', { registrationId: profile.id });
      setProfiles((items) => [profile, ...items.filter((item) => item.id !== profile.id)]);
      onChange(profile.runtimeId);
      window.dispatchEvent(new Event('guilty-spark-runtime-connections-changed'));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const forerunnerProfiles = profiles.filter(item => runtimeProfileName(item) === 'Forerunner');
  const communityProfiles = profiles.filter(item => item.runtimeId === 'openCe' && runtimeProfileName(item) !== 'Forerunner');
  const compatibility = (Object.keys(runtimeNames) as RuntimeId[]).filter(id =>
    !['chupathingyCe', 'mccSteam', 'openCe'].includes(id) &&
    (includeCompatibility || id === value || primaryRuntimes.some(runtime => runtime === id)));
  const profileOptions = (rows: RuntimeRegistration[]) =>
    rows.map(item => <option value={'profile:' + item.id} key={item.id}>{runtimeProfileLabel(item)}</option>);
  function optionsFor(id: 'chupathingyCe' | 'openCe', rows = profiles.filter(item => item.runtimeId === id)) {
    const custom = profiles.filter(item => item.runtimeId === id).length > 1 ||
      rows.some(item => runtimeProfileName(item) !== runtimeNames[id]);
    return custom && rows.length ? profileOptions(rows) : <option value={id}>{runtimeNames[id]}</option>;
  }
  return (
    <label
      className={className}
      title={
        error ||
        'Choose the engine for the next Play/Tools launch. Switching never changes a running game or the map source edition. Add engine profiles and share compatible content in Games & tools.'
      }
    >
      {label ? <span>{label}</span> : <span className="live-dot" aria-hidden="true" />}
      <select
        aria-label={ariaLabel}
        disabled={busy}
        value={multiple && selected ? 'profile:' + selected.id : value}
        onChange={(event) => void change(event.target.value)}
      >
        <optgroup label="Flagship">
          {optionsFor('chupathingyCe')}
          {profileOptions(forerunnerProfiles)}
          {!forerunnerProfiles.length && onSetupFlavor && <option value="setup:forerunner">Forerunner · connect installed build…</option>}
          <option value="mccSteam">{runtimeNames.mccSteam}</option>
        </optgroup>
        <optgroup label="Compatibility">
          {!communityProfiles.length && forerunnerProfiles.length > 0
            ? onSetupFlavor && <option value="setup:opence">OpenCE · connect or download…</option>
            : optionsFor('openCe', communityProfiles)}
          {compatibility.map(id => <option value={id} key={id}>{runtimeNames[id]}</option>)}
          {onSetupFlavor && !communityProfiles.some(item=>runtimeProfileName(item)==='OpenH1') && <option value="setup:openh1">OpenH1 · connect or download…</option>}
          {onSetupFlavor && !communityProfiles.some(item=>runtimeProfileName(item)==='Faber') && <option value="setup:faber">Faber · connect or download…</option>}
        </optgroup>
      </select>
      <span className="sr-only" role="status">
        {error}
      </span>
    </label>
  );
}
