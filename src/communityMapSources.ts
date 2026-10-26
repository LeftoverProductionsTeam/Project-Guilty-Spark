/**
 * Curated, external community pages. Not a live search index and not a downloader.
 * The browser handles user-chosen downloads; Spark imports a separate local copy
 * after its existing bounded native file/ZIP checks. No executable or web data
 * enters a project through this catalog.
 */
export type MapAudience = 'halo-ce' | 'halo-pc' | 'halo-demo' | 'halo-md' | 'halo-xbox' | 'mixed';
export type MapSourceKind = 'download-catalog' | 'historic-discussion' | 'mixed-archive';
export interface CommunityMapSource {
  id: string;
  title: string;
  url: string;
  audience: MapAudience;
  kind: MapSourceKind;
  era: string;
  summary: string;
  caveat: string;
  /** When true the site has a navigable download catalog, NOT proof each file works. */
  catalog: boolean;
}
export const COMMUNITY_MAP_SOURCES: readonly CommunityMapSource[] = [
  {
    id: 'halomods-ce', title: 'HaloMods Classic — Halo CE downloads',
    url: 'https://www.halomods.info/viewforum.php?f=17', audience: 'halo-ce',
    kind: 'historic-discussion', era: '2004–2009 forum archive', catalog: false,
    summary: 'The original HaloMods Halo Custom Edition maps and mods forum, preserved read-only.',
    caveat: 'Links and attachments are historical; availability and permission must be checked per post. A forum post is not a verified map package.',
  },
  {
    id: 'halomods-pc', title: 'HaloMods Classic — Halo PC downloads',
    url: 'https://www.halomods.info/viewforum.php?f=1', audience: 'halo-pc',
    kind: 'historic-discussion', era: '2004–2009 forum archive', catalog: false,
    summary: 'Original Halo PC mod posts, including historically popular PPF-style patches.',
    caveat: 'Many downloads are patch formats requiring an owned base map, not standalone .map files. Spark does not automatically apply PPF patches.',
  },
  {
    id: 'halomaps-ce', title: 'HaloMaps — Custom Edition maps',
    url: 'https://www.halomaps.org/hce/index.cfm', audience: 'halo-ce',
    kind: 'download-catalog', era: 'Classic CE archive', catalog: true,
    summary: 'Large historical catalog of Halo Custom Edition maps, assets, and utilities.',
    caveat: 'Files are listed for Halo Custom Edition. Other editions cannot load every .map without conversion/rebuilding.',
  },
  {
    id: 'ce3', title: 'CE3 — community map archive',
    url: 'https://haloce3.com/', audience: 'halo-ce',
    kind: 'download-catalog', era: 'Maintained archive', catalog: true,
    summary: 'Searchable creator-attributed Halo CE maps, including original and modified singleplayer and multiplayer releases.',
    caveat: 'Some downloads need OpenSauce or additional resources; verify author notes and dependencies.',
  },
  {
    id: 'halomd', title: 'HaloMD — historic demo mods',
    url: 'https://halomd.macgamingmods.com/mods/', audience: 'halo-md',
    kind: 'mixed-archive', era: 'Mac Demo community', catalog: true,
    summary: 'Classic HaloMD community mods, including the historical Zombie Apocalypse listing.',
    caveat: 'HaloMD mods are not automatically compatible with original Mac Demo, Halo PC or Halo CE. Verify the actual downloaded format.',
  },
  {
    id: 'halomd-demo', title: 'HaloMD — archived Halo Demo packages',
    url: 'https://www.halomd.net/demo/', audience: 'halo-demo',
    kind: 'mixed-archive', era: 'Historic demo packages', catalog: true,
    summary: 'Index of classic Mac Halo Demo ZIP packages; review each mod and its provenance individually.',
    caveat: 'Old ZIPs may contain scripts, patchers or other files besides maps. Do not run unknown executables or assume compatibility.',
  },
] as const;

export type CommunityMapFilter = 'all' | MapAudience;

/** Only exact, authored HTTPS destinations are exposed; no user URLs are executed. */
export function isCuratedCommunityUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.username === '' && parsed.password === '' &&
      COMMUNITY_MAP_SOURCES.some(source => source.url === parsed.href);
  } catch { return false; }
}

export function filterCommunityMapSources(query: string, audience: CommunityMapFilter = 'all'): CommunityMapSource[] {
  const term = query.trim().toLocaleLowerCase().slice(0, 120);
  return COMMUNITY_MAP_SOURCES.filter(source => {
    if (audience !== 'all' && source.audience !== audience && source.audience !== 'mixed') return false;
    return !term || [source.title, source.summary, source.era, source.audience].join(' ').toLocaleLowerCase().includes(term);
  });
}

export type LocalDownloadKind = 'map' | 'zip' | 'unsupported-archive' | 'patch' | 'blocked-executable' | 'unknown';
/** Filename hints are *not* trust: native import validates the actual file and format. */
export function describeCommunityDownload(filename: string): {kind: LocalDownloadKind; guidance: string} {
  const safeName = filename.trim().split(/[\\/]/).pop() ?? '';
  const ext = safeName.includes('.') ? safeName.split('.').pop()?.toLowerCase() ?? '' : '';
  switch (ext) {
    case 'map': case 'yelo':
      return {kind: 'map', guidance: 'Choose Import downloaded file. Spark will inspect the local Halo cache and preserve its original bytes. .yelo needs a compatible OpenSauce runtime.'};
    case 'zip':
      return {kind: 'zip', guidance: 'Choose Import downloaded file. Spark inventories the ZIP with size, traversal and file-type limits; it only imports supported Halo maps, never runs included programs.'};
    case 'rar': case '7z':
      return {kind: 'unsupported-archive', guidance: 'Spark does not directly import this archive type. Inspect with a trustworthy archive utility and import only the extracted .map or .yelo; do not run included installers.'};
    case 'ppf': case 'ips': case 'xdelta': case 'bps':
      return {kind: 'patch', guidance: 'This is a patch, not a standalone map. Spark does not apply it automatically. Verify the patch author, required base map and rights before any separate tooling.'};
    case 'exe': case 'msi': case 'bat': case 'cmd': case 'ps1': case 'scr': case 'dll': case 'com': case 'sh':
      return {kind: 'blocked-executable', guidance: 'This is executable content, not a Halo map. Do not run it merely to import a community map. Spark does not execute downloaded programs.'};
    default:
      return {kind: 'unknown', guidance: 'Check the publisher and file format. Spark imports .map, .yelo and compatible .zip files; a filename alone never verifies a download.'};
  }
}
