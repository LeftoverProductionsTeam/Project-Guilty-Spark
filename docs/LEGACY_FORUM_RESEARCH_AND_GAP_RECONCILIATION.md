# Project Guilty Spark - legacy Halo forum research and remaining engineering

**Research date:** 2026-10-25/26. **Baseline:** 07 Halo Modding Brain Continuation 2 full-source ZIP, not the older v0.3 zip. **Research confidence:** historical archive descriptions verified online. Statements about old tools are claims in their project pages, not independently run/tested features. No third-party source, binaries, Halo assets or screenshots were incorporated into this repository.

## The product we actually agreed to build

One native desktop application that brings the _capabilities_ of the old, disjoint Halo 1 ecosystem together: an Eschaton/HMT-like typed tag explorer; SwordEdit/Sapien-like 3D placement and mission work; original geometry, actual textures, lighting, sky and sound; usable authoring for arenas, campaigns, Firefight and Zombie Apocalypse; reliable engine-specific build/test; package sharing and friends play; dedicated-server settings; authentic locally sourced Halo interface themes; a clearly separated time-machine export route for Demo/PC/CE/MD/G4. **Not simply a launcher.**

Two flagship acceptance projects: (1) build and load a _Guilty Spark Test Arena_ with correct geometry, collision, starting points and items; (2) restore the _Zombie Apocalypse_ play loop using owner-provided source maps/resources and demonstrate actual gameplay in the target engine. A full _First Contact_ campaign vertical slice and a second-computer AI/multiplayer test remain additional acceptance gates. Tests against one engine never prove another.

The reconstructed requirements matrix in `ORIGINAL_92_REQUIREMENTS_RECONSTRUCTION.md` has 92 granular tasks; `PHASE3_10_FEATURE_TRACEABILITY.csv` has separate phase-related work packages. Original complete Phase 3-7 Codex prompt bodies were not fully recoverable, so a complete *verbatim* comparison to all ten is **not possible**. Requirements described here are a best-effort functional reconciliation, and nothing absent is deemed superseded.

## Historical sources and what they change

| Year / source | Historical information actually evidenced | Why it matters to Guilty Spark | Integration restraint |
| --- | --- | --- | --- |
| MacGamingMods Halo Demo archive | The archive lists Eschaton 0.8.1, **Fonzie's Modding Pack v5**, and other classic Halo Demo tools and mods. https://www.macgamingmods.com/ | Catalog and compare original Mac Demo workflows, editability and creator attribution; attempt restoration with owner's originals. | Do not redistribute archived maps/tools or import old executable code without rights review. |
| HaloMD mod archive | **Zombie Apocalypse 1.0** is listed. https://halomd.macgamingmods.com/mods/ | Historical name/version and possible provenance lead for restoration; compare variant/hash and behavior against owned fixture. | Listing alone is NOT a recovered source scenario or permission to redistribute. |
| Halo Maps, FireDragon04, November 2005 | Three-part *Outdoor Map* tutorial: basic BSP modelling, texturing, then Tool/Guerilla/Sapien. https://www.halomaps.org/hce/detail.cfm?fid=1529 and https://www.halomaps.org/hce/index.cfm?Start=211&sid=23&sort=6 | Guilty Spark must bridge source modelling through tag/shader references to final build, not stop at drawing a mesh. | Tutorial techniques are reference material, not tested implementation. |
| Halo CE BSP Tag Converter v2.5, FireScythe, August 2006 | Historical description claims BSP-tag -> OBJ/MTL, bitmap extraction, distinct material meshes, lens flares, BSP markers, portal faces and fog planes. https://www.halomaps.org/hce/detail.cfm?fid=2029 | Concrete checklist for real BSP export/import and preserving UV/material/portal/marker provenance. | Rights to source are not established by a download page; don't copy source or binaries. Exporting OBJ is not rebuilding a valid BSP. |
| Aether, TheFieryScythe, February 2009 | Historical page claims BSP textured mesh, lightmap mesh/bitmap, portals/fog planes and marker export, and lightmap bitmap manipulation. https://www.halomaps.org/hce/detail.cfm?fid=4312 | Precise missing parts of Living Halo (UV2/lightmaps), marker import, lighting and preview; a plan for independent read-only extraction first. | Old author's features are self-described, not validated on current caches or present in this code. |
| Halo Maps archived forum, Dec 2019 | Forum Tool structure log shows distinct collision, render, cluster, portal, PVS and pathfinding build phases. https://forum.halomaps.org/indexd229.html | Tests must verify **all** geometry subsystems; 'triangles exported' doesn't mean a playable BSP. | Historical example is illustrative, not a safe CLI recipe to run blindly. |
| c20 HaloScript reference | A `dormant` script wakes by explicit `(wake name)`, a `startup` script auto-runs, and static scripts can use an explicit return type. https://c20.reclaimers.net/h1/scripting/ | Prevent invalid `startup void` declarations and accidental simultaneous mission/Firefight start; preserve manual progression. | `.hsc` still requires real Sapien/H1A compilation and bound scenario references. |
| c20 scripting limits | HEK has finite syntax node and script declaration budgets; stack overflow can damage script behavior. https://c20.reclaimers.net/h1/scripting/limits/ | Bound script-generator output and track max AI wave expansion, triggers, recursion and script names. | Conservative bounds are **not** proof of successful compilation. |
| c20 map/cache documentation | Halo Demo, PC/Custom Edition, Xbox and MCC cache/resource formats differ; H1A bitmap and sound storage differs from classic. https://c20.reclaimers.net/h1/maps/ | Treat import/export as engine-specific conversion with external resources; never relabel an old Demo map as MCC-ready. | Do not redistribute Microsoft game-owned cache assets. |
| c20 H1 multiplayer sync research | Halo 1 stock multiplayer does not provide general AI/script-state replication. https://c20.reclaimers.net/h1/guides/multiplayer/synchronization/ | A completed AI wave source does **not** create networked Zombie Apocalypse. Target tested native replication or a supported MCC co-op route. | No engine memory hacks, EAC changes, unauthorized net protocol patching or public matchmaking integration. |
| Open Carnage, Co-op Evolved discussion (historical) | A community project claims native Halo CE multiplayer AI synchronization, biped/script behavior and a complex setup using Chimera and related components. https://opencarnage.net/index.php?/profile/2168-schulzy/&do=content | Research an **opt-in, license-reviewed, version-pinned** CE multiplayer bridge or test ChupathingyCE/OpenCE's distinct APIs. | Author's beta claim does NOT prove modern support, MCC support or safe redistribution. |

## What remains after this continuation, by phase

| Phase | Work still requiring real engineering | Evidence needed to close |
| --- | --- | --- |
| 1 - Foundations | Version-aware byte ranges and complete tag schema coverage, comprehensive malformed-map corpus, safe project migration, robust external resource discovery. | Rust + Windows app tests with known authored and licensed real maps across supported versions. |
| 2 - Editor and Zombie restoration | Class-safe editable fields for more tags, relationships and bulk references; determine Zombie Apocalypse's actual spawning/resurrection rules; repair missing resources using licensed sources only. | Restore original gameplay mechanics on a derived map; hash and compare original against preserved copy. |
| 3 - QuickForge | Seal/weld arbitrary source meshes, correct collision/portal/PVS; valid scenario spawns/weapon tags and complete multiplayer game rules; build test arena. | Tool/Invader build and actual in-engine walkability, weapon pickup, match load. |
| 4 - Living Workbench | Auto-read shader->bitmap/lightmap from user-owned Halo caches, transparency/reflection/water/sky/fog; full campaign & cinematic scenario tag compilation, AI and navigation; modern high-poly glTF/FBX model optimization/collision. | Authentic map screenshot vs game, build-first First Contact gameplay and cinematics. |
| 5 - Finish the Fight | Windows build, GPU and UX tests, release/signing, performance, crash logging; real build/test/rollback and no-placeholder release audit. | All target CI and 2-PC manual cases pass with artifacts/hashes and rollback. |
| 6 - Great Reclamation | Complete license/provenance audit of historic tools, universal tool manager and feature registry; Eschaton/SwordEdit parity; Modding Academy interactive Rocket Pistol, map/campaign/AI tutorials. | Owner can follow one integrated tutorial and produce a real game change without switching apps manually. |
| 7 - Reality Forge | Modify **imported** compiled BSP via reconstructed editable source, caves/branches/exits, deformation, source CSG, collision, portal/PVS/lightmaps/nav and real BSP swaps. | Surviving recompile on a copied asset, walk through two-room tunnel in actual Halo with correct collision. |
| 8 - Operation LAN Party | Per-runtime authenticated host/join, actual AI replication, creator-to-player installation/rollback, complete package dependency resolution, shared projects/merge/conflict management, server lifecycle. | Four friends play a shipped map with shared revision 2; server changes/rollback tested; real AI matches host+clients. |
| 9 - Combat Evolved | Halo CE Classic visual fidelity with user-provided ui.map/bitmaps.map/sounds.map; animated menu textures, Theme Forge WYSIWYG, audio timeline/event bindings, accessibility and layout review. | Original menu assets display locally, four themes usable, sound/mute persists; no redistributable copyrighted media. |
| 10 - Time Machine | Genuine Demo/retail/CE/MD/Xbox/MCC export profiles, G4-compatible derivative built by supported tools, source/target hashes, rollback, optional LAN-only read-only legacy bridge. | Owner loads authorized mod on real PowerPC G4 without changing original installed data. |

### Post-Phase-10 requests we must not lose

* A **Living Halo** world preview with true scenery meshes, not placeholders, and image/sound cues drawn only from the user's local game data.
* Import a `.map` by dragging it, browse actual BSP surfaces and select an object to jump to its typed Eschaton-style tag.
* Raise hills, sculpt cliffs, stretch maps and connect sealed branching caves. Edits on an original compiled BSP are not yet supported. Current source-only QuickForge terrain/tube authoring is not a valid in-game CSG pipeline.
* Mota-inspired BSP swaps/merges, world reconstruction/OBJ collision correctness and separate attribution. Requires authorized tool/source access and round-trip validation.
* Independent editor view distance vs **engine** draw distance/fog/PVS; never imply a camera far-plane change modifies the game engine.
* Dedicated server game mode/match rotation/player controls with opt-in backups/rollback, version-specific capability adapters and no privilege/config changes by default.
* ChupathingyCE **separate from** OpenCE, with precise documented build/protocol compatibility, rather than claiming universal interoperability; Milenko attribution is separate from Mota.
* Extensible local tool cache with explicit user approval, license, checksums and no silent installers/external execution.
* Actual Zombie Apocalypse MCC mod-mode / H1A campaign-coop route where supported, distinct from CE-native AI synchronization. The original multiplayer experience may require design changes in engines without network AI.

## Source-to-game delivery gates (all must pass before 'playable')

1. **Source provenance:** user-supplied editable source/tag corpus, original hash retained; zero unlicensed assets redistributed.
2. **Real resources:** all required bitmap/sound/model/scenario refs resolvable. Stop when extraction is incomplete, even if a tool reports exit code 0.
3. **Geometry:** valid manifold/CSG BSP source, shader names, UVs, collision, portals and subclusters; independent compiler validation.
4. **Scenario & scripts:** actual AI encounters, firing positions and navigation, trigger/camera points, player starts, scripted mode and HUD; scripts compiled by exact tool version.
5. **Map build:** toolchain records hash/version, resulting `.map` CRC/hash and format, no mock or fake receipt.
6. **Runtime:** explicit approved target and version; private/offline game load, walkability/AI/objectives/camera observed and recorded.
7. **Network:** only then version handshake, real host + two clients with AI/device/script replication and desync evidence, without modifying anti-cheat or unauthorized networking.
8. **Distribution:** versioned packaging, owner-safe separate install path, conflict resolution, explicit removal and verified rollback.

Status definitions: **SOURCE CHECKED** (offline logic), **DESIGNED**, **PARTIAL**, **BLOCKED**, **RUNTIME VERIFIED** (only after actually played). Never promote SOURCE CHECKED to RUNTIME VERIFIED from archive source descriptions, unit tests, synthetic networking or exported `.hsc`/JMS alone.

## First safe owner test

Extract the latest full-source ZIP into a new folder **without overwriting** the previous source, your Halo installation or a compiled `.map`. The next step, after confirming extraction, is `npm run test:offline` from the extracted project root on Node 22+. This command is read-only with respect to Halo files. Report the command's actual output before any game/runtime change is suggested.
