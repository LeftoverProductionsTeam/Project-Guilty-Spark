# Active engineering checkpoint

Task: Product Completion V3. Compact MegaWorld, the creator toolchain, native gameplay, Machinima, upstream reuse and quality.
Status: active
Starting revision: 42499887481c37ec5a5dffc4261cc86db8132c32, canonical master.
Latest verified revision: Spark 4f28d8f8 / bf4c156e includes the curved Box plow. Previous 42c19e04 / d0135aaa. Native Studio → About opened. About and Machinima passed four layout sizes. Earlier 42c19e04 / d0135aaa built the plow and reviewed spawn rules together, reopened MCC13 8a2c2c22 and staged it on Forerunner deaca69b.
Zombie Survival: 05a4268a logged 102 failed carrier exits. Forerunner deaca69b loaded earlier plow 901cacc5 through Host Zombie Apocalypse. Spark normal Build proved project a3a62b39 / paint bbd1dfd9 / MCC13 61f8d17b, native CRC, dependencies and road-plow collision. Exact 61f8d17b appeared in Forerunner’s Zombies chooser. Windows blocked Host before map load. Latest guides users to Play Solo and keeps Stop available after edits.
Next action: finish live Invader Qt tag save, Apply/Undo and MCC rebuild. Private launch and focused tests passed. Ladder gameplay remains open.

## Acceptance

- Compact the existing 19-region world while preserving stock terrain, materials, lighting, placements, teleporters, and region ownership.
- Native acceptance uses normal menus/controls and includes a rendered check, both traversal directions, and Warthog clearance. Source generation, native compiler output and hash readback are separate evidence.
- After geometry acceptance, carry the sealed 19-region Extraction content forward through the existing publisher. Derive a new hash-bound receipt from actual compiled roster rows and BSP ownership. Maintain two viable starts, three weapon draws, and one vehicle draw per logical region.
- Keep only one reviewed MegaWorld in Latest and one Previous rollback. Preserve the regression assets independently.

## Verified milestones

- Spark browser validation at 967300f7 exercised actual viewport drag, Preview, Apply, Save and Undo with mocked desktop IPC. Tunnel, cave and ridge routes use the same draft-point editor. The neighboring BSP handle translates the donor and its landings together. Preview marks grades and native clearance error locations and shows copied stock facing disagreements as purple advisories. The shared native BSP preflight runs before structure compilation.
- Exact private b5178c77 / 4a7f6920 on Win64 2beae96a passed a continuous normal-input foot loop through native slots 11→10→3→10→11 at ticks 25858, 28746, 31201 and 34320. The same Elite returned at full vitality via the new Carousel ramp. Forerunner verified the regional transition log and Ice Fields opacity along the sampled route. Warthog and wider rendering remain open.
- Carousel infantry return passed on 919fbcce via teleporter 334→335. Vehicle return remains open.
- Sealed full-world Extraction content survives in the reviewed replay folder, pair fd7a49fa / 868a8adf and readback 3ce3b0da. Forerunner e8fb86f2e records the completed UNSC LAN deployment, field pickup and bank on that exact map with Covenant guest alive in BSP 11. It is not the compact geometry candidate.
- Previous compiler, asset, Machinima, and gameplay evidence is retained in 74db6049:docs/ACTIVE_TASK.md and the existing records it links. V3 governs current work.

## Changed work

All paths below are under the physical `D:/Project Forerunner/build/regional-pressure-profile` staging root. Each candidate contains `megaworld_19_playtest.map` and its same-base receipt.

| Folder suffix | Map SHA-256 | Receipt SHA-256 | Source provenance |
| --- | --- | --- | --- |
| e55f3851 | e55f38519886dddf84acb67e5ee4dd228410b97b6debeb1f7484e4fc20b50fde | 981fb84bc7406ac11e8eb4dbac5eda442ecbe9274839339025f8ea857da3229a | Ice Fields opacity source retained at 6f825e71; native camera readback 8eb3d604 |
| d05638dd | d05638dd50213db8d7533676575d7d6fc7f3a34c47fb9d6cd1499f07c457c5d5 | 894eadea83d0e131b44ed83b0b0879c537fcb8437ca432f8dbba39a88872c330 | Local Carousel ramp source retained at 6f825e71; exact entrance JMS SHA 4c533f8111335efcc1c103fd69fe303daad015de7aa05085ae0b9727c8c4c85b |
| b5178c77 | b5178c77a6844595c41d5e000e1bdcc90058d18e7388ab856e55b12c9838400b | 4a7f6920c00e3d19b63df483cead1385a798a282408140300a6dba11caf75c91 | e55f3851 plus re-baked Carousel slot 3 with corrected copied stock winding; reusable implementation 967300f7 |

Folder prefix is `megaworld-compact-native-`. Keep f5a4ca22 / 4a095213 as the rejected-render, corrected-floor control. The retained `carousel-vehicle-ramp-source/opacity-winding-control/entrance.jms` SHA is 69ec91435cb8c6b92b40f254a86df310a24f42b432772f237c18e497771cdd27. Its existing `native-bake-proof.json` identifies exact baked BSP/bitmap output. b517 replaces only physical BSP 3 in e55. Scenario and all other BSP bytes match e55. Clearance and camera readbacks are beside the map. Forerunner owns native acceptance.

## Failures and blockers

- The previously missing Ice Fields wall passed the exact matched native view on b5178c77 / 4a7f6920 and Win64 2beae96a at tick 4350. Forerunner retained `compact-native-diagnostics/screens/window16560.bmp` at BSP 11, yaw −92°, OpenGL 800×600. Wider visual and Warthog checks remain open. Use the existing f5 camera at (928.6,183.1,-15.1), BSP 11, yaw -92°, Win64 OpenGL 800×600. Rejected frame `compact-corrected-route/screens/window21286.bmp` shows white terrain and missing opaque walls. Keep snow/prop comparisons and ambience restoration open.
- Sidewinder–Timberland exposed seam remains open (owner screenshot add9a910; 74db6049). On exact fd7a49fa, Forerunner tied the new terrain intrusion to the Timberland end of Infinity (BSP12, switch 22, eye 36.3/34.2/-20.5) and the dark cutout to the Chiron entrance (BSP0, eye 350/-38.1/-18.6). The tree screenshot remains unrouted.
- Spark commit 4e218d25 runs retained-connector geometry checks before tag staging. Exact Death Island cache d893d81c reproduces retained-BSP intrusion at (-179.31, 387.98, 1.09) and now stops before creating a staging job. The Boarding Action control separately stops at (732.50, 53.19, -17.66). The exact b5178c77 source passed the in-place clearance check using its retained entrances and preserved switch volumes.
- Spark 37b53042 verifies both scenery closures (15 files). The sparse test recovered 13 from exact source. Physical short paths in fe892849 fixed Halo Tool opening a 273-character tag path. Native slot 10 baked two pages (BSP 1745ccfd, bitmap 4d163cd5). The owner purged the physical Forerunner staging folder containing this bake. Recover exact surviving inputs before packaging. Stock Windows Invader 5606801e refused 11 skies at its eight-slot limit. No playable cache from this edit.
- Construction can select and save an in-place edit to an inherited isolated connector. Preview and Build require its original landings, switch volumes and BSP slot identities. The actual editor-led native bake/reopen and traversal remain unverified. This path edits the connector alone. The entrance ramp and floor patches in b517 still use the retained native repair harness.
- Exact d0c4c13b passed the first-person 11→10→3→10→11 foot loop on 02aa847e. d08ec305 restored Warthog spawn and passed the Ghost round trip. The Elite lacks a Warthog seat-entry animation. Evidence and the separate mask-only control are recorded in MEGAWORLD_SEAM_ROUTES_20261108.md. Two-way Warthog and the final receipt await native acceptance.

## Operations and safe checkpoint

Physical paths only. Reuse verified inputs, selective builds and evidence. Preserve active sessions, originals and unfinished BSP/Atlas work. Private candidates stay separate from Latest/Previous. No pushes.

## Deferred requests

All 475 requirements, M1–M6, Operation 110%, later owner directives, and existing licensing, safety and original-asset protections remain in effect. Continue independent reusable work when the native gate is blocked. Keep standalone Be Native for regression and preserve the currently released ground preview.
