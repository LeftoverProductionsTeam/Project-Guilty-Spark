/** Shared-renderer GPU DIRECT-LIGHT DRAFT, not a native Halo lightmap writer.
 * Uses existing BSP lightmap UVs. No re-unwrapping, source mutation, alternate
 * renderer, fallback material, indirect light, emissive transport or object shadows.
 * Native encoding/chart padding/mips/readback remain separate acceptance gates.
 */
import * as THREE from 'three';
import type {MeshData, ShaderPreview, Vec3} from './types';
import {lightmapPageKey} from './haloLightmap';

export interface GpuLightmapRequest {
  sourceSha256:string;
  bspIndex:number;
  page:number;
  size:256|512|1024;
  /** Explicit LINEAR colors and relative powers; not native radiosity units. */
  ambient:Vec3;
  sunlight:Vec3;
  directionToSun:Vec3;
  signal:AbortSignal;
  /** Existing viewport budget admission. Held until the caller releases output. */
  reserveBytes:(bytes:number)=>()=>void;
  progress?:(stage:string)=>void;
}
export interface GpuLightmapDraft {
  sourceSha256:string;
  key:string;
  size:number;
  pixels:Float32Array;
  coveredTexels:number;
  triangles:number;
  release:()=>void;
}

/** An ordinary image for the matching BSP page in Aether. The GPU returns
 * bottom-up rows, so the TGA specifies that origin and can keep the row order.
 * Lighting is mapped to linear 8-bit channels without display tone mapping. */
export function encodeAetherLightmapPage(draft: Pick<GpuLightmapDraft,'size'|'pixels'>): Uint8Array<ArrayBuffer> {
  const {size,pixels}=draft;
  if (![256,512,1024].includes(size) || pixels.length!==size*size*4) {
    throw Error('Choose a baked GPU lightmap page.');
  }
  const output=new Uint8Array(18+size*size*3);
  const header=new DataView(output.buffer);
  output[2]=2;
  header.setUint16(12,size,true);
  header.setUint16(14,size,true);
  output[16]=24;
  const coverage=new Uint8Array(size*size);
  const encode=(channel:number)=>Math.round(Math.min(1,Math.max(0,channel))*255);
  for(let i=0;i<coverage.length;i++){
    const p=i*4;
    if(!Number.isFinite(pixels[p+3]))throw Error('Lightmap coverage is invalid.');
    if(pixels[p+3]<=0.5)continue;
    if(!pixels.subarray(p,p+3).every(Number.isFinite))throw Error('Lightmap color is invalid.');
    coverage[i]=1;
    output[18+i*3]=encode(pixels[p+2]);
    output[19+i*3]=encode(pixels[p+1]);
    output[20+i*3]=encode(pixels[p]);
  }
  if(!coverage.includes(1))throw Error('This lightmap page has no covered texels.');
  // Extend colors two texels for bilinear filtering. Bake values and original
  // chart coordinates stay intact, and every step reads only the previous ring.
  for(let ring=1;ring<=2;ring++){
    for(let i=0;i<coverage.length;i++){
      if(coverage[i])continue;
      const x=i%size;
      const adjacent=[i-size,i+size,x>0?i-1:-1,x+1<size?i+1:-1];
      const source=adjacent.find(j=>coverage[j]>0 && coverage[j]<=ring);
      if(source===undefined)continue;
      coverage[i]=ring+1;
      const at=18+source*3;
      output.copyWithin(18+i*3,at,at+3);
    }
  }
  return output;
}

const uvVertex=[
  'precision highp float;',
  'in vec3 position; in vec3 normal; in vec2 lightmapUv;',
  'out vec3 worldPoint; out vec3 worldNormal;',
  'void main(){ worldPoint=position; worldNormal=normal;',
  'gl_Position=vec4(lightmapUv*2.0-1.0,0.0,1.0); }',
].join('\n');
const shadowVertex=[
  'precision highp float; in vec3 position;',
  'uniform mat4 projectionMatrix; uniform mat4 modelViewMatrix;',
  'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
].join('\n');
const shadowFragment=[
  'precision highp float; out vec4 result;',
  'void main(){ result=vec4(gl_FragCoord.z,0.0,0.0,1.0); }',
].join('\n');
const lightFragment=[
  'precision highp float;',
  'in vec3 worldPoint; in vec3 worldNormal; out vec4 result;',
  'uniform mat4 shadowMatrix; uniform sampler2D depthPage;',
  'uniform vec3 sunDirection; uniform vec3 ambient; uniform vec3 sunlight;',
  'uniform float shadowTexel; uniform float normalBias;',
  'void main(){ vec3 n=normalize(worldNormal);',
  'vec4 clip=shadowMatrix*vec4(worldPoint+n*normalBias,1.0);',
  'vec3 p=clip.xyz/clip.w*0.5+0.5;',
  'float visibility=0.0;',
  'for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){',
  'vec2 uv=clamp(p.xy+vec2(float(x),float(y))*shadowTexel,vec2(0.0),vec2(1.0));',
  'visibility+=p.z<=texture(depthPage,uv).r+0.00001?1.0:0.0; }',
  'result=vec4(ambient+sunlight*max(dot(n,sunDirection),0.0)*(visibility/9.0),1.0); }',
].join('\n');

function cancelled(request:GpuLightmapRequest,renderer:THREE.WebGLRenderer) {
  request.signal.throwIfAborted();
  if(renderer.getContext().isContextLost())throw Error('GPU draft stopped: the viewport context was lost.');
}

/** Each slice restores the existing renderer BEFORE yielding back to its canvas. */
function isolated<T>(renderer:THREE.WebGLRenderer,run:()=>T):T {
  const target=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel();
  const viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4());
  const scissorTest=renderer.getScissorTest(),clear=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();
  const auto=renderer.autoClear,xr=renderer.xr.enabled;
  const checking=renderer.debug.checkShaderErrors,callback=renderer.debug.onShaderError;
  let shaderError=false;
  try {
    renderer.autoClear=false;renderer.xr.enabled=false;renderer.setScissorTest(false);
    renderer.debug.checkShaderErrors=true;
    renderer.debug.onShaderError=()=>{shaderError=true;};
    const result=run();
    if(shaderError)throw Error('GPU draft shader compilation failed; no draft was adopted.');
    return result;
  } finally {
    renderer.debug.checkShaderErrors=checking;renderer.debug.onShaderError=callback;
    renderer.autoClear=auto;renderer.xr.enabled=xr;
    renderer.setRenderTarget(target,face,mip);renderer.setViewport(viewport);
    renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);renderer.setClearColor(clear,alpha);
  }
}
const yieldUi=()=>new Promise<void>(resolve=>setTimeout(resolve,0));

export async function bakeGpuLightmapDraft(
  renderer:THREE.WebGLRenderer,mesh:MeshData,shaders:Readonly<Record<number,ShaderPreview>>,
  request:GpuLightmapRequest,
):Promise<GpuLightmapDraft> {
  cancelled(request,renderer);
  const key=lightmapPageKey(request.bspIndex,request.page);
  if(!/^[a-f0-9]{64}$/i.test(request.sourceSha256))throw Error('A verified source SHA-256 is required.');
  if(![256,512,1024].includes(request.size))throw Error('Choose a supported draft resolution.');
  if(!renderer.capabilities.isWebGL2||!renderer.extensions.has('EXT_color_buffer_float')||
      !renderer.extensions.has('EXT_float_blend')||!renderer.capabilities.textureTypeReadable(THREE.FloatType))
    throw Error('This viewport needs WebGL2 with readable, blendable floating-point targets.');
  if(renderer.capabilities.reversedDepthBuffer)throw Error('Reversed-depth draft baking is not supported.');
  for(const color of [request.ambient,request.sunlight])if(color.length!==3||color.some(v=>!Number.isFinite(v)||v<0||v>50))
    throw Error('GPU lighting requires finite nonnegative linear channels up to 50.');
  if(request.directionToSun.length!==3||request.directionToSun.some(v=>!Number.isFinite(v))||
      Math.hypot(...request.directionToSun)<0.001)throw Error('A finite sun direction is required.');

  const vertices=mesh.positions.length/3,ranges=mesh.materialRanges?.filter(r=>r.bspIndex===request.bspIndex)??[];
  const receivers=ranges.filter(r=>r.lightmapPage===request.page);
  if(!Number.isSafeInteger(vertices)||vertices<3||!mesh.normals||mesh.normals.length!==mesh.positions.length||
      !mesh.lightmapUvs||mesh.lightmapUvs.length!==vertices*2||!receivers.length)
    throw Error('This BSP page needs real positions, normals and native lightmap UVs.');
  const shadowSize=1024;
  if(Math.max(shadowSize,request.size)>renderer.capabilities.maxTextureSize)throw Error('Draft target exceeds this GPU texture limit.');
  // Conservative transient+retained payload estimate: CPU/GPU geometry, two GPU
  // targets, depth, tiled readback, float result and a display image. No disk cache.
  const bytes=mesh.positions.length*8*2+mesh.lightmapUvs.length*8+mesh.indices.length*16+
    request.size**2*56+shadowSize**2*24+Math.max(request.size,shadowSize)*32*16;
  if(!Number.isSafeInteger(bytes))throw Error('Invalid draft allocation size.');
  const releaseReservation=request.reserveBytes(bytes);
  let released=false;
  const release=()=>{if(!released){released=true;releaseReservation();}};
  const geometry=new THREE.BufferGeometry();
  let pageTarget:THREE.WebGLRenderTarget|undefined,shadowTarget:THREE.WebGLRenderTarget|undefined;
  const materials:THREE.RawShaderMaterial[]=[];
  let accepted=false;
  try {
    const sorted=[...ranges].sort((a,b)=>a.indexStart-b.indexStart);
    let end=-1;
    const selectedIndices:number[]=[];
    const pageGroups:{start:number;count:number}[]=[];
    const box=new THREE.Box3();
    for(const range of sorted) {
      if(!Number.isSafeInteger(range.indexStart)||!Number.isSafeInteger(range.indexCount)||range.indexStart<0||
          range.indexStart%3||range.indexCount<=0||range.indexCount%3||
          range.indexStart+range.indexCount>mesh.indices.length||range.indexStart<end)
        throw Error('Invalid or overlapping BSP material index ranges.');
      end=range.indexStart+range.indexCount;
      const shader=shaders[range.shaderTagId];
      if(!shader||shader.kind!=='environment'||shader.alphaTest||shader.alphaBlended||shader.decal)
        throw Error('GPU draft requires opaque environment materials: unsupported shader #'+range.shaderTagId+'. Use the native baker for this BSP.');
      const receiver=range.lightmapPage===request.page;
      if(receiver&&range.hasLightmapUvs!==true)throw Error('A page material has no verified secondary UVs.');
      const start=selectedIndices.length;
      for(let i=range.indexStart;i<end;i++) {
        const vertex=mesh.indices[i];
        if(!Number.isSafeInteger(vertex)||vertex<0||vertex>=vertices)throw Error('BSP vertex reference is outside the source buffer.');
        const p=vertex*3,x=mesh.positions[p],y=mesh.positions[p+1],z=mesh.positions[p+2];
        const nx=mesh.normals[p],ny=mesh.normals[p+1],nz=mesh.normals[p+2];
        if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z)||Math.max(Math.abs(x),Math.abs(y),Math.abs(z))>1e6||
            !Number.isFinite(nx)||!Number.isFinite(ny)||!Number.isFinite(nz)||Math.hypot(nx,ny,nz)<0.001)
          throw Error('Invalid native position or normal.');
        box.min.set(Math.min(box.min.x,x),Math.min(box.min.y,y),Math.min(box.min.z,z));
        box.max.set(Math.max(box.max.x,x),Math.max(box.max.y,y),Math.max(box.max.z,z));
        if((i-range.indexStart)%32766===0){cancelled(request,renderer);await yieldUi();}
        if(receiver) {
          const u=mesh.lightmapUvs[vertex*2],v=mesh.lightmapUvs[vertex*2+1];
          if(!Number.isFinite(u)||!Number.isFinite(v)||u<0||u>1||v<0||v>1)
            throw Error('Native page UVs must be finite and inside the page.');
        }
        selectedIndices.push(vertex);
      }
      if(receiver)pageGroups.push({start,count:range.indexCount});
    }
    const positions=new Float32Array(mesh.positions),normals=new Float32Array(mesh.normals),uvs=new Float32Array(mesh.lightmapUvs);
    for(const group of pageGroups)for(let i=group.start;i<group.start+group.count;i+=3) {
      const a=selectedIndices[i]*2,b=selectedIndices[i+1]*2,c=selectedIndices[i+2]*2;
      if(Math.abs((uvs[b]-uvs[a])*(uvs[c+1]-uvs[a+1])-(uvs[b+1]-uvs[a+1])*(uvs[c]-uvs[a]))<1e-12)
        throw Error('Degenerate native lightmap UV triangle; repair the atlas before baking.');
    }
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
    geometry.setAttribute('lightmapUv',new THREE.BufferAttribute(uvs,2));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(selectedIndices),1));
    const sphere=box.getBoundingSphere(new THREE.Sphere()),radius=sphere.radius*1.02;
    if(!Number.isFinite(radius)||radius<0.001)throw Error('BSP bounds cannot frame the lighting pass.');
    const direction=new THREE.Vector3(...request.directionToSun).normalize();
    const camera=new THREE.OrthographicCamera(-radius,radius,radius,-radius,Math.max(radius/4096,0.0001),radius*4);
    camera.up.set(Math.abs(direction.z)>0.99?1:0,0,Math.abs(direction.z)>0.99?0:1);
    camera.position.copy(sphere.center).addScaledVector(direction,radius*2);
    camera.lookAt(sphere.center);camera.updateMatrixWorld();camera.updateProjectionMatrix();
    const shadowMatrix=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    const makeMaterial=(vertexShader:string,fragmentShader:string,extra:THREE.ShaderMaterialParameters={})=>{
      const material=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader,fragmentShader,
        side:THREE.DoubleSide,toneMapped:false,...extra});materials.push(material);return material;
    };
    const blocker=makeMaterial(shadowVertex,shadowFragment);
    const coverage=makeMaterial(uvVertex,'precision highp float; out vec4 result; void main(){result=vec4(1.0);}',{
      depthTest:false,depthWrite:false,transparent:true,blending:THREE.CustomBlending,
      blendEquation:THREE.AddEquation,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor});
    pageTarget=new THREE.WebGLRenderTarget(request.size,request.size,{type:THREE.FloatType,format:THREE.RGBAFormat,
      minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false,generateMipmaps:false});
    shadowTarget=new THREE.WebGLRenderTarget(shadowSize,shadowSize,{type:THREE.FloatType,format:THREE.RGBAFormat,
      minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:true,generateMipmaps:false});
    const surface=new THREE.Mesh(geometry,[blocker]);surface.frustumCulled=false;
    const scene=new THREE.Scene();scene.add(surface);
    const renderPass=(target:THREE.WebGLRenderTarget,material:THREE.RawShaderMaterial,pageOnly:boolean,clear:number)=>{
      cancelled(request,renderer);
      isolated(renderer,()=>{
        renderer.setRenderTarget(target);renderer.setViewport(0,0,target.width,target.height);
        const gl=renderer.getContext();
        if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('GPU draft target is incomplete.');
        renderer.setClearColor(clear,0);renderer.clear(true,true,false);
        surface.material=[material];geometry.clearGroups();
        if(pageOnly) {
          // Groups are honored for material arrays, not a single material.
          pageGroups.forEach(g=>geometry.addGroup(g.start,g.count,0));
        } else geometry.addGroup(0,selectedIndices.length,0);
        renderer.render(scene,camera);
      });
    };
    request.progress?.('Checking native UV coverage');
    renderPass(pageTarget,coverage,true,0);
    for(let y=0;y<request.size;y+=32) {
      cancelled(request,renderer);
      const rows=Math.min(32,request.size-y),tile=new Float32Array(request.size*rows*4);
      isolated(renderer,()=>renderer.readRenderTargetPixels(pageTarget!,0,y,request.size,rows,tile));
      for(let i=0;i<tile.length;i+=4)if(!Number.isFinite(tile[i])||tile[i]>1.001)
        throw Error('Native lightmap charts overlap at this resolution; no draft was adopted.');
      await yieldUi();
    }
    request.progress?.('Baking BSP sun shadows');
    renderPass(shadowTarget,blocker,false,0xffffff);
    let shadowTexels=0;
    for(let y=0;y<shadowSize;y+=32) {
      cancelled(request,renderer);
      const tile=new Float32Array(shadowSize*32*4);
      isolated(renderer,()=>renderer.readRenderTargetPixels(shadowTarget!,0,y,shadowSize,32,tile));
      for(let i=0;i<tile.length;i+=4) {
        if(!Number.isFinite(tile[i])||tile[i]<0||tile[i]>1)throw Error('Invalid GPU shadow depth.');
        if(tile[i+3]>0.5)shadowTexels++;
      }
      await yieldUi();
    }
    if(!shadowTexels)throw Error('The GPU shadow pass produced no BSP coverage.');
    const lighting=makeMaterial(uvVertex,lightFragment,{depthTest:false,depthWrite:false,uniforms:{
      shadowMatrix:{value:shadowMatrix},depthPage:{value:shadowTarget.texture},sunDirection:{value:direction},
      ambient:{value:new THREE.Vector3(...request.ambient)},sunlight:{value:new THREE.Vector3(...request.sunlight)},
      shadowTexel:{value:1/shadowSize},normalBias:{value:radius/(shadowSize*4)},
    }});
    request.progress?.('Baking direct-light page');
    renderPass(pageTarget,lighting,true,0);
    const pixels=new Float32Array(request.size**2*4);
    let coveredTexels=0;
    for(let y=0;y<request.size;y+=32) {
      cancelled(request,renderer);
      const rows=Math.min(32,request.size-y),tile=pixels.subarray(y*request.size*4,(y+rows)*request.size*4);
      isolated(renderer,()=>renderer.readRenderTargetPixels(pageTarget!,0,y,request.size,rows,tile));
      for(let i=0;i<tile.length;i+=4) {
        if(tile[i+3]>0.5)coveredTexels++;
        for(let c=0;c<4;c++)if(!Number.isFinite(tile[i+c])||tile[i+c]<0||tile[i+c]>100)
          throw Error('GPU draft produced invalid irradiance; no draft was adopted.');
      }
      await yieldUi();
    }
    cancelled(request,renderer);
    if(!coveredTexels)throw Error('No native page texels were rasterized.');
    accepted=true;
    return {sourceSha256:request.sourceSha256,key,size:request.size,pixels,coveredTexels,
      triangles:receivers.reduce((n,r)=>n+r.indexCount/3,0),release};
  } finally {
    geometry.dispose();materials.forEach(m=>m.dispose());pageTarget?.dispose();shadowTarget?.dispose();
    if(!accepted)release();
  }
}
