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
  camera.position.z=2;camera.lookAt(0,0,0);renderer.setClearColor(new THREE.Color(.1,.2,.3),1);angularGeometry.dispose();
  // Native GPU programs evaluate model reflection direction and endpoint ARGB
  // at vertices. A coarse panel deliberately differs from fragment reflection.
  const panel=exterior.clone();panel.setAttribute('normal',new THREE.Float32BufferAttribute(Array.from({length:3},()=>[Math.sqrt(.75),0,.5]).flat(),3));
  const panelReflection={...reflection,perpendicularBrightness:.8,parallelBrightness:.2,perpendicularTint:[1,0,0] as [number,number,number],parallelTint:[0,0,1] as [number,number,number]};
  const vertexTint=sample(createHaloMaterial(black,null,{...metadata,kind:'model',reflection:panelReflection},{reflectionCube:angularCube}),panel);
  const pixelNdc=(16.5/32)*2-1,weights=[(1-pixelNdc)/4-pixelNdc/2,(1-pixelNdc)/4+pixelNdc/2,(1+pixelNdc)/2];
  const eye=[[1,1,2],[-1,1,2],[0,-1,2]],normals=[[Math.sqrt(.75),0,.5],[Math.sqrt(.75),0,.5],[Math.sqrt(.75),0,.5]];
  const facing=eye.map((e,k)=>e.reduce((n,x,i)=>n+x*normals[k][i],0)/Math.hypot(...e));
  const interpolatedFacing=facing.reduce((n,x,k)=>n+x*weights[k],0);
  const vertexTintExpected=[128*interpolatedFacing*(.2+.6*interpolatedFacing),0,128*(1-interpolatedFacing)*(.2+.6*interpolatedFacing),255].map(Math.round);
  camera.position.z=-2;camera.lookAt(0,0,0);
  const vertexBack=sample(createHaloMaterial(black,null,{...metadata,kind:'model',twoSided:true,reflection:panelReflection},{reflectionCube:angularCube}),panel);
  camera.position.z=2;camera.lookAt(0,0,0);
  const localReflection=createHaloMaterial(black,null,{...metadata,kind:'model',reflection:panelReflection},{reflectionCube:angularCube});
  localReflection.uniforms.localObjectLighting.value=true;localReflection.uniforms.localReflectionTint.value.set(3,1,3);localReflection.uniforms.localReflectionBrightness.value=3;
  const vertexSaturated=sample(localReflection,panel);
  const saturate=(n:number)=>Math.min(1,Math.max(0,n));
  const endpoint=facing.map(f=>[saturate(3*f),0,saturate(3*(1-f)),saturate(3*(.2+.6*f))]);
  const interpolated=[0,1,2,3].map(i=>endpoint.reduce((sum,value,k)=>sum+value[i]*weights[k],0));
  const vertexSaturatedExpected=[128*interpolated[0]*interpolated[3],0,128*interpolated[2]*interpolated[3],255].map(Math.round);
  const directionalFaces=[[255,0,0],[0,255,0],[16,240,32],[240,16,32],[0,0,255],[255,255,0]].map(rgb=>{const c=document.createElement('canvas');c.width=c.height=1;const ctx=c.getContext('2d')!;ctx.fillStyle='rgb('+rgb.join(',')+')';ctx.fillRect(0,0,1,1);return c;});
  const directionalCube=new THREE.CubeTexture(directionalFaces);directionalCube.colorSpace=THREE.NoColorSpace;directionalCube.magFilter=THREE.NearestFilter;directionalCube.minFilter=THREE.NearestFilter;directionalCube.generateMipmaps=false;directionalCube.needsUpdate=true;
  panel.setAttribute('normal',new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,1,0],3));
  const vertexDirection=sample(createHaloMaterial(black,null,{...metadata,kind:'model',reflection},{reflectionCube:directionalCube}),panel);
  panel.dispose();directionalCube.dispose();
  angularCube.dispose();
  for(const t of[pcMasks,xboxMasks])t.dispose();
  for(const t of[cube,diffuse,detail,addDetail])t.dispose();
  const meterMetadata:ShaderPreview={...metadata,kind:'meter',meter:{flags:16,gradientMin:[.2,.6,.1],gradientMax:[.8,.1,.2],background:[.05,.1,.15],flash:[.1,.2,.3],tint:[.7,.8,.9],meterTransparency:.25,backgroundTransparency:.75,sources:[0,0,0,0,0]}};
  const meterCases=[
    {blue:32,alpha:255,inputs:[1,0,1,1,1],flags:16},
    {blue:192,alpha:255,inputs:[1,0,.5,1,.5],flags:16},
    {blue:96,alpha:128,inputs:[.5,1,1,1,.4],flags:16},
    {blue:96,alpha:128,inputs:[.5,1,1,1,.4],flags:20},
    {blue:32,alpha:255,inputs:[.5,0,1,1,1],flags:24},
    {blue:192,alpha:255,inputs:[.5,0,.5,1,.5],flags:24},
    {blue:32,alpha:0,inputs:[1,1,1,1,1],flags:16},
  ];
  const meters=meterCases.map(c=>{const t=texture([0,0,c.blue,c.alpha]);const material=createHaloMaterial(t,null,{...meterMetadata,meter:{...meterMetadata.meter!,flags:c.flags},meterInputs:c.inputs as [number,number,number,number,number]},{});const pixel=sample(material);t.dispose();return pixel;});
  camera.position.z = -2;
  camera.lookAt(0, 0, 0);
  const back = sample(createHaloMaterial(green, null, { ...metadata, kind: 'model' }, {}), exterior);
  exterior.dispose();
  geometry.dispose();
  for (const t of [black, green, red, half,emissiveMask,noEmissionMask,grey]) t.dispose();
  target.dispose();
  const reflectionGlError=renderer.getContext().getError();renderer.dispose();
  return { meters,meterCases, neutral, added, alphaAdded, combined, model, decal, cutout, back,nativeGlow,advancedGlow,unmasked,blackGlow, detailOrder,noReflectionDetail,maskedDetailOrder,glassAlpha,glassTintSamples,glassNoDiffuse,glassNativeAngular,glassNativeBack,vertexTint,vertexTintExpected,vertexBack,vertexSaturated,vertexSaturatedExpected,vertexDirection,reflectionGlError, errors };
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
  const data={source:'halo-model-untextured',label:'native glass component fixture',positions:[-1,-1,0,1,-1,0,1,1,0,-1,1,0],normals:[0,0,1,0,0,1,0,0,1,0,0,1],uvs:[0,0,1,0,1,1,0,1],indices:[0,1,2,0,2,3],materialRanges:[{shaderTagId:7,bspIndex:0,lightmapIndex:-1,indexStart:0,indexCount:6}]};
  const target=new THREE.WebGLRenderTarget(32,32),pause=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  const read=async(element:ReturnType<typeof createElement>)=>{
    root.render(element);await pause();if(!state)throw Error('Native component renderer did not initialize');
    state.gl.setRenderTarget(target);state.gl.setClearColor(new THREE.Color(.1,.2,.3),1);state.gl.clear();
    // Independently sample the untouched framebuffer on this GPU. A transparent
    // native meter must preserve those exact bytes, including UNORM rounding.
    const clearPixel=new Uint8Array(4);state.gl.readRenderTargetPixels(target,16,16,1,1,clearPixel);
    state.gl.render(state.scene,camera);
    const pixel=new Uint8Array(4);state.gl.readRenderTargetPixels(target,16,16,1,1,pixel);
    const mesh=state.scene.children.find(child=>child instanceof THREE.Mesh) as THREE.Mesh|undefined;
    return{pixel:[...pixel],clearPixel:[...clearPixel],groups:mesh?.geometry.groups.length,geometry:mesh?.geometry.uuid,draws:state.gl.info.render.calls,triangles:state.gl.info.render.triangles};
  };
  const props={data,shaderTextures:{7:texture},shaderMetadata:{7:metadata},extraTextures:{'7:reflectionCube':cube}};
  const model=await read(createElement(HaloMesh,props));
  const completed=await read(createElement(HaloMesh,{...props,shaderTextures:{7:texture}}));
  const neutral=await read(createElement(HaloMesh,{...props,shaderMetadata:{7:{...metadata,glassTint:[1,1,1]}}}));
  const modelGreen=await read(createElement(HaloMesh,{...props,greenScreen:true}));
  const doc={schemaVersion:1,name:'glass regression',template:'fixture',runtimeId:'chupathingy',gameMode:'slayer',skyPath:null,buildQuality:'draft',geometry:[],materials:[{id:'glass',name:'source glass',shaderPath:'fixture/glass',color:[1,1,1]}],placements:[],spawns:[],objectives:[]} as import('../../../src/forge').QuickForgeDocument;
  const bspProps={doc,mesh:{...data,parts:[{brushId:'surface',materialId:'glass',indexStart:0,indexCount:6}]},wire:false,textures:{},views:{glass:{base:texture,metadata,extra:{reflectionCube:cube}}}};
  const bsp=await read(createElement(BspSurfaces,bspProps)),bspGreen=await read(createElement(BspSurfaces,{...bspProps,greenScreen:true}));
  const dial=new THREE.DataTexture(new Uint8Array([0,0,32,255]),1,1);dial.userData.sourceEncoded=true;dial.magFilter=THREE.LinearFilter;dial.generateMipmaps=false;dial.needsUpdate=true;
  const meter:ShaderPreview={kind:'meter',twoSided:false,alphaTest:false,uvScale:[1,1],meter:{flags:17,gradientMin:[.2,.6,.1],gradientMax:[.8,.1,.2],background:[0,0,0],flash:[0,0,0],tint:[1,1,1],meterTransparency:0,backgroundTransparency:0,sources:[0,0,3,0,3]}};
  const meterData={...data,stationaryFunctionValues:[null,null,0,null] as [null,null,number|null,null]};
  const meterProps={data:meterData,shaderTextures:{7:dial},shaderMetadata:{7:meter}};
  const meterEmpty=await read(createElement(HaloMesh,meterProps));
  const meterFilled=await read(createElement(HaloMesh,{...meterProps,data:{...meterData,stationaryFunctionValues:[null,null,1,null]}}));
  const meterMesh=state!.scene.children.find(child=>child instanceof THREE.Mesh) as THREE.Mesh;
  const mat=(meterMesh.material as THREE.Material[]).find(material=>material.userData.haloMeter) as THREE.ShaderMaterial;
  const meterState={inputs:mat.userData.haloMeter.inputs,scope:mat.userData.haloMeter.scope,samplerOwned:mat.uniforms.baseMap.value!==dial,nearest:mat.uniforms.baseMap.value.magFilter===THREE.NearestFilter,originalUnchanged:dial.magFilter===THREE.LinearFilter&&!dial.generateMipmaps};
  let disposedSampler=false;mat.uniforms.baseMap.value.addEventListener('dispose',()=>{disposedSampler=true;});
  const meterUnknown=await read(createElement(HaloMesh,{...meterProps,data:{...meterData,stationaryFunctionValues:[null,null,null,null]}}));
  const unknownMesh=state!.scene.children.find(child=>child instanceof THREE.Mesh) as THREE.Mesh;
  const unknownMaps=(unknownMesh.material as THREE.MeshStandardMaterial[]).filter(material=>material.map===dial).length;
  root.unmount();await new Promise(resolve=>setTimeout(resolve,600));target.dispose();texture.dispose();cube.dispose();dial.dispose();
  return{model,completed,neutral,modelGreen,bsp,bspGreen,meterEmpty,meterFilled,meterUnknown,meterState,disposedSampler,unknownMaps,errors};
}

/** The World object and baked BSP must share material math without sharing light ownership. */
export async function renderObjectLightingChecks(){
  const {createElement,Fragment}=await import('react');const {createRoot,extend}=await import('@react-three/fiber');
  const {default:HaloMesh}=await import('../../../src/components/HaloMesh');const {default:SceneEnvironment}=await import('../../../src/components/SceneEnvironment');
  const {DEFAULT_ENVIRONMENT}=await import('../../../src/environment');extend(THREE);
  const canvas=document.querySelector('canvas')!,root=createRoot(canvas),errors:string[]=[];let state:import('@react-three/fiber').RootState|undefined;
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=2;
  await root.configure({size:{width:32,height:32,top:0,left:0},dpr:1,camera,frameloop:'never',gl:{antialias:false},onCreated:s=>{state=s;s.gl.debug.onShaderError=(gl,_p,vs,fs)=>errors.push(String(gl.getShaderInfoLog(vs)),String(gl.getShaderInfoLog(fs)));}});
  const base=new THREE.DataTexture(new Uint8Array([128,128,128,255]),1,1);base.userData.sourceEncoded=true;base.needsUpdate=true;
  const light=base.clone();light.needsUpdate=true;
  const faces=Array.from({length:6},()=>{const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d')!;x.fillStyle='rgb(64,64,64)';x.fillRect(0,0,1,1);return c;});
  const cube=new THREE.CubeTexture(faces);cube.colorSpace=THREE.NoColorSpace;cube.needsUpdate=true;
  const data={source:'halo-model-untextured',label:'light ownership',positions:[-1,-1,0,1,-1,0,1,1,0,-1,1,0],normals:[0,0,1,0,0,1,0,0,1,0,0,1],uvs:[0,0,1,0,1,1,0,1],lightmapUvs:[0,0,1,0,1,1,0,1],indices:[0,1,2,0,2,3],materialRanges:[{shaderTagId:7,bspIndex:0,lightmapPage:0,hasLightmapUvs:true,indexStart:0,indexCount:6}]};
  const reflection={bitmapTagId:8,perpendicularBrightness:.5,parallelBrightness:.5,perpendicularTint:[1,1,1] as [number,number,number],parallelTint:[1,1,1] as [number,number,number],falloff:0,cutoff:0};
  const metadata:ShaderPreview={kind:'model',twoSided:false,alphaTest:false,uvScale:[1,1],reflection};
  const value={...DEFAULT_ENVIRONMENT,ambientColor:[1,1,1] as [number,number,number],ambientIntensity:.25,sunIntensity:0,fogEnabled:false};
  const target=new THREE.WebGLRenderTarget(32,32),pause=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  async function read(sourceObject:boolean,sourceObjectLighting:boolean,baked=false,overrideLighting=false,greenScreen=false,localLighting?:import('../../../src/haloLightmap').SourceObjectLighting){
    root.render(createElement(Fragment,null,createElement(SceneEnvironment,{value,sourceObjectLighting,overrideLighting}),createElement(HaloMesh,{data,sourceObject,greenScreen,localLighting,shaderTextures:{7:base},shaderMetadata:{7:baked?{...metadata,kind:'environment'}:metadata},lightmapTextures:baked?{'bsp0:page0':light}:{},extraTextures:{'7:reflectionCube':cube}})));await pause();if(!state)throw Error('Object-lighting renderer did not initialize');
    state.gl.setRenderTarget(target);state.gl.clear();state.gl.render(state.scene,camera);const pixel=new Uint8Array(4);state.gl.readRenderTargetPixels(target,16,16,1,1,pixel);
    const mesh=state.scene.children.find(o=>o instanceof THREE.Mesh) as THREE.Mesh;return{pixel:[...pixel],geometry:mesh.geometry.uuid,draws:state.gl.info.render.calls,triangles:state.gl.info.render.triangles};
  }
  const object=await read(true,true),unavailable=await read(true,false),baked=await read(false,true,true),bakedObject=await read(true,true,true),override=await read(false,false,true,true),green=await read(true,true,false,false,true);
  const localLighting:import('../../../src/haloLightmap').SourceObjectLighting={point:[0,0,0],ambient:[.11,.19,.27],primary:[.2,.4,.6],primaryDirection:[0,0,1],bounce:[.0363,.0726,.1089],bounceDirection:[0,0,-1],reflection:[.52,1,1],reflectionBrightness:.7945};
  const localBaseline=await read(true,true);
  const localZero=await read(true,true,false,false,false,{...localLighting,primaryDirection:[0,0,0]});
  const local=await read(true,true,false,false,false,localLighting),localNoSky=await read(true,false,false,false,false,localLighting),localOverride=await read(true,true,false,true,false,localLighting),localBaked=await read(true,true,true,false,false,localLighting),localNonObject=await read(false,true,false,false,false,localLighting),localGreen=await read(true,true,false,false,true,localLighting),beforeRemove=await read(true,true,false,false,false,localLighting),removed=await read(true,true);
  // Native diffuse illumination saturates before texture multiplication;
  // reflection remains a later, independent source contribution.
  const brightLighting={...localLighting,ambient:[.4,.5,.6] as [number,number,number],primary:[.8,.2,.8] as [number,number,number],reflection:[1,1,1] as [number,number,number],reflectionBrightness:1};
  const localBright=await read(true,true,false,false,false,brightLighting);
  value.ambientIntensity=2;const artistHdr=await read(true,true,false,true,false,brightLighting);value.ambientIntensity=.25;
  const glError=state!.gl.getContext().getError();
  root.unmount();await new Promise(r=>setTimeout(r,600));for(const t of[base,light,cube])t.dispose();target.dispose();return{object,unavailable,baked,bakedObject,override,green,localBaseline,localZero,local,localNoSky,localOverride,localBaked,localNonObject,localGreen,beforeRemove,removed,localBright,artistHdr,glError,errors};
}

/** Distinct authored levels must survive GPU upload; averaging level zero
 * cannot reproduce the deliberately different lower-level colour. */
export async function renderAuthoredMipChecks() {
  const {configureSourceTexture}=await import('../../../src/sourceTexture');
  const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas')!,antialias:false});renderer.setSize(8,8);
  const errors:string[]=[];renderer.debug.onShaderError=(_gl,_program,vs,fs)=>errors.push(String(_gl.getShaderInfoLog(vs)),String(_gl.getShaderInfoLog(fs)));
  const rgba=(size:number,c:number[])=>({width:size,height:size,pixels:Uint8Array.from(Array.from({length:size*size},()=>c).flat()),format:'BGRA8' as const});
  const levels=[rgba(4,[240,16,32,255]),rgba(2,[24,208,56,255])];
  const texture=new THREE.DataTexture(levels[0].pixels,4,4,THREE.RGBAFormat);
  configureSourceTexture(texture,'shader',levels);
  const target=new THREE.WebGLRenderTarget(8,8),scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=2;
  const geometry=new THREE.PlaneGeometry(2,2),material=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,uniforms:{source:{value:texture},level:{value:1}},vertexShader:'out vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'precision highp float;uniform sampler2D source;uniform float level;in vec2 v;out vec4 pixel;void main(){pixel=textureLod(source,v,level);}'});
  scene.add(new THREE.Mesh(geometry,material));renderer.setRenderTarget(target);
  const sample=(level:number)=>{material.uniforms.level.value=level;renderer.render(scene,camera);const pixel=new Uint8Array(4);renderer.readRenderTargetPixels(target,4,4,1,1,pixel);return [...pixel];};
  const base=sample(0),authored=sample(1),last=sample(8),glError=renderer.getContext().getError();
  const state={base,authored,last,glError,generated:texture.generateMipmaps,levels:texture.mipmaps.length,errors};
  texture.dispose();material.dispose();geometry.dispose();target.dispose();renderer.dispose();return state;
}

/** Exercise the real native cube decoder/uploader, including original RGB beneath alpha. */
export async function renderAuthoredCubeChecks(){
 const {decodeReflectionCube,createDecodedReflectionCubeTexture}=await import('../../../src/ownedReflectionCube');
 const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas')!,antialias:false});renderer.setSize(8,8);
 const errors:string[]=[];renderer.debug.onShaderError=(gl,_program,vs,fs)=>errors.push(String(gl.getShaderInfoLog(vs)),String(gl.getShaderInfoLog(fs)));
 const source='a'.repeat(64);
 function face(size:number,colour:number[],mipLevel:number,mipLevels:number){
  const bytes=new Uint8Array(128+size*size*4),v=new DataView(bytes.buffer);bytes.set([68,68,83,32]);for(const[at,n]of[[4,124],[12,size],[16,size],[20,size*4],[76,32],[80,0x41],[88,32],[92,0xff0000],[96,0xff00],[100,0xff],[104,0xff000000]])v.setUint32(at,n,true);
  bytes.set(Array.from({length:size*size},()=>[colour[2],colour[1],colour[0],colour[3]]).flat(),128);
  return{bitmapTagId:7,imageIndex:0,mipLevel,mipLevels,nativeMipmaps:mipLevels-1,width:size,height:size,format:'BGRA8',sourceSha256:source,sourceKind:'internal-cache' as const,ddsBase64:btoa(String.fromCharCode(...bytes))};
 }
 const response={sourceSha256:source,bitmapTagId:7,resourceSha256:null,faces:Array.from({length:6},()=>face(4,[240,16,32,255],0,2)),mipFaces:[Array.from({length:6},()=>face(2,[24,208,56,255],1,2))]};
 const texture=createDecodedReflectionCubeTexture(decodeReflectionCube(response,source,7,{}),7);
 const transparent={...response,faces:Array.from({length:6},()=>face(1,[80,160,224,0],0,1)),mipFaces:[]};
 const alpha=createDecodedReflectionCubeTexture(decodeReflectionCube(transparent,source,7,{}),7);
 const target=new THREE.WebGLRenderTarget(8,8),scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=2;
 const geometry=new THREE.PlaneGeometry(2,2),material=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,uniforms:{source:{value:texture},level:{value:0}},vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'precision highp float;uniform samplerCube source;uniform float level;out vec4 pixel;void main(){pixel=vec4(textureLod(source,vec3(1.,0.,0.),level).rgb,1.);}'});
 scene.add(new THREE.Mesh(geometry,material));renderer.setRenderTarget(target);
 const sample=(cube:THREE.CubeTexture,level:number)=>{material.uniforms.source.value=cube;material.uniforms.level.value=level;renderer.render(scene,camera);const pixel=new Uint8Array(4);renderer.readRenderTargetPixels(target,4,4,1,1,pixel);return[...pixel];};
 const result={base:sample(texture,0),authored:sample(texture,1),last:sample(texture,8),transparent:sample(alpha,0),generated:texture.generateMipmaps,levels:texture.userData.originalMipLevels,glError:renderer.getContext().getError(),errors};
 texture.dispose();alpha.dispose();material.dispose();geometry.dispose();target.dispose();renderer.dispose();return result;
}

/** Real shared-component silhouette projection, texture cutouts and ownership. */
export async function renderNativeShadowChecks(){
 const {createElement,Fragment}=await import('react'),{createRoot,extend}=await import('@react-three/fiber');
 const {default:HaloMesh}=await import('../../../src/components/HaloMesh'),{NativeShadowPass}=await import('../../../src/haloObjectShadows');extend(THREE);
 const canvas=document.querySelector('canvas')!,root=createRoot(canvas),errors:string[]=[];let state:import('@react-three/fiber').RootState|undefined;
 const camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,20);camera.position.set(0,-5,5);camera.up.set(0,0,1);camera.lookAt(0,0,0);camera.updateMatrixWorld();(camera as THREE.OrthographicCamera&{manual:boolean}).manual=true;
 await root.configure({size:{width:128,height:128,top:0,left:0},dpr:1,camera,frameloop:'never',gl:{antialias:false},onCreated:s=>{state=s;s.gl.debug.onShaderError=(gl,_p,vs,fs)=>errors.push(String(gl.getShaderInfoLog(vs)),String(gl.getShaderInfoLog(fs)));}});
 const base=new THREE.DataTexture(new Uint8Array([200,150,100,255]),1,1);base.userData.sourceEncoded=true;base.needsUpdate=true;
 const transparent=new THREE.DataTexture(new Uint8Array([200,150,100,0]),1,1);transparent.userData.sourceEncoded=true;transparent.needsUpdate=true;
 const terrain:import('../../../src/types').MeshData={label:'original floor',source:'halo-bsp-render',positions:[-3,-3,0,3,-3,0,3,3,0,-3,3,0],normals:[0,0,1,0,0,1,0,0,1,0,0,1],uvs:[0,0,1,0,1,1,0,1],indices:[0,1,2,0,2,3],materialRanges:[{shaderTagId:7,bspIndex:0,lightmapIndex:-1,indexStart:0,indexCount:6}]};
 const object={...terrain,label:'source silhouette',positions:[-.35,-.35,1,.35,-.35,1,.35,.35,1,-.35,.35,1],rig:{checksum:1,nodes:[{name:'root',parent:-1,position:[0,0,0] as [number,number,number],rotation:[0,0,0,1] as [number,number,number,number]}],indices:[],weights:[]},objectLighting:{tagClass:'vehi',offset:[0,0,1] as [number,number,number],radius:2,brighten:false,castsShadow:true}};
 const light:import('../../../src/haloLightmap').SourceObjectLighting={point:[0,0,0],ambient:[1,1,1],primary:[0,0,0],primaryDirection:[0,0,1],bounce:[0,0,0],bounceDirection:[0,0,-1],reflection:[1,1,1],reflectionBrightness:1,shadow:{direction:[.6,0,-.8],tint:[.2,.4,.6]}};
 const target=new THREE.WebGLRenderTarget(128,128),pause=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
 async function mount(flags:{casts?:boolean|null;cutout?:boolean;clear?:boolean;green?:boolean}={}){
  root.render(createElement(Fragment,null,createElement(HaloMesh,{data:terrain,shaderTextures:{7:base},shaderMetadata:{7:{kind:'environment',twoSided:true,alphaTest:false,uvScale:[1,1]}}}),createElement(HaloMesh,{data:{...object,objectLighting:{...object.objectLighting,castsShadow:flags.casts===null?undefined:flags.casts??true}},localLighting:light,sourceObject:true,greenScreen:flags.green,shaderTextures:{7:flags.clear?transparent:base},shaderMetadata:{7:{kind:'model',twoSided:true,alphaTest:!!flags.cutout,uvScale:[1,1]}}})));await pause();if(!state)throw Error('Shared shadow components did not initialize');const node=state.scene.children.find(o=>o.userData.haloNativeShadow);if(node){node.position.set(0,0,0);node.visible=true;}
 }
 await mount();const live=state!,pass=new NativeShadowPass(live.scene);
 const read=(enabled=true,point:[number,number,number]=[.75,0,0])=>{live.gl.setRenderTarget(target);pass.update(live.gl,camera,terrain,enabled);live.gl.clear();live.gl.render(live.scene,camera);const p=new THREE.Vector3(...point).project(camera),pixel=new Uint8Array(4);live.gl.readRenderTargetPixels(target,Math.floor((p.x*.5+.5)*128),Math.floor((p.y*.5+.5)*128),1,1,pixel);const entry=[...(pass as unknown as {entries:Map<string,{target:THREE.WebGLRenderTarget;proxy:THREE.Mesh;camera:THREE.Camera;surface:THREE.Mesh}>}).entries.values()][0],mask=new Uint8Array(4);const uv=entry?new THREE.Vector4(...point,1).applyMatrix4((entry.surface.material as THREE.ShaderMaterial).uniforms.projection.value):null;if(entry&&uv)live.gl.readRenderTargetPixels(entry.target,Math.floor((uv.x*.5+.5)*128),Math.floor((uv.y*.5+.5)*128),1,1,mask);return {uv:uv?.toArray(),draws:live.gl.info.render.calls,receiverVisible:entry?.surface.visible,pixel:[...pixel],mask:[...mask],...pass.stats,targetRestored:live.gl.getRenderTarget()===target,groups:entry?.proxy.geometry.groups,castEnabled:entry&&((entry.proxy.material as THREE.ShaderMaterial[]).map(m=>m.uniforms.enabled.value))};};
 const before=read(false),shadow=read(),cached=read(),paused=read(false),outside=read(true,[1.75,0,0]);
 const mesh=live.scene.children.find(o=>o.userData.haloNativeShadow) as THREE.Mesh;mesh.position.x=1;
 const moved=read(true,[1.75,0,0]),oldPosition=read(),hidden=(()=>{mesh.visible=false;return read();})();
 mesh.visible=true;await mount({casts:false});const disabled=read();await mount({casts:null});const oldMetadata=read();
 await mount({cutout:true,clear:true});const cutout=read();await mount({cutout:false,clear:true});const opaque=read();
 await mount({green:true});const green=read();
 await mount();const original=live.scene.children.find(o=>o.userData.haloNativeShadow) as THREE.Mesh,copies:THREE.Mesh[]=[];for(let i=0;i<12;i++){const copy=original.clone();copy.position.x=(i-6)*.05;copy.userData.haloNativeShadow=original.userData.haloNativeShadow;live.scene.add(copy);copies.push(copy);}const bounded=read();copies.forEach(copy=>live.scene.remove(copy));const retained=read();
 // Recreate actual driver-owned targets after WebGL context restoration;
 // retaining their JS objects cannot retain their lost GPU contents.
 const lost=new Promise<void>(resolve=>canvas.addEventListener('webglcontextlost',()=>resolve(),{once:true}));live.gl.forceContextLoss();await lost;await pause();
 const restored=new Promise<void>(resolve=>canvas.addEventListener('webglcontextrestored',()=>resolve(),{once:true}));live.gl.forceContextRestore();await restored;await pause();const contextRestored=read();
 pass.dispose();const disposedReceivers=live.scene.children.filter(o=>o.userData.haloShadowReceiver).length;
 const glError=live.gl.getContext().getError();root.unmount();await new Promise(r=>setTimeout(r,600));target.dispose();base.dispose();transparent.dispose();
 return {before,shadow,cached,paused,outside,moved,oldPosition,hidden,disabled,oldMetadata,cutout,opaque,green,bounded,retained,contextRestored,disposedReceivers,glError,errors};
}
