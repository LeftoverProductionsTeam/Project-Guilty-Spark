export interface RenderFeatures {
  enabled:boolean;bloom:boolean;bloomStrength:number;bloomThreshold:number;bloomRadius:number;
  exposureEv:number;saturation:number;contrast:number;vignette:number;
  normalMaps:boolean;normalStrength:number;specular:boolean;specularStrength:number;
  selfIllumination:boolean;selfIllumStrength:number;quality:'performance'|'balanced'|'full';toneMapping:'source'|'filmic';
}
export const DEFAULT_RENDER_FEATURES:Readonly<RenderFeatures>=Object.freeze({enabled:false,bloom:true,bloomStrength:.35,bloomThreshold:.9,bloomRadius:.4,exposureEv:0,saturation:1,contrast:1,vignette:0,normalMaps:true,normalStrength:1,specular:true,specularStrength:.35,selfIllumination:true,selfIllumStrength:1,quality:'balanced',toneMapping:'source'});
export function validRenderFeatures(value:unknown):value is RenderFeatures{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;const p=value as Record<string,unknown>;
  if(Object.keys(p).length!==Object.keys(DEFAULT_RENDER_FEATURES).length||['enabled','bloom','normalMaps','specular','selfIllumination'].some(k=>typeof p[k]!=='boolean'))return false;
  const ranges:Record<string,[number,number]>={bloomStrength:[0,2],bloomThreshold:[0,4],bloomRadius:[0,1],exposureEv:[-4,4],saturation:[0,2],contrast:[.5,1.5],vignette:[0,1],normalStrength:[0,2],specularStrength:[0,2],selfIllumStrength:[0,4]};
  return Object.entries(ranges).every(([key,[min,max]])=>typeof p[key]==='number'&&Number.isFinite(p[key])&&p[key]>=min&&p[key]<=max)&&['performance','balanced','full'].includes(String(p.quality))&&['source','filmic'].includes(String(p.toneMapping));
}
export const renderFeatures=(value:unknown):RenderFeatures=>validRenderFeatures(value)?value:{...DEFAULT_RENDER_FEATURES};
