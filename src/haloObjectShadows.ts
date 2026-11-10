/** Bounded silhouettes on original BSP triangles; reuses the viewport renderer,
 * model geometry and source textures. No substitute ground plane or disk cache. */
import * as THREE from 'three';
import type {MeshData} from './types';
import {objectLightingPoint} from './haloLightmap';
import type {SourceObjectLighting} from './haloLightmap';
export const NATIVE_SHADOW_SIZE=128,MAX_NATIVE_SHADOWS=8,MAX_SHADOW_RECEIVER_TRIANGLES=4096;
export interface ShadowSurface {positions:Float32Array;triangles:number}
/** Refuse an excessive/invalid receiver rather than dropping arbitrary faces. */
export function shadowSurface(data:MeshData,center:THREE.Vector3,direction:THREE.Vector3,radius:number):ShadowSurface|null {
  if(![center.x,center.y,center.z,direction.x,direction.y,direction.z].every(Number.isFinite)||Math.abs(direction.lengthSq()-1)>.01||!Number.isFinite(radius)||radius<=0||radius>1000||data.positions.length>3_000_000||data.positions.length%3||data.indices.length>1_500_000||data.indices.length%3)return null;
  const end=center.clone().addScaledVector(direction,4*radius),lo=center.clone().min(end).addScalar(-radius),hi=center.clone().max(end).addScalar(radius);
  const positions:number[]=[],a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3(),edge=new THREE.Vector3();
  const ranges=data.materialRanges??[];if(ranges.length>131072)return null;
  for(let at=0;at<data.indices.length;at+=3){
    const ids=data.indices.slice(at,at+3);if(ids.some(i=>!Number.isSafeInteger(i)||i<0||i*3+2>=data.positions.length))return null;
    a.fromArray(data.positions,ids[0]*3);b.fromArray(data.positions,ids[1]*3);c.fromArray(data.positions,ids[2]*3);
    if(![a,b,c].every(v=>Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z)))return null;
    if(Math.max(a.x,b.x,c.x)<lo.x||Math.min(a.x,b.x,c.x)>hi.x||Math.max(a.y,b.y,c.y)<lo.y||Math.min(a.y,b.y,c.y)>hi.y||Math.max(a.z,b.z,c.z)<lo.z||Math.min(a.z,b.z,c.z)>hi.z)continue;
    if(ranges.filter(r=>Number.isInteger(r.bspIndex)&&r.bspIndex!>=0&&Number.isSafeInteger(r.indexStart)&&Number.isSafeInteger(r.indexCount)&&r.indexStart>=0&&r.indexCount%3===0&&r.indexStart<=at&&at+3<=r.indexStart+r.indexCount).length!==1)continue;
    if(data.normals?.length===data.positions.length){normal.set(0,0,0);for(const id of ids)normal.add(new THREE.Vector3().fromArray(data.normals,id*3));}
    else normal.subVectors(b,a).cross(edge.subVectors(c,a));
    if(![normal.x,normal.y,normal.z].every(Number.isFinite))return null;
    if(normal.lengthSq()<1e-12||normal.normalize().dot(direction)>=-.001)continue;
    positions.push(...a.toArray(),...b.toArray(),...c.toArray());
    if(positions.length/9>MAX_SHADOW_RECEIVER_TRIANGLES)return null;
  }
  return positions.length?{positions:new Float32Array(positions),triangles:positions.length/9}:null;
}
const casterVertex='varying vec2 uvSource;void main(){uvSource=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';
const casterFragment='varying vec2 uvSource;uniform sampler2D diffuse;uniform bool cutout,enabled;uniform vec2 scale;void main(){if(!enabled)discard;if(cutout&&texture2D(diffuse,uvSource*scale).a<.5)discard;gl_FragColor=vec4(1.0);}';
const receiverVertex='varying vec3 worldPoint;varying float viewDepth;void main(){vec4 world=modelMatrix*vec4(position,1.0);worldPoint=world.xyz;vec4 view=viewMatrix*world;viewDepth=-view.z;gl_Position=projectionMatrix*view;}';
const receiverFragment=`varying vec3 worldPoint;varying float viewDepth;
uniform sampler2D silhouette;uniform mat4 projection;uniform vec3 center,direction,tint;uniform float radius;uniform vec2 fogRange;uniform float fogMaximum;uniform bool linearOutput;
void main(){vec4 p=projection*vec4(worldPoint,1.0);vec2 uv=p.xy*.5+.5;
if(any(lessThan(uv,vec2(0.0)))||any(greaterThan(uv,vec2(1.0))))discard;
float distance=dot(worldPoint-center,direction);if(distance< -radius||distance>radius*4.0)discard;
float strength=texture2D(silhouette,uv).r*(1.0-clamp((distance-radius)/(radius*3.0),0.0,1.0));
strength*=1.0-clamp((viewDepth-fogRange.x)/max(.001,fogRange.y-fogRange.x),0.0,1.0)*fogMaximum;
vec4 colour=vec4(mix(vec3(1.0),tint,strength),1.0);gl_FragColor=linearOutput?sRGBTransferEOTF(colour):colour;}`;
interface SourceShadow {data:MeshData;localLighting?:SourceObjectLighting|null}
interface Candidate {mesh:THREE.Mesh;source:SourceShadow;center:THREE.Vector3;direction:THREE.Vector3;radius:number;distance:number}
interface Entry {mesh:THREE.Mesh;source:SourceShadow;geometry:THREE.BufferGeometry;materials:THREE.Material[];matrix:number[];target:THREE.WebGLRenderTarget;proxy:THREE.Mesh;surface:THREE.Mesh;camera:THREE.OrthographicCamera;triangles:number}
export class NativeShadowPass {
  private entries=new Map<string,Entry>();private terrain:MeshData|null=null;private proxyScene=new THREE.Scene();
  readonly stats={eligible:0,visible:0,drawn:0,cached:0,updated:0,receiverTriangles:0,textureBytes:0,refused:0};
  constructor(private scene:THREE.Scene){}
  private remove(id:string){const entry=this.entries.get(id);if(!entry)return;this.scene.remove(entry.surface);entry.surface.geometry.dispose();(entry.surface.material as THREE.Material).dispose();entry.materials.forEach(m=>m.dispose());entry.target.dispose();this.entries.delete(id);}
  dispose(){for(const id of this.entries.keys())this.remove(id);this.terrain=null;}
  update(renderer:THREE.WebGLRenderer,camera:THREE.Camera,terrain:MeshData|null,enabled=true){
    if(this.terrain!==terrain){this.dispose();this.terrain=terrain;}
    Object.assign(this.stats,{eligible:0,visible:0,drawn:0,cached:0,updated:0,receiverTriangles:0,textureBytes:0,refused:0});
    for(const entry of this.entries.values())entry.surface.visible=false;
    this.stats.cached=this.entries.size;this.stats.textureBytes=this.entries.size*NATIVE_SHADOW_SIZE*NATIVE_SHADOW_SIZE*4;
    if(!enabled||!terrain||this.scene.userData.gsEnvironment?.overrideLighting)return;
    this.scene.updateMatrixWorld(true);camera.updateMatrixWorld();
    const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse)),candidates:Candidate[]=[];
    this.scene.traverse(node=>{
      if(!(node instanceof THREE.Mesh))return;const source=node.userData.haloNativeShadow as SourceShadow|undefined,info=source?.data.objectLighting,light=source?.localLighting;
      if(!source||!info||info.castsShadow!==true||!['vehi','bipd','weap','eqip'].includes(info.tagClass)||!light?.shadow||!node.visible)return;
      for(let p=node.parent;p;p=p.parent)if(!p.visible)return;
      const local=objectLightingPoint(source.data,{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]});if(!local)return;
      const center=new THREE.Vector3(...local).applyMatrix4(node.matrixWorld),radius=info.radius*node.matrixWorld.getMaxScaleOnAxis(),direction=new THREE.Vector3(...light.shadow.direction),distance=center.distanceTo(camera.position);
      if(!Number.isFinite(radius)||radius<=0||radius>1000||!Number.isFinite(direction.lengthSq())||Math.abs(direction.lengthSq()-1)>.01||direction.z>=-.7||!light.shadow.tint.every(n=>Number.isFinite(n)&&n>=0&&n<=1))return;
      this.stats.eligible++;if(distance>80+radius||!frustum.intersectsSphere(new THREE.Sphere(center,radius)))return;
      candidates.push({mesh:node,source,center,direction,radius,distance});
    });
    candidates.sort((a,b)=>a.distance-b.distance);this.stats.visible=candidates.length;
    const chosen=candidates.slice(0,MAX_NATIVE_SHADOWS),selected=new Set(chosen.map(c=>c.mesh.uuid));
    for(const candidate of chosen){
      const {mesh,source,center,direction,radius}=candidate,main=Array.isArray(mesh.material)?mesh.material:[mesh.material];let entry=this.entries.get(mesh.uuid);
      if(entry&&(entry.source.data!==source.data||entry.source.localLighting!==source.localLighting||entry.geometry!==mesh.geometry||main.length!==entry.materials.length||main.some((m,i)=>m!==entry!.materials[i]?.userData.original)||entry.matrix.some((n,i)=>n!==mesh.matrixWorld.elements[i]))){this.remove(mesh.uuid);entry=undefined;}
      if(!entry){
        const receiver=shadowSurface(terrain,center,direction,radius);if(!receiver){this.stats.refused++;continue;}
        const parts=main.map(original=>{
          const u=(original as THREE.ShaderMaterial).uniforms,enabled=u?.kind?.value===1&&(!u.alphaTest?.value||u.hasBase?.value===true);
          const material=new THREE.ShaderMaterial({vertexShader:casterVertex,fragmentShader:casterFragment,side:original.side,uniforms:{enabled:{value:!!enabled},cutout:{value:!!u?.alphaTest?.value},diffuse:{value:u?.baseMap?.value??null},scale:{value:u?.baseScale?.value??new THREE.Vector2(1,1)}}});
          material.userData.original=original;return material;
        });
        if(!parts.some(p=>p.uniforms.enabled.value)){parts.forEach(p=>p.dispose());this.stats.refused++;continue;}
        while(this.entries.size>=MAX_NATIVE_SHADOWS){const victim=[...this.entries.keys()].find(id=>!selected.has(id));if(!victim)break;this.remove(victim);}
        const target=new THREE.WebGLRenderTarget(NATIVE_SHADOW_SIZE,NATIVE_SHADOW_SIZE,{depthBuffer:false,stencilBuffer:false});target.texture.generateMipmaps=false;
        const shadowCamera=new THREE.OrthographicCamera(-radius,radius,radius,-radius,.001,radius*2+.002);shadowCamera.up.set(0,Math.abs(direction.z)>.99?1:0,Math.abs(direction.z)>.99?0:1);shadowCamera.position.copy(center).addScaledVector(direction,-radius-.001);shadowCamera.lookAt(center);shadowCamera.updateMatrixWorld();
        const projection=new THREE.Matrix4().multiplyMatrices(shadowCamera.projectionMatrix,shadowCamera.matrixWorldInverse),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(receiver.positions,3));
        const material=new THREE.ShaderMaterial({vertexShader:receiverVertex,fragmentShader:receiverFragment,transparent:true,blending:THREE.MultiplyBlending,premultipliedAlpha:true,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,toneMapped:false,uniforms:{silhouette:{value:target.texture},projection:{value:projection},center:{value:center},direction:{value:direction},radius:{value:radius},tint:{value:new THREE.Vector3(...source.localLighting!.shadow!.tint)},fogRange:{value:new THREE.Vector2()},fogMaximum:{value:0},linearOutput:{value:false}}});
        const surface=new THREE.Mesh(geometry,material);surface.renderOrder=-1;surface.raycast=()=>{};surface.userData.haloShadowReceiver=true;this.scene.add(surface);
        const proxy=new THREE.Mesh(mesh.geometry,parts);proxy.matrixAutoUpdate=false;proxy.matrix.copy(mesh.matrixWorld);proxy.frustumCulled=false;
        entry={mesh,source,geometry:mesh.geometry,materials:parts,matrix:[...mesh.matrixWorld.elements],target,proxy,surface,camera:shadowCamera,triangles:receiver.triangles};this.entries.set(mesh.uuid,entry);
        const oldTarget=renderer.getRenderTarget(),oldColor=renderer.getClearColor(new THREE.Color()),oldAlpha=renderer.getClearAlpha(),viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4()),scissorTest=renderer.getScissorTest(),autoClear=renderer.autoClear,xr=renderer.xr.enabled;
        try{renderer.xr.enabled=false;renderer.autoClear=true;renderer.setScissorTest(false);renderer.setClearColor(0,0);renderer.setRenderTarget(target);this.proxyScene.add(proxy);renderer.render(this.proxyScene,shadowCamera);this.stats.updated++;}
        finally{this.proxyScene.remove(proxy);renderer.setRenderTarget(oldTarget);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);renderer.setClearColor(oldColor,oldAlpha);renderer.autoClear=autoClear;renderer.xr.enabled=xr;}
      }
      const uniforms=(entry.surface.material as THREE.ShaderMaterial).uniforms,fog=this.scene.fog as (THREE.Fog&{maximumDensity?:number})|null;
      uniforms.linearOutput.value=!!this.scene.userData.gsLinearOutput;
      uniforms.fogRange.value.set(fog?.near??0,fog?.far??1);uniforms.fogMaximum.value=fog?fog.maximumDensity??1:0;
      entry.surface.visible=true;this.stats.drawn++;this.stats.receiverTriangles+=entry.triangles;
    }
    this.stats.cached=this.entries.size;this.stats.textureBytes=this.entries.size*NATIVE_SHADOW_SIZE*NATIVE_SHADOW_SIZE*4;
  }
}
