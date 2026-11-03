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

test('transparent showcase retains additive hologram brightness without applying native alpha twice',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/.vite/deps/three.js');
    const {createVisualPipeline}=await import('/src/visualPipeline.ts');
    const {createHaloMaterial}=await import('/src/haloMaterial.ts');
    const {DEFAULT_RENDER_FEATURES}=await import('/src/renderFeatures.ts');
    const renderer=new THREE.WebGLRenderer({alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:true});renderer.setSize(32,32);renderer.setClearColor(0,0);
    const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=2;
    const texture=new THREE.DataTexture(new Uint8Array([64,0,128,8]),1,1);texture.userData.sourceEncoded=true;texture.needsUpdate=true;
    const material=createHaloMaterial(texture,null,{kind:'generic',alphaTest:false,twoSided:true,uvScale:[1,1],framebufferBlend:3,layers:[]},{});
    material.uniforms.linearOutput.value=true;
    const geometry=new THREE.PlaneGeometry(2,2);geometry.setAttribute('uv1',geometry.getAttribute('uv'));scene.add(new THREE.Mesh(geometry,material));
    const pipeline=createVisualPipeline(renderer,scene,camera,false,false,true);
    try{pipeline.resize(32,32,1,'full');pipeline.update({...DEFAULT_RENDER_FEATURES,enabled:true,bloom:false,exposureEv:0,saturation:1,contrast:1,vignette:0,toneMapping:'source'});pipeline.composer.render();
      const gl=renderer.getContext(),pixel=new Uint8Array(4);gl.readPixels(16,16,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return{pixel:[...pixel],overBlack:[...pixel.slice(0,3)].map(c=>c*pixel[3]/255)};
    }finally{pipeline.dispose();geometry.dispose();material.dispose();texture.dispose();renderer.dispose();}
  });
  for(const [i,expected]of [64,0,128].entries())expect(Math.abs(result.overBlack[i]-expected),JSON.stringify(result)).toBeLessThanOrEqual(2);
});
