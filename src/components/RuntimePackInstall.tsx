import {useEffect,useRef,useState} from 'react';
import {call} from '../api';
import type {Inventory} from './RuntimeModPacks';
interface Plan {sha256:string;folder:string;name:string;files:number;installedBytes:number;archiveBytes:number}
interface Review {path:string;plan:Plan}
export default function RuntimePackInstall({inventory,onInstalled,onBusy,request}:{inventory:Inventory|null;onInstalled:()=>void;onBusy:(value:boolean)=>void;request:{kind:string;nonce:number}|null}){
 const [open,setOpen]=useState(false),[kind,setKind]=useState('custom'),[url,setUrl]=useState(''),[file,setFile]=useState(''),[review,setReview]=useState<(Review&{binding:Inventory;kind:string;downloadId?:string})|null>(null);
 const [enable,setEnable]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
 const alive=useRef(true),download=useRef<string|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(download.current){const id=download.current;void call('cancel_map_download',{id}).then(()=>call('discard_runtime_pack_download',{id})).catch(()=>{});}};},[]);
 useEffect(()=>{if(request){setKind(request.kind);setOpen(true);clearReview();}},[request]);
 function clearReview(){const id=download.current;download.current=null;if(id)void call('cancel_map_download',{id}).then(()=>call('discard_runtime_pack_download',{id})).catch(()=>{});setReview(null);}
 function state(value:boolean){if(alive.current)setBusy(value);onBusy(value);}
 async function run(action:()=>Promise<void>){state(true);setError('');try{await action();}catch(e){if(alive.current)setError(String(e));}finally{if(alive.current)state(false);}}
 async function browse(){await run(async()=>{const path=await call<string|null>('choose_runtime_pack_zip');if(path&&alive.current){setFile(path);clearReview();}});}
 async function inspect(){
  if(!inventory)return;const binding=inventory;
  await run(async()=>{const value=await call<Review>('inspect_runtime_pack_archive',{registrationId:binding.registrationId,path:file,kind});if(alive.current)setReview({...value,binding,kind});});
 }
 async function fetchPack(){
  if(!inventory)return;const binding=inventory;
  await run(async()=>{
   const job=await call<{id:string}>('prepare_runtime_pack_download',{registrationId:binding.registrationId,url,kind});download.current=job.id;
   let pending=false;
   const timer=setInterval(()=>{if(pending)return;pending=true;void call<{bytes:number;total:number|null;detail:string}>('map_download_status',{id:job.id}).then(s=>{if(alive.current)setStatus(s.total?Math.round(s.bytes/s.total*100)+'% · '+s.detail:s.detail);}).catch(()=>{}).finally(()=>{pending=false;});},500);
   try{const value=await call<Review>('fetch_runtime_pack_download',{id:job.id});if(alive.current){setReview({...value,binding,kind,downloadId:job.id});setStatus('Downloaded · review the checked package below');}else{await call('discard_runtime_pack_download',{id:job.id});}}finally{clearInterval(timer);}
  });
 }
 async function install(){
  if(!review)return;
  await run(async()=>{
   const result=await call<{name:string;files:number}>(review.downloadId?'install_runtime_pack_download':'install_runtime_pack_archive',review.downloadId?{id:review.downloadId,enabled:enable}:{registrationId:review.binding.registrationId,path:review.path,kind:review.kind,expectedSha256:review.plan.sha256,expectedExecutable:review.binding.executableSha256,expectedRoot:review.binding.dataRoot,expectedInventory:review.binding.inventorySha256,enabled:enable});
   download.current=null;if(alive.current){setReview(null);setStatus(result.name+' installed · '+result.files+' files · native playback still needs a game check');onInstalled();}
  });
 }
 return <details className="runtime-pack-install" open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary>Get / install packs…</summary>
  <p>Choose a publisher’s native pack ZIP. Spark downloads, checks and installs it in this engine’s mods folder; existing packs stay intact.</p>
  <fieldset disabled={busy||!inventory?.supported}>
   <label>Pack<select aria-label="Pack to install" value={kind} onChange={e=>{setKind(e.target.value);clearReview();}}>
    <option value="uncompressedTextures">Uncompressed textures</option><option value="tastefulEnhancements">Tasteful enhancements</option><option value="uncompressedAudio">Uncompressed audio</option><option value="custom">Another native pack</option>
   </select></label>
   <div className="runtime-pack-source"><input type="url" aria-label="Publisher pack ZIP link" placeholder="Publisher’s direct HTTPS ZIP link" value={url} onChange={e=>{setUrl(e.target.value);clearReview();}}/><button disabled={!url.trim()||kind!=='custom'} onClick={()=>void fetchPack()}>Download ZIP</button></div>
   <div className="runtime-pack-source"><input aria-label="Local pack ZIP" placeholder="Or choose a ZIP already downloaded" value={file} onChange={e=>{setFile(e.target.value);clearReview();}}/><button onClick={()=>void browse()}>Browse…</button><button disabled={!file.trim()} onClick={()=>void inspect()}>Review ZIP</button></div>
   {review&&<div className="runtime-pack-review">
    <strong>{review.plan.name}</strong><span>{review.plan.files} files · {(review.plan.installedBytes/1048576).toFixed(1)} MiB installed</span>
    <small>SHA-256: {review.plan.sha256}</small>
    <label><input type="checkbox" checked={enable} onChange={e=>setEnable(e.target.checked)}/>Enable on next launch from Spark</label>
    <button onClick={()=>void install()}>Install checked pack</button>{review.downloadId&&<button onClick={()=>{clearReview();setStatus('Temporary download discarded');}}>Discard download</button>}
   </div>}
  </fieldset>
  {busy&&download.current&&<button onClick={()=>void call('cancel_map_download',{id:download.current})}>Cancel download</button>}
  {error&&<p role="alert">{error}</p>}{status&&<p role="status">{status}</p>}
  <p className="subtle">Direct ZIPs up to 768 MiB, expanding to 2 GiB. The three named packs need verified author links. Until then, import their local ZIPs. Another native pack can use an author link you supply. The game checks native tag payloads when loading.</p>
 </details>;
}

