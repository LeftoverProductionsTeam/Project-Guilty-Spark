# Project Guilty Spark — Continuation 13: multiplayer and historically attributed tutorials

Date: October 26, 2026. **Source baseline:** delivered Continuation 12 ZIP. No original Halo asset, stock map, installed server config, or savegame is modified.

## Code delivered (not merely proposed)

1. `src/components/MultiplayerWorkbench.tsx`, `src/multiplayer.css`: multiplayer setup in Creator Studio. Per-runtime selection; installed Halo Custom Edition read-only map scan; separate stock and designed game variants; map rotation; preflight status; review-only config, portable JSON and bundled ZIP export. All controls provide hover descriptions. The actual Halo game is not launched.
2. `src/multiplayerSetup.ts`: map inventory filters for **Halo Custom Edition cache version 609** and **scenario type 1** (multiplayer), with verified SHA-256 and safe basenames. Version 7/13 and non-multiplayer maps are not treated as ready. Server profile detects missing maps, unsupported runtimes, unsaved native custom variants and non-stock AI/infection concepts. No false claim of real networked AI.
3. `src/creatorStudio.ts` and `crates/spark-core/src/creative.rs`: backwards-compatible `server.gameTypes` data. Rust `serde(default, skip_serializing_if = "Vec::is_empty")` preserves older project serialization when the collection is empty. Both sides validate names, bounds, modes, native evidence, and injection characters. **Rust test cases were authored but have not been executed here.**
4. `src/multiplayerScenario.ts`: source-only QuickForge suggestions for player starts, CTF flags, Oddball, King, race checkpoints and target-runtime mismatch. These are not claims about compiled maps in a server rotation.
5. `src/multiplayerPackage.ts`: portable ZIP containing review `init.txt`, JSON containing selected map hashes, and step-by-step LAN setup guidance. Original maps, game binaries, native game variants, local paths, credentials and proprietary assets are not included. The manifest omits user-entered local native-evidence paths.
6. `src/forumTutorials.ts`: original, **named** tutorials from CE3 and the 2005 Halo Wiki/Halo Maps compilation; Academy references link to archives and never present an assistant-written lesson as an original author's work. Added a private Halo CE LAN Academy lesson and first-run path. Community Thanks now credits these authors and modern game-type format research separately.

## Actual engine constraints

- Stock Halo Custom Edition's classic cache header uses version 609; Halo PC uses 7 and H1A uses 13. A readable file is not proof of an engine-playable map. The scanner is an **inspection-only** gate.
- Microsoft/Bungie documented stock dedicated-server `init.txt` commands and native custom game-type handoff. Our exporter emits only supported stock CE commands. Actual native game-type files (e.g. `blam.lst`) have game-specific binary structure and checksums. We do not invent one or overwrite savegame data.
- Historical `HaloCE-Gametype-Editor` by **noctilucent**, crediting **Kybo_Ren, ZiON and Thomas K** for prior format research, confirms native file format and CRC handling need dedicated engineering and actual-file tests. The repository is GPL-3.0; no source code has been copied into Guilty Spark.
- c20 documents that stock Halo 1 multiplayer does not synchronize AI behavior. Script-room/biped-crusher workarounds apply to some original Custom Edition uses and **not MCC/H1A**. A custom game-type name cannot turn on networked Zombie Apocalypse.
- Map starts and flags must exist in the actual scenario and be compiled by the matching Halo Tool; source QuickForge warnings are only early guidance.

## Tests and truth labels

**Passed in this environment:** existing `npm run test:offline` regression suite and added tests for map proof filtering, custom variants, command injection, unsafe names, wrong cache versions, source-game objectives, tutorial source attribution, and portable ZIP construction. TypeScript logic modules typechecked using the locally installed global TypeScript compiler. TS/TSX syntax parsing was performed.

**Not verified:** complete frontend typecheck with installed React/Tauri dependencies; native Rust `cargo test`, Windows/Tauri startup, actual server launch, game-type binary import/export, dedicated-host networking, 2/4-client sessions, AI synchronization, collision/portal-safe compiled BSP, automatic bitmap/shader/lightmap extraction, or a playable First Contact campaign. These must not appear as completed tasks in the phase acceptance matrix.

## Required next technical milestones

1. Validate Rust schema and native UI on a Windows build; inspect one existing `blam.lst` **read-only** and derive a versioned parser/CRC contract before any native export. Reject mismatched versions; never overwrite original native variants.
2. Run an actual Halo CE dedicated server with one stock multiplayer `.map` and `slayer`; confirm the client joins, spawn/score rules work, and the rotation advances. Repeat with an owner-created native variant and a second machine.
3. Implement real map compiler integration and reusable source reconstruction of imported BSPs: seamless render/collision topology, portals/PVS, lightmaps, environment tags, gameplay and AI pathfinding. Test clean open/close/edit cycles and use WRL diagnostics.
4. Implement authentic local Halo bitmap/shader and lightmap decoding, with safe format bounds and no copyrighted asset redistribution. Preserve bitmap alpha; legacy extraction reports document alpha corruption pitfalls.
5. Integrate campaign scenario dependencies, build and test the First Contact vertical slice, real Firefight actors and eventually engine-specific AI synchronization. A simulated wave is not a spawned actor and a manifest match is not a network game.

## References (verifiable, no copied source)

- Bungie/Microsoft Halo PC dedicated server reference: https://halo.bungie.org/misc/hpc_ds_103_readme.html
- c20 H1 Editing Kit, cache versions and compiler distinctions: https://c20.reclaimers.net/h1/h1-ek/
- c20 Halo CE synchronization/AI limitations: https://reclaimers.net/h1/guides/multiplayer/synchronization/
- CE3 named tutorial author index: https://haloce3.com/tutorial-index/
- Halo Maps compilation of 2005 Wiki tutorials: https://www.halomaps.org/hce/detail.cfm?fid=1535
- Historical Halo CE gametype editor (GPL-3.0; reference only): https://github.com/nocti1/HaloCE-Gametype-Editor
- Original Halo Maps bitmap extraction alpha pitfalls: https://halomaps.org/hce/detail.cfm?fid=1618
- c20 modern tools philosophy: https://reclaimers.net/general/mod-tools/

**Owner's first Windows test:** Extract this source ZIP into a separate folder and follow the existing `docs/TESTING.md` build instructions. In Creator Studio choose Dedicated Server, register Halo Custom Edition in Runtimes if installed, scan your installed maps, select one verified multiplayer cache and stock Slayer, and export a private session ZIP. Do not apply the output to a production server or overwrite installed Halo files.
