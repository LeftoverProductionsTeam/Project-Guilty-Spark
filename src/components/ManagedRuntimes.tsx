import {useEffect,useRef,useState} from 'react';
import {useMapState} from '../mapSession';
import {call,native} from '../api';
import type {RuntimeId,RuntimeRegistration} from '../types';
import ExternalBrowserLink from './ExternalBrowserLink';
interface Package {id:string;name:string;version:string;runtimeId:RuntimeId;url:string;releasePage:string;repository:string;sha256:string;bytes:number;license:string;vrVerified:boolean}
export default function ManagedRuntimes({onInstalled,onUseFolders}:{onInstalled:(runtime:RuntimeId)=>void;onUseFolders:()=>void}){
 const [items,setItems]=useState<Package[]>([]),[profiles,setProfiles]=useState<RuntimeRegistration[]>([]);
 const [layout,setLayout]=useState<{root:string}|null>(null);
 const [expanded,setExpanded]=useMapState('global','tools.downloadOpen',false);
 const [selected,setSelected]=useMapState('global','tools.enginePackage','chupathingy'),[content,setContent]=useState(''),[review,setReview]=useState<{job:string;files:number;expandedBytes:number}|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
 const alive=useRef(true),job=useRef<string|null>(null);
 useEffect(()=>{alive.current=true;if(native)void Promise.all([call<Package[]>('managed_runtime_packages'),call<RuntimeRegistration[]>('list_runtime_registrations'),call<{root:string}>('runtime_dynamic_layout',{root:null})]).then(([a,b,d])=>{if(alive.current){setItems(a??[]);setProfiles(b??[]);setLayout(d??null);const shared=b?.find(p=>p.runtimeId==='chupathingyCe'||p.runtimeId==='openCe');if(shared)setContent(shared.id);}}).catch(e=>{if(alive.current)setError(String(e));});return()=>{alive.current=false;const id=job.current;if(id)void call('cancel_map_download',{id}).then(()=>call('discard_runtime_pack_download',{id})).catch(()=>{});};},[]);
 const chosen=items.find(p=>p.id===selected);
 function clear(){const id=job.current;job.current=null;setReview(null);if(id)void call('cancel_map_download',{id}).then(()=>call('discard_runtime_pack_download',{id})).catch(()=>{});}
 async function run(action:()=>Promise<void>){setBusy(true);setError('');try{await action();}catch(e){if(alive.current)setError(String(e));}finally{if(alive.current)setBusy(false);}}
 async function download(){if(!chosen)return;await run(async()=>{
  clear();const next=await call<{id:string}>('prepare_runtime_engine_download',{packageId:selected,contentRegistrationId:content||null,dynamicRoot:content?null:layout?.root??null});job.current=next.id;
  let pending=false,polling=true;const timer=setInterval(()=>{if(pending)return;pending=true;void call<{detail:string;bytes:number;total:number|null}>('map_download_status',{id:next.id}).then(s=>{if(alive.current&&polling)setStatus((s.total?Math.round(s.bytes/s.total*100)+'% · ':'')+s.detail);}).catch(()=>{}).finally(()=>{pending=false;});},500);
  try{const plan=await call<{files:number;expandedBytes:number}>('fetch_runtime_engine_download',{id:next.id});polling=false;if(alive.current){setReview({job:next.id,...plan});setStatus('Publisher hash verified · ready to install');}else await call('discard_runtime_pack_download',{id:next.id});}finally{polling=false;clearInterval(timer);}
 });}
 async function install(){if(!review||!chosen)return;await run(async()=>{
  const result=await call<{contentReady:boolean;installed:{root:string;bytes:number;reused:boolean};registration:RuntimeRegistration}>('install_runtime_engine_download',{id:review.job});
  job.current=null;if(alive.current){setReview(null);setStatus(chosen.name+' ready for next launch. '+(result.contentReady?'Using the shared Halo library.':'Add your own Xbox maps to the shared library before playing.'));window.dispatchEvent(new Event('guilty-spark-runtime-connections-changed'));onInstalled(result.registration.runtimeId);}
 });}
 return <details className="managed-runtimes" open={expanded} onToggle={event=>setExpanded(event.currentTarget.open)}><summary>Get runtimes · one shared Halo library</summary>
 <p>Keep maps and resource banks once. Spark selects an engine for the next launch, with separate engine files, saves and logs. A running game stays open.</p>
 <button onClick={onUseFolders}>Use my runtime folders</button>
 <fieldset disabled={busy||!native}>
 <div className="runtime-pack-source"><label>Engine<select aria-label="Engine to download" value={selected} onChange={e=>{clear();setSelected(e.target.value);}}>{items.map(p=><option key={p.id} value={p.id}>{p.name} · {p.version}</option>)}</select></label>
 <label>Halo content<select aria-label="Engine shared Halo library" value={content} onChange={e=>{clear();setContent(e.target.value);}}><option value="">Spark dynamic runtime folder</option>{profiles.filter(p=>p.runtimeId==='openCe'||p.runtimeId==='chupathingyCe').map(p=><option key={p.id} value={p.id}>{p.root.replaceAll('\\','/').split('/').filter(Boolean).at(-1)} · shared maps</option>)}</select></label></div>
 {!content&&<div className="dynamic-runtime-layout"><label>Dynamic runtime folder<input aria-label="Dynamic runtime folder" readOnly value={layout?.root??''} placeholder="Default Spark data location"/></label><button onClick={()=>void run(async()=>{const next=await call<{root:string}|null>('choose_dynamic_runtime_root');if(next){clear();setLayout(next);}})}>Choose dynamic folder…</button><small>engines · maps (Xbox) · maps_ce (CE gameplay) · custom_maps (imports) · player_mods (your exports) · mods (visual/audio packs). Spark routes compatible map installs to the engine’s native folder.</small></div>}
 {chosen&&<p className="subtle">{(chosen.bytes/1048576).toFixed(1)} MiB download · Windows x64 · <ExternalBrowserLink href={chosen.releasePage}>Publisher release &amp; license</ExternalBrowserLink>{chosen.id==='openh1'?' · Desktop build; Windows VR not verified.':''}</p>}
 <button disabled={!chosen} onClick={()=>void download()}>Download selected engine</button>
 {review&&<div className="runtime-pack-review"><span>{review.files} engine files · {(review.expandedBytes/1048576).toFixed(1)} MiB · maps will be referenced, not copied</span><button onClick={()=>void install()}>Install &amp; connect engine</button><button onClick={clear}>Discard download</button></div>}
 </fieldset>
 {busy&&job.current&&<button onClick={()=>void call('cancel_map_download',{id:job.current})}>Cancel download</button>}
 {error&&<p role="alert">{error}</p>}{status&&<p role="status">{status}</p>}
 <small>MCC and stock Custom Edition keep their required native layouts. Connect an owned installation through its Halo card. No game maps or disc images are downloaded.</small>
 </details>;
}

