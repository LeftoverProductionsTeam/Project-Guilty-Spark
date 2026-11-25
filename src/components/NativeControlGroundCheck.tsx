import {useState} from 'react';
import type {NativeTagContext} from '../nativeOperations';
import NativeBspPointCheck from './NativeBspPointCheck';
import {NumberField} from './ui';

interface Props {
  context:NativeTagContext;
  selectionKey:string;
  tagPath:string;
  position:[number,number,number]|null;
  upright:boolean;
  disabled:boolean;
  onGround:(position:[number,number,number])=>void;
}

export default function NativeControlGroundCheck({context,selectionKey,tagPath,position,upright,disabled,onGround}:Props){
  const [mount,setMount]=useState<{key:string;offset:number}|null>(null);
  const key=JSON.stringify([context.projectId,context.buildId,context.tagSha256,selectionKey,tagPath,upright]);
  const mountOffset=mount?.key===key?mount.offset:0;
  const setOffset=(offset:number)=>setMount({key,offset});
  return <details>
    <summary>Ground support for control</summary>
    <NumberField label="Origin offset from ground" value={mountOffset} min={-64} max={64}
      step={0.001} disabled={disabled} onCommit={setOffset}/>
    <small>{upright?'Check the compiled control, then seat its model on a reviewed surface or enter a custom offset.':'Enter an offset for this tilted control.'} A positive value raises the origin above the selected ground.</small>
    <NativeBspPointCheck context={context} selectionKey={key} subject="Control origin" allowGroundHeadroom
      mountOffset={mountOffset} controlMountTag={upright?tagPath:undefined} onMountOffset={setOffset}
      points={position?[position]:[]} disabled={disabled||!position} label="Check control ground"
      onGround={(_,point)=>onGround(point)}/>
  </details>;
}
