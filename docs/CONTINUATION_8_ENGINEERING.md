# Project Guilty Spark — Continuation 8 engineering handoff

**Baseline:** `Project_Guilty_Spark_07_Halo_Modding_Brain_Continuation_7_SOURCE.zip` (exact previously delivered complete source package). **Status:** Source-only engineering continuation, not an installer, released game, or complete implementation of ten Codex phases.

## Implemented code

### Editor navigation and manipulation

- `src/editorFlight.ts` implements bounded, tested Z-up camera math. W/S move forward/back relative to the camera direction; A/D strafe; R/F rise/fall; Shift triples speed. Looking uses bounded pointer deltas and pitch clamps.
- `src/components/RightMouseFly.tsx` attaches controls **only to its canvas**. RMB + pointer motion looks; RMB + keyboard flies. Releasing RMB, losing focus/visibility, or losing pointer capture stops movement. The listener prevents that same keypress from activating editor W/E/R transform shortcuts, and skips text-input focus. No global pointer lock is taken in fly mode.
- `src/components/ForgeViewport.tsx` and `src/components/World.tsx` use this controller in both Orbit and Free Fly. Orbit is paused during RMB navigation and its target is repositioned to avoid snapping back on release. Normal left-click selection and TransformControls remain available. Walk Sandbox still uses its separate click-to-lock mode with gravity and local source collision.
- Selected source brushes and placed scene objects use Drei/Three XYZ transform handles. An axis legend and contextual help show **red X, green Y, blue Z**. World Editor avoids committing an unchanged gizmo transform; invalid positions, rotations or scales fail closed rather than being recorded.
- Grid Snap (G) and Mesh Snap (M) remain independently toggleable; nothing in this continuation changes their source geometry semantics.

### Source safety and collision boundaries

- `src/sourcePreflight.ts` blocks export/build from an out-of-date preview or validation result, mismatched brush IDs/materials/part ranges, invalid mesh indices/UVs/normals/positions, non-finite transforms, and Rust-reported geometry errors.
- `src/components/QuickForge.tsx` requires current same-document source mesh and validation evidence before offering `Export JMS sources` or `Build & check playtest`. The actual Rust source exporter still independently checks geometry and works in isolated directories. Save-race protection refuses export if the QuickForge document changed during save.
- `src/haloObj.ts` no longer silently drops malformed present-but-incomplete UV/normal buffers; triangles using repeated vertex indices are rejected for OBJ export. Read-only cache inputs and staged tag hashes remain protected by the existing pipeline.
- Cave-to-cave exact source seams and equal-heightfield terrain tile seams still remove internal duplicate source faces. The First-person Walk Sandbox gets regenerated source triangles after committed edits. **This is not Halo's native physics or compiled BSP collision**, and imported retail/Demo BSPs remain read-only. Joining an authored cave to a room still needs valid Boolean cuts, portal seals, collision rebuild, AI navigation and lightmaps.

### Onboarding / Academy

- Added a tenth tutorial: **Pilot the editor and move real objects**. Actions cover RMB flight, XYZ gizmos, G/M snapping and waiting for source integrity before exporting. UI buttons/controls have explanatory native hover tooltips. Academy glossary distinguishes a source preflight from a compiled playable cache.

## Original Halo CE modding philosophy and verified references

The original HEK's workflow separates source geometry, compiled BSP, scenario data, shader/lightmap data and game testing; the editor must not imply that visual overlap means valid collision. Refer to:

- Bungie-era [Halo Editing Kit level compilation](https://nikon.bungie.org/misc/hek_tutorial/references/level_design/mp_level_design/mp_ld_level_compilation.html) — `tool structure`, sealed worlds and WRL errors.
- [Bungie HEK portal and exact-portal guidelines](https://nikon.bungie.org/misc/hek_tutorial/references/level_design/mp_level_design/hmp_ld_level_creation_part_02.html) — seals, PVS, visibility and sound/weather regions.
- [Reclaimers H1 Tool documentation](https://c20.reclaimers.net/h1/h1-ek/h1-tool/) — JMS-to-BSP structure pipeline.
- [Reclaimers JMS documentation](https://c20.reclaimers.net/general/source-data/jms/) — normals/UV/materials and intermediate geometry constraints.
- [Archived CE project/editor guidance](https://github.com/brandonchastain/HaloMods/blob/main/CE/HowToMod.md) — Sapien's older MMB+WASD navigation conventions. Guilty Spark intentionally offers a modern RMB+WASD alternative, without changing Sapien itself.

## Tests and proof levels

- `npm run test:offline`: 21 offline test groups (previous 19 plus `test-editor-flight.mjs` and `test-source-preflight.mjs`). These cover pure camera math, safety gates, and existing geometry/tag/texture/interchange flows. They do not run a GPU or Halo game.
- New pure `.ts` modules typechecked with `tsc --noEmit --strict` using the available global TypeScript installation. All source TS/TSX files were syntax parsed. These do **not** constitute a full Tauri/React dependency-resolved build.
- Full Rust `cargo test`, npm/pnpm dependency install, Vite/Windows build, physical input/GPU testing, Halo Tool/Invader compilation, game launch, two-client networked AI, and Mac G4 export were **not performed** in this environment.

## Still blocked from all ten phases

1. Native Rust/Windows application build and integration tests; test actual RMB camera, gizmos, geometry refresh and real owner maps.
2. Automatic decoding of actual local Halo shader/bitmap/lightmap/sky data and game-like environment effects.
3. Editing *imported compiled* BSPs and reconstructing valid authoring source, including correct portal/PVS/collision when extending terrain or cutting rooms for caves.
4. Proven compiler output, collision acceptance, first playable QuickForge arena, original *First Contact* mission, authentic cinematics and gameplay.
5. In-engine finite Firefight/Zombie Apocalypse, AI navigation/spawns/survival rules and tested network synchronization across distinct supported runtime clients.
6. Finished toolchain registry and embedded-host integration where legally/technically possible; real tag dependency extraction and rollback tested per runtime, not just source commands.
7. Authentic Halo CE Theme Forge/audio, tutorials with genuine game verification, shared mod distribution, server management and PowerPC Mac Demo exports.

**Safety guarantees:** Original `.map` files, installed game assets and anti-cheat controls remain untouched. No game-memory injection, firewall modifications, stock-file replacement or unlicensed redistribution is included. The preview says 'source simulation' when it is not native Halo, and no playable milestone is certified by offline source tests.
