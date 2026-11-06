# P0 release stabilization

Owner directive `285a5a02-49b0-4bfb-aedc-c3bb970e5635`. Continue the single canonical local master. This is an incomplete release stabilization initiative, not acceptance of all seven phases.

## Browser regression

The connected GitHub job log confirms that run [42127984354](https://github.com/LeftoverProductionsTeam/Project-Guilty-Spark/actions/runs/42127984354) tested `f14a8270d1034ade14cb3df4f177a1e2c7f74682`. Its two Windows failures were dynamic imports of an incidental Vite optimizer path. Linux core/web passed; Windows packaging/upload were skipped after the browser failure.

Commit `86acae2` routes both tests through `tests/ui/fixtures/render-alpha.ts`, which imports the Three package and existing production renderer modules. All original bloom, resize, solid/transparent pixel-alpha and additive-hologram assertions remain. The source interface guard uses Vite's exported parser, checks actual module references in application/tests/scripts and executable documentation, and rejects generated-cache and retired recovery-tree imports. Historical prose and negative test literals remain intact. Frontend, source-only verification and release runners invoke the guard. Both CI jobs check it; Linux now also runs the browser suite.

Local Windows results on that repair: Rust **752 passed, 9 ignored, 52 suites**; TypeScript passed; frontend **413 passed**; browser **174 passed**; offline **59 commands**; storage **22 passed**; source-interface **3 passed**. Release contracts: **11 Python and 6 JavaScript passed**. Browser tests are not a clean-machine/native-app acceptance result. New hosted success is pending an authorized push; no push, dispatch, tag or publication was performed.

The real H1A/Invader operation verifies 1,793 dependency-sized stock inputs, compiles 1,796 tags, rejects a corrupted external save, recovers exact valid bytes, edits bounding radius to 0.5, rebuilds and independently reads it back. Ten unchanged requests reuse the same job: **270,620,016 allocated bytes before/after**, zero additional native trees. The original SDK archive and door recipe remain unchanged. All 3,693,794,268 logical bytes of temporary build/test payload were disposed. Gameplay was not retested.

## Existing monitor and ownership lifecycle

The same operation leases now expose startup/current/peak logical and allocated file data, file/directory counts, free volume space, owner/writer PIDs, source revision and last sample. Progress replaces bounded existing receipts; it does not append a new journal or create another storage database. A changed lease/owner prevents cleanup.

Active work uses filesystem notifications with coalescing and 30-second periodic reconciliation. `SPARK_STORAGE_SAMPLE_INTERVAL_MS` accepts 10–300,000 ms for deliberate diagnostics/tests; normal operation defaults to 30,000 ms. Explicit completion samples and sealed cleanup remain mandatory. This is a sampling stop threshold, not an OS-enforced per-write quota. Transient disappearing/locked compiler metadata invalidates that sample; it cannot certify partial totals or weaken final content/identity checks.

On Windows, the existing `physical-audit.cs` reader provides a bounded stdout summary using `FileStandardInfo.Allocation` and volume/file IDs. The installed .NET compiler builds a small helper inside declared disposable scratch. Its source/output hashes are checked, its binary can be reused in RAM for that process, and the helper is removed with its owner. No optional application is installed. If native allocation is unavailable, it is reported unavailable. Node block counts round down NTFS resident data and are not advertised as exact allocation. The underlying distinction is documented in [libuv's Windows filesystem implementation](https://github.com/libuv/libuv/blob/v1.52.1/src/win/fs.c); the resident-file discrepancy was reproduced locally against the existing Windows audit reader.

The canonical checkout is monitored without recursively watching/scanning Git, dependencies, pinned research, protected games/mods/ISO or the preservation index. Exemptions are explicit in each summary. These subset totals are not the entire repository footprint. Large unknown/generated growth remains visible and never becomes deletion authority by size or age.

`pnpm health` now reads live nonce-bound development summaries through the existing repository-health command. It identifies the operation's declared producer and actual owner/writer processes; it does not infer the author of arbitrary writes. Use `node scripts/repository-health.mjs --storage` only for an explicit full logical inventory. This diagnostic view has no deletion authority. Existing native Storage & Cache measurements remain separate.

The fixed 3,000-file/768,000-byte, eight-second idle comparison dropped from **9 metadata scans to 2**. The new operation summary and pre-existing full Windows scanner both measured **768,000 allocated file bytes**. Recorded main-process CPU was 2,266 ms before and 16 ms after, with 218.75 ms in the measured native reader after; this does not include every parent native reader, so no total CPU percentage or application startup/rendering speedup is claimed. All files were inspected, not omitted. A failed first cross-check exposed resident-byte rounding and was corrected before acceptance.

Targeted contracts currently pass **35 tests**, including real Windows allocation/file IDs, filesystem notifications, protected junction exclusions, changed-owner refusal, killed owned-child recovery, and refusal to adopt the previously review-blocked preservation index. The health test's own fixture now lives in an exact temporary directory, not repository `artifacts/qa`. Stdin-run ownership was also repaired after reproducing its invalid `-` filename assumption.

## Remaining gates

The full repeated product workflow matrix is still open: 20 real map sessions without Save, 50 edits/Undo, rejected/archive imports, ten independently completed compiler jobs, tool/window cycles and crash recovery. Ten unchanged compiler requests are not ten independent builds.

Production `Library::open`, durable workspace history, autosave and close handling still require coordinated memory-first integration. Do not flip the constructor alone. Full external-tool success/failure/cancellation cleanup and C71 authored-tag publication/Smart Edit acceptance remain unfinished. No default-memory, native-app/release, human gameplay or multiple-computer acceptance is implied by these script repairs.

Linux and macOS package/startup tests need actual native runners; no local Linux/WSL or Mac environment is available. Accepted C49 Windows 0.4.1 remains unchanged and does not include these newer commits. All 475 existing ledger IDs and 25 recovered prompts #04–#28 remain preserved. No legacy requirement was promoted to complete, and no new archive, full SDK tree, service or watchdog was retained.

Compact evidence: [p0-release-stabilization.json](fixtures/p0-release-stabilization.json). The bounded active checkpoint contains the exact next operation and unresolved publication/platform gates.
