/** Original classic-material implementation based on source tag metadata.
 * Stored diffuse/detail/lightmap colours are combined without a PBR BRDF or
 * ACES exposure. Unsupported effects remain explicit gaps, not invented art.
 */
import * as THREE from 'three';
import type {ShaderPreview} from './types';
import {sunlightPosition} from './environment';
export const extraTextureKey=(id:number,role:string)=>`${id}:${role}`;
const vertex=`varying vec2 haloUv;varying vec2 haloLightUv;varying float haloDepth;varying vec3 haloNormal,haloView;
attribute vec2 uv1;
void main(){haloUv=uv;haloLightUv=uv1;haloNormal=normalize(normalMatrix*normal);vec4 view=modelViewMatrix*vec4(position,1.0);haloView=view.xyz;haloDepth=-view.z;gl_Position=projectionMatrix*view;}`;
const fragment=`
varying vec2 haloUv;varying vec2 haloLightUv;varying float haloDepth;varying vec3 haloNormal,haloView;
uniform sampler2D baseMap,lightMap,primaryDetail,secondaryDetail,microDetail,alphaMask,layer1,layer2,layer3;
uniform bool hasLight,hasPrimary,hasSecondary,hasMicro,hasMask,alphaTest,baseEncoded;
uniform int kind,shaderType,detailFunction,microFunction,layerCount;
uniform vec2 baseScale,layerScale[4],layerOffset[4];uniform float layerRotation[4];
uniform vec3 detailScales;uniform int colorFunction[4],alphaFunction[4];
uniform bool fogEnabled;uniform vec3 fogColor;uniform float fogNear,fogFar,fogMaximum;
uniform bool overrideLighting;uniform vec3 lightDirection,ambientFill,sunFill;
uniform sampler2D normalMap,multipurpose;uniform bool hasNormal,hasMultipurpose,multipurposeXbox,linearOutput,enhancedNormal,enhancedSpecular,enhancedSelfIllum;
uniform float normalScale,normalStrength,specularStrength,selfIllumStrength;
vec4 sourceColor(vec4 c){return baseEncoded?c:sRGBTransferOETF(c);}
vec2 layerUv(int i){vec2 p=haloUv*layerScale[i]+layerOffset[i];float c=cos(layerRotation[i]),s=sin(layerRotation[i]);return mat2(c,-s,s,c)*(p-0.5)+0.5;}
vec3 detailBlend(vec3 base,vec3 detail,int fn){
  if(fn==1)return clamp(base*detail,0.0,1.0);
  if(fn==2)return clamp(base+detail*2.0-1.0,0.0,1.0);
  return clamp(base*detail*2.0,0.0,1.0);
}
vec4 combine(vec4 current,vec4 next,int c,int a){
  vec3 rgb=current.rgb;float alpha=current.a;
  if(c==1)rgb=next.rgb;else if(c==2)rgb*=next.rgb;else if(c==3)rgb*=next.rgb*2.0;else if(c==4)rgb+=next.rgb;
  else if(c==5)rgb+=next.rgb-0.5;else if(c==6)rgb=next.rgb+rgb-0.5;else if(c==7)rgb-=next.rgb;else if(c==8)rgb=next.rgb-rgb;
  else if(c==9)rgb=mix(next.rgb,rgb,current.a);else if(c==10)rgb=mix(rgb,next.rgb,current.a);
  else if(c==11)rgb=mix(rgb,next.rgb,next.a);else if(c==12)rgb=mix(next.rgb,rgb,next.a);
  if(a==1)alpha=next.a;else if(a==2)alpha*=next.a;else if(a==3)alpha*=next.a*2.0;else if(a==4)alpha+=next.a;
  else if(a==5||a==6)alpha+=next.a-0.5;else if(a==7)alpha-=next.a;else if(a==8)alpha=next.a-alpha;
  else if(a==9)alpha=mix(next.a,alpha,current.a);else if(a==10)alpha=mix(alpha,next.a,current.a);
  else if(a==11)alpha=mix(alpha,next.a,next.a);else if(a==12)alpha=mix(next.a,alpha,next.a);
  return clamp(vec4(rgb,alpha),0.0,1.0);
}
void main(){
  vec4 base=sourceColor(texture2D(baseMap,kind==2?layerUv(0):haloUv*baseScale));
  if(kind==2){
    if(layerCount>1)base=combine(base,texture2D(layer1,layerUv(1)),colorFunction[0],alphaFunction[0]);
    if(layerCount>2)base=combine(base,texture2D(layer2,layerUv(2)),colorFunction[1],alphaFunction[1]);
    if(layerCount>3)base=combine(base,texture2D(layer3,layerUv(3)),colorFunction[2],alphaFunction[2]);
    if(alphaTest&&base.a<0.5)discard;
  }else{
    vec3 detail=vec3(0.5);bool hasDetail=hasPrimary;
    if(hasPrimary)detail=texture2D(primaryDetail,haloUv*detailScales.x).rgb;
    if(shaderType>0&&hasSecondary){vec3 other=texture2D(secondaryDetail,haloUv*detailScales.y).rgb;detail=mix(other,detail,base.a);hasDetail=true;}
    if(hasDetail)base.rgb=detailBlend(base.rgb,detail,detailFunction);
    if(hasMicro)base.rgb=detailBlend(base.rgb,texture2D(microDetail,haloUv*detailScales.z).rgb,microFunction);
    if(alphaTest){float mask=hasMask?texture2D(alphaMask,haloUv).a:base.a;if(mask<0.5)discard;}
    vec3 surface=base.rgb;
    if(hasLight)base.rgb*=texture2D(lightMap,haloLightUv).rgb;
    vec3 n=normalize(haloNormal);
    if(hasNormal&&enhancedNormal){vec3 dp1=dFdx(haloView),dp2=dFdy(haloView);vec2 duv1=dFdx(haloUv),duv2=dFdy(haloUv);
      vec3 a=cross(dp2,n),b=cross(n,dp1),t=a*duv1.x+b*duv2.x,bt=a*duv1.y+b*duv2.y;
      float length2=max(dot(t,t),dot(bt,bt));if(length2>.00000001){float inv=inversesqrt(length2);vec3 sampleN=texture2D(normalMap,haloUv*normalScale).rgb*2.0-1.0;
        sampleN.xy*=normalStrength;vec3 perturbed=normalize(mat3(t*inv,bt*inv,n)*sampleN);
        float baseDiffuse=max(.25,dot(n,normalize(lightDirection))*.5+.5),relief=max(.25,dot(perturbed,normalize(lightDirection))*.5+.5);
        base.rgb*=clamp(relief/baseDiffuse,.25,2.0);n=perturbed;}}
    if(kind==1&&hasMultipurpose){vec4 masks=texture2D(multipurpose,haloUv*baseScale);
      if(enhancedSelfIllum)base.rgb+=surface*masks.g*selfIllumStrength;
      if(enhancedSpecular){float mask=multipurposeXbox?masks.r:masks.b;vec3 halfVector=normalize(normalize(lightDirection)+normalize(-haloView));base.rgb+=sunFill*mask*pow(max(0.0,dot(n,halfVector)),32.0)*specularStrength;}}
    if(overrideLighting)base.rgb*=ambientFill+sunFill*max(0.0,dot(normalize(haloNormal),normalize(lightDirection)));
    base.a=1.0;
  }
  if(fogEnabled){float amount=clamp((haloDepth-fogNear)/max(0.001,fogFar-fogNear),0.0,1.0)*fogMaximum;base.rgb=mix(base.rgb,fogColor,amount);}
  gl_FragColor=linearOutput?sRGBTransferEOTF(base):base;
}`;
export function createHaloMaterial(base:THREE.Texture,light:THREE.Texture|null,metadata:ShaderPreview|undefined,
  extra:Record<string,THREE.Texture>,sky=false):THREE.ShaderMaterial {
  const m=metadata,layerCount=Math.min(4,m?.layers?.length??1),kind=m?.kind==='chicago'?2:m?.kind==='model'?1:0;
  const material=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,
    side:m?.twoSided===false?THREE.FrontSide:THREE.DoubleSide,toneMapped:false,transparent:kind===2,
    depthWrite:!sky&&kind!==2,uniforms:{baseMap:{value:base},lightMap:{value:light??base},
      primaryDetail:{value:extra.primaryDetail??base},secondaryDetail:{value:extra.secondaryDetail??base},microDetail:{value:extra.microDetail??base},alphaMask:{value:extra.alphaMask??base},
      layer1:{value:extra.layer1??base},layer2:{value:extra.layer2??base},layer3:{value:extra.layer3??base},
      hasLight:{value:!!light},hasPrimary:{value:!!extra.primaryDetail},hasSecondary:{value:!!extra.secondaryDetail},hasMicro:{value:!!extra.microDetail},hasMask:{value:!!extra.alphaMask},
      alphaTest:{value:!!m?.alphaTest},baseEncoded:{value:!!base.userData.sourceEncoded},kind:{value:kind},shaderType:{value:m?.shaderType??0},
      detailFunction:{value:m?.detailFunction??0},microFunction:{value:m?.microDetailFunction??0},detailScales:{value:new THREE.Vector3(...(m?.detailScales??[1,1,1]))},
      baseScale:{value:new THREE.Vector2(...(m?.uvScale??[1,1]))},layerCount:{value:layerCount},
      layerScale:{value:Array.from({length:4},(_,i)=>new THREE.Vector2(...(m?.layers?.[i]?.uvScale??[1,1])))},
      layerOffset:{value:Array.from({length:4},(_,i)=>new THREE.Vector2(...(m?.layers?.[i]?.uvOffset??[0,0])))},
      layerRotation:{value:Array.from({length:4},(_,i)=>m?.layers?.[i]?.rotation??0)},
      colorFunction:{value:Array.from({length:4},(_,i)=>m?.layers?.[i]?.colorFunction??0)},alphaFunction:{value:Array.from({length:4},(_,i)=>m?.layers?.[i]?.alphaFunction??0)},
      fogEnabled:{value:false},fogColor:{value:new THREE.Color()},fogNear:{value:0},fogFar:{value:1},fogMaximum:{value:1},
      overrideLighting:{value:false},lightDirection:{value:new THREE.Vector3()},ambientFill:{value:new THREE.Vector3()},sunFill:{value:new THREE.Vector3()}}});
  Object.assign(material.uniforms,{normalMap:{value:extra.normalMap??base},multipurpose:{value:extra.multipurpose??base},
    hasNormal:{value:!!extra.normalMap},hasMultipurpose:{value:!!extra.multipurpose},multipurposeXbox:{value:!!m?.multipurposeXbox},linearOutput:{value:false},
    enhancedNormal:{value:false},enhancedSpecular:{value:false},enhancedSelfIllum:{value:false},normalScale:{value:m?.bumpScale||1},normalStrength:{value:1},specularStrength:{value:.35},selfIllumStrength:{value:1}});
  if(extra.normalMap&&!extra.alphaMask){material.uniforms.alphaMask.value=extra.normalMap;material.uniforms.hasMask.value=true;}
  material.userData.haloSource=true;material.userData.sky=sky;
  if(kind===2){
    const blend=m?.framebufferBlend??0;
    if(blend===1||blend===2){material.blending=THREE.CustomBlending;material.blendSrc=THREE.DstColorFactor;material.blendDst=blend===2?THREE.SrcColorFactor:THREE.ZeroFactor;}
    else if(blend===3||blend===7){material.blending=THREE.AdditiveBlending;}
    else if(blend===4){material.blending=THREE.CustomBlending;material.blendEquation=THREE.ReverseSubtractEquation;material.blendSrc=THREE.OneFactor;material.blendDst=THREE.OneFactor;}
    else if(blend===5||blend===6){material.blending=THREE.CustomBlending;material.blendEquation=blend===5?THREE.MinEquation:THREE.MaxEquation;}
  }
  return material;
}
export function updateHaloMaterial(material:THREE.Material,scene:THREE.Scene,camera:THREE.Camera){
  if(!material.userData.haloSource)return;const m=material as THREE.ShaderMaterial,fog=scene.fog as (THREE.Fog&{maximumDensity?:number})|null;
  m.uniforms.fogEnabled.value=!!fog&&!material.userData.sky;
  if(fog){m.uniforms.fogColor.value.copy(fog.color).convertLinearToSRGB();m.uniforms.fogNear.value=fog.near;m.uniforms.fogFar.value=fog.far;m.uniforms.fogMaximum.value=fog.maximumDensity??1;}
  const environment=scene.userData.gsEnvironment;
  const features=scene.userData.gsRenderFeatures;
  m.uniforms.linearOutput.value=!!scene.userData.gsLinearOutput;
  m.uniforms.enhancedNormal.value=!!features?.enabled&&!!features.normalMaps;
  m.uniforms.enhancedSpecular.value=!!features?.enabled&&!!features.specular;
  m.uniforms.enhancedSelfIllum.value=!!features?.enabled&&!!features.selfIllumination;
  m.uniforms.normalStrength.value=features?.normalStrength??1;m.uniforms.specularStrength.value=features?.specularStrength??.35;m.uniforms.selfIllumStrength.value=features?.selfIllumStrength??1;
  m.uniforms.overrideLighting.value=!!environment?.overrideLighting&&!!environment?.value?.previewEnabled&&!material.userData.sky;
  if(environment?.value){const v=environment.value;m.uniforms.lightDirection.value.fromArray(sunlightPosition(v)).transformDirection(camera.matrixWorldInverse);
    m.uniforms.ambientFill.value.fromArray(v.ambientColor).multiplyScalar(v.ambientIntensity);m.uniforms.sunFill.value.fromArray(v.sunColor).multiplyScalar(v.sunIntensity);}
}
