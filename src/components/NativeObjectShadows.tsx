import {useEffect,useMemo} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {NativeShadowPass} from '../haloObjectShadows';
import type {MeshData} from '../types';
/** Reuses this viewport's GL context; retained inactive editors do not tick. */
export default function NativeObjectShadows({terrain,enabled}:{terrain:MeshData|null;enabled:boolean}){
  const {scene,gl,camera}=useThree(),pass=useMemo(()=>new NativeShadowPass(scene),[scene]);
  useEffect(()=>()=>{pass.dispose();delete gl.domElement.dataset.gsObjectShadows;},[pass,gl]);
  useFrame(()=>{pass.update(gl,camera,terrain,enabled);gl.domElement.dataset.gsObjectShadows=JSON.stringify(pass.stats);},-1);
  return null;
}
