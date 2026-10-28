import {useEffect,useMemo} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {useRef} from 'react';
import * as THREE from 'three';
import type {Vec3} from '../types';
/** Labels belong to the WebGL scene, not independent ReactDOM roots inside
 * the canvas container. Selection reparenting and canvas unmount therefore
 * cannot race Drei Html's target.removeChild cleanup. Inspector text supplies
 * the same names for keyboard/screen-reader selection. No font downloads. */
export default function ViewportLabel({text,position}:{text:string;position:Vec3}) {
  const sprite=useRef<THREE.Sprite>(null);const {camera,size}=useThree();
  const label=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=72;
    const ctx=canvas.getContext('2d');
    if(ctx){ctx.fillStyle='rgba(24,19,48,0.9)';ctx.beginPath();ctx.roundRect(2,2,764,68,16);ctx.fill();
      ctx.strokeStyle='#8ae7ef';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#edfcff';ctx.font='28px Segoe UI, sans-serif';
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text.slice(0,90),384,36,730);}
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
  },[text]);
  useEffect(()=>()=>label.dispose(),[label]);
  useFrame(()=>{
    if(!sprite.current)return;
    const point=new THREE.Vector3();sprite.current.getWorldPosition(point);
    const pixelsPerUnit=(camera as THREE.PerspectiveCamera).isPerspectiveCamera ?
      size.height/(2*Math.tan(THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov)/2)*Math.max(0.1,camera.position.distanceTo(point))) :
      (camera as THREE.OrthographicCamera).zoom;
    const h=25/Math.max(0.1,pixelsPerUnit);sprite.current.scale.set(h*768/72,h,1);
  });
  return <sprite ref={sprite} position={position} renderOrder={20} raycast={()=>null}>
    <spriteMaterial map={label} transparent depthTest={false} depthWrite={false}/>
  </sprite>;
}
