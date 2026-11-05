import { inspectTagLineage } from './tagLineage';
import type { MapInspection, Project, Tag } from './types';

export const TAG_CONTEXTS = ['Properties', 'Materials', 'Animation', 'Collision', 'Sound', 'Logic', 'Dependencies', 'Native Output'] as const;
export type TagContext = typeof TAG_CONTEXTS[number];
export const defaultTagContext = (tag: Tag): TagContext => tag.class === 'snd!' ? 'Sound' : tag.class === 'bitm' ? 'Materials' : 'Properties';
export const isTagContext = (value: unknown): value is TagContext => TAG_CONTEXTS.includes(value as TagContext);
const collisionObjects = new Set(['weap','eqip','scen','vehi','bipd','garb','mach','ctrl','lifi','ssce','itmc']);

/** Categorize only the existing bounded, source-verified reference walk. No new resolver. */
export function inspectTagContexts(project: Project, inspection: MapInspection, tag: Tag) {
  try {
    const report = inspectTagLineage(project, inspection, tag.id);
    const byId = new Map(inspection.tags.map(value => [value.id, value]));
    const related = report.nodes.map(node => byId.get(node.tagId)!).filter(Boolean);
    return {
      materials: related.filter(value => !!value.shaderPreview),
      bitmaps: related.filter(value => value.class === 'bitm'),
      animations: related.filter(value => value.class === 'antr'),
      sounds: related.filter(value => value.class === 'snd!'),
      collision: collisionObjects.has(tag.class) && !tag.external,
      warning: report.truncations.length ? `The indexed dependency view is bounded: ${report.truncations.join(', ')}.` : '',
      error: '',
    };
  } catch (error) {
    return {materials: [], bitmaps: [], animations: [], sounds: [], collision: false, warning: '', error: String(error)};
  }
}
