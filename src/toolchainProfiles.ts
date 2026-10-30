/** Runtime-targeted official and open-source Halo tool capabilities.
 * Tool names describe known functions, not validated installations.
 * Native availability is separately verified by the desktop backend.
 */
import type { RuntimeId, Settings } from './types';
import catalog from '../crates/spark-core/data/tool_ecosystem.json' with { type: 'json' };
export type ToolFlavor = 'legacyHek' | 'h1aEk';
export type ToolId =
  | 'sapien'
  | 'guerilla'
  | 'baboon'
  | 'tagTest'
  | 'invaderEditor'
  | 'haloTool'
  | 'invaderBuild'
  | 'invaderExtract'
  | 'invaderInfo';
export interface ToolProfile {
  id: ToolId;
  label: string;
  group: 'official' | 'invader' | 'community';
  mode: 'externalGui' | 'integratedCli' | 'sourceHandoff';
  purpose: string;
  modifiesFiles: boolean;
  /** This is a compatibility recommendation, not a claim of gameplay testing. */
  caveat: string;
}
/* The desktop allowlist and these compatibility recommendations share this
 * catalog. The backend still checks the actual map, source and executable. */
export function offeredTools(runtime: RuntimeId, settings: Pick<Settings, 'hekFlavor'>): ToolProfile[] {
  return catalog.tools
    .flatMap((tool) =>
      tool.legacy
        .filter((target) => target.runtime === runtime && target.flavor === settings.hekFlavor)
        .map((target) => ({ tool, order: target.order })),
    )
    .sort((a, b) => a.order - b.order)
    .map(({ tool }) => tool as ToolProfile);
}
export function toolchainHint(runtime: RuntimeId, flavor: Settings['hekFlavor']): string {
  if (runtime === 'mccSteam' && flavor !== 'h1aEk')
    return 'Select H1A / MCC Editing Kit in Preferences before enabling official tools.';
  if (runtime === 'haloCustomEdition' && flavor !== 'legacyHek')
    return 'Select classic HEK in Preferences to enable official CE tools; Invader remains separately selectable.';
  if (['macDemo', 'macRetail', 'haloMd', 'haloXbox'].includes(runtime))
    return 'No validated local editor-tool bridge for this legacy runtime. Export sources and test on target hardware.';
  if (['openCe', 'chupathingyCe'].includes(runtime))
    return 'Classic tag inspection may be possible; this list is not proof the runtime supports Invader builds or live editing.';
  return 'Available tool choices describe intended use; confirm installed version and target before running.';
}
export function toolById(id: string): ToolProfile | undefined {
  return catalog.tools.find((tool) => tool.id === id) as ToolProfile | undefined;
}
