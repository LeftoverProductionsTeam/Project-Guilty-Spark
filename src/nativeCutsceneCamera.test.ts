import {it,expect} from 'vitest';
import {PerspectiveCamera} from 'three';
import {applyCameraPose} from './components/MachinimaRig';
import {cameraDraft,cameraPoint,cameraClose,nativeCameraPose,cameraFromViewport,nativeCameraMatches} from './nativeCutsceneCamera';
import type {NativeCameraPoint,NativeTagContext} from './nativeOperations';
const point:NativeCameraPoint={index:1,name:'original_intro',position:[4,-5,6],orientationRadians:[.7,-.2,.4],fovRadians:70*Math.PI/180};
it('round trips a native camera through the existing director camera, including roll and lens',()=>{
 const camera=new PerspectiveCamera();applyCameraPose(camera,nativeCameraPose(point));const pose={type:camera.type,position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),fov:camera.fov,zoom:1};const captured=cameraFromViewport(point,pose);expect(captured).not.toBeNull();expect(cameraClose(point,captured!)).toBe(true);expect(cameraClose(point,cameraPoint({...cameraDraft(point),original:point})!)).toBe(true);
 const zoomed=cameraFromViewport(point,{...pose,zoom:2});expect(zoomed!.fovRadians).toBeCloseTo(2*Math.atan(Math.tan(point.fovRadians/2)/2),10);
 for(const patch of [{type:'OrthographicCamera'},{fov:undefined},{zoom:0},{quaternion:[0,0,0,0]},{position:[NaN,0,0]},{fov:180}])expect(cameraFromViewport(point,{...pose,...patch})).toBeNull();
});
it('refuses invalid draft values and stale original camera/source identities',()=>{
 const draft={...cameraDraft(point),original:point},context={projectId:'p',buildId:'b',tag:'level.scenario',tagSha256:'a'.repeat(64),class:'scnr',scenarioCameras:[point]} as NativeTagContext;
 const view={...draft,projectId:'p',buildId:'b',tag:'level.scenario',sourceSha256:'a'.repeat(64),active:true,focus:1};expect(nativeCameraMatches(view,context)).toBe(true);
 for(const patch of [{tagSha256:'b'.repeat(64)},{cameraEditIssue:'Unavailable'},{scenarioCameras:[{...point,name:'renamed'}]},{scenarioCameras:[{...point,index:2}]}])expect(nativeCameraMatches(view,{...context,...patch})).toBe(false);
 for(const patch of [{position:['','0','0']},{angles:['361','0','0']},{fov:'NaN'},{fov:'0'},{fov:'151'}])expect(cameraPoint({...draft,...patch} as typeof draft)).toBeNull();
});