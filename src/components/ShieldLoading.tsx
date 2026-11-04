import {useEffect,useState} from 'react';
import './shieldLoading.css';
/** Indeterminate feedback for real pending work. No estimated percentage or
 * artificial readiness delay; brief cache hits never flash a loading overlay. */
export default function ShieldLoading({phase,active=true,delay=140}:{phase:string|null;active?:boolean;delay?:number}){
  const [visible,setVisible]=useState(false),pending=!!phase;
  useEffect(()=>{if(!pending){setVisible(false);return;}const timer=setTimeout(()=>setVisible(true),delay);return()=>clearTimeout(timer);},[pending,delay]);
  if(!phase||!visible)return null;
  return <div className="gs-shield-loading" role="status" aria-live="polite" data-paused={!active}><span className="gs-shield-segments" aria-hidden="true">{Array.from({length:12},(_,i)=><i key={i} style={{animationDelay:`${i*65}ms`}}/>)}</span><span>{phase}</span></div>;
}
