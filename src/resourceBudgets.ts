/** Per-window preview budgets. These never discard project/history data or
 * change native source decoding. Texture bytes estimate owned texture payloads,
 * not a driver-level GPU allocation quota. */
export interface PreviewBudgets {
  decodedMiB: number;
  textureMiB: number;
  warmEditors: number;
  inspectionMiB?:number;
}
const key = 'spark.previewBudgets.v1';
export const defaultPreviewBudgets: PreviewBudgets = { decodedMiB: 64, textureMiB: 256, warmEditors: 2, inspectionMiB:256 };
export function validatePreviewBudgets(value: PreviewBudgets) {
  const inspection=value?.inspectionMiB??256;
  if (
    !value||!Number.isInteger(inspection)||inspection<16||inspection>1024||
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
      'Choose 16–512 MiB reusable previews, 16–1024 MiB native map data, 64–1024 MiB textures per viewport, and 1–4 warm editors.',
    );
  return {...value,inspectionMiB:inspection};
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
  localStorage.setItem(key, JSON.stringify(validatePreviewBudgets(value)));
  window.dispatchEvent(new CustomEvent('spark-preview-budgets'));
}
export const decodedPreviewBudget = () => previewBudgets().decodedMiB * 1024 ** 2;
export const texturePreviewBudget = () => previewBudgets().textureMiB * 1024 ** 2;

// Split one user-reviewed CPU reuse quota; these pools cannot each spend it twice.
export const nativePreviewBudget=()=>Math.floor(decodedPreviewBudget()/2);
export const pixelPreviewBudget=()=>decodedPreviewBudget()-nativePreviewBudget();
