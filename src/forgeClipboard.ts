import { appendForgeNodes, brushNames, forgeNodes, nodeRotation, transformForgeNode } from './forge';
import type { ForgeNode, ForgeMaterial, ForgeAsset } from './forge';
import type { Project, NativeAssetImport, RuntimeId } from './types';
import { prepareAssetImport, attachAssetImport } from './nativeAssetImport';

interface ForgeClipboard {
  version: 1;
  sourceProjectId: string;
  runtimeId: RuntimeId;
  nodes: ForgeNode[];
  materials: ForgeMaterial[];
  nativeImports: NativeAssetImport[];
}
const key = 'guilty-spark:forge-clipboard-v1',
  limit = 256 * 1024;
let fallback: ForgeClipboard | null = null;
const text = (v: unknown, max = 256): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max && !/[\x00-\x1f]/.test(v);
function validate(value: unknown): asserts value is ForgeClipboard {
  if (!value || typeof value !== 'object') throw Error('Copy compatible QuickForge objects first (Ctrl+C).');
  const clip = value as ForgeClipboard;
  if (
    clip.version !== 1 ||
    !text(clip.sourceProjectId, 128) ||
    !['mccSteam', 'haloCustomEdition', 'openCe', 'chupathingyCe', 'haloPc'].includes(clip.runtimeId) ||
    !Array.isArray(clip.nodes) ||
    clip.nodes.length < 1 ||
    clip.nodes.length > 128 ||
    !Array.isArray(clip.materials) ||
    clip.materials.length > 128 ||
    !Array.isArray(clip.nativeImports) ||
    clip.nativeImports.length > 128
  )
    throw Error('The copied QuickForge selection is invalid or too large.');
  const ids = new Set<string>();
  for (const node of clip.nodes) {
    if (
      !node ||
      !['brush', 'placement', 'spawn', 'objective'].includes(node.type) ||
      !node.value ||
      !text(node.value.id, 128) ||
      ids.has(node.value.id) ||
      !text(node.value.name) ||
      node.value.locked !== false ||
      typeof node.value.visible !== 'boolean' ||
      !Array.isArray(node.value.position) ||
      node.value.position.length !== 3
    )
      throw Error('The copied selection contains an invalid or locked object.');
    ids.add(node.value.id);
    transformForgeNode(node, node.value.position, nodeRotation(node), [1, 1, 1]);
    if (node.type === 'brush' && !Object.hasOwn(brushNames, node.value.kind))
      throw Error('The copied geometry kind is unsupported.');
    if (
      node.type === 'placement' &&
      (!['scen', 'weap', 'eqip', 'vehi', 'bipd', 'itmc'].includes(node.value.tagClass) ||
        !text(node.value.tagPath))
    )
      throw Error('The copied asset class or native tag path is unsupported.');
  }
  for (const m of clip.materials)
    if (
      !text(m.id, 128) ||
      !text(m.name) ||
      !Array.isArray(m.color) ||
      m.color.length !== 3 ||
      !m.color.every((v) => Number.isFinite(v) && v >= 0 && v <= 1) ||
      (m.shaderPath !== null && !text(m.shaderPath))
    )
      throw Error('The copied material is invalid.');
}
export function copyForgeSelection(project: Project, ids: string[]): number {
  if (!project.quickForge) return 0;
  const nodes = forgeNodes(project.quickForge).filter((n) => ids.includes(n.value.id) && !n.value.locked);
  if (!nodes.length) return 0;
  const materialIds = new Set(nodes.flatMap((n) => (n.type === 'brush' ? [n.value.materialId] : [])));
  const materials = project.quickForge.materials.filter((m) => materialIds.has(m.id));
  const value: ForgeClipboard = {
    version: 1,
    sourceProjectId: project.id,
    runtimeId: project.quickForge.runtimeId,
    nodes: structuredClone(nodes),
    materials: structuredClone(materials),
    nativeImports: structuredClone(
      (project.nativeAssetImports ?? []).filter((b) => materials.some((m) => m.shaderPath === b.nativePath)),
    ),
  };
  validate(value);
  const serialized = JSON.stringify(value);
  if (serialized.length > limit)
    throw Error('Copy fewer objects; this selection exceeds the clipboard budget.');
  fallback = value;
  try {
    localStorage.setItem(key, serialized);
  } catch {
    /* This window still has its independent copy. */
  }
  return nodes.length;
}
export function readForgeSelection(): ForgeClipboard | null {
  try {
    const stored = localStorage.getItem(key);
    if (stored && stored.length > limit) return null;
    const value = stored ? JSON.parse(stored) : fallback;
    validate(value);
    return structuredClone(value);
  } catch {
    return null;
  }
}
export interface PreparedForgePaste {
  targetId: string;
  targetRuntime: RuntimeId;
  nodes: ForgeNode[];
  materials: ForgeMaterial[];
  reusedMaterials: ForgeMaterial[];
  bindings: NativeAssetImport[];
}
/** Resolve only original source identities through the existing local native
 * import recipe. Foreign receipt IDs never authorize a target dependency. */
export async function prepareForgePaste(
  project: Project,
  clip: ForgeClipboard,
  prepare = prepareAssetImport,
): Promise<PreparedForgePaste> {
  validate(clip);
  if (!project.quickForge) throw Error('Open an editable QuickForge map before pasting.');
  const result: PreparedForgePaste = {
    targetId: project.id,
    targetRuntime: project.quickForge.runtimeId,
    nodes: structuredClone(clip.nodes),
    materials: [],
    reusedMaterials: [],
    bindings: [],
  };
  const sameMap = clip.sourceProjectId === project.id;
  let staged = project;
  const resolve = async (asset: Omit<ForgeAsset, 'class'> & { class: string }) => {
    if (
      !text(asset.sourceProjectId, 128) ||
      !text(asset.sourceSha256) ||
      !/^[a-f0-9]{64}$/i.test(asset.sourceSha256) ||
      !Number.isSafeInteger(asset.tagId) ||
      asset.tagId < 0 ||
      asset.tagId > 0xffffffff
    )
      throw Error(
        'This copied asset has no verified original native identity. Load its source in Asset library.',
      );
    const binding = await prepare(staged, asset);
    const path = (value: string) => value.replaceAll('\\', '/').toLowerCase();
    if (
      binding.sourceProjectId !== asset.sourceProjectId ||
      binding.sourceSha256 !== asset.sourceSha256 ||
      binding.tagId !== asset.tagId ||
      binding.tagClass !== asset.class ||
      path(binding.tagPath) !== path(asset.path)
    )
      throw Error(
        'The admitted native dependency differs from the copied asset identity. No objects were pasted.',
      );
    staged = attachAssetImport(staged, binding);
    if (!result.bindings.some((b) => b.id === binding.id)) result.bindings.push(binding);
    return binding;
  };
  for (const node of result.nodes) {
    if (node.type !== 'placement') continue;
    const v = node.value;
    if (v.publishedAssetId) {
      if (sameMap && project.quickForge.native?.assets.some((asset) => asset.id === v.publishedAssetId))
        continue;
      throw Error(
        'Shared published assets require destination admission through SparkLink; raw clipboard copies cannot grant it.',
      );
    }
    // Authored loose-tag references have no compiled source to extract. They
    // remain local to their original map and undergo the normal build preflight.
    if (sameMap && v.sourceProjectId === null && v.sourceSha256 === null && v.tagId === null) continue;
    await resolve({
      key: 'clipboard',
      name: v.name,
      path: v.tagPath,
      class: v.tagClass,
      tagId: v.tagId!,
      sourceProjectId: v.sourceProjectId!,
      sourceSha256: v.sourceSha256!,
      cacheVersion: 0,
    });
  }
  const materialMap = new Map<string, string>();
  for (const material of clip.materials) {
    if (sameMap && project.quickForge.materials.some((m) => JSON.stringify(m) === JSON.stringify(material))) {
      materialMap.set(material.id, material.id);
      result.reusedMaterials.push(structuredClone(material));
      continue;
    }
    const next = { ...structuredClone(material), id: crypto.randomUUID() };
    if (material.shaderPath) {
      const original = clip.nativeImports.find(
        (b) => b.tagClass === 'senv' && b.nativePath === material.shaderPath,
      );
      if (!original)
        throw Error(
          `Material “${material.name}” has no verified recursive source binding. Import its original shader before cross-map paste.`,
        );
      const binding = await resolve({
        key: 'clipboard-material',
        name: material.name,
        path: original.tagPath,
        class: original.tagClass,
        tagId: original.tagId,
        sourceProjectId: original.sourceProjectId,
        sourceSha256: original.sourceSha256,
        cacheVersion: 0,
      });
      next.shaderPath = binding.nativePath;
    }
    materialMap.set(material.id, next.id);
    result.materials.push(next);
  }
  for (const node of result.nodes)
    if (node.type === 'brush') {
      const id = materialMap.get(node.value.materialId);
      if (!id) throw Error('The copied geometry is missing its source material.');
      node.value.materialId = id;
    }
  return result;
}
/** Rebase the prepared closure onto the current document, preserving edits
 * made while extraction was running. One caller edit means one Undo. */
export function applyForgePaste(
  current: Project,
  paste: PreparedForgePaste,
): { project: Project; ids: string[] } {
  if (current.id !== paste.targetId || !current.quickForge || current.quickForge.runtimeId !== paste.targetRuntime)
    throw Error('The destination map changed during paste; no objects were added.');
  if (
    paste.reusedMaterials.some(
      (material) =>
        !current.quickForge!.materials.some((m) => JSON.stringify(m) === JSON.stringify(material)),
    )
  )
    throw Error(
      'A copied material changed during paste. Paste again to resolve its current source; no objects were added.',
    );
  let project = current;
  for (const binding of paste.bindings) project = attachAssetImport(project, binding);
  const doc = { ...project.quickForge!, materials: [...project.quickForge!.materials, ...paste.materials] };
  const copied = appendForgeNodes(doc, paste.nodes, [1, 1, 0]);
  return { project: { ...project, quickForge: copied.document }, ids: copied.ids };
}
