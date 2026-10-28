import { useEffect, useState } from 'react';
import { useMapState } from '../mapSession';
import './viewportPerformance.css';
type Sample={fps:number;frameMs:number;drawCalls:number;triangles:number;geometries:number;textures:number;sampledAt:number};
export default function ViewportPerformance({projectId}:{projectId:string}) {
  const [open,setOpen]=useMapState(projectId,'world.performance',false);
  const [sample,setSample]=useState<Sample|null>(null);
  useEffect(()=>{
    setSample(null);if(!open)return;
    const read=()=>{
      const canvas=document.querySelector<HTMLCanvasElement>('.world-layout canvas');
      try {const value=JSON.parse(canvas?.dataset.gsPerformance??'null') as Sample|null;
        setSample(value&&Number.isFinite(value.fps)&&Number.isFinite(value.frameMs)&&Date.now()-value.sampledAt<2000?value:null);
      } catch {setSample(null);}
    };
    read();const interval=window.setInterval(read,500);return()=>window.clearInterval(interval);
  },[open,projectId]);
  return <details className="viewport-performance" open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary>Viewport performance</summary>
    <div className="viewport-performance-popover" aria-label="Viewport performance metrics" role="group">
      {sample?<>
        <strong>{sample.fps.toFixed(0)} FPS · {sample.frameMs.toFixed(1)} ms/frame</strong>
        <span>{sample.drawCalls.toLocaleString()} draw calls · {sample.triangles.toLocaleString()} triangles</span>
        <span>{sample.geometries.toLocaleString()} geometries · {sample.textures.toLocaleString()} textures</span>
        <small>Recent editor samples. Draw counts describe the last GL pass; postprocessing can use more passes.</small>
      </>:<span>Waiting for an active viewport sample…</span>}
    </div>
  </details>;
}
