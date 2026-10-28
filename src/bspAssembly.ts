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
    ordered(plan ? { ...plan, includeDonorScenery: plan.includeDonorScenery ?? false } : null),
  );
}
/** Move the imported section and keep its tunnel mouth attached. */
export function transformAssembly(plan: BspAssembly, translation: Vec3, yawDegrees: number): BspAssembly {
  const last = plan.tunnelPoints.at(-1)!,
    relative = last.map((v, i) => v - plan.translation[i]) as Vec3;
  const angle = ((yawDegrees - plan.yawDegrees) * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle);
  const end: Vec3 = [
    translation[0] + c * relative[0] - s * relative[1],
    translation[1] + s * relative[0] + c * relative[1],
    translation[2] + relative[2],
  ];
  return {
    ...plan,
    translation,
    yawDegrees,
    tunnelPoints: plan.tunnelPoints.map((p, i) => (i === plan.tunnelPoints.length - 1 ? end : p)),
  };
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
  return { ...plan, translation, yawDegrees };
}
