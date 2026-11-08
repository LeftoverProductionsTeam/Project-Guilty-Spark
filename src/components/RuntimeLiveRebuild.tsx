import {useEffect,useRef,useState} from 'react';
import {Play,RefreshCw,Square} from 'lucide-react';
import {call,native} from '../api';
import type {Project} from '../types';
import {useWorkspaceActivity} from './WorkspaceActivity';
import {Notice} from './ui';
interface Session {
  id:string;projectId:string;phase:string;sourceFingerprint:string;
  compiledBuildId:string;compiledSha256:string;gameBuildId:string|null;gameSha256:string|null;
  processId:number|null;pendingJobId:string|null;detail:string;error:string|null;consoleTail:string;ceResourceSha256?:Record<string,string>;
}
export default function RuntimeLiveRebuild({project,onSave}:{project:Project|null;onSave?:()=>Promise<void>}) {
  const {active}=useWorkspaceActivity(),[session,setSession]=useState<Session|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const generation=useRef(0),requesting=useRef(false),acting=useRef(false),version=useRef(0);
  useEffect(()=>{
    const epoch=++generation.current;
    setBusy(false);setError('');
    if(!native||!active)return;
    async function poll(){if(requesting.current||acting.current)return;const request=version.current;requesting.current=true;try{const next=await call<Session|null>('runtime_rebuild_status');if(epoch===generation.current&&request===version.current)setSession(next);}catch(problem){if(epoch===generation.current&&request===version.current)setError(String(problem));}finally{requesting.current=false;}}
    void poll();const timer=setInterval(()=>void poll(),2000);
    return()=>{generation.current++;clearInterval(timer);};
  },[active,project?.id]);
  const running=!!session&&!['stopped','failed'].includes(session.phase),matching=session?.projectId===project?.id;
  async function perform(action:'start'|'rebuild'|'stop') {
    if(acting.current)return;
    const epoch=generation.current;version.current++;acting.current=true;setBusy(true);setError('');
    try {
      if(action!=='stop'){if(!project||!onSave)throw Error('Open and save this project before starting its native playtest.');await onSave();if(epoch!==generation.current)throw Error('The workspace changed while saving. Start the playtest from its map.');}
      if(action==='stop'){await call('runtime_rebuild_stop',{sessionId:session!.id});}
      else {const next=await call<Session>(action==='start'?'runtime_rebuild_start':'runtime_rebuild_begin',action==='start'?{projectId:project!.id,confirmedRestart:true}:{sessionId:session!.id});if(epoch===generation.current)setSession(next);}
    } catch(problem){if(epoch===generation.current)setError(String(problem));}
    finally{acting.current=false;if(epoch===generation.current)setBusy(false);}
  }
  return <section className="runtime-rebuild-controls" aria-label="Chupathingy Live Rebuild">
    <strong>Chupathingy · Live Rebuild</strong>
    <p className="subtle">Build saved changes, then restart the private playtest. The round resets; failed builds keep the running map.</p>
    <div className="analysis-actions">
      <button disabled={!native||busy||running||!project||!onSave} onClick={()=>void perform('start')}><Play size={13}/>Start compiled playtest</button>
      <button disabled={!native||busy||!running||!matching||!!session?.pendingJobId} onClick={()=>void perform('rebuild')}><RefreshCw size={13}/>{session?.pendingJobId?'Building…':'Live Rebuild'}</button>
      <button disabled={!native||busy||!running} onClick={()=>void perform('stop')}><Square size={13}/>Stop playtest</button>
    </div>
    {session&&<><p role="status">{session.detail}</p><small>Saved source {session.sourceFingerprint.slice(0,8)} · Compiled {session.compiledSha256.slice(0,8)} · Game {session.gameSha256?.slice(0,8)??'not confirmed'}</small>
      {running&&!matching&&<p>This window is testing another map. Return to that map to rebuild it, or stop its playtest.</p>}
      {session.error&&<Notice tone="error">{session.error}</Notice>}
      <details><summary>Native playtest details</summary>{Object.keys(session.ceResourceSha256??{}).length===3&&<p>Custom Edition textures, sounds and messages verified and prepared automatically.</p>}<p>Build {session.compiledBuildId} · {session.phase}{session.processId?` · PID ${session.processId}`:''}</p><pre className="log-tail" aria-label="Latest six engine messages">{session.consoleTail.split('\n').slice(-6).join('\n')||'No engine output yet.'}</pre><button onClick={()=>void navigator.clipboard.writeText(session.consoleTail).catch(problem=>setError(String(problem)))}>Copy diagnostic tail</button></details></>}
    {error&&<Notice tone="error">{error}</Notice>}
  </section>;
}
