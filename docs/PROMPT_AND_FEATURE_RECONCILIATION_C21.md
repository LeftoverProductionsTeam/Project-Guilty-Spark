# Project Guilty Spark — Consolidated feature/request ledger (Continuation 21)

The exact **92-item historical requirement reconstruction** lives in `ORIGINAL_92_REQUIREMENTS_RECONSTRUCTION.md`; individual phase acceptance in `PHASE_01_TO_10_ACCEPTANCE.md`; Phase 3–10 work packages in `PHASE3_10_FEATURE_TRACEABILITY.csv`; relevant archived creator/source research in `LEGACY_FORUM_RESEARCH_AND_GAP_RECONCILIATION.md` and `LEGACY_SCENARIO_FAILURES.md`. The verbatim full Phase 3–7 prompts were not fully recoverable. This file inventories the functional intent without claiming every missing original word has been found or that source stubs close engine gates.

| Founder-requested capability from the previous discussions | What code currently attempts | C21 outcome / evidence still required |
| --- | --- | --- |
| One integrated Halo editor, not a launcher for disconnected tools | Rust/Tauri + React workbench, QuickForge, World, Tag browser, Creator Studio, scripts/build adapter | In progress; CLI tools are external dependencies and GUI embedding is incomplete |
| Eschaton/HMT-style typed tags, class-safe references, map header compatibility | Native read-only tag inspection and audited edits/references, hash-pinned map copies | Partial; full authorable Blam tag schema and safe runtime roundtrip missing |
| SwordEdit-style 3D scenario, WASD/free fly, XYZ gizmos, snap, markers, undo/redo | World/QuickForge renderer and authoring operations | Partial; real imported BSP editable topology, proper grid/transform parity, stable huge scenes unverified |
| Original terrain, caves, OBJ/JMS/UV import, collision/portals/lighting | Source brush, sculpt, source export, seam/cave checks, bounded mesh analysis | Partial; actual Tool-compiled collision/portals/PVS/radiosity and mesh reconstruction missing |
| Automatically find real Halo textures/shaders/lightmaps from owned caches | Exact C16–20 references and native top-mip batch; C21 source-attributed BSP diagnostics | Incremental C21 diagnosis; missing external tag bodies, complex shaders, non-2D textures, engine screenshot parity |
| Sky, fog, ambient, sun, weather, water, renderer quality | Source preview/environment controls and explicit intention exports | Preview only; game-side lighting/sky/water tag authoring and runtime validation pending |
| Slayer, CTF, Oddball, King hills, Race, teleporters | Source netgame markers, KOTH polygon preview, usage range checks | **C21 adds Five-mode Test Arena + 20 evidence-gated tests**; actual scoring/game load unproven |
| Game mode editor, online customs, friends and mod packaging | Variant-design scaffolds, session plans, source ZIP export, MCC receipt framework | Actual Halo CE `blam.lst` save/load, verified server hosting, native multiplayer proof absent |
| Firefight waves, Zombie Apocalypse original loops, special infected | Source wave/HaloScript scaffolds; owned historical archive evidence/credits | Actual enemy AI/damage/spawning and zombie-cycle multiplayer, required original assets, unproven |
| First Contact campaign, cinematic cameras, dialogue, music, story scripts | Partial mission beat/script/camera authoring | Real scenario campaign, cinematics, proper AI pathfinding and mission playthrough missing |
| 6-player co-op, 128-player large matches, multiplayer AI syncing | Capability research and session/compatibility planning | No implementation or safe cross-engine proof; runtime/server capability must be measured |
| Cross-engine Demo/PC/Mac Demo/Custom Edition/HaloMD/MCC/legacy G4 | Runtime profiles, preservation and strict source-map classification | Each engine requires its own format/CPU/runtime tests; noninterchangeability is intentional |
| Real Halo 1 sounds, menus, themes and 2006–2015 classic modding spirit | User-owned audio preview, Interface Studio, Modding Academy and heritage research | Only rights-cleared, locally imported assets; do not ship stock copyrighted Halo art/sounds |
| One-button build, launch, test, export and package | Source export, staged tool invocations with receipts, offline tests | First legitimate Tool-compiled Guilty Spark Test Arena and game load remain key acceptance blockers |
| Avoid MotaLev/SwordEdit bad scenarios, corrupted materials and missing tags | Fail-closed source/native checks, scenario safety ledger, C21 BSP audit | C21 preflight catches render diagnostics only, not full BSP validity or crash immunity |
| VR, split-screen PC, Linux/Apple Silicon builds, multiplayer servers | Long-range plans and runtime registry | Not implemented or verified; needs separate targets and owner hardware |

## C21 additive trace

- **New genuine SOURCE workflow:** `guiltySparkTestArena` QuickForge preset with 4 starts, 2 CTF flags, 8 KOTH corners in 2 groups, 1 ball marker, 4 ordered race markers, 2 paired teleport markers; native test expectations added but Cargo not run.
- **New diagnostic workflow:** World Editor full compiled render-mesh preflight with source SHA identity, shader+UV+lightmap attribution and 128-item display cap that still counts all findings. This is not a collision/portals compiler.
- **New quality workflow:** JSON owner QA plan for five stock modes plus Playtest Lab 20-case idempotent seeding with all results NOT RUN; user evidence never overwritten.
- **Academy polish:** Updated mode-authoring and lightmap lessons to navigate to the new preset and reports; observable test-arena state checks only, not engine gameplay results.

## Next measurable milestones (not marked completed)

1. Run native Rust unit tests and desktop/UI build on an owner-controlled Windows machine, resolve compiler regressions before proceeding.
2. Inspect owner-owned classic Halo CE `.map` + correct `bitmaps.map` in read-only mode; compare shader/page pixels and preflight IDs to native tool reports and Halo images.
3. Export an isolated Test Arena, verify tool versions and invader-edit field names, build with Halo Tool, open it in Halo CE; capture exact build/map hashes.
4. Play Slayer, CTF, King, Oddball, Race and capture scores/spawns/hill movement/checkpoints; then do an independent second-client match.
5. Recover original Zombie Apocalypse damaged/missing tags and compiler blockers without losing authored spawn behavior, and test Firefight/campaign gameplay in an explicitly selected engine.

Preserve the earlier handoffs, attribution, acceptance evidence and source data; never replace a user's original map or installed Halo files to satisfy a checklist.
