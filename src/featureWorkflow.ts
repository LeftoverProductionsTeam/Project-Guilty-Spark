import type { SparkFeature } from './featureCatalog';
import type { Project, Workspace } from './types';
import { writeMapSession } from './mapSession';

export function featureWorkflowTarget(feature: SparkFeature, project: Project | null): Workspace {
  return (feature.needsProject && !project) || (feature.workshopEntry && !project?.quickForge)
    ? 'library'
    : feature.workspace;
}
/** Navigation only: never insert demo geometry, launch Halo or mark a test passed. */
export function openFeatureWorkflow(
  feature: SparkFeature,
  project: Project | null,
  navigate: (workspace: Workspace) => void,
) {
  const target = featureWorkflowTarget(feature, project);
  if (target !== 'library' && project?.quickForge && feature.workshopEntry) {
    writeMapSession(project.id, 'forge.bspWorkshop', feature.workshopEntry !== 'objects');
    if (feature.workshopEntry !== 'objects') writeMapSession(project.id, 'bsp.tool', feature.workshopEntry);
  }
  navigate(target);
}
