/** Source-only advisory for selected CE server variants. No compiled-map
 * inspection is inferred from the editable QuickForge project. */
import type { QuickForgeDocument } from './forge';
import type { ServerPlan } from './creatorStudio';
import {auditClassicNetgame,classicModeFromVariant,classicModeChecklist} from './haloGametypeScenario.ts';
export interface MultiplayerScenarioFinding { code:string; severity:'warning'|'info'; message:string; }
const lower=(s:string)=>s.trim().toLowerCase();
export function previewMultiplayerScenarioRequirements(doc:QuickForgeDocument|null|undefined,server:ServerPlan):MultiplayerScenarioFinding[] {
  if(!doc)return [];
  const findings:MultiplayerScenarioFinding[]=[];
  const add=(code:string,message:string)=>findings.push({code,severity:'warning',message});
  if(doc.runtimeId!=='haloCustomEdition')add('SOURCE_RUNTIME_MISMATCH','This authored scenario does not target stock Halo Custom Edition. Its netgame flags cannot prove compatibility with the selected server.');
  for(const issue of auditClassicNetgame(doc))add(issue.code,issue.message);
  const starts=doc.spawns;
  if(starts.length<2)add('FEW_PLAYER_STARTS',`Only ${starts.length} player starts are authored; add enough starts for real multiplayer clearance testing.`);
  const designs=new Map((server.gameTypes??[]).map(design=>[lower(design.name),design]));
  const wanted=new Set((server.rotation??[]).map(item=>classicModeFromVariant(designs.get(lower(item.gameVariant))?.baseVariant??item.gameVariant)).filter(mode=>mode!==null));
  const checklist=classicModeChecklist(doc);
  for(const mode of wanted){
    const entry=checklist.find(c=>c.mode===mode);
    if(!entry)continue;
    if(entry.count<2)add('NO_MODE_STARTS',`Fewer than two starts support ${mode}. Use a spawn with the appropriate mode or all-games eligibility.`);
    if(mode==='ctf'){
      if(entry.notes.some(n=>n.includes('team flags')))add('CTF_FLAGS_INCOMPLETE','CTF requires one red and one blue flag netgame marker.');
    } else if(mode==='oddball') {
      if(entry.notes.some(n=>n.includes('ball spawn')))add('ODDBALL_MISSING','Oddball requires at least spawn index 0.');
    } else if(mode==='king') {
      if(entry.notes.some(n=>n.includes('hill group')))add('HILL_MISSING','King needs an initial valid hill group with ID 0.');
    } else if(mode==='race') {
      if(entry.notes.some(n=>n.includes('checkpoints')))add('RACE_CHECKPOINTS_MISSING','Race should contain at least two numbered checkpoints.');
    }
  }
  return findings.slice(0,128);
}
