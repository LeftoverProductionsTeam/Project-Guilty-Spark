import type { Bootstrap, OpenProject, Project, RuntimeId } from './types';

export type DependencyState = 'ready' | 'setupRequired' | 'unverified' | 'notApplicable' | 'blocked';
export interface DependencyAction {
  id: string;
  kind: 'installH1aViaSteam' | 'openOfficialPage' | 'chooseSetting' | 'chooseResources' | 'chooseAssets';
  label: string;
  target: string | null;
  requiresReview: boolean;
}
export interface DependencyItem {
  id: string;
  label: string;
  state: DependencyState;
  detail: string;
  path: string | null;
  sha256: string | null;
  architecture: string | null;
  actions: DependencyAction[];
}
export interface DependencyReport {
  schemaVersion: number;
  runtimeId: RuntimeId;
  platform: string;
  projectId: string | null;
  items: DependencyItem[];
  diagnostics: string[];
}
export interface DependencyActionPlan {
  id: string;
  actionId: string;
  runtimeId: RuntimeId;
  projectId: string | null;
  label: string;
  uri: string;
  executable: string;
  executableSha256: string;
  executableArchitecture: string;
  arguments: string[];
  expiresAtUnix: number;
  detail: string;
}
export interface DependencyChoiceResult {
  bootstrap: Bootstrap | null;
  opened: OpenProject | null;
}

export const dependencyStateLabel: Record<DependencyState, string> = {
  ready: 'Checked',
  setupRequired: 'Setup needed',
  unverified: 'Preflight needed',
  notApplicable: 'Not needed here',
  blocked: 'Action blocked',
};
export function dependencyContextMatches(
  result: Pick<DependencyReport, 'runtimeId' | 'projectId'>,
  runtime: RuntimeId,
  project: Project | null,
): boolean {
  return result.runtimeId === runtime && result.projectId === (project?.id ?? null);
}

/** A native picker returns the saved map. Copy only its intended dependency
 * fields into the latest authored document, retaining unsaved scene/tag work. */
export function mergeDependencyChoice(
  current: Project,
  before: Project,
  incoming: OpenProject,
  actionId: string,
): OpenProject {
  const saved = incoming.project;
  if (
    current.id !== before.id ||
    saved.id !== before.id ||
    current.source?.sha256 !== before.source?.sha256 ||
    saved.source?.sha256 !== before.source?.sha256
  ) {
    throw new Error(
      'The selected map/source changed while setup was open. Refresh setup for the current map.',
    );
  }
  let project: Project = { ...current };
  if (actionId === 'resources.choose') {
    if (!current.source || !saved.source || !before.source)
      throw new Error('This map has no imported source resources.');
    if (
      current.source.resourceDirectory !== before.source.resourceDirectory ||
      JSON.stringify(current.source.resourceSha256 ?? {}) !==
        JSON.stringify(before.source.resourceSha256 ?? {})
    ) {
      throw new Error(
        'This map’s resource selection changed while the picker was open. Your current choice was retained.',
      );
    }
    project.source = {
      ...current.source,
      resourceDirectory: saved.source.resourceDirectory,
      resourceSha256: saved.source.resourceSha256,
    };
  } else if (['h1a.choose', 'tags.choose', 'invader.choose'].includes(actionId)) {
    if (
      current.activeBuildTarget !== before.activeBuildTarget ||
      saved.activeBuildTarget !== before.activeBuildTarget
    ) {
      throw new Error(
        'The active map tool profile changed while setup was open. Your current profile was retained.',
      );
    }
    const id = before.activeBuildTarget;
    if (id) {
      const original = before.buildTargets?.find((t) => t.id === id);
      const latest = current.buildTargets?.find((t) => t.id === id);
      const chosen = saved.buildTargets?.find((t) => t.id === id);
      if (
        !original ||
        !latest ||
        !chosen ||
        latest.runtimeId !== original.runtimeId ||
        chosen.runtimeId !== original.runtimeId
      ) {
        throw new Error('The map tool profile changed while setup was open. Refresh before choosing tools.');
      }
      const fields =
        actionId === 'h1a.choose'
          ? (['hekDirectory', 'hekFlavor'] as const)
          : actionId === 'tags.choose'
            ? (['tagsDirectory'] as const)
            : (['invaderDirectory'] as const);
      if (fields.some((key) => latest[key] !== original[key]))
        throw new Error(
          'This map’s tool path changed while the picker was open. Your current path was retained.',
        );
      const updated = { ...latest };
      for (const key of fields) Object.assign(updated, { [key]: chosen[key] });
      project.buildTargets = current.buildTargets?.map((target) => (target.id === id ? updated : target));
    }
  }
  return { project, inspection: actionId === 'resources.choose' ? incoming.inspection : null };
}
