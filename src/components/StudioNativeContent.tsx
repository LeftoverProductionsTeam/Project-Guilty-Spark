import { useEffect, useRef, useState } from 'react';
import { call, native } from '../api';
import type { LibraryEntry, OpenProject } from '../types';
import type { QuickForgeDocument, StudioNativeAsset, StudioNativeDocument } from '../forge';
import { Notice } from './ui';

/** Local validation is a deliberate action. Receiving shared state never runs a
 * utility, reads a peer's path, or selects a native working-source revision. */
export default function StudioNativeContent({projectId,document:doc,entries,connected,viewer,onChange}:{projectId:string;document:QuickForgeDocument;entries:LibraryEntry[];connected:boolean;viewer:boolean;onChange:(doc:QuickForgeDocument)=>void}) {
  const [source,setSource]=useState(''),[tag,setTag]=useState(''),[tags,setTags]=useState<{id:number;path:string}[]>([]);
  const [directory,setDirectory]=useState(''),[file,setFile]=useState(''),[name,setName]=useState('Shared scenery');
  const [radius,setRadius]=useState('0.225'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const latest=useRef(doc);latest.current=doc;
  const content=doc.native;
  useEffect(()=>{let active=true;setTags([]);setTag('');if(source)void call<OpenProject>('open_project',{id:source}).then(p=>{if(active){const rows=p.inspection?.tags.filter(t=>t.class==='scen')??[];setTags(rows);setTag(String(rows[0]?.id??''));}},e=>{if(active)setError(String(e));});return()=>{active=false;};},[source]);
  async function run(action:()=>Promise<void>){setBusy(true);setError('');setMessage('');try{await action();}catch(e){setError(String(e));}finally{setBusy(false);}}
  return <section className="studio-native" aria-label="Shared native content" data-native-placement-state={JSON.stringify(doc.placements.filter(p=>p.publishedAssetId).map(({id,position,rotation})=>({id,position,rotation})))}>
    <h3>Native tags & published assets</h3>
    {!connected&&<>
      <p>Verify this map’s retained source and one scenery template before hosting or joining a native session. Each creator verifies their own source. Existing native tool revisions stay in their separate workflow.</p>
      <label>Owned preview map<select aria-label="Native preview map" value={source} onChange={e=>setSource(e.target.value)}><option value="">Choose an imported map</option>{entries.filter(e=>e.sha256).map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
      <label>Scenery template<select aria-label="Native scenery template" value={tag} onChange={e=>setTag(e.target.value)}>{tags.map(t=><option key={t.id} value={t.id}>{t.path}</option>)}</select></label>
      <label>Template tags folder<input aria-label="Native template tags folder" value={directory} onChange={e=>setDirectory(e.target.value)} placeholder="Optional; defaults to this map’s working tags"/></label>
      <button disabled={!native||busy||!source||!tag} onClick={()=>void run(async()=>{const result=await call<StudioNativeDocument>('studio_native_admit',{projectId,templateTagsDirectory:directory||null,previewProjectId:source,previewTagId:Number(tag)});onChange({...latest.current,native:result});setMessage('Local native source verified.');})}>Verify local native source</button>
    </>}
    {content&&<>
      <p className="subtle">Verified source {content.source.inventorySha256.slice(0,12)} · {content.source.templateTag}</p>
      <details className="studio-native-recovery"><summary>Source recovery</summary><p>Reconstruct the exact admitted source from the matching base tags and preserved dependencies. The damaged copy stays available.</p><button disabled={!native||busy} onClick={()=>void run(async()=>{const result=await call<{detail:string}>('studio_native_recover_source',{projectId,templateTagsDirectory:directory||null});setMessage(result.detail);})}>Restore exact admitted source</button></details>
      <label>Pistol bounding radius<input aria-label="Shared pistol bounding radius" type="number" min="0" max="100000" step="0.025" value={radius} disabled={viewer} onChange={e=>setRadius(e.target.value)}/></label>
      <p>Committed value: <output aria-label="Committed pistol bounding radius">{content.fields[0]?.boundingRadius??content.source.boundingRadius}</output></p>
      <button disabled={!connected||viewer||busy||!radius.trim()||!Number.isFinite(Number(radius))||Number(radius)===(content.fields[0]?.boundingRadius??content.source.boundingRadius)} onClick={()=>onChange({...doc,native:{...content,fields:[{id:'pistolBoundingRadius',boundingRadius:Number(radius)}]}})}>Share native field edit</button>
      <details className="studio-native-import"><summary>Publish scenery · {content.assets.length}/8</summary>
      <label>Complete scenery file<input aria-label="Native asset import path" value={file} onChange={e=>setFile(e.target.value)} placeholder="Local .scenery file matching the admitted template"/></label>
      <label>Published name<input aria-label="Published native asset name" value={name} onChange={e=>setName(e.target.value)}/></label>
      <button disabled={!connected||viewer||busy||!file||!name.trim()||content.assets.length>=8} onClick={()=>void run(async()=>{const asset=await call<StudioNativeAsset>('studio_native_import',{projectId,path:file,name});const current=latest.current;if(!current.native||current.native.source.inventorySha256!==content.source.inventorySha256)throw Error('Native source changed during import; validated candidate retained');onChange({...current,native:{...current.native,assets:[...current.native.assets,asset]}});})}>Validate & publish native asset</button>
      </details>
      <ul className="studio-assets">{content.assets.map(asset=><li key={asset.id}><strong title={asset.name}>{asset.name}</strong><small>{asset.bytes.length} bytes · {asset.sha256.slice(0,12)}</small><button aria-label={`Place ${asset.name}`} disabled={!connected||viewer||busy} onClick={()=>onChange({...doc,placements:[...doc.placements,{id:crypto.randomUUID(),publishedAssetId:asset.id,name:asset.name,tagClass:'scen',tagPath:`scenery/sparklink/${asset.id}`,tagId:content.source.previewTagId,sourceSha256:content.source.previewSha256,sourceProjectId:entries.find(e=>e.sha256===content.source.previewSha256)?.id??null,position:[2,2,0.1],rotation:[0,0,0],team:0,respawnSeconds:0,visible:true,locked:false}]})}>Place</button></li>)}</ul>
      {!content.assets.length&&<p className="subtle">No published assets yet. Imports are limited to the admitted native scenery template and its pinned dependencies.</p>}
    </>}
    {busy&&<p role="status">Validating local native source…</p>}{message&&<p role="status">{message}</p>}{error&&<Notice tone="error">{error}</Notice>}
  </section>;
}
