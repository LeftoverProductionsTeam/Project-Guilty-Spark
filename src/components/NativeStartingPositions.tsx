import {useEffect,useRef,useState} from 'react';
import {useMapState} from '../mapSession';
import {NATIVE_AI_START_VIEW,nativeAiStartPosition,nativeAiStartMatches,nativeAiStartKey,nativeAiStartFacing,nativeAiFacingClose,nativeAiFacingDegrees} from '../nativeAiStart';
import type {NativeAiStartView} from '../nativeAiStart';
import type {NativeOperation,NativeTagContext} from '../nativeOperations';
import {Notice} from './ui';

/** A source-coordinate form; native writes/history stay in NativeTagOperations. */
export default function NativeStartingPositions({context,busy,dirty,onPreview,onDraftChange,onLevelEditor,kind='start'}:{
  kind?:'start'|'firing';context:NativeTagContext;busy:boolean;dirty:boolean;onPreview:(operation:NativeOperation)=>void;onDraftChange:()=>void;onLevelEditor?:()=>void;
}) {
  const [squadKey,setSquadKey]=useState(''),[startIndex,setStartIndex]=useState('');
  const detail=useRef<HTMLDetailsElement>(null),lastReview=useRef(0);
  const [draft,setDraft]=useMapState<NativeAiStartView|null>(context.projectId,NATIVE_AI_START_VIEW,()=>null);
  const firing=kind==='firing',label=firing?'AI firing':'AI start';
  const rows:{encounter:number;squad:number;encounterName:string;name:string;starts?:{index:number;position:[number,number,number];facingRadians?:number|null;group?:string}[]|null}[]=firing?(context.scenarioCombat??[]).map(r=>({encounter:r.encounter,squad:-1,encounterName:r.name,name:'Firing positions',starts:r.points})):context.scenarioStartSquads??[];
  const squad=rows.find(row=>`${row.encounter}:${row.squad}`===squadKey)??rows.find(row=>row.encounter===draft?.encounter&&row.squad===draft.squad)??rows.find(row=>row.starts?.length)??rows[0];
  const point=squad?.starts?.find(point=>String(point.index)===startIndex)??squad?.starts?.find(point=>point.index===draft?.start)??squad?.starts?.[0];
  const key=nativeAiStartKey(context,squad?.encounter,squad?.squad,point?.index,firing?'firing':undefined);
  const values=draft?.key===key?draft.values:point?.position.map(String) as [string,string,string]|undefined;
  const position=nativeAiStartPosition(values);
  const hasFacing=typeof point?.facingRadians==='number'&&Number.isFinite(point.facingRadians);
  const facingText=draft?.key===key&&draft.facingDegrees!==undefined?draft.facingDegrees:hasFacing?nativeAiFacingDegrees(point!.facingRadians!):undefined;
  const group=draft?.key===key?draft.group??point?.group:point?.group;
  const facing=nativeAiStartFacing(facingText),valid=!!position&&(!hasFacing||facing!==null)&&(!firing||/^[a-z]$/.test(group??''));
  const positionChanged=!!point&&!!position&&point.position.some((value,index)=>Math.abs(value-position[index])>Math.max(1e-6,Math.abs(value)*2**-22));
  const facingChanged=hasFacing&&facing!==null&&!nativeAiFacingClose(point!.facingRadians!,facing);
  const changed=valid&&(positionChanged||facingChanged||firing&&group!==point?.group);
  const protectedGroup=!!squad&&context.protectedSquadEncounters?.includes(squad.encounterName.replace(/[A-Z]/g,char=>char.toLowerCase()));
  const issue=(firing?context.combatEditIssue:context.startEditIssue)??(protectedGroup?'This group has a preserved source recipe. Edit it in its original authoring workflow; direct overrides require source reconciliation.':null);
  // Busy belongs to this inspector, not every retained inspector of the map.
  // Sharing it makes idle and previewing panels fight over the same draft.
  const sourceLocked=dirty||!!issue;
  const disabled=busy||sourceLocked;
  useEffect(()=>{
    if(draft&&!nativeAiStartMatches(draft,context))setDraft(null);
  },[context]);
  useEffect(()=>{onDraftChange();},[draft?.key,JSON.stringify(draft?.values),draft?.facingDegrees,draft?.group]);
  useEffect(()=>{
    if(draft?.key===key&&nativeAiStartMatches(draft,context)&&draft.locked!==sourceLocked)setDraft({...draft,locked:sourceLocked});
  },[sourceLocked,key,draft]);
  useEffect(()=>{
    const request=draft?.reviewRequest??0;
    if((draft?.kind==='firing')!==firing||!request||lastReview.current===request||!draft||!nativeAiStartMatches(draft,context))return;
    lastReview.current=request;setSquadKey(`${draft.encounter}:${draft.squad}`);setStartIndex(String(draft.start));
    if(detail.current){detail.current.open=true;detail.current.querySelector<HTMLInputElement>(firing?'[aria-label="AI firing X"]':draft.mode==='rotate'?'[aria-label="AI start facing degrees"]':'[aria-label="AI start X"]')?.focus();}
  },[context,draft?.reviewRequest]);
  function coordinateDraft(next:[string,string,string],active=draft?.key===key&&draft.active,focus=draft?.key===key?draft.focus:0,pose:Partial<Pick<NativeAiStartView,'facingDegrees'|'mode'|'group'>>={}){
    if(!squad||!point||!context.tagSha256)return;
    setDraft({kind:firing?'firing':undefined,originalGroup:firing?point.group:undefined,group:firing?pose.group??group:undefined,key,projectId:context.projectId,buildId:context.buildId,tag:context.tag,sourceSha256:context.tagSha256,
      encounter:squad.encounter,squad:squad.squad,start:point.index,encounterName:squad.encounterName,squadName:squad.name,
      original:point.position,values:next,originalFacingRadians:hasFacing?point.facingRadians:null,facingDegrees:hasFacing?(pose.facingDegrees??facingText):undefined,mode:pose.mode??(draft?.key===key?draft.mode:undefined)??'translate',active,focus,locked:sourceLocked,reviewRequest:draft?.key===key?draft.reviewRequest:undefined});onDraftChange();
  }
  function preview() {
    if(disabled||!changed||!squad||!point||!position||!context.tagSha256)return;
    if(firing){onPreview({kind:'encounterFiringPosition',encounter:squad.encounter,point:point.index,encounterName:squad.encounterName,position,group:group!,sourceSha256:context.tagSha256});return;}
    onPreview({kind:'encounterStartPosition',encounter:squad.encounter,squad:squad.squad,start:point.index,
      encounterName:squad.encounterName,squadName:squad.name,position,sourceSha256:context.tagSha256,...(hasFacing&&facing!==null&&(facingChanged||Math.abs(point.facingRadians!)<=Math.PI*2+1e-6)?{facingRadians:facingChanged?facing:point.facingRadians!}:{})});
  }
  return <details className={firing?'native-ai-firing':'native-ai-starts'} ref={detail}>
    <summary>{firing?'AI firing positions':'AI starting positions'}</summary>
    <p className="subtle">{firing?'Edit this encounter firing point’s XYZ and group A–Z. Actor starts, tactical masks and navigation stay unchanged.':'Edit this native start’s XYZ coordinates and supported facing. Behavior, firing positions and navigation stay unchanged.'} {firing?'Rebuild and validate AI firing-position use and reachability afterward.':'Rebuild and validate actual spawning and reachability afterward.'}</p>
    {issue&&<Notice tone="info">{issue}</Notice>}
    {squad?<><label>{firing?'Encounter':'Encounter / squad'}<select aria-label={firing?'AI firing-position encounter':'AI starting-position squad'} value={`${squad.encounter}:${squad.squad}`} disabled={busy||dirty}
      onChange={event=>{setSquadKey(event.target.value);setStartIndex('0');setDraft(null);onDraftChange();}}>
      {rows.map(row=><option key={`${row.encounter}:${row.squad}`} value={`${row.encounter}:${row.squad}`}>
        {row.encounterName||'Unnamed encounter'}{!firing?' / '+(row.name||'Unnamed squad'):''} · {row.starts?.length??'unavailable'} {firing?'firing positions':'starts'}
      </option>)}
    </select></label>
      {!!squad.starts?.length&&<label>{firing?'Firing position':'Starting location'}<select aria-label={firing?'AI firing location':'AI starting location'} value={point?.index??''} disabled={busy||dirty}
        onChange={event=>{setStartIndex(event.target.value);setDraft(null);onDraftChange();}}>
        {squad.starts.map(point=><option key={point.index} value={point.index}>{firing?'Firing':'Start'} {point.index} · {point.position.join(', ')}</option>)}
      </select></label>}
      {point&&values&&<><div className="native-field-edit">
        {(['X','Y','Z'] as const).map((axis,index)=><label key={axis}>Native {axis}<input type="number" step={0.25} min={-1e6} max={1e6}
          aria-label={label+' '+axis} value={values[index]} disabled={disabled} onChange={event=>{
            const next=[...values] as [string,string,string];next[index]=event.target.value;
            coordinateDraft(next);
          }}/></label>)}
      </div>
        {firing&&<label>Native group<select aria-label="AI firing native group" value={group??''} disabled={disabled} onChange={e=>coordinateDraft(values,undefined,undefined,{group:e.target.value})}>{Array.from({length:26},(_,i)=>String.fromCharCode(97+i)).map(g=><option key={g} value={g}>{g.toUpperCase()}</option>)}</select></label>}
        {hasFacing?<label>Native facing (degrees)<input type="number" aria-label="AI start facing degrees" min={-360} max={360} step={5} value={facingText??''} disabled={disabled}
          onChange={event=>coordinateDraft(values,undefined,undefined,{facingDegrees:event.target.value})}/></label>:<p className="subtle">{firing?'Firing positions have no heading or scale.':'Facing unavailable for this source. Position editing remains supported.'}</p>}
        <label>Source handle tool<select aria-label={label+' handle mode'} value={draft?.key===key?draft.mode??'translate':'translate'} disabled={disabled}
          onChange={event=>coordinateDraft(values,undefined,Date.now(),{mode:event.target.value as 'translate'|'rotate'})}>
          <option value="translate">Move position</option><option value="rotate" disabled={!hasFacing}>Rotate facing · native Z yaw</option></select></label>
        <p className="subtle">Handles edit this unsaved source proposal only. {firing?'Use Move (W), then return here to review and accept XYZ/group. Rotation and Scale are unsupported.':'Use Move (W) or Rotate (E), then return here to review and accept. Rotation uses native Z yaw only; Scale is unsupported.'} Handles are not an actor model, collision or reachability proof.</p>
        <p className="subtle">Current source: {point.position.join(' · ')}{hasFacing?' · facing '+nativeAiFacingDegrees(point!.facingRadians!)+'°':firing?' · group '+point.group?.toUpperCase():''}. Only this point's requested fields will change.</p>
        {!valid&&<Notice tone="info">Enter three finite coordinates between −1,000,000 and1,000,000 and, when available, facing between −360° and360°.</Notice>}
        <div className="button-row">
          <button disabled={disabled||!valid||!/^[a-f0-9]{64}$/i.test(context.tagSha256??'')} onClick={()=>{coordinateDraft(values,true,Date.now());onLevelEditor?.();}}>Show handles in Level Editor</button>
          <button disabled={disabled||!changed||!/^[a-f0-9]{64}$/i.test(context.tagSha256??'')} onClick={preview}>{firing?'Preview AI firing position':facingChanged?(positionChanged?'Preview AI starting pose':'Preview AI facing'):'Preview AI starting position'}</button>
          <button disabled={busy||!draft||draft.key!==key} onClick={()=>{setDraft(null);onDraftChange();}}>{firing?'Reset firing draft':'Reset coordinate draft'}</button>
        </div>
        <p className="subtle">Review below → Accept as new source revision → build working tag edits → inspect compiled coordinates and {firing?'group':'facing'}. Restore before-edit tag selects the complete source from before that edit. Unaccepted drafts are temporary; no running game is changed here.</p>
      </>}
      {!squad.starts?.length&&!issue&&<p className="subtle">{firing?'This encounter has no firing positions. Adding native positions needs the encounter authoring workflow.':'This squad has no authored starting locations. Adding native locations needs the encounter authoring workflow.'}</p>}
    </>:!issue&&<p className="subtle">{firing?'Native firing-position inventory is unavailable.':'No native squad starting-location inventory is available.'}</p>}
  </details>;
}
