import type {NativeTagContext,NativeSourcePatrolRoute} from './nativeOperations';
import type {Vec3} from './types';
export const NATIVE_AI_START_VIEW='world.ai-start';
/** Window-local, unsaved coordinate proposal. Never a project object or game actor. */
export interface NativeAiStartView {
  kind?:'firing'|'patrol';patrol?:{source:NativeSourcePatrolRoute;route:NativeSourcePatrolRoute};originalGroup?:string;group?:string;
  key:string;projectId:string;buildId:string;tag:string;sourceSha256:string;
  encounter:number;squad:number;start:number;encounterName:string;squadName:string;
  originalCommandList?:number;commandList?:number;original:Vec3;values:[string,string,string];originalFacingRadians?:number|null;facingDegrees?:string;mode?:'translate'|'rotate';active:boolean;focus:number;locked:boolean;reviewRequest?:number;
}
export function nativeAiStartPosition(values:unknown):Vec3|null {
  if(!Array.isArray(values)||values.length!==3||values.some(value=>typeof value!=='string'||!value.trim()||!Number.isFinite(Number(value))||Math.abs(Number(value))>1e6))return null;
  return values.map(Number) as Vec3;
}
// A native tag's separator spelling differs between default scenario and
// explicit tag selection. Normalize separators only, never case or segments.
const tagPath=(tag:string)=>tag.replaceAll('\\','/');
export function nativeAiStartKey(context:NativeTagContext,encounter?:number,squad?:number,start?:number,kind?:'firing'|'patrol'):string {
  return JSON.stringify([context.projectId,context.buildId,tagPath(context.tag),context.tagSha256,encounter,squad,start,...(kind?[kind]:[])]);
}
export function nativeAiStartMatches(view:NativeAiStartView,context:NativeTagContext):boolean {
  if(context.class!=='scnr'||(view.kind?context.combatEditIssue:context.startEditIssue)||view.projectId!==context.projectId||view.buildId!==context.buildId||
    tagPath(view.tag)!==tagPath(context.tag)||view.sourceSha256!==context.tagSha256)return false;
  if(view.kind==='firing'){const row=context.scenarioCombat?.find(r=>r.encounter===view.encounter),point=row?.points.find(p=>p.index===view.start);return !!row&&!!point&&row.name===view.encounterName&&point.group===view.originalGroup&&view.originalFacingRadians==null&&view.facingDegrees===undefined&&!context.protectedSquadEncounters?.includes(row.name.replace(/[A-Z]/g,c=>c.toLowerCase()))&&Array.isArray(view.original)&&point.position.every((v,i)=>v===view.original[i]);}
  if(view.kind==='patrol'){
    const row=context.scenarioCombat?.find(r=>r.encounter===view.encounter),squad=row?.squads.find(s=>s.index===view.squad&&s.name===view.squadName);
    const point=view.patrol?.route.points[view.start];
    return !context.combatEditIssue&&!!row&&row.name===view.encounterName&&!!squad?.patrol&&!squad.patrolIssue&&(!!point||view.patrol?.route.points.length===0&&view.start===0)&&!!view.patrol&&JSON.stringify(squad.patrol)===JSON.stringify(view.patrol.source)&&!context.protectedSquadEncounters?.includes(row.name.replace(/[A-Z]/g,c=>c.toLowerCase()));
  }
  const row=context.scenarioStartSquads?.find(row=>row.encounter===view.encounter&&row.squad===view.squad);
  const point=row?.starts?.find(point=>point.index===view.start);
  return (view.originalCommandList===undefined||point?.commandList===view.originalCommandList)&&(view.facingDegrees===undefined||Number.isFinite(view.originalFacingRadians)&&Number.isFinite(point?.facingRadians)&&nativeAiFacingClose(view.originalFacingRadians!,point!.facingRadians!))&&!!row&&!!point&&row.encounterName===view.encounterName&&row.name===view.squadName&&
    !context.protectedSquadEncounters?.includes(row.encounterName.replace(/[A-Z]/g,char=>char.toLowerCase()))&&
    Array.isArray(view.original)&&point.position.every((value,index)=>value===view.original[index]);
}

/** A drag cannot apply after its source, proposal, ownership or view changes. */
export function nativeAiStartDragValues(start:NativeAiStartView|null,current:NativeAiStartView|null,next:Vec3|undefined,enabled:boolean):[string,string,string]|null {
  if(!enabled||!start?.active||!current?.active||start.locked||current.locked||start.key!==current.key||
    start.values.some((value,index)=>value!==current.values[index])||start.facingDegrees!==current.facingDegrees||start.group!==current.group||start.commandList!==current.commandList||start.originalCommandList!==current.originalCommandList||JSON.stringify(start.patrol)!==JSON.stringify(current.patrol)||!next)return null;
  const values=next.map(String) as [string,string,string];
  return nativeAiStartPosition(values)?values:null;
}

export function nativeAiFacingClose(a:number,b:number):boolean {
  return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)))<=.000002;
}
/** UI degrees; the native operation always carries radians. Missing telemetry stays unavailable. */
export function nativeAiStartFacing(value:unknown):number|null {
  return typeof value==='string'&&value.trim()&&Number.isFinite(Number(value))&&Math.abs(Number(value))<=360?Number(value)*Math.PI/180:null;
}
export function nativeAiFacingDegrees(radians:number):string {
  return String(Number((Math.atan2(Math.sin(radians),Math.cos(radians))*180/Math.PI).toFixed(6)));
}
export function nativeAiStartDragFacing(start:NativeAiStartView|null,current:NativeAiStartView|null,next:number|undefined,enabled:boolean):string|null {
  if(!enabled||!start?.active||!current?.active||start.locked||current.locked||start.key!==current.key||
    start.values.some((value,index)=>value!==current.values[index])||start.facingDegrees!==current.facingDegrees||start.group!==current.group||start.commandList!==current.commandList||start.originalCommandList!==current.originalCommandList||JSON.stringify(start.patrol)!==JSON.stringify(current.patrol)||
    !Number.isFinite(start.originalFacingRadians)||start.originalFacingRadians!==current.originalFacingRadians||!Number.isFinite(next))return null;
  return nativeAiFacingDegrees(next!);
}
