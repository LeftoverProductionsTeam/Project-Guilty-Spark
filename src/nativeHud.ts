import schemaData from './nativeHudSchema.json';
import type {Tag,TagField} from './types';

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
