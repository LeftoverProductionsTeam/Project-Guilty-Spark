import type { MapInspection, Project, Tag } from './types';
export interface TagDuplicate {
  id: string;
  sourceTagId: number;
  ownerTagId: number;
  path: string;
}
const normalized = (path: string) => path.replace(/\\/g, '/').toLowerCase();
export function queueTagDuplicate(
  project: Project,
  inspection: MapInspection,
  source: Tag,
  ownerTagId: number,
  path: string,
): Project {
  if (!project.source || project.quickForge)
    throw Error('Build and open a source map before duplicating its tags.');
  const plans = project.tagDuplicates ?? [],
    parts = normalized(path).split('/');
  if (
    !path ||
    path.length > 240 ||
    /[^\x20-\x7e]|[:*?\[\]<>"|]/.test(path) ||
    parts.some((p) => !p || p === '.' || p === '..' || p.endsWith(' ') || p.endsWith('.'))
  )
    throw Error('Choose a relative tag path without an extension or reserved filename characters.');
  if (['scnr', 'sbsp', 'matg'].includes(source.class))
    throw Error('Scenario, BSP and globals roots use their dedicated rebuild workflows.');
  if (!inspection.tags.some((t) => t.id === ownerTagId) || ownerTagId === source.id)
    throw Error('Choose another tag that references this source.');
  if (
    plans.length >= 128 ||
    inspection.tags.some((t) => t.class === source.class && normalized(t.path) === normalized(path)) ||
    plans.some(
      (p) =>
        normalized(p.path) === normalized(path) ||
        (p.sourceTagId === source.id && p.ownerTagId === ownerTagId),
    )
  )
    throw Error(
      'This path or source/owner binding is already in use, or the 128-duplicate limit is reached.',
    );
  return {
    ...project,
    tagDuplicates: [...plans, { id: crypto.randomUUID(), sourceTagId: source.id, ownerTagId, path }],
  };
}
