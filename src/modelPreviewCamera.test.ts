import { expect,it } from 'vitest';
import { modelFitPosition,validModelPreviewCamera } from './modelPreviewCamera';
it('fits the complete bounding sphere inside narrow and wide previews',()=>{
  for(const aspect of [.25,.7,1,3,8])for(const radius of [.01,1,100]){
    const position=modelFitPosition(radius,aspect,42,'fit'),distance=Math.hypot(...position),half=Math.atan(Math.tan(21*Math.PI/180)*Math.min(1,aspect));
    expect(distance*Math.sin(half)).toBeGreaterThan(radius);
  }
});
it('restores only finite camera states bound to the same native source',()=>{
  const good={sourceHash:'source',position:[3,-2,1],target:[0,0,0]};expect(validModelPreviewCamera(good,'source',1)).toBe(true);
  for(const value of [{...good,sourceHash:'stale'},{...good,position:[Infinity,0,0]},{...good,position:[0,0,0]},{...good,target:[100,0,0]},{...good,position:[1,2]}])expect(validModelPreviewCamera(value,'source',1)).toBe(false);
});
