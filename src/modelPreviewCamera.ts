export interface ModelPreviewCamera { sourceHash:string; position:[number,number,number]; target:[number,number,number] }
export type ModelViewPreset='fit'|'front'|'side'|'top';
export function modelFitPosition(radius:number,aspect:number,fov:number,preset:ModelViewPreset):[number,number,number]{
  const half=Math.atan(Math.tan(fov*Math.PI/360)*Math.min(1,Math.max(.05,aspect)));
  const distance=Math.max(.01,radius)*1.12/Math.sin(half);
  const direction=preset==='front'?[1,0,.12]:preset==='side'?[0,-1,.12]:preset==='top'?[.001,0,1]:[2.8,-1.4,.95];
  const length=Math.hypot(...direction);return direction.map(value=>value/length*distance) as [number,number,number];
}
export function validModelPreviewCamera(value:unknown,sourceHash:string,radius:number):value is ModelPreviewCamera{
  if(!value||typeof value!=='object')return false;
  const candidate=value as ModelPreviewCamera;
  const vector=(v:unknown):v is number[]=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=radius*30);
  return candidate.sourceHash===sourceHash&&vector(candidate.position)&&vector(candidate.target)
    &&Math.hypot(...candidate.position.map((v,i)=>v-candidate.target[i]))>=radius*.05;
}
