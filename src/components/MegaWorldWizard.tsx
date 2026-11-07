import {useState} from 'react';
import AssetSourceBrowser from './AssetSourceBrowser';
import type {LibraryEntry,OpenProject} from '../types';
import {native} from '../api';

/** Admission and authoring stay in the existing source browser and BSP Assembly. */
export default function MegaWorldWizard({entries,onCreate,onCancel}:{entries:LibraryEntry[];onCreate:(title:string,baseId:string,donorId:string)=>Promise<void>;onCancel:()=>void}){
  const [loaded,setLoaded]=useState<OpenProject[]>([]),[title,setTitle]=useState('The Great Canyon');
  const [base,setBase]=useState(''),[donor,setDonor]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const maps=new Map(entries.filter(row=>row.sha256&&[6,7,13,609].includes(row.version??0)).map(row=>[row.id,{id:row.id,title:row.title,engine:row.engine}]));
  for(const row of loaded)if(row.project.source&&[6,7,13,609].includes(row.project.source.cacheVersion))maps.set(row.project.id,{id:row.project.id,title:row.project.title,engine:row.project.source.engine});
  const options=[...maps.values()];
  const select=(label:string,value:string,change:(value:string)=>void,other:string)=><label>{label}<select aria-label={label} value={value} disabled={busy} onChange={event=>change(event.target.value)}><option value="">Choose a source map…</option>{options.map(row=><option key={row.id} value={row.id} disabled={row.id===other}>{row.title} · {row.engine}</option>)}</select></label>;
  return <div className="new-megaworld">
    <h2>New MegaWorld</h2><p>Start with two source regions. Arrange them and edit their connection in the existing Level Editor and BSP Workshop.</p>
    <label>World name<input autoFocus aria-label="MegaWorld name" value={title} maxLength={120} disabled={busy} onChange={event=>setTitle(event.target.value)}/></label>
    <AssetSourceBrowser initialOpen actionLabel="Add source map" onLoaded={source=>{setLoaded(rows=>[...rows.filter(row=>row.project.id!==source.project.id),source]);setBase(current=>current||source.project.id);}}/>
    <div className="forge-wizard-fields">{select('First region',base,setBase,donor)}{select('Second region',donor,setDonor,base)}</div>
    <small>The current connected-BSP builder starts with one base BSP and one donor section. Matching editable donor tags are required. More regions follow separately verified connections; this does not enable region streaming.</small>
    {error&&<p role="alert">{error}</p>}
    <div className="button-row"><button disabled={busy} onClick={onCancel}>Cancel</button><button className="primary" disabled={!native||busy||!title.trim()||!maps.has(base)||!maps.has(donor)||base===donor} onClick={async()=>{setBusy(true);setError('');try{await onCreate(title.trim(),base,donor);}catch(error){setError(String(error));}finally{setBusy(false);}}}>{busy?'Inspecting native regions…':'Create MegaWorld'}</button></div>
  </div>;
}
