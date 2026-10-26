# Project Guilty Spark — Continuation 9 engineering handoff

**Baseline:** Continuation 8 full-source ZIP. **Release type:** source-only engineering continuation. This is **not** a completed ten-phase product, native Windows installer, compiled Halo map or verified in-game demo. The app's baseline package version stays 0.3.0 pending an actual release build.

## What changed in source code

### 1. Halo 1 Tool error geometry inside QuickForge

`src/haloWrl.ts` adds a bounded, independently written parser for the actual **VRML 1.0** subset output by classic Halo 1 Tool when `structure` detects invalid model geometry. The parser supports:

- Multiple `Separator` error regions containing `Coordinate3` with `point` arrays.
- `IndexedLineSet` edges and `IndexedFaceSet` polygons, split using `-1` span delimiters, with triangulation of polygons for display.
- Original material/error RGB colors using `PER_VERTEX` or `PER_FACE` material bindings.
- Diagnostic source-centimetres-to-editor-unit conversion, default 0.01 with an explicit toggle.
- Malformed header, bad braces, missing indices, nonfinite numbers, unsupported VRML 2.0, oversized file and index-budget rejection. The reader supports PER_FACE color arrays that contain more colors than source vertices (a valid feature of imported diagnostics).

`src/components/ForgeViewport.tsx` overlays the imported errors in color as translucent faces and visible edges. The overlay is **non-interactive** and never becomes a mesh selection, collision body or placement/drop surface.

`src/components/QuickForge.tsx` adds **Import Tool .wrl**, **Inspect Tool log**, **Show/Hide errors**, **Frame WRL**, **Clear WRL**, scale toggle, and error summaries. When source geometry changes the old compiler result is automatically labeled **STALE** and hidden until a new diagnostic is imported. The WRL file is read locally into memory only; its contents are never bundled into the project or game. The model's source map and game files remain untouched.

`src/haloToolDiagnostics.ts` adds a bounded, non-executing Halo 1 Tool text-log classifier with explanations for open/nonmanifold edges, intersecting geometry, degenerates, portals, PVS, truncated source/tag data, incorrect JMS versions and collision compilation failure, plus documented T-junction, collidable-overlap, bad vertex bounds, duplicated portal, cluster-complexity, bad radiosity UV and multi-sky warnings. **Unrecognized messages remain explicitly unclassified.** Neither a clean log nor an empty WRL proves a working map.

### 2. Duplicate collision face / tiny-edge source integrity audit

`src/haloMeshIntegrity.ts` independently checks QuickForge preview triangles **by quantized XYZ positions**, not just indices. QuickForge's triangle vertices are often duplicated for flat shading, so an index-only duplicate check misses coincident faces from two different brushes.

- Exact duplicate solid faces, including opposite-winding duplicates, **block QuickForge source export** in `src/sourcePreflight.ts`.
- Very short edges are flagged as compiler-risk warnings, not unconditional failures, since Halo's special materials have exceptions.
- The Rust `quickforge::validate_mesh` code also now rejects duplicate geometric triangles as `DUPLICATE_COLLISION_FACE`, so direct native exports cannot skip the UI guard.
- A native Rust regression test covers a coincident triangle with **different vertex indices**.

The audit **does not** claim to detect all T-junctions, self-intersections, leaky portals, invalid PVS, misplaced AI navigation data, or actual Halo engine collision failures. The native test is included but **could not be executed** here because Rust/Cargo are unavailable.

### 3. Guided Tool diagnostics tutorial

The Academy now contains **11 lessons**, adding *Fix a failed BSP build with Tool WRL*: export validated JMS, use the right kit, load the WRL, locate the error, repair the source, repeat the build and verify it in Halo. Its completion gates distinguish observable source state from manually verified compiler/game state. The UI glossary explains the tool, its limitations and the small-edge/duplicate-face checks.

### 4. Synthetic test artifacts

`tests/fixtures/synthetic_halo1_tool_errors.wrl` and `.log` let the owner test the new UI before obtaining an actual Tool error. These are **synthetic examples** and never evidence of a real successful/failed Halo build.

## Verification executed on the delivered source

- Node dependency-free regression runner, including original Continuation 8 suites and two new suites.
- Strict global TypeScript typecheck of the new parser, diagnostic classifier, mesh-integrity module and UI preflight module.
- TypeScript compiler syntax parse of all project TS and TSX files.
- Independently extracted ZIP and verified CRC, full file SHA-256 list and offline tests.

**Unavailable:** Rust compilation, Tauri desktop build, browser interaction tests, actual Halo 1 Tool run, game load, real lightmaps, multiplayer AI sync, PowerPC target. The native duplicate-face guard is a code change plus an unexecuted Rust test, not a binary verification result.

## Windows owner acceptance (one at a time)

1. Extract source into a NEW folder; do not overwrite Halo installations or older builds.
2. Run existing documented offline tests/build prerequisites (`docs/CONTINUATION_8_TEST_CARD.md`, then `npm run test:offline`).
3. In QuickForge, open an authored map, expand *Geometry & Build diagnostics* and click **Import Tool .wrl**. Choose `tests/fixtures/synthetic_halo1_tool_errors.wrl` and confirm a red edge plus a green face appear near the source origin.
4. Click **Frame WRL**, then **Frame arena (F)**. Confirm the camera framing changes appropriately and the diagnostic does **not** become selectable/collidable.
5. Change a source brush, wait for validation; confirm WRL is marked **STALE**, hidden and never treated as current evidence. Re-import only after building a fresh compiler result.
6. Import `tests/fixtures/synthetic_halo1_tool_errors.log`; confirm human-readable explanations show. Test a real owner-selected `structure` WRL only in an isolated legal editing-kit workspace.
7. Confirm a compiled map's collision, lights, portals and runtime load **in-game** before calling anything playable.

## Halo philosophy / references

- Original HEK structure compilation: https://nikon.bungie.org/misc/hek_tutorial/references/level_design/mp_level_design/mp_ld_level_compilation.html
- Halo 1 Tool `structure`: https://c20.reclaimers.net/h1/h1-ek/h1-tool/
- WRL 1.0 diagnostic grammar: https://reclaimers.net/general/source-data/wrl/
- BSP troubleshooting and genuine sealed-world constraints: https://c20.reclaimers.net/h1/guides/levels/bsp-troubleshooting/
- Invader reconstructs editable tags only as far as the compiled cache permits: https://c20.reclaimers.net/h1/community-tools/invader/invader-extract/

Research is a compatibility guide, not a license to redistribute community/game assets. Original Halo data and the owner's installed tools are not bundled.

## What has **not** been solved

Authentic automatic map texture/bitmaps/lightmaps import, editor-authored changes to imported compiled BSPs, arbitrary room/cave CSG/portals/PVS/AI navigation, complete playable First Contact mission, actual game Firefight/Zombie Apocalypse spawning, server integration and AI network synchronization remain **unfinished**. The original 92-requirement matrix and prior ten-phase acceptance matrix remain authoritative; no unsupported feature is marked complete just because a UI control exists.

**Compiler evidence association caveat:** Guilty Spark cannot authenticate that a user-selected WRL came from the currently open source document. It records the current editor hash only to detect changes *after* import; users must confirm the actual build/log provenance manually.
