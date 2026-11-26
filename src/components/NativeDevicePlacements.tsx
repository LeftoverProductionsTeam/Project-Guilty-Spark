import NativeControlGroundCheck from './NativeControlGroundCheck';
import {useEffect,useRef,useState} from 'react';
import {useMapState,writeMapSession} from '../mapSession';
import {NATIVE_DEVICE_VIEW,deviceMatches,deviceDraft,devicePose,deviceObjectId} from '../nativeDevicePlacement';
import type {NativeDeviceView} from '../nativeDevicePlacement';
import type {NativeDeviceGroup,NativeTagContext,NativeOperation} from '../nativeOperations';
import {Notice} from './ui';
export default function NativeDevicePlacements({context,busy,dirty,onPreview,onDraftChange,onLevelEditor}:{context:NativeTagContext;busy:boolean;dirty:boolean;onPreview:(op:NativeOperation)=>void;onDraftChange:()=>void;onLevelEditor?:()=>void}){
 const [view,setView]=useMapState<NativeDeviceView|null>(context.projectId,NATIVE_DEVICE_VIEW,()=>null),[selected,setSelected]=useState('');const details=useRef<HTMLDetailsElement>(null),review=useRef(0),rows=context.scenarioDevices??[];
 const owns=!!view&&deviceMatches(view,context),original=owns?view.original:rows.find(row=>row.class+':'+row.index===selected)??rows[0];const vehicle=original?.class==='vehi',label=vehicle?'Vehicle':original?.class==='weap'?'Weapon':'Device';const draft=original?(owns?view:deviceDraft(original)):null,pose=original&&draft?devicePose({...draft,original}):null,changed=!!pose&&JSON.stringify(pose)!==JSON.stringify(original);const blocked=busy||dirty||!!context.deviceEditIssue||owns&&view.locked||!/^[a-f0-9]{64}$/i.test(context.tagSha256??'');
 useEffect(()=>{if(view&&!deviceMatches(view,context))setView(null);},[context]);useEffect(()=>{onDraftChange();},[JSON.stringify(view)]);useEffect(()=>{if(owns&&view.reviewRequest&&review.current!==view.reviewRequest){review.current=view.reviewRequest;if(details.current){details.current.open=true;details.current.querySelector<HTMLInputElement>(`[aria-label="${label} position X"]`)?.focus();}}},[context,view?.reviewRequest]);
 const interactionDisabled=draft?.interactionDisabled??original?.interactionDisabled;
 const bothSides=draft?.usableFromBothSides??original?.usableFromBothSides;
 const nativeName=draft?.customControlName??original?.customControlName;
 const controlNames=context.scenarioControlNames??[];
 const groups=context.scenarioDeviceGroups;
 const [groupIndex,setGroupIndex]=useState(-1);
 const upright=!!pose&&pose.rotationRadians.slice(1).every(angle=>Math.abs(angle)<1e-4);
 const group=groups?.find(row=>row.index===groupIndex);
 const groupBindings=group?rows.filter(row=>[row.powerGroup,row.positionGroup].includes(group.index)):[];
 const groupLocked=!!group&&(group.reserved||groupBindings.some(row=>/^extraction_/i.test(row.name)));
 const wiringLocked=!!original&&(/^extraction_/i.test(original.name)||groups?.some(group=>group.reserved&&[original.powerGroup,original.positionGroup].includes(group.index)));
 function update(patch:Partial<NativeDeviceView>){if(!original||!draft||!context.tagSha256)return;setView({projectId:context.projectId,buildId:context.buildId,tag:context.tag,sourceSha256:context.tagSha256,original,active:false,focus:0,...(owns?view:{}),...draft,...patch});onDraftChange();}
 return <details className="native-device-placements" ref={details}><summary>Existing controls, machines, vehicles &amp; named weapons · {rows.length}</summary><p className="subtle">Edit an existing native placement or connect controls and machines through scenario groups. Existing names, indices, palette references and group definitions are preserved. Aircraft poses must leave clear walking/boarding space and stable ground; editor placement does not prove a native landing. Preview → Accept → Save → rebuild. Native Restore is separate from project Undo; terminal use, door collision and gameplay need separate testing.</p>
 {context.deviceEditIssue&&<Notice tone="info">{context.deviceEditIssue}</Notice>}
 {groups&&context.tagSha256&&<details className="native-device-groups">
  <summary>Device groups · {groups.length}/128</summary>
  <label>Device group<select aria-label="Device group to edit" value={group?.index??-1} disabled={busy||dirty}
    onChange={event=>{setGroupIndex(Number(event.target.value));onDraftChange();}}>
   <option value={-1}>Add a device group</option>
   {groups.map(row=><option key={row.index} value={row.index}>{row.name||'Unnamed group'} · {row.index}</option>)}
  </select></label>
  {group&&<p className="subtle">This group drives {groupBindings.length} device {groupBindings.length===1?'placement':'placements'}. Its name, index and links stay in place.</p>}
  {groupLocked?<Notice>Extraction owns this device group. Edit it in the mission workflow.</Notice>:
   <DeviceGroupDraft key={JSON.stringify([context.projectId,context.buildId,context.tag,context.tagSha256,group?.index])}
    group={group} groups={groups} sourceSha256={context.tagSha256} disabled={busy||dirty||!!context.deviceEditIssue}
    onPreview={onPreview} onDraftChange={onDraftChange}/>}
 </details>}
 {original&&draft&&<><label>Placement<select aria-label="Native source placement" value={original.class+':'+original.index} disabled={busy||dirty} onChange={e=>{setSelected(e.target.value);setView(null);onDraftChange();}}>{rows.map(row=><option key={row.class+':'+row.index} value={row.class+':'+row.index}>{row.class} {row.index} · {row.name||'Unnamed placement'} · {row.tagPath}</option>)}</select></label><fieldset disabled={!!blocked}><legend>Native position & rotation</legend><div className="studio-fields">{(['position','angles'] as const).map(field=><div key={field}>{['X','Y','Z'].map((axis,i)=><label key={axis}>{field==='position'?axis:['Yaw','Pitch','Roll'][i]}{field==='angles'?' °':''}<input type="number" step="any" aria-label={label+' '+(field==='position'?'position '+axis:['yaw','pitch','roll'][i])} value={draft[field][i]} onChange={e=>update({[field]:draft[field].map((v,j)=>j===i?e.target.value:v) as [string,string,string]})}/></label>)}</div>)}</div></fieldset>
 {original.class==='ctrl'&&(original.usableFromBothSides!==undefined||original.interactionDisabled!==undefined)&&<fieldset disabled={!!blocked}><legend>Control interaction</legend>
 {original.interactionDisabled!==undefined&&<label className="checkbox-label"><input type="checkbox" checked={interactionDisabled} onChange={e=>update({interactionDisabled:e.target.checked})}/>Disable player interaction</label>}
 {original.usableFromBothSides!==undefined&&<label className="checkbox-label"><input type="checkbox" checked={bothSides} disabled={interactionDisabled} onChange={e=>update({usableFromBothSides:e.target.checked})}/>Allow use from both sides</label>}
 <p className="subtle">{interactionDisabled?'This placement blocks Use from every side.':bothSides===false?'For a model with a front marker, approach from the side the marker faces and aim back toward the control. The placement rotation turns the marker with the model. The control still needs power and the player must be in range.':'Players must be in range, aim at the control and meet its power and device requirements.'}</p>
 {nativeName!==undefined&&<label className="studio-wide">In-game control name
   <select aria-label="In-game control name" value={nativeName} onChange={event=>update({customControlName:Number(event.target.value)})}>
    <option value={0}>Default prompt</option>
    {nativeName!==0&&!controlNames[nativeName-1]?.trim()&&<option value={nativeName} disabled>Unavailable native name · {nativeName}</option>}
    {controlNames.map((name,index)=>name.trim()?<option key={index} value={index+1}>{index+1} · {name}</option>:null)}
   </select>
   <small>{context.scenarioControlNameIssue??(controlNames.length?'Uses the scenario’s Unicode object-name list. This changes only the selected control.':'This scenario has no readable Unicode object names to select.')}</small>
  </label>}
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
 {original.class==='ctrl'&&<NativeControlGroundCheck context={context}
  selectionKey={JSON.stringify([original.index,pose?.rotationRadians.slice(1)])} tagPath={original.tagPath}
  position={pose?.position??null} upright={upright} disabled={!!blocked}
  onGround={point=>update({position:point.map(String) as [string,string,string]})}/>}
 <div className="button-row"><button disabled={!!blocked||!pose||!onLevelEditor} onClick={()=>{writeMapSession(context.projectId,'world.ai-start',null);writeMapSession(context.projectId,'world.cutscene-camera',null);writeMapSession(context.projectId,'world.trigger-volume',null);writeMapSession(context.projectId,'world.selection',deviceObjectId(original));update({active:true,focus:Date.now()});onLevelEditor?.();}}>{'Show '+label.toLowerCase()+' in Level Editor'}</button><button disabled={!!blocked||!pose||!changed} onClick={()=>pose&&onPreview({kind:'devicePlacement',device:pose,sourceSha256:context.tagSha256!})}>{'Preview '+label.toLowerCase()+' placement'}</button><button disabled={busy||!owns} onClick={()=>{setView(null);onDraftChange();}}>Reset placement draft</button></div>
 {!onLevelEditor&&<p className="subtle">Viewport manipulation needs an opened compiled native map. Generated source placements use Logic / Events in the BSP Workshop.</p>}</>}
 </details>;
}

function DeviceGroupDraft({group,groups,sourceSha256,disabled,onPreview,onDraftChange}:{
 group?:NativeDeviceGroup;groups:NativeDeviceGroup[];sourceSha256:string;disabled:boolean;
 onPreview:(operation:NativeOperation)=>void;onDraftChange:()=>void
}){
 const [draft,setDraft]=useState({name:group?.name??'',initialValue:String(group?.initialValue??0),changeOnce:group?.changeOnce??false});
 const name=group?.name??draft.name.trim();
 const value=Number(draft.initialValue);
 const duplicate=!group&&groups.some(row=>row.name.toLowerCase()===name.toLowerCase());
 const reserved=!group&&/^extraction_/i.test(name);
 const validName=!!group||/^[a-z0-9_]{1,31}$/i.test(name)&&!duplicate&&!reserved;
 const valid=validName&&draft.initialValue.trim()!==''&&Number.isFinite(value)&&value>=0&&value<=1
  &&/^[a-f0-9]{64}$/i.test(sourceSha256)&&(!group||group.initialValue!==value||group.changeOnce!==draft.changeOnce);
 function update(patch:Partial<typeof draft>){
  setDraft(current=>({...current,...patch}));
  onDraftChange();
 }
 if(!group&&groups.length>=128)return <Notice>The scenario already has 128 device groups. Select an existing group to edit it.</Notice>;
 return <fieldset disabled={disabled}>
   <legend>{group?'Existing native device group':'New native device group'}</legend>
   <p className="subtle">Use 1 for a fully powered or open group and 0 for an off or closed group.</p>
   <div className="button-row">
    {!group&&<label>Group name<input aria-label="New device group name" maxLength={31} value={draft.name} onChange={e=>update({name:e.target.value})}/></label>}
    <label>Initial value<input aria-label="Device group initial value" type="number" min={0} max={1} step="any" value={draft.initialValue} onChange={e=>update({initialValue:e.target.value})}/></label>
   </div>
   <label className="checkbox-label"><input type="checkbox" checked={draft.changeOnce} onChange={e=>update({changeOnce:e.target.checked})}/>Allow only one change</label>
   {(duplicate||reserved)&&<p role="status">{duplicate?'That device group already exists.':'Names starting with extraction_ are reserved.'}</p>}
   <button disabled={!valid} onClick={()=>{
    const settings={name,initialValue:value,changeOnce:draft.changeOnce,sourceSha256};
    onPreview(group?{kind:'deviceGroupSettings',index:group.index,...settings}:{kind:'deviceGroupAppend',...settings});
   }}>{group?'Preview group changes':'Preview new device group'}</button>
 </fieldset>;
}
