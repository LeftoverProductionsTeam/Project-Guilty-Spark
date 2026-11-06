import type { HistoryState } from './editor';
import type { Project } from './types';
import { call } from './api';
import {sameJson} from './semanticJson';
type Head={current:string;past:string[];future:string[];dirty:boolean;limit:number};
type Snapshot={key:string;project:Project};
export type WindowHistoryView={revision:number;head:Head;snapshots:Snapshot[]};
export type WindowHistoryStatus={writable:boolean;owner:string|null;history:WindowHistoryView|null};
type Entry={revision:number;keys:WeakMap<Project,string>;known:Set<string>;tail:Promise<void>;blocked:boolean;last?:HistoryState};
// These fields are overlaid from the registered native project by
// read_workspace_history. Changing them is not a new authored Undo snapshot.
// Keep source identity, author timestamps and every editable field in comparison.
function sameAuthoredSnapshot(a:Project,b:Project){
  if(a.id!==b.id||a.createdAt!==b.createdAt||a.modifiedAt!==b.modifiedAt)return false;
  const authored=(p:Project)=>({...p,assets:[],builds:[],source:p.source?{...p.source,resourceDirectory:null,resourceSha256:{},audioResources:null}:null});
  return sameJson(authored(a),authored(b));
}
/** A notification received during an in-flight read requires another read.
 * Dropping it can leave an observing window permanently one revision behind. */
export function queuedWindowRefresh(refresh:(id:string)=>Promise<void>,failed:(error:unknown)=>void){
  const running=new Set<string>(),pending=new Set<string>();let disposed=false;
  function request(id:string){
    if(disposed)return;pending.add(id);if(running.has(id))return;running.add(id);
    void(async()=>{try{while(!disposed&&pending.delete(id))await refresh(id);}
      catch(error){pending.delete(id);failed(error);}
      finally{running.delete(id);if(!disposed&&pending.has(id))request(id);}})();
  }
  return{request,dispose(){disposed=true;pending.clear();}};
}
/** Local WebViews hold revisioned caches; only the native journal acknowledges
 * history. A lease permits one writer; all other views observe that same head. */
export class WindowHistories {
  private entries=new Map<string,Entry>();
  async attach(id:string):Promise<{status:WindowHistoryStatus;history:HistoryState|null}>{
    await this.flush(id);
    const status=await call<WindowHistoryStatus>('read_workspace_history',{projectId:id});
    const entry:Entry={revision:status.history?.revision??0,keys:new WeakMap(),known:new Set(),tail:Promise.resolve(),blocked:!status.writable};
    let history:HistoryState|null=null;
    if(status.history){
      const byKey=new Map(status.history.snapshots.map(s=>{entry.keys.set(s.project,s.key);entry.known.add(s.key);return[s.key,s.project] as const;}));
      const get=(key:string)=>{const p=byKey.get(key);if(!p||p.id!==id)throw Error('Window history contains an unknown project snapshot');return p;};
      const h=status.history.head;history={current:get(h.current),past:h.past.map(get),future:h.future.map(get),dirty:h.dirty,limit:h.limit};entry.last=history;
    }
    this.entries.set(id,entry);return{status,history};
  }
  writable(id:string){const e=this.entries.get(id);return !e||!e.blocked;}
  revision(id:string){return this.entries.get(id)?.revision??0;}
  block(id:string){const e=this.entries.get(id);if(e)e.blocked=true;}
  async release(id:string){await this.flush(id);this.entries.delete(id);}
  forgetDiscarded(id:string){this.entries.delete(id);}
  async retainAndRefresh(id:string,history:HistoryState){
    if(!history.current)throw Error('No local draft to retain');
    const keys=new Map<Project,string>(),key=(p:Project)=>{let k=keys.get(p);if(!k){k=crypto.randomUUID();keys.set(p,k);}return k;};
    const head:Head={current:key(history.current),past:history.past.map(key),future:history.future.map(key),dirty:history.dirty,limit:history.limit};
    const snapshots=[...keys].map(([project,key])=>({key,project}));
    const retained=await call<string>('retain_workspace_draft',{projectId:id,revision:this.revision(id),head,snapshots});
    this.entries.delete(id);return{retained,...await this.attach(id)};
  }
  persist(id:string,history:HistoryState):Promise<void>{
    const entry=this.entries.get(id);if(!entry||entry.blocked||!history.current||entry.last===history)return entry?.tail??Promise.resolve();
    const previous=entry.last;
    if(previous){
      // Existing reducer metadata merges clone current/past/future together.
      // Carry only a verified authored-equivalent object's acknowledged key;
      // never mutate an immutable native snapshot or discard an actual edit.
      const inherit=(next:Project,old:Project|undefined|null)=>{
        const known=old&&entry.keys.get(old);
        if(!entry.keys.has(next)&&known&&sameAuthoredSnapshot(next,old!))entry.keys.set(next,known);
      };
      inherit(history.current,previous.current);
      history.past.forEach((p,i)=>inherit(p,previous.past[i]));history.future.forEach((p,i)=>inherit(p,previous.future[i]));
    }
    entry.last=history;
    const key=(p:Project)=>{let k=entry.keys.get(p);if(!k){k=crypto.randomUUID();entry.keys.set(p,k);}return k;};
    const all=[history.current,...history.past,...history.future];
    const head:Head={current:key(history.current),past:history.past.map(key),future:history.future.map(key),dirty:history.dirty,limit:history.limit};
    if(previous?.current&&previous.dirty===head.dirty&&previous.limit===head.limit&&
       entry.keys.get(previous.current)===head.current&&previous.past.length===head.past.length&&previous.future.length===head.future.length&&
       previous.past.every((p,i)=>entry.keys.get(p)===head.past[i])&&previous.future.every((p,i)=>entry.keys.get(p)===head.future[i]))return entry.tail;
    const operation=entry.tail.then(async()=>{
      if(entry.blocked)throw Error('Window history is awaiting conflict review. Your draft remains open.');
      const snapshots=all.filter((p,i)=>!entry.known.has(key(p))&&all.indexOf(p)===i).map(project=>({key:key(project),project}));
      entry.revision=await call<number>('commit_workspace_history',{projectId:id,revision:entry.revision,head,snapshots});
      entry.known=new Set([head.current,...head.past,...head.future]);
    });
    entry.tail=operation.catch(error=>{entry.blocked=true;throw error;});
    // The caller reports the failure. Attach/close must still observe it.
    void entry.tail.catch(()=>{});return operation;
  }
  async flush(id?:string){if(id)await this.entries.get(id)?.tail;else await Promise.all([...this.entries.values()].map(e=>e.tail));}
}
