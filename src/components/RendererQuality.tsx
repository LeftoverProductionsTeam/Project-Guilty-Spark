import {useState,useEffect} from 'react';
import {useMapState} from '../mapSession';
export function useRendererQuality(projectId:string){
  const [pixels,setPixels]=useState(()=>Math.max(1,window.innerWidth*window.innerHeight));
  useEffect(()=>{const resize=()=>setPixels(Math.max(1,window.innerWidth*window.innerHeight));window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
  const [antialias,setAntialias]=useMapState(projectId,'render.antialias',true);
  const [storedScale,setScale]=useMapState(projectId,'render.resolutionScale',1);
  const scale=Number.isFinite(storedScale)?Math.min(2,Math.max(.5,storedScale)):1;
  return {antialias,setAntialias,scale,setScale,dpr:Math.min(Math.min(1.75,window.devicePixelRatio||1)*scale,Math.sqrt(12582912/pixels))};
}
export default function RendererQuality({projectId}:{projectId:string}){
  const q=useRendererQuality(projectId);
  return <fieldset className="gs-render-quality"><legend>Viewport image quality</legend><label><input type="checkbox" checked={q.antialias} onChange={e=>q.setAntialias(e.target.checked)}/>Anti-aliasing</label><label>Resolution scale · {Math.round(q.scale*100)}%<input aria-label="Viewport resolution scale" type="range" min="0.5" max="2" step="0.1" value={q.scale} onChange={e=>q.setScale(Number(e.target.value))}/></label><small>Higher scales sharpen geometry and use more GPU memory. Viewport preferences stay local to this map.</small></fieldset>;
}
