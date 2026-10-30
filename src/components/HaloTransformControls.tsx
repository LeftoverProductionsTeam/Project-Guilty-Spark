import {useCallback,useRef} from 'react';
import type {ComponentProps,ComponentRef} from 'react';
import {TransformControls} from '@react-three/drei';
import {correctTransformArrowheads} from '../transformArrowheads';

export default function HaloTransformControls(props:Omit<ComponentProps<typeof TransformControls>,'ref'>){
  const release=useRef<(()=>void)|null>(null);
  const attach=useCallback((control:ComponentRef<typeof TransformControls>|null)=>{
    release.current?.();
    release.current=control?correctTransformArrowheads(control):null;
  },[]);
  return <TransformControls {...props} ref={attach}/>;
}
