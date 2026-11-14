import {useMemo,useRef,useState} from 'react';
import type {KeyboardEvent,PointerEvent} from 'react';
import type {Project,Tag,TagField} from '../types';
import {fieldValue,setTagValue,shortPath} from '../editor';
import {HUD_ANCHORS,nativeHudDefinition,nativeHudLayers} from '../nativeHud';
import type {HudLayer} from '../nativeHud';
import {useMapState} from '../mapSession';
import {NumberField} from './ui';
import TagFields from './TagFields';
import BitmapPreview from './BitmapPreview';

/** In-game HUD authoring inside Tags. All commits use the existing project history.
 * The canvas is an anchor diagram, not a substitute for native sprite compositing. */
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
  const [previewBitmap,setPreviewBitmap]=useState<number|null>(null);
  const [ghost,setGhost]=useState<{layer:string;x:number;y:number}|null>(null);
  const svg=useRef<SVGSVGElement>(null),latest=useRef(project);latest.current=project;
  const drag=useRef<{project:Project;layer:HudLayer;pointer:number;startX:number;startY:number;x:number;y:number}|null>(null);
  const chosen=layers.find(layer=>layer.id===selection)??layers[0];
  const [width,height]=({'640x480':[640,480],'854x480':[854,480],'1280x720':[1280,720]} as Record<string,number[]>)[size]??[640,480];
  const canvasHeight=split?height/2:height;
  const value=(field:TagField|undefined,fallback=0)=>field?fieldValue(project,tag,field):fallback;
  function commit(changes:[TagField,number][],description:string,base=project){
    if(latest.current!==base){notify('The project changed during this HUD edit. Review the new values and try again.');return;}
    try{let next=base;for(const [field,n] of changes){if(field.kind==='reference'&&!tags.some(target=>target.id===n&&target.class===field.targetClass))throw Error('Choose a matching native tag from this source map.');next=setTagValue(next,tag,field,n);}edit(next,description);}
    catch(error){notify(String(error));}
  }
  function position(layer:HudLayer){
    let anchor=tag.fields.find(field=>field.key===layer.prefix+'anchor');
    let n=value(anchor,-1);
    if(anchor&&nativeHudDefinition(tag,anchor)?.type==='HUDInterfaceChildAnchor')n-=1;
    if(n<0){
      const parent=layer.prefix?.replace(/[_.]$/,'').replace(/\.[^.]+$/,'');
      anchor=tag.fields.find(field=>field.key===parent+'.anchor');n=value(anchor,-1);
      if(anchor&&nativeHudDefinition(tag,anchor)?.type==='HUDInterfaceChildAnchor')n-=1;
      if(n<0){anchor=tag.fields.find(field=>field.key==='hud:anchor');n=value(anchor);}
    }
    if(tag.class==='unhi'&&layer.id.startsWith('hud:overlays['))n=value(tag.fields.find(field=>field.key==='hud:auxiliary_overlay_anchor'));
    if(layer.id.includes('.crosshair_overlays['))n=4;
    const origin=HUD_ANCHORS[n]??HUD_ANCHORS[0];
    const x=ghost?.layer===layer.id?ghost.x:value(layer.x),y=ghost?.layer===layer.id?ghost.y:value(layer.y);
    return [origin[0]*width+x,origin[1]*canvasHeight+y];
  }
  function point(event:PointerEvent<SVGSVGElement>|PointerEvent<SVGGElement>){
    const matrix=svg.current?.getScreenCTM();if(!matrix)return null;
    return new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
  }
  function start(event:PointerEvent<SVGGElement>,layer:HudLayer){
    if(event.button!==0||!layer.x||!layer.y)return;
    const p=point(event);if(!p)return;event.preventDefault();setSelection(layer.id);
    svg.current?.setPointerCapture(event.pointerId);
    drag.current={project,layer,pointer:event.pointerId,startX:p.x,startY:p.y,x:value(layer.x),y:value(layer.y)};
  }
  function move(event:PointerEvent<SVGSVGElement>){
    const d=drag.current,p=point(event);if(!d||!p||d.pointer!==event.pointerId)return;
    const round=(n:number,field:TagField)=>Math.min(field.max,Math.max(field.min,Math.round(n)));
    setGhost({layer:d.layer.id,x:round(d.x+p.x-d.startX,d.layer.x!),y:round(d.y+p.y-d.startY,d.layer.y!)});
  }
  function finish(event:PointerEvent<SVGSVGElement>,cancel=false){
    const d=drag.current;if(!d||d.pointer!==event.pointerId)return;
    const p=point(event);drag.current=null;setGhost(null);
    if(svg.current?.hasPointerCapture(event.pointerId))svg.current.releasePointerCapture(event.pointerId);
    if(cancel||!p||!d.layer.x||!d.layer.y)return;
    const clamp=(n:number,f:TagField)=>Math.min(f.max,Math.max(f.min,Math.round(n)));
    const x=clamp(d.x+p.x-d.startX,d.layer.x),y=clamp(d.y+p.y-d.startY,d.layer.y);
    if(x!==d.x||y!==d.y)commit([[d.layer.x,x],[d.layer.y,y]],'Move HUD '+d.layer.label,d.project);
  }
  function nudge(event:KeyboardEvent<SVGGElement>,layer:HudLayer){
    if(!layer.x||!layer.y)return;
    const delta=event.key==='ArrowLeft'?[-1,0]:event.key==='ArrowRight'?[1,0]:event.key==='ArrowUp'?[0,-1]:event.key==='ArrowDown'?[0,1]:null;
    if(event.key==='Enter'||event.key===' '){event.preventDefault();setSelection(layer.id);return;}
    if(!delta)return;event.preventDefault();const step=event.shiftKey?10:1;
    commit([[layer.x,value(layer.x)+delta[0]*step],[layer.y,value(layer.y)+delta[1]*step]],'Move HUD '+layer.label);
  }
  const visibleFields=chosen?.fields.filter(field=>!query.trim()||field.label.toLowerCase().includes(query.trim().toLowerCase()))??[];
  const reference=chosen?.fields.find(field=>field.kind==='reference'&&field.targetClass==='bitm');
  const bitmap=reference?tags.find(candidate=>candidate.id===value(reference)&&candidate.class==='bitm'):undefined;
  return <section className="native-hud-editor" aria-label="In-game HUD editor">
    <div className="hud-editor-toolbar"><strong>In-game HUD</strong>
      <label>Element <select aria-label="HUD element" value={chosen?.id??''} onChange={event=>{setSelection(event.target.value);setQuery('');}}>
        {layers.map(layer=><option key={layer.id} value={layer.id}>{layer.label}</option>)}</select></label>
      <label>Reference <select aria-label="HUD reference viewport" value={size} onChange={event=>setSize(event.target.value)}>
        <option value="640x480">640 × 480 · 4:3</option><option value="854x480">854 × 480 · 16:9</option><option value="1280x720">1280 × 720 · 16:9</option>
      </select></label><label className="checkbox-label"><input type="checkbox" checked={split} onChange={event=>setSplit(event.target.checked)}/> Half-height reference</label>
    </div>
    <p className="subtle">Native anchor layout. Drag a point or use arrow keys (Shift: 10 units); each move is one Undo action. Viewport choices do not change native resolution. Sprite, meter and font composition must be verified in Halo.</p>
    <svg ref={svg} className="hud-layout-canvas" viewBox={'0 0 '+width+' '+canvasHeight} role="group" aria-label="HUD anchor layout"
      onPointerMove={move} onPointerUp={event=>finish(event)} onPointerCancel={event=>finish(event,true)}
      onLostPointerCapture={()=>{drag.current=null;setGhost(null);}}
      onKeyDown={event=>{if(event.key==='Escape'&&drag.current){event.preventDefault();const pointer=drag.current.pointer;drag.current=null;setGhost(null);if(svg.current?.hasPointerCapture(pointer))svg.current.releasePointerCapture(pointer);}}}>
      <rect x="0" y="0" width={width} height={canvasHeight} className="hud-canvas-background"/>
      <path d={'M '+width/2+' 0 V '+canvasHeight+' M 0 '+canvasHeight/2+' H '+width} className="hud-canvas-guide"/>
      {layers.filter(layer=>layer.x&&layer.y).map(layer=>{const [x,y]=position(layer);return <g key={layer.id} transform={'translate('+x+' '+y+')'}
        role="button" tabIndex={0} aria-label={'Move '+layer.label} aria-pressed={chosen?.id===layer.id}
        className={chosen?.id===layer.id?'hud-layout-point selected':'hud-layout-point'} onFocus={()=>setSelection(layer.id)}
        onPointerDown={event=>start(event,layer)} onClick={()=>setSelection(layer.id)} onKeyDown={event=>nudge(event,layer)}>
        <circle r="10"/><path d="M -17 0 H 17 M 0 -17 V 17"/><title>{layer.label+' · X '+value(layer.x)+' Y '+value(layer.y)}</title>
      </g>;})}
    </svg>
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
      {bitmap&&<details key={bitmap.id} className="hud-bitmap-source" onToggle={event=>setPreviewBitmap(event.currentTarget.open?bitmap.id:null)}><summary>Original bitmap · {shortPath(bitmap.path)}</summary>{previewBitmap===bitmap.id&&<BitmapPreview project={project} tagId={bitmap.id}/>}<button onClick={()=>onNavigate(bitmap.id)}>Open bitmap tag</button><p className="subtle">Original bitmap image, not a composed HUD sprite. Sequence selection and native runtime composition are separate.</p></details>}
    </>}
    <p className="subtle">Edits belong to this map’s project. Save preserves the draft; use Native Output and the reviewed native build route for a rebuilt map. Element insertion/removal, sprite compositing and HUD gameplay acceptance are not implemented by this layout view.</p>
  </section>;
}
