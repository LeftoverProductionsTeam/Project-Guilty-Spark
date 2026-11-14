import schemaData from './nativeHudSchema.json';
import {fieldValue} from './editor';
import type {Project,Tag,TagField} from './types';

interface HudDefinition {name:string;label:string;type:string;struct?:string;options?:string[];flags?:string[];width?:number;classes?:string[]}
interface HudSchema {roots:Record<string,string>;structs:Record<string,{size:number;fields:HudDefinition[]}>}
const schema=schemaData as HudSchema;
export const isNativeHud=(tag:Tag)=>Object.hasOwn(schema.roots,tag.class);
export function nativeHudDefinition(tag:Tag,field:TagField):HudDefinition|undefined {
  if(!field.key.startsWith('hud:'))return;
  let name=schema.roots[tag.class],definition:HudDefinition|undefined;
  for(const part of field.key.slice(4).split('.')) {
    const row=schema.structs[name];if(!row)return definition;
    const next=row.fields.find(candidate=>candidate.name===part.replace(/\[\d+\]$/,''));
    if(!next)return definition;definition=next;
    if(next.struct)name=next.struct;else break;
  }
  return definition;
}
export interface HudLayer {id:string;label:string;fields:TagField[];x?:TagField;y?:TagField;prefix?:string}
export function nativeHudLayers(tag:Tag):HudLayer[] {
  const fields=tag.fields.filter(field=>field.key.startsWith('hud:'));
  const layers:HudLayer[]=fields.filter(field=>field.key.endsWith('anchor_offset.x')).map(x=>{
    const prefix=x.key.slice(0,-'anchor_offset.x'.length),y=fields.find(field=>field.key===prefix+'anchor_offset.y');
    const id=prefix.replace(/[_.]$/,'');
    return {id,label:(id.slice(4)||'HUD messages').replaceAll('_',' ').replace(/\[(\d+)\]/g,(_,n)=>' '+(Number(n)+1)),fields:[],x,y,prefix};
  }).filter(layer=>!!layer.y);
  for(const field of fields){
    let layer:HudLayer|undefined=layers.filter(candidate=>candidate.prefix!==undefined&&field.key.startsWith(candidate.prefix)).sort((a,b)=>b.prefix!.length-a.prefix!.length)[0];
    if(!layer){
      const path=field.key.slice(4),end=path.lastIndexOf('].'),id=end>=0?'hud:'+path.slice(0,end+1):'hud:settings';
      layer=layers.find(candidate=>candidate.id===id);
      if(!layer){layer={id,label:id==='hud:settings'?'HUD settings':id.slice(4).replaceAll('_',' ').replace(/\[(\d+)\]/g,(_,n)=>' '+(Number(n)+1)),fields:[]};layers.push(layer);}
    }
    layer.fields.push(field);
  }
  return layers;
}
export const HUD_ANCHORS=[[0,0],[1,0],[0,1],[1,1],[.5,.5],[.5,0],[.5,1],[0,.5],[1,.5]] as const;

/** Base artwork may belong to the enclosing crosshair/overlay element. */
export function nativeHudArtwork(tag:Tag,layer:HudLayer|undefined):{reference?:TagField;sequence?:TagField}{
  if(!layer)return {};
  const prefixes:string[]=[];if(layer.prefix)prefixes.push(layer.prefix);
  let parent=layer.prefix?.replace(/[_.]$/,'');
  while(parent?.includes('.')){parent=parent.slice(0,parent.lastIndexOf('.'));prefixes.push(parent+'.');}
  const names=['interface_bitmap','meter_bitmap','crosshair_bitmap','overlay_bitmap','icon_bitmap'];
  let reference:TagField|undefined;
  for(const prefix of prefixes){
    reference=tag.fields.find(field=>field.kind==='reference'&&field.targetClass==='bitm'&&names.some(name=>field.key===prefix+name));
    if(reference)break;
  }
  if(!reference&&tag.class==='grhi'&&layer.id.startsWith('hud:total_grenades_overlays['))reference=tag.fields.find(field=>field.key==='hud:total_grenades_overlay_bitmap');
  // Non-layout reference groups still expose their own original image, without
  // pretending that a missing sequence selects native frame zero.
  reference??=layer.fields.find(field=>field.kind==='reference'&&field.targetClass==='bitm');
  const sequence=layer.prefix?tag.fields.find(field=>field.key===layer.prefix+'sequence_index'):undefined;
  return {reference,sequence};
}

/** Coordinate conventions only: no engine safe-area, zoom or multiplayer simulation. */
export function nativeHudAnchor(project:Project,tag:Tag,layer:HudLayer):number {
  const value=(field:TagField|undefined)=>field?fieldValue(project,tag,field):-1;
  const resolve=(key:string)=>{
    const field=tag.fields.find(candidate=>candidate.key===key);
    // An absent admitted MCC child-anchor cell is not the legacy "inherit" cell.
    if(!field&&project.source?.cacheVersion===13&&/^hud:(static_elements|meter_elements|number_elements|overlay_elements)\[\d+\]\.anchor$/.test(key))return NaN;
    let n=value(field);
    if(field&&nativeHudDefinition(tag,field)?.type==='HUDInterfaceChildAnchor')n-=1;
    return n;
  };
  if(layer.id.includes('.crosshair_overlays['))return 4;
  if(tag.class==='unhi'&&layer.id.startsWith('hud:overlays['))return resolve('hud:auxiliary_overlay_anchor');
  let n=resolve(layer.prefix+'anchor');
  let parent=layer.prefix?.replace(/[_.]$/,'');
  while(n<0&&parent?.includes('.')){parent=parent.slice(0,parent.lastIndexOf('.'));n=resolve(parent+'.anchor');}
  if(n<0)n=resolve('hud:anchor');
  return Number.isInteger(n)&&n>=0&&n<HUD_ANCHORS.length?n:-1;
}
export function hudAnchorBasis(anchor:number,width:number,height:number){
  const normalized=HUD_ANCHORS[anchor]??HUD_ANCHORS[0];
  // Native right/bottom corner and edge-center offsets increase inward.
  const signX=anchor===1||anchor===3||anchor===8?-1:1;
  const signY=anchor===2||anchor===3||anchor===6?-1:1;
  return {origin:[normalized[0]*width,normalized[1]*height] as [number,number],sign:[signX,signY] as [number,number],normalized};
}
