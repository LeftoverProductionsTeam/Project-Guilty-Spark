import {expect,it} from 'vitest';
import {nativeAiStartMatches,nativeAiStartPosition} from './nativeAiStart';
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
