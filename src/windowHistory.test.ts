import {it,expect,vi,beforeEach} from 'vitest';
import type {Project} from './types';
import {historyReducer,initialHistory} from './editor';
import {WindowHistories,queuedWindowRefresh} from './windowHistory';
const {call}=vi.hoisted(()=>({call:vi.fn()}));vi.mock('./api',()=>({call}));
function project(id='one'):Project{return{schemaVersion:1,id,title:id,createdAt:'created',modifiedAt:'created',source:null,provenance:{creator:'',community:'',releaseYear:null,description:'',sourceUrl:'',permissions:''},scene:[],assets:[],tagEdits:[],history:[],builds:[]};}
beforeEach(()=>{call.mockReset();});
it('serializes rapid revisions, sends each immutable snapshot once and retains undo across attachment',async()=>{
  let view:any=null;const snapshots=new Map<string,Project>();
  call.mockImplementation(async(command:string,args:any)=>{
    if(command==='read_workspace_history')return{writable:true,owner:'owner',history:view?{...view,snapshots:[...snapshots].map(([key,project])=>({key,project}))}:null};
    if(command!=='commit_workspace_history')throw Error(`Unexpected test API command: ${String(command)}`);
    expect(args.revision).toBe(view?.revision??0);for(const s of args.snapshots)snapshots.set(s.key,s.project);view={head:args.head,revision:args.revision+1};return view.revision;
  });
  const broker=new WindowHistories(),p=project();await broker.attach(p.id);
  const a=historyReducer(initialHistory,{type:'load',project:p});
  const b=historyReducer(a,{type:'edit',project:{...p,title:'edited'},description:'Rename'});
  await Promise.all([broker.persist(p.id,a),broker.persist(p.id,b)]);
  expect(call.mock.calls.filter(c=>c[0]==='commit_workspace_history').map(c=>c[1].snapshots.length)).toEqual([1,1]);
  const restored=await broker.attach(p.id);expect(restored.history?.current?.title).toBe('edited');expect(restored.history?.past[0].title).toBe('one');
  await broker.persist(p.id,historyReducer(restored.history!,{type:'undo'}));
  expect(call.mock.calls.at(-1)?.[1].snapshots).toEqual([]);expect((await broker.attach(p.id)).history?.future[0].title).toBe('edited');
});
it('keeps rejected edits blocked and observable to save/close instead of acknowledging them',async()=>{
  call.mockResolvedValueOnce({writable:true,owner:'owner',history:null}).mockRejectedValueOnce(Error('Revision conflict; draft retained'));
  const b=new WindowHistories(),p=project();await b.attach(p.id);const state=historyReducer(initialHistory,{type:'load',project:p});
  await expect(b.persist(p.id,state)).rejects.toThrow('Revision conflict');expect(b.writable(p.id)).toBe(false);await expect(b.flush()).rejects.toThrow('Revision conflict');
});
it('keeps independent map revisions separate and makes observers nonwriters',async()=>{
  call.mockImplementation(async(command:string,args:any)=>command==='read_workspace_history'?{writable:args.projectId==='one',owner:'other',history:null}:1);
  const b=new WindowHistories();await b.attach('one');await b.attach('two');expect(b.writable('one')).toBe(true);expect(b.writable('two')).toBe(false);
  await b.persist('two',historyReducer(initialHistory,{type:'load',project:project('two')}));expect(call.mock.calls.filter(c=>c[0]==='commit_workspace_history')).toHaveLength(0);
});
it('reads again when a newer notification arrives during a read and keeps maps independent',async()=>{
  const releases:(()=>void)[]=[],failed=vi.fn();const refresh=vi.fn((_id:string)=>new Promise<void>(resolve=>releases.push(resolve)));
  const queue=queuedWindowRefresh(refresh,failed);queue.request('one');queue.request('one');queue.request('two');queue.request('one');
  expect(refresh.mock.calls.map(c=>c[0])).toEqual(['one','two']);releases[0]();
  await vi.waitFor(()=>expect(refresh).toHaveBeenCalledTimes(3));expect(refresh.mock.calls[2]).toEqual(['one']);
  releases[1]();releases[2]();await Promise.resolve();expect(failed).not.toHaveBeenCalled();queue.dispose();
});
it('stops queued refreshes after disposal and reports a failed read without spinning',async()=>{
  const failed=vi.fn(),refresh=vi.fn(async()=>{throw Error('Journal integrity failure');});const queue=queuedWindowRefresh(refresh,failed);
  queue.request('one');await vi.waitFor(()=>expect(failed).toHaveBeenCalledOnce());expect(refresh).toHaveBeenCalledOnce();queue.dispose();queue.request('one');expect(refresh).toHaveBeenCalledOnce();
});
