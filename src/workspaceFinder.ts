import type { Workspace } from './types';
export interface WorkspaceFinderItem {id: Workspace; label: string; help: string; keywords?: string}
/** Stable, bounded, local-only search: never runs commands or opens arbitrary paths. */
export function filterWorkspaceFinder(items: readonly WorkspaceFinderItem[], input: string, limit=12): WorkspaceFinderItem[] {
  const words=input.trim().toLocaleLowerCase().slice(0,120).split(/\s+/).filter(Boolean);
  if (!words.length) return [...items].slice(0,Math.max(0,Math.min(limit,24)));
  return items.map((item,index)=>{
    const title=item.label.toLocaleLowerCase();
    const terms=`${item.id} ${item.label} ${item.keywords??''} ${item.help}`.toLocaleLowerCase();
    if(!words.every(word=>terms.includes(word)))return null;
    const rank=words.reduce((score,word)=>score+(title.startsWith(word)?5:title.includes(word)?3:1),0);
    return {item,index,rank};
  }).filter((candidate):candidate is NonNullable<typeof candidate>=>candidate!==null)
    .sort((a,b)=>b.rank-a.rank||a.index-b.index).slice(0,Math.max(0,Math.min(limit,24)))
    .map(candidate=>candidate.item);
}
