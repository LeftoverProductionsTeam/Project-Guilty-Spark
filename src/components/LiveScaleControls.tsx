import {useEffect,useState} from 'react';
import {call} from '../api';
import {NumberField,Notice} from './ui';
export interface ScaleObject {datum:number;tagDatum:number;kind:number;scale:number}
export interface ScaleChange {kind:'scale';datum:number;tagDatum:number;before:number;after:number;shared:boolean}
export interface ScaleReceipt {applied:boolean;scale:number;affectedObjects:number[];physicsTag:string|null;message:string}
interface ScaleInfo {currentScale:number;minimum:number;maximum:number;sharedVehicles:number;sharedItems:number;physicsTag:string|null;massPoints:number;suspensionPoints:number;vehiclePhysics:boolean;detail:string}
interface Props {object:ScaleObject;count:number;busy:boolean;blocked:boolean;perform:(f:()=>Promise<void>)=>Promise<void>;apply:(op:ScaleChange)=>Promise<void>;remember:(op:ScaleChange)=>void;sharedValue?:boolean;onSharedChange?:(value:boolean)=>void}
export default function LiveScaleControls({object,count,busy,blocked,perform,apply,remember,sharedValue,onSharedChange}:Props){
  const [info,setInfo]=useState<ScaleInfo|null>(null),[error,setError]=useState(''),[size,setSize]=useState(object.scale),[localShared,setLocalShared]=useState(false);
  const shared=sharedValue??localShared,setShared=onSharedChange??setLocalShared;
  useEffect(()=>{setShared(false);},[object.datum]);
  useEffect(()=>{let live=true;setInfo(null);setError('');setSize(object.scale);if(![1,2,3,6].includes(object.kind))return;
    void call<ScaleInfo>('live_mcc_scale_info',{datum:object.datum}).then(value=>{if(live)setInfo(value);}).catch(error=>{if(live)setError(String(error));});return()=>{live=false;};
  },[object.datum,object.tagDatum,object.scale,count]);
  if(error)return <Notice tone="warn">Size unavailable for this object: {error}</Notice>;
  if(!info)return null;
  const sharedScope=info.vehiclePhysics||info.sharedItems>0;
  return <div className="live-scale-controls"><h3>Uniform size · {object.scale.toFixed(3)}×</h3><p>{info.detail}</p>
    {info.vehiclePhysics&&<><p>{info.sharedVehicles} live vehicles · {info.massPoints} contact spheres each · {info.suspensionPoints} suspension channels · {info.physicsTag}</p><label><input type="checkbox" checked={shared} onChange={e=>setShared(e.target.checked)}/> Resize all vehicles sharing this physics</label></>}
    {info.sharedItems>0&&<label><input type="checkbox" checked={shared} onChange={e=>setShared(e.target.checked)}/> Resize all {info.sharedItems} matching world items</label>}
    <NumberField label="Live object size" value={size} min={info.minimum} max={info.maximum} step={0.1} onCommit={setSize}/>
    <div className="analysis-actions">{[0.5,1,2].map(value=><button key={value} disabled={busy} onClick={()=>setSize(value)}>{value}× size</button>)}
      <button disabled={busy||blocked||(sharedScope&&!shared)||size===object.scale} onClick={()=>void perform(async()=>{const op:ScaleChange={kind:'scale',datum:object.datum,tagDatum:object.tagDatum,before:object.scale,after:size,shared:sharedScope};await apply(op);remember(op);})}>Apply live size</button>
    </div><p className="subtle">Size changes affect this running session. Held first-person weapon models use a separate presentation path. Vehicle driving and peer replication need an in-game check.</p>
  </div>;
}
