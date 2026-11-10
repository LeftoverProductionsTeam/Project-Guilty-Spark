/** Original classic-material implementation based on source tag metadata.
 * Stored diffuse/detail/lightmap colours are combined without a PBR BRDF or
 * ACES exposure. Unsupported effects remain explicit gaps, not invented art.
 */
import * as THREE from 'three';
import type {ShaderPreview} from './types';
import {sunlightPosition} from './environment';
import {applyHaloBlend,genericCombiner,haloWaveGlsl} from './haloTransparency';
import {glassWithoutDiffuse} from './nativeShaderTextures';
import type {SourceObjectLighting} from './haloLightmap';
export const extraTextureKey=(id:number,role:string)=>`${id}:${role}`;
const vertex = `varying vec2 haloUv;varying vec2 haloLightUv;varying float haloDepth;varying vec3 haloNormal,haloView;varying vec4 haloClip;
attribute vec2 uv1;
#ifdef USE_COLOR
varying vec3 haloVertexColor;
#endif
void main(){
#ifdef USE_COLOR
haloVertexColor=color;
#endif
haloUv=uv;haloLightUv=uv1;haloNormal=normalize(normalMatrix*normal);vec4 view=modelViewMatrix*vec4(position,1.0);haloView=view.xyz;haloDepth=-view.z;haloClip=projectionMatrix*view;gl_Position=haloClip;}`;
const fragment = `
varying vec2 haloUv;varying vec2 haloLightUv;varying float haloDepth;varying vec3 haloNormal,haloView;varying vec4 haloClip;
#ifdef USE_COLOR
varying vec3 haloVertexColor;
#endif
uniform samplerCube reflectionCube;uniform bool hasReflection;uniform mat3 viewToWorld;uniform vec2 reflectionBrightness,reflectionRange;uniform vec3 reflectionPerpTint,reflectionParallelTint;
uniform sampler2D baseMap,lightMap,primaryDetail,secondaryDetail,microDetail,alphaMask,layer1,layer2,layer3;
uniform bool hasBase,hasLight,hasPrimary,hasSecondary,hasMicro,hasMask,alphaTest,baseEncoded,alphaBlended;
uniform int kind,shaderType,detailFunction,microFunction,layerCount,detailMask;
uniform bool bumpIsSpecular,detailAfterReflection;uniform float detailVScale;
uniform bool glassTintPass,hasGlassTintMap;uniform vec3 glassTint;uniform sampler2D glassTintMap;uniform float glassTintScale;
uniform vec2 baseScale,layerScale[4],layerOffset[4];uniform float layerRotation[4];
uniform vec2 rotationCenter[4];uniform vec4 motionU[4],motionV[4],motionRotation[4];uniform int layerFlags[4];uniform float time;
uniform vec3 detailScales;uniform int colorFunction[4],alphaFunction[4];
uniform bool fogEnabled;uniform vec3 fogColor;uniform float fogNear,fogFar,fogMaximum;
uniform bool overrideLighting,localObjectLighting;uniform vec3 lightDirection,ambientFill,sunFill,bounceFill,bounceDirection,localReflectionTint;uniform float localReflectionBrightness;
uniform sampler2D normalMap,multipurpose;uniform bool hasNormal,hasMultipurpose,multipurposeXbox,linearOutput,enhancedNormal,enhancedSpecular,enhancedSelfIllum;
uniform float normalScale,normalStrength,specularStrength,selfIllumStrength;
uniform bool hasNativeSelfIllum;uniform vec3 selfIllumLower,selfIllumUpper;uniform vec2 selfIllumAnimation;
uniform bool hasChangeColor,firstMapScreenspace,scaleFirstMapWithDistance;uniform vec3 changeColor;
vec3 lightUnit(vec3 value){return value/max(length(value),.000001);}
vec4 sourceColor(vec4 c){return baseEncoded?c:sRGBTransferOETF(c);}
${haloWaveGlsl}
float animation(vec4 m){return haloWave(m.x,time/max(abs(m.y),0.001)+m.z)*m.w;}
vec2 layerUv(int i){vec2 uv=haloUv;if(i==0&&firstMapScreenspace){uv=haloClip.xy/max(abs(haloClip.w),.00001)*.5+.5;if(scaleFirstMapWithDistance)uv=(uv-.5)*length(haloView)+.5;}
vec2 p=uv*layerScale[i]+layerOffset[i]+vec2(animation(motionU[i]),animation(motionV[i]));
float angle=layerRotation[i]+animation(motionRotation[i])*0.0174532925199433,c=cos(angle),s=sin(angle);
return mat2(c,-s,s,c)*(p-rotationCenter[i])+rotationCenter[i];}
vec4 stageSample(vec4 c,int i){if(mod(floor(float(layerFlags[i])/2.0),2.0)>0.5)c.rgb=vec3(c.a);return sourceColor(c);}
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
  if(kind==4&&glassTintPass){
    vec3 tint=glassTint*(hasGlassTintMap?texture2D(glassTintMap,haloUv*glassTintScale).rgb:vec3(1.0));
    gl_FragColor=linearOutput?sRGBTransferEOTF(vec4(tint,1.0)):vec4(tint,1.0);return;
  }
  vec4 base=hasBase?sourceColor(texture2D(baseMap,(kind==2||kind==3)?layerUv(0):haloUv*baseScale)):vec4(0.0,0.0,0.0,kind==4?0.0:1.0);
  if(kind==2||kind==3){
    vec4 maps[4];maps[0]=stageSample(texture2D(baseMap,layerUv(0)),0);
    maps[1]=stageSample(texture2D(layer1,layerUv(1)),1);maps[2]=stageSample(texture2D(layer2,layerUv(2)),2);maps[3]=stageSample(texture2D(layer3,layerUv(3)),3);
    base=maps[0];
    if(kind==3){/* GENERIC_COMBINER */}else{
      if(layerCount>1)base=combine(base,maps[1],colorFunction[0],alphaFunction[0]);
      if(layerCount>2)base=combine(base,maps[2],colorFunction[1],alphaFunction[1]);
      if(layerCount>3)base=combine(base,maps[3],colorFunction[2],alphaFunction[2]);
    }
    if(alphaTest&&base.a<0.5)discard;
  }else{
    vec3 detail=vec3(0.5);bool hasDetail=hasPrimary;
    if(hasPrimary)detail=texture2D(primaryDetail,haloUv*detailScales.x*vec2(1.0,kind==1?detailVScale:1.0)).rgb;
    if(shaderType>0&&hasSecondary){vec3 other=texture2D(secondaryDetail,haloUv*detailScales.y).rgb;detail=mix(other,detail,base.a);hasDetail=true;}
    float detailAmount=1.0;
    if(kind==1&&hasMultipurpose&&detailMask>0){vec4 masks=texture2D(multipurpose,haloUv*baseScale);
      float specular=multipurposeXbox?masks.r:masks.b,change=multipurposeXbox?masks.b:masks.a,aux=multipurposeXbox?masks.a:masks.r;
      float selected=detailMask<=2?specular:detailMask<=4?masks.g:detailMask<=6?change:aux;
      detailAmount=mod(float(detailMask),2.0)>0.5?1.0-selected:selected;}
    if(hasDetail&&!(kind==1&&detailAfterReflection)){
      base.rgb=mix(base.rgb,detailBlend(base.rgb,detail,detailFunction),detailAmount);
      if(kind==4)base.a*=texture2D(primaryDetail,haloUv*detailScales.x).a;
    }
    if(hasMicro)base.rgb=detailBlend(base.rgb,texture2D(microDetail,haloUv*detailScales.z).rgb,microFunction);
    if(kind==1&&hasMultipurpose&&hasChangeColor){vec4 masks=texture2D(multipurpose,haloUv*baseScale);float mask=multipurposeXbox?masks.b:masks.a;base.rgb*=mix(vec3(1.0),changeColor,mask);}
    if(alphaTest){float mask=hasMask?texture2D(alphaMask,haloUv).a:base.a;if(mask<0.5)discard;}
    vec3 surface=base.rgb;
    if(hasLight)base.rgb*=texture2D(lightMap,haloLightUv).rgb;
    vec3 n=normalize(haloNormal)*(gl_FrontFacing?1.0:-1.0);
    if(hasNormal&&enhancedNormal){vec3 dp1=dFdx(haloView),dp2=dFdy(haloView);vec2 duv1=dFdx(haloUv),duv2=dFdy(haloUv);
      vec3 a=cross(dp2,n),b=cross(n,dp1),t=a*duv1.x+b*duv2.x,bt=a*duv1.y+b*duv2.y;
      float length2=max(dot(t,t),dot(bt,bt));if(length2>.00000001){float inv=inversesqrt(length2);vec3 sampleN=texture2D(normalMap,haloUv*normalScale).rgb*2.0-1.0;
        sampleN.xy*=normalStrength;vec3 perturbed=normalize(mat3(t*inv,bt*inv,n)*sampleN);
        float baseDiffuse=max(.25,dot(n,lightUnit(lightDirection))*.5+.5),relief=max(.25,dot(perturbed,lightUnit(lightDirection))*.5+.5);
        base.rgb*=clamp(relief/baseDiffuse,.25,2.0);n=perturbed;}}
    if(kind==1&&hasMultipurpose){vec4 masks=texture2D(multipurpose,haloUv*baseScale);
      if(enhancedSpecular){float mask=multipurposeXbox?masks.r:masks.b;vec3 halfVector=normalize(lightUnit(lightDirection)+normalize(-haloView));base.rgb+=sunFill*mask*pow(max(0.0,dot(n,halfVector)),32.0)*specularStrength;}}
    if(overrideLighting||localObjectLighting)base.rgb*=ambientFill+sunFill*max(0.0,dot(n,lightUnit(lightDirection)))+
      (localObjectLighting?bounceFill*max(0.0,dot(n,lightUnit(bounceDirection))):vec3(0.0));
    // Native emission adds to diffuse illumination before multiplication by
    // the surface colour. It survives darkness and does not require optional
    // post-processing. A black diffuse texel still cannot invent light.
    if(kind==1&&hasMultipurpose&&hasNativeSelfIllum){float mask=texture2D(multipurpose,haloUv*baseScale).g;
      vec3 emission=mix(selfIllumLower,selfIllumUpper,haloWave(selfIllumAnimation.x,time/max(selfIllumAnimation.y,.001)));
      base.rgb+=surface*emission*mask*(enhancedSelfIllum?selfIllumStrength:1.0);}
    // Native glass is tint, additive reflection, then alpha-blended diffuse.
    // Compose its latter two stages without treating transparent diffuse RGB
    // as an opaque additive mask. Tint is a separate source-controlled pass.
    float glassOpacity=kind==4?clamp(base.a,0.0,1.0):0.0;
    if(kind==4)base.rgb*=glassOpacity;
    if(hasReflection){vec3 reflected=viewToWorld*reflect(normalize(haloView),n);float facing=kind==4?clamp(normalize(haloNormal).z,0.0,1.0):clamp(dot(normalize(-haloView),n),0.0,1.0);
      // Native glass uses the camera axis and squared facing. Its authored
      // reflection colour blends glossy and broad cube response; it is not
      // the multiplicative tint used by opaque model/environment shaders.
      float grazing=1.0-(kind==4?facing*facing:facing);float brightness=mix(reflectionBrightness.x,reflectionBrightness.y,grazing);vec3 tint=mix(reflectionPerpTint,reflectionParallelTint,grazing);
      float mask=1.0;if(kind==1&&hasMultipurpose){vec4 masks=texture2D(multipurpose,haloUv*baseScale);mask=multipurposeXbox?masks.r:masks.b;}
      else if(bumpIsSpecular&&hasNormal)mask=texture2D(normalMap,haloUv*normalScale).a;
      else if(kind==0&&shaderType==2)mask=base.a;
      float fade=reflectionRange.y>0.0?1.0-clamp((length(haloView)-reflectionRange.x)/max(.001,reflectionRange.y-reflectionRange.x),0.0,1.0):1.0;
      vec3 cubeColour=textureCube(reflectionCube,reflected).rgb;
      vec3 reflectionColour=kind==4?mix(pow(cubeColour,vec3(8.0)),cubeColour,tint):cubeColour*tint;
      if(localObjectLighting&&kind<=1)reflectionColour*=localReflectionTint*localReflectionBrightness;
      base.rgb+=reflectionColour*brightness*mask*fade*(kind==4?1.0-glassOpacity:1.0);}
    // Preserve the model tag's authored combiner order. Reflection remains
    // source-coloured; detail can modulate it only when that flag is set.
    if(kind==1&&detailAfterReflection&&hasDetail)base.rgb=mix(base.rgb,detailBlend(base.rgb,detail,detailFunction),detailAmount);
    if(!alphaBlended)base.a=1.0;
  }
  if(fogEnabled){float amount=clamp((haloDepth-fogNear)/max(0.001,fogFar-fogNear),0.0,1.0)*fogMaximum;
    if(kind>=2){/* TRANSPARENT_FOG */}else base.rgb=mix(base.rgb,fogColor,amount);}
  #ifdef USE_COLOR
  base.rgb*=haloVertexColor;
  #endif
  gl_FragColor=linearOutput?sRGBTransferEOTF(base):base;
}`;
export function createHaloMaterial(
  base: THREE.Texture|null,
  light: THREE.Texture | null,
  metadata: ShaderPreview | undefined,
  extra: Record<string, THREE.Texture>,
  sky = false,
): THREE.ShaderMaterial {
  if(!base&&!glassWithoutDiffuse(metadata))throw Error('This native shader requires its actual diffuse image.');
  const m=metadata,layerCount=Math.min(4,m?.layers?.length??1),kind=m?.kind==='glass'?4:m?.kind==='generic'?3:m?.kind==='chicago'?2:m?.kind==='model'?1:0;
  const blend=m?.framebufferBlend??0;
  const fogCode=blend===1||blend===2?`base.rgb=mix(base.rgb,vec3(${blend===1?'1.0':'0.5'}),amount);`:
    blend>=3?'base.rgb*=1.0-amount;':'base.rgb=mix(base.rgb,fogColor,amount);';
  const motion=(axis:number)=>Array.from({length:4},(_,i)=>{const a=m?.layers?.[i]?.animations?.[axis];
    return a&&a.source===0?new THREE.Vector4(a.function,a.period,a.phase,a.scale):new THREE.Vector4(1,1,0,0);});
  const samplers:THREE.Texture[]=[];
  const stageTexture=(source:THREE.Texture|null,i:number)=>{
    if(!source)return null;
    const flags=m?.layers?.[i]?.flags??0;
    if(!(flags&13))return source;
    const texture=source.clone();
    texture.wrapS=flags&4?THREE.ClampToEdgeWrapping:THREE.RepeatWrapping;
    texture.wrapT=flags&8?THREE.ClampToEdgeWrapping:THREE.RepeatWrapping;
    if(flags&1){texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestMipmapNearestFilter;}
    texture.needsUpdate=true;samplers.push(texture);return texture;
  };
  const reflection = m?.reflection;
  const material = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment
      .replace('/* GENERIC_COMBINER */', genericCombiner(m))
      .replace('/* TRANSPARENT_FOG */', fogCode),
    side: m?.twoSided === false ? THREE.FrontSide : THREE.DoubleSide,
    toneMapped: false,
    transparent: kind >= 2 || !!m?.alphaBlended,
    depthWrite: !sky && kind < 2 && !m?.alphaBlended,
    polygonOffset: !!m?.decal,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    uniforms: {
      reflectionCube: { value: extra.reflectionCube ?? null },
      hasReflection: { value: !!extra.reflectionCube && !!reflection },
      viewToWorld: { value: new THREE.Matrix3() },
      reflectionBrightness: {
        value: new THREE.Vector2(
          reflection?.perpendicularBrightness ?? 0,
          reflection?.parallelBrightness ?? 0,
        ),
      },
      reflectionRange: { value: new THREE.Vector2(reflection?.falloff ?? 0, reflection?.cutoff ?? 0) },
      reflectionPerpTint: { value: new THREE.Vector3(...(reflection?.perpendicularTint ?? [1, 1, 1])) },
      reflectionParallelTint: { value: new THREE.Vector3(...(reflection?.parallelTint ?? [1, 1, 1])) },
      baseMap: { value: kind >= 2 ? stageTexture(base, 0) : base },
      hasBase: { value: !!base },
      glassTintPass: { value: false },
      glassTint: { value: new THREE.Vector3(...(m?.glassTint??[1,1,1])) },
      glassTintMap: { value: extra.glassTintMap??base },
      hasGlassTintMap: { value: !!extra.glassTintMap },
      glassTintScale: { value: m?.glassTintScale??1 },
      lightMap: { value: light ?? base },
      primaryDetail: { value: extra.primaryDetail ?? base },
      secondaryDetail: { value: extra.secondaryDetail ?? base },
      microDetail: { value: extra.microDetail ?? base },
      alphaMask: { value: extra.alphaMask ?? base },
      layer1: { value: stageTexture(extra.layer1 ?? base, 1) },
      layer2: { value: stageTexture(extra.layer2 ?? base, 2) },
      layer3: { value: stageTexture(extra.layer3 ?? base, 3) },
      hasLight: { value: !!light },
      hasPrimary: { value: !!extra.primaryDetail },
      hasSecondary: { value: !!extra.secondaryDetail },
      hasMicro: { value: !!extra.microDetail },
      hasMask: { value: !!extra.alphaMask },
      // Native model decals blend fractional alpha instead of applying the
      // opaque model cutout rule, including older cached preview metadata.
      alphaTest: { value: !!m?.alphaTest && kind !== 4 && !(kind === 1 && m?.alphaBlended) },
      alphaBlended: { value: kind===4 || !!m?.alphaBlended },
      baseEncoded: { value: !!base?.userData.sourceEncoded },
      kind: { value: kind },
      shaderType: { value: m?.shaderType ?? 0 },
      detailFunction: { value: m?.detailFunction ?? 0 },
      detailMask:{value:m?.detailMask??0},
      detailAfterReflection:{value:!!m?.detailAfterReflection},
      detailVScale:{value:m?.detailVScale||1},
      bumpIsSpecular:{value:!!m?.bumpIsSpecular},
      microFunction: { value: m?.microDetailFunction ?? 0 },
      detailScales: { value: new THREE.Vector3(...(m?.detailScales ?? [1, 1, 1])) },
      baseScale: { value: new THREE.Vector2(...(m?.uvScale ?? [1, 1])) },
      layerCount: { value: layerCount },
      layerScale: {
        value: Array.from({ length: 4 }, (_, i) => new THREE.Vector2(...(m?.layers?.[i]?.uvScale ?? [1, 1]))),
      },
      layerOffset: {
        value: Array.from(
          { length: 4 },
          (_, i) => new THREE.Vector2(...(m?.layers?.[i]?.uvOffset ?? [0, 0])),
        ),
      },
      layerRotation: { value: Array.from({ length: 4 }, (_, i) => m?.layers?.[i]?.rotation ?? 0) },
      rotationCenter: {
        value: Array.from(
          { length: 4 },
          (_, i) => new THREE.Vector2(...(m?.layers?.[i]?.rotationCenter ?? [0.5, 0.5])),
        ),
      },
      motionU: { value: motion(0) },
      motionV: { value: motion(1) },
      motionRotation: { value: motion(2) },
      time: { value: 0 },
      layerFlags: { value: Array.from({ length: 4 }, (_, i) => m?.layers?.[i]?.flags ?? 0) },
      colorFunction: { value: Array.from({ length: 4 }, (_, i) => m?.layers?.[i]?.colorFunction ?? 0) },
      alphaFunction: { value: Array.from({ length: 4 }, (_, i) => m?.layers?.[i]?.alphaFunction ?? 0) },
      fogEnabled: { value: false },
      fogColor: { value: new THREE.Color() },
      fogNear: { value: 0 },
      fogFar: { value: 1 },
      fogMaximum: { value: 1 },
      localObjectLighting:{value:false},bounceFill:{value:new THREE.Vector3()},bounceDirection:{value:new THREE.Vector3(0,0,-1)},
      localReflectionTint:{value:new THREE.Vector3(1,1,1)},localReflectionBrightness:{value:1},
      overrideLighting: { value: false },
      lightDirection: { value: new THREE.Vector3() },
      ambientFill: { value: new THREE.Vector3() },
      sunFill: { value: new THREE.Vector3() },
    },
  });
  Object.assign(material.uniforms,{normalMap:{value:extra.normalMap??base},multipurpose:{value:extra.multipurpose??base},
    hasNativeSelfIllum:{value:!!m?.selfIllumination&&m.selfIllumination.source===0},selfIllumLower:{value:new THREE.Vector3(...(m?.selfIllumination?.lower??[0,0,0]))},selfIllumUpper:{value:new THREE.Vector3(...(m?.selfIllumination?.upper??[0,0,0]))},selfIllumAnimation:{value:new THREE.Vector2(m?.selfIllumination?.function??1,m?.selfIllumination?.period??1)},
    hasChangeColor:{value:!!m?.changeColor},changeColor:{value:new THREE.Vector3(...(m?.changeColor??[1,1,1]))},firstMapScreenspace:{value:!!m?.firstMapScreenspace},scaleFirstMapWithDistance:{value:!!m?.scaleFirstMapWithDistance},
    hasNormal:{value:!!extra.normalMap},hasMultipurpose:{value:!!extra.multipurpose},multipurposeXbox:{value:!!m?.multipurposeXbox},linearOutput:{value:false},
    enhancedNormal:{value:false},enhancedSpecular:{value:false},enhancedSelfIllum:{value:false},normalScale:{value:m?.bumpScale||1},normalStrength:{value:1},specularStrength:{value:.35},selfIllumStrength:{value:1}});
  if(extra.normalMap&&!extra.alphaMask){material.uniforms.alphaMask.value=extra.normalMap;material.uniforms.hasMask.value=true;}
  material.userData.haloSource=true;
  material.userData.haloAnimated=!!m?.layers?.slice(0,4).some(layer=>layer.animations?.some(a=>a.source===0&&a.function>=2&&a.scale!==0)) ||
    (kind===3&&!!m?.stages?.some(stage=>stage.constant0Function>=2&&stage.constant0Lower.some((value,index)=>value!==stage.constant0Upper[index])))||
    (m?.selfIllumination?.source===0&&m.selfIllumination.function>=2&&m.selfIllumination.lower.some((value,index)=>value!==m.selfIllumination!.upper[index]));
  material.userData.sky=sky;
  material.addEventListener('dispose',()=>samplers.forEach(texture=>texture.dispose()));
  if(kind>=2||m?.alphaBlended)applyHaloBlend(material,blend);
  if(kind===4){
    // Diffuse alpha attenuates both the already tinted scene and reflection.
    // Use createHaloMaterialPasses for the preceding authored tint stage.
    material.blending=THREE.CustomBlending;material.blendEquation=THREE.AddEquation;
    material.blendSrc=THREE.OneFactor;material.blendDst=THREE.OneMinusSrcAlphaFactor;
    material.blendSrcAlpha=THREE.ZeroFactor;material.blendDstAlpha=THREE.OneFactor;
    material.depthWrite=false;
  }
  return material;
}
/** Ordered passes for the one shared native renderer. Only glass needs a
 * preceding tint operation, and neutral tint costs no additional draw call.
 * Passes share immutable source textures; no copied images or GPU snapshots. */
export function createHaloMaterialPasses(...args:Parameters<typeof createHaloMaterial>):THREE.ShaderMaterial[]{
  const surface=createHaloMaterial(...args),metadata=args[2],extra=args[3];
  if(metadata?.kind!=='glass'||(!extra.glassTintMap&&(metadata.glassTint??[1,1,1]).every(value=>value===1)))return[surface];
  const tint=new THREE.ShaderMaterial({
    vertexShader:surface.vertexShader,fragmentShader:surface.fragmentShader,
    uniforms:{...surface.uniforms,glassTintPass:{value:true}},
    side:surface.side,toneMapped:false,transparent:true,depthWrite:false,
    polygonOffset:surface.polygonOffset,polygonOffsetFactor:surface.polygonOffsetFactor,polygonOffsetUnits:surface.polygonOffsetUnits,
    blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,
    blendSrc:THREE.ZeroFactor,blendDst:THREE.SrcColorFactor,
    blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor,
  });
  tint.userData={...surface.userData,haloAnimated:false,haloGlassPass:'tint'};
  surface.userData.haloGlassPass='surface';
  return[tint,surface];
}
export function updateHaloMaterial(material: THREE.Material, scene: THREE.Scene, camera: THREE.Camera, redraw?:()=>void) {
  if(!material.userData.haloSource)return;
  const m=material as THREE.ShaderMaterial,fog=scene.fog as (THREE.Fog&{maximumDensity?:number})|null;
  m.uniforms.time.value=performance.now()/1000;
  // Only an animated surface actually submitted by the renderer requests its
  // next frame. Off-screen effects do not keep a static editor spinning.
  if(material.userData.haloAnimated)redraw?.();
  m.uniforms.viewToWorld.value.setFromMatrix4(camera.matrixWorld);
  m.uniforms.fogEnabled.value=!!fog&&!material.userData.sky;
  if(fog){m.uniforms.fogColor.value.copy(fog.color).convertLinearToSRGB();m.uniforms.fogNear.value=fog.near;m.uniforms.fogFar.value=fog.far;m.uniforms.fogMaximum.value=fog.maximumDensity??1;}
  const environment=scene.userData.gsEnvironment;
  const features=scene.userData.gsRenderFeatures;
  m.uniforms.linearOutput.value=!!scene.userData.gsLinearOutput;
  m.uniforms.enhancedNormal.value=!!features?.enabled&&!!features.normalMaps;
  m.uniforms.enhancedSpecular.value=!!features?.enabled&&!!features.specular;
  m.uniforms.enhancedSelfIllum.value=!!features?.enabled&&!!features.selfIllumination;
  m.uniforms.normalStrength.value=features?.normalStrength??1;
  m.uniforms.specularStrength.value=features?.specularStrength??.35;
  m.uniforms.selfIllumStrength.value=features?.selfIllumStrength??1;
  // Placed native objects need the verified source sky just as tag previews do.
  // Baked BSP pages keep their own illumination; an explicit user override
  // retains its existing scope. Missing source lighting never invents a rig.
  const sourceObjectLighting=material.userData.haloSourceObject&&environment?.sourceObjectLighting&&!m.uniforms.hasLight.value;
  m.uniforms.overrideLighting.value=!!(environment?.overrideLighting||sourceObjectLighting)&&!!environment?.value?.previewEnabled&&!material.userData.sky;
  const local=material.userData.haloObjectLighting as SourceObjectLighting|undefined;
  const useLocal=!!local&&!!material.userData.haloSourceObject&&!m.uniforms.hasLight.value&&!material.userData.sky&&!environment?.overrideLighting;
  m.uniforms.localObjectLighting.value=useLocal;
  if(useLocal){
    m.uniforms.overrideLighting.value=false;
    m.uniforms.ambientFill.value.fromArray(local!.ambient);m.uniforms.sunFill.value.fromArray(local!.primary);
    m.uniforms.lightDirection.value.fromArray(local!.primaryDirection).transformDirection(camera.matrixWorldInverse);
    m.uniforms.bounceFill.value.fromArray(local!.bounce);m.uniforms.bounceDirection.value.fromArray(local!.bounceDirection).transformDirection(camera.matrixWorldInverse);
    m.uniforms.localReflectionTint.value.fromArray(local!.reflection);m.uniforms.localReflectionBrightness.value=local!.reflectionBrightness;
  }
  if(!useLocal&&environment?.value){const v=environment.value;m.uniforms.lightDirection.value.fromArray(sunlightPosition(v)).transformDirection(camera.matrixWorldInverse);
    m.uniforms.ambientFill.value.fromArray(v.ambientColor).multiplyScalar(v.ambientIntensity);m.uniforms.sunFill.value.fromArray(v.sunColor).multiplyScalar(v.sunIntensity);}
}
