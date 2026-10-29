import {useEffect,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {call,native} from '../api';
import{WorkspacePanel}from'./WorkspacePanels';
import {NumberField,Notice} from './ui';
import {readHistoryLimit} from '../historyPreferences';
import {isEditingText} from '../editorFlight';
import type {Vec3} from '../types';
import LiveScaleControls,{type ScaleChange,type ScaleObject,type ScaleReceipt} from './LiveScaleControls';
import NativeSprintControls from './NativeSprintControls';
import NativeCameraControls from './NativeCameraControls';
import LiveSessionRecovery from './LiveSessionRecovery';
import { disconnectLiveSession } from '../liveSession';
import type {ThreadReleaseStatus} from '../liveSession';
export interface LiveObjectState extends ScaleObject {tagPath:string;position:Vec3;velocity:Vec3;forward:Vec3;up:Vec3;parentDatum:number;player:boolean}
export interface LiveStatus {pid:number;sessionToken:string;cleanupPending?:boolean;threadRelease?:ThreadReleaseStatus;activeVehiclePhysics:boolean;activeSharedScales:boolean;scaleKeeperError:string|null;snapshot:{profile:string;identity:{scenario:string;checksum:number;tagCount:number;scenarioDatum:number};objects:LiveObjectState[]};detail:string}
type Status=LiveStatus;
type Record={datum:number;tagDatum:number;kind?:'move';before:Vec3;after:Vec3}|ScaleChange;
type LiveHistory={past:Record[];future:Record[]};
// Keep confirmed receipts when the user switches editor modes or map tabs.
let retained:{identity:string;history:LiveHistory;selected:string}={identity:'',history:{past:[],future:[]},selected:''};
interface Receipt {datum:number;applied:boolean;observedPosition:Vec3|null;message:string}
export interface LiveViewportControls {status:LiveStatus|null;selected:number|null;select:(datum:number|null)=>void;move:(datum:number,position:Vec3)=>Promise<void>;scale:(datum:number,size:number)=>Promise<void>;busy:boolean}
export default function LiveObjectInspector({viewport,presentation='sidebar',controlsOpen=false,keyboardEnabled=()=>true}:{viewport?:(controls:LiveViewportControls)=>ReactNode;presentation?:'sidebar'|'drawer';controlsOpen?:boolean;keyboardEnabled?:(status:Status|null)=>boolean}={}){
  const [status,setStatus]=useState<Status|null>(null),[mods,setMods]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[query,setQuery]=useState(''),[id,setId]=useState(retained.selected),[draft,setDraft]=useState<Vec3>([0,0,0]),[message,setMessage]=useState(''),[history,renderHistory]=useState<LiveHistory>(retained.history);
  const historyRef=useRef(history);const pendingHistory=useRef<('undo'|'redo')[]>([]);
  function setHistory(update:LiveHistory|((h:LiveHistory)=>LiveHistory)){const next=typeof update==='function'?update(historyRef.current):update;historyRef.current=next;retained.history=next;renderHistory(next);}
  const mounted=useRef(true),active=useRef(false),polling=useRef(false),sampleEpoch=useRef(0);const object=status?.snapshot.objects.find(o=>String(o.datum)===id);
  const [shared,setShared]=useState(false);useEffect(()=>setShared(false),[id]);
  const mapIdentity=status?`${status.sessionToken ?? status.pid}:${status.snapshot.identity.scenario}:${status.snapshot.identity.checksum}`:'';
  const identityRef=useRef(retained.identity);
  useEffect(()=>{if(!status)return;if(identityRef.current!==mapIdentity){identityRef.current=mapIdentity;pendingHistory.current=[];setHistory({past:[],future:[]});setId('');setShared(false);}retained={identity:mapIdentity,history,selected:id};},[mapIdentity,history,id]);
  useEffect(()=>{mounted.current=true;void refresh().catch(()=>{});return()=>{mounted.current=false;sampleEpoch.current++;};},[]);
  useEffect(()=>{if(object)setDraft([...object.position]);},[id]);
  async function refresh(){const epoch=++sampleEpoch.current,s=await call<Status>('live_mcc_sample');if(mounted.current&&epoch===sampleEpoch.current)setStatus(s);return s;}
  useEffect(()=>{if(!native)return;const timer=setInterval(()=>{if(active.current||polling.current)return;polling.current=true;void refresh().catch(error=>{if(status&&mounted.current&&!active.current){setStatus(null);pendingHistory.current=[];setHistory({past:[],future:[]});setError(String(error));}}).finally(()=>{polling.current=false;});},status?100:2000);return()=>clearInterval(timer);},[status?.pid]);
  async function perform(f:()=>Promise<void>){if(active.current)return;active.current=true;sampleEpoch.current++;setBusy(true);setError('');try{await f();}catch(error){if(mounted.current)setError(String(error));}finally{active.current=false;if(mounted.current)setBusy(false);const next=pendingHistory.current.shift();if(next)queueMicrotask(()=>void historyOperation(next));}}
  async function move(record:Record,reverse=false){
    const sessionToken=status?.sessionToken;
    if(!sessionToken)throw new Error('Refresh the live connection before editing.');
    const confirmSession=async()=>{const sample=await refresh();if(sample.sessionToken!==sessionToken){pendingHistory.current=[];setHistory({past:[],future:[]});setMessage('');throw new Error('Live connection changed after the edit. Its history was not carried into the new session.');}};
    if(record.kind==='scale'){
      const result=await call<ScaleReceipt>('live_mcc_scale_object',{expectedSession:sessionToken,operation:{datum:record.datum,tagDatum:record.tagDatum,expectedScale:reverse?record.after:record.before,scale:reverse?record.before:record.after,includeSharedPhysics:record.shared}});
      if(!result.applied)throw new Error(result.message);setMessage(result.message);await confirmSession();return;
    }
    const result=await call<Receipt[]>('live_mcc_move_object',{expectedSession:sessionToken,operation:{datum:record.datum,tagDatum:record.tagDatum,expectedPosition:reverse?record.after:record.before,position:reverse?record.before:record.after}});
    if(!result[0]?.applied)throw new Error(result[0]?.message??'Game did not confirm the position. Earlier writes may have occurred.');
    setMessage(result[0].message);await confirmSession();
  }
  function historyOperation(direction:'undo'|'redo'):Promise<void>{if(active.current){if(pendingHistory.current.length<readHistoryLimit())pendingHistory.current.push(direction);return Promise.resolve();}return perform(async()=>{const op=direction==='undo'?historyRef.current.past.at(-1):historyRef.current.future[0];if(!op)return;await move(op,direction==='undo');setHistory(h=>direction==='undo'?{past:h.past.slice(0,-1),future:[op,...h.future]}:{past:[...h.past,op].slice(-readHistoryLimit()),future:h.future.slice(1)});if(op.kind!=='scale'&&String(op.datum)===id)setDraft([...(direction==='undo'?op.before:op.after)]);});}
  const undo=()=>historyOperation('undo'),redo=()=>historyOperation('redo');
  useEffect(()=>{if(!status||status.cleanupPending||!keyboardEnabled(status))return;const key=(e:KeyboardEvent)=>{if(e.target instanceof Element&&e.target.closest('.gs-render-features,.gs-world-environment-panel'))return;if((!e.ctrlKey&&!e.metaKey)||e.altKey)return;const numeric=e.target instanceof HTMLInputElement&&['number','range'].includes(e.target.type);if(isEditingText(e.target)&&!numeric)return;const k=e.key.toLowerCase();if(k==='z'||k==='y'){e.preventDefault();e.stopImmediatePropagation();void(k==='y'||e.shiftKey?redo():undo());}};document.addEventListener('keydown',key,true);return()=>document.removeEventListener('keydown',key,true);},[history,busy,id,status,keyboardEnabled]);
  const remember=(op:Record)=>setHistory(h=>({past:[...h.past,op].slice(-readHistoryLimit()),future:[]}));
  const externalMove=(datum:number,position:Vec3)=>perform(async()=>{const current=status?.snapshot.objects.find(o=>o.datum===datum);if(!current)throw new Error('Refresh the live instance before dragging it.');if(current.parentDatum!==4294967295)throw new Error('Move the parent of a held or mounted object.');const op:Record={datum,tagDatum:current.tagDatum,before:[...current.position],after:position};await move(op);remember(op);});
  const externalScale=(datum:number,size:number)=>perform(async()=>{const current=status?.snapshot.objects.find(o=>o.datum===datum);if(!current)throw new Error('Refresh the live instance before resizing.');const scope=[1,2,3].includes(current.kind);if(scope&&!shared)throw new Error('Confirm the shared vehicle/item scope in the size controls before using the scale gizmo.');const op:ScaleChange={kind:'scale',datum,tagDatum:current.tagDatum,before:current.scale,after:size,shared:scope};await move(op);remember(op);});
  const inspector=<section className="analysis-card live-object-inspector"><h2>Live Halo 1 objects · MCC</h2><p>Move and resize actual objects in the current game. Vehicle size includes coupled contact geometry, mass and inertia.</p>
    {!status?<><LiveSessionRecovery disabled={busy} onBusyChange={value=>{active.current=value;sampleEpoch.current++;setBusy(value);}} onReleased={report=>{sampleEpoch.current++;setStatus(null);pendingHistory.current=[];setHistory({past:[],future:[]});setError('');setMessage(report.detail);}}/><label><input type="checkbox" checked={mods} onChange={e=>setMods(e.target.checked)}/> I launched MCC using Anti-Cheat Disabled in Steam</label><button disabled={!native||!mods||busy} onClick={()=>void perform(async()=>{const s=await call<Status>('live_mcc_connect',{modsMode:mods});setStatus(s);setHistory({past:[],future:[]});setMessage('Connected to the loaded game map.');})}>Connect current Halo 1 session</button></>:<>
      <p role="status">{status.snapshot.identity.scenario} · {status.snapshot.objects.length} live objects · PID {status.pid}</p>
      {status.cleanupPending&&<Notice tone="warn">{status.threadRelease?.issue ? `${status.threadRelease.issue} New edits are blocked. Disconnect retries recorded thread releases before restoring temporary data. An operation may already have changed data before its release failed.` : 'Live cleanup is pending. New edits are paused. Park and exit affected vehicles, then retry Disconnect; retained changes still need cleanup.'}</Notice>}
      <NativeSprintControls blocked={busy||!!status.cleanupPending}/>
      <NativeCameraControls blocked={busy||!!status.cleanupPending}/>
      {status.activeSharedScales&&<Notice tone="info">Shared sizes are temporary. Keep Spark open while using them. Park and exit affected vehicles before undoing, disconnecting or closing Spark; original item sizes and vehicle physics are restored on disconnect.</Notice>}
      {status.scaleKeeperError&&<Notice tone="error">{status.scaleKeeperError}</Notice>}
      <input type="search" aria-label="Find live Halo object" value={query} onChange={e=>setQuery(e.target.value)} placeholder="warthog, cyborg, scenery…"/>
      <select aria-label="Live Halo object" value={id} onChange={e=>setId(e.target.value)}><option value="">Choose an actual game object…</option>{status.snapshot.objects.filter(o=>o.tagPath.toLowerCase().includes(query.toLowerCase())).map(o=><option key={o.datum} value={o.datum}>{o.tagPath} · #{o.datum.toString(16)}{o.player?' · your player':''}</option>)}</select>
      {object&&<><p>Observed XYZ: {object.position.map(v=>v.toFixed(3)).join(', ')}{object.player?' · Own actor':''}</p><div className="vector-fields">{(['X','Y','Z']as const).map((axis,i)=><NumberField key={axis} label={`Live position ${axis}`} value={draft[i]} onCommit={value=>setDraft(d=>d.map((v,j)=>i===j?value:v)as Vec3)}/>)}</div>
        <button disabled={busy||status.cleanupPending} onClick={()=>void perform(async()=>{const current=(await refresh()).snapshot.objects.find(o=>o.datum===object.datum&&o.tagDatum===object.tagDatum);if(!current)throw new Error('Object respawned or disappeared. Select its new instance.');const op={datum:current.datum,tagDatum:current.tagDatum,before:[...current.position]as Vec3,after:[...draft]as Vec3};await move(op);setHistory(h=>({past:[...h.past,op].slice(-readHistoryLimit()),future:[]}));})}>Apply live object position</button><button onClick={()=>setDraft([...object.position])}>Use observed position</button></>}
      {object&&<LiveScaleControls object={object} count={status.snapshot.objects.length} busy={busy||!!status.cleanupPending} blocked={!!status.scaleKeeperError||!!status.cleanupPending} perform={perform} apply={op=>move(op)} remember={remember} sharedValue={shared} onSharedChange={setShared}/>}
      <div className="analysis-actions"><button disabled={busy||status.cleanupPending||!history.past.length} onClick={()=>void undo()}>Undo live edit (Ctrl+Z)</button><button disabled={busy||status.cleanupPending||!history.future.length} onClick={()=>void redo()}>Redo live edit (Ctrl+Y)</button><button disabled={busy} onClick={()=>void perform(async()=>{const report=await disconnectLiveSession(status.sessionToken);sampleEpoch.current++;setStatus(null);pendingHistory.current=[];setHistory({past:[],future:[]});setMessage(report.detail);})}>{status.threadRelease?.pendingThreads ? 'Retry thread release & disconnect' : 'Disconnect live session'}</button></div>
    </>}{message&&<p role="status">{message}</p>}{error&&<Notice tone="error">{error}</Notice>}<p className="subtle">Moves affect this running session. They do not rewrite a source map. Rotation, spawning, BSP replacement and free-camera hooks are not enabled. Reloading or respawning can invalidate a binding; failed readback never becomes a successful undo entry.</p>
  </section>;
  return <div className={presentation==='drawer'?'level-connected-view':viewport?'live-editor-layout':'live-inspector-layout'}>
    {presentation==='drawer'?<WorkspacePanel id="connection" label="Game connection"><details className="level-session-controls" open={controlsOpen||undefined}><summary>Connect to your Halo game · {status?'connected':'offline'}</summary>{inspector}</details></WorkspacePanel>:inspector}
    {viewport?.({status,selected:id?Number(id):null,select:datum=>setId(datum===null?'':String(datum)),move:externalMove,scale:externalScale,busy:busy||!!status?.cleanupPending})}</div>;
}
