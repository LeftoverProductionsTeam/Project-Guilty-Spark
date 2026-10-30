import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {describe,expect,it} from 'vitest';
import {Mesh,Object3D,PerspectiveCamera,Scene,Vector3} from 'three';
import {correctTransformArrowheads} from './transformArrowheads';

// Load the exact installed controller used by Drei, not a mock gizmo.
const require=createRequire(import.meta.url);
const {TransformControls}=require(require.resolve('three-stdlib',{paths:[dirname(require.resolve('@react-three/drei'))]}));
describe('camera-facing translation arrows',()=>{
  it('points X/Y/Z cones outward from every camera quadrant without changing picker geometry',()=>{
    const camera=new PerspectiveCamera(60,1,.1,100),scene=new Scene(),object=new Object3D();
    const control=new TransformControls(camera);
    scene.add(object,control);control.attach(object);camera.up.set(0,0,1);
    const pickers=control.gizmo.picker.translate.children.map((m:Mesh)=>Array.from(m.geometry.attributes.position.array));
    const release=correctTransformArrowheads(control);
    for(const x of [-8,8])for(const y of [-9,9])for(const z of [-7,7]){
      camera.position.set(x,y,z);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);scene.updateMatrixWorld(true);
      for(const [index,axis] of ['X','Y','Z'].entries()){
        const cone=control.gizmo.gizmo.translate.children.find((m:Mesh&{tag?:string})=>m.name===axis&&m.visible&&(m.tag==='fwd'||m.tag==='bwd')) as Mesh;
        expect(cone,axis).toBeTruthy();
        const attribute=cone.geometry.attributes.position,points=[];
        for(let i=0;i<attribute.count;i++)points.push(new Vector3().fromBufferAttribute(attribute,i).applyMatrix4(cone.matrixWorld));
        const outer=Math.max(...points.map(p=>Math.abs(p.getComponent(index))));
        const outerRadius=Math.max(...points.filter(p=>Math.abs(p.getComponent(index))>outer-1e-5).map(p=>Math.hypot(...p.toArray().filter((_,i)=>i!==index))));
        expect(outerRadius,`${axis} outward tip at ${x},${y},${z}`).toBeLessThan(1e-5);
      }
    }
    expect(control.gizmo.picker.translate.children.map((m:Mesh)=>Array.from(m.geometry.attributes.position.array))).toEqual(pickers);
    release();
  });
});
