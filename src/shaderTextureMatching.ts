/** Read-only, exact-match local texture attribution.
 * No image data, file paths or copyrighted pixels enter saved projects.
 * Match a shader's verified bitmap dependency first; otherwise match only its
 * exact unique shader basename. Never fuzzy-guess or silently choose duplicates.
 */
import type { MapInspection, Tag } from './types';

export interface LocalTextureCandidate {
  name: string;
  webkitRelativePath?: string;
  size: number;
}
export interface ShaderTextureMatch {
  shaderTagId: number;
  fileIndex: number;
  method: 'bitmap-dependency' | 'shader-basename';
  expectedPath: string;
}
export interface ShaderTextureMatches {
  assignments: ShaderTextureMatch[];
  skipped: { shaderTagId: number; reason: string }[];
}
const extensions = /\.(dds|png|jpe?g|webp)$/i;
const maxFiles = 256;
const maxBatchBytes = 256 * 1024 * 1024;
const safeName = (s: string) => s.trim().replace(/\\/g,'/').replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
const stem = (s: string) => safeName(s).replace(extensions, '');
const basename = (s: string) => s.split('/').at(-1) ?? '';
const isSourceFile = (s: LocalTextureCandidate) => extensions.test(s.name) &&
  Number.isSafeInteger(s.size) && s.size > 0 && s.size <= 96*1024*1024;

/** A file is uniquely identified only by its exact normalized path or unique basename. */
export function matchLocalShaderTextures(
  inspection: Pick<MapInspection, 'tags'>,
  shaderTagIds: readonly number[],
  files: readonly LocalTextureCandidate[],
): ShaderTextureMatches {
  if (files.length > maxFiles || files.reduce((n, f) => n + f.size, 0) > maxBatchBytes)
    throw new Error('Choose no more than 256 local images totaling 256 MiB.');
  const byBase = new Map<string, number[]>();
  const byPath = new Map<string, number[]>();
  files.forEach((f, index) => {
    if (!isSourceFile(f)) return;
    const base = stem(f.name);
    byBase.set(base, [...(byBase.get(base) ?? []), index]);
    const relative = stem(f.webkitRelativePath ?? '');
    if (relative) byPath.set(relative, [...(byPath.get(relative) ?? []), index]);
  });
  const tagMap = new Map<number, Tag>(inspection.tags.map(t => [t.id, t]));
  const assignments: ShaderTextureMatch[] = [], skipped: ShaderTextureMatches['skipped'] = [];
  // The same basename can occur in unrelated Halo tag directories. A user
  // selected file named 'dirt.dds' must not silently bind to both.
  const shaderPathIds = new Set(shaderTagIds);
  const basenameOwners = (candidate: Tag) => inspection.tags.filter(t =>
    t.class === candidate.class &&
    (candidate.class === 'bitm' || shaderPathIds.has(t.id)) &&
    basename(stem(t.path)) === basename(stem(candidate.path))
  ).length;
  for (const tagId of new Set(shaderTagIds)) {
    const tag = tagMap.get(tagId);
    if (!tag) { skipped.push({shaderTagId:tagId,reason:'Shader datum is not in the inspected tag index'}); continue; }
    // The native cache reader explicitly reports whether the *primary* map
    // reference was resolved. Never fall back to shader filenames when the
    // real dependency is empty, invalid, external, or undecodable.
    const status=tag.primaryBitmapStatus;
    if(status && status!=='resolved') {
      skipped.push({shaderTagId:tagId,reason:`Native shader bitmap attribution is ${status}; choose a source image manually`});
      continue;
    }
    const refs = (tag.references??[]).filter(r => r.class === 'bitm' && tagMap.get(r.targetId)?.class === 'bitm');
    // A detail/normal/bump bitmap is not automatically a diffuse/base map.
    // Only a known primary-map reference may drive automatic preview mapping.
    const preferred = refs.filter(r => /^(?:base map|base texture|diffuse map|diffuse texture|primary map|albedo map|bitmap)$/i.test(r.label.trim()));
    if (status==='resolved' && preferred.length!==1) {
      skipped.push({shaderTagId:tagId,reason:'Native base/diffuse dependency was declared but is missing or ambiguous; select manually'});continue;
    }
    if (refs.length && !preferred.length) {
      skipped.push({shaderTagId:tagId,reason:'Bitmap references exist but none is a verified base map; select manually'});continue;
    }
    const chosenRefs = preferred;
    if (chosenRefs.length > 1) {
      skipped.push({shaderTagId:tagId,reason:'Multiple candidate bitmap dependencies; choose manually'}); continue;
    }
    const dependency = chosenRefs.length === 1 ? tagMap.get(chosenRefs[0].targetId) : null;
    const path = stem(dependency?.path ?? tag.path);
    const method = dependency ? 'bitmap-dependency' : 'shader-basename';
    const candidates = [...byPath].filter(([relative]) => relative === path || relative.endsWith('/'+path))
      .flatMap(([,indices]) => indices);
    // A full path match may distinguish two tags named 'dirt'. A basename
    // fallback is safe only when that basename is unique in its tag class.
    if (!candidates.length && basenameOwners(dependency ?? tag) > 1) {
      skipped.push({shaderTagId:tagId,reason:'Shared basename across different Halo tag paths; exact relative path required'});
      continue;
    }
    const unique = new Set(candidates.length ? candidates : (byBase.get(basename(path)) ?? []));
    if (unique.size !== 1) {
      skipped.push({shaderTagId:tagId,reason:unique.size ? 'Ambiguous local texture filenames' : 'No exact local image match'});
      continue;
    }
    assignments.push({shaderTagId:tagId,fileIndex:[...unique][0],method,expectedPath:dependency?.path ?? tag.path});
  }
  return {assignments,skipped};
}
