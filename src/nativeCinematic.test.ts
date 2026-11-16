import {it,expect} from 'vitest';
import {emptyCreatorStudio} from './creatorStudio';
import {appendNativeCameraShot,nativeCinematicSource,nativeCinematicPrefix} from './nativeCinematic';
import type {NativeCameraPoint} from './nativeOperations';
const points:NativeCameraPoint[]=[{index:0,name:'intro_a',position:[1,2,3],orientationRadians:[.6,-.2,.3],fovRadians:70*Math.PI/180},{index:1,name:'intro_b',position:[4,5,6],orientationRadians:[.8,.1,-.2],fovRadians:80*Math.PI/180}];
const take=()=>appendNativeCameraShot(appendNativeCameraShot(undefined,points[0],'a'),points[1],'b');
it('uses existing native points for a timed static cinematic through the established exporter',()=>{
 const studio=take();studio.shots[1].durationMs=2500;const before=JSON.stringify({studio,points});const result=nativeCinematicSource(studio,points,' gs_intro ');expect(result.filename).toBe('gs_intro.hsc');expect(result.content.startsWith(nativeCinematicPrefix)).toBe(true);for(const text of ['(script static void gs_intro','(camera_set intro_a 0)','(camera_set intro_b 75)','(sleep 75)','(player_enable_input false)','(player_enable_input true)'])expect(result.content).toContain(text);expect(result.content).not.toContain('(script startup');expect(JSON.stringify({studio,points})).toBe(before);
 studio.shots[1].easing='cut';expect(nativeCinematicSource(studio,points,'gs_intro').content).toContain('(camera_set intro_b 0)');
});
it('refuses missing/ambiguous camera references and geometry that differs from actual native source',()=>{
 const studio=take();expect(()=>nativeCinematicSource(studio,points.slice(0,1),'gs_intro')).toThrow('missing');expect(()=>nativeCinematicSource(studio,[...points,{...points[0],index:2,name:'INTRO_A'}],'gs_intro')).toThrow('ambiguous');
 for(const field of ['cameraPosition','roll','fov'] as const){const changed=structuredClone(studio);if(field==='cameraPosition')changed.shots[0].cameraPosition[0]+=.5;else changed.shots[0][field]=(changed.shots[0][field]??0)+1;expect(()=>nativeCinematicSource(changed,points,'gs_intro')).toThrow('differs from native');}
 expect(()=>nativeCinematicSource(studio,points,' global_scripts ')).toThrow('Global source');expect(()=>nativeCinematicSource({...studio,engineMachinima:{enabled:true,playback:'sequence',autoStart:false}},points,'gs_intro')).toThrow('separate game-native');
});
it('appends one real native camera without discarding or certifying unrelated existing shots',()=>{
 const original=take(),before=JSON.stringify(original);expect(()=>appendNativeCameraShot(original,points[0],'other')).toThrow('already');expect(JSON.stringify(original)).toBe(before);
 const unbound=emptyCreatorStudio();unbound.shots=[{...original.shots[0],cameraMarker:'not_in_native_source'}];const result=appendNativeCameraShot(unbound,points[1],'new');expect(result.shots[0]).toEqual(unbound.shots[0]);expect(()=>nativeCinematicSource(result,points,'gs_intro')).toThrow('missing');
});