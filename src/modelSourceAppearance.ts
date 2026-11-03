import { call } from './api';
import { validateEnvironment } from './environment';
import type { EditorEnvironment } from './environment';
export interface ModelSourceAppearance {
  sourceSha256: string;
  environment: EditorEnvironment | null;
  fogMaximumDensity: number;
  skyPath: string | null;
}
const sources = new Map<string, Promise<ModelSourceAppearance>>();
/** Immutable native source metadata, shared by previews of the same map. No
 * hosting/runtime selector or copied project override can authorize it. */
export function modelSourceAppearance(
  projectId: string,
  sourceSha256: string,
): Promise<ModelSourceAppearance> {
  const key = JSON.stringify([projectId, sourceSha256]);
  const known = sources.get(key);
  if (known) return known;
  const pending = call<ModelSourceAppearance>('inspect_source_appearance', { projectId }).then((value) => {
    if (
      !value ||
      value.sourceSha256 !== sourceSha256 ||
      !Number.isFinite(value.fogMaximumDensity) ||
      value.fogMaximumDensity < 0 ||
      value.fogMaximumDensity > 1
    )
      throw Error('Model lighting belongs to an invalid or different source revision.');
    if (value.environment) validateEnvironment(value.environment);
    // Do not retain the full native sky mesh returned by the shared reader.
    return {
      sourceSha256,
      environment: value.environment,
      fogMaximumDensity: value.fogMaximumDensity,
      skyPath: value.skyPath,
    };
  });
  sources.set(key, pending);
  if (sources.size > 8) sources.delete(sources.keys().next().value!);
  void pending.catch(() => {
    if (sources.get(key) === pending) sources.delete(key);
  });
  return pending;
}
