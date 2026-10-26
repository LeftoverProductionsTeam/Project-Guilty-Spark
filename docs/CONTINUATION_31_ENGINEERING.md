# Continuation 31 — evidence-aware UI, tooltips, lore and source-to-game instruction

**Based on:** exact `Project_Guilty_Spark_07_Halo_Modding_Brain_Continuation_30_SOURCE.zip`, SHA-256 checked before modifying files. This is a cumulative **SOURCE** archive, not a packaged EXE, map compiler, gameplay release or claim of finished ten-phase product.

## Implemented

- `src/workbenchGuide.ts`: one explicitly defined, source-aware guide for all 19 workspaces (including footer workspaces), with three useful distinctions: **what the current workspace can do**, **what has NOT been proven**, and **which workspace to open next**. Evidence is derived from actual loaded project, preserved map, SHA-matched inspection, QuickForge source presence, configured tool directory, native/browser mode, unsaved edits, running native job. Tool discovery is NOT successful execution.
- `src/components/WorkbenchGuide.tsx` + `src/App.tsx`: a collapsed-by-default Forerunner/Halo-inspired guide strip at the top of each workspace. Expanding reveals three concise panes and navigational buttons only. Does not run tools, touch map bytes, force-save, create projects or silently start downloads.
- `src/components/ui.tsx` + CSS: help bubbles now explicitly honor keyboard focus, hover and touch, and can be dismissed with Escape without stealing focus. Hidden tooltips aren't described to screen readers. W3C tooltip pattern is a work-in-progress; manual screen-reader verification remains pending.
- `src/components/WorkspaceFinder.tsx` + finder keywords: content-based search includes field-guide vocabulary. Selected index is bounded even for a zero-result search; accessible result count and active label are announced. Ctrl/Cmd+K continues to navigate only existing workspaces.
- `src/tutorialAcademy.ts`: a seven-step **From an original room to a playable Halo build** historical source/rebuild/debug/play loop. Manual engine gates stay manual and the source observable checks do not claim a playable map.
- `docs/CONTINUATION_31_ORIGINAL_HALO_LORE_AND_DESIGN.md`: credited links and concrete product lessons from Eschaton/HMT/SwordEdit/SparkEdit, log mods, MacGamingMods/HaloMD, Tool/Invader and accessibility guidance.
- Existing C26 local Halo-owned bitmap/sound profile, C28 legacy optional companion catalog, C29 tag migration review, C30 Community Maps discovery and all earlier QuickForge collision/portal preflight remain preserved.

## Verification and safety

- Original C30 SHA-256 and ZIP integrity verified before changes.
- Add `scripts/test-workbench-guide.mjs` to the `npm run test:offline` suite. It exercises all 19 workspace scenarios and explicitly checks negative and stale evidence paths, asset-only build, browser preview, unsaved edits and active-job caution. The previous workspace UI contract test is updated to the improved Escape-aware tooltip contract.
- Changed TypeScript and TSX syntax parsed with the installed TypeScript compiler. Node's dependency-free offline scripts test logic and source contracts; **they are not native Tauri/React render tests**.
- Final cumulative ZIP independently extracted; 429 SHA-256 manifest entries verified and the full 59-script offline suite passed on the packaged copy.
- NO new Rust commands, shell invocation, network access, game/map write behavior, third-party binaries, copied game bitmaps, cache patching or untrusted file ingestion. New UI actions only navigate inside Spark.

## Limits still explicit

The project still needs a native Windows toolchain build, actual Halo Tool structure/map compilation, verified BSP/collision/portal output, playable Test Arena and cross-map tag/BSP round-trip. Imported BSP cuts and full game menu skinning aren't implemented. Saved source and human-readable error hints must NEVER be mistaken for real engine proof.
