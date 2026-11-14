import { useId, useState } from 'react';
import { useMapState } from '../mapSession';
import type { NativeEncounterAppend } from '../nativeOperations';
import type { Project } from '../types';
import { Notice, NumberField } from './ui';

const safeName = (name:string) => /^[A-Za-z_][A-Za-z0-9_]{0,30}$/.test(name);
const safeActor = (path:string) => path.length>0 && path.length<=240 && !path.startsWith('-') &&
  !path.toLowerCase().endsWith('.actor_variant') && !path.split(/[\\/]/).some(part=>!part||part==='.'||part==='..') &&
  /^[A-Za-z0-9_\\/ .-]+$/.test(path);

/** Fresh campaign source; recovered scenario edits keep their existing review UI. */
export default function CampaignEncounters({project,edit}:{
  project:Project; edit:(next:Project,description:string)=>void;
}) {
  const doc=project.quickForge;
  const entries=doc?.campaignEncounters??[];
  const [selected,setSelected]=useMapState<string>(project.id,'campaign-encounter','');
  const [name,setName]=useState('gs_patrol_1'),[actor,setActor]=useState(''),[error,setError]=useState('');
  const choices=useId();
  const entry=entries.find(value=>value.name===selected)??entries[0];
  const actors=(project.nativeAssetImports??[]).filter(binding=>binding.tagClass==='actv').map(binding=>binding.nativePath);
  const total=entries.reduce((sum,value)=>sum+(value.count??1),0);
  const commit=(values:NativeEncounterAppend[],label:string)=>{
    if(!doc||doc.gameMode!=='campaign')return;
    if(values.length>16||values.reduce((sum,value)=>sum+(value.count??1),0)>128){
      setError('This native writer accepts up to 16 encounters and 128 starting locations in one reviewed source operation.');return;
    }
    edit({...project,quickForge:{...doc,campaignEncounters:values.length?values:undefined}},label);setError('');
  };
  const update=(patch:Partial<NativeEncounterAppend>)=>{
    if(entry)commit(entries.map(value=>value.name===entry.name?{...value,...patch}:value),'Edit campaign encounter source');
  };
  return <details className="studio-handoff">
    <summary>Campaign AI encounters · {entries.length} groups · {total} starts</summary>
    {!doc||doc.gameMode!=='campaign'?<p className="studio-hint">
      In Level Editor → Map properties, choose Campaign / scripted solo. Recovered scenario encounters
      keep their separate AI &amp; scenario native review workflow.
    </p>:<>
      <p className="studio-hint">Build &amp; playtest uses the existing native encounter writer.
        Choose a reviewed actor import below, or enter its exact editing-kit actor-variant path without an extension.
        These source groups do not enable a wave director or multiplayer replication.</p>
      <datalist id={choices}>{actors.map(path=><option key={path} value={path}/>)}</datalist>
      <div className="studio-fields">
        <label>New encounter name<input aria-label="New campaign encounter name" value={name} maxLength={31}
          onChange={event=>setName(event.target.value)}/></label>
        <label>Actor variant tag<input aria-label="New campaign actor tag" value={actor} list={choices} maxLength={240}
          onChange={event=>setActor(event.target.value)}/></label>
      </div>
      <button type="button" title="Choose a unique native name and a valid actor-variant tag path before adding an encounter."
        disabled={!safeName(name)||!safeActor(actor)||entries.length>=16||total>=128||
        entries.some(value=>value.name.toLowerCase()===name.toLowerCase())}
        onClick={()=>{
          const start=doc.spawns[0]?.position??[0,0,0];
          commit([...entries,{name,actorPath:actor,position:start.map((value,index)=>Math.max(-2000,Math.min(2000,value+(index===0?5:0)))) as [number,number,number],
            startActive:false,count:1,spacing:.75}],'Add campaign encounter source');
          setSelected(name);let index=entries.length+2;
          while(entries.some(value=>value.name===`gs_patrol_${index}`)||name===`gs_patrol_${index}`)index++;
          setName(`gs_patrol_${index}`);
        }}>Add encounter</button>
      {entry&&<>
        <label>Encounter<select aria-label="Campaign encounter" value={entry.name} onChange={event=>setSelected(event.target.value)}>
          {entries.map(value=><option key={value.name} value={value.name}>{value.name}</option>)}
        </select></label>
        <p className="studio-hint">Use this exact encounter name in a mission beat. Names stay stable;
          removing a group keeps mission references for explicit review and Undo.</p>
        <label>Actor tag<input aria-label="Campaign encounter actor tag" key={entry.name+':'+entry.actorPath}
          list={choices} defaultValue={entry.actorPath} maxLength={240} onBlur={event=>{
            if(event.target.value===entry.actorPath)return;
            if(!safeActor(event.target.value)){setError('Actor path was not applied. Choose an exact relative actor-variant path without an extension.');return;}
            update({actorPath:event.target.value});
          }}/></label>
        <div className="studio-fields">
          <label>Actors<NumberField label="Campaign actor count" value={entry.count??1} min={1} max={32} step={1}
            onCommit={value=>update({count:Math.round(value)})}/></label>
          <label>Spacing<NumberField label="Campaign actor spacing" value={entry.spacing??.75} min={.25} max={16} step={.25}
            onCommit={value=>update({spacing:value})}/></label>
          {(['X','Y','Z'] as const).map((axis,index)=><label key={axis}>Center {axis}<NumberField
            label={'Campaign encounter '+axis} value={entry.position[index]} min={-2000} max={2000} step={.25}
            onCommit={value=>{const position=[...entry.position] as [number,number,number];position[index]=value;update({position});}}/></label>)}
        </div>
        <label><input type="checkbox" checked={entry.startActive}
          onChange={event=>update({startActive:event.target.checked})}/>Create actors when the map starts</label>
        <p className="studio-hint">Leave initial creation off for mission-controlled encounters.
          Starting grids and firing points use the native source recipe; terrain contact, collision and AI navigation require native/game validation.</p>
        <button type="button" onClick={()=>commit(entries.filter(value=>value.name!==entry.name),'Remove campaign encounter source')}>
          Remove encounter from source
        </button>
      </>}
      <p className="studio-hint">Save preserves source intent. A native build stages dependencies, reviews changes against
        the actual scenario, and checks compiled actors and positions. This is not combat or peer acceptance.</p>
    </>}
    {error&&<Notice>{error}</Notice>}
  </details>;
}
