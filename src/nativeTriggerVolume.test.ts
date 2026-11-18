import {it,expect} from 'vitest';
import {volumeCenter,volumeDraft,volumeGeometry,volumeClose,nativeVolumeMatches,volumeDrag} from './nativeTriggerVolume';
import type {NativeVolumeView} from './nativeTriggerVolume';
import type {NativeTriggerVolume,NativeTagContext} from './nativeOperations';
const original:NativeTriggerVolume={name:'intro_area',kind:1,geometry:{forward:[0,1,0],up:[0,0,1],corner:[1,2,3],dimensions:[4,6,8]}};
const view=():NativeVolumeView=>({projectId:'p',buildId:'b',tag:'level.scenario',sourceSha256:'a'.repeat(64),index:0,original:structuredClone(original),active:true,focus:1,...volumeDraft(original.geometry!)});
it('uses the native basis/corner box for center, rotation and size without normalizing untouched axes',()=>{
 expect(volumeCenter(original.geometry!)).toEqual([-2,4,7]);const draft=view();expect(volumeClose(volumeGeometry(draft)!,original.geometry!)).toBe(true);draft.center[0]='2';expect(volumeGeometry(draft)!.corner).toEqual([5,2,3]);draft.rotation[2]='0';const rotated=volumeGeometry(draft)!;expect(rotated.forward).toEqual([1,0,0]);expect(rotated.corner).toEqual([0,1,3]);draft.dimensions[0]='8';expect(volumeCenter(volumeGeometry(draft)!)).toEqual([2,4,7]);
 const slight={...original,geometry:{...original.geometry!,forward:[0.0000002,1,0] as [number,number,number]}};const preserved={...draft,original:slight,...volumeDraft(slight.geometry!)};preserved.center[2]='9';expect(volumeGeometry(preserved)!.forward).toEqual(slight.geometry.forward);
});
it('keeps source proposals transient and rejects invalid, unsupported, locked or stale drags',()=>{
 const draft=view(),pose={center:[3,4,5] as [number,number,number],rotation:[0,0,90] as [number,number,number],dimensions:[4,6,8] as [number,number,number]};expect(volumeDrag(draft,draft,pose,true)?.center).toEqual(['3','4','5']);for(const changed of [{...draft,sourceSha256:'b'.repeat(64)},{...draft,active:false},{...draft,locked:true},{...draft,center:['1','2','3'] as [string,string,string]}])expect(volumeDrag(draft,changed,pose,true)).toBeNull();expect(volumeDrag(draft,draft,{...pose,dimensions:[0,1,1]},true)).toBeNull();expect(volumeGeometry({...draft,center:['','0','0']})).toBeNull();expect(volumeGeometry({...draft,original:{...original,kind:0,geometry:null}})).toBeNull();
 const context={projectId:'p',buildId:'b',tag:'level.scenario',class:'scnr',tagSha256:draft.sourceSha256,scenarioVolumes:[original]} as NativeTagContext;expect(nativeVolumeMatches(draft,context)).toBe(true);expect(nativeVolumeMatches(draft,{...context,tagSha256:'f'.repeat(64)})).toBe(false);expect(nativeVolumeMatches(draft,{...context,scenarioVolumes:[{...original,name:'other'}]})).toBe(false);
});

it('keeps appended pad drafts tied to the exact source inventory and viewport identity',()=>{
 const draft={...view(),append:true,index:1},context={projectId:'p',buildId:'b',tag:'level.scenario',class:'scnr',tagSha256:draft.sourceSha256,scenarioVolumes:[original]} as NativeTagContext;
 expect(nativeVolumeMatches(draft,context)).toBe(true);expect(nativeVolumeMatches(draft,{...context,scenarioVolumes:[original,original]})).toBe(false);expect(nativeVolumeMatches(draft,{...context,tagSha256:'b'.repeat(64)})).toBe(false);
 expect(volumeDrag(draft,{...draft,append:false},{center:[1,2,3],rotation:[0,0,0],dimensions:[4,4,4]},true)).toBeNull();
});
