import { useEffect, useState } from 'react';
import { call, native } from '../api';
import { primaryRuntimes } from '../useRuntimeConnections';
import { runtimeNames,runtimeProfileName,runtimeProfileLabel,type OpenCeFlavor } from '../runtimeWorkbench';
import type { RuntimeId, RuntimeRegistration } from '../types';
export default function HeaderRuntime({
  value,
  onChange,onSetupFlavor,
}: {
  value: RuntimeId;
  onChange: (id: RuntimeId) => void;
  onSetupFlavor?:(flavor:OpenCeFlavor)=>void;
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
    if(key==='setup:openh1'||key==='setup:faber'||key==='setup:forerunner'){onSetupFlavor?.(key.slice(6) as OpenCeFlavor);return;}
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
  return (
    <label
      className="gs-runtime-switch"
      title={
        error ||
        'Choose the engine for the next Play/Tools launch. Switching never changes a running game or the map source edition. Add engine profiles and share compatible content in Games & tools.'
      }
    >
      <span className="live-dot" aria-hidden="true" />
      <select
        aria-label="Active Halo runtime"
        disabled={busy}
        value={multiple && selected ? 'profile:' + selected.id : value}
        onChange={(event) => void change(event.target.value)}
      >
        {primaryRuntimes.filter(id=>!['openCe','chupathingyCe'].includes(id)).map(id=><option value={id} key={id}>{runtimeNames[id]}</option>)}
        <optgroup label="OpenCE flavors · community engines">
        {(['chupathingyCe','openCe'] as const).flatMap(id=>{
          const options=profiles.filter(item=>item.runtimeId===id);
          return options.length>1||options.some(item=>runtimeProfileName(item)!==runtimeNames[id])?options.map(item=><option value={'profile:'+item.id} key={item.id}>{runtimeProfileLabel(item)}</option>):[<option value={id} key={id}>{runtimeNames[id]}</option>];
        })}
        {!profiles.some(item=>runtimeProfileName(item)==='OpenH1')&&<option value="setup:openh1">OpenH1 · connect or download…</option>}
        {!profiles.some(item=>runtimeProfileName(item)==='Faber')&&<option value="setup:faber">Faber · connect or download…</option>}
        {!profiles.some(item=>runtimeProfileName(item)==='Forerunner')&&<option value="setup:forerunner">Forerunner · connect installed build…</option>}
        </optgroup>
        {!primaryRuntimes.some((id) => id === value) && <option value={value}>{runtimeNames[value]}</option>}
      </select>
      <span className="sr-only" role="status">
        {error}
      </span>
    </label>
  );
}
