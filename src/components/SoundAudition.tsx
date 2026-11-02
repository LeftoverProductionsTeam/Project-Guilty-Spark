import { useEffect, useRef, useState } from 'react';
import { Play, Square, Volume2 } from 'lucide-react';
import { call } from '../api';
import type { AudioPreview, SoundInspection } from '../types';

export interface AuditionTrack { projectId:string; tagId:number; sourceHash:string }
// A single audition bus avoids overlapping dozens of card previews. It is
// independent of the map mix: muting ambience must not mute a requested sample.
let context:AudioContext|null=null, source:AudioBufferSourceNode|null=null, generation=0;
const stop=()=>{generation++;source?.stop();source=null;};
export default function SoundAudition({tracks,label='Preview sound'}:{tracks:()=>Promise<AuditionTrack[]>;label?:string}){
  const [state,setState]=useState<'idle'|'loading'|'playing'>('idle'),[error,setError]=useState('');
  const mine=useRef(0),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(mine.current===generation)stop();};},[]);
  async function play(){
    if(state==='playing'){stop();setState('idle');return;}
    stop();const token=generation;mine.current=token;setState('loading');setError('');
    try{
      // Resume during the click, before waiting for native IPC or extraction.
      context??=new AudioContext();await context.resume();
      if(context.state!=='running')throw Error('Audio is paused by the system. Click Play again.');
      const choices=await tracks();let chosen:{track:AuditionTrack;pitch:number;permutation:number}|undefined;
      for(const track of choices.slice(0,8)){
        const report=await call<SoundInspection>('inspect_sound',{projectId:track.projectId,tagId:track.tagId});
        if(report.sourceSha256!==track.sourceHash)throw Error('Sound source changed. Refresh the asset library.');
        const sample=report.permutations.find(p=>p.available&&p.chainStart)??report.permutations.find(p=>p.available);
        if(sample){chosen={track,pitch:sample.pitchRange,permutation:sample.permutation};break;}
        if(choices.length===1)throw Error(report.permutations.find(p=>p.reason)?.reason??report.warnings[0]??'No playable sample. Connect this map’s sound resources.');
      }
      if(!chosen)throw Error('This sound has no playable sample in the connected resources.');
      const preview=await call<AudioPreview>('preview_sound',{projectId:chosen.track.projectId,tagId:chosen.track.tagId,pitchRange:chosen.pitch,permutation:chosen.permutation});
      if(preview.sourceSha256!==chosen.track.sourceHash||!['audio/ogg','audio/wav'].includes(preview.mime)||!preview.bytes.length||preview.bytes.length>16*1024*1024)throw Error('Sound preview identity or format failed verification.');
      const bytes=new Uint8Array(preview.bytes);
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
      if(digest!==preview.sha256)throw Error('Sound preview checksum differs from the native sample.');
      const buffer=await context.decodeAudioData(bytes.buffer);
      if(!alive.current||token!==generation)return;
      source=context.createBufferSource();source.buffer=buffer;
      const gain=context.createGain();gain.gain.value=.65;source.connect(gain).connect(context.destination);
      source.onended=()=>{gain.disconnect();if(alive.current&&token===generation){source=null;setState('idle');}};
      source.start();setState('playing');
    }catch(reason){if(alive.current&&token===generation){setError(String(reason));setState('idle');}}
  }
  return <div className="sound-audition" data-audition-state={state}>
    <button type="button" disabled={state==='loading'} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();void play();}} aria-label={state==='playing'?'Stop sound preview':label}>
      {state==='playing'?<Square size={13}/>:state==='loading'?<Volume2 size={13}/>:<Play size={13}/>}
      {state==='playing'?'Stop':state==='loading'?'Loading…':label}
    </button>
    {error&&<small role="alert">{error}</small>}
  </div>;
}
