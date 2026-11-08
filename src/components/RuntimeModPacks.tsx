import {useEffect,useRef,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {call,native} from '../api';
import ExternalBrowserLink from './ExternalBrowserLink';
import RuntimePackInstall from './RuntimePackInstall';
import type {RuntimeId} from '../types';
interface Pack {folder:string;name:string;version:string|null;description:string;kind:string|null;enabled:boolean;nativeEnabled:boolean;toggleable:boolean;diagnostic:string|null;loadAfter:string[];loadBefore:string[]}
export interface Inventory {registrationId:string;executableSha256:string;supported:boolean;reason:string;dataRoot:string;inventorySha256:string;orderSha256:string|null;packs:Pack[];saved:boolean;needsReview:boolean;preferenceSha256:string|null}
const suggested=[
 {kind:'uncompressedTextures',name:'Uncompressed textures',description:'Lossless textures from the original source artwork.'},
 {kind:'tastefulEnhancements',name:'Tasteful enhancements',description:'Vanilla-style surface, Hunter and effect upgrades.'},
 {kind:'uncompressedAudio',name:'Uncompressed audio',description:'Recreated high-quality sounds.'},
];
export default function RuntimeModPacks({registrationId,runtime}:{registrationId?:string;runtime:RuntimeId}){
 const [inventory,setInventory]=useState<Inventory|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [installBusy,setInstallBusy]=useState(false),[installRequest,setInstallRequest]=useState<{kind:string;nonce:number}|null>(null);
 const mounted=useRef(true),epoch=useRef(0);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;epoch.current++;};},[]);
 async function refresh(){
  if(!registrationId||!native)return;
  const request=++epoch.current;setBusy(true);setError('');setMessage('');
  try{const value=await call<Inventory>('runtime_mod_packs',{registrationId});if(mounted.current&&request===epoch.current)setInventory(value);}
  catch(e){if(mounted.current&&request===epoch.current)setError(String(e));}
  finally{if(mounted.current&&request===epoch.current)setBusy(false);}
 }
 useEffect(()=>{void refresh();},[registrationId]);
 async function toggle(folder:string,on:boolean){
  if(!inventory||!registrationId)return;
  const request=++epoch.current;setBusy(true);setError('');setMessage('');
  const enabled=Object.fromEntries(inventory.packs.filter(p=>p.toggleable).map(p=>[p.folder,p.folder===folder?on:p.enabled]));
  try{
   const next=await call<Inventory>('save_runtime_mod_packs',{registrationId,expectedInventory:inventory.inventorySha256,expectedOrder:inventory.orderSha256,expectedPreference:inventory.preferenceSha256??null,enabled});
   if(mounted.current&&request===epoch.current){setInventory(next);setMessage('Saved for this engine profile · applies next launch from Spark');}
  }catch(e){if(mounted.current&&request===epoch.current)setError(String(e));}
  finally{if(mounted.current&&request===epoch.current)setBusy(false);}
 }
 const supported=inventory?.supported===true;
 return <section className="runtime-mod-packs" aria-label="Runtime presentation packs">
  <header><strong>Visual &amp; audio packs</strong><span>Per engine profile</span><button disabled={!registrationId||!native||busy} onClick={()=>void refresh()}><RefreshCw size={12}/>{busy?'Checking…':'Recheck packs'}</button></header>
  <div className="runtime-pack-grid">
   {inventory?.packs.map(pack=><label key={pack.folder} className="runtime-pack-row" title={pack.diagnostic??pack.description}>
    <input type="checkbox" aria-label={pack.name} checked={pack.enabled} disabled={busy||installBusy||!supported||!pack.toggleable} onChange={e=>void toggle(pack.folder,e.target.checked)}/>
    <span><strong>{pack.name}</strong><small>{pack.diagnostic??(pack.version?'Version '+pack.version:'Installed')}{pack.enabled!==pack.nativeEnabled?' · next launch':''}</small></span>
   </label>)}
   {suggested.filter(item=>!inventory?.packs.some(p=>p.kind===item.kind)).map(item=><label key={item.kind} className="runtime-pack-row" title={item.description}>
    <input type="checkbox" aria-label={item.name} checked={false} disabled/>
    <span><strong>{item.name}</strong><small>{supported?'Source unverified · not installed':inventory?'Unsupported':'Connect a compatible engine'}</small></span><button type="button" disabled={!supported||busy||installBusy} onClick={()=>setInstallRequest({kind:item.kind,nonce:Date.now()})}>Get…</button>
   </label>)}
  </div>
  <RuntimePackInstall inventory={inventory} onInstalled={()=>void refresh()} onBusy={setInstallBusy} request={installRequest}/>
  {error&&<p role="alert">{error}</p>}
  {message&&<p role="status">{message}</p>}
  {inventory?.needsReview&&<p role="status">The engine or pack metadata changed. Recheck the installed packs and save your choices again.</p>}
  <p className="subtle">{inventory?.reason??(runtime==='mccSteam'?'MCC uses its own native mod packages; these presentation packs need a compatible engine loader.':'Connect your installed engine to check its pack loader.')}</p>
  <details><summary>Install packs &amp; compatibility</summary>
   {supported?<p>Install the publisher’s pack folder, including its mod.toml and tags, in <code>{inventory?.dataRoot.replace(/[\\/]$/,'')}/mods</code>, then recheck. Spark preserves the engine’s priority and declared before/after rules. Other players’ packs stay independent.</p>:<p>Reviewed OpenCE, Faber and OpenH1 Windows builds can use this loader. Chupathingy, stock CE and MCC need their own compatible implementation; none is guessed here.</p>}
   <p>Pack file contents are validated by the game when loaded. These switches change presentation, not gameplay.</p>
   <ExternalBrowserLink href="https://github.com/OpenCommunityEdition/OpenCE/blob/fc9deb0b10eaae1d62caedb0710968b4e77e6e16/docs/mods.md">Native pack setup</ExternalBrowserLink>
  </details>
 </section>;
}

