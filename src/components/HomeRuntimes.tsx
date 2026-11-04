import { Gamepad2 } from 'lucide-react';
import {useEffect,useRef} from 'react';
import {useWorkspaceActivity} from './WorkspaceActivity';
import { primaryRuntimes, useRuntimeConnections } from '../useRuntimeConnections';
import { runtimeNames } from '../runtimeWorkbench';
import type { Bootstrap, RuntimeId } from '../types';
export default function HomeRuntimes({ data, onSelect }: { data: Bootstrap; onSelect: (id: RuntimeId) => void }) {
  const { reports, detected, checking, error, refresh } = useRuntimeConnections(data);
  const {active}=useWorkspaceActivity(),wasActive=useRef(active);
  // A retained Home keeps its model, but must refresh installation status after
  // another workspace connects a runtime. This never reloads model geometry.
  useEffect(()=>{if(active&&!wasActive.current)void refresh();wasActive.current=active;},[active,refresh]);
  return <div className="home-runtime-connections" role="group" aria-label="Your Halo installations">
    {primaryRuntimes.map(id => {
      const connected = reports.find(item => item.id === id)?.installation;
      const candidate = detected.find(item => item.runtimeId === id);
      const ready = connected?.validation === 'pass';
      const status = ready ? 'Connected' : candidate ? (candidate.contentReady ? 'Detected' : 'Needs content') : checking ? 'Checking…' : 'Connect';
      return <button key={id} data-connected={ready} data-detected={!!candidate} aria-label={`${runtimeNames[id]} · ${status}`}
        title={connected?.root ?? candidate?.root ?? `Connect ${runtimeNames[id]}`} onClick={() => onSelect(id)}>
        <Gamepad2 size={15}/><strong>{runtimeNames[id]}</strong><small>{status}</small>
      </button>;
    })}
    {error && <small className="home-runtime-error" role="status">{error}</small>}
  </div>;
}
