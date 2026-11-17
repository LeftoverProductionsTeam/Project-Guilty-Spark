import {useEffect,useRef,useState} from 'react';
import {Play,RefreshCw,Square} from 'lucide-react';
import {call,native} from '../api';
import type {Project,RuntimeId,RuntimeRegistration} from '../types';
import {useWorkspaceActivity} from './WorkspaceActivity';
import {Notice} from './ui';
interface Session {
  id:string;runtimeId?:RuntimeId;stagedMap?:string;startupMap?:string|null;engineSha256?:Record<string,string>;projectId:string;phase:string;sourceFingerprint:string;
  compiledBuildId:string;compiledSha256:string;gameBuildId:string|null;gameSha256:string|null;
  processId:number|null;pendingJobId:string|null;detail:string;error:string|null;consoleTail:string;ceResourceSha256?:Record<string,string>;requiredNativeFeatures?:string[];
}
export default function RuntimeLiveRebuild({project,onSave,runtimeId='chupathingyCe'}:{project:Project|null;onSave?:()=>Promise<void>;runtimeId?:'chupathingyCe'|'openCe'}) {
  const {active}=useWorkspaceActivity(),[session,setSession]=useState<Session|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [profileEpoch,setProfileEpoch]=useState(0),[profile,setProfile]=useState<{registration:RuntimeRegistration;sha256:string}|null>(null),[profileIssue,setProfileIssue]=useState('');
  const forerunner=runtimeId==='openCe';
  useEffect(()=>{const changed=()=>setProfileEpoch(value=>value+1);window.addEventListener('guilty-spark-runtime-connections-changed',changed);return()=>window.removeEventListener('guilty-spark-runtime-connections-changed',changed);},[]);
  useEffect(()=>{
    let current=true;setProfile(null);setProfileIssue('');
    if(!native||!active||!forerunner)return;
    setProfileIssue('Checking the selected Forerunner profile…');
    void (async()=>{
      const profiles=await call<RuntimeRegistration[]>('list_runtime_registrations');
      const selected=profiles.find(item=>item.runtimeId==='openCe');
      if(!selected)throw Error('Connect and review a Forerunner build in Settings & tools → Halo versions → OpenCE → Runtime folders.');
      const plan=await call<{profileInterface?:string|null;executableSha256:string}>('inspect_runtime_launch',{registration:selected});
      if(plan.profileInterface!=='forerunner')throw Error('This OpenCE profile has no reviewed Forerunner solo playtest path. Review its installed build in Settings & tools → Halo versions → OpenCE → Runtime folders.');
      if(current){setProfile({registration:selected,sha256:plan.executableSha256});setProfileIssue('');}
    })().catch(problem=>{if(current)setProfileIssue(String(problem));});
    return()=>{current=false;};
  },[active,forerunner,profileEpoch]);
  const generation=useRef(0),requesting=useRef(false),acting=useRef(false),version=useRef(0);
  useEffect(()=>{
    const epoch=++generation.current;
    setBusy(false);setError('');
    if(!native||!active)return;
    async function poll(){if(requesting.current||acting.current)return;const request=version.current;requesting.current=true;try{const next=await call<Session|null>('runtime_rebuild_status');if(epoch===generation.current&&request===version.current)setSession(next);}catch(problem){if(epoch===generation.current&&request===version.current)setError(String(problem));}finally{requesting.current=false;}}
    void poll();const timer=setInterval(()=>void poll(),2000);
    return()=>{generation.current++;clearInterval(timer);};
  },[active,project?.id,runtimeId,profileEpoch]);
  const running=!!session&&!['stopped','failed'].includes(session.phase),matching=session?.projectId===project?.id;
  async function perform(action:'start'|'rebuild'|'stop') {
    if(acting.current)return;
    const epoch=generation.current;version.current++;acting.current=true;setBusy(true);setError('');
    try {
      if(action==='start'&&forerunner&&!profile)throw Error(profileIssue||'Inspect the selected Forerunner profile first.');
      if(action!=='stop'){if(!project||!onSave)throw Error('Open and save this project before starting its native playtest.');await onSave();if(epoch!==generation.current)throw Error('The workspace changed while saving. Start the playtest from its map.');}
      if(action==='stop'){await call('runtime_rebuild_stop',{sessionId:session!.id});}
      else {const next=await call<Session>(action==='start'?'runtime_rebuild_start':'runtime_rebuild_begin',action==='start'?{projectId:project!.id,confirmedRestart:true,...(forerunner?{runtimeId,expectedRegistration:profile!.registration,expectedExecutableSha256:profile!.sha256}:{})}:{sessionId:session!.id});if(epoch===generation.current)setSession(next);}
    } catch(problem){if(epoch===generation.current)setError(String(problem));}
    finally{acting.current=false;if(epoch===generation.current)setBusy(false);}
  }
  return <section className="runtime-rebuild-controls" aria-label={forerunner?'Forerunner solo playtest':'Chupathingy Live Rebuild'}>
    <strong>{forerunner?'Forerunner · staged solo playtest':'Chupathingy · Live Rebuild'}</strong>
    <p className="subtle">{forerunner?'Uses the saved project’s validated CE solo build in disposable private folders. Compatible Xbox-derived tags may supply its assets; the original Xbox cache is preserved and is not relabeled as CE. Current reviewed startup builds receive a request for the staged CE map; older reviewed builds use their native custom campaign chooser. Native map requirements are checked against the selected build before staging. Create a temporary player profile in the native menus if prompted. Stop removes this test profile. Startup requests do not confirm a loaded map; automatic reload, game revision confirmation and combat acceptance are unavailable.':'Build saved changes, then restart the private playtest. The round resets; failed builds keep the running map.'}</p>
    {forerunner&&profileIssue&&<p role="status">{profileIssue}</p>}
    <div className="analysis-actions">
      <button disabled={!native||busy||running||!project||!onSave||(forerunner&&!profile)} onClick={()=>void perform('start')}><Play size={13}/>{forerunner?'Start staged solo test':'Start compiled playtest'}</button>
      <button disabled={!native||busy||!running||!matching||forerunner||(session?.runtimeId??'chupathingyCe')!=='chupathingyCe'||!!session?.pendingJobId} title={forerunner?'Forerunner requires Stop, a new validated build and another private test. Automatic restart is unavailable.':undefined} onClick={()=>void perform('rebuild')}><RefreshCw size={13}/>{session?.pendingJobId?'Building…':'Live Rebuild'}</button>
      <button disabled={!native||busy||!running} onClick={()=>void perform('stop')}><Square size={13}/>Stop playtest</button>
    </div>
    {session&&<><p role="status">{session.detail}</p><small>Saved source {session.sourceFingerprint.slice(0,8)} · Compiled {session.compiledSha256.slice(0,8)} · Game {session.gameSha256?.slice(0,8)??'not confirmed'}</small>
      {running&&session.runtimeId&&session.runtimeId!==runtimeId&&<p>The active test remains bound to {session.runtimeId==='openCe'?'Forerunner':'Chupathingy'}. Selecting another runtime does not retarget it; Stop closes only this owned test.</p>}
      {running&&!matching&&<p>This window is testing another map. Return to that map for its available actions, or stop its playtest.</p>}
      {session.error&&<Notice tone="error">{session.error}</Notice>}
      <details><summary>Native playtest details</summary>{!!session.requiredNativeFeatures?.length&&<p>Required native features: {session.requiredNativeFeatures.join(', ')}. Confirmed by discovery before staging; gameplay is not confirmed.</p>}{session.runtimeId==='openCe'&&<p>Forerunner solo test · staged map {session.stagedMap}.{session.startupMap?' Startup requested: '+session.startupMap+'.':' Select it in the native campaign chooser.'} No running-map readback is available.</p>}{Object.entries(session.engineSha256??{}).map(([name,sha])=><p key={name}><code>{name}</code> · {sha.slice(0,12)}</p>)}{Object.keys(session.ceResourceSha256??{}).length===3&&<p>Custom Edition textures, sounds and messages verified and prepared automatically.</p>}<p>Build {session.compiledBuildId} · {session.phase}{session.processId?` · PID ${session.processId}`:''}</p><p className="subtle">Final console messages and a bounded private debug-log tail remain here after scratch cleanup. Copy them before closing Spark; missing logs do not confirm healthy gameplay.</p><pre className="log-tail" aria-label="Latest six engine messages">{session.consoleTail.split('\n').slice(-6).join('\n')||'No engine output yet.'}</pre><button onClick={()=>void navigator.clipboard.writeText(session.consoleTail).catch(problem=>setError(String(problem)))}>Copy diagnostic tail</button></details></>}
    {error&&<Notice tone="error">{error}</Notice>}
  </section>;
}
