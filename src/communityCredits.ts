/** A living, sourced recognition register, not an assertion that we know every
 * person who contributed to two decades of Halo modding. Historical aliases
 * and attribution can change; community suggestions remain explicitly unverified.
 * Never download, execute, or bundle linked third-party tools from this list.
 */
export interface CommunityCredit {
  id: string;
  name: string;
  contribution: string;
  category: 'Documentation' | 'Toolmaking' | 'Preservation' | 'Historical community';
  url: string;
  verification: 'source-verified' | 'user-suggested';
}
export const COMMUNITY_CREDITS: readonly CommunityCredit[] = [
  {id:'eschaton-altimit01',name:'Altimit01 - Eschaton',category:'Toolmaking',contribution:'Eschaton direct Halo 1 cache tag editor with XML-defined fields and bitmap extraction/injection across PC, Mac, Trial and CE.',url:'https://c20.reclaimers.net/h1/community-tools/obsolete/',verification:'source-verified'},
  {id:'hmt-authors',name:'MonoxideC and tjc - Halo Map Tools',category:'Toolmaking',contribution:'Early HMT texture, sound and model experimentation and tag editing; one origin of the Demo/PC tinkering culture.',url:'https://c20.reclaimers.net/h1/community-tools/obsolete/',verification:'source-verified'},
  {id:'sparkedit-grenadiac',name:'Grenadiac - SparkEdit',category:'Toolmaking',contribution:'Early 3D Halo PC scenario placement editing, including the creative log-mod culture.',url:'https://c20.reclaimers.net/h1/community-tools/obsolete/',verification:'source-verified'},
  {id:'swordedit-team',name:'bobindashadows, Sword and Samuco - SwordEdit',category:'Toolmaking',contribution:'The historical Mac OS X fork of SparkEdit, continuing visual object placement experiments.',url:'https://c20.reclaimers.net/h1/community-tools/obsolete/',verification:'source-verified'},
  {id:'macgamingmods-monoman',name:'Monoman and the MacGamingMods archive',category:'Preservation',contribution:'Keeping an indexed archive of Halo Demo-era releases and tools, including Eschaton 0.8.1 and Fonzie\'s Modding Pack v5.',url:'https://www.macgamingmods.com/',verification:'source-verified'},
  {id:'halomd-archive',name:'HaloMD mod archive contributors',category:'Preservation',contribution:'Cataloging playable-era community releases such as Zombie Apocalypse 1.0 and Log Mod ++; a listing is not a recovered source project.',url:'https://halomd.macgamingmods.com/mods/',verification:'source-verified'},
  {id:'c20',name:'The Reclaimers Library (c20) contributors',category:'Documentation',contribution:'Maintaining a living, community-written knowledge base of Halo toolchains and formats.',url:'https://c20.reclaimers.net/',verification:'source-verified'},
  {id:'invader',name:'SnowyMouse and Vaporeon — Invader',category:'Toolmaking',contribution:'Developing the open-source Halo 1 tagging, build, extraction and validation toolkit.',url:'https://c20.reclaimers.net/h1/community-tools/invader/',verification:'source-verified'},
  {id:'mek',name:'MosesOfEgypt and gbMichelle — MEK',category:'Toolmaking',contribution:'Developing the Mozz Editing Kit, including Mozzarilla and Refinery.',url:'https://c20.reclaimers.net/h1/community-tools/mek/',verification:'source-verified'},
  {id:'hek',name:'Bungie and Halo Editing Kit developers',category:'Toolmaking',contribution:'Creating the original Tool, Guerilla and Sapien workflows that enabled Halo CE custom maps.',url:'https://learn.microsoft.com/en-us/halo-master-chief-collection/general/overview-tools',verification:'source-verified'},
  {id:'halomaps',name:'Halo Maps creators and forum community',category:'Preservation',contribution:'Preserving user-created maps, utilities, screenshots and classic discussion archives.',url:'https://www.halomaps.org/',verification:'source-verified'},
  {id:'mods',name:'HaloMods community and early tool authors',category:'Historical community',contribution:'Exploring HMT, HHT, SparkEdit, Eschaton and map-editing techniques long before modern modding workflows.',url:'https://halomods.fandom.com/wiki/Guide_to_Modding',verification:'source-verified'},
  {id:'guides',name:'Halo tutorial makers and researchers',category:'Documentation',contribution:'Sharing reproducible lessons, failed experiments, discoveries and examples so the next modder could succeed.',url:'https://c20.reclaimers.net/h1/guides/',verification:'source-verified'},
  {id:'noctilucent',name:'noctilucent, Kybo_Ren, ZiON and Thomas K',category:'Toolmaking',contribution:'The modern HaloCE Gametype Editor and earlier native game-type format research; documented savegame CRC/backups and custom variants.',url:'https://github.com/nocti1/HaloCE-Gametype-Editor',verification:'source-verified'},
  {id:'evildave',name:'EViLDaVE and Halo Wiki tutorial writers',category:'Documentation',contribution:'Documenting open-edge fixes, source geometry, skylight, BSP modeling, sound tags and editor troubleshooting in the 2005 Halo Wiki archive.',url:'https://www.halomaps.org/hce/detail.cfm?fid=1535',verification:'source-verified'},
  {id:'ce3-educators',name:'PopeAK49, Higuy, MattDratt, Jesse and MosesofEgypt',category:'Documentation',contribution:'Named creators of archived CE3 level creation, terrain, scripting, HUD and model-LOD tutorials.',url:'https://haloce3.com/tutorial-index/',verification:'source-verified'},
  {id:'fonzie',name:'Fonzie / Fonzeh and the MacGamingMods creators',category:'Historical community',contribution:'Halo Demo-era map experiments, shared mod packs and the Mac modding community that inspired Guilty Spark.',url:'https://macgamingmods.com/',verification:'source-verified'},
];
const STORAGE_KEY = 'guilty-spark-community-suggestions-v1';
const LIMIT=80;
export function validateCommunitySuggestion(input: unknown): CommunityCredit {
  if(!input||typeof input!=='object') throw new Error('A community nomination must be an object');
  const item=input as Record<string,unknown>;
  const name=typeof item.name==='string'?item.name.trim():'';
  const contribution=typeof item.contribution==='string'?item.contribution.trim():'';
  const url=typeof item.url==='string'?item.url.trim():'';
  if(name.length<2||name.length>96||/[\x00-\x1f<>]/.test(name))throw new Error('Use a name of 2–96 printable characters');
  if(contribution.length<8||contribution.length>280||/[\x00-\x1f<>]/.test(contribution))throw new Error('Describe the contribution in 8–280 printable characters');
  let parsed:URL;
  try{parsed=new URL(url);}catch{throw new Error('Include a valid public HTTPS reference link');}
  if(parsed.protocol!=='https:'||!parsed.hostname.includes('.')||parsed.username||parsed.password||url.length>400||
      /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(parsed.hostname))
    throw new Error('Only public HTTPS source references are accepted');
  return {id:`suggestion:${name.toLowerCase()}:${url}`,name,contribution,url,category:'Historical community',verification:'user-suggested'};
}
export function decodeCommunitySuggestions(raw:string|null):CommunityCredit[] {
  if(!raw||raw.length>120_000)return [];
  try{
    const list:unknown=JSON.parse(raw);
    if(!Array.isArray(list)||list.length>LIMIT)return [];
    const seen=new Set<string>();const result:CommunityCredit[]=[];
    for(const candidate of list){
      try{const item=validateCommunitySuggestion(candidate);if(!seen.has(item.id)){result.push(item);seen.add(item.id);}}
      catch{ /* ignore invalid historical data */ }
    }
    return result;
  }catch{return [];}
}
export function readCommunitySuggestions():CommunityCredit[]{
  try{return decodeCommunitySuggestions(window.localStorage.getItem(STORAGE_KEY));}catch{return [];}
}
export function saveCommunitySuggestions(items:CommunityCredit[]):void{
  if(items.length>LIMIT)throw new Error('Community list is full; export it before adding more');
  const safe=items.map(validateCommunitySuggestion);
  try{window.localStorage.setItem(STORAGE_KEY,JSON.stringify(safe));}
  catch{throw new Error('Local storage unavailable. Copy/export suggestions before closing.');}
}
export function exportCommunitySuggestions(items:CommunityCredit[]):string{
  return JSON.stringify({schemaVersion:1,description:'Unverified community nominations; review original sources before crediting publicly',suggestions:items.map(validateCommunitySuggestion)},null,2);
}
