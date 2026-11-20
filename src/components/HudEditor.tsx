import {useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {KeyboardEvent,PointerEvent} from 'react';
import type {Project,Tag,TagField} from '../types';
import type {DdsImage} from '../haloDds';
import {fieldValue,setTagValue,shortPath} from '../editor';
import {ceHudArtworkScale,hudAnchorBasis,nativeHudAnchor,nativeHudArtwork,nativeHudDefinition,nativeHudLayers} from '../nativeHud';
import type {HudLayer} from '../nativeHud';
import {useMapState} from '../mapSession';
import {NumberField} from './ui';
import TagFields from './TagFields';
import BitmapPreview from './BitmapPreview';
import {useHudArtworks} from './useHudArtworks';

/** In-game HUD authoring inside Tags. All commits use the existing project history.
 * Source artwork shares the existing bounded bitmap reader; game-state composition is separate. */
export default function HudEditor({project,tag,tags,advanced,edit,notify,onNavigate}:{
  project:Project;tag:Tag;tags:Tag[];advanced:boolean;edit:(project:Project,description:string)=>void;
  notify:(message:string)=>void;onNavigate:(id:number)=>void;
}) {
  const layers=useMemo(()=>nativeHudLayers(tag),[tag]);
  const stateKey='hud:'+project.source?.sha256+':'+tag.id;
  const [selection,setSelection]=useMapState(project.id,stateKey+':selection',layers[0]?.id??'');
  const [size,setSize]=useMapState(project.id,stateKey+':canvas','640x480');
  const [split,setSplit]=useMapState(project.id,stateKey+':split',false);
  const [query,setQuery]=useState('');
  const [showArtwork,setShowArtwork]=useMapState(project.id,stateKey+':artwork',true);
  const [allElements,setAllElements]=useMapState(project.id,stateKey+':allElements',true);
  const [ceScale,setCeScale]=useMapState(project.id,stateKey+':ceScale',true);
  const canPreviewCeScale=project.source?.cacheVersion===609&&['unhi','wphi','grhi'].includes(tag.class);
  const artworkCanvas=useRef<HTMLCanvasElement>(null),atlasCanvases=useRef(new Map<DdsImage,HTMLCanvasElement>());
  const [previewBitmap,setPreviewBitmap]=useState<number|null>(null);
  const [ghost,setGhost]=useState<{layer:string;x:number;y:number}|null>(null);
  const svg=useRef<SVGSVGElement>(null),latest=useRef(project);latest.current=project;
  const drag=useRef<{project:Project;layer:HudLayer;pointer:number;startX:number;startY:number;x:number;y:number;signX:number;signY:number}|null>(null);
  const chosen=layers.find(layer=>layer.id===selection)??layers[0];
  const [width,height]=({'640x480':[640,480],'854x480':[854,480],'1280x720':[1280,720]} as Record<string,number[]>)[size]??[640,480];
  const canvasHeight=split?height/2:height;
  const value=(field:TagField|undefined,fallback=0)=>field?fieldValue(project,tag,field):fallback;
  function commit(changes:[TagField,number][],description:string,base=project){
    if(latest.current!==base){notify('The project changed during this HUD edit. Review the new values and try again.');return;}
    try{let next=base;for(const [field,n] of changes){if(field.kind==='reference'&&!tags.some(target=>target.id===n&&target.class===field.targetClass))throw Error('Choose a matching native tag from this source map.');next=setTagValue(next,tag,field,n);}edit(next,description);}
    catch(error){notify(String(error));}
  }
  const basis=(layer:HudLayer)=>hudAnchorBasis(nativeHudAnchor(project,tag,layer),width,canvasHeight);
  function position(layer:HudLayer){
    const {origin,sign}=basis(layer);
    const x=ghost?.layer===layer.id?ghost.x:value(layer.x),y=ghost?.layer===layer.id?ghost.y:value(layer.y);
    return [origin[0]+x*sign[0],origin[1]+y*sign[1]];
  }
  function cancelDrag(){
    const d=drag.current;drag.current=null;setGhost(null);
    if(d&&svg.current?.hasPointerCapture(d.pointer))svg.current.releasePointerCapture(d.pointer);
  }
  function selectLayer(id:string){if(drag.current?.layer.id!==id)cancelDrag();setSelection(id);}
  function point(event:PointerEvent<SVGElement>){
    const matrix=svg.current?.getScreenCTM();if(!matrix)return null;
    return new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
  }
  function start(event:PointerEvent<SVGElement>,layer:HudLayer){
    if(event.button!==0||!layer.x||!layer.y||drag.current||nativeHudAnchor(project,tag,layer)<0)return;
    const p=point(event);if(!p)return;event.preventDefault();selectLayer(layer.id);
    svg.current?.setPointerCapture(event.pointerId);
    drag.current={project,layer,pointer:event.pointerId,startX:p.x,startY:p.y,x:value(layer.x),y:value(layer.y),signX:basis(layer).sign[0],signY:basis(layer).sign[1]};
  }
  function move(event:PointerEvent<SVGSVGElement>){
    const d=drag.current,p=point(event);if(!d||!p||d.pointer!==event.pointerId)return;
    const round=(n:number,field:TagField)=>Math.min(field.max,Math.max(field.min,Math.round(n)));
    setGhost({layer:d.layer.id,x:round(d.x+(p.x-d.startX)*d.signX,d.layer.x!),y:round(d.y+(p.y-d.startY)*d.signY,d.layer.y!)});
  }
  function finish(event:PointerEvent<SVGSVGElement>,cancel=false){
    const d=drag.current;if(!d||d.pointer!==event.pointerId)return;
    const p=point(event);drag.current=null;setGhost(null);
    if(svg.current?.hasPointerCapture(event.pointerId))svg.current.releasePointerCapture(event.pointerId);
    if(cancel||!p||!d.layer.x||!d.layer.y)return;
    const clamp=(n:number,f:TagField)=>Math.min(f.max,Math.max(f.min,Math.round(n)));
    const x=clamp(d.x+(p.x-d.startX)*d.signX,d.layer.x),y=clamp(d.y+(p.y-d.startY)*d.signY,d.layer.y);
    if(x!==d.x||y!==d.y)commit([[d.layer.x,x],[d.layer.y,y]],'Move HUD '+d.layer.label,d.project);
  }
  function nudge(event:KeyboardEvent<SVGElement>,layer:HudLayer){
    if(event.altKey||event.ctrlKey||event.metaKey)return;
    if(!layer.x||!layer.y||nativeHudAnchor(project,tag,layer)<0)return;
    const delta=event.key==='ArrowLeft'?[-1,0]:event.key==='ArrowRight'?[1,0]:event.key==='ArrowUp'?[0,-1]:event.key==='ArrowDown'?[0,1]:null;
    if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();selectLayer(layer.id);return;}
    if(!delta)return;event.preventDefault();event.stopPropagation();const step=event.shiftKey?10:1;
    commit([[layer.x,value(layer.x)+delta[0]*step*basis(layer).sign[0]],[layer.y,value(layer.y)+delta[1]*step*basis(layer).sign[1]]],'Move HUD '+layer.label);
  }
  const visibleFields=chosen?.fields.filter(field=>!query.trim()||field.label.toLowerCase().includes(query.trim().toLowerCase()))??[];
  const {reference,sequence:artworkSequence}=nativeHudArtwork(tag,chosen);
  const bitmap=reference?tags.find(candidate=>candidate.id===value(reference)&&candidate.class==='bitm'):undefined;
  const [storedFrame]=useMapState(project.id,'bitmap.hud.frame.'+(bitmap?.id??-1)+'.'+value(artworkSequence,-1),0);
  const placed=layers.map(layer=>{
    const art=nativeHudArtwork(tag,layer);
    const target=art.reference?tags.find(candidate=>candidate.id===value(art.reference)&&candidate.class==='bitm'):undefined;
    const scaleX=tag.fields.find(field=>field.key===layer.prefix+'width_scale');
    const scaleY=tag.fields.find(field=>field.key===layer.prefix+'height_scale');
    const supported=!!(target&&art.sequence&&layer.x&&layer.y&&scaleX&&scaleY&&nativeHudAnchor(project,tag,layer)>=0);
    const reason=!art.reference?'No admitted bitmap dependency (text/number elements need native font composition).':!target?'The bitmap dependency is unavailable in this source.':!art.sequence?'No admitted native sequence field.':!scaleX||!scaleY?'Native scale fields are unavailable.':nativeHudAnchor(project,tag,layer)<0?'The native anchor is not admitted.':'';
    const flags=layer.fields.find(field=>field.key===layer.prefix+'scaling_flags');
    return {layer,bitmap:target,sequence:art.sequence,supported,reason,scaleX:value(scaleX,1),scaleY:value(scaleY,1),placementFlags:value(flags)};
  });
  const targets=placed.filter(item=>item.supported&&(allElements||item.layer.id===chosen?.id)).map(item=>({
    layerId:item.layer.id,bitmapTagId:item.bitmap!.id,sequenceIndex:value(item.sequence,-1),
    frameIndex:item.layer.id===chosen?.id?storedFrame:0,
  }));
  const composition=useHudArtworks(project,targets,showArtwork);
  const unavailable=placed.filter(item=>item.layer.x&&item.layer.y&&!item.supported&&(allElements||item.layer.id===chosen?.id));
  const issues=[...composition.errors,...unavailable.map(item=>({layerId:item.layer.id,reason:item.reason}))];
  const drawn=composition.layers.flatMap(art=>{
    const item=placed.find(candidate=>candidate.layer.id===art.layerId);if(!item)return [];
    const factor=canPreviewCeScale&&ceScale?ceHudArtworkScale(tag.class,item.layer.prefix,item.placementFlags,art.groupFlags):1;
    const scaleX=item.scaleX*factor,scaleY=item.scaleY*factor;
    const [x,y]=position(item.layer),{normalized}=basis(item.layer),w=art.frame.width*scaleX,h=art.frame.height*scaleY;
    if(!Number.isFinite(w)||!Number.isFinite(h)||Math.max(Math.abs(w),Math.abs(h))>1_000_000)return [];
    return [{...item,art,scaleX,scaleY,left:x-normalized[0]*w,top:y-normalized[1]*h,width:w,height:h}];
  });
  const selectedArtwork=drawn.find(item=>item.layer.id===chosen?.id);
  const dimensions=(w:number,h:number)=>`${Math.abs(w).toFixed(1)} × ${Math.abs(h).toFixed(1)}`;
  useLayoutEffect(()=>{
    const context=artworkCanvas.current?.getContext('2d');if(!context)return;
    context.clearRect(0,0,width,canvasHeight);
    const used=new Set(drawn.map(item=>item.art.image));
    for(const [image,canvas] of atlasCanvases.current)if(!used.has(image)){canvas.width=0;canvas.height=0;atlasCanvases.current.delete(image);}
    for(const item of drawn){
      const {image,frame}=item.art;
      let atlas=atlasCanvases.current.get(image);
      if(!atlas){
        atlas=document.createElement('canvas');atlas.width=image.width;atlas.height=image.height;
        const pixels=atlas.getContext('2d');if(!pixels)continue;
        const data=pixels.createImageData(image.width,image.height);data.data.set(image.pixels);pixels.putImageData(data,0,0);
        // View-owned raster surfaces, not another source cache. The loader
        // reserves their bytes before decoding; pointer moves only drawImage.
        atlasCanvases.current.set(image,atlas);
      }
      const [u,v,w,h]=frame.crop;
      context.save();context.translate(item.left,item.top);context.scale(item.scaleX,item.scaleY);
      context.drawImage(atlas,u*image.width,v*image.height,w*image.width,h*image.height,0,0,frame.width,frame.height);context.restore();
    }
  },[drawn,width,canvasHeight]);
  useLayoutEffect(()=>()=>{for(const canvas of atlasCanvases.current.values()){canvas.width=0;canvas.height=0;}atlasCanvases.current.clear();},[]);
  return <section className="native-hud-editor" aria-label="In-game HUD editor">
    <div className="hud-editor-toolbar"><strong>In-game HUD</strong>
      <label>Element <select aria-label="HUD element" value={chosen?.id??''} onChange={event=>{selectLayer(event.target.value);setQuery('');}}>
        {layers.map(layer=><option key={layer.id} value={layer.id}>{layer.label}</option>)}</select></label>
      <label>Reference <select aria-label="HUD reference viewport" value={size} onChange={event=>{cancelDrag();setSize(event.target.value);}}>
        <option value="640x480">640 × 480 · 4:3</option><option value="854x480">854 × 480 · 16:9</option><option value="1280x720">1280 × 720 · 16:9</option>
      </select></label><label className="checkbox-label"><input type="checkbox" checked={split} onChange={event=>{cancelDrag();setSplit(event.target.checked);}}/> Half-height reference</label><label className="checkbox-label"><input type="checkbox" checked={showArtwork} onChange={event=>setShowArtwork(event.target.checked)}/> Source artwork</label><label>View <select aria-label="HUD artwork composition" value={allElements?'all':'selected'} onChange={event=>setAllElements(event.target.value==='all')}><option value="all">All bitmap elements</option><option value="selected">Selected element</option></select></label>
    </div>
    {canPreviewCeScale&&<label className="checkbox-label"><input type="checkbox" checked={ceScale} onChange={event=>setCeScale(event.target.checked)}/> Preview CE artwork scale</label>}
    <p className="subtle">Drag artwork or an anchor; arrow keys move it (Shift: 10 units). Each completed move is one Undo action.</p>
    <details className="hud-reference-notes"><summary>About this reference view</summary><p className="subtle">Corner offsets increase inward. Artwork uses this tag’s native bitmap sequences and scales; other elements use their first real frame. Reference size and Half-height reference leave source units unchanged. CE artwork scale accounts for the native bitmap and placement size flags on compatible CE maps. Runtime overrides, visibility, draw order, tint, meter fill, text, safe areas, zoom and split-screen scaling are outside this reference view.</p></details>
    <svg ref={svg} className="hud-layout-canvas" viewBox={'0 0 '+width+' '+canvasHeight} role="group" aria-label="HUD anchor layout"
      onPointerMove={move} onPointerUp={event=>finish(event)} onPointerCancel={event=>finish(event,true)}
      onLostPointerCapture={event=>{if(drag.current?.pointer===event.pointerId){drag.current=null;setGhost(null);}}}
      onKeyDown={event=>{if(event.key==='Escape'&&drag.current){event.preventDefault();cancelDrag();}}}>
      <rect x="0" y="0" width={width} height={canvasHeight} className="hud-canvas-background"/>
      <foreignObject x={0} y={0} width={width} height={canvasHeight} pointerEvents="none"><canvas ref={artworkCanvas} width={width} height={canvasHeight} className="hud-artwork-canvas" aria-hidden="true"/></foreignObject>
      {drawn.filter(item=>item.width!==0&&item.height!==0).map(item=><rect key={item.layer.id} x={Math.min(item.left,item.left+item.width)} y={Math.min(item.top,item.top+item.height)} width={Math.abs(item.width)} height={Math.abs(item.height)}
        className={'hud-artwork-selection'+(chosen?.id===item.layer.id?' selected':'')} role="button" tabIndex={0} aria-pressed={chosen?.id===item.layer.id} aria-label={'Move '+item.layer.label+' artwork'}
        onFocus={()=>selectLayer(item.layer.id)} onPointerDown={event=>start(event,item.layer)} onKeyDown={event=>nudge(event,item.layer)}><title>{item.layer.label}</title></rect>)}
      <path d={'M '+width/2+' 0 V '+canvasHeight+' M 0 '+canvasHeight/2+' H '+width} className="hud-canvas-guide"/>
      {layers.filter(layer=>layer.x&&layer.y&&nativeHudAnchor(project,tag,layer)>=0).map(layer=>{const [x,y]=position(layer);return <g key={layer.id} transform={'translate('+x+' '+y+')'}
        role="button" tabIndex={0} aria-label={'Move '+layer.label} aria-pressed={chosen?.id===layer.id}
        className={chosen?.id===layer.id?'hud-layout-point selected':'hud-layout-point'} onFocus={()=>selectLayer(layer.id)}
        onPointerDown={event=>start(event,layer)} onClick={()=>selectLayer(layer.id)} onKeyDown={event=>nudge(event,layer)}>
        <circle r="10"/><path d="M -17 0 H 17 M 0 -17 V 17"/><title>{layer.label+' · X '+value(layer.x)+' Y '+value(layer.y)}</title>
      </g>;})}
    </svg>
    {showArtwork&&<div className="hud-artwork-status" role="status"><span>{composition.loading?'Reading shared source artwork…':drawn.length+' / '+targets.length+' requested bitmap elements shown'} · {placed.filter(item=>item.layer.x&&item.layer.y).length} native layout elements</span>
      {selectedArtwork&&<span>Source frame {dimensions(selectedArtwork.art.frame.width,selectedArtwork.art.frame.height)} px · Preview {dimensions(selectedArtwork.width,selectedArtwork.height)} units</span>}
      {canPreviewCeScale&&ceScale&&drawn.some(item=>item.art.groupFlags===undefined)&&<span>Some artwork is missing native bitmap flags and uses tag scale alone.</span>}
      {composition.errors.length>0&&<button className="small-button" onClick={composition.retry}>Retry artwork</button>}</div>}
    {showArtwork&&issues.length>0&&<details className="hud-artwork-issues"><summary>{issues.length} elements need attention</summary><ul>{issues.map((issue,index)=><li key={issue.layerId+':'+index}><strong>{layers.find(layer=>layer.id===issue.layerId)?.label??'HUD artwork'}: </strong>{issue.reason}</li>)}</ul></details>}
    {showArtwork&&drawn.length<composition.layers.length&&<p role="status">Some elements exceed the reference view’s display extent; their native values are unchanged.</p>}
    {showArtwork&&chosen?.x&&chosen.y&&!placed.find(item=>item.layer.id===chosen.id)?.supported&&<p className="subtle">This element has no admitted bitmap/sequence/anchor/scale combination. Its native properties remain editable; no placeholder artwork is substituted.</p>}
    {!layers.length&&<p role="status">This source has no admitted HUD layout fields. Native Output provides the compatible external tag-editor route; unsupported layouts are not guessed.</p>}
    {chosen&&<><div className="hud-field-heading"><h3>{chosen.label}</h3><button className="small-button" disabled={!chosen.fields.some(field=>value(field)!==field.value)} onClick={()=>{cancelDrag();commit(chosen.fields.filter(field=>value(field)!==field.value).map((field):[TagField,number]=>[field,field.value]),"Reset HUD "+chosen.label);}}>Reset element</button><input aria-label="Search HUD element properties" placeholder="Find a property…" value={query} onChange={event=>setQuery(event.target.value)}/></div>
      <div className="hud-native-fields">{visibleFields.map(field=>{
        const definition=nativeHudDefinition(tag,field),n=value(field);
        const caption=field.label+(advanced?' · 0x'+field.offset.toString(16).toUpperCase():'');
        const change=(next:number)=>commit([[field,next]],'HUD: '+field.label);
        if(definition?.options&&field.kind!=='reference')return <div className="hud-choice" key={field.key}><span>{caption}</span><select aria-label={field.label} value={n} onChange={event=>change(Number(event.target.value))}>{definition.options.map((label,index)=>index<=field.max&&<option key={index} value={index}>{label}</option>)}</select><button className="field-reset" aria-label={'Reset '+field.label} disabled={n===field.value} onClick={()=>change(field.value)}>↶</button></div>;
        if(definition?.flags)return <fieldset className="hud-flag-set" key={field.key}><legend>{caption}</legend>{definition.flags.map((label,index)=>{const bit=2**index;return <label key={index} className="checkbox-label"><input type="checkbox" checked={Math.floor(n/bit)%2===1} onChange={event=>change(event.target.checked?n+bit:n-bit)}/>{label}</label>;})}<small>Unknown native bits are preserved.</small></fieldset>;
        if(field.unit==='ARGB32')return <div className="hud-color" key={field.key}><label>{caption}<input type="color" aria-label={field.label+' RGB'} value={'#'+(n%0x1000000).toString(16).padStart(6,'0')} onChange={event=>change(Math.floor(n/0x1000000)*0x1000000+parseInt(event.target.value.slice(1),16))}/></label><NumberField label={field.label+' alpha'} value={Math.floor(n/0x1000000)} min={0} max={255} step={1} onCommit={alpha=>{if(!Number.isInteger(alpha)){notify('Alpha must be a whole number from 0 to 255.');return;}change(alpha*0x1000000+n%0x1000000);}}/><button className="field-reset" aria-label={'Reset '+field.label} disabled={n===field.value} onClick={()=>change(field.value)}>↶</button></div>;
        return <TagFields key={field.key} project={project} tag={{...tag,fields:[field]}} tags={tags} advanced={advanced} change={(_,next)=>change(next)}/>;
      })}</div>
      {!visibleFields.length&&<p className="subtle">No matching properties in this element.</p>}
      {bitmap&&<details key={bitmap.id} className="hud-bitmap-source" open={previewBitmap===bitmap.id} onToggle={event=>setPreviewBitmap(event.currentTarget.open?bitmap.id:null)}><summary>Original bitmap · {shortPath(bitmap.path)}</summary>{previewBitmap===bitmap.id&&<BitmapPreview project={project} tagId={bitmap.id} hudSequence={artworkSequence?{index:value(artworkSequence),onSelect:index=>commit([[artworkSequence,index]],'HUD: '+artworkSequence.label)}:undefined}/>}<button onClick={()=>onNavigate(bitmap.id)}>Open bitmap tag</button><p className="subtle">Choose a native sequence to edit this element; frame arrows and Full atlas only change inspection. Original sprite bounds and registration come from this source. HUD tint, meter fill, flashing and fonts still need native composition.</p></details>}
    </>}
    <p className="subtle">Edits belong to this map’s project. Save preserves the draft; use Native Output and the reviewed native build route for a rebuilt map. Bitmap layers and Original bitmap share the same source-checked reader and bounded cache. This tag’s raw-artwork composition is not a game-state preview: native visibility, tint, meter/font rendering, insertion/removal and HUD gameplay acceptance remain incomplete.</p>
  </section>;
}
