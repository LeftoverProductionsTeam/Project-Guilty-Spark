# C35 follow-through — saved tool edits

This pass continues `5e70f35` on `codex/continuation-35-living-workbench`. It retains the C35 drawers/Director/catalog and all earlier work. It closes a real desktop rebuild blocker and adds read-only monitoring of derived editable tag folders. The earlier C35 r1 executable, installer and source ZIP remain frozen.

## User workflow

1. Open a map's validated editable source project. Runtime details show its **Saved tool edits** monitor. Launch the matching editor from the Runtime Dock, or use the displayed derived working tags folder in an external tool.
2. Save the tags. Spark waits for a stable save and shows a compact **N saved tool edits** button in the existing dock heading. Open it to review added, modified and removed files. This adds no permanent utility row over the viewport.
3. Save and close native editing/test tools, then choose **Build working tag edits**. A pre-build project snapshot is taken. The existing compiler path copies current tags into a new job, preserves input files and validates the separate cache. Rebuilding is disabled while the monitor sees a save in progress.
4. Choose **Open working-tags build** to inspect the actual output in another preserved map tab. Keep the original authoring project as the editable source. Compiling loose tags does not rewrite QuickForge brushes, patch the old cache or apply new game-memory edits.

An OS filesystem watch signals changes; the UI checks every three seconds. The monitor waits at least 1.5 seconds between matching metadata observations before hashing changed files. A 30-second metadata fallback catches missed notifications; **Scan tool tags now** also rehashes every file after stability, including content saved with restored size/timestamps. Quiet polls reuse the previous report. Deliberately restored metadata between fallback checks needs an explicit scan.

For working-tags builds, the baseline is the hash-pinned final inventory of the compiled parent, so edits made before connecting are detected. Other supported derived source jobs use the current files at watcher connection as their baseline; the UI states that distinction. Monitoring is limited to eight active map windows, 20,000 files/directories, 32 nesting levels, 2 GiB/file and 16 GiB total. Limits or I/O failures are reported without changing source files. Native build validation remains its own gate.

The existing two-second compiled-map/HMT/Eschaton monitor remains independent. Loose SDK scripts, images, arbitrary user-selected tag trees, automatic typed-tag merging into a compiled cache and general conflict/reconcile editing are still outside this monitor. A stable saved file is not a claim that its tag syntax or gameplay is valid.

## Actual native challenge

[Metadata-only receipt](fixtures/c35-tool-edit-native-verification.json) records the exact executable and output hashes. The test uses `qa_runtime_library` to copy the accepted C34 working-tag context into a **fresh private library**: 2,246 files / 206,019,818 bytes. The user's ordinary library and original SDK/job are not the test workspace.

`scripts/test-working-tags-native.mjs` drives the actual release WebView, uses installed Invader to make a real scenario-field save, clicks the desktop rebuild action, waits for the official native compiler, opens the result from the UI and reads the new cache's inspection. No Halo process is launched or attached.

| Observation | Result |
|---|---|
| Baseline | 2,240 tag files, compiled-inventory comparison; connection observed at about 3.47 seconds |
| Independent-window access | Another native Director window's use of the editor's watch was refused |
| External source edit | `player_starting_locations[0].position`: `(-7.5, -10.666667, 0.1)` → `(-7, -10.666667, 0.1)` |
| Stable change scan | One modified `.scenario` file; exactly one file rehashed |
| Desktop native rebuild | Validated MCC v13, multiplayer type 1, 2,239 tags; about 16.25 seconds in this run |
| New cache readback | Actual player start `(-7, -10.666667, 0.1)` in the separately opened map tab |
| Preservation | Original SDK job scenario, parent cache, edited input tags and Spark's authored scene/tag edits/QuickForge document retained |
| Game acceptance | Not run; no game launch, memory write or gameplay claim |

The parent cache SHA-256 is `85d2390bdeced18f8f7617b751ddcbf42555ab4533aa8a993ebb0dcd28f9095b`; the new cache is `fa75952cdf222f5cf8a26554471e33cf5efc37d4843bf52dedb8e8d700ba7975`. Timings are individual observations, not a repeatable benchmark or comparison against a previous build. Owned screenshots/tags/maps/full logs stay private under `.local/continuation35/`.

## Bugs and polish

The desktop working-tag path requested a snapshot with reason `before-working-tag-build`, which the snapshot system does not accept. It therefore stopped **before** starting the compiler. The C34 core compiler receipt did not exercise that desktop admission step. The desktop path now uses the supported `before-build` contract; a native regression verifies real snapshot creation and preview using that caller's reason. The complete desktop-to-compiler-to-new-cache challenge above passed afterward.

Runtime details were also constrained by the generic modal's maximum width despite specifying a wider width. Its own maximum width now matches the 940-pixel responsive layout. Changed paths wrap, the review list is bounded/scrollable, stable-save status is explicit, and the dock uses a small count button rather than adding another always-visible bar.

Window/build ownership, stale-result rejection, serialized polling, delayed window closure, transient read retries, expired-watch recovery and bounded changed-file lists are covered. Monitoring never overwrites input tags or an existing project. The native command does not hold its global watch-registry mutex while scanning/hashing. Concurrent starts reuse an existing matching watch when one finishes first.

Earlier failed QA attempts are retained. A native window could close before its own CDP promise returned; the harness now requests closure from the surviving editor. A proposed debug wrapper could not replace Tauri's immutable invoke property, so the harness observes actual UI refusals and native job events instead. No immutable bridge or native guard was disabled. The snapshot refusal was reproduced directly before repair.

## Verification and artifacts

- **409 Rust tests passed**, five explicit opt-in tests ignored; includes native filesystem notification, inventory integrity, stable-save reconciliation and snapshot-contract coverage.
- **148 frontend tests passed**, 32 files; seven new controller tests cover serialization, stale map/build results, closure and retries.
- **54 browser tests passed**, including the changed-files review, save-in-progress build gate and separate build request. Browser IPC fixtures remain distinct from native compiler evidence.
- **59 offline checks**, TypeScript, Vite, release Rust and NSIS builds passed. The existing Vite main-chunk warning remains.
- Actual native tag-save/rebuild/open/readback passed against the frozen r2 executable. Wider C35 r1 fullscreen/Director/material evidence remains scoped to its earlier receipt; this pass adds the new native tag workflow evidence.

Local r2 files are `GuiltySpark-C35-0.4.0-living-workbench-dev-r2.exe`, its `-setup.exe`, and `Project_Guilty_Spark_Continuation_35_SOURCE_r2.zip`. Their artifact JSON and SHA-256 sidecars record identities. Both source manifests and every ZIP member are independently verified. No remote push, master merge, public release or installation is included.

The remaining engine backlog stays in the [cumulative ledger](MASTER_FEATURE_LEDGER.md): full recording/Save-picker/game/audio acceptance; Alpine's three missing classic bitmap dependencies and actual converted gameplay; native dual wield/player sword/lunge; arbitrary live allocation/BSP replacement; game-peer AI/edit synchronization; foreign-MCC protocol translation; expanded-player game acceptance and complete render/audio parity. This tag workflow does not claim those capabilities.
