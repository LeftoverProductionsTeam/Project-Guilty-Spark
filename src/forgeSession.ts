import type {QuickForgeDocument} from './forge';
import type {LibraryEntry} from './types';
type Entity=Record<string,unknown>&{id:string};
const collections=['geometry','materials','placements','spawns','objectives'];
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function portableForge(doc:QuickForgeDocument):QuickForgeDocument{return JSON.parse(JSON.stringify({...doc,placements:doc.placements.map(p=>({...p,sourceProjectId:null}))},(_key,value)=>typeof value==='number'&&!Number.isInteger(value)?Math.fround(value):value));}
export function localForge(doc:QuickForgeDocument,entries:LibraryEntry[]):QuickForgeDocument{return {...doc,placements:doc.placements.map(p=>({...p,sourceProjectId:entries.find(e=>e.sha256&&e.sha256===p.sourceSha256)?.id??null}))};}
/** Retain edits made while a network proposal was in flight. The native host
 * independently validates and merges every proposal. */
export function mergeForge(base:QuickForgeDocument,next:QuickForgeDocument,current:QuickForgeDocument,forceRemote=false):QuickForgeDocument{
  const b=base as unknown as Record<string,unknown>,n=next as unknown as Record<string,unknown>,result=structuredClone(current) as unknown as Record<string,unknown>;
  for(const key of Object.keys(n)){
    if(same(b[key],n[key]))continue;
    if(collections.includes(key)){
      const old=b[key] as Entity[],after=n[key] as Entity[],out=result[key] as Entity[];
      for(const id of new Set([...old,...after].map(v=>v.id))){const before=old.find(v=>v.id===id),value=after.find(v=>v.id===id),index=out.findIndex(v=>v.id===id);if(same(before,value))continue;
        if(!value){if(index<0)continue;if(!forceRemote&&!same(out[index],before))throw new Error(`Concurrent edit/delete conflict: ${key}/${id}`);out.splice(index,1);}
        else if(!before){if(index<0)out.push(structuredClone(value));else if(forceRemote)out[index]=structuredClone(value);else if(!same(out[index],value))throw new Error(`Concurrent creation conflict: ${key}/${id}`);}
        else if(index<0){if(forceRemote)out.push(structuredClone(value));else throw new Error(`Entity was removed: ${key}/${id}`);}
        else for(const field of Object.keys(value)){if(same(before[field],value[field]))continue;
          const v=value[field],b=before[field],c=out[index][field];
          if(Array.isArray(v)&&Array.isArray(b)&&Array.isArray(c)&&v.length===3&&b.length===3&&c.length===3&&[...v,...b,...c].every(n=>typeof n==='number')){
            out[index][field]=c.map((n,i)=>{if(v[i]===b[i])return n;if(!forceRemote&&n!==b[i]&&n!==v[i])throw new Error(`Concurrent edit conflict: ${key}/${id}/${field}/${i}`);return v[i];});
          }else{if(!forceRemote&&!same(c,b)&&!same(c,v))throw new Error(`Concurrent edit conflict: ${key}/${id}/${field}`);out[index][field]=structuredClone(v);}
        }
      }
    }else{if(!forceRemote&&!same(result[key],b[key])&&!same(result[key],n[key]))throw new Error(`Concurrent edit conflict: ${key}`);result[key]=structuredClone(n[key]);}
  }
  return result as unknown as QuickForgeDocument;
}
