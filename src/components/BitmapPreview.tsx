import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {call,native} from '../api';
import {decodeOwnedBitmapPreview} from '../ownedBitmapPreview';
import type {OwnedBitmapPreview} from '../ownedBitmapPreview';
import {bitmapSequenceFrame,validateOwnedBitmapLayout} from '../ownedBitmapLayout';
import type {OwnedBitmapLayout,BitmapSequenceFrame} from '../ownedBitmapLayout';
import type {DdsImage} from '../haloDds';
import type {Project} from '../types';
import {useMapState} from '../mapSession';
import {textureResourceScope,bitmapResourceSha256} from '../textureResourceScope';
import {decodeReflectionCube, readReflectionCube} from '../ownedReflectionCube';

/** A borrowed live canvas; never retained in project/session data or copied into another asset cache. */
export interface HudArtworkFrame {
  scope:string;bitmapTagId:number;sourceSha256:string;sequenceIndex:number;frameIndex:number;
  canvas:HTMLCanvasElement;imageWidth:number;imageHeight:number;
  displayedCrop:{left:number;top:number;width:number;height:number};nativeFrame:BitmapSequenceFrame;
}
/** Original, source-checked pixels. HUD sequence edits are explicit parent transactions. */
export default function BitmapPreview({project,tagId,cube=false,hudSequence,onHudFrame}:{project:Project;tagId:number;cube?:boolean;
  hudSequence?:{index:number;onSelect:(index:number)=>void};onHudFrame?:(frame:HudArtworkFrame|null)=>void}){
  const hudMode=!!hudSequence&&!cube;
  const resourceScope=textureResourceScope(project.source),layoutScope=project.id+':'+tagId+':'+resourceScope;
  const [layoutState,setLayout]=useState<{scope:string;value:OwnedBitmapLayout}|null>(null),
    [layoutError,setLayoutError]=useState(''),[layoutLoading,setLayoutLoading]=useState(false);
  const layout=layoutState?.scope===layoutScope?layoutState.value:null;
  const [storedHudFrame,setHudFrame]=useMapState(project.id,'bitmap.hud.frame.'+tagId+'.'+(hudSequence?.index??-1),0);
  const [showAtlas,setShowAtlas]=useMapState(project.id,'bitmap.hud.atlas.'+tagId,false);
  const sequence=hudSequence&&layout?layout.sequences[hudSequence.index]:undefined;
  const frameCount=sequence?(sequence.sprites.length||sequence.imageCount):0;
  const hudFrame=Number.isInteger(storedHudFrame)&&storedHudFrame>=0&&storedHudFrame<frameCount?storedHudFrame:0;
  const selected=useMemo(()=>{
    if(!hudMode||!layout||!hudSequence)return {frame:null,error:''};
    try{return {frame:bitmapSequenceFrame(layout,hudSequence.index,hudFrame),error:''};}
    catch(reason){return {frame:null,error:String(reason)};}
  },[hudMode,layout,hudSequence?.index,hudFrame]);
  const [storedIndex,setIndex]=useMapState(project.id,'bitmap.image.'+tagId,0);
  const index=hudMode?(selected.frame?.imageIndex??0):(Number.isInteger(storedIndex)&&storedIndex>=0&&storedIndex<2048?storedIndex:0);
  const [storedMip,setMip]=useMapState(project.id,'bitmap.mip.'+tagId+'.'+index,0);
  const mip=hudMode?0:(Number.isInteger(storedMip)&&storedMip>=0&&storedMip<=16?storedMip:0);
  const [storedFace,setFace]=useMapState(project.id,'bitmap.face.'+tagId,0);
  const face=Number.isInteger(storedFace)&&storedFace>=0&&storedFace<6?storedFace:0;
  const [frame,setFrame]=useState<{images:DdsImage[];previews:OwnedBitmapPreview[];scope:string}|null>(null),
    [count,setCount]=useState(1),[levels,setLevels]=useState(1),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const canvas=useRef<HTMLCanvasElement>(null),artworkCallback=useRef(onHudFrame);artworkCallback.current=onHudFrame;
  const ready=!hudMode||!!selected.frame;
  const scope=layoutScope+':'+(cube?'cube':index+':mip'+mip)+':'+ready;
  const shown=useMemo(()=>frame?.scope===scope?{image:frame.images[cube?face:0],preview:frame.previews[cube?face:0]}:null,[frame,scope,cube,face]);
  useEffect(()=>{
    let alive=true;setLayout(null);setLayoutError('');setLayoutLoading(hudMode);
    if(!hudMode)return;
    if(!native||!project.source){setLayoutError('Open a preserved map in the desktop app to inspect its original HUD sequences.');setLayoutLoading(false);return;}
    const source=project.source;
    void call<OwnedBitmapLayout>('inspect_owned_cache_bitmap_layout',{projectId:project.id,bitmapTagId:tagId})
      .then(value=>validateOwnedBitmapLayout(value,{bitmapTagId:tagId,sourceSha256:source.sha256,resourceSha256:source.resourceSha256?.['bitmaps.map']??null}))
      .then(value=>{if(alive)setLayout({scope:layoutScope,value});})
      .catch(reason=>{if(alive)setLayoutError(String(reason));}).finally(()=>{if(alive)setLayoutLoading(false);});
    return()=>{alive=false;};
  },[layoutScope,hudMode]);
  useEffect(()=>{
    let alive=true;setFrame(null);setError('');setLoading(ready);
    if(!ready)return;
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
      const image=decodeOwnedBitmapPreview(preview,{bitmapTagId:tagId,imageIndex:index,mipLevel:mip,sourceSha256:source.sha256,resourceSha256:bitmapResourceSha256(source)});
      if(alive){setCount(preview.imageCount??1);setLevels(preview.mipLevels??1);setFrame({images:[image],previews:[preview],scope});}
    };
    void load().catch(reason=>{if(alive)setError(String(reason));}).finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[scope]);
  // Cover the original UV rectangle in authored top-mip pixels. Never resize,
  // recolor or synthesize the bitmap, and never mutate cached decoded pixels.
  const crop=useMemo(()=>{
    if(!shown)return null;
    const uv=hudMode&&!showAtlas?selected.frame?.crop:undefined;
    const [u,v,w,h]=uv??[0,0,1,1],image=shown.image;
    const left=Math.max(0,Math.floor(u*image.width)),top=Math.max(0,Math.floor(v*image.height));
    const right=Math.min(image.width,Math.ceil((u+w)*image.width)),bottom=Math.min(image.height,Math.ceil((v+h)*image.height));
    return {left,top,width:right-left,height:bottom-top};
  },[shown,hudMode,showAtlas,selected.frame]);
  useLayoutEffect(()=>{
    const context=canvas.current?.getContext('2d');if(!shown||!crop||!context)return;
    const pixels=context.createImageData(shown.image.width,shown.image.height);pixels.data.set(shown.image.pixels);
    context.putImageData(pixels,-crop.left,-crop.top,crop.left,crop.top,crop.width,crop.height);
  },[shown,crop]);
  useLayoutEffect(()=>{
    const target=canvas.current;
    if(!hudMode||!shown||!crop||!selected.frame||!target||!hudSequence){artworkCallback.current?.(null);return;}
    artworkCallback.current?.({scope:layoutScope,bitmapTagId:tagId,sourceSha256:shown.preview.sourceSha256,
      sequenceIndex:hudSequence.index,frameIndex:hudFrame,canvas:target,imageWidth:shown.image.width,imageHeight:shown.image.height,
      displayedCrop:crop,nativeFrame:selected.frame});
    return()=>{artworkCallback.current?.(null);};
  },[hudMode,shown,crop,selected.frame,hudSequence?.index,hudFrame,layoutScope,tagId]);
  return <section className={'gs-bitmap-preview'+(hudMode?' hud-sequence-preview':'')} aria-label={hudMode?'Original HUD sequence preview':'Original bitmap preview'}>
    <div className="gs-bitmap-toolbar"><strong>{cube?'Original reflection cube':hudMode?'Original HUD artwork':'Original bitmap'}</strong>
      {cube?<select aria-label="Cubemap face" value={face} onChange={event=>setFace(Number(event.target.value))}>
        {['+X','−X','+Y','−Y','+Z','−Z'].map((label,index)=><option key={label} value={index}>{label}</option>)}
      </select>:hudMode?<>
        <label>Native sequence <select aria-label="HUD bitmap sequence" disabled={!layout} value={hudSequence!.index} onChange={event=>hudSequence!.onSelect(Number(event.target.value))}>
          <option value={-1}>Disabled (−1)</option>
          {layout?.sequences.map((sequence,index)=><option key={index} value={index}>{index} · {sequence.name||'Unnamed sequence'}</option>)}
          {hudSequence!.index!==-1&&(!layout||!layout.sequences[hudSequence!.index])&&<option value={hudSequence!.index}>{hudSequence!.index} · Missing sequence</option>}
        </select></label>
        <button className="icon-button" aria-label="Previous HUD frame" disabled={loading||hudFrame===0||frameCount===0} onClick={()=>setHudFrame(hudFrame-1)}>‹</button>
        <span>{frameCount?('Frame '+(hudFrame+1)+' / '+frameCount):'No original frames'}</span>
        <button className="icon-button" aria-label="Next HUD frame" disabled={loading||hudFrame+1>=frameCount} onClick={()=>setHudFrame(hudFrame+1)}>›</button>
        <label className="checkbox-label"><input type="checkbox" checked={showAtlas} onChange={event=>setShowAtlas(event.target.checked)}/> Full atlas</label>
      </>:<><span>{loading?'Image '+(index+1):(index+1)+' / '+count}</span>
        <button className="icon-button" aria-label="Previous bitmap image" disabled={loading||index===0} onClick={()=>setIndex(index-1)}>‹</button>
        <button className="icon-button" aria-label="Next bitmap image" disabled={loading||index+1>=count} onClick={()=>setIndex(index+1)}>›</button>
        {(levels>1||mip>0)&&<select aria-label="Original texture detail" title="Texture levels stored in the original Halo bitmap" value={mip} disabled={loading} onChange={event=>setMip(Number(event.target.value))}>
          {Array.from({length:Math.max(levels,mip+1)},(_,level)=><option key={level} value={level}>{level===0?'Full resolution':'1/'+2**level+' resolution'}</option>)}
        </select>}</>}
    </div>
    {shown&&crop&&<><canvas ref={canvas} width={crop.width} height={crop.height}
      aria-label={hudMode?'Verified original HUD frame pixels':'Verified original bitmap pixels'} data-format={shown.preview.format} data-image-index={shown.preview.imageIndex}
      data-mip-level={shown.preview.mipLevel??0} data-mip-levels={shown.preview.mipLevels??1}
      data-source-sha256={shown.preview.sourceSha256} data-resource-sha256={shown.preview.resourceSha256??''} data-cube-face={cube?face:undefined}
      data-hud-sequence={hudMode?hudSequence?.index:undefined} data-hud-frame={hudMode?hudFrame:undefined}/>
      <small>{crop.width} × {crop.height} · {shown.preview.format} · {shown.preview.sourceKind==='verified-resource'?'Verified resource':'Embedded image'}</small>
      {hudMode&&selected.frame&&<small>Native frame {selected.frame.width.toFixed(2)} × {selected.frame.height.toFixed(2)} · registration {selected.frame.registration.map(n=>n.toFixed(2)).join(', ')}. Raw artwork; HUD tint, meter fill, flashing and font composition are not applied.</small>}
      {shown.preview.sharedNativeBitmapPath&&<small title={shown.preview.sharedNativeBitmapPath}>Reuses original pixels · complete native image array verified</small>}
    </>}
    {(loading||layoutLoading)&&<small role="status">{layoutLoading?'Reading original HUD sequences…':'Reading original image…'}</small>}
    {(layoutError||selected.error||error)&&<small role="status">{layoutError||selected.error||error}</small>}
    {error&&!cube&&!hudMode&&<>{mip>0&&<button className="small-button" onClick={()=>setMip(0)}>Full resolution</button>}{index>0&&<button className="small-button" onClick={()=>setIndex(0)}>First bitmap image</button>}</>}
  </section>;
}
