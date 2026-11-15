/** Cross-check HaloScript references against authored campaign intent or the
 * read-only imported cache. Neither proves native compilation or gameplay.
 * Native camera/trigger indexes are not decoded; explicit authoring names are separate.
 */
import type { MapInspection } from './types';
import type { ScriptExport } from './haloScript';
import type { QuickForgeDocument } from './forge';
export type BindingStatus = 'presentInImportedCache'|'absentInImportedCache'|'presentInAuthoringSource'|'absentInAuthoringSource'|'notInspectable';
export interface BindingResult { dependency: string; status: BindingStatus; detail: string }
export function inspectScenarioBindings(scripts: ScriptExport[], inspection: MapInspection | null, source?:QuickForgeDocument|null): BindingResult[] {
  const dependencies=[...new Set(scripts.flatMap(s=>s.dependencies))];
  return dependencies.map(dependency=>{
    if(source?.gameMode==='campaign'&&dependency.startsWith('ai_encounter:')) {
      const [name,squad,...extra]=dependency.slice('ai_encounter:'.length).split(':')[0].split('/');
      const found=(source.campaignEncounters??[]).filter(entry=>entry.name===name);
      const present=extra.length===0&&found.length===1&&(!squad||squad==='source_squad');
      return {dependency,status:present?'presentInAuthoringSource' as const:'absentInAuthoringSource' as const,
        detail:present?(found[0].startActive?'Authored group starts active; a mission ai_place call needs explicit ownership review. Native/game validation remains required.':
          'Name matches campaign encounter source. Native actor dependencies, compilation and gameplay remain separate checks.'):
          'No matching campaign source encounter/squad. Add or select a group below; the native source writer uses source_squad.'};
    }
    if(source?.gameMode==='campaign'&&dependency.startsWith('trigger_volume:')) {
      const name=dependency.slice('trigger_volume:'.length);
      const found=source.logic?.triggers.filter(trigger=>trigger.nativeName===name)??[];
      return {dependency,status:found.length===1?'presentInAuthoringSource' as const:'notInspectable' as const,
        detail:found.length===1?'Name matches an explicitly named authoring volume. Native bounds, compilation and gameplay remain unverified.':
          'Choose an explicitly named volume from Level Editor → Logic / Events. Implicit generated names require native source review.'};
    }
    if(dependency.startsWith('sound:'))return {dependency,status:'notInspectable' as const,
      detail:'Mission preparation checks the exact included one-shot sound; native staging rechecks its owned import receipt and compiled tag. Game playback, sound class and multiplayer delivery need separate testing.'};
    if(dependency.startsWith('hud_message:'))return {dependency,status:'notInspectable' as const,
      detail:'Prepared campaign builds generate this standard HUD message tag. Script-only exports require the matching native HMT asset; compilation/readback still need validation.'};
    if(!inspection) return {dependency,status:'notInspectable' as const,detail:'No imported source map; requires an editable scenario tag.'};
    if(dependency.startsWith('ai_encounter:')) {
      const full=dependency.slice('ai_encounter:'.length).split(':')[0];
      const [encounter,squad,...extras]=full.split('/');
      const match=extras.length===0 && inspection.encounters.find(e=>e.name===encounter);
      const present=Boolean(match && (!squad || match.squads.includes(squad)));
      return {dependency,status:present?'presentInImportedCache' as const:'absentInImportedCache' as const,
        detail:present?'Name found in imported cache index; editable scenario binding and compilation still required.':
          'Name not found in imported cache. Create/rename encounter and squad in your editable scenario before compilation.'};
    }
    return {dependency,status:'notInspectable' as const,
      detail:'Trigger volume/camera-point indexes are not currently decoded; verify by opening the editable scenario in Sapien.'};
  });
}
