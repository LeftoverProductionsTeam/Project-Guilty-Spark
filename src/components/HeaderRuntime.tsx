import {primaryRuntimes} from '../useRuntimeConnections';
import {runtimeNames} from '../runtimeWorkbench';
import type {RuntimeId} from '../types';
export default function HeaderRuntime({value,onChange}:{value:RuntimeId;onChange:(id:RuntimeId)=>void}){
  return <label className="gs-runtime-switch" title="Switch your default Halo. Each open map keeps its own source and tools.">
    <span className="live-dot" aria-hidden="true"/>
    <select aria-label="Default Halo runtime" value={value} onChange={event=>onChange(event.target.value as RuntimeId)}>
      {primaryRuntimes.map(id=><option value={id} key={id}>{runtimeNames[id]}</option>)}
    </select>
  </label>;
}
