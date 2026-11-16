import {nativePatrolIssue,nativePatrolEqual} from './nativeOperations';
import type {NativeSourcePatrolRoute,NativeSquadBehavior} from './nativeOperations';
import {expect,it} from 'vitest';
import {nativeAiStartMatches,nativeAiStartPosition,nativeAiStartDragValues,nativeAiStartKey,nativeAiStartFacing,nativeAiFacingDegrees,nativeAiFacingClose,nativeAiStartDragFacing} from './nativeAiStart';
import type {NativeAiStartView} from './nativeAiStart';
import type {NativeTagContext} from './nativeOperations';
const context=()=>({projectId:'project',buildId:'build',tag:'level.scenario',class:'scnr',tagSha256:'a'.repeat(64),
  canEdit:false,startEditIssue:null,scenarioStartSquads:[{encounter:0,squad:0,encounterName:'original',name:'guards',normalCount:1,insaneCount:1,starts:[{index:0,position:[1,2,3]}]}]}) as NativeTagContext;
const draft=():NativeAiStartView=>({key:'source-point',projectId:'project',buildId:'build',tag:'level.scenario',sourceSha256:'a'.repeat(64),
  encounter:0,squad:0,start:0,encounterName:'original',squadName:'guards',original:[1,2,3],values:['4','5','6'],active:true,focus:1,locked:false});
it('admits only the reviewed source identity and refuses protected/changed native starts',()=>{
 const source=context(),view=draft();expect(nativeAiStartMatches(view,source)).toBe(true); // canEdit is the unrelated radius capability.
 for(const patch of [{projectId:'other'},{buildId:'other'},{tag:'other.scenario'},{tagSha256:'b'.repeat(64)},
   {class:'weap'},{startEditIssue:'Unavailable'},{protectedSquadEncounters:['original']},{scenarioStartSquads:[]}])
   expect(nativeAiStartMatches(view,{...source,...patch})).toBe(false);
 for(const patch of [{encounter:1},{squad:1},{start:1},{squadName:'other'},{encounterName:'other'},{original:[1,2,4] as [number,number,number]}])
   expect(nativeAiStartMatches({...view,...patch},source)).toBe(false);
});
it('keeps the proposal across native separator aliases without accepting another tag or revision',()=>{
 const source={...context(),tag:'levels\\a10\\a10.scenario'},view={...draft(),tag:'levels/a10/a10.scenario'};
 expect(nativeAiStartMatches(view,source)).toBe(true);
 expect(nativeAiStartKey(source,0,0,0)).toBe(nativeAiStartKey({...source,tag:view.tag},0,0,0));
 for(const tag of ['levels/A10/a10.scenario','levels/a10/../a10/a10.scenario','levels/a10/other.scenario']) {
  expect(nativeAiStartMatches({...view,tag},source)).toBe(false);
  expect(nativeAiStartKey({...source,tag},0,0,0)).not.toBe(nativeAiStartKey(source,0,0,0));
 }
 expect(nativeAiStartKey(source,0,0,1)).not.toBe(nativeAiStartKey(source,0,0,0));
 expect(nativeAiStartKey({...source,tagSha256:'b'.repeat(64)},0,0,0)).not.toBe(nativeAiStartKey(source,0,0,0));
});
it('never makes a coordinate handle from missing, nonfinite, excessive or incomplete values',()=>{
 expect(nativeAiStartPosition(['0','-2.5','1e2'])).toEqual([0,-2.5,100]);
 for(const value of [null,{},[],['1','2'],['1','2','3','4'],['','2','3'],['NaN','2','3'],['Infinity','2','3'],['1000001','2','3'],[1,'2','3']])
   expect(nativeAiStartPosition(value)).toBeNull();
});

it('commits a completed coordinate drag only for its unchanged writable source proposal',()=>{
 const start=draft(),current=structuredClone(start),original=JSON.stringify(start);
 expect(nativeAiStartDragValues(start,current,[7.5,-2,0.125],true)).toEqual(['7.5','-2','0.125']);
 for(const patch of [{active:false},{locked:true},{key:'new source'},{values:['8','5','6'] as [string,string,string]}])
  expect(nativeAiStartDragValues(start,{...current,...patch},[7,8,9],true)).toBeNull();
 expect(nativeAiStartDragValues(start,current,[7,8,9],false)).toBeNull();
 expect(nativeAiStartDragValues(null,current,[7,8,9],true)).toBeNull();
 expect(nativeAiStartDragValues(start,null,[7,8,9],true)).toBeNull();
 expect(nativeAiStartDragValues(start,current,undefined,true)).toBeNull();
 for(const point of [[NaN,0,0],[0,Infinity,0],[1e6+1,0,0]] as [number,number,number][])
  expect(nativeAiStartDragValues(start,current,point,true)).toBeNull();
 expect(JSON.stringify(start)).toBe(original);expect(current).toEqual(start);
});

it('keeps native facing unavailable until the exact source exposes it, and converts only UI degrees',()=>{
 const source=context();source.scenarioStartSquads![0].starts![0].facingRadians=Math.PI/2;
 const view={...draft(),originalFacingRadians:Math.PI/2,facingDegrees:'90',mode:'rotate' as const};expect(nativeAiStartMatches(view,source)).toBe(true);
 for(const facingRadians of [undefined,null,NaN,0]){const changed=structuredClone(source);changed.scenarioStartSquads![0].starts![0].facingRadians=facingRadians;expect(nativeAiStartMatches(view,changed)).toBe(false);}
 expect(nativeAiStartFacing('90')).toBeCloseTo(Math.PI/2,12);expect(nativeAiFacingDegrees(3*Math.PI/2)).toBe('-90');expect(nativeAiFacingClose(0,Math.PI*2)).toBe(true);
 for(const value of ['',undefined,null,'NaN','Infinity','361','-361',90])expect(nativeAiStartFacing(value)).toBeNull();
 expect(nativeAiStartDragFacing(view,view,Math.PI,true)).toBe('180');
 for(const patch of [{active:false},{locked:true},{key:'other'},{facingDegrees:'95'},{values:['5','5','6'] as [string,string,string]},{originalFacingRadians:0}])expect(nativeAiStartDragFacing(view,{...view,...patch},Math.PI,true)).toBeNull();
 for(const value of [undefined,NaN,Infinity])expect(nativeAiStartDragFacing(view,view,value,true)).toBeNull();expect(nativeAiStartDragFacing(draft(),draft(),0,true)).toBeNull();expect(nativeAiStartDragFacing(view,view,0,false)).toBeNull();
 expect(nativeAiStartDragValues(view,{...view,facingDegrees:'80'},[1,2,3],true)).toBeNull();
});

it('reuses source-bound position drafts for encounter firing points without inventing squad or heading telemetry',()=>{
 const source=context();source.startEditIssue='No start inventory';source.combatEditIssue=null;source.scenarioCombat=[{encounter:0,name:'original',points:[{index:0,position:[1,2,3],group:'z'}],squads:[]}];const view:NativeAiStartView={...draft(),kind:'firing',squad:-1,squadName:'Firing positions',originalGroup:'z',group:'b'};
 expect(nativeAiStartMatches(view,source)).toBe(true);expect(nativeAiStartKey(source,0,-1,0,'firing')).not.toBe(nativeAiStartKey(source,0,-1,0));
 for(const patch of [{combatEditIssue:'Unavailable'},{scenarioCombat:[]},{protectedSquadEncounters:['original']},{tagSha256:'b'.repeat(64)}])expect(nativeAiStartMatches(view,{...source,...patch})).toBe(false);
 const changed=structuredClone(source);changed.scenarioCombat![0].points[0].group='a';expect(nativeAiStartMatches(view,changed)).toBe(false);expect(nativeAiStartMatches({...view,facingDegrees:'0'},source)).toBe(false);expect(nativeAiStartDragFacing(view,view,0,true)).toBeNull();expect(nativeAiStartDragValues(view,{...view,group:'a'},[4,5,6],true)).toBeNull();expect(nativeAiStartDragValues(view,view,[4,5,6],true)).toEqual(['4','5','6']);
});

it('keeps every native behavior state and gates new moving choices on existing source routes',async()=>{const {nativeSourceAiStates,nativeSourceStateReady}=await import('./nativeOperations');expect(nativeSourceAiStates).toHaveLength(12);for(const s of ['none','sleeping','guarding_at_guard_position','fleeing'])expect(nativeSourceStateReady(s,0)).toBe(true);for(const s of ['moving_loop','moving_loop_randomly','moving_loop_back_and_forth']){expect(nativeSourceStateReady(s,1)).toBe(false);expect(nativeSourceStateReady(s,2)).toBe(true);}expect(nativeSourceStateReady('moving_randomly',0)).toBe(false);expect(nativeSourceStateReady('moving_randomly',1)).toBe(true);expect(nativeSourceStateReady('unknown',32)).toBe(false);});

it('preserves existing scripted moving states but refuses copying them to new starts without a route',async()=>{const {nativeBehaviorIssue}=await import('./nativeOperations');const source={initialState:'moving_loop',returnState:'alert',patrolCount:0,starts:[{index:0,initialState:'none',returnState:'none'}]};expect(nativeBehaviorIssue({...source,returnState:'guarding'},source)).toBeNull();expect(nativeBehaviorIssue({...source,starts:[{index:0,initialState:'moving_loop',returnState:'alert'}]},source)).toContain('authored source route');});


const patrolSource=():NativeSourcePatrolRoute=>({points:[0,1,2].map(i=>({sourceIndex:i,position:[i,2,3],facingRadians:i/4,weight:1,waitSeconds:[0,2],animation:i===0?7:-1,sequenceId:i===0?-4:0}))});
it('edits ordered native patrol rows while retaining copied animation and sequence identities',()=>{
 const source=patrolSource(),original=JSON.stringify(source),route=structuredClone(source);
 route.points=[route.points[2],route.points[0],structuredClone(route.points[0]),{sourceIndex:null,position:[9,2,3],facingRadians:1,weight:2,waitSeconds:[1,4],animation:-1,sequenceId:0}];
 const behavior:NativeSquadBehavior={initialState:'moving_loop',returnState:'alert',starts:[],patrolCount:3};
 expect(nativePatrolIssue(route,source,behavior)).toBeNull();expect(nativePatrolEqual(route,source)).toBe(false);
 for(const mutate of [(r:NativeSourcePatrolRoute)=>r.points[1].animation=8,(r:NativeSourcePatrolRoute)=>r.points[1].sequenceId=4,(r:NativeSourcePatrolRoute)=>r.points[3].animation=2,(r:NativeSourcePatrolRoute)=>r.points[0].weight=NaN,(r:NativeSourcePatrolRoute)=>r.points[0].waitSeconds=[4,1],(r:NativeSourcePatrolRoute)=>r.points[0].position[0]=Infinity,(r:NativeSourcePatrolRoute)=>r.points[0].sourceIndex=31]){const changed=structuredClone(route);mutate(changed);expect(nativePatrolIssue(changed,source,behavior)).not.toBeNull();}
 expect(JSON.stringify(source)).toBe(original);
 expect(nativePatrolEqual(source,{points:source.points.map(p=>({...p,facingRadians:p.facingRadians+2*Math.PI}))})).toBe(true);
});
it('refuses route shortening that invalidates squad or starting-location movement behavior',()=>{
 const source=patrolSource(),route={points:source.points.slice(0,1)};
 expect(nativePatrolIssue(route,source)).toContain('unavailable');
 const behavior:NativeSquadBehavior={initialState:'alert',returnState:'none',patrolCount:3,starts:[{index:0,initialState:'moving_loop',returnState:'none'}]};
 expect(nativePatrolIssue(route,source,behavior)).toContain('every starting-location');
 expect(nativePatrolIssue({points:source.points.slice(0,2)},source,behavior)).toBeNull();
 expect(nativePatrolIssue({points:[]},source,{...behavior,starts:[]})).toBeNull();
 expect(nativePatrolIssue({points:Array.from({length:33},()=>source.points[0])},source,behavior)).toContain('at most32');
});
it('binds patrol viewport proposals to the complete original route and cancels stale drags',()=>{
 const source=context(),route=patrolSource();source.scenarioCombat=[{encounter:0,name:'original',points:[],squads:[{index:0,name:'guards',groups:{attacking:[],attackingSearch:[],attackingGuard:[],defending:[],defendingSearch:[],defendingGuard:[]},patrol:route}]}];
 const view:NativeAiStartView={...draft(),kind:'patrol',patrol:{source:structuredClone(route),route:structuredClone(route)},originalFacingRadians:0,facingDegrees:'0',start:0};
 expect(nativeAiStartMatches(view,source)).toBe(true);expect(nativeAiStartMatches({...view,patrol:{source:route,route:{points:[]}}},source)).toBe(true);
 for(const patch of [{tagSha256:'b'.repeat(64)},{combatEditIssue:'Missing'},{protectedSquadEncounters:['original']}])expect(nativeAiStartMatches(view,{...source,...patch})).toBe(false);
 const changed=structuredClone(source);changed.scenarioCombat![0].squads[0].patrol!.points[1].animation=9;expect(nativeAiStartMatches(view,changed)).toBe(false);
 const current=structuredClone(view);current.patrol!.route.points.reverse();expect(nativeAiStartDragValues(view,current,[1,2,3],true)).toBeNull();expect(nativeAiStartDragFacing(view,current,.5,true)).toBeNull();
 expect(nativeAiStartDragValues(view,view,[1,2,3],true)).toEqual(['1','2','3']);
 expect(nativeAiStartKey(source,0,0,0,'patrol')).not.toBe(nativeAiStartKey(source,0,0,0));
 expect(nativeAiStartKey(source,0,0,0,'patrol')).not.toBe(nativeAiStartKey(source,0,0,0,'firing'));
});


it('binds a command draft to the same original native start and cancels drags after binding changes',()=>{
 const source=context();source.scenarioStartSquads![0].starts![0].commandList=-1;
 const view={...draft(),originalCommandList:-1,commandList:1};expect(nativeAiStartMatches(view,source)).toBe(true);
 expect(nativeAiStartDragValues(view,{...view,commandList:0},[7,8,9],true)).toBeNull();expect(nativeAiStartDragFacing(view,{...view,commandList:0},1,true)).toBeNull();
 const changed=structuredClone(source);changed.scenarioStartSquads![0].starts![0].commandList=0;expect(nativeAiStartMatches(view,changed)).toBe(false);
 delete changed.scenarioStartSquads![0].starts![0].commandList;expect(nativeAiStartMatches(view,changed)).toBe(false);
 expect(nativeAiStartMatches(draft(),context())).toBe(true);
});

// Command-list waypoints use the same overlay, but retain their own real indices
// and original command source rather than masquerading as encounter starts.
import {nativeCommandKey,nativeCommandMatches,nativeCommandPoint,nativeCommandDrag,newNativeCommandRoute,nativeRouteCommand} from './nativeOperations';
import type {NativeCommandDraft,NativeCommandList} from './nativeOperations';
const commandList=():NativeCommandList=>({index:2,name:'pilot_return',flags:[false,false,false,false,false,false],bsp:-1,commands:[{atom:'go_to',modifier:0,parameters:[0,0],point1:0,point2:-1,animation:-1,script:-1,recording:-1,command:-1,objectName:-1}],points:[[1,2,3],[4,5,6]]});
function commandFixture(){const source={...context(),commandSource:{lists:[commandList()],atoms:['go_to'],referenceCounts:[0,0,0,0,1] as [number,number,number,number,number]}};const original=commandList();const view:NativeCommandDraft={key:nativeCommandKey(source,original),projectId:source.projectId,buildId:source.buildId,tag:source.tag,sourceSha256:source.tagSha256!,original,list:structuredClone(original),point:1,active:true,focus:1,locked:false};return {source,view};}
it('binds command handles to their exact list, source revision and protected ownership',()=>{
 const {source,view}=commandFixture();expect(nativeCommandMatches(view,source)).toBe(true);expect(nativeCommandPoint(view)).toEqual([4,5,6]);
 for(const patch of [{projectId:'other'},{buildId:'other'},{class:'weap'},{tag:'other.scenario'},{tagSha256:'b'.repeat(64)},{commandSourceIssue:'Unknown'},{protectedCommandLists:[2]},{commandSource:{...source.commandSource,lists:[]}}])expect(nativeCommandMatches(view,{...source,...patch})).toBe(false);
 const changed=structuredClone(source);changed.commandSource.lists[0].points[0][0]=2;expect(nativeCommandMatches(view,changed)).toBe(false);
 for(const patch of [{list:{...view.list,name:'other'}},{list:{...view.list,points:[]}},{original:{...view.original,index:0}},{key:'other'}])expect(nativeCommandMatches({...view,...patch},source)).toBe(false);
 const slash={...source,tag:'levels/test.scenario'},alias={...view,tag:'levels\\test.scenario'};alias.key=nativeCommandKey(slash,alias.original);expect(nativeCommandMatches(alias,slash)).toBe(true);expect(nativeCommandMatches({...alias,tag:'levels/Test.scenario'},slash)).toBe(false);
});
it('moves only the selected command point and rejects stale, locked, hidden or invalid drags',()=>{
 const {view}=commandFixture(),before=structuredClone(view),moved=nativeCommandDrag(view,view,[7,8,9],true)!;
 expect(view).toEqual(before);expect(moved.list.points).toEqual([[1,2,3],[7,8,9]]);expect(moved.list.commands).toEqual(view.list.commands);expect(moved.original).toEqual(view.original);expect(nativeCommandDrag(view,view,[7,8,9],false)).toBeNull();
 for(const patch of [{active:false},{locked:true},{point:0},{key:'other'},{focus:2},{frameRoute:true},{sourceSha256:'b'.repeat(64)},{list:{...view.list,flags:[true,false,false,false,false,false] as NativeCommandList['flags']}}])expect(nativeCommandDrag(view,{...view,...patch},[7,8,9],true)).toBeNull();
 for(const next of [undefined,[],[1,2],[1,2,3,4],[NaN,2,3],[Infinity,2,3],[1000001,2,3]])expect(nativeCommandDrag(view,view,next,true)).toBeNull();
 for(const point of [-1,64,1.5])expect(nativeCommandPoint({...view,point})).toBeNull();expect(nativeCommandPoint({...view,list:{...view.list,points:[[NaN,2,3]]},point:0})).toBeNull();
});


it('new native routes share source-checked viewport drafts without accepting stale or colliding indices',()=>{
 const {source}=commandFixture();source.commandSource.lists[0].index=0;const draft=newNativeCommandRoute(source,'pelican_approach',[1,2,3]);expect(draft.append).toBe(true);expect(draft.list.index).toBe(1);expect(nativeCommandMatches(draft,source)).toBe(true);expect(nativeCommandPoint(draft)).toEqual([1,2,3]);
 const expanded={...draft,active:true,list:{...draft.list,points:[[1,2,3],[4,5,6]] as [number,number,number][],commands:[nativeRouteCommand(0),nativeRouteCommand(1)]},point:1};expect(nativeCommandMatches(expanded,source)).toBe(true);expect(nativeCommandDrag(expanded,expanded,[7,8,9],true)?.list.points[1]).toEqual([7,8,9]);
 for(const patch of [{tagSha256:'b'.repeat(64)},{commandSource:{...source.commandSource,lists:[...source.commandSource.lists,draft.list]}},{commandSourceIssue:'Changed source'},{protectedCommandLists:[1]}])expect(nativeCommandMatches(expanded,{...source,...patch})).toBe(false);
 expect(()=>newNativeCommandRoute(source,'bad name',[1,2,3])).toThrow();expect(()=>newNativeCommandRoute(source,'other',[NaN,2,3])).toThrow();expect(()=>newNativeCommandRoute(source,source.commandSource.lists[0].name.toUpperCase(),[1,2,3])).toThrow();
 expect(nativeCommandMatches({...expanded,list:{...expanded.list,points:[]}},source)).toBe(false);expect(source.commandSource.lists).toHaveLength(1);
 const empty={...source,commandSource:{...source.commandSource,lists:[]}};expect(nativeCommandMatches(newNativeCommandRoute(empty,'pilot_insertion',[1,2,3]),empty)).toBe(true);
});
