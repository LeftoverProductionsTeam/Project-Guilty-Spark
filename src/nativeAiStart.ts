import type {NativeTagContext} from './nativeOperations';
import type {Vec3} from './types';
export const NATIVE_AI_START_VIEW='world.ai-start';
/** Window-local, unsaved coordinate proposal. Never a project object or game actor. */
export interface NativeAiStartView {
  key:string;projectId:string;buildId:string;tag:string;sourceSha256:string;
  encounter:number;squad:number;start:number;encounterName:string;squadName:string;
  original:Vec3;values:[string,string,string];active:boolean;focus:number;locked:boolean;reviewRequest?:number;
}
export function nativeAiStartPosition(values:unknown):Vec3|null {
  if(!Array.isArray(values)||values.length!==3||values.some(value=>typeof value!=='string'||!value.trim()||!Number.isFinite(Number(value))||Math.abs(Number(value))>1e6))return null;
  return values.map(Number) as Vec3;
}
// A native tag's separator spelling differs between default scenario and
// explicit tag selection. Normalize separators only, never case or segments.
const tagPath=(tag:string)=>tag.replaceAll('\\','/');
export function nativeAiStartKey(context:NativeTagContext,encounter?:number,squad?:number,start?:number):string {
  return JSON.stringify([context.projectId,context.buildId,tagPath(context.tag),context.tagSha256,encounter,squad,start]);
}
export function nativeAiStartMatches(view:NativeAiStartView,context:NativeTagContext):boolean {
  if(context.class!=='scnr'||context.startEditIssue||view.projectId!==context.projectId||view.buildId!==context.buildId||
    tagPath(view.tag)!==tagPath(context.tag)||view.sourceSha256!==context.tagSha256)return false;
  const row=context.scenarioStartSquads?.find(row=>row.encounter===view.encounter&&row.squad===view.squad);
  const point=row?.starts?.find(point=>point.index===view.start);
  return !!row&&!!point&&row.encounterName===view.encounterName&&row.name===view.squadName&&
    !context.protectedSquadEncounters?.includes(row.encounterName.replace(/[A-Z]/g,char=>char.toLowerCase()))&&
    Array.isArray(view.original)&&point.position.every((value,index)=>value===view.original[index]);
}

/** A drag cannot apply after its source, proposal, ownership or view changes. */
export function nativeAiStartDragValues(start:NativeAiStartView|null,current:NativeAiStartView|null,next:Vec3|undefined,enabled:boolean):[string,string,string]|null {
  if(!enabled||!start?.active||!current?.active||start.locked||current.locked||start.key!==current.key||
    start.values.some((value,index)=>value!==current.values[index])||!next)return null;
  const values=next.map(String) as [string,string,string];
  return nativeAiStartPosition(values)?values:null;
}
