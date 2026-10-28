import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {call,native} from '../api';
import {useMapState} from '../mapSession';
import type {QuickForgeDocument} from '../forge';
import type {LibraryEntry} from '../types';
import {localForge,mergeForge,portableForge} from '../forgeSession';
import {Notice} from './ui';
import SteamSessionTools from './SteamSessionTools';
import '../hosting.css';
interface GameBinding {runtimeId:string;scenario:string;checksum:number;tagCount:number}
interface View {sessionId:string;revision:number;document:QuickForgeDocument;peers:number;lastAuthor:string;detail:string;game?:GameBinding}
type Transport='lan'|'steamSpacewar';
interface Info {projectId:string;projectTitle:string;sessionId:string;role:'host'|'guest';transport:Transport;endpoint:string;key:string|null;view:View|null;lan:boolean;detail?:string|null}
export default function ForgeCollaboration({projectId,document:doc,entries,onShared,onSave}:{projectId:string;document:QuickForgeDocument;entries:LibraryEntry[];onShared:(document:QuickForgeDocument)=>void;onSave:()=>Promise<void>}) {
  const [view,setView]=useState<View|null>(null),[session,setSession]=useState<Info|null>(null),[other,setOther]=useState<Info|null>(null);
  const [endpoint,setEndpoint]=useMapState(projectId,'share.endpoint',''),[key,setKey]=useState(''),[invite,setInvite]=useState('');
  const [transport,setTransport]=useMapState<Transport>(projectId,'share.transport','lan'),[lan,setLan]=useMapState(projectId,'share.lan',true),[address,setAddress]=useMapState(projectId,'share.address','127.0.0.1');
  const [linkGame,setLinkGame]=useState(false),[steamReady,setSteamReady]=useState(false),[working,setWorking]=useState(false),[restoring,setRestoring]=useState(native),[error,setError]=useState(''),[message,setMessage]=useState(''),[paused,setPaused]=useState(false),[showKey,setShowKey]=useState(false);
  const latest=useRef({doc,entries,onShared});latest.current={doc,entries,onShared};
  const shared=useRef<View|null>(null),blocked=useRef(false),accepting=useRef<string|null>(null),active=useRef(true),inFlight=useRef(false),operation=useRef(0);
  const json=(d:QuickForgeDocument)=>JSON.stringify(portableForge(d));
  const busy=working||restoring;
  useLayoutEffect(()=>{accepting.current=null;},[doc]);
  function accept(next:View,document=next.document){shared.current=next;setView(next);const local=localForge(document,latest.current.entries);if(json(latest.current.doc)!==json(local)){accepting.current=json(local);latest.current.onShared(local);}}
  useEffect(()=>{
    active.current=true;let cancelled=false;setRestoring(native);
    if(native)void call<Info|null>('forge_session_status',{projectId}).then(info=>{
      if(cancelled)return;if(!info)return;
      if(info.projectId!==projectId){setOther(info);return;}
      setSession(info);setTransport(info.transport);setEndpoint(info.endpoint);setKey(info.key??'');setLan(info.lan);setView(info.view);shared.current=info.view;
      const differs=!info.view||json(latest.current.doc)!==json(info.view.document);blocked.current=differs;setPaused(differs);
      if(differs)setError(info.detail??'Editing session restored. Your local draft differs; export it before using the shared version.');
      else setMessage('Your editing session is still active.');
    },e=>{if(!cancelled)setError(String(e));}).finally(()=>{if(!cancelled)setRestoring(false);});
    return()=>{cancelled=true;active.current=false;operation.current++;};
  },[projectId]);
  async function tick(){
    if(inFlight.current||blocked.current||!shared.current||!session)return;
    if(accepting.current){if(json(latest.current.doc)!==accepting.current)return;accepting.current=null;}
    inFlight.current=true;const id=session.sessionId;
    try{
      const before=shared.current,sent=portableForge(latest.current.doc),changed=json(sent)!==json(before.document);
      const next=await call<View>(changed?'forge_session_update':'forge_session_poll',changed?{projectId,sessionId:id,revision:before.revision,document:sent}:{projectId,sessionId:id});
      if(!active.current||next.sessionId!==id)return;
      const newer=portableForge(latest.current.doc);accept(next,mergeForge(sent,newer,next.document));setError('');
    }catch(e){if(active.current){blocked.current=true;setPaused(true);setError(`${String(e)} Your local draft is retained. Export it before choosing the shared version.`);}}
    finally{inFlight.current=false;}
  }
  useEffect(()=>{if(!session)return;const timer=setInterval(()=>void tick(),500);return()=>clearInterval(timer);},[session?.sessionId,projectId]);
  async function perform(action:()=>Promise<void>){const request=++operation.current;setWorking(true);setError('');setMessage('');try{await action();}catch(e){if(active.current&&request===operation.current)setError(String(e));}finally{if(active.current&&request===operation.current)setWorking(false);}}
  function exportDraft(){const blob=new Blob([JSON.stringify({kind:'guilty-spark-quickforge-draft',document:portableForge(latest.current.doc)},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=window.document.createElement('a');a.href=url;a.download='quickforge-local-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function copyInvite(){if(!session)return;const text=await call<string>('forge_session_invite',{projectId,sessionId:session.sessionId,address});try{await navigator.clipboard.writeText(text);setMessage('Private invite copied. Share it with your collaborator through Steam chat or another private channel.');}catch{setInvite(text);setMessage('Select and copy the invite below. It contains the private session key.');}}
  return <details className="forge-live-panel"><summary>Shared QuickForge · two editors{session?' · active':''}</summary>
    {restoring&&<p role="status">Restoring editing-session controls…</p>}
    {other?<Notice>An editing session is active for <strong>{other.projectTitle}</strong>. Select that map's tab to manage it. Switching tools keeps its host running.</Notice>:!session?<>
      <p>Share QuickForge source with one collaborator. Each computer keeps its own Halo installation and game adapter.</p>
      <label>Editor connection<select aria-label="Editor connection" disabled={busy} value={transport} onChange={e=>setTransport(e.target.value as Transport)}><option value="lan">Private LAN / VPN</option><option value="steamSpacewar">Steam · Spacewar test (480)</option></select></label>
      {transport==='steamSpacewar'?<SteamSessionTools onReady={setSteamReady}/>:<label className="hosting-toggle"><input type="checkbox" checked={lan} onChange={e=>setLan(e.target.checked)}/> Accept a second editor over private LAN / VPN</label>}
      <label className="hosting-toggle"><input type="checkbox" checked={linkGame} onChange={e=>setLinkGame(e.target.checked)}/> Link this invite to the connected Halo map</label>
      <p className="subtle">Map linking requires both editors to connect the matching map in Live mode. It checks the scenario and cache identity; game-lobby membership and game-peer replication remain separate.</p>
      <button disabled={!native||busy||(transport==='steamSpacewar'&&!steamReady)} onClick={()=>void perform(async()=>{await onSave();if(!active.current)return;const result=await call<Info>('forge_session_host',{projectId,document:portableForge(latest.current.doc),lan,transport,linkGame});if(!active.current)return;setSession(result);setEndpoint(result.endpoint);setKey(result.key??'');blocked.current=false;setPaused(false);if(result.view)accept(result.view);})}>Host editing session</button>
      <div className="hosting-join"><label>Private Spark invite<textarea aria-label="Private Spark invite" value={invite} onChange={e=>setInvite(e.target.value)} rows={2} autoComplete="off" spellCheck={false}/></label>
      <button disabled={!native||busy||!invite.trim()} onClick={()=>void perform(async()=>{await onSave();if(!active.current)return;const next=await call<View>('forge_session_join',{projectId,endpoint:'',key:'',transport,invite:invite.trim()});if(!active.current)return;const info=await call<Info>('forge_session_status',{projectId});setSession(info);setEndpoint(info.endpoint);setKey(info.key??'');setTransport(info.transport);blocked.current=false;setPaused(false);accept(next);setInvite('');})}>Join private invite</button></div>
      <details><summary>Join with address and key</summary><div className="analysis-actions"><label>Host address<input aria-label="Shared editor address" value={endpoint} onChange={e=>setEndpoint(e.target.value.trim())} placeholder={transport==='lan'?'192.168.1.10:32145':'steam:SteamID:channel'}/></label><label>Session key<input aria-label="Shared editor key" type="password" value={key} onChange={e=>setKey(e.target.value.trim())} autoComplete="off"/></label><button disabled={!native||busy||!endpoint||key.length!==32} onClick={()=>void perform(async()=>{await onSave();if(!active.current)return;const next=await call<View>('forge_session_join',{projectId,endpoint,key,transport});if(!active.current)return;setSession(await call<Info>('forge_session_status',{projectId}));blocked.current=false;setPaused(false);accept(next);})}>Join and use shared map</button></div></details>
    </>:<>
      <p role="status">{paused?'Paused · local draft retained':`${view?.peers??1}/2 editors · shared revision ${view?.revision??0}`} · {session.role} · {session.transport==='lan'?'LAN / VPN':'Spacewar test (480)'}</p>
      {session.role==='host'&&<div className="analysis-actions">
        {session.transport==='lan'&&<label>Private host IPv4<input aria-label="Private host IPv4" value={address} onChange={e=>setAddress(e.target.value)} placeholder="192.168.1.10"/><small>127.0.0.1 is for this computer. Use your LAN/VPN address for another computer.</small></label>}
        <button disabled={busy} onClick={()=>void perform(copyInvite)}>Copy private invite</button>
        <button onClick={()=>setShowKey(!showKey)}>{showKey?'Hide':'Show'} session key</button>{showKey&&<code>{key}</code>}
      </div>}
      {view?.game&&<p>Linked map: {view.game.scenario} · checksum {view.game.checksum.toString(16)}</p>}
      <div className="analysis-actions"><button onClick={exportDraft}>Export local draft</button>
      {paused?<button disabled={busy} onClick={()=>void perform(async()=>{const next=await call<View>('forge_session_resume',{projectId,sessionId:session.sessionId});if(!active.current)return;accept(next);blocked.current=false;setPaused(false);})}>Use shared version and resume</button>:<button disabled={busy} onClick={()=>{blocked.current=true;setPaused(true);setMessage('Sharing paused. Your local draft remains editable.');}}>Pause sharing</button>}
      <button disabled={busy} onClick={()=>void perform(async()=>{blocked.current=true;await call('forge_session_leave',{projectId,sessionId:session.sessionId});if(!active.current)return;setSession(null);setView(null);shared.current=null;setKey('');setInvite('');setShowKey(false);setPaused(false);})}>Leave session</button></div>
      <p>{view?.detail}</p>
    </>}
    {invite&&session&&<textarea aria-label="Invite to copy" readOnly value={invite} rows={3} onFocus={e=>e.currentTarget.select()}/>}
    {message&&<p role="status">{message}</p>}{error&&<Notice tone="error">{error}</Notice>}
    <p className="subtle">Keep invites private. Direct LAN/VPN traffic is unencrypted; Steam uses its separate SDK transport. No firewall rule or public port is opened automatically. BSP changes need rebuilding and reloading.</p>
  </details>;
}