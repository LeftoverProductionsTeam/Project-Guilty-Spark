import * as THREE from 'three';

export const CHROMA_GREEN = '#00ff00';
/** Capture-only material: native geometry/depth remain; source shaders stay cached. */
export function createChromaMaterial() {
  const material = new THREE.MeshBasicMaterial({color:CHROMA_GREEN,side:THREE.DoubleSide,toneMapped:false,fog:false});
  material.userData.gsChromaKey = true;
  return material;
}
/** Native identity wins over an object's display name. Item collections use the
 * first actual item reference, matching the object being previewed. */
export function isChromaSubject(tagClass:string|undefined,kind:string,references:readonly {class:string}[] = []) {
  if(kind==='Player spawn')return true;
  if(tagClass==='itmc')tagClass=references.find(ref=>ref.class==='weap'||ref.class==='eqip')?.class;
  return tagClass ? ['weap','vehi','bipd'].includes(tagClass) : ['Weapon','Vehicle','Biped'].includes(kind);
}
