# Demo workflows, BSP source handles and retained previews

Continues local master after C63 `056bc69`. The accepted two-way door gameplay, real Invader edit/reconcile/compile result, previous-good builds and earlier failures remain intact. This pass does not claim new human gameplay.

## User workflows

**Learning center → Guides** and **Features & workflows** now share one catalog of **63 workflows**. Search, category, eight-item pages, remembered selection, prerequisites and workspace buttons replace the separate short help list. The guarded source entrypoints direct compiled-only or missing projects to Map library rather than inserting/replacing geometry. A coverage fixture maps all **95 current native QA examples and desktop scripts** to a user workflow or a labeled diagnostic/research boundary; regression enumeration catches unmapped additions. [User steps](DEMO_WORKFLOWS.md).

The existing Workshop now exposes **Named volumes → Volume name**, explicit Room/Corridor/Ramp drawing and a four-step contextual guide. Source component picking uses a double-sided nearest-depth source surface rather than inward-facing render triangles or orthographic painter order. Face/edge/vertex handles use centered world XYZ, with rotated/nonuniform local transforms resolved into the same source vertices. Native topology validation, merge guards and one edit-history transaction remain authoritative; a rejected edit resets the proposed handle position.

**Join source faces** accepts opposed congruent rectangular faces on different playable-space volumes, constructs an overlapping closed corridor with the existing source builder, and refuses ambiguous/incompatible profiles. It is not arbitrary landscape seam welding. **World-sized texture tiling** is enabled on new source shapes; existing source omits the optional field and keeps its old serialization and UV behavior. Native surface UVs use world position/normal when opted in, retaining texture density through scaling. Shader resources and native compilation are still required.

## Actual desktop and native evidence

The real optimized Spark/WebView tests use actual pointer input, source storage and native IPC, without replacing the mesh, source-selection handler or compiler result. They pass drawing and naming, face/edge selection, a one-unit world-Y face-handle drag, one-action Undo, immediate Save, matching-face joining, Undo/Redo and exact reopen. The latest UI application has SHA-256 **`26f17693e6ae2e6fb877191bacde6aafa20b721d041c44eb0ed0e8d1a0bb276d`**.

The production H1A Tool/Invader pipeline builds the same UI-authored source in job **`cea18351-5b53-4661-ac9e-9396b016bece`**. The cache SHA-256 is **`4690dafd6430821e4f7d2ca94ca0b1d6590dd7f7fb33b9ce2147a810ffb273ec`**. Spark reads back **40 render and 40 collision triangles**. Tool staging, source validation and fast draft radiosity remain enabled. The build took **78.970 seconds**; an earlier run took 123.174 seconds, but the conditions were not controlled for a build-performance claim. The compiler-test executable is recorded separately from the final executable, which adds guide-copy corrections without changing geometry/compiler code. Exact source-file hashes, applications and evidence paths are in [the acceptance fixture](fixtures/c64-demo-workflows.json).

Two unsuccessful pointer-harness trials remain in local evidence. They aimed using the `three/examples` handle scale rather than the installed `three-stdlib` scale and missed the real handle. The corrected test derives the actual control scale and camera-facing direction, then asserts stored vertices and one-action Undo. Failed trials are not counted as passes.

## Preview lifecycle and measurements

The corner monitor stores its captured 256-pixel PNG in a dedicated bounded, library-scoped local WebView record. It appears immediately on subsequent launches while original source/resource identity is checked. It no longer competes with the bounded general preference record. A changed source/pin can still refresh the capture; the PNG is decorative and never substitutes for validated native asset data.

Home uses the existing retained-workspace lifecycle after its first visit. Its model canvas, pose, animation time and material resources remain alive while rendering is paused outside Home. Installation badges refresh when Home resumes, without reloading geometry. Native model/bitmap/reflection requests share a source/resource-keyed bounded broker with single-flight reads, independent consumer copies, retryable failures and identity checks. Existing shader/bitmap interpretation and GPU ownership are unchanged. The raw cache is bounded to 64 MiB/128 entries; it is not an unlimited promise to retain every map forever.

| Same final optimized app, owned MCC monitor | Measured result |
| --- | ---: |
| First fresh-profile corner capture, from process launch | 5,543 ms |
| Saved-profile relaunch to restored corner image | 791 ms |
| First measured Home-ready wait after prior navigation | 203 ms |
| Retained Home resume | 46 ms |
| Native preview reads on Home resume | 0 |
| New corner renderers after saved-picture reload/relaunch | 0 |

The test closes and starts a separate real application process with the same WebView profile. It verifies the identical stored image and retained Home canvas/animation. OS file caches were not purged. These are first-use/reuse timings from one machine, not a controlled whole-application cold-start benchmark or full renderer performance acceptance. Another recorded run measured 7,190→963 ms and 52 ms Home resume; the final sequential run above avoids another QA app compiling concurrently.

## Regression and boundaries

- Rust workspace: **677 passed, 8 opt-in ignored**, across 45 result groups.
- Frontend: **385 passed in 91 files**; TypeScript and production frontend build pass.
- Browser: **160 passed** serially; final guide-copy changes also pass the focused guide test.
- Offline: **59 scripts passed**. The first launcher attempt could not find `npm`; the actual scripts were then executed through the installed Node runtime and all passed.
- Optimized Windows application build and actual desktop workflow/lifecycle tests pass.

The ignored native-data/runtime cases retain their prior opt-in requirements. No original map or SDK master tag was edited by this pass. C49 release artifacts and the accepted C61/C62 applications remain protected. No installer, public GitHub Release, push, new game-peer AI result or separate-computer networking result is claimed.

Remaining gates include general imported-terrain editing, structural direct compiled-map changes, arbitrary seam profiles, complete rendering/audio parity, retail MCC loading, player-confirmed Timberland–Sidewinder return traversal, human Firefight, original zombie seat release and full multiplayer AI. Guides expose the honest supported route and its gaps; they do not turn research into a completed mode.
