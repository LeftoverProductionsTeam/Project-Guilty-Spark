import * as THREE from 'three';
import { createHaloMaterial,createHaloMaterialPasses } from '../../../src/haloMaterial';
import { renderIndices } from '../../../src/haloGeometry';
import type { ShaderPreview, ShaderStage } from '../../../src/types';

export function renderMaterialChecks() {
  const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('canvas')!, antialias: false });
  renderer.setSize(32, 32);
  const target = new THREE.WebGLRenderTarget(32, 32, { depthBuffer: true });
  const errors: string[] = [];
  renderer.debug.onShaderError = (_gl, _program, vs, fs) => {
    errors.push(String(_gl.getShaderInfoLog(vs)), String(_gl.getShaderInfoLog(fs)));
  };
  const texture = (rgba: number[]) => {
    const t = new THREE.DataTexture(new Uint8Array(rgba), 1, 1);
    t.userData.sourceEncoded = true;
    t.needsUpdate = true;
    return t;
  };
  const black = texture([0, 0, 0, 0]),
    green = texture([0, 128, 0, 128]),
    red = texture([64, 0, 0, 0]),
    half = texture([128, 128, 128, 255]);
  const geometry = new THREE.PlaneGeometry(2, 2);
  geometry.setAttribute('uv1', geometry.getAttribute('uv'));
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 2;
  const scene = new THREE.Scene();
  renderer.setRenderTarget(target);
  renderer.setClearColor(new THREE.Color(0.1, 0.2, 0.3), 1);
  const sample = (material: THREE.Material|THREE.Material[], geo = geometry) => {
    const grouped=Array.isArray(material)?geo.clone():geo;
    if(Array.isArray(material)){grouped.clearGroups();material.forEach((_,slot)=>grouped.addGroup(0,grouped.index?.count??grouped.getAttribute('position').count,slot));}
    const mesh = new THREE.Mesh(grouped, material);
    scene.add(mesh);
    renderer.clear();
    renderer.render(scene, camera);
    const pixel = new Uint8Array(4);
    renderer.readRenderTargetPixels(target, 16, 16, 1, 1, pixel);
    scene.remove(mesh);
    for(const pass of Array.isArray(material)?material:[material])pass.dispose();
    if(grouped!==geo)grouped.dispose();
    return [...pixel];
  };
  const metadata: ShaderPreview = {
    kind: 'generic',
    alphaTest: false,
    twoSided: false,
    uvScale: [1, 1],
    framebufferBlend: 3,
    layers: [],
  };
  const neutral = sample(createHaloMaterial(black, null, metadata, {}));
  const added = sample(createHaloMaterial(red, null, metadata, {}));
  const alphaAdded = sample(createHaloMaterial(red, null, { ...metadata, framebufferBlend: 7 }, {}));
  const stage: ShaderStage = {
    flags: 0,
    constant0Source: 0,
    constant0Function: 0,
    constant0Period: 1,
    constant0Lower: [1, 1, 1, 1],
    constant0Upper: [1, 1, 1, 1],
    constant1: [0, 0, 0, 0],
    colorInputs: [5, 0, 6, 0, 0, 0, 0, 0],
    colorOutputs: [0, 0, 0, 0, 1, 0],
    alphaInputs: [5, 0, 1, 0, 0, 0, 0, 0],
    alphaOutputs: [0, 0, 1, 0],
  };
  const combined = sample(
    createHaloMaterial(green, null, { ...metadata, stages: [stage] }, { layer1: half }),
  );
  const cached = {
    source: 'halo-model-untextured',
    label: 'cached face',
    positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
    indices: [0, 2, 1],
  };
  const exterior = new THREE.BufferGeometry();
  exterior.setAttribute('position', new THREE.Float32BufferAttribute(cached.positions, 3));
  exterior.setAttribute('normal', new THREE.Float32BufferAttribute(cached.normals, 3));
  exterior.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
  exterior.setAttribute('uv1', exterior.getAttribute('uv'));
  exterior.setIndex(renderIndices(cached));
  const model = sample(createHaloMaterial(green, null, { ...metadata, kind: 'model' }, {}), exterior);
  // A native alpha-blended model decal uses the complete alpha range. Halo
  // disables binary alpha testing even if the not-alpha-tested bit is clear.
  const decalTexture=texture([240,80,16,64]);
  const decal=sample(createHaloMaterial(decalTexture,null,{...metadata,kind:'model',framebufferBlend:0,alphaTest:true,alphaBlended:true,decal:true},{}),exterior);
  const cutout=sample(createHaloMaterial(decalTexture,null,{...metadata,kind:'model',alphaTest:true},{}),exterior);
  decalTexture.dispose();
  const glowMetadata:ShaderPreview={...metadata,kind:'model',selfIllumination:{source:0,function:0,period:2,lower:[0,0,0],upper:[1,.5,.25]}};
  const emissiveMask=texture([0,255,0,0]),noEmissionMask=texture([0,0,0,0]),grey=texture([128,128,128,255]);
  const glowSample=(base:THREE.Texture,mask:THREE.Texture,enabled:boolean)=>{
    const material=createHaloMaterial(base,null,glowMetadata,{multipurpose:mask});material.uniforms.overrideLighting.value=true;material.uniforms.ambientFill.value.set(0,0,0);material.uniforms.sunFill.value.set(0,0,0);material.uniforms.lightDirection.value.set(0,0,1);material.uniforms.enhancedSelfIllum.value=enabled;
    return sample(material,exterior);
  };
  const nativeGlow=glowSample(grey,emissiveMask,false),advancedGlow=glowSample(grey,emissiveMask,true),unmasked=glowSample(grey,noEmissionMask,false),blackGlow=glowSample(black,emissiveMask,false);
  // Constant source colours make the native detail/reflection order observable
  // in real WebGL pixels without a lighting/exposure or texture fallback.
  const cubeFaces=Array.from({length:6},()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const context=canvas.getContext('2d')!;context.fillStyle='rgb(64,64,64)';context.fillRect(0,0,1,1);return canvas;});
  const cube=new THREE.CubeTexture(cubeFaces);cube.colorSpace=THREE.NoColorSpace;cube.needsUpdate=true;
  const diffuse=texture([96,96,96,255]),detail=texture([64,64,64,255]),addDetail=texture([160,160,160,255]);
  const reflection={bitmapTagId:1,perpendicularBrightness:1,parallelBrightness:1,perpendicularTint:[1,1,1] as [number,number,number],parallelTint:[1,1,1] as [number,number,number],falloff:0,cutoff:0};
  const glassAlpha=[0,64,128,255].map(alpha=>{
    const image=texture([240,80,16,alpha]);
    const pixel=sample(createHaloMaterial(image,null,{...metadata,kind:'glass',alphaTest:true,alphaBlended:true,glassTint:[1,1,1],reflection},{reflectionCube:cube}),exterior);
    image.dispose();return pixel;
  });
  const glassTintSamples=[[.5,.25,1],[1,1,1]].map(glassTint=>{
    const image=texture([240,80,16,64]),tintMap=texture([128,64,255,255]);
    const pixel=sample(createHaloMaterialPasses(image,null,{...metadata,kind:'glass',glassTint:glassTint as [number,number,number],reflection},glassTint[0]===1?{reflectionCube:cube,glassTintMap:tintMap}:{reflectionCube:cube}),exterior);
    image.dispose();tintMap.dispose();return pixel;
  });
  const glassNoDiffuse=sample(createHaloMaterialPasses(null,null,{...metadata,kind:'glass',glassDiffuseAbsent:true,glassTint:[.5,.25,1],reflection},{reflectionCube:cube}),exterior);
  const detailOrder=[0,1,2].map(detailFunction=>[false,true].map(detailAfterReflection=>sample(createHaloMaterial(diffuse,half,{...metadata,kind:'model',detailFunction,detailScales:[1,1,1],reflection,detailAfterReflection},{primaryDetail:detailFunction===2?addDetail:detail,reflectionCube:cube}),exterior)));
  const noReflectionDetail=[false,true].map(detailAfterReflection=>sample(createHaloMaterial(diffuse,half,{...metadata,kind:'model',detailFunction:0,detailScales:[1,1,1],detailAfterReflection},{primaryDetail:detail}),exterior));
  const pcMasks=texture([0,0,128,0]),xboxMasks=texture([128,0,0,0]);
  const maskedDetailOrder=[false,true].map(multipurposeXbox=>[false,true].map(detailAfterReflection=>sample(createHaloMaterial(diffuse,half,{...metadata,kind:'model',detailFunction:0,detailMask:2,detailScales:[1,1,1],reflection,detailAfterReflection,multipurposeXbox},{primaryDetail:detail,multipurpose:multipurposeXbox?xboxMasks:pcMasks,reflectionCube:cube}),exterior)));
  // Native flat glass: view-axis cosine squared interpolates endpoint ARGB;
  // reflection RGB interpolates the eighth-power cube and original cube.
  // Keep source reflection energy separate from diffuse/lighting settings.
  const angularFaces=Array.from({length:6},()=>{const c=document.createElement('canvas');c.width=c.height=1;const ctx=c.getContext('2d')!;ctx.fillStyle='rgb(128,128,128)';ctx.fillRect(0,0,1,1);return c;});
  const angularCube=new THREE.CubeTexture(angularFaces);angularCube.colorSpace=THREE.NoColorSpace;angularCube.needsUpdate=true;
  const angularGeometry=exterior.clone();angularGeometry.setAttribute('normal',new THREE.Float32BufferAttribute(Array.from({length:3},()=>[Math.sqrt(.75),0,.5]).flat(),3));
  renderer.setClearColor(0,1);
  const angularReflection={...reflection,perpendicularBrightness:.5,parallelBrightness:1};
  const glassNativeAngular=[[1,1,1],[0,.25,1]].map(tint=>sample(createHaloMaterial(null,null,{...metadata,kind:'glass',glassDiffuseAbsent:true,reflection:{...angularReflection,perpendicularTint:tint as [number,number,number],parallelTint:tint as [number,number,number]}},{reflectionCube:angularCube}),angularGeometry));
  camera.position.z=-2;camera.lookAt(0,0,0);
  const glassNativeBack=sample(createHaloMaterial(null,null,{...metadata,kind:'glass',glassDiffuseAbsent:true,twoSided:true,reflection:angularReflection},{reflectionCube:angularCube}),angularGeometry);
  camera.position.z=2;camera.lookAt(0,0,0);renderer.setClearColor(new THREE.Color(.1,.2,.3),1);angularGeometry.dispose();angularCube.dispose();
  for(const t of[pcMasks,xboxMasks])t.dispose();
  for(const t of[cube,diffuse,detail,addDetail])t.dispose();
  camera.position.z = -2;
  camera.lookAt(0, 0, 0);
  const back = sample(createHaloMaterial(green, null, { ...metadata, kind: 'model' }, {}), exterior);
  exterior.dispose();
  geometry.dispose();
  for (const t of [black, green, red, half,emissiveMask,noEmissionMask,grey]) t.dispose();
  target.dispose();
  renderer.dispose();
  return { neutral, added, alphaAdded, combined, model, decal, cutout, back,nativeGlow,advancedGlow,unmasked,blackGlow, detailOrder,noReflectionDetail,maskedDetailOrder,glassAlpha,glassTintSamples,glassNoDiffuse,glassNativeAngular,glassNativeBack, errors };
}

/** Real shared React/Three components, not a second shader implementation. */
export async function renderComponentGlassChecks(){
  const {createElement}=await import('react');
  const {createRoot,extend}=await import('@react-three/fiber');
  const {default:HaloMesh}=await import('../../../src/components/HaloMesh');
  const {default:BspSurfaces}=await import('../../../src/components/BspSurfaces');
  extend(THREE);
  const canvas=document.querySelector('canvas')!,root=createRoot(canvas),errors:string[]=[];
  let state:import('@react-three/fiber').RootState|undefined;
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=2;
  await root.configure({size:{width:32,height:32,top:0,left:0},dpr:1,camera,frameloop:'never',gl:{antialias:false},onCreated:value=>{
    state=value;value.gl.debug.onShaderError=(gl,_program,vs,fs)=>errors.push(String(gl.getShaderInfoLog(vs)),String(gl.getShaderInfoLog(fs)));
  }});
  const texture=new THREE.DataTexture(new Uint8Array([240,80,16,64]),1,1);texture.userData.sourceEncoded=true;texture.needsUpdate=true;
  const faces=Array.from({length:6},()=>{const c=document.createElement('canvas');c.width=c.height=1;const ctx=c.getContext('2d')!;ctx.fillStyle='rgb(64,64,64)';ctx.fillRect(0,0,1,1);return c;});
  const cube=new THREE.CubeTexture(faces);cube.colorSpace=THREE.NoColorSpace;cube.needsUpdate=true;
  const metadata:ShaderPreview={kind:'glass',twoSided:false,alphaTest:false,alphaBlended:true,uvScale:[1,1],glassTint:[.5,.25,1],reflection:{bitmapTagId:8,perpendicularBrightness:1,parallelBrightness:1,perpendicularTint:[1,1,1],parallelTint:[1,1,1],falloff:0,cutoff:0}};
  const data={source:'halo-model-untextured',label:'native glass component fixture',positions:[-1,-1,0,1,-1,0,1,1,0,-1,1,0],normals:[0,0,1,0,0,1,0,0,1,0,0,1],uvs:[0,0,1,0,1,1,0,1],indices:[0,1,2,0,2,3],materialRanges:[{shaderTagId:7,bspIndex:0,indexStart:0,indexCount:6}]};
  const target=new THREE.WebGLRenderTarget(32,32),pause=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  const read=async(element:ReturnType<typeof createElement>)=>{
    root.render(element);await pause();if(!state)throw Error('Native component renderer did not initialize');
    state.gl.setRenderTarget(target);state.gl.setClearColor(new THREE.Color(.1,.2,.3),1);state.gl.clear();state.gl.render(state.scene,camera);
    const pixel=new Uint8Array(4);state.gl.readRenderTargetPixels(target,16,16,1,1,pixel);
    const mesh=state.scene.children.find(child=>child instanceof THREE.Mesh) as THREE.Mesh|undefined;
    return{pixel:[...pixel],groups:mesh?.geometry.groups.length,geometry:mesh?.geometry.uuid,draws:state.gl.info.render.calls,triangles:state.gl.info.render.triangles};
  };
  const props={data,shaderTextures:{7:texture},shaderMetadata:{7:metadata},extraTextures:{'7:reflectionCube':cube}};
  const model=await read(createElement(HaloMesh,props));
  const completed=await read(createElement(HaloMesh,{...props,shaderTextures:{7:texture}}));
  const neutral=await read(createElement(HaloMesh,{...props,shaderMetadata:{7:{...metadata,glassTint:[1,1,1]}}}));
  const modelGreen=await read(createElement(HaloMesh,{...props,greenScreen:true}));
  const doc={schemaVersion:1,name:'glass regression',template:'fixture',runtimeId:'chupathingy',gameMode:'slayer',skyPath:null,buildQuality:'draft',geometry:[],materials:[{id:'glass',name:'source glass',shaderPath:'fixture/glass',color:[1,1,1]}],placements:[],spawns:[],objectives:[]} as import('../../../src/forge').QuickForgeDocument;
  const bspProps={doc,mesh:{...data,parts:[{brushId:'surface',materialId:'glass',indexStart:0,indexCount:6}]},wire:false,textures:{},views:{glass:{base:texture,metadata,extra:{reflectionCube:cube}}}};
  const bsp=await read(createElement(BspSurfaces,bspProps)),bspGreen=await read(createElement(BspSurfaces,{...bspProps,greenScreen:true}));
  root.unmount();await new Promise(resolve=>setTimeout(resolve,600));target.dispose();texture.dispose();cube.dispose();
  return{model,completed,neutral,modelGreen,bsp,bspGreen,errors};
}
