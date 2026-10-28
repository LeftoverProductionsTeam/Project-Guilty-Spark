import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {call,native} from '../api';
import type {QuickForgeDocument} from '../forge';
import type {LibraryEntry} from '../types';
import {localForge,mergeForge,portableForge} from '../forgeSession';
import {Notice} from './ui';
interface View {sessionId:string;revision:number;document:QuickForgeDocument;peers:number;lastAuthor:string;detail:string}
export default function ForgeCollaboration({projectId,document:doc,entries,onShared,onSave}:{projectId:string;document:QuickForgeDocument;entries:LibraryEntry[];onShared:(document:QuickForgeDocument)=>void;onSave:()=>Promise<void>}){
  const [view,setView]=useState<View|null>(null),[endpoint,setEndpoint]=useState(''),[key,setKey]=useState(''),[lan,setLan]=useState(true),[role,setRole]=useState<'host'|'guest'|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[paused,setPaused]=useState(false),[showKey,setShowKey]=useState(false);
  const latest=useRef({doc,entries,onShared});latest.current={doc,entries,onShared};
  const shared=useRef<View|null>(null),blocked=useRef(false),accepting=useRef<string|null>(null),active=useRef(true),inFlight=useRef(false);
  const json=(d:QuickForgeDocument)=>JSON.stringify(portableForge(d));
  // Clear the pending React acknowledgement as soon as any new document is
  // committed. An immediate local edit/undo must not wait forever for an older
  // document value that React has already advanced past.
  useLayoutEffect(()=>{accepting.current=null;},[doc]);
  useEffect(()=>{active.current=true;return()=>{active.current=false;void call('forge_session_leave').catch(()=>{});};},[projectId]);
  function accept(next:View,document=next.document){shared.current=next;setView(next);const local=localForge(document,latest.current.entries);if(json(latest.current.doc)!==json(local)){accepting.current=json(local);latest.current.onShared(local);}}
  async function tick(){
    if(inFlight.current||blocked.current||!shared.current)return;
    if(accepting.current){if(json(latest.current.doc)!==accepting.current)return;accepting.current=null;}
    inFlight.current=true;
    try{
      const before=shared.current,sent=portableForge(latest.current.doc),changed=json(sent)!==json(before.document);
      const next=await call<View>(changed?'forge_session_update':'forge_session_poll',changed?{projectId,revision:before.revision,document:sent}:{projectId});
      if(!active.current)return;
      const newer=portableForge(latest.current.doc),merged=mergeForge(sent,newer,next.document);
      accept(next,merged);setError('');
    }catch(error){if(active.current){blocked.current=true;setPaused(true);setError(`${String(error)} Your local draft is retained. Export it before choosing the shared version.`);}}
    finally{inFlight.current=false;}
  }
  useEffect(()=>{if(!role)return;const timer=setInterval(()=>void tick(),200);return()=>clearInterval(timer);},[role,projectId]);
  async function perform(f:()=>Promise<void>){setBusy(true);setError('');try{await f();}catch(error){setError(String(error));}finally{setBusy(false);}}
  function exportDraft(){const blob=new Blob([JSON.stringify({kind:'guilty-spark-quickforge-draft',document:portableForge(latest.current.doc)},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=window.document.createElement('a');a.href=url;a.download='quickforge-local-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <details className="forge-live-panel"><summary>Shared QuickForge · two editors</summary>
    {!role?<><p>Host a private LAN or VPN session. Both players keep their own Halo installation and assets. Joining uses the shared QuickForge document in this project.</p>
      <label><input type="checkbox" checked={lan} onChange={e=>setLan(e.target.checked)}/> Accept the second editor over private LAN / VPN</label>
      <button disabled={!native||busy} onClick={()=>void perform(async()=>{await onSave();const r=await call<{view:View;endpoint:string;key:string}>('forge_session_host',{projectId,document:portableForge(doc),lan});setEndpoint(r.endpoint);setKey(r.key);blocked.current=false;setPaused(false);accept(r.view);setRole('host');})}>Host editing session</button>
      <div className="analysis-actions"><label>Host IPv4 address:port<input aria-label="Shared editor address" value={endpoint} onChange={e=>setEndpoint(e.target.value)} placeholder="192.168.1.10:32145"/></label><label>Session key<input aria-label="Shared editor key" type="password" value={key} onChange={e=>setKey(e.target.value.trim())} autoComplete="off"/></label><button disabled={!native||busy||!endpoint||key.length!==32} onClick={()=>void perform(async()=>{await onSave();const next=await call<View>('forge_session_join',{projectId,endpoint,key});blocked.current=false;setPaused(false);accept(next);setRole('guest');})}>Join and use shared map</button></div>
    </>:<><p role="status">{paused?'Paused · local draft retained':`${view?.peers??1}/2 editors · shared revision ${view?.revision??0}`} · {role}</p>
      {role==='host'&&<><p>Port {endpoint.split(':').at(-1)} · the other editor enters this computer’s private IPv4 address with that port.</p><button onClick={()=>setShowKey(!showKey)}>{showKey?'Hide':'Show'} session key</button>{showKey&&<code>{key}</code>}</>}
      <div className="analysis-actions"><button onClick={exportDraft}>Export local draft</button>{paused&&<button disabled={busy} onClick={()=>void perform(async()=>{const next=await call<View>('forge_session_poll',{projectId});accept(next);blocked.current=false;setPaused(false);})}>Use shared version and resume</button>}<button disabled={busy} onClick={()=>void perform(async()=>{blocked.current=true;await call('forge_session_leave');setRole(null);setView(null);shared.current=null;setKey('');setShowKey(false);})}>Leave session</button></div>
      <p>{view?.detail}</p>
    </>}
    {error&&<Notice tone="error">{error}</Notice>}
    <p className="subtle">This transport uses a private session key and is not encrypted. Share it only with your collaborator. No firewall rule or public port is opened automatically. Game updates require a locally connected and bound adapter on each machine. BSP changes still require rebuilding and reloading the map.</p>
  </details>;
}
