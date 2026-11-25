import NativeBspPointCheck from './NativeBspPointCheck';
import {useEffect,useRef,useState} from 'react';
import {useMapState,writeMapSession} from '../mapSession';
import {NATIVE_DEVICE_VIEW,deviceMatches,deviceDraft,devicePose,deviceObjectId} from '../nativeDevicePlacement';
import type {NativeDeviceView} from '../nativeDevicePlacement';
import type {NativeDeviceGroup,NativeTagContext,NativeOperation} from '../nativeOperations';
import {Notice} from './ui';
export default function NativeDevicePlacements({context,busy,dirty,onPreview,onDraftChange,onLevelEditor}:{context:NativeTagContext;busy:boolean;dirty:boolean;onPreview:(op:NativeOperation)=>void;onDraftChange:()=>void;onLevelEditor?:()=>void}){
 const [view,setView]=useMapState<NativeDeviceView|null>(context.projectId,NATIVE_DEVICE_VIEW,()=>null),[selected,setSelected]=useState('');const details=useRef<HTMLDetailsElement>(null),review=useRef(0),rows=context.scenarioDevices??[];
 const owns=!!view&&deviceMatches(view,context),original=owns?view.original:rows.find(row=>row.class+':'+row.index===selected)??rows[0];const vehicle=original?.class==='vehi',label=vehicle?'Vehicle':'Device';const draft=original?(owns?view:deviceDraft(original)):null,pose=original&&draft?devicePose({...draft,original}):null,changed=!!pose&&JSON.stringify(pose)!==JSON.stringify(original);const blocked=busy||dirty||!!context.deviceEditIssue||owns&&view.locked||!/^[a-f0-9]{64}$/i.test(context.tagSha256??'');
 useEffect(()=>{if(view&&!deviceMatches(view,context))setView(null);},[context]);useEffect(()=>{onDraftChange();},[JSON.stringify(view)]);useEffect(()=>{if(owns&&view.reviewRequest&&review.current!==view.reviewRequest){review.current=view.reviewRequest;if(details.current){details.current.open=true;details.current.querySelector<HTMLInputElement>(`[aria-label="${label} position X"]`)?.focus();}}},[context,view?.reviewRequest]);
 const groups=context.scenarioDeviceGroups;
 const wiringLocked=!!original&&(/^extraction_/i.test(original.name)||groups?.some(group=>group.reserved&&[original.powerGroup,original.positionGroup].includes(group.index)));
 function update(patch:Partial<NativeDeviceView>){if(!original||!draft||!context.tagSha256)return;setView({projectId:context.projectId,buildId:context.buildId,tag:context.tag,sourceSha256:context.tagSha256,original,active:false,focus:0,...(owns?view:{}),...draft,...patch});onDraftChange();}
 return <details className="native-device-placements" ref={details}><summary>Existing controls, machines &amp; vehicles · {rows.length}</summary><p className="subtle">Edit an existing native placement or connect controls and machines through scenario groups. Existing names, indices, palette references and group definitions are preserved. Aircraft poses must leave clear walking/boarding space and stable ground; editor placement does not prove a native landing. Preview → Accept → Save → rebuild. Native Restore is separate from project Undo; terminal use, door collision and gameplay need separate testing.</p>
 {context.deviceEditIssue&&<Notice tone="info">{context.deviceEditIssue}</Notice>}
 {groups&&context.tagSha256&&<DeviceGroupAppend key={JSON.stringify([context.projectId,context.buildId,context.tag,context.tagSha256])}
  groups={groups} sourceSha256={context.tagSha256} disabled={busy||dirty||!!context.deviceEditIssue} onPreview={onPreview} onDraftChange={onDraftChange}/>}
 {original&&draft&&<><label>Placement<select aria-label="Native source placement" value={original.class+':'+original.index} disabled={busy||dirty} onChange={e=>{setSelected(e.target.value);setView(null);onDraftChange();}}>{rows.map(row=><option key={row.class+':'+row.index} value={row.class+':'+row.index}>{row.class} {row.index} · {row.name||'Unnamed placement'} · {row.tagPath}</option>)}</select></label><fieldset disabled={!!blocked}><legend>Native position & rotation</legend><div className="studio-fields">{(['position','angles'] as const).map(field=><div key={field}>{['X','Y','Z'].map((axis,i)=><label key={axis}>{field==='position'?axis:['Yaw','Pitch','Roll'][i]}{field==='angles'?' °':''}<input type="number" step="any" aria-label={label+' '+(field==='position'?'position '+axis:['yaw','pitch','roll'][i])} value={draft[field][i]} onChange={e=>update({[field]:draft[field].map((v,j)=>j===i?e.target.value:v) as [string,string,string]})}/></label>)}</div>)}</div></fieldset>
 {original.class==='ctrl'&&(original.usableFromBothSides!==undefined||original.interactionDisabled!==undefined)&&<fieldset disabled={!!blocked}><legend>Control interaction</legend>
 {original.interactionDisabled!==undefined&&<label className="checkbox-label"><input type="checkbox" checked={draft.interactionDisabled??original.interactionDisabled} onChange={e=>update({interactionDisabled:e.target.checked})}/>Disable player interaction</label>}
 {original.usableFromBothSides!==undefined&&<label className="checkbox-label"><input type="checkbox" checked={draft.usableFromBothSides??original.usableFromBothSides} disabled={draft.interactionDisabled??original.interactionDisabled} onChange={e=>update({usableFromBothSides:e.target.checked})}/>Allow use from both sides</label>}
 <p className="subtle">{(draft.interactionDisabled??original.interactionDisabled)?'This placement blocks Use from every side.':'Players must be in range, aim at the control and meet its power and device requirements.'}</p>
 </fieldset>}
 {original.manualActivation!==undefined&&<fieldset disabled={!!blocked||wiringLocked}>
  <legend>Machine activation</legend>
  <label className="checkbox-label"><input type="checkbox" checked={draft.manualActivation??original.manualActivation}
    onChange={event=>update({manualActivation:event.target.checked})}/>Require switch or script</label>
  <p className="subtle">{wiringLocked?'Extraction owns this machine’s activation.':'Disables automatic operation for this placement. Assign its Position group below to share it with a switch.'}</p>
 </fieldset>}
 {!groups&&original.powerGroup!==undefined&&<p className="subtle">This source does not expose its device group inventory.</p>}
 {groups&&original.class!=='vehi'&&(original.powerGroup!==undefined||original.positionGroup!==undefined)&&<fieldset disabled={!!blocked||wiringLocked}>
 <legend>Device wiring</legend>
 {(['powerGroup','positionGroup'] as const).map(key=>{
  const value=draft[key]??original[key];
  if(value===undefined)return null;
  const label=key==='powerGroup'?'Power group':'Position group';
  return <label key={key}>{label}<select aria-label={label} value={value} onChange={e=>update({[key]:Number(e.target.value)})}>
   <option value={-1}>Unbound</option>
   {value>=0&&!groups.some(group=>group.index===value)&&<option value={value} disabled>Unavailable group {value}</option>}
   {groups.map(group=><option value={group.index} key={group.index} disabled={group.reserved}>{group.name||'Unnamed group'} · {group.index}</option>)}
  </select></label>;
 })}
 <p className="subtle">{wiringLocked?'Extraction owns this connection. Edit it in the mission workflow.':groups.length?'Set the control and machine to the same Position group to link them. The Power group controls whether a device can operate.':'This scenario has no existing device groups.'}</p>
 </fieldset>}
 {(original.initiallyOff!==undefined||original.initiallyOpen!==undefined)&&<fieldset disabled={!!blocked||wiringLocked}>
  <legend>Startup state</legend>
  {original.initiallyOff!==undefined&&<label className="checkbox-label">
    <input type="checkbox" checked={draft.initiallyOff??original.initiallyOff}
      disabled={(draft.powerGroup??original.powerGroup??-1)>=0}
      onChange={event=>update({initiallyOff:event.target.checked})}/>Start powered off
  </label>}
  {original.initiallyOpen!==undefined&&<label className="checkbox-label">
    <input type="checkbox" checked={draft.initiallyOpen??original.initiallyOpen}
      disabled={(draft.positionGroup??original.positionGroup??-1)>=0}
      onChange={event=>update({initiallyOpen:event.target.checked})}/>Start open
  </label>}
  <p className="subtle">{wiringLocked?'Extraction owns this device’s startup state.':'Each option applies when its Power or Position group is Unbound. A linked group supplies its initial value.'}</p>
 </fieldset>}
 {!pose&&<Notice>Use finite XYZ within ±1,000,000 and angles within ±360°.</Notice>}
 {original.class==='ctrl'&&<details>
  <summary>Ground support for control</summary>
  <NativeBspPointCheck context={context}
   selectionKey={original.class+':'+original.index}
   subject="Control origin"
   points={pose?[pose.position]:[]}
   disabled={!!blocked||!pose}
   label="Check control ground"
   onGround={(_,position)=>update({position:position.map(String) as [string,string,string]})}/>
 </details>}
 <div className="button-row"><button disabled={!!blocked||!pose||!onLevelEditor} onClick={()=>{writeMapSession(context.projectId,'world.ai-start',null);writeMapSession(context.projectId,'world.cutscene-camera',null);writeMapSession(context.projectId,'world.trigger-volume',null);writeMapSession(context.projectId,'world.selection',deviceObjectId(original));update({active:true,focus:Date.now()});onLevelEditor?.();}}>{vehicle?'Show vehicle in Level Editor':'Show device in Level Editor'}</button><button disabled={!!blocked||!pose||!changed} onClick={()=>pose&&onPreview({kind:'devicePlacement',device:pose,sourceSha256:context.tagSha256!})}>{vehicle?'Preview vehicle placement':'Preview device placement'}</button><button disabled={busy||!owns} onClick={()=>{setView(null);onDraftChange();}}>Reset placement draft</button></div>
 {!onLevelEditor&&<p className="subtle">Viewport manipulation needs an opened compiled native map. Generated source placements use Logic / Events in the BSP Workshop.</p>}</>}
 </details>;
}

function DeviceGroupAppend({groups,sourceSha256,disabled,onPreview,onDraftChange}:{
 groups:NativeDeviceGroup[];sourceSha256:string;disabled:boolean;onPreview:(operation:NativeOperation)=>void;onDraftChange:()=>void
}){
 const [draft,setDraft]=useState({name:'',initialValue:'0',changeOnce:false});
 const name=draft.name.trim(),value=Number(draft.initialValue);
 const duplicate=groups.some(group=>group.name.toLowerCase()===name.toLowerCase());
 const reserved=/^extraction_/i.test(name);
 const valid=/^[a-z0-9_]{1,31}$/i.test(name)&&!duplicate&&!reserved
  &&draft.initialValue.trim()!==''&&Number.isFinite(value)&&value>=0&&value<=1&&/^[a-f0-9]{64}$/i.test(sourceSha256);
 function update(patch:Partial<typeof draft>){
  setDraft(current=>({...current,...patch}));
  onDraftChange();
 }
 return <details className="native-device-group-append">
  <summary>Add a device group · {groups.length}/128</summary>
  <p className="subtle">Use 1 for a group that starts powered and 0 for a machine that starts at rest. After accepting, assign the new group in Device wiring.</p>
  {groups.length>=128?<Notice>The scenario already has 128 device groups.</Notice>:<fieldset disabled={disabled}>
   <legend>New native device group</legend>
   <div className="button-row">
    <label>Group name<input aria-label="New device group name" maxLength={31} value={draft.name} onChange={e=>update({name:e.target.value})}/></label>
    <label>Initial value<input aria-label="Device group initial value" type="number" min={0} max={1} step="any" value={draft.initialValue} onChange={e=>update({initialValue:e.target.value})}/></label>
   </div>
   <label className="checkbox-label"><input type="checkbox" checked={draft.changeOnce} onChange={e=>update({changeOnce:e.target.checked})}/>Allow only one change</label>
   {(duplicate||reserved)&&<p role="status">{duplicate?'That device group already exists.':'Names starting with extraction_ are reserved.'}</p>}
   <button disabled={!valid} onClick={()=>onPreview({kind:'deviceGroupAppend',name,initialValue:value,changeOnce:draft.changeOnce,sourceSha256})}>Preview new device group</button>
  </fieldset>}
 </details>;
}
