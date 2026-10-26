/** Compatibility evidence, not a guarantee that historical apps will run.
 * No local paths or binaries appear in exported legacy workflow plans.
 */
export type CompanionFormat = 'windows-pe' | 'mac-app';
export type CompanionState = 'available-to-try' | 'runtime-unavailable' | 'changed' | 'unavailable' | 'invalid-registration';
export interface CompanionRuntime {id:CompanionFormat;available:boolean;detail:string}
export interface CompanionOffer {
  id:string;name:string;historicalRole:string;preferredFormat:CompanionFormat;
  runtimeHint:string;runtimeDetected:boolean;registered:boolean;installed:boolean;
}
export interface CompanionRegistration {
  id:string;toolId:string;name:string;fileName:string;format:CompanionFormat;
  status:CompanionState;detail:string;runtime:string;
}
export interface CompanionDashboard {
  hostOs:string;hostArch:string;runtimes:CompanionRuntime[];
  catalog:CompanionOffer[];registrations:CompanionRegistration[];discoveryScope:string;
}
export const cannotGuaranteeCompatibility = 'Runtime detected does not mean the old app works. Only an explicit user launch and in-app test can establish compatibility.';
export function companionOfferLabel(offer:CompanionOffer):string {
  if(offer.installed) return 'Registered binary verified · operation not tested';
  if(offer.registered) return 'Registered, but not currently verified';
  if(offer.runtimeDetected) return 'Potential runtime present · tool not registered';
  return 'No native or recognized compatibility runtime · tool not registered';
}
export function mayOfferLaunch(reg:CompanionRegistration,dashboard:CompanionDashboard):boolean {
  const runtime=dashboard.runtimes.find(r=>r.id===reg.format);
  return reg.status==='available-to-try' && runtime?.available===true &&
    dashboard.registrations.some(r=>r.id===reg.id && r.toolId===reg.toolId && r.status===reg.status);
}
export function validatedDashboard(data:CompanionDashboard):CompanionDashboard {
  if(!data||!Array.isArray(data.catalog)||!Array.isArray(data.runtimes)||!Array.isArray(data.registrations)||
     data.catalog.length>50 || data.registrations.length>20)throw new Error('Unsupported companion discovery response');
  if(data.registrations.some(r=>typeof r.id!=='string'||typeof r.fileName!=='string'||
      r.fileName.includes('/')||r.fileName.includes('\\')||
      !['available-to-try','runtime-unavailable','changed','unavailable','invalid-registration'].includes(r.status)))
    throw new Error('Invalid legacy companion registration');
  if(data.catalog.some(e=>!e.name||!['windows-pe','mac-app'].includes(e.preferredFormat)) ||
     data.runtimes.some(r=>!['windows-pe','mac-app'].includes(r.id)||typeof r.available!=='boolean'))
    throw new Error('Unsupported legacy compatibility data');
  return data;
}
