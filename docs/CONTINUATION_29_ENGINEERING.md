# Project Guilty Spark · 07 Halo Modding Brain · Continuation 29 engineering handoff

**Baseline:** checksum-matched `Project_Guilty_Spark_07_Halo_Modding_Brain_Continuation_28_SOURCE.zip` (SHA-256 `50ae122226b6d9311b6f12f1dab932daa5a20f64b04c685f1b8065d2bab1320b`). This is a complete cumulative **source** continuation, not a prebuilt Windows EXE or tested Halo mod. The original cache and user-owned Halo assets are not included.

## Engineering change: cross-map tag migration preview

- Added `src/tagMigrationReview.ts`, a bounded read-only assessment of a previous `guilty-spark-tag-reference-bundle/v1` against a newly selected, SHA-pinned destination `MapInspection` and the exact project's preserved source. No command execution, network access, file-system read or Halo file write.
- The correct join key is normalized **tag class + path**, not numeric cache datum. Source IDs are only used to detect contradictory relationships within the source manifest. Target collisions caused by the same path with another class are explicitly highlighted.
- Selected roots: `identity-present` (not byte equality), `class-conflict`, `not-present`. Indexed immediate references: `present-in-target`, `in-selected-source` (still requires extraction), `missing-from-target`, `class-conflict`, `unknown-source-path`, `inconsistent-source-reference`.
- Engine and cache version comparison is **conservative**; a match is not a converter or runtime compatibility certificate. Distinct SHA hashes establish the two source snapshots; a self-compare is called out.
- The source manifest remains capped at 512 KiB; selected roots <=128; references <=256/root; target tag index <=32,768. The preview scans all supported input references but only displays the first 96 dependency rows. Counts include the remainder and disclosure says the view is truncated. Ambiguous duplicate target datum/class-path identity is refused.
- `exportTagMigrationReview` deliberately omits paths, tag names and asset bytes; records count/class/status/source hashes, metadata-only notices, and an explicit set of **false** build/overwrite/roundtrip claims. Report <=64 KiB. It cannot authorize importing into either map.
- Added `src/components/TagMigrationReviewPanel.tsx` to the real Tags workspace. The user explicitly selects local `.json`, can see source/destination identities and previews and exports a safe report. The input isn't silently processed from filesystem folders. It is displayed within the modern dark Halo-inspired workbench, not a separate launcher.
- Strengthened existing `src/haloExchange.ts`: refuses malformed reference classes/metadata, duplicate source IDs, unsafe text and manifest export from a selected tag with staged edits (which would otherwise disappear from the original-cache reference list). A datum whose actual target class differs no longer receives a falsely verified target path in exported JSON.
- Added an Academy `tagPorting` tutorial and Legacy Workflow Lab shortcut to the integrated preview. Source-independent real tool extraction is explained as a **manual engine gate**, never an executed task.
- Added `scripts/test-tag-migration-review.mjs` and a static integration contract test to the dependency-free offline regression chain with source/destination collisions, missing/unknown references, edition mismatch, same-cache handling, path-safe report and malicious inputs.

## Boundaries and product honesty

1. This is a reference-manifest **comparison**, not a binary `.tag` exporter/importer, not a safe overwriter and not a complete recursive dependency closure. A reference can be absent from the native index entirely.
2. Matching class/path identities cannot prove identical tag bytes, same processed fields, correct external bitmap/sound maps or compilable source. `in-selected-source` means a manifest mentions that tag, **not** that the actual source bytes are included.
3. The Build & Playtest cancel notice now acknowledges that write-sensitive compiler phases can defer cancellation until a safe boundary rather than claiming the converter was always immediately terminated.
4. No original map or installed Halo directory is edited. No tag, BSP, executable, bitmap or sound is packed into this release.
5. Cross-engine conversion remains an explicit engine-specific research/build task. Halo Demo, PC, CE, H1A MCC and original Mac G4 are not interchangeable.
6. Native Rust/Tauri compilation, a real Invader extraction into this exact destination, Halo Tool build and in-game test are **NOT RUN** in this environment; offline TS tests only establish local behavior.

## Current acceptance priority

**First genuinely playable Guilty Spark Test Arena** remains the top gate, followed by complete BSP/portal/PVS/collision rebuilding and lossless, engine-verified tag/BSP import/export. New tag migration preview reduces an important classic-editor guessing problem but does not close these engine-level tasks.

## Evidence and limitations

- Baseline SHA verified; all archive entries passed ZIP extraction and `testzip()` before changes.
- `npm run test:offline` runs in this environment; TypeScript strict check of the modified pure modules runs using global `tsc`.
- Full UI typechecking/build requires actual project dependencies. The source-level JSX syntax pass is not a functioning Windows GUI proof.
- Original ten-phase prompts are only partially recoverable verbatim (especially Phases 3–7); the 92-item matrix is a conservative functional reconstruction. No missing prompt is represented as executed.

See `CONTINUATION_29_ORIGINAL_HALO_LORE_AND_PHILOSOPHY.md`, `CONTINUATION_29_REQUIREMENT_TRACE.md`, `CONTINUATION_29_TEST_CARD.md`, and `ORIGINAL_92_REQUIREMENTS_RECONSTRUCTION.md`.
