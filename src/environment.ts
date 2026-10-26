/** Editable *source intent* for Halo sky/radiosity and a Three.js-only live approximation.
 * No value in this module changes an installed game's sky, fog or lightmap.
 */
import type { Vec3 } from './types';
export interface EditorEnvironment {
  previewEnabled: boolean;
  skyColor: Vec3;
  ambientColor: Vec3;
  ambientIntensity: number;
  sunColor: Vec3;
  sunIntensity: number;
  sunAzimuth: number;
  sunElevation: number;
  fogEnabled: boolean;
  fogColor: Vec3;
  fogNear: number;
  fogFar: number;
}
export const DEFAULT_ENVIRONMENT: Readonly<EditorEnvironment> = {
  previewEnabled: true,
  skyColor: [0.051,0.098,0.133],
  ambientColor: [0.69,0.83,0.91],
  ambientIntensity: 0.75,
  sunColor: [1,0.92,0.77],
  sunIntensity: 2.2,
  sunAzimuth: -35,
  sunElevation: 50,
  fogEnabled: false,
  fogColor: [0.30,0.43,0.51],
  fogNear: 25,
  fogFar: 180,
};
export function environmentValue(value?: EditorEnvironment | null): EditorEnvironment {
  if (!value) return structuredClone(DEFAULT_ENVIRONMENT);
  validateEnvironment(value);
  return structuredClone(value);
}
export function validateEnvironment(value: EditorEnvironment): void {
  if (!value || typeof value!=='object') throw Error('Environment profile is missing.');
  if (typeof value.previewEnabled!=='boolean' || typeof value.fogEnabled!=='boolean')
    throw Error('Environment preview and fog switches must be true or false.');
  for (const field of ['skyColor','ambientColor','sunColor','fogColor'] as const) {
    const c=value[field];
    if (!Array.isArray(c) || c.length!==3 || c.some(x=>typeof x!=='number'||!Number.isFinite(x)||x<0||x>1))
      throw Error(`${field}: three finite color channels between 0 and 1 are required.`);
  }
  const bounds: Array<[keyof EditorEnvironment,number,number]> = [
    ['ambientIntensity',0,5],['sunIntensity',0,10],
    ['sunAzimuth',-180,180],['sunElevation',-90,90],
    ['fogNear',0,20000],['fogFar',1,20000],
  ];
  for (const [field,min,max] of bounds) {
    const n=value[field];
    if (typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)
      throw Error(`${field}: expected a finite number between ${min} and ${max}.`);
  }
  if (value.fogFar<=value.fogNear+0.5) throw Error('Fog far must be more than 0.5 world units beyond fog near.');
}
export function toHex(color:Vec3):string {
  return '#'+color.map(c=>Math.round(Math.max(0,Math.min(1,c))*255).toString(16).padStart(2,'0')).join('');
}
export function fromHex(hex:string):Vec3 {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw Error('RGB hex color is invalid.');
  return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255) as Vec3;
}
export function sunlightPosition(value: EditorEnvironment, radius=80):Vec3 {
  validateEnvironment(value);
  const a=value.sunAzimuth*Math.PI/180, e=value.sunElevation*Math.PI/180;
  return [radius*Math.cos(e)*Math.cos(a),radius*Math.cos(e)*Math.sin(a),radius*Math.sin(e)];
}
export function hasCustomEnvironment(value?:EditorEnvironment|null):boolean {
  if (!value) return false;
  validateEnvironment(value);
  return JSON.stringify(value)!==JSON.stringify(DEFAULT_ENVIRONMENT);
}
/** A reproducible, local, NON-IMPORTABLE handoff. Never mislabel a preview as a game sky/fog tag. */
export function environmentHandoff(value?:EditorEnvironment|null, skyTagPath?:string|null):string {
  const environment=environmentValue(value);
  return JSON.stringify({schemaVersion:1,kind:'guilty-spark-environment-intent',status:'AUTHORING_ONLY_NOT_COMPILED',
    haloSkyTag:skyTagPath??null,
    environment,
    sourceNotes:[
      'sky: Halo 1 sky tag stores atmospheric fog, radiosity (indoor/outdoor ambient) and directional lights.',
      'fog: Halo 1 fog tag applies separately to BSP fog planes, not general atmospheric fog.',
      'Editor fog near/far and preview light intensity are visual approximations, not tag field offsets.',
      'Set real sky/fog tags using a compatible editing kit; rerun radiosity/lightmaps and validate in Halo.',
    ]},null,2)+'\n';
}
