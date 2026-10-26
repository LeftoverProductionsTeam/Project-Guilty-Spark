# Project Guilty Spark — Continuation 26 engineering handoff

**Baseline:** exactly checksum-verified Continuation 25 cumulative source ZIP, October 26, 2026. **This is a SOURCE release**; not a playable Halo map, Windows executable, or compiled `.scenario_structure_bsp`. No installed game/cache files are included or modified.

## Why this release

The creator specifically requested BSP extension/tunnel/collision error correction, robust import/export of real tags/BSP content, and a modern Halo-themed editor that can use **verified assets from the user's own installed/preserved game**. The dangerous shortcut is silently editing binary cache/BSP pointers, automatically Boolean-merging intersecting collidable geometry, or promising a clean Tool compile without testing. This release improves local **source-only** corrections and error visibility, while preserving the existing class/path-checked Invader tag extraction and the distinction between source geometry vs compiled collision.

## Implemented in C26

1. **Conservative tunnel extension diagnostics and repair** (`src/caveSeamRepair.ts`, `src/sourcePreflight.ts`, `QuickForge.tsx`): Up to 32 editable tunnels are audited for opposing mouth gaps (<=0.25 editor world units), mismatching segment geometry, >1 potential neighbor on a single mouth, and conservative uncut, axis-aligned room walls. Users may select related brushes. A single eligible missing seam can be corrected by a **small, exact-rim translation** only if topology is rechecked after the proposed edit and all existing eligible welds survive. Locked or stale/ambiguous geometry is refused. Repairs are recorded with the existing QuickForge undo/redo operation. Clear source errors block source export. **No binary BSP, collision partition, room/terrain CSG, PVS or game map is altered.**
2. **OBJ and JMS precision guard** (`src/haloInterchangePrecision.ts`): Before source emission, check six-decimal serialization for collapsed triangles and short (sub-0.1 JMS-unit) edges; JMS additionally checks source coordinates beyond +/-1500 editor units. Fail closed rather than silently emitting an apparently valid but degenerate interchange. Use the correct Halo 1 JMS 8200 toolchain and verify coordinate scale on actual owned fixtures. No arbitrary rescale is applied to a user's mesh.
3. **Independent self-serialization receipt** (`src/haloObjRoundTrip.ts`, `src/haloObj.ts`): Spark's own OBJ text is parsed in a separate bounded routine prior to return. It must preserve exact triangle references/order and six-decimal vertex/UV/normal values; malformed, extra, truncated or reordered faces cause refusal. This is **only a Spark-source export guard**, not a third-party OBJ compatibility guarantee, not full material fidelity, and not imported compiled BSP reconstruction.
4. **Targeted Halo Tool diagnostics** (`src/haloToolDiagnostics.ts`): Recognize additional documented cases: collision BSP empty, BSP partition depth, unstable dividing edge, tiny invalid structure cluster, and phantom collision. Give source-specific remediation and avoid asserting phantom BSP can always be repaired automatically. Tool logs and WRL are still version/source-bound from C25.
5. **User-owned Halo workbench art** (`src/ownedInterfaceBitmap.ts`, `src/interfacePreferences.ts`, `src/components/InterfaceStudio.tsx`, `src/App.tsx`, `src/styles.css`): Interface Studio can pick a `bitm` tag from an exact preserved classic-map inspection, load a SHA-pinned top-mip via the preexisting read-only native verified-cache command and bounded DDS decoder, and render a revocable, memory-only WebView header accent. Persist **only** map project ID, source SHA and bitmap tag ID. Clear, project-switch and source-switch invalidate the image; unsupported images/resources fail closed. No original game bitmap or audio is bundled, embedded in the ZIP/project, uploaded, or written to disk. Four existing Halo-inspired modern palettes remain available. A full `ui_widget_definition`, sprite-atlas compositor and authentic pixel-for-pixel game menu are **not** implemented.
6. **Offline tests**: `scripts/test-cave-seam-repair.mjs`, `test-owned-interface-bitmap.mjs`, `test-interchange-precision.mjs`, `test-obj-roundtrip-guard.mjs` plus expanded `test-halo-wrl.mjs`. Existing suites are retained.

## Existing functionality preserved (not newly implemented)

- Native `invader-extract`-backed, dependency-checked extraction of actual supported tag files into hash-pinned managed source folders and staged copies; does not guarantee each class or cache can be fully extracted.
- Read-only compiled Halo BSP mesh and tag inspection, bounded bitmap/shader previews, read-only OBJ render-source export; source OBJ/JMS authoring and toolchain-staging features.
- QuickForge terrain/caves, source-preflight and topology graphs, WRL brush matching and source-revision-bound compiler triage; five-mode Test Arena, 32 spawns, KOTH/CTF/Oddball/Race planning; fog/lighting preview; custom gameplay scaffolds.

## What remains **not completed**

- Full editable imported `.scenario_structure_bsp` and Blam tag round-trip with all fields, offset remapping, resource dependencies, collision trees, portals/PVS, materials/lightmaps, and losslessness verified against known fixtures. Original compiled caches remain read-only.
- General automatic cutting of terrain/room tunnels, Boolean union, resolving all non-manifold and intersecting surfaces, compiler-correct portalization, runtime collision, phantom BSP; error-free guarantees cannot be made for arbitrary maps.
- Authentic menu sprite atlases/nine-slice geometry and per-screen Halo UI layout; user-supplied rights-cleared assets only.
- Windows Rust/Tauri compilation, native Invader/Tool execution, shader fidelity on an owner-owned Halo map, true generated BSP, in-game/online play, zombie/Firefight runtime, campaign and exotic engine/network targets.

## Validation and safety

Run `npm run test:offline` for dependency-free deterministic checks. Independently type-check pure new TypeScript modules and syntax-parse edited TSX. Full native Cargo, packaged app and owner-installed Halo Tool tests require Windows plus the correct owned editing kits and files. Preserve SHA-256 of original game assets, build in an isolated worktree, let `tool structure` exit naturally, preserve entire unedited Tool/WRL logs for diagnostics, and **never** replace a shipped map based solely on a green source check.

## Documentation checked (2026-10-26)

- Reclaimers Halo 1 BSP troubleshooting: https://c20.reclaimers.net/h1/guides/levels/bsp-troubleshooting/ — sealed world exceptions, open/colliding edges, degenerate JMS precision, `MAXIMUM_BSP3D_DEPTH`, truncated collision tag and phantom BSP limitations.
- Reclaimers Halo Tool guide: https://c20.reclaimers.net/h1/h1-ek/h1-tool/ — `structure` source-to-tag compilation, collision/portals vs lightmaps, warning against interrupting tag-writing commands, and H1A-specific phantom-BSP option.
- Bungie HEK original multiplayer compilation guide: https://nikon.bungie.org/misc/hek_tutorial/references/level_design/mp_level_design/mp_ld_level_compilation.html — `collision bsp is empty`, open edge, shared edge, Z-buffered triangle classes.
- Reclaimers source-data guide: https://c20.reclaimers.net/h1/source-data/ — JMS source, WRL diagnostics, tag building provenance; compiled tag extraction is not the original source mesh.
- Invader documentation: https://invader.opencarnage.net/ — Invader extraction/build tooling is an **external prerequisite**, not a bundled right to redistribution.

## Safe first acceptance on Windows

1. Extract the source ZIP to a fresh empty folder; do not copy over Halo installations or an existing codebase.
2. Confirm Node/pnpm/Rust/MSVC/Tauri prerequisites; run source tests and native Cargo tests before accepting changes.
3. Open a **copy** of an owned classic Halo cache with matching resources and choose an accessible 2D DXT1/3/5 or BGRA bitmap; confirm the source-pinned header image appears and switching projects removes it.
4. Import an owner-made OBJ, export OBJ and JMS, compare output hashes and attributes. A source export is **not** proof of compiled tag fidelity.
5. In a synthetic QuickForge scenario, align two nearly matched tunnel mouths and verify undo/redo; confirm intentionally misaligned or uncut room intersections block source export.
6. Run `tool structure` on an **original, isolated** Test Arena and test generated collision, portals, and all game modes inside a game, preserving exact Tool/WRL logs and outputs.

The creator's 92-item reconstructed requirements and historical prompt/phase trace remain in the archive, unchanged except for additive C26 status notes.
