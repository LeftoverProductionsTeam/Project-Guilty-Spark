# P0 repository and storage recovery — November 4, 2026

The owner-authorized recovery directive `9ff41c98-58d2-422d-bc3b-882e1cf4aef1` was executed against canonical local `master` in `D:\Project Guilty Spark`, starting at `6cff1b6eb283dec6ceb6d1b1ea53db749d900b72`. The source changes and this report belong to the final local recovery commit. No branch, worktree, reset, rebase, push, publication or security-setting change was performed.

**Result:** `.local` is absent, with no replacement placeholder. Source, originals, research, release candidates and unique evidence were preserved before verified duplicate removal. The actual rebuilt Windows app and a supported native editing workflow passed after removal. Broader gameplay, physical monitor and C70 specialist-tool acceptance remain independent open gates.

## Measured storage

Measurements use the same read-only, no-follow repository scanner. These are logical file bytes, not Explorer allocation estimates.

| Measurement | Before | After cleanup, rebuild and native tests |
| --- | ---: | ---: |
| Repository logical bytes | 171,571,476,580 | 72,727,666,539 |
| Repository logical GiB | 159.79 | 67.73 |
| Regular files | 727,564 | 123,494 |
| Volume free bytes | 680,680,288,256 | 782,232,453,120 |
| Obsolete `.local` bytes | 157,888,329,885 | 0; directory absent |

Net repository reduction is **98,843,810,041 bytes / 92.06 GiB** after verification. The volume's observed free-space increase was 101,552,164,864 bytes / 94.58 GiB; other volume activity and allocation/hardlink effects mean this is not an exact causal deletion total. The final build/app tests added 530,245,473 logical bytes / 505.68 MiB compared with the immediate post-removal scan. No duplicate SDK tree or obsolete directory returned.

Remaining `preserved/` contains 49,972,475,387 bytes / 46.54 GiB of protected recovery material. This includes 28,511,600,807 bytes of pre-existing historical archives moved intact, rather than counted as reclaimed. Other retained roots include the shared Cargo output (5,572,641,622 bytes), bounded QA evidence (2,150,472,564 bytes), installed runtimes, original maps, version-pinned research and required toolchains/dependencies.

## What was removed and preserved

The initial `.local` file inventory balances exactly: **635,325 files = 633,561 retired files + 1,764 moved files**. Logical bytes similarly balance: **157,888,329,885 = 128,028,155,681 retired + 29,860,174,204 moved**. Retired source occurrences were removed only after their independent preservation or approved reproducibility was established; these gross figures are not net reclaimed storage.

- Removed the two obsolete Cargo output roots, `.local/build/cargo` and `.local/c39-native-collaboration/target`: 11,250 files / 6,655,834,955 logical bytes, after rescuing unique development binaries into `preserved/development-builds`.
- Removed 503,903 native-tag copy occurrences / 49,874,301,552 bytes across 172 reviewed trees. Preserved 15,988 unique independent blobs / 2,199,751,458 bytes under `preserved/native-tags`; all blobs were independently rehashed.
- Removed 118,408 reviewed asset/cache/metadata paths / 71,498,019,174 bytes. These include repeated map/app binaries, owned disposable WebView caches, existing-CAS duplicates and archived residual metadata. Retained unique assets under `preserved/immutable-assets` and two fully read-back recovery archives.
- Removed 459 exact reparse objects without following their targets. Then removed 113,784 remaining empty directories by native file identity, `.local` itself last; zero retained/errors in that final stage. The earlier Cargo pass also removed its 1,673 empty directories.
- Moved 1,568 tool files / 597,763,877 bytes to `tools/`, 100 release files / 750,809,520 bytes to `releases/recovered-C49`, and 96 historical archive files / 28,511,600,807 bytes to `preserved/recovery-archives`, with before/after hash verification. These moves were not deletion savings.

The 18 original unfinished C70 source files were snapshotted outside the cleanup root with exact hashes. Fifteen remained unchanged; three received intentional, tested path/race/harness repairs. All legitimate unfinished work remains in the canonical source and local commit; C70 is not thereby accepted. All 67 original Zombie files (750,272,565 bytes), all 100 relocated release files, the accepted C63 two-way door cache and later external-edit cache, and the C57 tunnel cache passed preservation checks. Starting Git refs were verified unchanged before the authorized final master commit.

The supplied provisional v8 audit was found replacing the canonical Markdown feature history with uninspected assumptions and obsolete restrictions. Its exact 30,279 bytes, SHA-256 `f99c1dcdc78620bdf83e1dd2c78cfdcb3240b9f91377a2f50c19ea6fcd74b884`, are preserved in [a separate companion](REQUIREMENTS_AUDIT_V8_PROVISIONAL_20261104.md). The canonical history and 475-row CSV remain intact; the CSV is byte-identical to starting HEAD. The [provisional source index](Guilty_Spark_Requirements_Source_Index_2026-11-04.md) is retained separately, not treated as implementation evidence.

## Cause and permanent repairs

Repeated native jobs retained entire writable tag sets, nested continuation workspaces accumulated, multiple Cargo roots and old QA outputs survived, and development dependencies still referenced an obsolete nested workspace. Input staging, dependency preparation and completed-job lifetime lacked consistently enforced ownership boundaries.

The repair extends the existing ownership/storage system rather than adding another job manager:

- Canonical outputs are `target/`, `artifacts/qa/`, registered `tools/` and protected `preserved/`. Native library startup and storage admission reject the obsolete repository `.local` before creating it, while normal Linux `~/.local/share` paths outside a Spark repository remain valid.
- Source/output overlap and reparse traversal are refused. Reservations, free-space checks, active ownership, content hashes, interruption recovery and protected-source references are retained. Completed disposable cleanup refuses changed bytes even if size and timestamps were restored.
- Equivalent verified SDK preparation reuses its existing extracted inventory. Successful native builds automatically dispose only their reproducible derived extractor input after source/output hashes and native validation succeed; accepted editable tags and outputs remain protected. Failed/interrupted jobs remain recoverable.
- QA and Cargo entrypoints use explicit bounded admission: QA 4 GiB/run and 16 GiB total; shared Cargo output 16 GiB with 4 GiB admission/free-space allowance. These are admission/reservation checks, not an operating-system hard quota. Sealed completed scratch is automatically disposed only in the existing workflows that own it; unknown evidence is never broadly auto-deleted.
- Repaired 267 installed dependency junctions, 18 command wrappers and workspace/store metadata to use canonical root dependencies. Strict normal frontend build now succeeds without reinstalling dependencies or disabling dependency verification.
- `AGENTS.md` now separates implementation, automated acceptance, human verification, technical blocks and acceptance. A human-only gate remains unverified but does not block safe independent engineering. Queue receipt and ledger preservation do not establish completion.

Two actual bugs exposed by verification were fixed: fresh-library Smart Edit now reserves/creates its owned jobs directory before a direct save, and minimized viewports cancel an already queued renderer frame while retaining document state. The pre-existing C70 geometry handoff now waits for its background polling operation before manual actions.

## Regression and native evidence

- Post-removal `cargo test --workspace --locked --offline`: **722 passed, 0 failed, 8 ignored**, across 48 result summaries. Ignored gates require explicitly selected owned source/SDK fixtures, a reviewed running MCC session or live HTTPS access; they were not silently converted to passes.
- Frontend: **400 tests / 93 files** passed during repair; post-removal strict dependency-verified production build passed. Existing large-chunk/dynamic-import warnings remain.
- Browser: **164 passed**; offline checks: **59 programs passed**. Combined checkpoint/storage/health/release script checks: **23 passed**. Focused real Windows guard tests cover long paths, reparse replacement, hardlinks, read-only files, changed data, recovery and archive readback. Final native link/empty-directory fixtures: **9/9**. Asset retirement fixtures: **15/15**. Overlapping test suites are not summed as unique coverage.
- Final optimized Tauri app build passed in 2m08s: `target/release/GuiltySpark.exe`, SHA-256 `43888167d87db1251fb020426283114cb0daf117ca8627a2e5b90f9b4758033e`. It was built from the inspected working source before this local commit; it is a QA executable, not a newly packaged installer or published release.
- Actual app acceptance used separate native WebViews and real IPC, with **10 cases passed / no errors**. Button detachment, independent map edits, authoritative Undo ownership/refused stale writes, window return, saved/offscreen placement, nested drawers, inactive/minimized zero GL clears, renderer retirement/resumption and production Steam test-identity refusal passed. Pointer-drag/physical monitor transfer and monitor disconnect acceptance remain open; earlier automation failures are retained.
- The fresh settled native-only repeat passed **2 cases / no errors**. Owned MCC Blood Gulch rendered 5,503 BSP triangles, 68 model types, 186 objects and 8 authored decals. Its source-material queue finished with 159 shader bindings, 15 lightmaps, 237 detail bindings, 73 reflection bindings/11 cubes, zero pending material work and no reflection issue. A screenshot is retained. This proves actual resource loading and viewport use, not exact engine shader parity.
- In the real Tag Editor, pistol bounding radius changed from 0.1 to **0.225**, Undo/Redo passed, and Save created a validated MCC map copy. Independent installed Invader extraction/readback returned **0.225**, and CRC mismatch was **0**. Output SHA-256 `45c596247b213ddb1532f2c3dadd6e3d484c5b1d2fabef4f177b376b7280f5c7`; original SHA-256 `1b712ba7e0f634716f55cd7c840737ab2aa9dd9ae17c1bb161a158e7c4e6b102` remained unchanged. The direct route correctly records `compilerRan=false` and all other bytes preserved.
- Separately, the installed Invader compiler built a small standard JMS fixture (3 vertices/1 triangle) into a standard `.gbxmodel`; independent tag readback confirmed one node/geometry. No entire SDK was copied. This is native model compilation, not a new full map/gameplay claim.

The earlier missing-jobs save failure, harness search-pattern failure, initial hardlink-ctime refusal and archive-path failures remain recorded. They were repaired and retested rather than removed from the evidence. Archive retirement accepts only the exact recorded own-unlink link-count transitions; changed bytes and outside mutations remain refused.

## Recovery locations and open gates

External original source snapshot, inventories, measured storage and test logs:
`C:\Users\patri\OneDrive\Documents\ChatGPT\GS\P0-Recovery-20261104`.

Portable indexes and durable journals: `preserved/recovery-metadata/`. Its union coverage receipt accounts for **107,869 residual files / 18,118,078,333 bytes**, exactly once, across the existing content-addressed stores and two standard ZIP64 archives:

- `residual-metadata-20261104/recovery.zip`: 2,017,823,959 bytes; SHA-256 `5c5ef63e1b8904f2c131c6b9fbd1fdef1c0fe9463192d2d93095ef3e89b68bcb`.
- `residual-final-supplement-20261104/recovery.zip`: 1,114,398,978 bytes; SHA-256 `c1388c62e8458394122590b75e9927fb49697bfba597ec83052f4ce640f88afd`.

Catalogs retain original names, identities and hashes; ZIP objects are content-addressed. The copy/restore helper defaults to explicit single-file recovery, never follows archived links, and does not restore the obsolete `.local` namespace in place. Protected archives/stores must not be treated as disposable caches. Original C49 artifacts were neither overwritten nor republished.

P0 cleanup/build/app/native-edit acceptance is complete. No new Halo gameplay, physical multi-monitor, two-computer networking, whole-app rendering/audio parity, C70 DCC round trip, clean-machine installer or new platform acceptance was claimed. Python package-verifier tests remain unavailable because Python is not installed. Resume existing C70 native-tool/DCC acceptance next, preserving the independent C69 human gate and every queued requirement. No manual requeue is needed for the instructions already preserved.
