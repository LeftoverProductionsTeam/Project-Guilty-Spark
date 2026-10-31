import type { Project, RuntimeId } from './types';

export type EditRoute = 'directCache' | 'nativeRebuild' | 'workingTags' | 'quickForge' | 'liveSession';
export type EditPreference = 'automatic' | EditRoute;
export type EditIntent =
  | {
      kind: 'setTagNumber';
      tagId: number;
      tagPath: string;
      class: string;
      fieldKey: string;
      before: number;
      after: number;
    }
  | {
      kind: 'transformPlacement';
      objectId: string;
      tagId: number | null;
      beforePosition: number[];
      position: number[];
      beforeRotation: number[];
      rotation: number[];
    }
  | {
      kind: 'moveLiveObject';
      datum: number;
      tagDatum: number;
      expectedPosition: number[];
      position: number[];
    }
  | { kind: 'nativeSourceRevision' | 'generatedGeometry' }
  | { kind: 'structuralSourceChange'; category: string };
export interface EditPlan {
  id: string;
  projectId: string;
  projectFingerprint: string;
  sourceSha256: string | null;
  runtimeId: RuntimeId;
  cacheVersion: number | null;
  intents: EditIntent[];
  choices: { route: EditRoute; available: boolean; reason: string; tools: string[] }[];
  selectedRoute: EditRoute | null;
  recovery: string;
  notes: string[];
  expiresAtUnix: number;
}
export interface EditExecution {
  route: EditRoute;
  jobId: string;
  status: string;
  record: Project['builds'][number] | null;
  liveReceipts: { datum: number; applied: boolean; observedPosition: number[] | null; message: string }[];
  warning?: string | null;
}
export const editRouteNames: Record<EditPreference, string> = {
  automatic: 'Automatic',
  directCache: 'Direct map copy',
  nativeRebuild: 'Extract & rebuild',
  workingTags: 'Build working tags',
  quickForge: 'Build QuickForge source',
  liveSession: 'Temporary live positions',
};
/** View state is deliberately excluded. This key only expires a UI preview; the
 * desktop recomputes its authoritative fingerprint and capabilities at execution. */
export function editRevisionKey(p: Project) {
  return JSON.stringify([
    p.id,
    p.source ? [p.source.sha256, p.source.resourceDirectory ?? null, p.source.resourceSha256 ?? {}] : null,
    p.tagEdits,
    p.scene,
    p.assets,
    p.quickForge,
    p.firefight,
    p.tagDuplicates ?? [],
    p.bspAssembly,
    p.animationAssignments ?? [],
    p.animations?.filter((asset) => p.animationAssignments?.some((a) => a.assetId === asset.id)) ?? [],
    p.powerups ?? [],
    p.studio?.engineMachinima?.enabled ? [p.studio.engineMachinima, p.studio.shots] : null,
    p.conversionProfile,
    p.activeBuildTarget,
    p.buildTargets?.find((t) => t.id === p.activeBuildTarget) ?? null,
  ]);
}
/** Local UI diagnostics only; native fingerprints remain authoritative. */
export function changedEditInputs(before: string, after: string): string[] {
  const names = [
    'Map',
    'Source bindings',
    'Tag edits',
    'Placements',
    'Assets',
    'QuickForge source',
    'Firefight rules',
    'Tag duplicates',
    'BSP assembly',
    'Animation assignments',
    'Animation sources',
    'Power-ups',
    'Engine camera',
    'Conversion profile',
    'Active build target',
    'Build tools',
  ];
  const old = JSON.parse(before) as unknown[],
    next = JSON.parse(after) as unknown[];
  return names.filter((_, i) => JSON.stringify(old[i]) !== JSON.stringify(next[i]));
}
export function intentDescription(intent: EditIntent): string {
  switch (intent.kind) {
    case 'setTagNumber':
      return `${intent.tagPath} · ${intent.fieldKey}: ${intent.before} → ${intent.after}`;
    case 'transformPlacement':
      return `Placement ${intent.objectId}: [${intent.beforePosition.join(', ')}] → [${intent.position.join(', ')}]; rotation [${intent.beforeRotation.join(', ')}] → [${intent.rotation.join(', ')}]`;
    case 'moveLiveObject':
      return `Live object #${intent.datum.toString(16)}: [${intent.expectedPosition.join(', ')}] → [${intent.position.join(', ')}]`;
    case 'nativeSourceRevision':
      return 'Compile the accepted native tag revision';
    case 'generatedGeometry':
      return 'Compile generated level geometry and collision';
    case 'structuralSourceChange':
      return intent.category;
  }
}
