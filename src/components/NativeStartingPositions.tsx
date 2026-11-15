import {useEffect,useRef,useState} from 'react';
import {useMapState} from '../mapSession';
import {NATIVE_AI_START_VIEW,nativeAiStartPosition,nativeAiStartMatches,nativeAiStartKey} from '../nativeAiStart';
import type {NativeAiStartView} from '../nativeAiStart';
import type {NativeOperation,NativeTagContext} from '../nativeOperations';
import {Notice} from './ui';

/** A source-coordinate form; native writes/history stay in NativeTagOperations. */
export default function NativeStartingPositions({context,busy,dirty,onPreview,onDraftChange,onLevelEditor}:{
  context:NativeTagContext;busy:boolean;dirty:boolean;onPreview:(operation:NativeOperation)=>void;onDraftChange:()=>void;onLevelEditor?:()=>void;
}) {
  const [squadKey,setSquadKey]=useState(''),[startIndex,setStartIndex]=useState('');
  const detail=useRef<HTMLDetailsElement>(null),lastReview=useRef(0);
  const [draft,setDraft]=useMapState<NativeAiStartView|null>(context.projectId,NATIVE_AI_START_VIEW,()=>null);
  const rows=context.scenarioStartSquads??[];
  const squad=rows.find(row=>`${row.encounter}:${row.squad}`===squadKey)??rows.find(row=>row.encounter===draft?.encounter&&row.squad===draft.squad)??rows.find(row=>row.starts?.length)??rows[0];
  const point=squad?.starts?.find(point=>String(point.index)===startIndex)??squad?.starts?.find(point=>point.index===draft?.start)??squad?.starts?.[0];
  const key=nativeAiStartKey(context,squad?.encounter,squad?.squad,point?.index);
  const values=draft?.key===key?draft.values:point?.position.map(String) as [string,string,string]|undefined;
  const position=nativeAiStartPosition(values);
  const valid=!!position;
  const changed=!!point&&!!position&&valid&&point.position.some((value,index)=>
    Math.abs(value-position[index])>Math.max(1e-6,Math.abs(value)*2**-22));
  const protectedGroup=!!squad&&context.protectedSquadEncounters?.includes(squad.encounterName.replace(/[A-Z]/g,char=>char.toLowerCase()));
  const issue=context.startEditIssue??(protectedGroup?'This group has a preserved source recipe. Move its starts in its original authoring workflow; direct overrides require source reconciliation.':null);
  // Busy belongs to this inspector, not every retained inspector of the map.
  // Sharing it makes idle and previewing panels fight over the same draft.
  const sourceLocked=dirty||!!issue;
  const disabled=busy||sourceLocked;
  useEffect(()=>{
    if(draft&&!nativeAiStartMatches(draft,context))setDraft(null);
  },[context]);
  useEffect(()=>{onDraftChange();},[draft?.key,JSON.stringify(draft?.values)]);
  useEffect(()=>{
    if(draft?.key===key&&nativeAiStartMatches(draft,context)&&draft.locked!==sourceLocked)setDraft({...draft,locked:sourceLocked});
  },[sourceLocked,key,draft]);
  useEffect(()=>{
    const request=draft?.reviewRequest??0;
    if(!request||lastReview.current===request||!draft||!nativeAiStartMatches(draft,context))return;
    lastReview.current=request;setSquadKey(`${draft.encounter}:${draft.squad}`);setStartIndex(String(draft.start));
    if(detail.current){detail.current.open=true;detail.current.querySelector<HTMLInputElement>('[aria-label="AI start X"]')?.focus();}
  },[context,draft?.reviewRequest]);
  function coordinateDraft(next:[string,string,string],active=draft?.key===key&&draft.active,focus=draft?.key===key?draft.focus:0){
    if(!squad||!point||!context.tagSha256)return;
    setDraft({key,projectId:context.projectId,buildId:context.buildId,tag:context.tag,sourceSha256:context.tagSha256,
      encounter:squad.encounter,squad:squad.squad,start:point.index,encounterName:squad.encounterName,squadName:squad.name,
      original:point.position,values:next,active,focus,locked:sourceLocked,reviewRequest:draft?.key===key?draft.reviewRequest:undefined});onDraftChange();
  }
  function preview() {
    if(disabled||!changed||!squad||!point||!position||!context.tagSha256)return;
    onPreview({kind:'encounterStartPosition',encounter:squad.encounter,squad:squad.squad,start:point.index,
      encounterName:squad.encounterName,squadName:squad.name,position,sourceSha256:context.tagSha256});
  }
  return <details className="native-ai-starts" ref={detail}>
    <summary>AI starting positions</summary>
    <p className="subtle">Edit the current native source's XYZ coordinates. Facing, behavior, firing positions and navigation stay unchanged. Rebuild and validate actual spawning and reachability afterward.</p>
    {issue&&<Notice tone="info">{issue}</Notice>}
    {squad?<><label>Encounter / squad<select aria-label="AI starting-position squad" value={`${squad.encounter}:${squad.squad}`} disabled={busy||dirty}
      onChange={event=>{setSquadKey(event.target.value);setStartIndex('0');setDraft(null);onDraftChange();}}>
      {rows.map(row=><option key={`${row.encounter}:${row.squad}`} value={`${row.encounter}:${row.squad}`}>
        {row.encounterName||'Unnamed encounter'} / {row.name||'Unnamed squad'} · {row.starts?.length??'unavailable'} starts
      </option>)}
    </select></label>
      {!!squad.starts?.length&&<label>Starting location<select aria-label="AI starting location" value={point?.index??''} disabled={busy||dirty}
        onChange={event=>{setStartIndex(event.target.value);setDraft(null);onDraftChange();}}>
        {squad.starts.map(point=><option key={point.index} value={point.index}>Start {point.index} · {point.position.join(', ')}</option>)}
      </select></label>}
      {point&&values&&<><div className="native-field-edit">
        {(['X','Y','Z'] as const).map((axis,index)=><label key={axis}>Native {axis}<input type="number" step={0.25} min={-1e6} max={1e6}
          aria-label={'AI start '+axis} value={values[index]} disabled={disabled} onChange={event=>{
            const next=[...values] as [string,string,string];next[index]=event.target.value;
            coordinateDraft(next);
          }}/></label>)}
      </div>
        <p className="subtle">Handles move this unsaved coordinate proposal only. Open Level Editor, then drag an axis; return here to review and accept. Handles are not an actor model, collision or reachability proof.</p>
        <p className="subtle">Current source: {point.position.join(' · ')}. Only this start's position will change.</p>
        {!valid&&<Notice tone="info">Enter three finite coordinates between −1,000,000 and1,000,000.</Notice>}
        <div className="button-row">
          <button disabled={disabled||!valid||!/^[a-f0-9]{64}$/i.test(context.tagSha256??'')} onClick={()=>{coordinateDraft(values,true,Date.now());onLevelEditor?.();}}>Show handles in Level Editor</button>
          <button disabled={disabled||!changed||!/^[a-f0-9]{64}$/i.test(context.tagSha256??'')} onClick={preview}>Preview AI starting position</button>
          <button disabled={busy||!draft||draft.key!==key} onClick={()=>{setDraft(null);onDraftChange();}}>Reset coordinate draft</button>
        </div>
        <p className="subtle">Review below → Accept as new source revision → build working tag edits → inspect compiled coordinates. Restore before-edit tag restores accepted source. Unaccepted coordinates are temporary; no running game is changed here.</p>
      </>}
      {!squad.starts?.length&&!issue&&<p className="subtle">This squad has no authored starting locations. Adding native locations needs the encounter authoring workflow.</p>}
    </>:!issue&&<p className="subtle">No native squad starting-location inventory is available.</p>}
  </details>;
}
