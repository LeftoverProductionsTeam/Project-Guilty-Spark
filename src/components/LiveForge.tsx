import {useEffect,useRef,useState} from 'react';
import {call,native} from '../api';
import type {Project} from '../types';
import type {QuickForgeDocument} from '../forge';
import {Notice} from './ui';
import LiveSessionRecovery from './LiveSessionRecovery';
import { disconnectLiveSession } from '../liveSession';
interface LiveObject {datum:number;tagDatum:number;tagPath:string;kind:number;position:[number,number,number];player:boolean}
interface LiveStatus {pid:number;sessionToken:string;cleanupPending?:boolean;experimental:boolean;detail:string;snapshot:{profile:string;identity:{scenario:string;checksum:number};objects:LiveObject[]}}
interface Binding {sessionToken:string;placementId:string;datum:number;tagDatum:number;expectedPosition:number[]}
interface Receipt {datum:number;applied:boolean;observedPosition:number[]|null;message:string}
/** Each binding is local to one process lifetime. Neither a peer's object datum
 * nor the mere presence of MCC enables writes on this machine. */
export default function LiveForge({project,document:doc,selected}:{project:Project;document:QuickForgeDocument;selected:string[]}){
  const [status,setStatus]=useState<LiveStatus|null>(null),[mods,setMods]=useState(false),[enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [bindings,setBindings]=useState<Binding[]>([]),[objectId,setObjectId]=useState('');
  const current=useRef({doc,status,bindings});current.current={doc,status,bindings};
  const applied=useRef(new Map<string,string>()),running=useRef(false),mounted=useRef(true),sampleEpoch=useRef(0);
  useEffect(()=>{setBindings([]);setObjectId('');setEnabled(false);applied.current.clear();},[status?.sessionToken]);
  const placement=doc.placements.find(p=>selected.includes(p.id));
  const candidates=status?.snapshot.objects.filter(o=>placement&&o.tagPath===placement.tagPath.replaceAll('\\','/').toLowerCase()&&({0:'bipd',1:'vehi',2:'weap',3:'eqip',6:'scen'} as Record<number,string>)[o.kind]===placement.tagClass)??[];
  useEffect(()=>{mounted.current=true;void refresh().catch(()=>{});return()=>{mounted.current=false;sampleEpoch.current++;};},[]);
  async function refresh(){const ticket=++sampleEpoch.current,next=await call<LiveStatus>('live_mcc_sample');if(mounted.current&&ticket===sampleEpoch.current)setStatus(next);return next;}
  async function apply(){
    if(running.current)return;const {doc,bindings,status:boundSession}=current.current;
    const changed=bindings.filter(b=>{const p=doc.placements.find(p=>p.id===b.placementId);return p&&JSON.stringify(p.position)!==applied.current.get(p.id);});
    if(!changed.length)return;running.current=true;setBusy(true);setError('');
    try {
      // Sample just before each batch; stale expected positions are refused by
      // the backend if physics or another player moves the object meanwhile.
      const sample=await refresh();if(boundSession?.cleanupPending||sample.cleanupPending)throw new Error('Finish live session cleanup and reconnect before sending positions.');if(!boundSession?.sessionToken||sample.sessionToken!==boundSession.sessionToken||changed.some(binding=>binding.sessionToken!==boundSession.sessionToken))throw new Error('Live connection changed. Reconnect and bind objects again before sending positions.');const ops=changed.map(b=>{const object=sample.snapshot.objects.find(o=>o.datum===b.datum&&o.tagDatum===b.tagDatum);if(!object)throw new Error('Bound object respawned or disappeared. Reconnect and bind its new instance.');return {placementId:b.placementId,datum:b.datum,tagDatum:b.tagDatum,expectedPosition:object.position};});
      const receipts=await call<Receipt[]>('live_mcc_apply',{expectedSession:boundSession.sessionToken,projectId:project.id,document:doc,bindings:ops});
      for(const receipt of receipts){const b=changed.find(b=>b.datum===receipt.datum);if(receipt.applied&&b)applied.current.set(b.placementId,JSON.stringify(doc.placements.find(p=>p.id===b.placementId)!.position));}
      const confirmed=receipts.filter(r=>r.applied).length;setMessage(`${confirmed}/${changed.length} positions confirmed by game memory readback. ${receipts.find(r=>!r.applied)?.message??'In-game rendering, collision and other players still need verification.'}`);
      if(confirmed!==changed.length)setEnabled(false);await refresh();
    }catch(error){if(mounted.current){setError(String(error));setEnabled(false);setStatus(null);setBindings([]);}}
    finally{running.current=false;if(mounted.current)setBusy(false);}
  }
  useEffect(()=>{if(!enabled||!status)return;const timer=setInterval(()=>void apply(),150);return()=>clearInterval(timer);},[enabled,status?.pid,project.id]);
  useEffect(()=>{if(!status)return;let active=true;const timer=setInterval(()=>{if(running.current)return;void refresh().catch(error=>{if(active){setStatus(null);setBindings([]);setEnabled(false);setError(String(error));}});},2000);return()=>{active=false;clearInterval(timer);};},[status?.pid]);
  return <details className="forge-live-panel"><summary>Live Halo adapter · MCC</summary>
    <p>Experimental support for moving existing objects in MCC Halo 1, build 1.3528.0.0. Both executable hashes must match the reviewed profile.</p>
    {!status?<><LiveSessionRecovery disabled={busy} onBusyChange={value=>{running.current=value;sampleEpoch.current++;setBusy(value);}} onReleased={report=>{setStatus(null);setBindings([]);setEnabled(false);applied.current.clear();setError('');setMessage(report.detail);}}/><label><input type="checkbox" checked={mods} onChange={e=>setMods(e.target.checked)}/> I launched MCC using Anti-Cheat Disabled in Steam</label>
      <button disabled={!native||!mods||busy||doc.runtimeId!=='mccSteam'} onClick={async()=>{setBusy(true);setError('');try{const ticket=++sampleEpoch.current,value=await call<LiveStatus>('live_mcc_connect',{modsMode:mods});if(!mounted.current||ticket!==sampleEpoch.current)return;setStatus(value);setBindings([]);applied.current.clear();setMessage('Process and current map identified. Select a placement and bind its actual live object.');}catch(error){setError(String(error));}finally{setBusy(false);}}}>Connect running MCC</button></>:<>
      {status.cleanupPending&&<Notice tone="warn">Live cleanup is pending. Finish Disconnect and reconnect before sending positions.</Notice>}
      <p role="status">Connected · PID {status.pid} · {status.snapshot.identity.scenario} · {status.snapshot.objects.length} validated objects</p>
      {placement?<div className="analysis-actions"><label>Live instance for {placement.name}<select aria-label="Live object binding" value={objectId} onChange={e=>setObjectId(e.target.value)}><option value="">Choose matching object…</option>{candidates.map(o=><option key={o.datum} value={o.datum}>#{o.datum.toString(16)} · {o.position.map(v=>v.toFixed(2)).join(', ')}{o.player?' · player':''}</option>)}</select></label><button disabled={!objectId||!candidates.some(o=>String(o.datum)===objectId)} onClick={()=>{const o=candidates.find(o=>String(o.datum)===objectId)!;setBindings(b=>[...b.filter(b=>b.placementId!==placement.id&&b.datum!==o.datum),{sessionToken:status.sessionToken,placementId:placement.id,datum:o.datum,tagDatum:o.tagDatum,expectedPosition:o.position}]);applied.current.set(placement.id,JSON.stringify(placement.position));setMessage(`Bound ${placement.name}. Its next position change can be sent to MCC.`);}}>Bind selected placement</button></div>:<p>Select an asset placement to bind a matching object already in the loaded game.</p>}
      <label><input type="checkbox" disabled={!bindings.length||status.cleanupPending} checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Send bound position edits live · {bindings.length} bindings</label>
      <div className="analysis-actions"><button disabled={busy||!bindings.length} onClick={()=>void apply()}>Apply changed positions</button><button disabled={busy} onClick={async()=>{setEnabled(false);try{const report=await disconnectLiveSession(status.sessionToken);setStatus(null);setBindings([]);setMessage(report.detail);}catch(error){setError(String(error));}}}>Disconnect</button></div>
    </>}
    {message&&<p role="status">{message}</p>}{error&&<Notice tone="error">{error}</Notice>}
    <p className="subtle">Position changes include undo and redo. Rotation, scale, creation, deletion, BSP/tunnel geometry, lighting, free camera and peer replication need additional game-side support; they are not sent by this adapter. CE/Chimera is not connected by this MCC profile.</p>
  </details>;
}
