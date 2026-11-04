import {call} from './api';
import {textureResourceScopeForProject} from './textureResourceScope';
import {decodedPreviewBudget} from './resourceBudgets';

type Command = 'preview_owned_object_model' | 'preview_owned_cache_bitmap_batch' | 'preview_owned_reflection_cube';
type Entry = {promise:Promise<unknown>;bytes:number;until:number};
const entries=new Map<string,Entry>();
const MAX_ENTRIES=128,MAX_PENDING=32;
let bytes=0,hits=0,misses=0;
function remove(key:string,entry:Entry){if(entries.get(key)!==entry)return;entries.delete(key);bytes-=entry.bytes;}
/** Shared native reads for immutable source revisions. Each consumer still uses
 * the existing identity/bitmap/shader decoder and owns its GPU resources. */
export async function nativePreviewResource<T>(command:Command,args:Record<string,unknown>,sourceHash:string):Promise<T>{
  if(!/^[a-f0-9]{64}$/i.test(sourceHash))throw Error('A verified native source identity is required.');
  const scope=textureResourceScopeForProject(String(args.projectId??''));
  const key=JSON.stringify([command,sourceHash,scope,args]);
  const known=entries.get(key);
  if(known&&known.until>Date.now()){
    entries.delete(key);entries.set(key,known);hits++;
    return structuredClone(await known.promise) as T;
  }
  if(known)remove(key,known);
  misses++;
  const entry:Entry={promise:Promise.resolve(),bytes:0,until:Infinity};
  const pending=[...entries.values()].filter(item=>!item.bytes).length;
  entry.promise=call<Record<string,unknown>>(command,args).then(value=>{
    if(value.sourceSha256!==sourceHash)throw Error('Native preview source identity changed.');
    if(command==='preview_owned_object_model'&&value.objectTagId!==args.tagId)throw Error('Native model tag identity changed.');
    if(command==='preview_owned_reflection_cube'&&value.bitmapTagId!==args.bitmapTagId)throw Error('Native reflection tag identity changed.');
    // Refusals/missing resources are retryable, never retained as valid images.
    const incomplete=Array.isArray(value.items)&&value.items.some((item:any)=>!item.preview||item.error);
    const size=JSON.stringify(value).length*2;
    if(incomplete||size>16*1024*1024){remove(key,entry);return value;}
    if(entries.get(key)===entry){
      entry.bytes=size;bytes+=size;entry.until=Date.now()+120000;
      while(entries.size>MAX_ENTRIES||bytes>decodedPreviewBudget()){const oldest=entries.keys().next().value!;remove(oldest,entries.get(oldest)!);}
    }
    return value;
  },error=>{remove(key,entry);throw error;});
  // Validation failures must also release the failed single-flight entry.
  entry.promise=entry.promise.catch(error=>{remove(key,entry);throw error;});
  if(pending<MAX_PENDING)entries.set(key,entry);
  return structuredClone(await entry.promise) as T;
}
export function nativePreviewResourceStats(){return{entries:entries.size,bytes,maxBytes:decodedPreviewBudget(),hits,misses};}
export function trimNativePreviewResources(){while(bytes>decodedPreviewBudget()&&entries.size){const key=entries.keys().next().value!;remove(key,entries.get(key)!);}}
export function clearNativePreviewResources(){entries.clear();bytes=0;hits=0;misses=0;}
