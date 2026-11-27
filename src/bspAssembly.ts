import type { Project, Vec3 } from './types';
import type { NativeVolumeGeometry } from './nativeOperations';
export const NATIVE_BSP_SWITCH_PREVIEW = 'world.compiled-bsp-switch';
export interface NativeBspSwitchPreview {
  cacheSha256: string;
  triggerIndex: number;
  triggerName: string;
  sourceBsp: number;
  destinationBsp: number;
  geometry: NativeVolumeGeometry;
}
export interface SeamEdge {sourceSha256:string;bspIndex:number;vertices:[Vec3,Vec3];point:Vec3;}
export interface SeamSection {id:string;name:string;points:Vec3[];width:number;height:number;shaderPath:string;openRoad?:boolean;archSegments?:number;edges:[SeamEdge,SeamEdge];}
export interface BspAssembly {
  schemaVersion: 1;
  atlasOrigin?: import('./megaworldLayout').LayoutRegion;
  atlasFromRegionId?: string;
  donorProjectId: string;
  donorTitle: string;
  donorSource: NonNullable<Project['source']>;
  donorTagsDirectory: string;
  donorBspIndex: number;
  baseBspIndex?: number;
  includeDonorScenery?: boolean;
  separateNativeBsps?: boolean;
  preserveDonorBsp?: boolean;
  restoreDonorSkyPortals?: boolean;
  outdoorSkySplit?: number;
  tunnelBakeFill?: boolean;
  directionalDonorLanding?: boolean;
  fitPassageFloor?: boolean;
  translation: Vec3;
  yawDegrees: number;
  tunnelPoints: Vec3[];
  tunnelWidth: number;
  tunnelHeight: number;
  tunnelShaderPath: string;
  openRoad?: boolean;
  terrainSeam?: {shoulderWidth:number;bankHeight:number;baseShaderPath:string;donorShaderPath:string;bearingDegrees?:number;gradeRoad?:boolean};
  infantryTunnel?: {points:Vec3[];width:number;height:number;shaderPath:string};
  highGround?: {points:Vec3[];width:number;height:number;shaderPath:string};
  sections?:SeamSection[];
  archSegments?:number;
  nativeSeals?: (Vec3[] | { vertices: [Vec3, Vec3, Vec3]; lift: number })[];
  visibilityZones?: import('./visibilityZones').VisibilityZone[];
}
export interface BspOption {
  index: number;
  name: string;
  triangles: number;
}
interface ScenarioPlacementBudget {
  existing: number;
  donor: number;
  limit: number;
}
interface AssemblySourceIssue {
  triangle: number;
  material: string;
  center: Vec3;
  vertices: [Vec3, Vec3, Vec3];
  reason: string;
  overlapsTriangle?: number;
  overlappingVertices?: [Vec3, Vec3, Vec3];
}

interface AssemblySourcePreflight {
  blockedFaces: number;
  overlapCheckIncomplete?: boolean;
  lightingRisks: number;
  examples: AssemblySourceIssue[];
  lightingExamples: AssemblySourceIssue[];
}

export interface AssemblyReport {
  inputTriangles: number;
  outputTriangles: number;
  connectorTriangles?: number;
  generatedUvFaces: number;
  walkSamples: number;
  portalCount: number;
  donorScenery?: number;
  nativeGameplayBudget?: {
    playerStarts: ScenarioPlacementBudget;
    netgameEquipment: ScenarioPlacementBudget;
    netgameFlags: ScenarioPlacementBudget;
    vehicles?: ScenarioPlacementBudget;
    mcc13Vehicles?: ScenarioPlacementBudget;
    mcc13RegionalFlags?: ScenarioPlacementBudget;
    mcc13RegionalStarts?: ScenarioPlacementBudget;
    mcc13RegionalEquipment?: ScenarioPlacementBudget;
  };
  nativeGameplayBudgetError?: string;
  intactSwitches?: string[];
  nativePartitions?: { selected: number; overlapSamples: number; maxFloorDelta: number };
  routeClearance?: {label:string;width:number;clearHeight:number;walkSamples:number;lateralSamples?:number}[];
  warnings: string[];
  sourcePreflight?: AssemblySourcePreflight;
  viewport?: {projectId:string;sourceSha256:string;donorSha256:string;assembly:BspAssembly;retainsBase?:boolean;retainsDonor?:boolean;sourcePreflight?:AssemblySourcePreflight;surfaces:{source:number;mesh:import('./types').MeshData}[]};
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
    ordered(plan ? { ...plan, baseBspIndex: plan.baseBspIndex || undefined, sections:plan.sections?.length?plan.sections.map(section=>({...route(section),openRoad:section.openRoad??false})):undefined, archSegments:plan.archSegments??undefined, tunnelWidth:Math.fround(plan.tunnelWidth), tunnelHeight:Math.fround(plan.tunnelHeight), nativeSeals: plan.nativeSeals?.length ? plan.nativeSeals : undefined, visibilityZones: plan.visibilityZones?.length ? plan.visibilityZones : undefined, includeDonorScenery: plan.includeDonorScenery ?? false, separateNativeBsps: plan.separateNativeBsps || undefined, preserveDonorBsp: plan.preserveDonorBsp || undefined, restoreDonorSkyPortals: plan.restoreDonorSkyPortals || undefined, outdoorSkySplit: plan.outdoorSkySplit ?? undefined, tunnelBakeFill: plan.tunnelBakeFill || undefined, directionalDonorLanding: plan.directionalDonorLanding || undefined, fitPassageFloor: plan.fitPassageFloor || undefined, openRoad: plan.openRoad || undefined, infantryTunnel: route(plan.infantryTunnel), terrainSeam:plan.terrainSeam??undefined, highGround:route(plan.highGround) } : null),
  );
}
export function nativeSealVertices(text: string): Vec3[] {
  const rows = text.trim().split(/\r?\n/);
  const points = rows.map(row => row.trim().split(/[ ,\t]+/).filter(Boolean).map(Number));
  if (points.length < 3 || points.length > 4 || points.some(point =>
    point.length !== 3 || point.some(n => !Number.isFinite(n) || Math.abs(n) > 2048)
  )) {
    throw new Error('Enter three or four boundary vertices as X Y Z, one per line.');
  }
  return points as Vec3[];
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

export function moveDonorToLandingDistance(plan: BspAssembly, distance: number): BspAssembly {
  const base = plan.tunnelPoints[0];
  const donor = plan.tunnelPoints.at(-1);
  if (!base || !donor || !Number.isFinite(distance) || distance <= 0) return plan;
  const dx = donor[0] - base[0], dy = donor[1] - base[1];
  const current = Math.hypot(dx, dy);
  if (current <= Number.EPSILON || Math.abs(current - distance) <= 1e-6) return plan;
  const scale = (distance - current) / current;
  return transformAssembly(plan, [
    plan.translation[0] + dx * scale,
    plan.translation[1] + dy * scale,
    plan.translation[2],
  ], plan.yawDegrees);
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
/** A level deck with graded approaches, using the existing native ridge route. */
export function addFlatLandBridge(plan:BspAssembly):BspAssembly {
  if(plan.separateNativeBsps)throw Error('Use a joined BSP draft to author a land bridge.');
  const landings=plan.highGround?.points??plan.tunnelPoints;
  const start=landings[0],end=landings.at(-1)!;
  const dx=end[0]-start[0],dy=end[1]-start[1],length=Math.hypot(dx,dy);
  if(!Number.isFinite(length)||length<16)throw Error('Pick supported bridge landings at least 16 world units apart.');

  const width=Math.max(6,plan.highGround?.width??0);
  const offset=-Math.max(12,(plan.tunnelWidth+width)/2+1);
  const at=(t:number):Vec3=>[start[0]+dx*t-dy/length*offset,start[1]+dy*t+dx/length*offset,0];
  const approach=at(.2),deckStart=at(.4),deckEnd=at(.6),departure=at(.8);
  const distance=(a:Vec3,b:Vec3)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
  const startRun=distance(approach,deckStart);
  const endRun=distance(deckEnd,departure);
  const high=Math.max(start[2],end[2]);
  const deckHeight=Math.min(high+3,start[2]+startRun*.25,end[2]+endRun*.25);
  if(!Number.isFinite(deckHeight)||deckHeight<high+.5)throw Error('Choose closer landing elevations or leave more room for the approach ramps.');
  approach[2]=start[2];
  departure[2]=end[2];
  deckStart[2]=deckEnd[2]=deckHeight;
  const points:Vec3[]=[[...start],approach,deckStart,deckEnd,departure,[...end]];
  if(points.flat().some(value=>!Number.isFinite(value)||Math.abs(value)>2048))throw Error('The land bridge exceeds the supported world bounds.');
  const bridge={...plan,highGround:{
    points,width,height:Math.max(8,plan.highGround?.height??0),
    shaderPath:plan.highGround?.shaderPath??plan.terrainSeam?.baseShaderPath??plan.tunnelShaderPath,
  }};
  const joined=bridge.terrainSeam?fillTerrainToRidge(bridge):bridge;
  return addInfantryTunnel(joined);
}

/** Size the real terrain ribbon to meet the ridge deck without changing either source BSP. */
export function fillTerrainToRidge(plan:BspAssembly):BspAssembly {
  if(!plan.terrainSeam||!plan.highGround)throw Error('Plan adjacent terrain and a high-ground route first.');
  const [start,end]=plan.tunnelPoints;
  const dx=end[0]-start[0],dy=end[1]-start[1],length=Math.hypot(dx,dy);
  if(!Number.isFinite(length)||length<4)throw Error('Choose two separated road endpoints first.');
  const ridgeReach=Math.max(...plan.highGround.points.map(([x,y])=>Math.abs(((y-start[1])*dx-(x-start[0])*dy)/length)));
  const shoulderWidth=Math.ceil((ridgeReach+plan.highGround.width/2+1-plan.tunnelWidth/2)*2)/2;
  if(!Number.isFinite(shoulderWidth)||shoulderWidth>24)throw Error('The ridge is beyond the terrain fill limit. Move it closer or connect that section separately.');
  if(shoulderWidth<=plan.terrainSeam.shoulderWidth)return plan;
  return {...plan,terrainSeam:{...plan.terrainSeam,shoulderWidth}};
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
