import { Gamepad2 } from 'lucide-react';
import {useEffect,useRef} from 'react';
import {useWorkspaceActivity} from './WorkspaceActivity';
import { primaryRuntimes, useRuntimeConnections } from '../useRuntimeConnections';
import { runtimeNames, runtimeProfileName } from '../runtimeWorkbench';
import type { Bootstrap, RuntimeId } from '../types';
export default function HomeRuntimes({ data, onSelect, onForerunner }: { data: Bootstrap; onSelect: (id: RuntimeId) => void; onForerunner: () => void }) {
  const { reports, profiles, detected, checking, error, refresh } = useRuntimeConnections(data);
  const {active}=useWorkspaceActivity(),wasActive=useRef(active);
  // A retained Home keeps its model, but must refresh installation status after
  // another workspace connects a runtime. This never reloads model geometry.
  useEffect(()=>{if(active&&!wasActive.current)void refresh();wasActive.current=active;},[active,refresh]);
  return <div className="home-runtime-connections" role="group" aria-label="Your Halo installations">
    {(['chupathingyCe','forerunner',...primaryRuntimes.filter(id=>id!=='chupathingyCe')] as const).map(id => {
      const registration = id === 'forerunner' ? profiles.find(profile => runtimeProfileName(profile) === 'Forerunner') : undefined;
      const installed = reports.find(item => item.id === (id === 'forerunner' ? 'openCe' : id))?.installation;
      const activeProfile = profiles.find(item => item.id === installed?.registrationId);
      const activeForerunner = !!activeProfile && runtimeProfileName(activeProfile) === 'Forerunner';
      const connected = id === 'forerunner' ? (activeForerunner ? installed : undefined) : (id === 'openCe' && activeForerunner ? undefined : installed);
      const candidate = detected.find(item => id === 'forerunner' ? item.version === 'Forerunner' : item.runtimeId === id && item.version !== 'Forerunner');
      const ready = connected?.validation === 'pass';
      const name = id === 'forerunner' ? 'Forerunner' : runtimeNames[id];
      const status = ready ? 'Connected' : registration ? 'Choose profile' : candidate ? (candidate.contentReady ? 'Detected' : 'Needs content') : checking ? 'Checking…' : 'Connect';
      return <button key={id} data-connected={ready} data-detected={!!candidate} aria-label={`${name} · ${status}`}
        title={connected?.root ?? registration?.root ?? candidate?.root ?? `Connect ${name}`} onClick={() => id === 'forerunner' ? onForerunner() : onSelect(id)}>
        <Gamepad2 size={15}/><strong>{name}</strong><small>{status}</small>
      </button>;
    })}
    {error && <small className="home-runtime-error" role="status">{error}</small>}
  </div>;
}
