/** Maintained publisher metadata, checked 2026-10-28. No invented ranking or compatibility. */
export type CatalogEdition = 'halo-ce' | 'halo-pc' | 'halo-demo' | 'halo-md' | 'mcc';
export type CatalogCategory = 'multiplayer' | 'campaign' | 'firefight' | 'zombies' | 'classic';
export interface CatalogMap {
  id: string;
  title: string;
  author: string;
  edition: CatalogEdition;
  categories: CatalogCategory[];
  size: string;
  released: string;
  description: string;
  source: string;
  image?: string;
  directDownload?: string;
  mccWorkshop?: string;
  dependencies: string;
  permissions: string;
}
export const MAP_CATALOG: readonly CatalogMap[] = [
  {
    id: 'alpine-1',
    title: 'Alpine',
    author: 'Conscars',
    edition: 'halo-ce',
    categories: ['multiplayer'],
    size: '35.6 MB ZIP',
    released: '2020-12-19',
    description: 'An outdoor valley built around capture the flag and racing.',
    source: 'https://haloce3.com/downloads/multiplayer/original-multiplayer/alpine/',
    image: 'https://raw.githubusercontent.com/csauve/alpine/master/screenshot.jpg',
    directDownload: 'https://github.com/csauve/alpine/releases/download/1.0.0/alpine.zip',
    dependencies:
      'Custom Edition to play the original. Rebuilding the author’s sources also needs HEK base tags, the Refined tag set and Jesse’s HUD. MCC requires conversion checks.',
    permissions:
      'Author releases map and sources under CC BY-NC 4.0: attribution and non-commercial derivatives. https://github.com/csauve/alpine',
  },
  {
    id: 'yoyorast-v1',
    title: 'Yoyorast Island',
    author: 'Yoyorast',
    edition: 'halo-ce',
    categories: ['multiplayer', 'classic'],
    size: '14.7 MB archive listing',
    released: '2005-07-18',
    description: 'The original island multiplayer classic.',
    source: 'https://www.halomaps.org/hce/detail.cfm?fid=1144',
    image: 'https://halomaps.org/hce/img/lg/YoyorastIsland1.jpg',
    dependencies:
      'Custom Edition original. Download from the publisher page, then import the ZIP. MCC conversion and gameplay need separate verification.',
    permissions: 'Read the author’s release notes. The author restricts reproduction of the island model.',
  },
  {
    id: 'backrooms',
    title: 'The Backrooms',
    author: 'MattDratt',
    edition: 'halo-ce',
    categories: ['campaign'],
    size: '63.91 MB archive listing',
    released: '2026-06-05',
    description: 'A short single-player mystery with Chief in an unfamiliar setting.',
    source: 'https://haloce3.com/downloads/singleplayer/original-singleplayer/the-backrooms/',
    image: 'https://haloce3.com/wp-content/uploads/2026/06/backrooms_thumbnail.jpg',
    mccWorkshop: 'https://steamcommunity.com/sharedfiles/filedetails/?id=3738906454',
    dependencies:
      'Custom Edition original; the author also links a separate MCC Workshop release. Workshop installation uses Steam.',
    permissions: 'Publisher download; consult the author’s terms before redistributing derivatives.',
  },
  {
    id: 'five-nights',
    title: 'Five Nights on Halo',
    author: 'MattDratt',
    edition: 'halo-ce',
    categories: ['campaign'],
    size: '52.8 MB archive listing',
    released: '2026-10-11',
    description: 'A Halo Custom Edition adaptation of the night-shift horror game.',
    source: 'https://haloce3.com/downloads/singleplayer/original-singleplayer/five-nights-on-halo/',
    image: 'https://haloce3.com/wp-content/uploads/2026/10/Thumbnail-scaled.jpg',
    dependencies:
      'Custom Edition. The publisher supplies a map download; MCC conversion has not been verified.',
    permissions: 'Publisher download; consult the author’s terms before redistributing derivatives.',
  },
  {
    id: 'firefight-descent',
    title: 'Firefight Descent',
    author: 'MoooseGuy & Pepzee',
    edition: 'halo-ce',
    categories: ['firefight', 'classic'],
    size: '119.1 MB archive listing',
    released: '2012-08-25',
    description: 'A survival level with loadouts, waves and cinematic sequences.',
    source: 'https://www.halomaps.org/hce/detail.cfm?fid=6463',
    image: 'https://halomaps.org/hce/img/lg/ACFADA.jpg',
    dependencies:
      'Custom Edition. Script, actor and resource compatibility must be checked for another runtime. Eight-player support is not established.',
    permissions: 'Read the included author credits and release notes before editing or redistributing.',
  },
  {
    id: 'zombie-halomd-1',
    title: 'Zombie Apocalypse · HaloMD',
    author: 'Author not listed in the HaloMD catalog',
    edition: 'halo-md',
    categories: ['zombies'],
    size: 'Not listed by archive',
    released: 'Version 1.0',
    description:
      'The historical HaloMD zombie map. This is a separate release candidate from the Demo restoration.',
    source: 'https://halomd.macgamingmods.com/mods/#za_1',
    directDownload: 'https://halomd.macgamingmods.com/mods/za_1.zip',
    dependencies:
      'HaloMD original. Inspect the downloaded map and included resource requirements before conversion.',
    permissions:
      'Author information and permissions require the downloaded release notes; no redistribution grant is assumed.',
  },
];
export function filterMapCatalog(
  query: string,
  edition: CatalogEdition | 'all',
  category: CatalogCategory | 'all',
) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return MAP_CATALOG.filter(
    (map) =>
      (edition === 'all' || map.edition === edition || (edition === 'mcc' && !!map.mccWorkshop)) &&
      (category === 'all' || map.categories.includes(category)) &&
      words.every((word) =>
        `${map.title} ${map.author} ${map.description} ${map.categories.join(' ')}`
          .toLocaleLowerCase()
          .includes(word),
      ),
  );
}
