/** Per-window preview budgets. These never discard project/history data or
 * change native source decoding. Texture bytes estimate owned texture payloads,
 * not a driver-level GPU allocation quota. */
export interface PreviewBudgets {
  decodedMiB: number;
  textureMiB: number;
  warmEditors: number;
}
const key = 'spark.previewBudgets.v1';
export const defaultPreviewBudgets: PreviewBudgets = { decodedMiB: 64, textureMiB: 256, warmEditors: 2 };
export function validatePreviewBudgets(value: PreviewBudgets) {
  if (
    !Number.isInteger(value.decodedMiB) ||
    value.decodedMiB < 16 ||
    value.decodedMiB > 512 ||
    !Number.isInteger(value.textureMiB) ||
    value.textureMiB < 64 ||
    value.textureMiB > 1024 ||
    !Number.isInteger(value.warmEditors) ||
    value.warmEditors < 1 ||
    value.warmEditors > 4
  )
    throw Error(
      'Choose 16–512 MiB decoded previews, 64–1024 MiB textures per viewport, and 1–4 warm editors.',
    );
  return value;
}
export function previewBudgets(): PreviewBudgets {
  try {
    return validatePreviewBudgets(JSON.parse(localStorage.getItem(key) ?? 'null'));
  } catch {
    return { ...defaultPreviewBudgets };
  }
}
export function savePreviewBudgets(value: PreviewBudgets) {
  validatePreviewBudgets(value);
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent('spark-preview-budgets'));
}
export const decodedPreviewBudget = () => previewBudgets().decodedMiB * 1024 ** 2;
export const texturePreviewBudget = () => previewBudgets().textureMiB * 1024 ** 2;
