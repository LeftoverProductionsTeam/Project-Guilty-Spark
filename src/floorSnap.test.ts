import {describe,expect,it} from 'vitest';
import {Box3,Matrix4,Vector3} from 'three';
import {collisionBounds,floorSnapDelta} from './floorSnap';
const floor=(z:number)=>({mesh:{positions:[-10,-10,z,10,-10,z,10,10,z,-10,10,z],indices:[0,1,2,0,2,3]},matrix:new Matrix4()});
describe('drop to actual collision',()=>{
  it('uses the highest support below the feet and ignores a ceiling',()=>{
    const box=new Box3(new Vector3(-.2,-.2,5),new Vector3(.2,.2,6));
    expect(floorSnapDelta([box],[floor(0),floor(2),floor(8)])).toBeCloseTo(-2.9999,6);
    expect(floorSnapDelta([new Box3(new Vector3(-.2,-.2,-.2),new Vector3(.2,.2,.3))],[floor(0)])).toBeCloseTo(.2001,6);
  });
  it('uses transformed collision, keeps group offsets and refuses missing or corrupt surfaces',()=>{
    const a=new Box3(new Vector3(-.2,-.2,5),new Vector3(.2,.2,6));
    const b=new Box3(new Vector3(2,-.2,7),new Vector3(2.4,.2,8));
    const support=floor(0);support.matrix.makeTranslation(0,0,1);
    expect(floorSnapDelta([a,b],[support])).toBeCloseTo(-3.9999,6);
    expect(floorSnapDelta([a],[])).toBeNull();
    expect(()=>floorSnapDelta([a],[{mesh:{positions:[0,0,0],indices:[0,1,2]},matrix:new Matrix4()}])).toThrow(/index/);
    expect(()=>collisionBounds({positions:[NaN,0,0],indices:[]},new Matrix4())).toThrow(/non-finite/);
  });
});
