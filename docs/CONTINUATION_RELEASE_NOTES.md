# Guilty Spark — cumulative Living Render continuation

## Source lineage

This package builds on the **previous Living Render v0.3 source snapshot** (including the earlier experimental renderer, viewport modes, and offline Invader cache), *not* on the older v0.2.0 release. The current root version remains `0.3.0`: it is a source-level continuation, not a proven Windows release. Do not assume this patch applies cleanly to an independently modified working tree.

## Actual code changes in this continuation

1. **Halo Demo BSP render vertex address corrected:** `crates/spark-core/src/render.rs` now resolves the BSP material's cached vertex pointer through its bounded BSP region instead of interpreting the raw-data file offset as a complete file address. Validated independently on the user's original Zombie Apocalypse Blood Gulch map (79 materials, 5,762 vertices, 5,503 triangles, no structural errors). Unsupported BSP variants fail closed to the existing collision preview.
2. **Static scenery GBX model offset corrected:** part offset `+100` contains the PC cache's file-relative vertex offset; `+96` is a transient pointer. On the owner's actual Demo map, an independent read-only check finds 30 of 35 distinct scenery tag models with bounded single-node geometry; five need skeletal/multi-node support. Triangle-strip restarts and degenerate triangles are handled safely, and model parts are retained for future materials.
3. **Wavefront OBJ source import improved:** independent position/UV/normal indices, negative indices, UV seams, explicit normals, fallback computed normals, material groups, maximum bounds, triangulation warnings, malformed-index rejection. MTL images and Halo render/collision conversion remain unsupported.
4. **Asset Workshop preview improved:** uses saved UV/normal attributes and retains material-group boundaries, while making the unimplemented texture and Halo-tag stages clear.
5. **Tag Editor workflow improved:** switch among imported Halo maps from the left-side browser without leaving the workspace; following a dependency now updates tag class/search and list pagination so its target is visible.
6. **Read-only real-map regression scripts:** `node scripts/verify-halo-world.mjs path/to/bloodgulch.map` and `node scripts/verify-halo-models.mjs path/to/bloodgulch.map` perform independent bounds/geometry checks, without extracting or shipping game resources.
7. **Rust unit tests:** added/updated synthetic malformed-pointer tests and OBJ UV-seam/material tests. **Not executed in this environment**, because Rust/Cargo are unavailable.

## Verification performed here

- User-supplied map fixture was inspected **read-only**; no game data is included in output ZIP or patch.
- `verify-halo-world.mjs`: 79 supported BSP material streams; 5,762 vertex records; 5,503 triangles; zero invalid structures.
- `verify-halo-models.mjs`: 30/35 distinct scenery-tag models with structurally valid static geometry, 5 skipped multi-node models.
- TypeScript files parsed and transpiled without syntax errors using installed TypeScript 5.8.3.
- New Node scripts pass `node --check`.
- `git diff --check` passes.

**Not verified here:** Rust compilation; Cargo unit tests; complete TypeScript typechecking with project dependencies; Windows/Tauri application startup; GPU visual results; texture/shader/lightmap decoding; gameplay compilation; two-client multiplayer. Do not claim all Phase 3–10 features are completed.

## Apply safely

The companion Git patch is based on the prior `Project_Guilty_Spark_Living_Render_Source_v0.3.zip` snapshot. Apply it after that snapshot, never blindly onto an unrelated/recently changed project. Save or commit your working tree first.

```powershell
cd 'D:\Project Guilty Spark'
git status --short
git apply --check 'C:\Path\To\GuiltySpark_Continuation_After_Living_Render_v0.3.patch'
# Only if check passes and you have a backup/commit:
git apply 'C:\Path\To\GuiltySpark_Continuation_After_Living_Render_v0.3.patch'
```

Alternatively inspect the new cumulative source ZIP beside your repo, compare differences, and copy/reconcile intentional changes. **Do not overwrite newer local work.**

## First owner acceptance steps

1. On Windows, save/commit your current `D:\Project Guilty Spark` working tree and apply the patch only after `git apply --check` passes.
2. Run the targeted map validators against your own Halo Demo map. Expect 79 materials/5,762 vertices/5,503 triangles for the tested Zombie Apocalypse variant and 30 static scenery model types (5 multi-node unsupported).
3. Run existing Rust and frontend test suites using the repository's official scripts and installed dependency versions.
4. Launch the app, open your actual Zombie Apocalypse Blood Gulch, select Game-like / Smooth view. Report whether real ground surfaces and trees/rocks now show geometries. **They will still lack authentic Halo textures until the shader/bitmap pipeline is implemented.**
5. Open Tags, switch map with the new chooser, filter to a class, follow a dependency, and verify the destination becomes visible. In Asset Workshop, import a UV-mapped OBJ and verify preview and save/reopen.

Stop and provide first build error if compilation fails. Do not replace stock Halo files.

## Continuation 20 — one native provenance-pinned material-preview batch

Extends the exact C19 source. Replaces six sequential cache reads with one 1–24-image native read-only batch, deduplicating identical source tag/image pairs. An explicit per-project `bitmaps.map` index is opened at most once, read only for unique exact-path bounded ranges and SHA-verified again using the original open handle before returning pixels. Client checks batch order, source/resource hashes, per-image refusals and 16 MiB packed / 64 MiB decoded budgets. World Editor adds **Auto-preview verified materials** for eligible shader base/diffuse images and BSP-scoped lightmap pages. Existing manual images take precedence; cancel/project/resource changes discard stale results. Academy material lesson and regression suite updated.

**Tests:** complete offline Node suite PASSED, batch TypeScript modules PASSED typecheck, TS/TSX syntax verified. Native Rust, Windows/Tauri, real Halo sources and gameplay remain unverified. Read `CONTINUATION_20_ENGINEERING.md`, `CONTINUATION_20_TEST_CARD.md` and `07_HALO_MODDING_BRAIN_HANDOFF.md`. No phase is promoted to complete.
