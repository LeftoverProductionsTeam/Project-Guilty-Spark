import {useMemo,useState} from 'react';
import type {MapInspection,Project} from '../types';
import Sound from './Sound';
import SoundMixer from './SoundMixer';

export default function MapSounds({projectId,inspection,project,edit,onOpenTag,onResources}:{projectId:string;inspection:MapInspection;project:Project;edit:(p:Project,description:string)=>void;onOpenTag?:(id:number)=>void;onResources?:()=>void}){
  const [query,setQuery]=useState(''),[selected,setSelected]=useState('');
  const sounds=useMemo(()=>inspection.tags.filter(t=>t.class==='snd!'),[inspection]);
  const choices=sounds.filter(t=>t.path.toLowerCase().includes(query.toLowerCase())).slice(0,100);
  return <details className="gs-map-sounds">
    <summary>Map sounds · {sounds.length} source tags</summary>
    {onResources&&<button className="small-button" onClick={onResources}>Locate Halo Sounds folder</button>}
    <label className="field-label">Find a map sound<input aria-label="Find a map sound" value={query} onChange={event=>setQuery(event.target.value)} placeholder="ambient, wind, weapon, music…"/></label>
    <select aria-label="Map sound tag" value={selected} onChange={event=>setSelected(event.target.value)}>
      <option value="">Choose a source sound</option>
      {selected&&!choices.some(t=>String(t.id)===selected)&&<option value={selected}>{sounds.find(t=>String(t.id)===selected)?.path}</option>}
      {choices.map(tag=><option key={tag.id} value={tag.id}>{tag.path}</option>)}
    </select>
    <p className="subtle">Showing up to 100 matches. Select a sound to inspect its samples or add a positional emitter below.</p>
    <SoundMixer project={project} inspection={inspection} sourceProjectId={projectId} tagId={selected?Number(selected):null} edit={edit}/>
    {selected&&<><button className="small-button" disabled={!onOpenTag} onClick={()=>onOpenTag?.(Number(selected))}>Open sound tag</button>
      <Sound key={selected} projectId={projectId} tagId={Number(selected)} sourceHash={inspection.sha256}/></>}
  </details>;
}
