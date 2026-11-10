import type {MeshData,ShaderPreview} from './types';
/** Only an explicitly null native glass diffuse map permits texture-free
 * diffuse contribution. Missing/corrupt required images remain failures. */
export const glassWithoutDiffuse=(shader:ShaderPreview|undefined|null)=>shader?.kind==='glass'&&shader.glassDiffuseAbsent===true;
/** Labels emitted by the bounded native shader readers. Keep the preview and
 * world paths in agreement; generic transparent stages are not Chicago tags. */
export function nativeShaderTextureRole(label: string): string | undefined {
  const role: Record<string, string> = {
    'Base map': 'base', 'Diffuse map': 'base', 'Primary detail map': 'primaryDetail',
    'Detail map': 'primaryDetail', 'Secondary detail map': 'secondaryDetail',
    'Micro detail map': 'microDetail', 'Bump map': 'normalMap', 'Multipurpose map': 'multipurpose',
    'Background tint map': 'glassTintMap',
  };
  return role[label] ?? (/^(?:Chicago|Transparent) layer [1-3]$/.test(label) ? `layer${label.at(-1)}` : undefined);
}

/** Count actual triangles without source material attribution, including models
 * whose unsupported references were correctly refused by the native reader.
 * Null is malformed metadata, never proof of complete material coverage. */
export function unassignedNativeTriangles(mesh:Pick<MeshData,'indices'|'materialRanges'>):number|null {
  const total=mesh.indices.length,ranges=mesh.materialRanges??[];
  if(total%3||ranges.length>16384)return null;
  let end=0,covered=0;
  for(const range of [...ranges].sort((a,b)=>a.indexStart-b.indexStart)){
    const start=range.indexStart,count=range.indexCount,stop=start+count;
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(count)||start<0||count<=0||start%3||count%3||stop>total)return null;
    covered+=Math.max(0,stop-Math.max(end,start));end=Math.max(end,stop);
  }
  return (total-covered)/3;
}
