import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {call,native} from '../api';
import {decodeOwnedBitmapPreview} from '../ownedBitmapPreview';
import type {OwnedBitmapPreview} from '../ownedBitmapPreview';
import type {DdsImage} from '../haloDds';
import type {Project} from '../types';
import {useMapState} from '../mapSession';
import {textureResourceScope} from '../textureResourceScope';
import {decodeReflectionCube, readReflectionCube} from '../ownedReflectionCube';

/** Original, source-checked pixels; no replacement art or project edits. */
export default function BitmapPreview({project,tagId,cube=false}:{project:Project;tagId:number;cube?:boolean}){
  const [storedIndex,setIndex]=useMapState(project.id,`bitmap.image.${tagId}`,0);
  const index=Number.isInteger(storedIndex)&&storedIndex>=0&&storedIndex<2048?storedIndex:0;
  const [storedMip,setMip]=useMapState(project.id,`bitmap.mip.${tagId}.${index}`,0);
  const mip=Number.isInteger(storedMip)&&storedMip>=0&&storedMip<=16?storedMip:0;
  const [storedFace,setFace]=useMapState(project.id,`bitmap.face.${tagId}`,0);
  const face=Number.isInteger(storedFace)&&storedFace>=0&&storedFace<6?storedFace:0;
  const [frame,setFrame]=useState<{images:DdsImage[];previews:OwnedBitmapPreview[];scope:string}|null>(null),
    [count,setCount]=useState(1),[levels,setLevels]=useState(1),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const canvas=useRef<HTMLCanvasElement>(null);
  const scope=project.id+':'+tagId+':'+(cube?'cube':`${index}:mip${mip}`)+':'+textureResourceScope(project.source);
  const shown=useMemo(()=>frame?.scope===scope?{image:frame.images[cube?face:0],preview:frame.previews[cube?face:0]}:null,[frame,scope,cube,face]);
  useEffect(()=>{
    let alive=true;setFrame(null);setError('');setLoading(true);
    if(!native||!project.source){setError('Open a preserved map in the desktop app to preview its original pixels.');setLoading(false);return;}
    const source=project.source;
    const load=async()=>{
      if(cube){
        const response=await readReflectionCube(project.id,source.sha256,tagId);
        const decoded=decodeReflectionCube(response,source.sha256,tagId,source.resourceSha256??{});
        if(alive){setCount(1);setFrame({images:decoded.faces,previews:response.faces,scope});}
        return;
      }
      const preview=await call<OwnedBitmapPreview>('preview_owned_cache_bitmap',{projectId:project.id,bitmapTagId:tagId,imageIndex:index,mipLevel:mip});
        const image=decodeOwnedBitmapPreview(preview,{bitmapTagId:tagId,imageIndex:index,mipLevel:mip,sourceSha256:source.sha256,
          resourceSha256:source.resourceSha256?.['mcc-textures']??source.resourceSha256?.['bitmaps.map']??null});
        if(alive){setCount(preview.imageCount??1);setLevels(preview.mipLevels??1);setFrame({images:[image],previews:[preview],scope});}
    };
    void load().catch(reason=>{if(alive)setError(String(reason));}).finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[scope]);
  useLayoutEffect(()=>{
    const context=canvas.current?.getContext('2d');if(!shown||!context)return;
    const pixels=context.createImageData(shown.image.width,shown.image.height);pixels.data.set(shown.image.pixels);
    context.putImageData(pixels,0,0);
  },[shown]);
  return <section className="gs-bitmap-preview" aria-label="Original bitmap preview">
    <div className="gs-bitmap-toolbar"><strong>{cube?'Original reflection cube':'Original bitmap'}</strong>{cube?<select aria-label="Cubemap face" value={face} onChange={event=>setFace(Number(event.target.value))}>
      {['+X','−X','+Y','−Y','+Z','−Z'].map((label,index)=><option key={label} value={index}>{label}</option>)}
    </select>:<><span>{loading?`Image ${index+1}`:`${index+1} / ${count}`}</span>
      <button className="icon-button" aria-label="Previous bitmap image" disabled={loading||index===0} onClick={()=>setIndex(index-1)}>‹</button>
      <button className="icon-button" aria-label="Next bitmap image" disabled={loading||index+1>=count} onClick={()=>setIndex(index+1)}>›</button>
      {(levels>1||mip>0)&&<select aria-label="Original texture detail" title="Texture levels stored in the original Halo bitmap" value={mip} disabled={loading} onChange={event=>setMip(Number(event.target.value))}>
        {Array.from({length:Math.max(levels,mip+1)},(_,level)=><option key={level} value={level}>{level===0?'Full resolution':`1/${2**level} resolution`}</option>)}
      </select>}</>}
    </div>
    {shown&&<><canvas ref={canvas} width={shown.image.width} height={shown.image.height}
      aria-label="Verified original bitmap pixels" data-format={shown.preview.format} data-image-index={shown.preview.imageIndex}
      data-mip-level={shown.preview.mipLevel??0} data-mip-levels={shown.preview.mipLevels??1}
      data-source-sha256={shown.preview.sourceSha256} data-resource-sha256={shown.preview.resourceSha256??''} data-cube-face={cube?face:undefined}/>
      <small>{shown.image.width} × {shown.image.height} · {shown.preview.format} · {shown.preview.sourceKind==='verified-resource'?'Verified resource':'Embedded image'}</small>
      {shown.preview.sharedNativeBitmapPath&&<small title={shown.preview.sharedNativeBitmapPath}>Reuses original pixels · complete native image array verified</small>}
    </>}
    {loading&&<small role="status">Reading original image…</small>}
    {error&&<><small role="status">{error}</small>{!cube&&mip>0&&<button className="small-button" onClick={()=>setMip(0)}>Full resolution</button>}{!cube&&index>0&&<button className="small-button" onClick={()=>setIndex(0)}>First bitmap image</button>}</>}
  </section>;
}
