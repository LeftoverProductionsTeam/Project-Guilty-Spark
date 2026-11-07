import type { Project, Vec3 } from './types';
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
  infantryTunnel?: {points:Vec3[];width:number;height:number;shaderPath:string};
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
  generatedUvFaces: number;
  walkSamples: number;
  portalCount: number;
  donorScenery?: number;
  warnings: string[];
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
  return JSON.stringify(
    ordered(plan ? { ...plan, visibilityZones: plan.visibilityZones?.length ? plan.visibilityZones : undefined, includeDonorScenery: plan.includeDonorScenery ?? false, openRoad: plan.openRoad || undefined, infantryTunnel: plan.infantryTunnel ?? undefined } : null),
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
    ...(plan.infantryTunnel?{infantryTunnel:{...plan.infantryTunnel,points:moveMouth(plan.infantryTunnel.points,plan.translation,translation,angle)}}:{})};
}
/** A reviewable second route, not a claim of native or vehicle clearance. */
export function addInfantryTunnel(plan:BspAssembly,offset=8):BspAssembly {
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
  return { ...plan, translation, yawDegrees, ...(plan.infantryTunnel?{infantryTunnel:{...plan.infantryTunnel,points:moveMouth(plan.infantryTunnel.points,plan.translation,translation,angle)}}:{}) };
}
