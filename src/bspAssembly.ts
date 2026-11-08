import type { Project, Vec3 } from './types';
export interface SeamEdge {sourceSha256:string;bspIndex:number;vertices:[Vec3,Vec3];point:Vec3;}
export interface SeamSection {id:string;name:string;points:Vec3[];width:number;height:number;shaderPath:string;openRoad?:boolean;archSegments?:number;edges:[SeamEdge,SeamEdge];}
export interface BspAssembly {
  schemaVersion: 1;
  donorProjectId: string;
  donorTitle: string;
  donorSource: NonNullable<Project['source']>;
  donorTagsDirectory: string;
  donorBspIndex: number;
  includeDonorScenery?: boolean;
  translation: Vec3;
  yawDegrees: number;
  tunnelPoints: Vec3[];
  tunnelWidth: number;
  tunnelHeight: number;
  tunnelShaderPath: string;
  openRoad?: boolean;
  terrainSeam?: {shoulderWidth:number;bankHeight:number;baseShaderPath:string;donorShaderPath:string};
  infantryTunnel?: {points:Vec3[];width:number;height:number;shaderPath:string};
  highGround?: {points:Vec3[];width:number;height:number;shaderPath:string};
  sections?:SeamSection[];
  archSegments?:number;
  visibilityZones?: import('./visibilityZones').VisibilityZone[];
}
export interface BspOption {
  index: number;
  name: string;
  triangles: number;
}
export interface AssemblyReport {
  inputTriangles: number;
  outputTriangles: number;
  connectorTriangles?: number;
  generatedUvFaces: number;
  walkSamples: number;
  portalCount: number;
  donorScenery?: number;
  routeClearance?: {label:string;width:number;clearHeight:number;walkSamples:number}[];
  warnings: string[];
  viewport?: {projectId:string;sourceSha256:string;donorSha256:string;assembly:BspAssembly;surfaces:{source:number;mesh:import('./types').MeshData}[]};
}
/** Semantic identity across IPC object-key ordering and old omitted options. */
export function assemblySignature(plan: BspAssembly | null): string {
  const ordered = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(ordered);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, ordered(item)]),
      );
    return value;
  };
  // Rust stores passage sizes as f32. Canonicalize only those declared fields;
  // f64 world coordinates and source identities must retain full precision.
  const route=(value:BspAssembly['infantryTunnel'])=>value?{...value,width:Math.fround(value.width),height:Math.fround(value.height)}:undefined;
  return JSON.stringify(
    ordered(plan ? { ...plan, sections:plan.sections?.length?plan.sections.map(section=>({...route(section),openRoad:section.openRoad??false})):undefined, archSegments:plan.archSegments??undefined, tunnelWidth:Math.fround(plan.tunnelWidth), tunnelHeight:Math.fround(plan.tunnelHeight), visibilityZones: plan.visibilityZones?.length ? plan.visibilityZones : undefined, includeDonorScenery: plan.includeDonorScenery ?? false, openRoad: plan.openRoad || undefined, infantryTunnel: route(plan.infantryTunnel), terrainSeam:plan.terrainSeam??undefined, highGround:route(plan.highGround) } : null),
  );
}
function moveMouth(points:Vec3[],before:Vec3,after:Vec3,angle:number):Vec3[] {
  const last=points.at(-1)!,relative=last.map((v,i)=>v-before[i]),c=Math.cos(angle),s=Math.sin(angle);
  const end:Vec3=[after[0]+c*relative[0]-s*relative[1],after[1]+s*relative[0]+c*relative[1],after[2]+relative[2]];
  return points.map((point,index)=>index===points.length-1?end:point);
}
/** Move each donor mouth with the same source transform, preserving authored bends. */
export function transformAssembly(plan:BspAssembly,translation:Vec3,yawDegrees:number):BspAssembly {
  const angle=(yawDegrees-plan.yawDegrees)*Math.PI/180;
  return {...plan,translation,yawDegrees,tunnelPoints:moveMouth(plan.tunnelPoints,plan.translation,translation,angle),
    ...(plan.infantryTunnel?{infantryTunnel:{...plan.infantryTunnel,points:moveMouth(plan.infantryTunnel.points,plan.translation,translation,angle)}}:{}),
    ...(plan.highGround?{highGround:{...plan.highGround,points:moveMouth(plan.highGround.points,plan.translation,translation,angle)}}:{}),...(plan.sections?.length?{sections:plan.sections.map(section=>({...section,points:moveMouth(section.points,plan.translation,translation,angle)}))}:{})};
}
/** A reviewable second route, not a claim of native or vehicle clearance. */
export function addInfantryTunnel(plan:BspAssembly,offset=plan.terrainSeam?Math.max(8,plan.tunnelWidth/2+plan.terrainSeam.shoulderWidth+2):8):BspAssembly {
  if(plan.infantryTunnel)return plan;
  const a=plan.tunnelPoints[0],b=plan.tunnelPoints.at(-1)!,dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  if(!Number.isFinite(length)||length<8||!Number.isFinite(offset)||Math.abs(offset)<3||Math.abs(offset)>64)throw Error('Use a connection at least 8 world units long and a tunnel offset from 3 to 64 units.');
  const bend=(t:number):Vec3=>[a[0]+dx*t-dy/length*offset,a[1]+dy*t+dx/length*offset,a[2]+(b[2]-a[2])*t];
  const points:Vec3[]=[[...a],bend(.25),bend(.75),[...b]];
  if(points.flat().some(value=>!Number.isFinite(value)||Math.abs(value)>2048))throw Error('The infantry route exceeds the supported world bounds.');
  return {...plan,infantryTunnel:{points,width:2,height:1.6,shaderPath:plan.tunnelShaderPath}};
}
/** Turn the donor around its entrance without moving the authored tunnel route. */
export function rotateAssemblyAtEntrance(plan: BspAssembly, yawDegrees: number): BspAssembly {
  const mouth = plan.tunnelPoints.at(-1)!;
  const relative = mouth.map((v, i) => v - plan.translation[i]) as Vec3;
  const angle = ((yawDegrees - plan.yawDegrees) * Math.PI) / 180;
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const translation: Vec3 = [
    mouth[0] - c * relative[0] + s * relative[1],
    mouth[1] - s * relative[0] - c * relative[1],
    plan.translation[2],
  ];
  return { ...plan, translation, yawDegrees, ...(plan.infantryTunnel?{infantryTunnel:{...plan.infantryTunnel,points:moveMouth(plan.infantryTunnel.points,plan.translation,translation,angle)}}:{}), ...(plan.highGround?{highGround:{...plan.highGround,points:moveMouth(plan.highGround.points,plan.translation,translation,angle)}}:{}),...(plan.sections?.length?{sections:plan.sections.map(section=>({...section,points:moveMouth(section.points,plan.translation,translation,angle)}))}:{}) };
}

/** Reviewable ramp/ridge draft. Native source-floor and compiled checks remain mandatory. */
export function addHighGroundRoute(plan:BspAssembly,offset=-12):BspAssembly {
  if(plan.highGround)return plan;
  const a=plan.tunnelPoints[0],b=plan.tunnelPoints.at(-1)!,dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  if(!Number.isFinite(length)||length<16||!Number.isFinite(offset)||Math.abs(offset)<4||Math.abs(offset)>64)
    throw Error('Use a connection at least 16 world units long and a ridge offset from 4 to 64 units.');
  const slopeRoom=.30-Math.abs(b[2]-a[2])/length;
  if(slopeRoom<=0)throw Error('The lower route is too steep for an added ridge ramp. Choose gentler source floors first.');
  const rise=Math.min(6,length*.2*slopeRoom);
  const at=(t:number,z:number):Vec3=>[a[0]+dx*t-dy/length*offset,a[1]+dy*t+dx/length*offset,a[2]+(b[2]-a[2])*t+z];
  const points:Vec3[]=[[...a],at(.2,0),at(.4,rise),at(.6,rise),at(.8,0),[...b]];
  if(points.flat().some(n=>!Number.isFinite(n)||Math.abs(n)>2048))throw Error('The ridge exceeds the supported world bounds.');
  return {...plan,highGround:{points,width:4,height:8,shaderPath:plan.terrainSeam?.baseShaderPath??plan.tunnelShaderPath}};
}
/** One source edit; never certifies Warthog physics or sniper visibility. */
export function makeThreeRouteSeam(plan:BspAssembly):BspAssembly {
  const next=addHighGroundRoute(addInfantryTunnel(plan));
  return {...next,tunnelWidth:Math.max(6,next.tunnelWidth),tunnelHeight:Math.max(4,next.tunnelHeight)};
}
export function assemblyRoutes(plan:BspAssembly){
  return [{id:'primary',label:'Primary connection',points:plan.tunnelPoints,width:plan.tunnelWidth,height:plan.tunnelHeight},
    ...(plan.infantryTunnel?[{id:'infantry',label:'Infantry tunnel',...plan.infantryTunnel}]:[]),
    ...(plan.highGround?[{id:'highGround',label:'High-ground route',...plan.highGround}]:[]),...(plan.sections??[]).map(section=>({...section,label:section.name}))];
}

/** Keep exact native endpoints/materials while starting with an unraised strip. */
export function flattenTerrainConnector(plan:BspAssembly):BspAssembly {
 if(!plan.terrainSeam)throw Error('Plan adjacent terrain before flattening its connector.');
 return {...plan,terrainSeam:{...plan.terrainSeam,bankHeight:0}};
}
