# Guilty Spark - continuation 3 change log and release truth

## Baseline and scope

The **exact input ZIP** is `Project_Guilty_Spark_07_Halo_Modding_Brain_Continuation_2_SOURCE.zip`. Continuation 3 preserves the previous source including cache readers, Material Lens, four Interface Studio palettes, QuickForge terrain/cave source, mission/cinematic/Firefight authoring, safe CE config drafts, read-only offline tests and existing 92-requirement reconstruction. **This is not a completed phase-10 product** and is not a compiled installer.

## New / corrected code

1. `src/haloScript.ts`: fixed generated H1 script declarations to documented `dormant` form without a return type. A mission and a Firefight sequence no longer start automatically on scenario load; require deliberate `(wake gs_mission)` and `(wake gs_firefight)` from reviewed startup scripts. Camera points, trigger volumes and AI references use HaloScript token syntax. `activation` appears explicitly in the exported manifest. Does not establish Sapien compilation or game runtime.
2. `src/shaderTextureMatching.ts`: deterministic, bounded, exact matching of user-selected local image filenames to shader->bitmap tag references. Ambiguous or missing dependencies are reported and left untouched; never guesses a diffuse map. No automatic proprietary Halo cache bitmap decoding, lightmap extraction or project-persisted image data.
3. `src/components/World.tsx`: opt-in batch attach for `.dds/.png/.jpg/.webp` images against actual BSP shader material IDs; no local game directory scan. Clears textures on source map changes, and rejects async results from a different hash. Fixes a rendering memoization error so materials refresh when the user assigns a new texture. Preview quality is **not** game-like shading.
4. `src/caveJoinAnalysis.ts`: computes source tunnel-port positions and opposing normals, and reports candidate joins and unmatched mouths. Flags all joins as *not welded/not game-playable* until real BSP CSG, portal/PVS/collision and tool compilation exist. The existing Rust manifold tunnel mesh stays unchanged.
5. `src/scenarioBindings.ts`: read-only diagnostics for generated mission/Firefight encounter and squad references found/missing in the imported cache. Camera points and trigger volumes remain marked **uninspectable**, not 'verified'.
6. `src/components/CreatorStudio.tsx`, `src/App.tsx`: show binding diagnostics for the currently matching imported source SHA-256; include explicit activation metadata in the exported source pack. No game files or server are modified.
7. `scripts/test-shader-matching.mjs`, `scripts/test-cave-joins.mjs`, `scripts/test-scenario-bindings.mjs`, updated `scripts/test-haloscript.mjs`, and `package.json` `test:offline`: regression coverage for accidental auto-start, injection, source matching, false cave joins and truthful binding preflight.
8. `docs/LEGACY_FORUM_RESEARCH_AND_GAP_RECONCILIATION.md`: updated historical MacGamingMods / HaloMD / Halo Maps / c20 / Open Carnage leads; full ten-phase and later feature gaps, external runtime blockers, safety and actual acceptance criteria. No old binaries/source were copied into the ZIP.

## Validation to run / not implied

- Node 22+ offline suites: run `npm run test:offline` (no Halo installation required). They only test JavaScript/TypeScript logic without third-party packages.
- Syntax scanning via TypeScript compiler API can establish parsing only, not a full React/Rust/Tauri application build.
- **NOT RUN HERE**: Cargo tests, dependency-resolved TypeScript typecheck, Vite/Tauri packaging, Windows app launch, correct GPU rendering of owned real Halo maps, licensed Halo Tool/Sapien/Invader end-to-end compilation, First Contact gameplay, 2-client Zombies networking, G4 target export.
- Original Phase 3-7 complete verbatim prompt bodies are not present; earlier requirements were reconstructed functionally, not certified losslessly. All open tasks remain open in `docs/PHASE_01_TO_10_ACCEPTANCE.md` and the requirement matrix.

## Priority by dependency

**Next engineering target:** create a user-owned tag/resource bitmap reader and per-shader/lightmap bridge (with a legally sourced real-map fixture and Windows rendering test), then a source geometry/scene compiler with correct collision/portals, then scenario+AI/HSC compile, then real target gameplay. Server sharing and online Zombie AI are only meaningful after a tested map exists. All work must occur in isolated, user-approved output paths; never rewrite stock game installs or bypass EAC.
