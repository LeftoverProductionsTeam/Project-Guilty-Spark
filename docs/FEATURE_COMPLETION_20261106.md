# Continuous native feature completion — 6 November 2026

Continues local master `d64f3e7dc65ae1f0c555ad0070a611130912b71c`, directive `66656a27`, within the existing source/native/World implementations. This checkpoint does not accept the entire backlog or replace C49. Exact final source revision belongs to the local commit containing this report and the external review manifest.

## Repaired behavior

- A malformed or oversized optional QuickForge receipt no longer prevents opening the independent source document or its Undo history. The damaged metadata stays in SQLite for review; Build explains that a rebuild replaces it. Non-metadata database errors still propagate, and concurrent external source writes remain protected.
- A matching fingerprint alone cannot mark a native build current. The report verifies the owned job, build/receipt identity, actual output and SHA-256 through the existing readiness validator. Missing, changed, foreign and inconsistent output requires rebuilding. Source export remains a distinct status; this change does not claim complete exported-file integrity validation.
- QuickForge clears stale displayed receipts on lookup failure. Receipt lookup errors have separate state from an actual export/build failure, so a successful refresh cannot erase that failure.
- H1A source-scene readiness checks the exact selected scenario's documented shell roots. When present, their full dependency closure uses the existing resolver, staging bounds and hashes. Cache-only compilation remains supported; it is not presented as launch-ready source. Existing working-source reuse also checks whether complete shell inputs are newly required.
- Invader dependency queries now use the existing owned short-path alias on Windows. This fixes a genuine long-path failure: an exact hash-verified UI string tag existed, but Invader reported it broken before staging.
- The isolated Standalone source workspace can stage the selected official kit's exact `steam_appid.txt`, only when its identity is `1532190`. Changed or foreign identity is refused; originals and account state remain untouched. This repairs a demonstrated staging omission, not a proven explanation of the game's exit.
- A late map load now compares navigation intent, including leaving and returning to the same workspace, before restoring a saved route. A controlled delayed-load browser test failed before this repair and passed afterward; existing independent map/tool-profile navigation remains intact.
- Development startup no longer removes another process's empty, unpublished namespace. A real child process reproduced that ownership race. Unrecognized data stays protected; only the creator can remove its own still-empty failed admission. The existing storage/ownership suite passes 34 checks.
- Imported-map World additions now serialize standard `mach` palette/placement records, including unassigned power/position groups. World yaw/pitch/roll is retained directly instead of passing through QuickForge's different intrinsic rotation convention. Multiplayer item facing uses native yaw. Native verification requires every added machine's tag, count, position and rotation, consuming coincident matches only once.

## Workspace and title-bar steering

The latest owner requests are integrated into the existing window workflow. A dragged map tab keeps the workspace and settings/learning section that were active at handoff; it opens a distinct native window. The existing Work control also drags the current workspace out when no map is open. Document leases, pending edit flush and source Undo still use the established window engine.

The normal title bar measured 40 pixels because a lazy drawer stylesheet overrode the compact theme. Both now use one 32-pixel height; tabs and top-row controls share a 28-pixel alignment. Browser regressions check containment, nonoverlap, readable active tabs, overflow menus and at least 48 pixels of window drag space at 800–1920 pixel widths. All189 browser checks and the actual native-window cases pass, including animated pointer tear-off, section/history preservation, native placement recovery, three-window menu isolation and restart. The measured native header remains32px with a reserved drag region; every row child is contained. Physical monitor disconnect/transfer remains unverified. The external monitor image retains its independent placement.

## Existing entrypoints and boundaries

| Workflow | Existing path and implementation | Evidence boundary |
| --- | --- | --- |
| Source/Undo recovery and build badge | `QuickForge.tsx` → `quickforge_build_report` → `Library::quickforge_receipt` / `quickforge_report` → existing `verified_build` | Corruption and actual owned-output tests; no game claim |
| H1A source testing | Runtime dock Test Scene → `runtime_workbench::{prepare_runtime_tool,launch_runtime_tool}` → `forge_build::h1a_scene_preflight` / `build::Runner` | Exact source subset, native compiler and real process evidence; game still unaccepted |
| Native door in an imported map | Open donor and destination maps → Level Editor → Asset Library → Doors → drag → Inspector → copy/paste → Build & playtest | `World` / existing native import → `native_asset_imports::{append_scenario,verify_compiled}` → standard scenario/cache; current native acceptance recorded below |
| Requirement cross-reference | Existing CSV and `update-feature-ledger.mjs`, external searchable derived HTML | Source wiring, not feature/game acceptance; no runtime CSV load |

## Standalone investigation

The source-only shell manifest contains 465 path/size/hash records, not proprietary tag bytes. With the existing authoring subset, the reviewed union is 2,263 tags / 120,453,271 logical bytes. Every file and the original SDK archive were hash-checked; no full SDK tree is retained. Cache-only native trials use the smaller existing subset.

R1/R2 stopped at a real long-path dependency failure. After the existing alias repair, R3 compiled the same C71 geometry/starts and authored door/trigger through native Tool and independent Invader readback. The compiler-valid control and authored Standalone both exited 1. Missing UI-tag errors disappeared. The control debug sequence includes DirectInput focus priority and expected non-Slayer flags/equipment warnings; neither establishes the fatal cause. The authored debug tail was lost by the old assertion ordering, which is now repaired so future failures retain their result before assertion. Do not claim identical fatal sequences without that evidence.

The normal Steam application was not observed. A computer-use attempt to start it returned **app approval timed out**; no Steam session, login, installation or security change is claimed. Valve's [Steam API documentation](https://partner.steamgames.com/doc/api/steam_api?l=english) describes client/AppID requirements and working-directory AppID lookup. The selected kit contains its own exact file. This remains a hypothesis for the unresolved runtime failure, not a successful game test.

C63's earlier accepted two-way door remains historical human evidence. New C71 Enter/Open, two-way passage, independently authored Leave/Close, retail MCC cache loading, independent GUI editor reopening and game-peer acceptance remain open. No unchanged repeated game launches were used to fabricate success.

## Current verification

Current Rust source passes 801 tests, with 9 intentionally ignored across 53 suites. TypeScript, 416 frontend tests in 96 files, 3 source-entrypoint contracts, 59 offline checks and 35 storage/ownership checks pass. All 189 browser regressions pass. The actual native workspace cases pass, with normal close and no mocked IPC. Rust results are the unchanged native source checks from R19; current frontend/compiler/window/asset results come from R24; the complete189-browser run is R23, followed by all3focused keyboard cases with initial reverse-focus coverage. Earlier whole runs are not mislabeled successful.

The real imported-map World workflow now passes: a validated edited donor is opened, a door is pointer-dropped into the compiled map, transformed with nonzero yaw/pitch/roll, copied, undone once, redone, immediately saved and reopened. Native rebuilding retains both unique machine instances and one dependency binding. Spark's native cache reader confirms both transforms; independent Invader extraction/readback confirms the scenario machine count and unassigned power/position groups. The original compiled cache stays hash-identical. This proves standard native source and compilation, not game interaction with those new placements.

The source/logic workflow also passes a native property edit, dependency import, door/trigger configuration, Undo/Save/reopen, standard HaloScript compilation/readback and an actual process restart with the same source/Undo head. Two independent native compiler jobs validate; unchanged requests create no additional SDK trees.

Failures remain recorded: R10 exposed the missing supported machine class in project/Undo validation; R11 caught an outdated namespace in the test fixture. R12 had 179 browser passes and one obsolete fullscreen shrink expectation after normal mode was compacted. R13 passed all browser/window cases and correctly refused rebuilding a raw MCC cache without its matching editable scenario source. The final test follows the real Open built map entrypoint, which binds the verified exact tagset; the source prerequisite was not bypassed. R14 also exposed a reused independent-extraction directory: the new native cache had correct placements, but the earlier same-name scenario remained on disk. R15 uses a fresh owned directory and requires the independent machine count to match the cache before reading fields. R15 then read the correct unsigned null index65535, while its obsolete assertion expected the writer spelling-1. The final test verifies native Index0xFFFF exactly; no native data was changed to force this result. The pinned local Invader HEK definition and [upstream data_type.hpp](https://github.com/SnowyMouse/invader/blob/696830ff80af227e84e7237c2ef26eb2301ed110/include/invader/hek/data_type.hpp) define Index as uint16 and NULL_INDEX as0xFFFF.

R16 completed World/native readback but exposed an incomplete process-close assertion: another native WebView remained visible after the first closed. The final harness records every native window label and closes all owned windows normally before waiting for process exit and restarting. R17 exposed45px of Appearance overflow from the eye-color row; the control now shares the existing Visual identity heading and the original no-scroll regression passes. R18 was refused by the aggregate storage budget before allocation; no storage guard was weakened. R23 completed189browser cases and2native compiler jobs, then the desktop build hit a genuine directory-sharing32 failure. A real Windows fixture reproduced the sampler blocking compiler-temporary removal. Live child-directory handles now share delete/rename, then re-open and verify volume/file identity and reparse status before accepting totals. Operation roots/ancestors and full audit handles retain their pinning. Replaced directories fail closed;35storage ownership regressions pass. This follows [Microsoft CreateFile sharing semantics](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew). No antivirus, Windows security, sampling bound or deletion policy was changed.

Native inputs, SDK subsets, test profiles and binaries stay in the existing owned external disposable workspace and are removed on completion. The final compact receipt is [feature-completion-20261106.json](fixtures/feature-completion-20261106.json). No replacement archive, retained SDK, new installer or public release is created by these checks.

## Ledger integration

All 475 distinct IDs, original feature wording and originating source identities are preserved. The original first-four-column identity hash remains `a47797f3d35e6632c7889b0c1e084b56c05212653e01df53a2909fe5d3e9797a`. All 25 numbered prompt files match their original manifest hashes.

Eight additional columns link prompt families, actual screens/state owners, registered UI IPC and native declarations, result boundaries, related IDs and review limitations. There are 465 records with registered IPC in the owning subsystem slice and ten research-only records. These are shared subsystem traces; **they are not 475 individually accepted creator journeys**. Original missing-functionality, target, risk, evidence and next-action fields remain visible. Two obsolete C49/C51 owner references were corrected without restoring retired QA warehouses. The generator preserves current evidence instead of overwriting it from old historical tables; `--check` now rejects stale references. Historical rebuilding cannot overwrite the integrated ledger.

Prompts 04/05/06/07/24/25/26 are advanced within this checkpoint's tested scope. The native asset rows, including `C32-tag-roundtrip`, `C33-recursive`, `C41-source-equivalence` and `C41-visual-persistence`, remain partial until their independent game and broader asset/edition criteria pass. General direct-cache structural editing, arbitrary schema changes, full source fidelity, two-computer collaboration, native AI parity, Megaworld traversal and clean-machine/platform/release work are preserved as separate gates.

## Next action

The imported-map machine UI/native acceptance and latest title-bar/window steering are verified within the scope above. Preserve this source milestone locally and refresh the one source-only review package. Resume Prompt06 in the existing World/Logic path; retain the separate actual Halo, independent GUI-editor and physical monitor/peer gates. Standalone's unresolved real game gate may be revisited when a normal Steam session and human interaction are available; it must not freeze independent safe implementation.

## Monitor and independent native windows

Settings & tools → Interface Studio → Appearance → Visual identity contains **Monitor eye**. Its saved color controls only the permanent application-menu picture's eye and selectable aura; native model/shader pixels are not changed. Hover, keyboard focus and an open selector strengthen the glow, with reduced-motion support. The header uses the permanent lossless256px image at64CSSpx, with no native map reads, model renderer, lazy decode or recapture. Tint changes reuse the same image; normal restart retains the setting. The Home/asset 3D renderers remain separate. The optional desktop companion reads an older saved portrait when available and otherwise uses this permanent image. The exact256px native front portrait is also the application icon, encoded with the installed Tauri icon tool into the existing Windows/PNG/ICNS targets. Windows independently extracts the compiled executable icon and compares its pixels with the generated ICO, including transparency. The same image appears immediately as first-run menu artwork and favicon; the fixed blue app icon and configurable menu tint remain independent. No new installer or public release is claimed.

The menu bug was the persisted global `chrome.sidebar` open value broadcasting WebView storage updates. It now uses local React state. Existing window-labeled persistence also isolates library/learning/community browsing, appearance-category selection, hosting preference, docked Director and selected layout name. Project source, single-writer authority and Undo stay intentionally shared; appearance colors remain a global preference. OpenWork already owned local popup state and was reused.

MapTabs now shows a lifted pointer-following preview, an explicit detach threshold, pending native transfer and cancellation/failure feedback. The existing native creation/lease transaction acknowledges before the original tab closes; duplicate pointer-up is guarded. Reordering and context-menu/keyboard alternatives remain. No new window framework or external-drop handler was introduced. The duplicate Transfer assets titlebar button was removed. Its existing Tools drawer remains registered, opens and reopens normally, and loads transfer contents only on demand.

The native suite uses three real windows for main/map, detached editor and independent no-map workspace. It verifies selector independence in each direction, different routes, focus/minimize/maximize, Escape cancellation, duplicate release, rejected native route without history loss, one writer, Undo/Redo/Save, editing after the original window closes and normal application restart into the saved layout. Physical cross-monitor pointer dragging and monitor unplugging remain separate unverified gates.

## Keyboard navigation

The existing header, tabs, menus and source-history owners provide the controls. A small shared composite-key helper fills gaps; it does not create another navigation store or command registry.

| Action inside Spark | Keys |
| --- | --- |
| Next / previous open map | Ctrl+Tab / Ctrl+Shift+Tab, or Ctrl+PageDown / Ctrl+PageUp |
| Close the active map through Save / Discard / Cancel | Ctrl+W |
| Next / previous visible work area | F6 / Shift+F6 |
| Help and shortcuts | F1 |
| Active map context actions | Shift+F10 |
| Workspace/menu selection | Arrow keys, Home/End, typed initials, Enter/Space |
| Existing Open work | Ctrl+Shift+P |

Typing, native selects, camera controls, Save and author-owned Undo/Redo retain their existing handlers. Hidden/paused editors are excluded from F6 traversal; modal focus stays inside the active dialog. Browser workflow tests cover map edits surviving switching, guarded close/cancel, context-menu focus restoration, Help focus trapping, work-area focus memory, native text Home/End and Tools/section navigation. The actual native suite checks Help, the workspace selector and F6 across three independent WebViews without changing source/Undo. This is Spark keyboard behavior, separate from F6 inside an actual Halo game.
