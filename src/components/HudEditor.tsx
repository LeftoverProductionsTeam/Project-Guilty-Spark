import {useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {KeyboardEvent,PointerEvent} from 'react';
import type {Project,Tag,TagField} from '../types';
import {fieldValue,setTagValue,shortPath} from '../editor';
import {hudAnchorBasis,nativeHudAnchor,nativeHudArtwork,nativeHudDefinition,nativeHudLayers} from '../nativeHud';
import type {HudLayer} from '../nativeHud';
import {useMapState} from '../mapSession';
import {NumberField} from './ui';
import TagFields from './TagFields';
import BitmapPreview from './BitmapPreview';
import type {HudArtworkFrame} from './BitmapPreview';
import {textureResourceScope} from '../textureResourceScope';

/** In-game HUD authoring inside Tags. All commits use the existing project history.
 * Source artwork shares the existing bitmap canvas; native game-state composition is separate. */
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
  const [artwork,setArtwork]=useState<HudArtworkFrame|null>(null);
  const artworkCanvas=useRef<HTMLCanvasElement>(null);
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
  const artworkScope=bitmap?project.id+':'+bitmap.id+':'+textureResourceScope(project.source):'';
  const scaleX=chosen?.prefix?tag.fields.find(field=>field.key===chosen.prefix+'width_scale'):undefined;
  const scaleY=chosen?.prefix?tag.fields.find(field=>field.key===chosen.prefix+'height_scale'):undefined;
  const canCompose=!!(bitmap&&artworkSequence&&chosen?.x&&chosen.y&&scaleX&&scaleY&&nativeHudAnchor(project,tag,chosen)>=0);
  const activeArtwork=showArtwork&&canCompose&&artwork&&artwork.scope===artworkScope&&artwork.sourceSha256===project.source?.sha256&&
    artwork.sequenceIndex===value(artworkSequence,-1)?artwork:null;
  const [px,py]=chosen?position(chosen):[0,0];
  const sx=value(scaleX,1);
  const sy=value(scaleY,1);
  const origin=chosen?basis(chosen).normalized:[0,0];
  const nativeWidth=activeArtwork?.nativeFrame.width??0,nativeHeight=activeArtwork?.nativeFrame.height??0;
  const left=px-origin[0]*nativeWidth*sx,top=py-origin[1]*nativeHeight*sy;
  const referenceExtent=Math.max(Math.abs(nativeWidth*sx),Math.abs(nativeHeight*sy));
  const drawable=!!(activeArtwork&&chosen?.x&&chosen.y&&Number.isFinite(referenceExtent)&&referenceExtent<=1_000_000);
  useLayoutEffect(()=>{
    const context=artworkCanvas.current?.getContext('2d');if(!context)return;
    context.clearRect(0,0,width,canvasHeight);
    if(!drawable||!activeArtwork)return;
    const [u,v,w,h]=activeArtwork.nativeFrame.crop;
    // Borrow the original bitmap canvas after its paint effect. Do not encode,
    // retain, recolor or decode a second copy of the native image.
    context.save();context.translate(left,top);context.scale(sx,sy);
    context.drawImage(activeArtwork.canvas,u*activeArtwork.imageWidth-activeArtwork.displayedCrop.left,
      v*activeArtwork.imageHeight-activeArtwork.displayedCrop.top,w*activeArtwork.imageWidth,h*activeArtwork.imageHeight,
      0,0,nativeWidth,nativeHeight);
    context.restore();
  },[drawable,activeArtwork,left,top,sx,sy,nativeWidth,nativeHeight,width,canvasHeight]);
  return <section className="native-hud-editor" aria-label="In-game HUD editor">
    <div className="hud-editor-toolbar"><strong>In-game HUD</strong>
      <label>Element <select aria-label="HUD element" value={chosen?.id??''} onChange={event=>{selectLayer(event.target.value);setQuery('');}}>
        {layers.map(layer=><option key={layer.id} value={layer.id}>{layer.label}</option>)}</select></label>
      <label>Reference <select aria-label="HUD reference viewport" value={size} onChange={event=>{cancelDrag();setSize(event.target.value);}}>
        <option value="640x480">640 × 480 · 4:3</option><option value="854x480">854 × 480 · 16:9</option><option value="1280x720">1280 × 720 · 16:9</option>
      </select></label><label className="checkbox-label"><input type="checkbox" checked={split} onChange={event=>{cancelDrag();setSplit(event.target.checked);}}/> Half-height reference</label><label className="checkbox-label"><input type="checkbox" checked={showArtwork} disabled={!canCompose} title={canCompose?'Show this element’s original source artwork':'Select an element with admitted bitmap, sequence, anchor and scale fields'} onChange={event=>setShowArtwork(event.target.checked)}/> Source artwork</label>
    </div>
    <p className="subtle">Native anchor layout: corner offsets increase inward. Drag artwork or a point; arrow keys move it on screen (Shift: 10 units). Each move is one Undo action. Source artwork shows this element at its authored scale. Reference views leave source units unchanged; native safe-area, zoom, split-screen scaling, tint, meters and fonts still require engine-specific composition.</p>
    <svg ref={svg} className="hud-layout-canvas" viewBox={'0 0 '+width+' '+canvasHeight} role="group" aria-label="HUD anchor layout"
      onPointerMove={move} onPointerUp={event=>finish(event)} onPointerCancel={event=>finish(event,true)}
      onLostPointerCapture={event=>{if(drag.current?.pointer===event.pointerId){drag.current=null;setGhost(null);}}}
      onKeyDown={event=>{if(event.key==='Escape'&&drag.current){event.preventDefault();cancelDrag();}}}>
      <rect x="0" y="0" width={width} height={canvasHeight} className="hud-canvas-background"/>
      <foreignObject x={0} y={0} width={width} height={canvasHeight} pointerEvents="none"><canvas ref={artworkCanvas} width={width} height={canvasHeight} className="hud-artwork-canvas" aria-hidden="true"/></foreignObject>
      {drawable&&chosen&&sx!==0&&sy!==0&&<rect x={Math.min(left,left+nativeWidth*sx)} y={Math.min(top,top+nativeHeight*sy)} width={Math.abs(nativeWidth*sx)} height={Math.abs(nativeHeight*sy)}
        className="hud-artwork-selection" role="button" tabIndex={0} aria-label={'Move '+chosen.label+' artwork'} onPointerDown={event=>start(event,chosen)} onKeyDown={event=>nudge(event,chosen)}/>}
      <path d={'M '+width/2+' 0 V '+canvasHeight+' M 0 '+canvasHeight/2+' H '+width} className="hud-canvas-guide"/>
      {layers.filter(layer=>layer.x&&layer.y&&nativeHudAnchor(project,tag,layer)>=0).map(layer=>{const [x,y]=position(layer);return <g key={layer.id} transform={'translate('+x+' '+y+')'}
        role="button" tabIndex={0} aria-label={'Move '+layer.label} aria-pressed={chosen?.id===layer.id}
        className={chosen?.id===layer.id?'hud-layout-point selected':'hud-layout-point'} onFocus={()=>selectLayer(layer.id)}
        onPointerDown={event=>start(event,layer)} onClick={()=>selectLayer(layer.id)} onKeyDown={event=>nudge(event,layer)}>
        <circle r="10"/><path d="M -17 0 H 17 M 0 -17 V 17"/><title>{layer.label+' · X '+value(layer.x)+' Y '+value(layer.y)}</title>
      </g>;})}
    </svg>
    {showArtwork&&canCompose&&!activeArtwork&&<p className="subtle">Open Original bitmap for sequence and loading details. Missing or disabled artwork is not replaced.</p>}
    {showArtwork&&chosen?.x&&chosen.y&&!canCompose&&<p className="subtle">This element has no admitted bitmap/sequence/anchor/scale combination for source-artwork placement. Its native properties remain editable.</p>}
    {activeArtwork&&!drawable&&<p role="status">This element exceeds the reference view’s display extent; its native values are unchanged.</p>}
    {!layers.length&&<p role="status">This source has no admitted HUD layout fields. Native Output provides the compatible external tag-editor route; unsupported layouts are not guessed.</p>}
    {chosen&&<><div className="hud-field-heading"><h3>{chosen.label}</h3><input aria-label="Search HUD element properties" placeholder="Find a property…" value={query} onChange={event=>setQuery(event.target.value)}/></div>
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
      {bitmap&&<details key={bitmap.id} className="hud-bitmap-source" open={previewBitmap===bitmap.id} onToggle={event=>setPreviewBitmap(event.currentTarget.open?bitmap.id:null)}><summary>Original bitmap · {shortPath(bitmap.path)}</summary>{(showArtwork&&canCompose||previewBitmap===bitmap.id)&&<BitmapPreview project={project} tagId={bitmap.id} onHudFrame={setArtwork} hudSequence={artworkSequence?{index:value(artworkSequence),onSelect:index=>commit([[artworkSequence,index]],'HUD: '+artworkSequence.label)}:undefined}/>}<button onClick={()=>onNavigate(bitmap.id)}>Open bitmap tag</button><p className="subtle">Choose a native sequence to edit this element; frame arrows and Full atlas only change inspection. Original sprite bounds and registration come from this source. HUD tint, meter fill, flashing and fonts still need native composition.</p></details>}
    </>}
    <p className="subtle">Edits belong to this map’s project. Save preserves the draft; use Native Output and the reviewed native build route for a rebuilt map. The selected source artwork shares its bitmap preview; native game-state composition, element insertion/removal and HUD gameplay acceptance remain incomplete.</p>
  </section>;
}
