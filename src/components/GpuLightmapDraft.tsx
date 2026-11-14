import {useEffect,useMemo,useRef,useState} from 'react';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import type {MapInspection,MeshData,ShaderPreview,Vec3} from '../types';
import type {EditorEnvironment} from '../environment';
import {sunlightPosition,toHex,validateEnvironment} from '../environment';
import {inspectLightmapPages} from '../haloLightmap';
import {bakeGpuLightmapDraft} from '../gpuLightmap';
import type {GpuLightmapDraft as Draft} from '../gpuLightmap';

/** Capture the existing R3F renderer; never construct a second context. */
export function GpuLightmapRenderer({onRenderer}:{onRenderer:(renderer:THREE.WebGLRenderer|null)=>void}) {
  const renderer=useThree(s=>s.gl);
  useEffect(()=>{onRenderer(renderer);return ()=>onRenderer(null);},[renderer,onRenderer]);
  return null;
}

/** User color controls use sRGB hex (the same conversion as SceneEnvironment).
 * GPU payload remains linear; the PNG uses Reinhard + sRGB for DISPLAY ONLY.
 * It is intentionally never attached as an original/compiled Halo lightmap.
 */
async function displayPage(draft:Draft,signal:AbortSignal):Promise<Blob> {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=draft.size;
  try {
    const context=canvas.getContext('2d');
    if(!context)throw Error('Draft image preview is unavailable.');
    const image=context.createImageData(draft.size,draft.size);
    const encode=(v:number)=>{const c=v/(1+v);return Math.round(255*(c<=0.0031308?12.92*c:1.055*c**(1/2.4)-0.055));};
    for(let y=0;y<draft.size;y++)for(let x=0;x<draft.size;x++) {
      const source=((draft.size-1-y)*draft.size+x)*4,destination=(y*draft.size+x)*4;
      for(let c=0;c<3;c++)image.data[destination+c]=encode(draft.pixels[source+c]);
      image.data[destination+3]=draft.pixels[source+3]>0.5?255:0;
    }
    signal.throwIfAborted();context.putImageData(image,0,0);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('Draft image encoding failed.')),'image/png'));
    signal.throwIfAborted();
    return blob;
  } finally {canvas.width=canvas.height=0;}
}

export default function GpuLightmapDraft({renderer,mesh,inspection,environment,active,reserveBytes}:{
  renderer:THREE.WebGLRenderer|null;mesh:MeshData|null;inspection:MapInspection|null;
  environment:EditorEnvironment;active:boolean;reserveBytes:(bytes:number)=>()=>void;
}) {
  const pages=useMemo(()=>inspectLightmapPages(mesh),[mesh]);
  const shaders=useMemo(()=>Object.fromEntries((inspection?.tags??[]).filter(t=>t.shaderPreview)
    .map(t=>[t.id,t.shaderPreview!])) as Record<number,ShaderPreview>,[inspection]);
  const [pageKey,setPageKey]=useState(''),[size,setSize]=useState<256|512|1024>(512);
  const page=pages.find(p=>p.key===pageKey)??pages[0];
  const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[preview,setPreview]=useState<{url:string;label:string}|null>(null);
  const operation=useRef<AbortController|null>(null),held=useRef<{url:string;release:()=>void}|null>(null);
  function discard() {if(held.current){URL.revokeObjectURL(held.current.url);held.current.release();held.current=null;}}
  // Retained editor may pause. Cancel pending work without sharing its GL state.
  // Completed drafts survive workspace pauses; geometry/source/light changes invalidate them.
  useEffect(()=>{
    operation.current?.abort();discard();setPreview(null);setStatus('');
    return ()=>{operation.current?.abort();discard();};
  },[renderer,mesh,inspection?.sha256,environment,page?.key,size]);
  useEffect(()=>{if(!active)operation.current?.abort();},[active]);

  async function bake() {
    if(busy||!renderer||!mesh||!inspection||!page||!active)return;
    const controller=new AbortController();operation.current=controller;
    discard();setPreview(null);setBusy(true);setStatus('Preparing GPU draft');
    let output:Draft|undefined,url:string|undefined;
    try {
      validateEnvironment(environment);
      const linear=(color:Vec3,power:number):Vec3=>{
        const c=new THREE.Color(toHex(color));return [c.r*power,c.g*power,c.b*power];
      };
      output=await bakeGpuLightmapDraft(renderer,mesh,shaders,{sourceSha256:inspection.sha256,bspIndex:page.bspIndex,
        page:page.page,size,ambient:linear(environment.ambientColor,environment.ambientIntensity),
        sunlight:linear(environment.sunColor,environment.sunIntensity),directionToSun:sunlightPosition(environment,1),
        signal:controller.signal,reserveBytes,progress:stage=>{if(!controller.signal.aborted)setStatus(stage);}});
      const blob=await displayPage(output,controller.signal);
      controller.signal.throwIfAborted();
      url=URL.createObjectURL(blob);
      held.current={url,release:output.release};
      setPreview({url,label:output.triangles+' triangles · '+output.coveredTexels+' covered texels · '+output.size+'²'});
      setStatus('Direct-light GPU draft ready · original/native pages unchanged');
      output=undefined;url=undefined;
    } catch(error) {
      if(!controller.signal.aborted)setStatus(error instanceof Error?error.message:String(error));
    } finally {
      output?.release();if(url)URL.revokeObjectURL(url);
      if(operation.current===controller){operation.current=null;setBusy(false);}
    }
  }
  if(!pages.length)return null;
  return <details className="gs-gpu-lightmap-draft">
    <summary>Spark GPU lightmap draft</summary>
    <p className="forge-hint">Direct sun, BSP shadows and ambient fill on existing native UVs.
      Opaque BSP only; no object shadows, indirect light, emissive transport, fog or native output.
      Use Bake lighting &amp; rebuild for the existing native Halo Tool workflow.</p>
    <div className="action-row">
      <select aria-label="GPU draft native lightmap page" value={page?.key??''} disabled={busy}
        onChange={e=>setPageKey(e.target.value)}>
        {pages.map(p=><option key={p.key} value={p.key}>BSP {p.bspIndex+1} · Page {p.page}</option>)}
      </select>
      <select aria-label="GPU draft resolution" value={size} disabled={busy}
        onChange={e=>setSize(Number(e.target.value) as 256|512|1024)}>
        {[256,512,1024].map(n=><option key={n} value={n}>{n} × {n}</option>)}
      </select>
      <button className="small-button" disabled={busy||!renderer||!active||!page?.withRealUvs}
        title={!renderer?'Open the Level Editor viewport first.':'Bake a display-only draft with the current lighting controls. Native files remain unchanged.'}
        onClick={()=>void bake()}>Bake GPU draft</button>
      {busy&&<button className="small-button" onClick={()=>{operation.current?.abort();setStatus('GPU draft cancelled');}}>Cancel</button>}
    </div>
    <p className="forge-hint" role="status" aria-live="polite">{status}</p>
    {preview&&<figure style={{margin:'6px 0'}}>
      <img src={preview.url} alt="Tone-mapped GPU direct-light draft, not a native Halo lightmap"
        style={{display:'block',maxWidth:'100%',width:256,height:'auto'}}/>
      <figcaption className="forge-hint">{preview.label} · Display tone mapping: Reinhard + sRGB.
        Source {inspection?.sha256.slice(0,12)}. No game or native-output acceptance.</figcaption>
    </figure>}
  </details>;
}
