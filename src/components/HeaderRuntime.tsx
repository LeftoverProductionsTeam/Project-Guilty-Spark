import {primaryRuntimes} from '../useRuntimeConnections';
import {runtimeNames} from '../runtimeWorkbench';
import type {RuntimeId} from '../types';
export default function HeaderRuntime({value,onChange}:{value:RuntimeId;onChange:(id:RuntimeId)=>void}){
  return <label className="gs-runtime-switch" title="Choose the Halo used by Play and Tools. This choice is remembered for each map; its source edition stays unchanged.">
    <span className="live-dot" aria-hidden="true"/>
    <select aria-label="Active Halo runtime" value={value} onChange={event=>onChange(event.target.value as RuntimeId)}>
      {primaryRuntimes.map(id=><option value={id} key={id}>{runtimeNames[id]}</option>)}
      {!primaryRuntimes.some(id=>id===value)&&<option value={value}>{runtimeNames[value]}</option>}
    </select>
  </label>;
}
