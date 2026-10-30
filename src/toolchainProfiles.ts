/** Runtime-targeted official and open-source Halo tool capabilities.
 * Tool names describe known functions, not validated installations.
 * Native availability is separately verified by the desktop backend.
 */
import type { RuntimeId, Settings } from './types';
export type ToolFlavor = 'legacyHek'|'h1aEk';
export type ToolId = 'sapien'|'guerilla'|'baboon'|'tagTest'|'invaderEditor'|'haloTool'|'invaderBuild'|'invaderExtract'|'invaderInfo';
export interface ToolProfile {
  id: ToolId;
  label: string;
  group: 'official'|'invader'|'community';
  mode: 'externalGui'|'integratedCli'|'sourceHandoff';
  purpose: string;
  modifiesFiles: boolean;
  /** This is a compatibility recommendation, not a claim of gameplay testing. */
  caveat: string;
}
const profiles: Record<ToolId, ToolProfile> = {
  baboon:{id:'baboon',label:'Baboon · native tag editor',group:'community',mode:'sourceHandoff',purpose:'Edit compatible MCC Halo 1 loose tags in an isolated per-map editing kit.',modifiesFiles:true,caveat:'Requires the verified portable executable and matching definitions. Compiled maps must first have validated MCC working tags.'},
  sapien:{id:'sapien',label:'Sapien · scenario placement',group:'official',mode:'externalGui',purpose:'Place scenario objects, player starts, encounters and devices in a tag-based level.',modifiesFiles:true,caveat:'Requires a compiled scenario BSP and a compatible installed tag tree.'},
  guerilla:{id:'guerilla',label:'Guerilla · tag editor',group:'official',mode:'externalGui',purpose:'Inspect and modify editable Halo tags and their references.',modifiesFiles:true,caveat:'Can change source tags: use a separately backed-up working tree.'},
  tagTest:{id:'tagTest',label:'H1A standalone · tag test',group:'official',mode:'externalGui',purpose:'Run a development Halo build from tag data to shorten local playtest iteration.',modifiesFiles:false,caveat:'Official Standalone is for H1A editing kit; not a multiplayer host or live editing API.'},
  invaderEditor:{id:'invaderEditor',label:'Invader Qt · tag editor',group:'invader',mode:'externalGui',purpose:'Open an external editor for supported classic Halo tags.',modifiesFiles:true,caveat:'Compatibility with a target map does not establish tool support for its runtime.'},
  haloTool:{id:'haloTool',label:'Halo Tool · structure/build',group:'official',mode:'integratedCli',purpose:'Compile JMS geometry into structure BSP and subsequently build tag-based content.',modifiesFiles:true,caveat:'Run through configured QuickForge build jobs; the bare CLI is not launched by this button.'},
  invaderBuild:{id:'invaderBuild',label:'Invader · cache builder',group:'invader',mode:'integratedCli',purpose:'Compile supported classic Halo cache files from complete tag dependencies.',modifiesFiles:true,caveat:'Only supported targets and validated source trees may be built. No arbitrary CLI flags.'},
  invaderInfo:{id:'invaderInfo',label:'Invader · read-only info',group:'invader',mode:'integratedCli',purpose:'View Invader build/version and binary identity in the Spark job console.',modifiesFiles:false,caveat:'Only the documented -i information switch is offered; no arbitrary commands.'},
  invaderExtract:{id:'invaderExtract',label:'Invader · tag extraction',group:'invader',mode:'integratedCli',purpose:'Extract real source tags and their references from an owned cache.',modifiesFiles:true,caveat:'Uses Tag Browser’s managed, hash-bound extraction workflow.'},
};
export function offeredTools(runtime:RuntimeId,settings:Pick<Settings,'hekFlavor'>):ToolProfile[]{
  if(runtime==='mccSteam') return settings.hekFlavor==='h1aEk'
    ? [profiles.sapien,profiles.guerilla,profiles.baboon,profiles.tagTest,profiles.haloTool] : [];
  if(runtime==='haloCustomEdition') return [
    ...(settings.hekFlavor==='legacyHek'?[profiles.sapien,profiles.guerilla,profiles.haloTool]:[]),
    profiles.invaderEditor,profiles.invaderBuild,profiles.invaderExtract,profiles.invaderInfo];
  if(runtime==='haloPc'||runtime==='haloPcTrial')return [profiles.invaderEditor,profiles.invaderExtract,profiles.invaderInfo];
  if(runtime==='openCe'||runtime==='chupathingyCe')return [profiles.invaderEditor,profiles.invaderExtract,profiles.invaderInfo];
  return [];
}
export function toolchainHint(runtime:RuntimeId,flavor:Settings['hekFlavor']):string {
  if(runtime==='mccSteam'&&flavor!=='h1aEk')return 'Select H1A / MCC Editing Kit in Preferences before enabling official tools.';
  if(runtime==='haloCustomEdition'&&flavor!=='legacyHek')return 'Select classic HEK in Preferences to enable official CE tools; Invader remains separately selectable.';
  if(['macDemo','macRetail','haloMd','haloXbox'].includes(runtime))return 'No validated local editor-tool bridge for this legacy runtime. Export sources and test on target hardware.';
  if(['openCe','chupathingyCe'].includes(runtime))return 'Classic tag inspection may be possible; this list is not proof the runtime supports Invader builds or live editing.';
  return 'Available tool choices describe intended use; confirm installed version and target before running.';
}
export function toolById(id:string):ToolProfile|undefined {return Object.hasOwn(profiles,id)?profiles[id as ToolId]:undefined;}
