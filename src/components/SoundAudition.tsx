import { useEffect, useId, useSyncExternalStore } from 'react';
import { Play, Square } from 'lucide-react';
import { soundAuditionBus } from '../soundAuditionBus';
import type { AuditionTrack } from '../soundAuditionBus';
import '../soundInspector.css';
export type { AuditionTrack } from '../soundAuditionBus';

export default function SoundAudition({tracks,label='Play sound',volume=.65,repeat=false}:{tracks:()=>Promise<AuditionTrack[]>;label?:string;volume?:number;repeat?:boolean}){
  const owner=useId(),bus=useSyncExternalStore(soundAuditionBus.subscribe,soundAuditionBus.getSnapshot);
  const mine=bus.owner===owner,active=mine&&bus.phase!=='idle';
  useEffect(()=>()=>soundAuditionBus.stop(owner),[owner]);
  useEffect(()=>soundAuditionBus.configure(owner,{volume,repeat}),[owner,volume,repeat]);
  return <div className="sound-audition" data-audition-state={mine?bus.phase:'idle'}>
    <button type="button" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();if(active)soundAuditionBus.stop(owner);else void soundAuditionBus.play(owner,tracks,{volume,repeat});}} aria-label={active?'Stop sound preview':label}>
      {active?<Square size={13}/>:<Play size={13}/>}
      {active?bus.phase==='loading'?'Cancel loading':'Stop':label}
    </button>
    {mine&&bus.duration>0&&<small title={bus.name}>{bus.name} · {bus.duration.toFixed(2)} s</small>}
    {mine&&bus.error&&<small role="alert">{bus.error}</small>}
  </div>;
}
