# Workbench test build — 31 October 2026

Current follow-through: [C41 final integration](FINAL_CONSOLIDATION_C41.md) adds genuine reviewed MCC direct scalar/placement copies and preserves all native asset/CE workflows. Its fresh regression totals supersede the older test counts below; general direct compiled-map editing, game loading and the remaining runtime goals stay open.

**Follow-through:** [checked private CE hosting](CUSTOM_EDITION_PRIVATE_HOST.md) now implements the actual start/status/stop lifecycle inside Online, separately from the older helper-only observations in this historical build report. Its own final executable, timings and regression evidence are recorded independently; prior failed client joins are retained.

The Windows workbench is built for the scoped workflows below. **The entire long-term feature checklist is not complete.** A launchable workspace, a successful native compilation and a playable multiplayer feature are different acceptance gates. This report replaces the older status sheet's "planned" descriptions where there is current implementation and evidence; it does not turn research targets into working features.

The continuation retains C35–C39 history, the accepted native-source workflows and the unfinished direct-map research. The original game files and the separate experimental root checkout remain outside the release package.

## Install and start testing

- Use the Windows installer or portable ZIP from this build's local `releases` directory. Both contain Spark; **no Halo game, maps, SDK tags or external tool binaries are bundled**. The portable build still needs Windows WebView2.
- In **Start here**, choose your Halo once and connect its tools. Choices are remembered. **Settings → Dependencies & setup** lets you change them later.
- For **Custom Edition**, select that dependency target. Spark detects an adjacent installed game or a registered installation. Choose **Use detected Custom Edition**, **Choose game folder**, or **Install Custom Edition**. Installation creates a separate managed copy and registers it for existing runtime tools; it does not start the game.
- For **MCC**, use your installed MCC Halo 1 plus the separate **Halo: CE Mod Tools – MCC** Steam tool. Configure your owned editable tags and Invader in the existing setup guide. Live MCC tests require the official anti-cheat-disabled launch option.
- Original maps stay preserved. Imported assets, source revisions, compiler jobs and edited outputs use separate working folders. A source-only or editor-only feature is labelled below.

## What is ready, and what remains

| Checklist area                  | Ready to test in this build                                                                                                                                                                        | Remaining acceptance or implementation                                                                                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows desktop                 | Native app, startup progress, installer, portable build and reproducible source package                                                                                                            | This is a workbench test build, not completion of the entire roadmap; installer installation on a clean separate Windows machine remains separate                                                                |
| Projects and workspaces         | Multiple map documents, per-map tools/cameras/state, workflow Back/Forward, project history and recovery, workspace windows and drawers                                                            | Broader multi-monitor/docking usability and every workspace combination still need user feedback                                                                                                                 |
| Tag editing                     | Class/tag browser, supported typed fields, native source transactions, dependency inspection, bitmap/model/audio previews and supported rebuilding                                                 | Arbitrary fields/blocks and every format are not implemented                                                                                                                                                     |
| Direct compiled `.map` editing  | Compiled-cache inspection and project overlays are available                                                                                                                                       | The separate direct-write prototype is still unfinished and retained in the backlog. Loose-tag tests do not complete this workflow                                                                               |
| QuickForge and Level Editor     | Shared viewport/material paths, source geometry, placements, group edits, floor snapping and export/build controls                                                                                 | Full unrestricted structural editing of imported BSPs and arbitrary runtime changes remain open                                                                                                                  |
| BSP Workshop                    | Editable convex source brushes; perspective/top/front/side views; rooms, corridor, ramp, clipping, face materials/UVs, diagnostics, JMS and native compilation                                     | Player walkthrough, arbitrary reconstruction, richer portal/surface editing and Workshop collaboration remain open                                                                                               |
| BSP combining                   | Existing joined-world compiler, portals, collision and sampled clearance evidence retained                                                                                                         | Complete walking/driving acceptance through complex joins and multiplayer traversal remain unverified                                                                                                            |
| Textures and rendering          | Original embedded and verified external textures, native models, bounded reflection/detail/lightmap/decal paths, anti-aliasing/resolution controls and compact bitmap inspection                   | Full engine parity remains open. Zombie's original pack now proves 510 external images; two references remain unproven. Cubemaps have their own reader; volume display and specialized effects remain incomplete |
| Home model                      | Real owned Guilty Spark model, verified materials/reflections, cursor response and actual idle/talking skeletal clips                                                                              | Compressed/world-relative/replacement animations and general randomized animated character sets remain open                                                                                                      |
| Assets                          | Browsable source models/sounds, previews and recursive checked scenery imports; native QuickForge and matching-source-map placement builds                                                         | General biped/vehicle/weapon/sound/animation import-and-compile combinations require individual acceptance. Compiled-cache structure is not modified by a visual drop alone                                      |
| Audio                           | Supported Vorbis/PCM/Xbox ADPCM previews, exact resource discovery, editor spatial/multitrack rehearsal and Director audio foundations                                                             | CELT and complete engine sound events/acoustics/parity remain open; passing decoding tests is not hearing correct gameplay audio                                                                                 |
| Animations and cinematics       | Supported animation imports/previews, Director/Machinima workspaces, timeline/camera/capture and existing native camera controls                                                                   | Complete playable mission/cinematic generation and every animation representation remain open                                                                                                                    |
| Campaign editing                | Existing native source duplication, compilation, preservation and dependency safeguards                                                                                                            | General lossless campaign tag growth, arbitrary cache injection and playable custom campaigns remain open                                                                                                        |
| Firefight and Zombie Apocalypse | Wave/rule authoring, original-source preservation, restored resource previews and selected native builds                                                                                           | Faithful zombie combat, engine AI/round progression and accepted multiplayer Firefight are not complete                                                                                                          |
| Forge and live editing          | Scoped existing-object MCC moves/scaling, camera controls and editor QuickForge operations                                                                                                         | General engine-owned spawning/destruction, live BSP/collision/PVS replacement, persistence and game-peer replication remain open                                                                                 |
| Gameplay extensions             | Previously scoped MCC sprint/camera and owner-tested 2× Warthog scaling retained; custom power-up source compilation exists                                                                        | Genuine independent dual-wield hands/reloads/HUD, player sword/lunge/damage, all vehicle scales and power-up behavior are not accepted as complete                                                               |
| SparkLink                       | Three independent Windows Spark processes with separate native trees, ordered native tag/asset/placement transactions, permissions, participant undo, conflicts, recovery and frozen native builds | This is editor synchronization on one physical machine. Broad cross-computer conditions, arbitrary large content and game-side multiplayer replication remain separate                                           |
| Online and hosting              | Existing runtime/invitation/provider checks, guided configuration and private networking foundations; CE dedicated-engine tests described below                                                    | Automated CE client join did not succeed. Complete start/join/gameplay/recovery acceptance and a general integrated server lifecycle remain open                                                                 |
| Runtime conversion              | Destination-specific MCC source builds and the reviewed-source CE path; Portability Lab analysis                                                                                                   | "Any map to any runtime" is not implemented. Xbox/MD/OpenSauce/community runtimes retain their own dependencies, semantics and build gates                                                                       |
| Runtimes and tools              | Installed-runtime registration, runtime-aware tools, Baboon/Invader/native-kit handoffs, dependency guidance and the new CE install option                                                         | Tool launch is not proof of round-trip compatibility. Extensions such as Chimera, Balltze, OpenSauce, SAPP and Mimic need version-specific integration                                                           |
| Community maps and learning     | Existing local library, curated discovery/downloads, runtime filtering, guides, scripting references, Academy, glossary and credits                                                                | A complete searchable index of every archive and fully guided advanced authoring remain open                                                                                                                     |
| Other platforms                 | Relevant source and preservation/inspection code retained                                                                                                                                          | Native Mac/Linux application acceptance, PowerPC execution and VR are not built/tested by this Windows continuation                                                                                              |
| Preservation and release        | Original hashes, isolated jobs, source revisions, source/write integrity checks, regression suites and local release artifacts                                                                     | Remote CI/publication is not implied by local success; no push or repository-rule change was performed                                                                                                           |

## New Custom Edition installation

The optional installer uses the exact [archive supplied for this project](https://archive.org/details/halo-custom-edition-v-1.10), not a substituted installer or an arbitrary frontend URL. Its pinned identity is:

```
97,046,282 bytes
SHA-256 33cf0e24551db62a08239d29077afbf9cdb2aec5c13234022c38ef144d486a3a
```

The archive's published SHA-1 was also checked during examination. These hashes identify an observed community archive; they are **not publisher authentication**. A changed/truncated/oversized download refuses extraction. HTTPS redirects stay on Archive.org hosts. The Windows extraction tool reads a complete checked archive through a read-only sharing handle. Only selected game/data files are extracted into a fresh folder; bundled setup, updater, uninstall and GameSpy installation programs are omitted and never run. Required executable/resource/UI headers and extracted file hashes are checked before registration. Per-window progress, cancellation, stale-detection checks and remembered registration are included. Missing Windows extraction support offers a browser download and folder-selection fallback.

The genuine native test downloaded/extracted **87 selected files**, imported CE Blood Gulch with **2,455 tags**, and preserved all **127 files** in the existing game installation. The final packaged application completed this challenge in **8.531 seconds** on this machine; that is one local sample, not a download-speed guarantee.

## Native engine tests and their limits

The downloaded CE dedicated executable was run from separate short-path QA copies with `127.0.0.1` binding, public listing disabled and a two-player limit. Native server query replies and logs reported:

1. Stock Blood Gulch, Slayer, dedicated, `openplaying`, game version `01.00.10.0621`.
2. A fresh `reviewed_ce_source_recovery` Workshop cache compiled through the final packaged Spark executable, Slayer, dedicated, `openplaying`. The compiler-produced cache was copied unchanged; no header was rewritten to simulate conversion.

The second cache comes from the documented [reviewed CE source recovery](CE_SOURCE_RECOVERY.md). Its seven explicit behavior changes, source fidelity limits and historical failed builds remain recorded. An engine opening this map does not prove its geometry/materials are faithful or its collision is traversable.

Separate automated client-launch attempts, including a control with a full copy of the existing installation, left the server at **zero players**. That attempt is retained as a failed join test. No actual client join, gameplay, OBS capture, traversal, AI sync, MCC/community cross-play or expanded player count is claimed from these server observations.

## Verification and repeatability

Current results and exact application identities are collected in [the machine-readable test-build receipt](fixtures/test-build-readiness.json). Previous evidence remains intact; new receipts do not overwrite failed attempts.

- Windows `cargo test --workspace --locked`: **570 passed, seven existing opt-in tests ignored**, including all 17 MCC manifest/path tests from the previously failing CI area.
- Frontend: **253 tests**; browser interaction/IPC contracts: **103 tests**, including five new CE setup cases; **59 offline scripts**. Browser contracts are separate from real native acceptance.
- TypeScript, the optimized Windows executable and NSIS installer build passed.
- Real final-executable native challenges cover CE installation/registration, BSP Workshop source/build/reopen, scenery import and native compilation in both supported source workflows, owned monitor animation/materials, original bitmap pixels/alpha, resource relocation/refusal and rendering workflows.
- SparkLink and native save/reconciliation retain separate native receipts and operation boundaries. The receipt names which exact executable each challenge used; no historical test is silently promoted to current gameplay proof.

Useful repeat commands, with fresh output directories and your matching owned paths:

```
node scripts/test-custom-edition-native.mjs --app <Spark.exe> --output <fresh-dir> --existing <owned-CE-folder>
node scripts/test-ce-server-native.mjs --runtime <checked-CE-folder> --output <fresh-short-dir>
node scripts/test-ce-server-native.mjs --runtime <checked-CE-folder> --output <fresh-short-dir> --map <real-CE-multiplayer.map>
node scripts/test-ce-server-native.mjs --runtime <checked-CE-folder> --output <fresh-short-dir> --client true
node scripts/test-bsp-workshop-native.mjs <Spark.exe> <fresh-dir> <H1A-kit> <owned-source-tags> <Invader>
node scripts/test-assets-startup-native.mjs <Spark.exe> <fresh-dir> <H1A-kit> <owned-source-tags> <Invader>
node scripts/test-bitmap-restoration-native.mjs --app <Spark.exe> --output <fresh-dir> --map <original-Zombie-Demo.map>
```

The CE smoke-test helper copies the selected game before execution, refuses a renamed/non-CE/non-multiplayer custom cache, retains logs and stops only its own processes. The optional client trial returns a failure when no native server observation proves the join.

## Next acceptance priorities

1. Resolve the CE client's first real join and observe a player walking the Workshop floor, doorways and ramp. Then repeat the native map in the appropriate MCC game, with rendering/audio inspection.
2. Finish the preserved direct compiled-map workflow on a defined format/operation set, with stale-source/byte-footprint checks, independent native comparison, saved-copy reopening and real UI acceptance.
3. Expand source asset classes and renderer/audio formats one verified case at a time. Retain the two unproven bitmap refusals and source identity guards.
4. Add real engine object lifecycle, game-peer replication and authoritative AI before calling Forge/Firefight, arbitrary live BSP replacement or larger co-op complete.

The master backlog and feature ledger retain all other goals. No experiment was discarded to create this test build.
