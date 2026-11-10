import {useLayoutEffect} from 'react';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {sunlightPosition,toHex} from '../environment';
import type {EditorEnvironment} from '../environment';
import {CHROMA_GREEN} from '../chromaKey';
/** One owner for background/fog; cleanup restores the previous scene state. */
export default function SceneEnvironment({
  value,
  maximumFogDensity = 1,
  overrideLighting = false,
  sourceObjectLighting = false,
  transparentBackground = false,
  greenScreen = false,
}: {
  value: EditorEnvironment;
  maximumFogDensity?: number;
  overrideLighting?: boolean;
  sourceObjectLighting?: boolean;
  transparentBackground?: boolean;
  greenScreen?: boolean;
}) {
  const {scene,gl,invalidate}=useThree();
  useLayoutEffect(() => {
    const background=scene.background,fog=scene.fog,previous=scene.userData.gsEnvironment;
    scene.userData.gsEnvironment={value,overrideLighting,sourceObjectLighting};
    scene.background = greenScreen ? new THREE.Color(CHROMA_GREEN) : transparentBackground
      ? null
      : new THREE.Color(value.previewEnabled ? toHex(value.skyColor) : '#101820');
    if(!greenScreen&&value.previewEnabled&&value.fogEnabled){const next=new THREE.Fog(toHex(value.fogColor),value.fogNear,value.fogFar) as THREE.Fog&{maximumDensity:number};next.maximumDensity=maximumFogDensity;scene.fog=next;}else scene.fog=null;
    gl.domElement.dataset.gsEnvironment=JSON.stringify({...value,fogMaximumDensity:maximumFogDensity,sourceObjectLighting});
    invalidate();
    return()=>{scene.background=background;scene.fog=fog;scene.userData.gsEnvironment=previous;delete gl.domElement.dataset.gsEnvironment;};
  }, [scene, gl, invalidate, value, maximumFogDensity, overrideLighting, sourceObjectLighting, transparentBackground, greenScreen]);
  return value.previewEnabled?<><ambientLight color={toHex(value.ambientColor)} intensity={value.ambientIntensity}/>
    <directionalLight color={toHex(value.sunColor)} position={sunlightPosition(value)} intensity={value.sunIntensity}/></>:<>
    <ambientLight intensity={1.4}/><directionalLight position={[50,-20,80]} intensity={2.1}/></>;
}
