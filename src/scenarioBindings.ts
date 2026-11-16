/** Cross-check HaloScript references against authored campaign intent or the
 * read-only imported cache. Neither proves native compilation or gameplay.
 * Imported camera/trigger indexes are separate from an explicitly read native-source inventory.
 */
import type { MapInspection } from './types';
import type { ScriptExport } from './haloScript';
import type { QuickForgeDocument } from './forge';
export type BindingStatus = 'presentInImportedCache'|'absentInImportedCache'|'presentInAuthoringSource'|'absentInAuthoringSource'|'presentInNativeSource'|'absentInNativeSource'|'notInspectable';
export interface BindingResult { dependency: string; status: BindingStatus; detail: string }
export function inspectScenarioBindings(scripts: ScriptExport[], inspection: MapInspection | null, source?:QuickForgeDocument|null,plannedCameras:readonly string[]=[],nativeVolumes?:readonly {name:string}[],nativeDevices?:readonly {name:string;class:string}[],nativeSquads?:readonly {encounter:number;encounterName:string;name:string}[],nativeWeapons?:readonly import('./nativeOperations').NativeMissionWeapon[]): BindingResult[] {
  const dependencies=[...new Set(scripts.flatMap(s=>s.dependencies))];
  return dependencies.map(dependency=>{
    if(dependency.startsWith('weapon_object:')){
      const [,name,path]=dependency.split(':'),matches=(nativeWeapons??[]).filter(row=>row.tagPath===path&&!row.startingEquipment).flatMap(row=>(row.objects??[]).filter(object=>object.name===name&&object.notPlacedAutomatically&&!object.createIssue));
      return {dependency,status:matches.length===1?'presentInNativeSource' as const:'absentInNativeSource' as const,detail:matches.length===1?'Unique named source weapon with automatic placement disabled. Native compilation/readback and actual creation/pickup remain separate checks.':'Read current recovered mission source and choose one unique named weapon with automatic placement disabled and no starting-profile grant. Blank-map source currently uses automatic weapon placement.'};
    }
    if(nativeDevices&&dependency.startsWith('device_control:')&&!(source?.gameMode==='campaign'&&!source.native)){
      const name=dependency.slice('device_control:'.length),matches=nativeDevices.filter(row=>row.class==='ctrl'&&row.name===name).length;
      return {dependency,status:matches===1?'presentInNativeSource' as const:'absentInNativeSource' as const,detail:matches===1?'Unique control in the inspected native source. Pose editing preserves flags/groups/scripts; real activation and mission progress require native/game validation.':'Native control is missing or ambiguous; read source again or reconcile references in the matching native editor.'};
    }
    if(nativeVolumes&&dependency.startsWith('trigger_volume:')&&!(source?.gameMode==='campaign'&&!source.native)){
      const name=dependency.slice('trigger_volume:'.length),matches=nativeVolumes.filter(area=>area.name===name).length;
      return {dependency,status:matches===1?'presentInNativeSource' as const:'absentInNativeSource' as const,
        detail:matches===1?'Name found uniquely in the inspected native scenario source. Source review, compilation/readback and gameplay remain separate checks.':matches===0?'Name is missing from the inspected native source. Read native areas again after changing the source.':'This name is ambiguous in native source. Reconcile the original references in the matching native editor; Spark does not choose an arbitrary index.'};
    }
    if(source?.gameMode==='campaign'&&!source.native&&dependency.startsWith('cutscene_camera_point:')) {
      const name=dependency.slice('cutscene_camera_point:'.length),present=plannedCameras.filter(camera=>camera===name).length===1;
      return {dependency,status:present?'presentInAuthoringSource' as const:'absentInAuthoringSource' as const,
        detail:present?'Planned native camera point from the saved shots. Preparation, native compilation/readback and gameplay remain separate gates.':'No unique planned native camera point matches this scene. Review its saved shots and point names before preparing.'};
    }
    if(source?.gameMode==='campaign'&&!source.native&&dependency.startsWith('ai_encounter:')) {
      const [name,squad,...extra]=dependency.slice('ai_encounter:'.length).split(':')[0].split('/');
      const found=(source.campaignEncounters??[]).filter(entry=>entry.name===name);
      const present=extra.length===0&&found.length===1&&(!squad||squad==='source_squad');
      return {dependency,status:present?'presentInAuthoringSource' as const:'absentInAuthoringSource' as const,
        detail:present?(found[0].startActive?'Authored group starts active; a mission ai_place call needs explicit ownership review. Native/game validation remains required.':
          'Name matches campaign encounter source. Native actor dependencies, compilation and gameplay remain separate checks.'):
          'No matching campaign source encounter/squad. Add or select a group below; the native source writer uses source_squad.'};
    }
    if(source?.gameMode==='campaign'&&!source.native&&dependency.startsWith('trigger_volume:')) {
      const name=dependency.slice('trigger_volume:'.length);
      const found=source.logic?.triggers.filter(trigger=>trigger.nativeName===name)??[];
      return {dependency,status:found.length===1?'presentInAuthoringSource' as const:'notInspectable' as const,
        detail:found.length===1?'Name matches an explicitly named authoring volume. Native bounds, compilation and gameplay remain unverified.':
          'Choose an explicitly named volume from Level Editor → Logic / Events. Implicit generated names require native source review.'};
    }
    if(source?.gameMode==='campaign'&&dependency.startsWith('weapon:')) {
      const path=dependency.slice('weapon:'.length),present=source.placements.some(p=>p.tagClass==='weap'&&p.tagPath.replaceAll('\\','/')===path);
      const starting=[source.startingProfile?.primaryWeapon,source.startingProfile?.secondaryWeapon].includes(path);
      return {dependency,status:present&&!starting?'presentInAuthoringSource' as const:'absentInAuthoringSource' as const,detail:!present?'Place the included technology weapon in the map before preparing.':starting?'Choose technology that is absent from all authored starting equipment.':'Placed native weapon source; ownership, pickup reachability and gameplay require native testing.'};
    }
    if(source?.gameMode==='campaign'&&dependency.startsWith('forerunner_extraction:')) {
      const devices=source.logic?.devices??[],control=(name:string,powered:boolean)=>{const rows=devices.filter(d=>d.nativeName===name);return rows.length===1&&rows[0].powered===powered&&rows[0].initialPosition<.5&&source.placements.some(p=>p.id===rows[0].placementId&&p.tagClass==='ctrl');};
      const present=['haloCustomEdition','chupathingyCe'].includes(source.runtimeId)&&control('extraction_activate',false)&&control('extraction_deploy',true)&&['extraction_zone','extraction_return'].every(name=>source.logic?.triggers.filter(t=>t.nativeName===name).length===1);
      return {dependency,status:present?'presentInAuthoringSource' as const:'absentInAuthoringSource' as const,detail:present?'Forerunner native controls/volumes bound; hub clearance, all starts, gameplay and durable settlement require independent runtime validation.':'Forerunner requires powered extraction_deploy, initially unpowered extraction_activate and unique extraction_zone/extraction_return volumes in standard CE campaign source.'};
    }
    if(source?.gameMode==='campaign'&&dependency.startsWith('device_control:')) {
      const name=dependency.slice('device_control:'.length),bindings=source.logic?.devices.filter(device=>device.nativeName===name)??[];
      const placements=bindings.flatMap(device=>source.placements.filter(placement=>placement.id===device.placementId));
      const present=bindings.length===1&&placements.length===1&&placements[0].tagClass==='ctrl'&&bindings[0].powered&&
        Number.isFinite(bindings[0].initialPosition)&&bindings[0].initialPosition>=0&&bindings[0].initialPosition<0.5;
      return {dependency,status:present?'presentInAuthoringSource' as const:'absentInAuthoringSource' as const,
        detail:present?'One powered native control starts inactive. Native build verifies its source/name binding; actual use and mission execution still need testing.':
          'Choose one explicitly named native control in Level Editor → Logic / Events, enable startup power and set initial position below0.5. A machine, missing/duplicate binding or already-active control cannot supply this objective.'};
    }
    if(dependency.startsWith('sound:'))return {dependency,status:'notInspectable' as const,
      detail:'Mission preparation checks the exact included one-shot sound; native staging rechecks its owned import receipt and compiled tag. Game playback, sound class and multiplayer delivery need separate testing.'};
    if(dependency.startsWith('hud_message:'))return {dependency,status:'notInspectable' as const,
      detail:'Prepared campaign builds generate this standard HUD message tag. Script-only exports require the matching native HMT asset; compilation/readback still need validation.'};
    if(nativeSquads&&dependency.startsWith('ai_encounter:')){
      const ref=dependency.slice('ai_encounter:'.length).split(':')[0],parts=ref.split('/'),rows=nativeSquads.filter(row=>row.encounterName===parts[0]&&(!parts[1]||row.name===parts[1]));
      const present=parts.length<=2&&rows.length>0&&new Set(rows.map(row=>row.encounter)).size===1&&(!parts[1]||rows.length===1);
      return {dependency,status:present?'presentInNativeSource' as const:'absentInNativeSource' as const,detail:present?'Encounter/squad read from current native scenario source. Source activation, compilation and gameplay are separate gates.':'Native encounter/squad is missing or ambiguous. Use the existing native encounter editor, then read source again.'};
    }
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
      detail:'No native-source inventory is loaded for this reference. Read Recovered scenario areas in Mission director, or use the matching native camera/source editor.'};
  });
}
