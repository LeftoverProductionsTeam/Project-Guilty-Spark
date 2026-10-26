/** Game-owned Halo 1 UI art gate. The stored preference is ONLY a source-pinned
 * tag reference. A decoded bitmap is optional, read-only and memory-only.
 * Halo's compiled bitmap format is not assumed to be a menu sprite or panel.
 */
import type { Project, MapInspection } from './types';
import type { OwnedBitmapPreview } from './ownedBitmapPreview.ts';
import { decodeOwnedBitmapPreview } from './ownedBitmapPreview.ts';

export interface LocalInterfaceBitmapRef {
  projectId: string;
  bitmapTagId: number;
  sourceSha256: string;
}
const sha=(value:unknown):value is string => typeof value==='string' && /^[0-9a-f]{64}$/i.test(value);
export function validLocalInterfaceBitmapRef(value:unknown):value is LocalInterfaceBitmapRef {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const item=value as Partial<LocalInterfaceBitmapRef>;
  return typeof item.projectId==='string' && !!item.projectId && item.projectId.length<160 &&
    Number.isSafeInteger(item.bitmapTagId) && (item.bitmapTagId as number)>=0 && (item.bitmapTagId as number)<=0xffffffff &&
    sha(item.sourceSha256);
}
export function pinOwnedInterfaceBitmap(project:Project,inspection:MapInspection,bitmapTagId:number):LocalInterfaceBitmapRef {
  const sha256=project.source?.sha256;
  if(!sha(sha256) || !sha(inspection?.sha256) || sha256.toLowerCase()!==inspection.sha256.toLowerCase())
    throw new Error('Select a locally preserved, exact-source Halo map before choosing theme artwork');
  if(!Number.isSafeInteger(bitmapTagId) || !inspection.tags.some(tag=>tag.id===bitmapTagId && tag.class==='bitm'))
    throw new Error('Selected interface artwork is not a verified bitmap tag in this Halo cache');
  return {projectId:project.id,sourceSha256:inspection.sha256.toLowerCase(),bitmapTagId};
}
export function matchesOwnedInterfaceBitmap(ref:LocalInterfaceBitmapRef|null|undefined, project:Project|null,
    inspection:MapInspection|null):boolean {
  return validLocalInterfaceBitmapRef(ref) && !!project && !!inspection &&
    ref.projectId===project.id && project.source?.sha256?.toLowerCase()===ref.sourceSha256.toLowerCase() &&
    inspection.sha256.toLowerCase()===ref.sourceSha256.toLowerCase() &&
    inspection.tags.some(tag=>tag.id===ref.bitmapTagId && tag.class==='bitm');
}
export function decodeBoundedInterfaceBitmap(preview:OwnedBitmapPreview,ref:LocalInterfaceBitmapRef,
    resourceSha256:string|null) {
  if(!validLocalInterfaceBitmapRef(ref))throw new Error('Unpinned bitmap theme source');
  const image=decodeOwnedBitmapPreview(preview,{bitmapTagId:ref.bitmapTagId,
    sourceSha256:ref.sourceSha256,resourceSha256});
  // Keep one optional local header image well below the World Editor GPU budget.
  if(image.width>2048 || image.height>2048 || image.width*image.height>2_097_152 ||
      image.pixels.byteLength!==image.width*image.height*4)
    throw new Error('Bitmap is too large for the optional UI header; choose a smaller bitmap tag');
  return image;
}
