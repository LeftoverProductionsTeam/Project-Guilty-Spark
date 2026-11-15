import {duplicateForgeNodes,removeForgeNodes} from '../forge';
import {nativeAiFacingDegrees} from '../nativeAiStart';
import { useEffect, useId, useRef, useState } from 'react';
import AssetSourceBrowser from './AssetSourceBrowser';
import {attachAssetImport,prepareCampaignActor} from '../nativeAssetImport';
import {beginProjectMutation} from '../projectMutation';
import { useMapState } from '../mapSession';
import {campaignAiStates,campaignEncounterStarts,campaignStartId,scaleCampaignDifficulty} from '../nativeOperations';
import type { NativeEncounterAppend } from '../nativeOperations';
import type { OpenProject,Project } from '../types';
import { Notice, NumberField } from './ui';

const safeName = (name:string) => /^[A-Za-z_][A-Za-z0-9_]{0,30}$/.test(name);
const safeActor = (path:string) => path.length>0 && path.length<=240 && !path.startsWith('-') &&
  !path.toLowerCase().endsWith('.actor_variant') && !path.split(/[\\/]/).some(part=>!part||part==='.'||part==='..') &&
  /^[A-Za-z0-9_\\/ .-]+$/.test(path);

/** Fresh campaign source; recovered scenario edits keep their existing review UI. */
export default function CampaignEncounters({project,edit,onSelectStart}:{
  project:Project; edit:(next:Project,description:string)=>void;onSelectStart?:(id:string)=>void;
}) {
  const doc=project.quickForge;
  const entries=doc?.campaignEncounters??[];
  const [startId,setStartId]=useMapState(project.id,'campaign-start','');
  const [selected,setSelected]=useMapState<string>(project.id,'campaign-encounter','');
  const [normalFactor,setNormalFactor]=useState('1'),[insaneFactor,setInsaneFactor]=useState('1'),[scaleScope,setScaleScope]=useState('all');
  const [name,setName]=useState('gs_patrol_1'),[actor,setActor]=useState(''),[error,setError]=useState('');
  const choices=useId();
  const [actorSource,setActorSource]=useState<OpenProject|null>(null),[sourceTag,setSourceTag]=useState(''),[sourceQuery,setSourceQuery]=useState(''),[importing,setImporting]=useState(false);
  const latest=useRef(project);latest.current=project;
  const sourceRef=useRef(actorSource);sourceRef.current=actorSource;
  const scope=useRef({id:project.id,active:true});
  useEffect(()=>{const life={id:project.id,active:true};scope.current=life;setActorSource(null);setSourceTag('');setImporting(false);setNormalFactor('1');setInsaneFactor('1');setScaleScope('all');return()=>{life.active=false;};},[project.id]);
  const candidates=(actorSource?.inspection?.tags??[]).filter(tag=>tag.class==='actv');
  const matches=candidates.filter(tag=>tag.path.toLowerCase().includes(sourceQuery.toLowerCase()));
  async function includeActor(){
    if(importing||!actorSource||!sourceTag)return;
    const input=latest.current,origin=actorSource,life=scope.current,release=beginProjectMutation(input.id);setImporting(true);setError('');
    try{
      const binding=await prepareCampaignActor(input,origin,Number(sourceTag)),current=latest.current;
      if(!life.active||scope.current!==life||current.id!==input.id||current.quickForge!==input.quickForge||sourceRef.current!==origin)
        throw Error('The campaign or actor source changed during inclusion. No old actor was applied; prepared tags remain available for retry.');
      edit(attachAssetImport(current,binding),'Include campaign actor source');setActor(binding.nativePath);
    }catch(problem){if(life.active&&scope.current===life)setError(String(problem));}
    finally{release();if(life.active&&scope.current===life)setImporting(false);}
  }
  const entry=entries.find(value=>value.name===selected)??entries[0];
  let scaling:ReturnType<typeof scaleCampaignDifficulty>|undefined,scalingIssue='';
  if(entries.length)try{scaling=scaleCampaignDifficulty(entries,normalFactor.trim()?Number(normalFactor):NaN,insaneFactor.trim()?Number(insaneFactor):NaN,scaleScope==='selected'?entry?.name:undefined);}catch(problem){scalingIssue=String(problem);}
  const points=entry?campaignEncounterStarts(entry):[],point=points.find(point=>point.id===startId)??points[0];
  const actors=(project.nativeAssetImports??[]).filter(binding=>binding.tagClass==='actv').map(binding=>binding.nativePath);
  const total=entries.reduce((sum,value)=>sum+(value.count??1),0);
  const commit=(values:NativeEncounterAppend[],label:string)=>{
    if(!doc||doc.gameMode!=='campaign')return;
    if(values.length>16||values.reduce((sum,value)=>sum+(value.count??1),0)>128){
      setError('This native writer accepts up to 16 encounters and 128 starting locations in one reviewed source operation.');return;
    }
    if(values.some(value=>value.difficulty&&[value.difficulty.normal,value.difficulty.insane].some(count=>!Number.isInteger(count)||count<0||count>(value.count??1)))){
      setError('Keep native difficulty counts between 0 and the number of authored starting positions. Add starts first, or lower the overrides before removing starts.');return;
    }
    try{for(const value of values)campaignEncounterStarts(value);}catch(problem){setError(String(problem));return;}
    edit({...project,quickForge:{...doc,campaignEncounters:values.length?values:undefined}},label);setError('');
  };
  const update=(patch:Partial<NativeEncounterAppend>)=>{
    if(entry)commit(entries.map(value=>value.name===entry.name?{...value,...patch}:value),'Edit campaign encounter source');
  };
  function updatePoint(patch:Partial<import('../nativeOperations').NativeEncounterStart>){if(entry&&point)update({starts:points.map(value=>value.id===point.id?{...value,...patch}:value)});}
  function changeStart(remove=false){
    if(!entry||!point||!doc)return;try{const id=campaignStartId(entry.name,point.id);
      if(remove)commit(removeForgeNodes(doc,[id]).campaignEncounters??[],'Remove campaign starting location');
      else {const next=duplicateForgeNodes(doc,[id]);commit(next.document.campaignEncounters??[],'Duplicate campaign starting location');setStartId(next.ids[0]?.slice(('campaign:'+entry.name+':').length)??'');}
    }catch(problem){setError(String(problem));}
  }
  return <details className="studio-handoff">
    <summary>Campaign AI encounters · {entries.length} groups · {total} starts</summary>
    {!doc||doc.gameMode!=='campaign'?<p className="studio-hint">
      In Level Editor → Map properties, choose Campaign / scripted solo. Recovered scenario encounters
      keep their separate AI &amp; scenario native review workflow.
    </p>:<>
      <p className="studio-hint">Build &amp; playtest uses the existing native encounter writer.
        Choose a reviewed actor import below, or enter its exact editing-kit actor-variant path without an extension.
        These source groups do not enable a wave director or multiplayer replication.</p>
      <details><summary>Include actors from a map · Xbox and other native sources</summary>
        <AssetSourceBrowser actionLabel="Read campaign actor source" onLoaded={source=>{setActorSource(source);setSourceTag('');setSourceQuery('');}}/>
        {actorSource&&<>
          <p className="studio-hint">{actorSource.project.title} · cache {actorSource.inspection?.header.version??'unavailable'} · source {actorSource.inspection?.sha256.slice(0,12)}…</p>
          <label>Find source actor<input type="search" aria-label="Find campaign source actor" value={sourceQuery} onChange={event=>setSourceQuery(event.target.value)}/></label>
          <label>Source actor<select aria-label="Campaign source actor" value={sourceTag} disabled={importing} onChange={event=>setSourceTag(event.target.value)}>
            <option value="">Choose a native actor variant</option>
            {sourceTag&&!matches.slice(0,100).some(tag=>String(tag.id)===sourceTag)&&candidates.filter(tag=>String(tag.id)===sourceTag).map(tag=><option key={tag.id} value={tag.id}>{tag.path}</option>)}
            {matches.slice(0,100).map(tag=><option key={tag.id} value={tag.id}>{tag.path}</option>)}
          </select></label>
          <small>{matches.length} matches · showing up to100; search to narrow the source list.</small>
          <button type="button" disabled={importing||!sourceTag} onClick={()=>void includeActor()}>{importing?'Including actor dependencies…':'Include actor for new encounter'}</button>
        </>}
        <p className="studio-hint">Reads your owned map and preserves its native actor, model, animation, sound and other dependencies in the existing managed import.
          After inclusion, enter the encounter name and click Add encounter. Xbox model conversion, when required by a PC build, applies only to that build's disposable tags.
          Missing dependencies or unsupported data block the native build; import is not gameplay acceptance.</p>
      </details>
      <datalist id={choices}>{actors.map(path=><option key={path} value={path}/>)}</datalist>
      <div className="studio-fields">
        <label>New encounter name<input aria-label="New campaign encounter name" value={name} maxLength={31}
          onChange={event=>setName(event.target.value)}/></label>
        <label>Actor variant tag<input aria-label="New campaign actor tag" value={actor} disabled={importing} list={choices} maxLength={240}
          onChange={event=>setActor(event.target.value)}/></label>
      </div>
      <button type="button" title="Choose a unique native name and a valid actor-variant tag path before adding an encounter."
        disabled={importing||!safeName(name)||!safeActor(actor)||entries.length>=16||total>=128||
        entries.some(value=>value.name.toLowerCase()===name.toLowerCase())}
        onClick={()=>{
          const start=doc.spawns[0]?.position??[0,0,0];
          commit([...entries,{name,actorPath:actor,position:start.map((value,index)=>Math.max(-2000,Math.min(2000,value+(index===0?5:0)))) as [number,number,number],
            startActive:false,count:1,spacing:.75}],'Add campaign encounter source');
          setSelected(name);let index=entries.length+2;
          while(entries.some(value=>value.name===`gs_patrol_${index}`)||name===`gs_patrol_${index}`)index++;
          setName(`gs_patrol_${index}`);
        }}>Add encounter</button>
      {!!entries.length&&<details className="campaign-difficulty-batch"><summary>Scale campaign difficulty populations</summary>
        <p className="studio-hint">Review native normal/insane population fields together. Counts are rounded and capped by each group's authored starts. Add starting positions separately to support more actors; this changes neither placement, AI damage/health/behavior nor multiplayer authority.</p>
        <div className="studio-fields">
          <label>Groups<select aria-label="Campaign difficulty scope" value={scaleScope} onChange={event=>setScaleScope(event.target.value)}><option value="all">All campaign groups</option><option value="selected">Selected encounter</option></select></label>
          <label>Normal multiplier<input type="number" aria-label="Campaign normal population factor" min={0} max={4} step={.25} value={normalFactor} onChange={event=>setNormalFactor(event.target.value)}/></label>
          <label>Insane multiplier<input type="number" aria-label="Campaign insane population factor" min={0} max={4} step={.25} value={insaneFactor} onChange={event=>setInsaneFactor(event.target.value)}/></label>
        </div>
        {scalingIssue&&<Notice tone="info">{scalingIssue}</Notice>}
        {scaling&&<table aria-label="Campaign population preview"><thead><tr><th>Group</th><th>Normal</th><th>Insane</th><th>Limit</th></tr></thead><tbody>{scaling.rows.map(row=><tr key={row.name}><th scope="row">{row.name}</th><td>{row.before[0]} → {row.after[0]}</td><td>{row.before[1]} → {row.after[1]}</td><td>{row.clamped?'Capped at authored starts':'Within authored starts'}</td></tr>)}</tbody></table>}
        <p className="studio-hint">Applying commits all displayed changes as one project Undo/Redo step. Save, prepare the mission again when needed, build and independently inspect both native fields. Lower populations can invalidate a mission's minimum-survivor condition; existing mission preparation/build checks still refuse that mismatch.</p>
        <button type="button" disabled={!scaling?.changed} onClick={()=>{if(scaling?.changed)commit(scaling.entries,'Scale campaign native difficulty populations');}}>Apply campaign population scaling</button>
      </details>}
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
          <label>Starting positions<NumberField label="Campaign starting position count" value={entry.count??1} min={Math.max(1,entry.difficulty?.normal??1,entry.difficulty?.insane??1)} max={32} step={1}
            disabled={!!entry.starts} onCommit={value=>update({count:Math.round(value)})}/></label>
          <label>Spacing<NumberField label="Campaign actor spacing" value={entry.spacing??.75} min={.25} max={16} step={.25}
            disabled={!!entry.starts} onCommit={value=>update({spacing:value})}/></label>
          {(['X','Y','Z'] as const).map((axis,index)=><label key={axis}>Center {axis}<NumberField
            label={'Campaign encounter '+axis} disabled={points.some(point=>point.locked)} value={entry.position[index]} min={-2000} max={2000} step={.25}
            onCommit={value=>{const position=[...entry.position] as [number,number,number];const delta=value-position[index];position[index]=value;update({position,...(entry.starts?{starts:entry.starts.map(point=>({...point,position:point.position.map((v,i)=>v+(i===index?delta:0)) as [number,number,number]}))}:{})});}}/></label>)}
        </div>
        {point&&<details className="campaign-start-poses"><summary>Individual starting locations · {points.length}</summary>
          <p className="studio-hint">Choose a start to edit XYZ and native Z facing, or select it in Level Editor and use Move(W)/Rotate(E), grid snap and Frame(F). The first pose edit preserves the generated grid as explicit source. Scale, pitch and roll do not apply. These are start markers; native compilation, actor behavior and navigation need separate validation.</p>
          <label>Starting location<select aria-label="Campaign starting location" value={point.id} onChange={event=>setStartId(event.target.value)}>{points.map((value,index)=><option key={value.id} value={value.id}>Start {index} · {value.position.join(', ')}</option>)}</select></label>
          <fieldset disabled={!!point.locked}><div className="studio-fields">{(['X','Y','Z'] as const).map((axis,index)=><label key={axis}>Start {axis}<NumberField label={'Campaign start '+axis} value={point.position[index]} min={-2048} max={2048} step={.25} onCommit={value=>{const position=[...point.position] as [number,number,number];position[index]=value;updatePoint({position});}}/></label>)}
          <label>Facing (degrees)<NumberField label="Campaign start facing degrees" value={Number(nativeAiFacingDegrees(point.facingRadians))} min={-360} max={360} step={5} onCommit={value=>updatePoint({facingRadians:value*Math.PI/180})}/></label></div></fieldset>
          <label><input type="checkbox" checked={point.visible!==false} onChange={event=>updatePoint({visible:event.target.checked})}/>Show start marker (editor only)</label>
          <label><input type="checkbox" checked={!!point.locked} onChange={event=>updatePoint({locked:event.target.checked})}/>Lock start editing</label>
          <p className="studio-hint">Hidden starts still compile and count toward difficulty populations. Locks protect editor changes. Group center moves all explicit starts together; count/spacing controls stay unchanged until Reset to grid, so custom poses cannot be silently dropped.</p>
          <div className="button-row"><button disabled={!onSelectStart||point.visible===false} title={point.visible===false?'Show the marker first to select it in Level Editor.':'Select this exact authored start; originals and native tags stay unchanged until building.'} onClick={()=>onSelectStart?.(campaignStartId(entry.name,point.id))}>Select AI start in Level Editor</button>
          <button disabled={!!point.locked||points.length>=32||total>=128} onClick={()=>changeStart()}>Duplicate AI start</button>
          <button disabled={!!point.locked||points.length<=1||!!entry.difficulty&&Math.max(entry.difficulty.normal,entry.difficulty.insane)>=points.length} onClick={()=>changeStart(true)}>Remove AI start</button>
          <button disabled={!entry.starts||points.some(point=>point.locked)} title="Replace individual poses with the original group-center grid in one Undo step." onClick={()=>update({starts:undefined})}>Reset AI starts to grid</button></div>
        </details>}
        <details><summary>Difficulty population</summary>
          <p className="studio-hint">The native normal/insane fields use all authored starts by default. Override them to keep fewer actors on a selected engine's difficulty settings. This does not change AI health, damage, behavior or player-count scaling.</p>
          <label><input type="checkbox" checked={!!entry.difficulty} onChange={event=>update({
            difficulty:event.target.checked?{normal:entry.count??1,insane:entry.count??1}:undefined
          })}/>Use separate native difficulty counts</label>
          {entry.difficulty&&<div className="studio-fields">
            <label>Normal field<NumberField label="Campaign native normal population" value={entry.difficulty.normal} min={0} max={entry.count??1} step={1}
              onCommit={value=>update({difficulty:{normal:Math.round(value),insane:entry.difficulty!.insane}})}/></label>
            <label>Insane field<NumberField label="Campaign native insane population" value={entry.difficulty.insane} min={0} max={entry.count??1} step={1}
              onCommit={value=>update({difficulty:{normal:entry.difficulty!.normal,insane:Math.round(value)}})}/></label>
          </div>}
          <p className="studio-hint">Authored starts: {entry.count??1} · native normal: {entry.difficulty?.normal??entry.count??1} · native insane: {entry.difficulty?.insane??entry.count??1}.
            Add enough starts first. To remove starts, lower the overrides first. Save, Undo/Redo and source sharing include these values; native and gameplay validation remain required.</p>
        </details>
        <div className="studio-fields">{(['initialState','returnState'] as const).map(key=><label key={key}>{key==='initialState'?'Initial behavior':'Return behavior'}<select aria-label={key==='initialState'?'Campaign initial AI state':'Campaign return AI state'} value={entry.behavior?.[key]??'alert'} onChange={event=>update({behavior:{initialState:entry.behavior?.initialState??'alert',returnState:entry.behavior?.returnState??'alert',[key]:event.target.value as import('../nativeOperations').CampaignAiState}})}>{campaignAiStates.map(state=><option key={state} value={state}>{state[0].toUpperCase()+state.slice(1)}</option>)}</select></label>)}</div>
        <p className="studio-hint">Native squad and starting-location states share these settings. Initial applies at creation; return is the authored fallback state. Actor abilities, navigation and scripts determine actual behavior. Movement-loop modes require route authoring and are not offered here. Reprepare the mission after changing source, then Save and build.</p>
        <label><input type="checkbox" checked={entry.startActive}
          onChange={event=>update({startActive:event.target.checked})}/>Create actors when the map starts</label>
        <p className="studio-hint">Leave initial creation off for mission-controlled encounters.
          Starting grids and firing points use the native source recipe; terrain contact, collision and AI navigation require native/game validation.</p>
        <button type="button" disabled={points.some(point=>point.locked)} title="Unlock this group's start poses before removing the encounter." onClick={()=>commit(entries.filter(value=>value.name!==entry.name),'Remove campaign encounter source')}>
          Remove encounter from source
        </button>
      </>}
      <p className="studio-hint">Save preserves source intent. A native build stages dependencies, reviews changes against
        the actual scenario, and checks compiled actors and positions. This is not combat or peer acceptance.</p>
    </>}
    {error&&<Notice>{error}</Notice>}
  </details>;
}
