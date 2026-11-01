import type { ForgeMaterial } from './forge';
/** Runtime defaults fill missing bindings; authored shaders and Halo's
 * +portal/+exactportal/+sky surfaces retain their original meaning. */
export function withPreviewDefaults(current: ForgeMaterial[], defaults: ForgeMaterial[]): ForgeMaterial[] {
  const metal = defaults.find((m) => m.id === 'surface');
  if (!metal) return current;
  const grass = defaults.find((m) => m.id === 'grass');
  return [
    ...current.map((m) =>
      m.shaderPath || m.name.startsWith('+')
        ? m
        : { ...m, shaderPath: (m.id === 'grass' ? grass : metal)?.shaderPath ?? metal.shaderPath },
    ),
    ...defaults.filter((m) => !current.some((old) => old.id === m.id)),
  ];
}
