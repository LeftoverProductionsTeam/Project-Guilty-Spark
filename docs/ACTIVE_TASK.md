# Active engineering checkpoint

Task: Product Completion V3. Compact MegaWorld, the creator toolchain, native gameplay, Machinima, upstream reuse and quality.
Status: active
Starting revision: 42499887481c37ec5a5dffc4261cc86db8132c32, canonical master.
Latest verified revision: Spark 59f954c2 / 4db2570a. Windows shape/paint and Blender review/apply/Undo/Redo/Save/reopen passed. A second Blender save leaves accepted bytes intact. Continuous brush export passed. Previous 17e00308 / 723b6cd9. Native window handoff, eight-size Games & tools and OpenCE restart evidence retained. Monitor patrol and native Warthog deployment remain open.
Zombie Survival: On zombie_carrier_compare (05a4268a), Forerunner logged 102 failed seat exits; individual screenshot actors unverified. Halo Tool preserved all stock faces and 880 blade faces per body LOD, 26 markers, checksum 4180762708, and stock cutoffs for the Demolisher render variant. Collision, paint shader and playtest remain open.
Next action: Locate a surviving exact b5178c77/bake copy and package with the verified expanded-sky and vehicle-mask compiler. Bounded staging search found only released fcfe9d44. Independently preserve the Demolisher collision rig and add blade collision.

## Acceptance

- Compact the existing 19-region world while preserving stock terrain, materials, lighting, placements, teleporters, and region ownership.
- Native acceptance uses normal menus/controls and includes a rendered check, both traversal directions, and Warthog clearance. Source generation, native compiler output and hash readback are separate evidence.
- After geometry acceptance, carry the sealed 19-region Extraction content forward through the existing publisher. Derive a new hash-bound receipt from actual compiled roster rows and BSP ownership. Maintain two viable starts, three weapon draws, and one vehicle draw per logical region.
- Keep only one reviewed MegaWorld in Latest and one Previous rollback. Preserve the regression assets independently.

## Verified milestones

- Spark browser validation at 967300f7 exercised actual viewport drag, Preview, Apply, Save and Undo with mocked desktop IPC. Tunnel, cave and ridge routes use the same draft-point editor. The neighboring BSP handle translates the donor and its landings together. Preview marks grades and native clearance error locations and shows copied stock facing disagreements as purple advisories. The shared native BSP preflight runs before structure compilation.
- Exact private b5178c77 / 4a7f6920 on Win64 2beae96a passed a continuous normal-input foot loop through native slots 11→10→3→10→11 at ticks 25858, 28746, 31201 and 34320. The same Elite returned at full vitality via the new Carousel ramp. Forerunner verified the regional transition log and Ice Fields opacity along the sampled route. Warthog and wider rendering remain open.
- Carousel infantry return passed on 919fbcce via teleporter 334→335. Vehicle return remains open.
- Sealed full-world Extraction content remains independent in `D:/Project Forerunner/build/regional-pressure-profile/megaworld-19-pools-native-fd7a49fa`, pair fd7a49fa / 868a8adf and readback 3ce3b0da. Forerunner e8fb86f2e records the completed UNSC LAN deployment, field pickup and bank on that exact map with Covenant guest alive in BSP 11. It is not the compact geometry candidate.
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
- Two-way Warthog use and final receipt regeneration await native acceptance.

## Operations and safe checkpoint

Physical paths only. Reuse verified inputs, selective builds and evidence. Preserve active sessions, originals and unfinished BSP/Atlas work. Private candidates stay separate from Latest/Previous. No pushes.

## Deferred requests

All 475 requirements, M1–M6, Operation 110%, later owner directives, and existing licensing, safety and original-asset protections remain in effect. Continue independent reusable work when the native gate is blocked. Keep standalone Be Native for regression and preserve the currently released ground preview.
