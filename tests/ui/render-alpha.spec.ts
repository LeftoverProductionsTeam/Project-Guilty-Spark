import {test,expect} from '@playwright/test';

test('transparent showcase postprocessing retains solid model coverage through bloom and resize',async({page})=>{
  await page.goto('/');
  const results=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/.vite/deps/three.js');
    const {createVisualPipeline}=await import('/src/visualPipeline.ts');
    const {DEFAULT_RENDER_FEATURES}=await import('/src/renderFeatures.ts');
    const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,premultipliedAlpha:false,preserveDrawingBuffer:true});
    renderer.setClearColor(0,0);renderer.setSize(64,64);
    const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,10);
    camera.position.z=2;
    const geometry=new THREE.PlaneGeometry(2,2),material=new THREE.MeshBasicMaterial({color:'#ffffff'});
    scene.add(new THREE.Mesh(geometry,material));
    const pipeline=createVisualPipeline(renderer,scene,camera,true,false,true),results=[];
    try{
      for(const size of [64,96]){
        renderer.setSize(size,size);pipeline.resize(size,size,1,'full');
        for(const bloom of [false,true]){
          pipeline.update({...DEFAULT_RENDER_FEATURES,enabled:true,bloom,exposureEv:0,saturation:1,contrast:1,vignette:0,toneMapping:'source'});
          pipeline.composer.render();
          const gl=renderer.getContext(),center=new Uint8Array(4),corner=new Uint8Array(4);
          gl.readPixels(size/2,size/2,1,1,gl.RGBA,gl.UNSIGNED_BYTE,center);
          gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,corner);
          results.push({size,bloom,center:[...center],corner:[...corner]});
        }
      }
    }finally{pipeline.dispose();geometry.dispose();material.dispose();renderer.dispose();}
    return results;
  });
  for(const result of results){
    expect(result.center[3],JSON.stringify(result)).toBe(255);
    expect(result.center[0]).toBeGreaterThan(230);
    // Bloom can reach the empty corner, but may not make it solid.
    if(result.bloom)expect(result.corner[3]).toBeLessThanOrEqual(115);
    else expect(result.corner[3]).toBe(0);
  }
});
