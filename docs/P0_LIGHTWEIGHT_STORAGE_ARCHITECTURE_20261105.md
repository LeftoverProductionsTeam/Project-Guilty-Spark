# Part 2 — Lightweight storage architecture and validation

**5 November 2026.** Part 1 is committed at `13207fc`. The local commit containing this report preserves the verified Part 2 implementation and its explicit remaining limits. Completed tests do not establish clean-machine, whole-runtime or long-term acceptance.

## Project editing and backups

- In-memory edits, native source identities and durable Undo remain authoritative. Opening maps does not extract all tags; hosting choices cannot override source/resource identity.
- New projects have `automaticBackupRetention: 3`. Storage offers None, 1, 3, 5, 10 or custom 1–100. Older projects keep their saved global default until changed; native build fingerprints are unaffected.
- This is an **allocation cap, not rolling rotation**: a full automatic-backup allowance stops allocating another periodic copy. None stops optional periodic copies. Neither setting disables the current project, Undo, or minimal crash recovery.
- Admitted managed saves reuse one atomic previous-good `<project filename>.bak`, validate project/source ownership and reject corrupt/foreign recovery content. Unchanged saves reuse bytes; historical UUID backups and portable descriptor compatibility remain protected.
- Manual and build/restore/shared-session safety checkpoints stay separate. Usage distinguishes automatic, manual, safety, legacy and recovery storage. Explicit cleanup shows owned periodic UUIDs/full SHA-256, requires confirmation and revalidates before removal. Other projects, manual/safety and unmarked history remain protected.

Implemented in existing [snapshots](../crates/spark-core/src/snapshots.rs), project save/native commands and [Storage UI](../src/components/StorageSettings.tsx).

## Native builds and generated storage

Existing `storage::Store` retains ownership, category/total/per-operation reservations, minimum free space, protected outputs and content-bound cleanup. Source-aware preview caches stay bounded without dropping native fidelity.

[forge_build.rs](../crates/spark-core/src/forge_build.rs) estimates staging from the validated recursive dependency subset, imports and authored source. Copy overhead and compiler/adopted-output headroom include a 1 GiB output floor. Overflow or insufficient budget refuses job allocation. Required writable dependencies and native validation are preserved.

[Cargo](../scripts/cargo.mjs) reuses `target/`; [QA guards](../scripts/native-qa-storage.mjs) bound admission and remove only sealed, unchanged disposable descendants. `.local` is prohibited. Accepted builds, originals, source, settings and recovery are protected.

## Locations and compact setup

Storage exposes an optional/default mod folder and MCC/Custom Edition/OpenCE/Chupathingy export preferences. Cancel changes nothing; explicit Open may create the default Mods folder. No maps or existing outputs are copied.

**Build outputs remain owned jobs until explicitly exported; automatic export routing is unfinished.** Optional first-run folder choice does not repeat after completion. Runtime discovery stays within known/selected locations. [Native routes](../src-tauri/src/storage_native.rs), [setup](../src/components/StartupSetup.tsx).

## Evidence and unfinished gates

| Gate | Current evidence |
| --- | --- |
| Full regressions | **736 Rust passed/9 ignored, 404 frontend and 167 browser checks passed**; TypeScript/Vite and desktop builds passed. Offline59 and storage/continuity13 also pass. The two new managed-guard regressions were repaired without changing their original fixtures. |
| Focused frontend | 6 checks passed: [StorageSettings.test.tsx](../src/components/StorageSettings.test.tsx) and [settings.test.ts](../src/settings.test.ts). |
| Browser interactions | 3 synthetic IPC cases passed: backup/map isolation, reviewed cleanup/runtime folders, optional setup. [Evidence](../artifacts/qa/part2-storage-final/), [tests](../tests/ui/native-contract.spec.ts). Not native filesystem/game acceptance. |
| Desktop identity | SHA-256 `36cfd9065a9aedd02abe17ca66e22062bc042afdda58d5bc7cb99581bf9009f2`. This is the current test build, not a published release. |
| Native 20-edit journey | **4 cases/0 errors.** Twenty edits with Undo/Redo/save; 3 periodic backups/17 capped requests; forced restart preserves acknowledged state. None/manual/exact GUI cleanup/recovery pass. Independent Invader radius 0.225/CRC mismatch 0; original unchanged. [Receipts](../artifacts/qa/part2-native20-recovery-fixed/). |
| C66 structural build | Two real H1A builds; independent Invader CRC/protected/stub results all 0. Valid door radius 0.5 survives reconciliation/recompile; corrupted save rejected. Ten unchanged requests add no native trees. [Actual summary and receipts](../artifacts/storage-v1/lightweight-architecture-20261105/native-structural-summary.md). Gameplay was not retested. |
| Finalization | Five-root physical inventory completed with zero metadata errors. Git fsck and diff checks pass. The local commit containing this report retains the tested source; no push/publication. |

Native 20-edit project usage: logical **162,652,392 → 163,917,693 B (+1,265,301)**; allocated **162,677,272 → 163,983,360 B (+1,306,088)**. Comparable process-tree private bytes **1,719,312,384 → 1,695,006,720 (-24,305,664)**; sampled peak **1,915,686,912 B**. Sealed QA cleanup removed **54,525,709 B**; **206,385,072 B/289 files** remain as evidence. These are scoped samples, not quotas or unlimited stability proof. The first failed run (closed-Page locator and transient shutdown ENOENT) remains preserved; its corrected retry passed.

## Final cleanup and accounting

The [classified final inventory](../artifacts/storage-v1/lightweight-architecture-20261105/physical-inventory-final-summary.json) and [directory table](../artifacts/storage-v1/lightweight-architecture-20261105/final-accounting.md) enumerate every remaining top-level directory, 200 files/242 directories above40MiB and48 large collections of smaller files. Native file allocation deduplicates hardlinked objects; redirected targets were not traversed. Filesystem/MFT overhead and later report/commit bytes are excluded.

Canonical allocation is **53,229,873,520 B (49.574 GiB)**. Part1's two measured cleanup phases reclaimed21,780,486,000B; Part2's compact native inputs, accepted build/recovery evidence and shared release cache add2,519,120,616B net after cleanup. The reconciled reduction is **19,261,365,384 B (17.939 GiB)**. This reconciles measured phases rather than claiming a simultaneous whole-volume baseline. All four external roots retain identical file counts, logical sizes and allocated sizes.

Following verification, supported Cargo development-profile cleanup removed822 reproducible files/rounded329.7MiB; the release application and53 source-backed native helpers remain. The failed native20 run's exact redundant executable and three generated WebView cache folders were retired through existing sealed-scratch APIs: **46 files/54,054,048 allocated B**. All236 other files remain; failure acceptance staysfalse. Its dead-owner reservation was explicitly reconciled to failed/inactive measured usage, with both prior records preserved verbatim. [Exact receipt](../artifacts/storage-v1/lightweight-architecture-20261105/failed-native20-reviewed-disposal/disposal-receipt.json).

Fresh hashes verify all67 Zombie originals/750,272,565B and all100 retained release files/750,809,520B against their original inventories. C49's three payloads and manifest checksum match; the preservation index and current/previous-good application hashes match. Of18 preserved C70 source files,14 are unchanged and4 contain the reviewed Part2 extensions; exact old/new hashes are recorded rather than claiming they were untouched. [Protected-original audit](../artifacts/storage-v1/lightweight-architecture-20261105/protected-originals-final.json). No original game files, unique archives, user projects or history were deleted. User-added Master Engineering Prompts remain untracked and untouched.

Automatic approval review rejected Git repacking during Part 1 and implicit backup pruning during Part 2. No Git rewrite/prune or automatic backup rotation was performed. The implemented backup cap requires explicit GUI review to free an owned slot.

Native polling can overshoot between checks; it is **not an OS filesystem quota**. RAM/VRAM budgets are estimates. Clean-machine Windows, native macOS/Linux, human/game-peer acceptance and long-term stability remain unverified. C49/C63 evidence and unfinished C70 gates remain unchanged.
