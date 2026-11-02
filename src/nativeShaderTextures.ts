/** Labels emitted by the bounded native shader readers. Keep the preview and
 * world paths in agreement; generic transparent stages are not Chicago tags. */
export function nativeShaderTextureRole(label: string): string | undefined {
  const role: Record<string, string> = {
    'Base map': 'base', 'Diffuse map': 'base', 'Primary detail map': 'primaryDetail',
    'Detail map': 'primaryDetail', 'Secondary detail map': 'secondaryDetail',
    'Micro detail map': 'microDetail', 'Bump map': 'normalMap', 'Multipurpose map': 'multipurpose',
  };
  return role[label] ?? (/^(?:Chicago|Transparent) layer [1-3]$/.test(label) ? `layer${label.at(-1)}` : undefined);
}
