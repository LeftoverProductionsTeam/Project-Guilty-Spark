# Project Guilty Spark — Continuation 14 engineering record

**Date:** October 26, 2026. **Source baseline:** Continuation 13 complete source ZIP. **Release class:** SOURCE-ONLY, not a Windows installer or playable game-build certification.

## Implemented code changes

- `src/haloGametypeScenario.ts`: Halo CE five-mode source-matrix, type-dependent native netgame usage IDs (with safe legacy-project fallback), finite coordinate checks, duplicate CTF/Ball/Race indices, nonconsecutive indices, 200-flag limit, 1-versus-3–8 King hill semantics, convex hill outlines, malformed-spawn detection and team spawn cautions.
- `src/components/QuickForge.tsx`: five-mode buttons and source-readiness explanations; individual flag/objective placement; **drag-and-drop four-corner King hills** using the existing 3D map drop position and independent G/M snapping; unique hill usage IDs and editable corner positions; all-five-modes starting point option; errors prevent safe QuickForge export/build.
- `src/components/ForgeViewport.tsx`: translucent, non-interactive, optional King hill polygon overlays with zone identification. These are calculated from authored scenario marker positions, **never** from the game's scoring collision engine.
- `crates/spark-core/src/quickforge.rs`: native source validator and scenario command planner receive the same fundamental usage-ID, hill count/duplicate, CTF range, Oddball/Race uniqueness and sequential-index gates; corrects a pre-existing exporter error that treated general `sequence` as the Hill/Oddball usage ID. Native static source never overwrites stock maps.
- `src/multiplayerScenario.ts`: Creator Studio's source-only map/game-type advisory reconciled with the five mode checklist, including variants. **No native `blam.lst` format support or multiplayer hosting is claimed.**
- `src/tutorialAcademy.ts`, `src/forumTutorials.ts`, `src/components/Academy.tsx`: a new game-type objective workshop lesson with source citations and a native-usage-ID glossary, linked to **Xzzy's historically attributed tutorial**.
- New independent JS regression suite `scripts/test-halo-gametypes.mjs` registered in `npm run test:offline`. New **unexecuted** Rust integration coverage in `crates/spark-core/tests/quickforge_gametypes.rs`.

## What the Blam engine research established

King of the Hill marker groups have **one or three through eight** markers, never exactly two. A single marker creates a 2×2 world-unit region. Multiple markers define their **convex hull**. The netgame `usage_id` is overloaded by the flag type; it does *not* always refer to a team. CTF placement affects valid spawn eligibility, Oddball and Race use ordered indexes, and all five classic modes deserve explicit scenario support. These verified facts and original authors are documented in [`BLAM_H1_MULTIPLAYER_SCENARIO_FIELD_GUIDE.md`](BLAM_H1_MULTIPLAYER_SCENARIO_FIELD_GUIDE.md).

## Verification matrix

| Check | Result | Scope |
|---|---|---|
| Offline Node `test:offline` | PASS | Existing source logic and new game-type regression tests |
| New core strict TypeScript (`tsc --noEmit`) | PASS | `haloGametypeScenario`, `multiplayerScenario`, Academy and tutorials, no external React dependencies |
| Full TS/TSX syntax parsing | PASS | Syntax only; not the React/Tauri runtime build |
| ZIP CRC, source hash manifest, clean-extraction rerun | PASS after packaging | Files in the delivered source archive |
| Rust/Cargo build and native gametype tests | **NOT RUN** | Toolchain unavailable locally |
| Official Tool/Invader scenario command application | **NOT RUN** | Requires selected, version-verified toolchain and license |
| Sapien/Halo client game-type behavior | **NOT RUN** | Requires Windows/game content and manual owner QA |

## Still blocked/unverified from the ten original Codex phases

- Native cache bitmap, shader, alpha, lightmap and sky/water/fog resource rendering without user-side texture staging.
- Arbitrary imported BSP geometry editing with rebuilt, playable render/collision, portals/PVS, cave/terrain CSG and AI pathfinding.
- First Contact campaign gameplay, in-game cinematic/AI scenario compilation and tested triggers/checkpoints.
- Real Firefight/Zombie Apocalypse actors, finite waves, scoring and safe network AI synchronization.
- Native custom `blam.lst` variant import/export, one-click working dedicated server host/join, live in-game editing bridge, two/four client network proofs.
- Native Windows/Tauri install QA, broad legacy runtime exports including Mac G4, unverified historical tool adapter integration and full Halo CE visual/sound Theme Forge.

**Never interpret a source-only flag preview as evidence that a playable multiplayer .map was successfully compiled.** The previous documentation and 92-item requirement reconstruction stay included and unclosed.
