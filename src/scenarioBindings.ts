/** Cross-check authored HaloScript dependencies against the *read-only* source
 * cache's encounter index. This is a diagnostic, not a scenario compiler.
 * Camera points and trigger volumes cannot be proven by this inspection.
 */
import type { MapInspection } from './types';
import type { ScriptExport } from './haloScript';
export type BindingStatus = 'presentInImportedCache'|'absentInImportedCache'|'notInspectable';
export interface BindingResult { dependency: string; status: BindingStatus; detail: string }
export function inspectScenarioBindings(scripts: ScriptExport[], inspection: MapInspection | null): BindingResult[] {
  const dependencies=[...new Set(scripts.flatMap(s=>s.dependencies))];
  return dependencies.map(dependency=>{
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
