# Living Halo: source-only renderer extension

**Status:** EXPERIMENTAL / REQUIRES COMPILATION AND REAL HALO MAP VALIDATION.

This patch is based on the provided Guilty Spark **0.3.0 source-only ZIP**, not on a full checkout of the owner's current working tree. It does not replace existing scenario/tag workflows or change any original Halo game file.

## What changed

| Area | File(s) | Behavior |
| --- | --- | --- |
| Inspectors | `crates/spark-core/src/maps.rs` | Retains the collision mesh and now *independently attempts* to read actual BSP render triangles, normals and UVs from supported PC-family caches. Unsupported data produces a warning, not a made-up mesh. |
| Format reader | `crates/spark-core/src/render.rs` | Bounded pointer/reflexive parser for selected Demo (v6), PC (v7), Custom Edition (v609) uncompressed BSP render surfaces and static single-node Gearbox `gbxmodel` geometry. No game files are written. |
| IPC models | `crates/spark-core/src/maps.rs`, `src/types.ts` | Optional `renderMesh`, `modelMeshes`, vertex normal and UV fields are serialized alongside the existing collision mesh. Older inspection payloads remain acceptable. |
| World viewport | `src/components/World.tsx`, `src/renderView.ts` | Render-data-aware modes: Render Geometry (untextured), Smooth Shaded, Flat Shaded, Wireframe and Collision. Resolved supported object types use their actual static model geometry instead of diagnostic diamonds. |
| Viewport checks | `src/renderView.test.ts` | Five focused regression tests for render selection, BSP part selection, collision fallback, object model resolution, and missing geometry. |
| Offline tools | `src-tauri/src/tool_cache.rs`, `src-tauri/src/app.rs`, `src-tauri/src/main.rs`, `src/components/Workspaces.tsx` | Optional, explicit, user-selected **Invader-only** local cache. Copies the three CLI programs, adjacent DLLs and local license notices, verifies SHA-256 hashes and requires the user to click **Apply preferences** before the cached path is used. Never downloads, runs or installs anything. |

## What is NOT implemented

* **No authentic textures or lightmaps yet.** The render surfaces and static scenery model geometry are untextured; shader/material to bitmap and resource cache decoding are still required. Therefore this is **not yet game-fidelity Blood Gulch**.
* The model preview is intentionally limited to static, single-node and uncompressed `gbxmodel` geometry; multi-node/animated and Xbox/MCC formats are not decoded. Real models with unresolved dependencies continue to use explicit debug markers.
* No wind/weather/animated sky simulation, terrain sculpt, edit/rebuild of existing BSP geometry, cave excavation, portal/PVS recompile, or draw-distance patching. The rendering geometry is read-only.
* No new compile-to-game functionality is claimed. The original Halo Editing Kit was missing in the prior owner's execution log; a real end-to-end build requires a toolchain and game verification.
* No file modifies the owner's original Halo maps, archives or stock installation.
* Optional Invader caching does not copy entire license-controlled installation trees or source tag collections. It is a personal offline cache, **not redistribution or an automatic updater**. Check third-party license obligations before using the option.

## Safety and bounds

Parsing uses checked offsets, bounded memory regions, count limits, real file byte ranges, and finite float parsing. Invalid or unsupported structures fail independently while preserving the original collision preview. Files from the Mota-Lev research archive are not executed or redistributed.

The Invader cache is opt-in, has a **256 MiB total/128 MiB per-file** limit, and copies only `invader-info`, `invader-extract`, `invader-build` (and `.exe` equivalents) plus adjacent DLLs. Symlinks and non-file entries are rejected. An existing cache is never silently overwritten; its SHA-256 content must still match. It records a manifest, and cached files remain local to the user's data directory. Selecting this cache will not run the tools; existing build commands are used only after the user enables and invokes supported operations.

## Tests run in the source-review environment

**PASS:** TypeScript transpiler parsed `src/components/World.tsx`, `src/components/Workspaces.tsx`, `src/types.ts`, `src/renderView.ts`, and `src/renderView.test.ts` without syntax diagnostics.

**PASS:** Six independent Node/TypeScript viewport logic checks validated real render selection, collision mode, missing geometry, static model lookup, and fallback behavior.

**NOT RUN:** Rust compilation and Rust tests (Rust/Cargo unavailable in this environment).

**NOT RUN:** Full frontend typechecking, Vitest, Playwright and Tauri desktop (the ZIP excluded `node_modules` and the environment could not install dependencies).

**NOT RUN:** Parsing or viewing the actual Zombie Apocalypse `bloodgulch.map` (no playable `.map` files were included in the provided source ZIP).

**NOT RUN:** Halo Tool/Invader compilation and game load. These require actual installed tools and games, which were not supplied.

**Important:** The Rust unit tests use small synthetic buffers to verify known field layouts and bounds; they do not establish compatibility with the owner's exact Halo caches. Any corrupt or unsupported real material must be reported rather than treated as successfully rendered.

## Verification on your Windows machine

1. Back up or commit the current `D:\Project Guilty Spark` working tree before applying the patch. The ZIP is an uploaded snapshot: if your local code has moved forward, inspect merge conflicts rather than force overwriting.
2. From a terminal in the project root, run `git apply --check <path-to-patch>`; only if that succeeds run `git apply <path-to-patch>`. Or copy the changed files from the source ZIP after reviewing them.
3. Run `pnpm install --frozen-lockfile` if dependencies are missing and you approve fetching them, then `pnpm check` and `pnpm test`.
4. Run `cargo test -p spark-core` and `cargo test -p guilty-spark`; if either fails, preserve the actual build output for investigation.
5. Run the desktop app and open the locally owned Blood Gulch map. Select **BSP render geometry (untextured)** if it becomes available. Count fully decoded static models, and inspect any `BSP_RENDER_UNAVAILABLE` or `MODEL_RENDER_UNAVAILABLE` diagnostics.
6. Verify import, scene editing, save/reopen, and previously working tag inspection have not regressed. Test the optional tool cache only with your **own authorized, installed Invader folder**, never with the Mota archive.
7. Do not label Blood Gulch game-fidelity or the shader pipeline complete until actual textures, sky, scenery meshes and real gameplay have been inspected on the owner's hardware.

## Upstream technical references

* [Halo Map Structure (SnowyMouse)](https://gist.github.com/SnowyMouse/39168bddd597549038a35d78aee39513) — PC/Demo tag-region and model raw-data layout.
* [Reclaimers Library: scenario_structure_bsp](https://c20.reclaimers.net/h1/tags/scenario_structure_bsp/) — BSP materials, uncompressed vertices, lightmaps and render surfaces.
* [Reclaimers Library: gbxmodel](https://c20.reclaimers.net/h1/tags/gbxmodel/) — model parts, raw vertices and cached triangle offsets.
* [Reclaimers Library: H1 source data](https://c20.reclaimers.net/h1/source-data/) — canonical source-to-game toolchain.

The new reader is independently implemented from documented structures. No decompiled proprietary source was incorporated.
