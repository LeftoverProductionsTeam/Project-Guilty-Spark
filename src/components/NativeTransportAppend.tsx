import {useEffect,useState} from 'react';
import type {NativeTagContext,NativeOperation,NativeTransportAppend as Transport} from '../nativeOperations';
import {Notice} from './ui';
/** Existing recovered-source review/accept owns the write; this is only its form. */
export default function NativeTransportAppend({context,busy,dirty,onPreview,onDraftChange}:{context:NativeTagContext;busy:boolean;dirty:boolean;onPreview:(operation:NativeOperation)=>void;onDraftChange:()=>void}){
 const [name,setName]=useState<Transport['name']>('extraction_pelican'),[tag,setTag]=useState('');
 const [position,setPosition]=useState(['','','']),[rotation,setRotation]=useState(['0','0','0']);
 const blocked=busy||dirty||!context.canAppendTransport;
 const valid=/^[a-f0-9]{64}$/i.test(context.tagSha256??'')&&tag.trim().length>0&&tag.trim().length<=230&&!tag.startsWith('-')&&[...position,...rotation].every(value=>value.trim()!==''&&Number.isFinite(Number(value)))&&position.every(value=>Math.abs(Number(value))<=2048)&&rotation.every(value=>Math.abs(Number(value))<=360);
 useEffect(()=>onDraftChange(),[name,tag,...position,...rotation,context.tagSha256]);
 return <details className="native-transport-append"><summary>Add native dropship &amp; signals</summary>
  <p className="subtle">Append a native aircraft and its boarding, recall and landing groups. Existing placements, scripts and indices stay in place. Add the pilot and flight recordings in their existing editors.</p>
  {!context.canAppendTransport&&<Notice tone="info">Requires unshared CE609 solo source or reviewed MCC13 MegaWorld source.</Notice>}
  <fieldset disabled={blocked}>
   <label>Native transport role<select aria-label="New native transport role" value={name} onChange={e=>setName(e.target.value as Transport['name'])}><option value="extraction_pelican">UNSC · Pelican</option><option value="extraction_spirit">Covenant · Spirit</option></select></label>
   {!!context.vehicleSources?.length&&<label>Known working vehicle<select aria-label="Known native vehicle source" value={context.vehicleSources.includes(tag)?tag:''} onChange={e=>setTag(e.target.value)}><option value="">Choose or enter an existing source path</option>{context.vehicleSources.map(path=><option key={path} value={path}>{path}</option>)}</select></label>}
   <label>Aircraft tag path<input aria-label="Native aircraft tag path" maxLength={230} value={tag} placeholder="vehicles/pelican/pelican" onChange={e=>setTag(e.target.value)}/></label>
   <p className="subtle">Use a relative path without .vehicle. Recover/import the complete aircraft and dependencies into this working tagset first. Preview verifies actual aircraft type, one driver, passenger seats and the full dependency closure; a car or missing tag is refused. Originals and unrelated SDK folders are not changed.</p>
   <div className="native-encounter-position">{position.map((value,i)=><label key={i}>World {['X','Y','Z'][i]}<input aria-label={'New aircraft '+['X','Y','Z'][i]} type="number" step="any" value={value} onChange={e=>setPosition(position.map((v,j)=>i===j?e.target.value:v))}/></label>)}</div>
   <div className="native-encounter-position">{rotation.map((value,i)=><label key={i}>{['Yaw','Pitch','Roll'][i]} · degrees<input aria-label={'New aircraft '+['yaw','pitch','roll'][i]} type="number" step="any" value={value} onChange={e=>setRotation(rotation.map((v,j)=>i===j?e.target.value:v))}/></label>)}</div>
   <button type="button" disabled={!valid} onClick={()=>onPreview({kind:'appendTransport',...(context.regionalFactionSource?{regionalMcc:true}:{}),transport:{name,tagPath:tag.trim(),position:position.map(Number) as [number,number,number],rotationRadians:rotation.map(value=>Number(value)*Math.PI/180) as [number,number,number]},sourceSha256:context.tagSha256!})}>Preview native aircraft append</button>
  </fieldset>
  <p className="subtle">Review → Accept selects a separate source revision. Native Restore recovers the exact original scenario; project Undo is separate. Save and Build working tag edits, inspect the compiled aircraft and signals, then prepare the existing Forerunner dropship controller. Use actual ground/clearance and native pilot routes; compile/readback does not prove boarding, landing, flight or settlement.</p>
 </details>;
}
