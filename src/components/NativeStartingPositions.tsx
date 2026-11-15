import {useState} from 'react';
import type {NativeOperation,NativeTagContext} from '../nativeOperations';
import {Notice} from './ui';

/** A source-coordinate form; native writes/history stay in NativeTagOperations. */
export default function NativeStartingPositions({context,busy,dirty,onPreview,onDraftChange}:{
  context:NativeTagContext;busy:boolean;dirty:boolean;onPreview:(operation:NativeOperation)=>void;onDraftChange:()=>void;
}) {
  const [squadKey,setSquadKey]=useState(''),[startIndex,setStartIndex]=useState('0');
  const [draft,setDraft]=useState<{key:string;values:[string,string,string]}|null>(null);
  const rows=context.scenarioStartSquads??[];
  const squad=rows.find(row=>`${row.encounter}:${row.squad}`===squadKey)??rows.find(row=>row.starts?.length)??rows[0];
  const point=squad?.starts?.find(point=>String(point.index)===startIndex)??squad?.starts?.[0];
  const key=JSON.stringify([context.projectId,context.buildId,context.tag,context.tagSha256,squad?.encounter,squad?.squad,point?.index]);
  const values=draft?.key===key?draft.values:point?.position.map(String) as [string,string,string]|undefined;
  const position=values?.map(Number) as [number,number,number]|undefined;
  const valid=!!values&&values.every(value=>value.trim()!==''&&Number.isFinite(Number(value))&&Math.abs(Number(value))<=1e6);
  const changed=!!point&&!!position&&valid&&point.position.some((value,index)=>
    Math.abs(value-position[index])>Math.max(1e-6,Math.abs(value)*2**-22));
  const protectedGroup=!!squad&&context.protectedSquadEncounters?.includes(squad.encounterName.replace(/[A-Z]/g,char=>char.toLowerCase()));
  const issue=context.startEditIssue??(protectedGroup?'This group has a preserved source recipe. Move its starts in its original authoring workflow; direct overrides require source reconciliation.':null);
  const disabled=busy||dirty||!!issue;
  function preview() {
    if(disabled||!changed||!squad||!point||!position||!context.tagSha256)return;
    onPreview({kind:'encounterStartPosition',encounter:squad.encounter,squad:squad.squad,start:point.index,
      encounterName:squad.encounterName,squadName:squad.name,position,sourceSha256:context.tagSha256});
  }
  return <details className="native-ai-starts">
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
            setDraft({key,values:next});onDraftChange();
          }}/></label>)}
      </div>
        <p className="subtle">Current source: {point.position.join(' · ')}. Only this start's position will change.</p>
        {!valid&&<Notice tone="info">Enter three finite coordinates between −1,000,000 and1,000,000.</Notice>}
        <div className="button-row">
          <button disabled={disabled||!changed||!/^[a-f0-9]{64}$/i.test(context.tagSha256??'')} onClick={preview}>Preview AI starting position</button>
          <button disabled={busy||!draft||draft.key!==key} onClick={()=>{setDraft(null);onDraftChange();}}>Reset coordinate draft</button>
        </div>
        <p className="subtle">Review below → Accept as new source revision → build working tag edits → inspect compiled coordinates. Restore before-edit tag restores accepted source. Unaccepted coordinates are temporary; no running game is changed here.</p>
      </>}
      {!squad.starts?.length&&!issue&&<p className="subtle">This squad has no authored starting locations. Adding native locations needs the encounter authoring workflow.</p>}
    </>:!issue&&<p className="subtle">No native squad starting-location inventory is available.</p>}
  </details>;
}
