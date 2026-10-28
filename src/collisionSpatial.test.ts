import {describe,it,expect} from 'vitest';
import {createSourceCollisionWorld,resolveSourceBody,stepSourceWalk} from './liveCollision';
describe('collision broad phase and bounded movement',()=>{
  it('supports broad BSP floors and a real Halo-sized biped beneath a low roof',()=>{
    const positions=[-500,-500,0,500,-500,0,500,500,0,-500,500,0,-500,-500,.8,500,-500,.8,500,500,.8,-500,500,.8];const world=createSourceCollisionWorld({positions,indices:[0,1,2,0,2,3,4,6,5,4,7,6]},{height:.704,radius:.127});let state={feet:[0,0,0]as [number,number,number],verticalSpeed:0,grounded:false,contacts:0};for(let i=0;i<120;i++)state=stepSourceWalk(world,state,[0,0,0],1/60);expect(state.feet[2]).toBeGreaterThan(-.03);expect(state.feet[2]).toBeLessThan(.03);expect(state.grounded).toBe(true);expect(world.queryStats.maxCandidates).toBeLessThan(10);
  });
  it('queries a small part of a dense 20k triangle surface',()=>{
    const positions:number[]=[],indices:number[]=[];
    for(let y=0;y<100;y++)for(let x=0;x<100;x++){
      const n=positions.length/3;positions.push(x*.1,y*.1,0,x*.1+.1,y*.1,0,x*.1,y*.1+.1,0,x*.1+.1,y*.1+.1,0);indices.push(n,n+1,n+2,n+1,n+3,n+2);
    }
    const world=createSourceCollisionWorld({positions,indices});resolveSourceBody(world,[5,5,.001]);
    expect(world.queryStats.maxCandidates).toBeLessThan(500);expect(world.queryStats.lastNodes).toBeLessThan(1000);expect(world.gameCollisionCompiled).toBe(false);
  });
  it('rejects nonfinite and enormous velocity states before scheduling substeps',()=>{
    const world=createSourceCollisionWorld({positions:[-2,-2,0,2,-2,0,0,2,0],indices:[0,1,2]});
    for(const verticalSpeed of [NaN,Infinity,-1e9])expect(()=>stepSourceWalk(world,{feet:[0,0,0],verticalSpeed,grounded:false,contacts:0},[0,0,0],.05)).toThrow('bounded');
  });
});
