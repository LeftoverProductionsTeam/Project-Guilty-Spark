import {expect,it} from 'vitest';
import {nativeAiStartMatches,nativeAiStartPosition,nativeAiStartDragValues} from './nativeAiStart';
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
