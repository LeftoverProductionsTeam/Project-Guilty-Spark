# Project Guilty Spark — 07 Halo Modding Brain — Continuation 20

**Date:** 2026-10-26. **Baseline:** exact source ZIP `Project_Guilty_Spark_07_Halo_Modding_Brain_Continuation_19_SOURCE.zip`, not a re-created skeleton. The baseline checksum is recorded in root `SOURCE_DIFF_FROM_PREVIOUS.txt`. This is a **complete source continuation**; no Windows `.exe`, stock Halo assets, playable scenario, or game-mod installer is included.

## Why this continuation exists

C16 resolved `shader_environment` / `shader_model` primary bitmap identities; C17 read tightly bounded internal classic `bitm` top mips; C18 added SHA-256-pinned `bitmaps.map` external raw-resource provenance; C19 associated compiled BSP lightmap pages with the correct BSP-local `bitm` tag. But the C19 Material Lens buttons performed up to **six sequential native invocations**. Each independently reopened and hashed the entire source cache and potentially its full external resource map. C20 replaces these serial requests with a single bounded, explicit **native batch**, benefiting complex BSPs without treating guessed bytes as verified game pixels.

## Code and behavior actually added

1. **Native source snapshot and batch:** `crates/spark-core/src/bitmap_preview.rs` now accepts **1–24 distinct `(bitmap_tag_id,image_index)` pairs** per operation. Every pair must be bounded and unique. One preserved cache snapshot must match the project's SHA-256 and expected classic map region/version. A **16 MiB aggregate raw top-mip ceiling** applies. Unsupported, missing, external-body, non-2D, swizzled or malformed inputs return explicit *per-image* refusals without poisoning otherwise independently verified image entries.
2. **Shared external resource verification:** `crates/spark-core/src/resource_map.rs` adds read helpers that reuse **one opened, SHA-verified and independently indexed `bitmaps.map` handle** across the batch. Only a unique exact normalized tag-path entry enclosing both the original declared raw span and requested mip data is accepted. After all accepted reads, the *same open file handle* undergoes an additional complete SHA-256 check **before any results return**. Failed resource verification blocks its pixels, with no filename guessing, external tag-body relocation, or sibling-file probing.
3. **Native desktop command:** `src-tauri/src/app.rs` registers `preview_owned_cache_bitmap_batch` on a background blocking task. The only parameters from the UI are the active project ID and exact bounded tag/image pairs. The native method resolves the preserved read-only cache and optional resource file exclusively from existing project records; it does **not** accept arbitrary client-supplied filesystem paths and never writes game files.
4. **Typed untrusted-data boundary:** `src/ownedBitmapBatch.ts` validates one batch's source/resource identities, response order and count, uniqueness, success/error exclusivity, image identity, supported formats and per-item dimensions through the existing DDS decoder. It enforces **16 MiB packed pixels plus headers and 64 MiB decoded RGBA** before decoding to stop pathological allocations or foreign-cache response mixups. Multiple shader regions requesting the same page share a single decoded image in that batch.
5. **World Editor and cancellation:** `src/components/World.tsx` adds **Auto-preview verified materials** (combined diffuse+lightmap path), retaining the dedicated buttons. It plans only source-proven primary diffuse tags and exact BSP-local lightmap pages, loads at most 24 eligible tasks per click, refuses unsupported entries, respects existing manually provided textures, checks live project/cache/**resource SHA** again after asynchronous completion, and never stores decoded pixels in the project. The 64 MiB texture-creation limit also applies. Cancellation discards late results; the native reader finishes safely before another heavy request is admitted. Texture naming labels no longer depend on a possibly already-updated texture state reference.
6. **Academy and tests:** Updated the in-editor material lesson with the one-batch flow and accurate cancel behavior. Added synthetic Rust tests for two externally indexed bitmap pages and for batch limits/refusals; added new dependency-free TypeScript protocol tests; retained the C19 source/lightmap planner tests with the increased 24-task budget.

## Compatibility and safety boundaries

| Area | C20 behavior / caveat |
| --- | --- |
| Classic Halo Demo (`version 6`) | Only supported **internal** image records and their top mipmaps; no Demo external resource inference |
| Classic Halo PC / Custom Edition (`7/609`) | Bounded internal top-mip image or verified indexed external top-mip **raw pixels**, with internal `bitm` tag body and explicit pinned `bitmaps.map` |
| Pixel encodings | Linear 2D DXT1/3/5, BGRX8 and BGRA8, top mip only; no cube/3D, swizzled, unsupported palettes, compression wrappers, animation, or all shader stages |
| Material association | Source-proven `senv` base-map and `soso` diffuse-map; a compiled BSP's own lightmap bitmap tag, valid secondary UVs and its *local page index* |
| Source file effects | Original map, indexed resource file and existing manually chosen previews remain unchanged. GPU textures are transient; no binary game cache is exported |
| In-game compatibility | **Not established**. Actual Halo shader blending, color-space, fog, sky, baked radiosity, BSP collision, portals and PVS still need engine-native work |
| Modern engines | No MCC H1A `ipak` extraction, HCEEK port, or cross-engine resource equivalence from this feature |

Existing KOTH authoring and multiplayer objective safety checks from C14–15, fog/sun editor controls from C12, editable terrain/caves and scenario preflight remain. None are silently changed to a claim of a compiled Halo map.

## Verification recorded for this release

| Gate | Result |
| --- | --- |
| Recovered C19 archive checksum / safe extraction | Verified |
| Complete offline Node regression suite, including new batch tests | **PASS** (2026-10-26, Node 22; see `docs/CONTINUATION_20_VALIDATION.txt`) |
| Pure batch/planner/bitmap preview TypeScript typecheck | **PASS**, global TypeScript 5.8.3 using bundler-style resolution |
| Whole tree `.ts`/`.tsx` syntactic transpilation | **PASS** |
| Rust unit tests and formatting | **NOT RUN** — `cargo`, `rustc` and `rustfmt` unavailable in the build environment; Rust changes are source-reviewed only |
| Full React/Tauri Windows build | **NOT RUN** — package dependencies/runtime and Windows target unavailable |
| Real owner-provided Halo cache/resource, genuine DXT/lightmap rendering | **NOT RUN**; synthetic fixtures are not game evidence |
| Tool-compiled arena/BSP, original Zombie Apocalypse loop, dedicated server / two-client multiplayer | **NOT RUN**; still explicit acceptance gates |

## Recovered-prompt coverage and next priorities

`docs/07_HALO_MODDING_BRAIN_HANDOFF.md` preserves the original scope, the existing 92-item *functional* reconstruction, historical broken-editor research, and realistic priorities. The full verbatim original Phase 3–7 prompt bodies are unavailable; this release does **not** claim exhaustive word-for-word recovery. Core outstanding milestones:

1. Real user-owned PC/CE bitmap-and-lightmap visual regression and a native Windows/Rust build; fix any genuine parser offsets, DDS orientation or runtime mismatches discovered.
2. Proper bounded classic external `bitm` **tag-body** loader, full shader stages/lighting/fog/sky behavior, and broader source-owned texture export pathways, with real evidence for each supported runtime.
3. An import/reconstruction loop that actually compiles BSPs: preserved geometry + materials + collision + portals/PVS + source lightmaps; diagnose old SwordEdit/MotaLev crashes rather than simply bypassing errors. Real HEK/HCEEK Tool and gameplay gates.
4. Guilty Spark Test Arena playable for all five stock H1 modes, including real hill markers/score volumes; source editor UI is not enough.
5. Zombie Apocalypse restoration retaining spawn behavior and provenance; real Firefight waves and First Contact script/AI/campaign slice, tested in the actual target engine.
6. Versioned release packaging, optional original locally owned Halo theme/sounds, supported dedicated-server integration, two-client multiplayer/AI testing and separate vintage Mac Demo/G4 pipelines. Never infer cross-engine compatibility from a successful test in one target.

## Owner testing

Start with `docs/CONTINUATION_20_TEST_CARD.md` and report the **first result before further steps**. Unpack the source into a **new folder**: do not overwrite a previous Guilty Spark working tree, a live installed Halo game, executable, client machine or map/resource archive. Runtime-independent tests can be run first; only explicit owned fixtures should ever be selected afterward.
