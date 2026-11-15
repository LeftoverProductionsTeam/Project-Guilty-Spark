import type {NativeTagContext} from './nativeOperations';
import type {Vec3} from './types';
export const NATIVE_AI_START_VIEW='world.ai-start';
/** Window-local, unsaved coordinate proposal. Never a project object or game actor. */
export interface NativeAiStartView {
  key:string;projectId:string;buildId:string;tag:string;sourceSha256:string;
  encounter:number;squad:number;start:number;encounterName:string;squadName:string;
  original:Vec3;values:[string,string,string];active:boolean;focus:number;locked:boolean;
}
export function nativeAiStartPosition(values:unknown):Vec3|null {
  if(!Array.isArray(values)||values.length!==3||values.some(value=>typeof value!=='string'||!value.trim()||!Number.isFinite(Number(value))||Math.abs(Number(value))>1e6))return null;
  return values.map(Number) as Vec3;
}
export function nativeAiStartMatches(view:NativeAiStartView,context:NativeTagContext):boolean {
  if(context.class!=='scnr'||context.startEditIssue||view.projectId!==context.projectId||view.buildId!==context.buildId||
    view.tag!==context.tag||view.sourceSha256!==context.tagSha256)return false;
  const row=context.scenarioStartSquads?.find(row=>row.encounter===view.encounter&&row.squad===view.squad);
  const point=row?.starts?.find(point=>point.index===view.start);
  return !!row&&!!point&&row.encounterName===view.encounterName&&row.name===view.squadName&&
    !context.protectedSquadEncounters?.includes(row.encounterName.replace(/[A-Z]/g,char=>char.toLowerCase()))&&
    Array.isArray(view.original)&&point.position.every((value,index)=>value===view.original[index]);
}
