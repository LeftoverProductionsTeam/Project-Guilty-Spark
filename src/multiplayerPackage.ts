/** Portable, review-only Halo CE multiplayer session bundle.
 * Safe synthetic project metadata only: maps, blam.lst, credentials, RCON,
 * savegames and executable files are never bundled or modified.
 */
import { sourceTreeZip } from './sourceZip.ts';
import { exportHaloCeServerInit } from './creatorStudio.ts';
import type { CreatorStudioDocument } from './creatorStudio.ts';
import type { RuntimeInventory } from './types';
import { analyzeHaloCeSession, exportSessionHandoff } from './multiplayerSetup.ts';

export function packageHaloCeSession(studio:CreatorStudioDocument,inventory:RuntimeInventory|null):Uint8Array {
  const report=analyzeHaloCeSession(studio.server,inventory);
  if(!report.readyForManualLocalTest)throw new Error('Fix all multiplayer preflight blockers before packaging.');
  const config=exportHaloCeServerInit(studio);
  const handoff=exportSessionHandoff(studio,inventory);
  const checklist=[
    '# Guilty Spark Halo Custom Edition private session handoff',
    '',
    'STATUS: REVIEW ONLY. No game map, native variant, server executable, or credentials are included.',
    '',
    '1. Compare each map SHA-256 in SESSION_MANIFEST.json to the actual map on the host and joining computer.',
    '2. Install authorized .map files using the legitimate Halo CE installation workflow; Guilty Spark has not installed them.',
    '3. For custom variants, use the native Halo CE game-type editor to create a variant with the exact same name.',
    '4. Review server/REVIEW_init.txt in a text editor. Apply it to an isolated, authorized private test server manually.',
    '5. Confirm Windows Firewall/router rules yourself if needed; nothing was opened or changed by this package.',
    '6. Launch the chosen native server separately. Join from at least two licensed/compatible clients and record evidence.',
    '7. Stock Halo CE multiplayer does not synchronize full AI state. Do not claim Zombie Apocalypse networking works.',
    '',
    'REFERENCES:',
    '- Microsoft Halo PC Dedicated Server Readme: https://halo.bungie.org/misc/hpc_ds_103_readme.html',
    '- CE3 author-attributed tutorials: https://haloce3.com/tutorial-index/',
    '- Network AI limits: https://reclaimers.net/h1/guides/multiplayer/synchronization/',
    '',
  ].join('\n');
  return sourceTreeZip([
    {name:'README_FIRST.md',contents:checklist},
    {name:'server/REVIEW_init.txt',contents:config},
    {name:'SESSION_MANIFEST.json',contents:handoff},
  ]);
}
