import type { MapInspection, Project, Tag } from './types';
export interface TagRename { sourceTagId: number; path: string }
const normalize = (path: string) => path.replaceAll('\\', '/').toLowerCase();
export const renamedTagPath = (project: Project, tag: Tag) =>
  project.tagRenames?.find(rename => rename.sourceTagId === tag.id)?.path ?? tag.path;
export function queueTagRename(project: Project, inspection: MapInspection, tag: Tag, name: string): Project {
  if (!project.source || project.quickForge || project.source.sha256 !== inspection.sha256)
    throw Error('Open a preserved map revision before renaming its tags.');
  if (![6, 7, 13, 609].includes(inspection.header.version))
    throw Error('This cache needs a compatible native extraction route before its tags can be renamed.');
  if (['scnr', 'sbsp', 'matg'].includes(tag.class))
    throw Error('Scenario, BSP and globals roots use their dedicated build paths.');
  if (inspection.tags.filter(candidate => candidate.class === tag.class && normalize(candidate.path) === normalize(tag.path)).length !== 1)
    throw Error('This tag identity is ambiguous in the preserved map.');
  const value = name.trim().replaceAll('\\', '/');
  const parent = tag.path.replaceAll('\\', '/').split('/').slice(0, -1).join('/');
  const path = value.includes('/') || !parent ? value : `${parent}/${value}`;
  const parts = path.split('/');
  if (!value || path.length > 240 || path.startsWith('-') || /[^\x20-\x7e]|[:*?\[\]<>"|]/.test(path) ||
      parts.some(part => !part || part === '.' || part === '..' || /[ .]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part)))
    throw Error('Choose a name or relative tag path without reserved characters, trailing dots or an extension.');
  const others = (project.tagRenames ?? []).filter(rename => rename.sourceTagId !== tag.id);
  if (normalize(path) === normalize(tag.path)) return { ...project, tagRenames: others };
  if (others.length >= 128 || inspection.tags.some(candidate => candidate.class === tag.class && normalize(candidate.path) === normalize(path)) ||
      others.some(rename => inspection.tags.find(candidate => candidate.id === rename.sourceTagId)?.class === tag.class && normalize(rename.path) === normalize(path)) ||
      project.tagDuplicates?.some(duplicate => duplicate.sourceTagId === tag.id || duplicate.ownerTagId === tag.id || normalize(duplicate.path) === normalize(path)))
    throw Error('That tag name is already in use, conflicts with a queued duplicate, or exceeds the 128-rename limit.');
  return { ...project, tagRenames: [...others, { sourceTagId: tag.id, path }] };
}
