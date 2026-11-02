# C50: compact comparisons and custom native tag names

The later [C50 completion checkpoint](CONTINUATION_50_ENGINEERING.md) adds the full rendered UI audit, quality-preserving performance measurements, native window-transfer fix and refreshed regression/release results. The earlier observations below remain historical evidence.

This is a verified local working-tree checkpoint on the existing master foundation, not a new published release or a claim that the entire C50 backlog is complete. Earlier sources, failed research, C49 release candidates and regression safeguards remain preserved.

## Compare variants

The two map selectors share the heading row on wide windows. Search, category/status filters and counts take a small control area. Differences use 32-pixel rows with before/after columns, keyboard-expandable full values, and a page size calculated from the available height. Source hashes, archive metadata, saved-edit options and coverage explanations are in the existing drawer system. Map choices, filters and page position survive workspace changes.

Real desktop comparison used the same unchanged Demo Zombie Apocalypse and MCC Blood Gulch inputs in the previous C49 app and the new app. No synthetic IPC was used for these measurements.

| Viewport | Previous fully visible rows | New fully visible rows | New row height |
| --- | ---: | ---: | ---: |
| 1920 × 1080 | 2 | 24 | 32 px |
| 1280 × 720 | 1 | 12 | 32 px |
| 800 × 600 | 0 | 7 | 32 px |

The new collapsed lists have no page or list overflow at these sizes. Expanded values may scroll. All comparison rows remain reachable through pagination; unknown payloads remain explicitly unknown. Both original source hashes stayed unchanged. Comparison engine coverage has not been expanded to claim decoded payload equality.

Private evidence: `.local/c50-workbench-20261101/compare-native-before-1/acceptance.json` and `compare-native-after-2/acceptance.json`. Browser coverage also verifies keyboard expansion, filters, pagination, source hashes and returning to the same page.

## Custom tag names

In **Tag editor** or the Level Editor's **Object tags** drawer, expand **Rename tag**, type a custom name and apply it. A basename keeps its existing folder; a relative path changes the folder too. The custom name appears in the tag tree, selected-tag heading, dependency choices and viewport tag links. Saved project comparisons include queued renames when saved edits are enabled.

Renames are project edits with normal save, Ctrl+Z and redo. They preserve source tag IDs and the original inspection. Use the native extract/rebuild route to apply a custom path to a new game map. Smart Edit refuses to classify renaming as a supported direct byte write, and existing-cache validation cannot silently omit it.

The build stages a separate tag tree, checks collisions and source identities, and runs installed Invader's fixed native move/refactor recipe. It checks affected native fields, exact dependency changes, unchanged unrelated file hashes, inventory size and compiled paths/references. Compiler output is accepted only after native validation. Renaming does not grant remote tool execution or binary-patch sharing.

Invader's type-column padding and its omission of a type label for long references are formatting differences, not changed field values. Only exact planned dependency values are normalized for this readback. Changes to ordinary numbers, strings and whitespace inside string values are still refused. Failed candidates are retained for inspection.

### Genuine native acceptance

The existing compiled looping-emitter map was imported and its real `sound_scenery` tag renamed to `spark/custom_names/my ambient emitter`. Installed Invader and Halo: CE Mod Tools – MCC rebuilt a native MCC cache. The custom tag, its references, loop attachment and original emitter positions were read back from that cache. All 2,263 input tag files and the original cache remained unchanged. The two source tags affected by the refactor passed exposed-field comparison; all unrelated hashes matched.

Validated output SHA-256: `1a164c0b1166b59409737a0d9f6ac9b9126824ffbe55dd99c273a55f2a8358b4`.

Private evidence: `.local/c50-workbench-20261101/tag-rename-native-3/acceptance.json`, its job's `tag-renames.json`, and `tag-name-ui-native-1/acceptance.json`. The separate real desktop UI check saved a custom name and passed undo/redo without modifying the original cache.

### Limits

Scenario, BSP and globals roots retain their dedicated build paths. Arbitrary direct compiled-cache renaming and Xbox tag extraction are not enabled by this feature. The admitted route currently uses the matching native MCC source compiler. Native compilation/readback is proven here; gameplay loading of the renamed cache, in-game sound playback, every tag class and cross-runtime/game-peer replication are separate acceptance gates. A native review refuses trees with case collisions, unsafe paths, more than 128 queued renames, over 512 affected tags or oversized native field output.

## Regression and build evidence

- `cargo test --workspace --locked`: 636 passed, 8 opt-in tests ignored. The genuine native rename test was additionally run explicitly and passed.
- Frontend: 307 passed across 70 files; TypeScript/build checks passed.
- Browser UI: 142 passed, including retained editor contexts, stale BSP results, fullscreen, drawers, comparison and custom names.
- Offline checks: all scripts completed successfully. The Xbox material-planning gate now checks exact native texture/lightmap IDs while retaining rejection for unsupported versions.
- Windows embedded release-mode executable built successfully. SHA-256: `102093182ff6808ac4561b45234983264639c37ae31c030457761c2677f6c502`.
- Real native window readback confirmed fullscreen outer size and position match the current 1920 × 1080 monitor at `(0, 0)`. Other monitors and physical DPI combinations remain untested by that check.

Broader UI regressions also uncovered and fixed a header menu being covered by a drawer, and a delayed BSP result arriving after its retained editor became inactive. Existing drafts and WebGL resources stay retained; an obsolete asynchronous plan still requires a fresh review.

The executable is a local development build from the current modified master worktree. It has not replaced the sealed C49 installer/portable/source packages, created a GitHub Release, or satisfied unfinished performance, cross-runtime AI, live-game replication, Megaworld traversal and Linux distribution gates.
