import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {call,native} from '../api';
import {decodeOwnedBitmapPreview} from '../ownedBitmapPreview';
import type {OwnedBitmapPreview} from '../ownedBitmapPreview';
import type {DdsImage} from '../haloDds';
import type {Project} from '../types';
import {useMapState} from '../mapSession';
import {textureResourceScope} from '../textureResourceScope';

/** Original, source-checked pixels; no replacement art or project edits. */
export default function BitmapPreview({project,tagId}:{project:Project;tagId:number}){
  const [storedIndex,setIndex]=useMapState(project.id,`bitmap.image.${tagId}`,0);
  const index=Number.isInteger(storedIndex)&&storedIndex>=0&&storedIndex<2048?storedIndex:0;
  const [frame,setFrame]=useState<{image:DdsImage;preview:OwnedBitmapPreview;scope:string}|null>(null),
    [count,setCount]=useState(1),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const canvas=useRef<HTMLCanvasElement>(null);
  const scope=project.id+':'+tagId+':'+index+':'+textureResourceScope(project.source);
  const shown=frame?.scope===scope?frame:null;
  useEffect(()=>{
    let alive=true;setFrame(null);setError('');setLoading(true);
    if(!native||!project.source){setError('Open a preserved map in the desktop app to preview its original pixels.');setLoading(false);return;}
    const source=project.source;
    void call<OwnedBitmapPreview>('preview_owned_cache_bitmap',{projectId:project.id,bitmapTagId:tagId,imageIndex:index})
      .then(preview=>{
        const image=decodeOwnedBitmapPreview(preview,{bitmapTagId:tagId,imageIndex:index,sourceSha256:source.sha256,
          resourceSha256:source.resourceSha256?.['mcc-textures']??source.resourceSha256?.['bitmaps.map']??null});
        if(alive){setCount(preview.imageCount??1);setFrame({image,preview,scope});}
      }).catch(reason=>{if(alive)setError(String(reason));}).finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[scope]);
  useLayoutEffect(()=>{
    const context=canvas.current?.getContext('2d');if(!frame||!context)return;
    const pixels=context.createImageData(frame.image.width,frame.image.height);pixels.data.set(frame.image.pixels);
    context.putImageData(pixels,0,0);
  },[shown]);
  return <section className="gs-bitmap-preview" aria-label="Original bitmap preview">
    <div className="gs-bitmap-toolbar"><strong>Original bitmap</strong><span>{loading?`Image ${index+1}`:`${index+1} / ${count}`}</span>
      <button className="icon-button" aria-label="Previous bitmap image" disabled={loading||index===0} onClick={()=>setIndex(index-1)}>‹</button>
      <button className="icon-button" aria-label="Next bitmap image" disabled={loading||index+1>=count} onClick={()=>setIndex(index+1)}>›</button>
    </div>
    {shown&&<><canvas ref={canvas} width={shown.image.width} height={shown.image.height}
      aria-label="Verified original bitmap pixels" data-format={shown.preview.format} data-image-index={shown.preview.imageIndex}
      data-source-sha256={shown.preview.sourceSha256} data-resource-sha256={shown.preview.resourceSha256??''}/>
      <small>{shown.image.width} × {shown.image.height} · {shown.preview.format} · {shown.preview.sourceKind==='verified-resource'?'Verified resource':'Embedded image'}</small>
      {shown.preview.sharedNativeBitmapPath&&<small title={shown.preview.sharedNativeBitmapPath}>Reuses original pixels · complete native image array verified</small>}
    </>}
    {loading&&<small role="status">Reading original image…</small>}
    {error&&<><small role="status">{error}</small>{index>0&&<button className="small-button" onClick={()=>setIndex(0)}>First bitmap image</button>}</>}
  </section>;
}
