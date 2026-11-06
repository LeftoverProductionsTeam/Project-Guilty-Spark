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

Targeted contracts currently pass **36 tests**, including real Windows allocation/file IDs, filesystem notifications, protected junction exclusions, changed-owner refusal, killed owned-child recovery, and refusal to adopt the previously review-blocked preservation index. The health test's own fixture now lives in an exact temporary directory, not repository `artifacts/qa`. Stdin-run ownership was also repaired after reproducing its invalid `-` filename assumption.

## Genuine Windows editing and source-preservation acceptance

On `c9d826f` plus the recorded import/preview/history/monitor repairs, the complete same-working-source run passed **758 Rust tests (9 ignored, 52 suites)**, TypeScript, **413 frontend tests**, **176 browser tests**, **59 offline commands** and **36 storage/source contracts**. The embedded Windows application then passed four actual cases without mocked IPC:

- One valid map plus two rejected inputs returned independent results. Ten additional rejected imports left the library index and project folders unchanged.
- Fifty native tag edits, each with author Undo/Redo and immediate Save, survived reopening and a test-owned process interruption after acknowledged Save. Project logical growth was **2,955,508 bytes**; sampled peak process-tree private memory was **1,906,794,496 bytes**, and comparable final private memory was **2,953,216 bytes below** the ready baseline. These are samples, not an OS/GPU quota or proof of long-horizon stability.
- The real Storage controls confirmed the default of zero automatic backups, explicitly selected three, stopped allocating at that limit, and preserved manual and fixed recovery copies during reviewed cleanup.
- Smart Edit exported an actual native MCC map. Invader independently confirmed its CRC and extracted/read back the edited pistol radius **0.225**. Output SHA-256: `45c596247b213ddb1532f2c3dadd6e3d484c5b1d2fabef4f177b376b7280f5c7`. The original map stayed unchanged. This direct bounded map edit did not invoke a compiler or retest gameplay.

The separate real H1A/Invader round trip still passes: 1,793 input files, 1,796 compiled tags, corrupt-save refusal, exact recovery, valid radius 0.5, rebuilt cache and independent readback. Fresh native build measured **26,021 ms**. Ten unchanged requests reused the same **270,620,016 allocated bytes**; they are not ten independent builds.

The full operation disposed **5,335,649,623 logical bytes** of temporary payload. Peak logical usage was 5,510,397,707 bytes and the last measured native file allocation was 5,023,942,416 bytes. Physical reclamation cannot be assigned from logical deletion because Cargo output includes shared hardlinks. No new SDK tree, binary, test profile or archive was retained in the checkout.

## Proven defects repaired during acceptance

Home prepared background previews through normal map import, silently creating two additional persistent projects in a fresh library. The strict native assertion found this; it was not relaxed. Home now requests bounded RAM-only TEMP records in the **existing Library connection** and reads original maps in place. The existing native decoder, source hashes, resource pins and material pipeline remain authoritative. At most 32 background maps / 128 MiB metadata are retained; capacity rejects new work without discarding active records. Cleanup checks their source references. Explicit Save refuses a background read-only record. Core tests plus the actual app confirm one explicit import creates only one persistent project. Actual user imports still use the persistent backend; this is not full Phase 3 acceptance.

Mixed imports now return successes and individual failures independently to the studio through existing commands. Older native array/error callers retain their interface. Whole-batch history validation now rejects foreign, unknown, duplicated or rebound snapshots before writing any immutable files. Missing immutable IDs may only recover their exact original bytes. This closes validation-failure orphans, not every interrupted I/O case.

A real compiler replacement race exposed a failed metadata sample. The native meter reports numerical Win32 errors and retries the **entire** inventory twice (80/200 ms), never accepting partial totals. Persistent denied access, changed ownership or linked paths still fail closed. A separate real Windows pending-delete fixture reproduces Win32=5. The original failed run did not record its code; that historical cause is not asserted. Failed operations now retire their sealed disposable receipt/schema output while propagating the original failure. The real Cargo rerun exercised a successful retry. Earlier failed runs remain identified in the compact fixture.

## Import publication rollback — native application acceptance passed

The following continuation passed the full Rust workspace: **764 passed, 9 ignored, 52 suites**. It validates all referenced asset bytes, mesh parsing, identities and scene metadata before creating a new project, with a 128 MiB admitted asset-payload limit and existing per-format limits. Checked bytes and parsed meshes are reused.

New imports now couple a fresh filesystem directory to the existing SQLite publication transaction. Only after COMMIT succeeds is it accepted. Rejected publication rolls back exact newly created files after verifying nonce, canonical containment, native directory/file identities, SHA-256 and absence of hardlink aliases. It does not recursively delete or adopt another directory. Existing storage identity reading is reused; no archive, staging database or new monitor was added.

Tests use actual SQLite failure injection: ten map-publication failures, ten asset-publication failures and ten deferred-COMMIT failures leave saved projects and original sources unchanged. Ten bad later-asset rejections allocate no map/OBJ copies; a corrected retry succeeds. Changed/unknown files, changed nonce, replaced directories and same-byte hardlinks refuse rollback. Partial I/O whose exact contents cannot be proven is retained with its exact path; abrupt-process orphan recovery remains open. The complete same-source rerun on `cdbd27eaa5c583072f8b8056b3b10e67cc9a873a` passed 764 Rust / 9 ignored, TypeScript, 413 frontend, 176 browser, 59 offline and 36 storage/source contracts, then the real H1A compiler and four actual Windows app cases. It adds ten native-source descriptor rejections with an invalid later OBJ, leaving original assets and the single-project index/folders unchanged. Fifty edits/Undo/Redo/Save and restart again pass; direct export independently reads radius 0.225 with the same output SHA. Logical project growth was 2,955,505 bytes. All 5,344,651,336 logical temporary bytes were disposed. No old native result was substituted for the changed implementation.

## Measured application profile

Fresh isolated application/profile, warm OS filesystem (no cache flush): app window **520 ms**, explicit map import **3,761 ms**, fully ready map **7,296 ms**, retained editor resume **211 ms**, same canvas and **zero additional native preview calls** on resume. Readiness required all BSP and visible model primary shaders, completed lightmaps/reflection work: 121 source shaders, 15 lightmaps, 11 cubemaps, 68 model types, 186 objects and eight decals. No texture/model omission was used to reach readiness; exact stock-renderer parity is not claimed.

At that ready sample the process tree used 1,389,133,824 private bytes and 1,427,505,152 working-set bytes; the GPU probe reported 210,055,168 dedicated and 18,198,528 shared bytes. The existing bitmap cache remained bounded to 128 entries / 64 MiB (59,388,830 estimated bytes at sample). These are a current baseline, **not** a measured before/after startup or rendering speedup. The comparable monitor before/after measurement above remains separate.

## Hosted follow-through and catalog contention

A later read-only check found that remote master had advanced externally to `c9d826f`. [Run 42152912223](https://github.com/LeftoverProductionsTeam/Project-Guilty-Spark/actions/runs/42152912223) **passed Windows Rust, browser, desktop build and Actions upload**. That confirms the original generated-import repair on the hosted Windows runner. It is still an Actions artifact, not a GitHub Release; the release list remains empty.

The same run failed Linux Rust at `lease.finish_disposable()` in the repeated disposable-staging test: `Storage is in use by another operation; retry shortly`. Its log does not identify the competing handle. The previous catalog lock rejected the first transient contention. It now waits at most 500 ms for **catalog metadata only**, rechecking identity/links; operation-lease probes remain immediate and active jobs remain protected. Actual I/O failures are not retried. This follows Rust's separate [WouldBlock / I/O error contract](https://doc.rust-lang.org/std/fs/enum.TryLockError.html).

Real OS-lock tests cover a transient holder, a persistent holder and active-operation cleanup refusal. An additional Unix-only test retains a duplicated catalog handle while a producer completes; it awaits native Linux execution. The inherited/cloned-handle explanation is a hypothesis for the historical Linux failure, not a claimed trace of that run. The current Windows Rust suite passes **767 tests, 9 ignored**; the real H1A/Invader compiler rerun also passed: source-sized staging, corruption refusal, exact recovery, valid edit, rebuild and independent readback. Its 3,678,209,719 logical temporary bytes were disposed; reclaimed physical allocation is unknown for shared Cargo hardlinks. Hosted Linux re-verification needs an authorized push/run. This agent did not push, dispatch, change protection or publish.

Ownership refusal during import now appears in the existing returned error with the exact retained folder, rather than only stderr. A changed/unknown file still prevents deletion; reporting it does not create a recovery archive.

## Scoped release-readiness matrix

This matrix covers the active repair; it does not promote all 475 historical requirements.

| Requirement | Existing source / function | Test / operation | Windows | Linux | macOS | Native / game gate | Remaining blocker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Stable renderer test entrypoint | `render-alpha.ts`, source-entrypoint guard | Real bloom/alpha/hologram browser assertions | Hosted c9 passed; newer local passed | c9 Rust contention failed; repair pending hosted | Not run | No game claim | Authorized pushed source / Linux retest |
| Owned storage lifecycle | `native-qa-storage.mjs`, `physical-audit.cs`, repository health | Actual allocation, ownership negatives, pending-delete and failed-run disposal | Passed | Earlier core/web only | Not run | No original resources deleted | Remaining product/tool stress matrix |
| P8-02 mixed import feedback | `collect_imports`, `ImportReport`, App import handler | Native mixed batch + ten rejected retries | Passed | Not run natively | Not run | Map identity unchanged | Filesystem import rollback remains |
| No background map copies | `Library::preview_map`, `open_asset_source`, Home preparation | Real app strict library count + core memory limits | Passed | Core portability untested here | Not run | Source decoding retained | Actual user opens still persistent |
| C33/C43 history / explicit backup policy | `workspace_history::commit`, native lifecycle test | Fifty edits/Undo/Redo/Save/restart, zero-default + chosen retention | Passed | Not run natively | Not run | Acknowledged-save recovery only | Full RAM history, Save/Discard/Cancel and orphan cleanup |
| Native output / Smart Edit | Existing build/orchestration and bounded writer | H1A compile + Invader reconciliation; real UI direct export/readback | Passed scoped | Tools unavailable here | Tools unavailable here | No new human gameplay | C71 broader object/behavior/tool workflow |
| C49 release preservation | Existing release verifier / protected package | Exact source, five-file manifest and checksums | Unchanged / verified | No accepted package | No package | Older 0.4.1 source | New installer, clean-machine/platform/signing/distribution gates |

## Remaining gates

The complete repeated matrix remains open: 20 real map sessions without Save, ten archive imports including invalid/no-scenario, ten independently completed native compiler jobs, tool/window lifetime cycles and full unsaved recovery. Fifty genuine edits and ten rejected-file retries above passed; do not repeat or relabel them as the missing workflows.

Production `Library::open`, durable workspace history, autosave and close handling still require coordinated memory-first integration. Do not flip the constructor alone. Save/Discard/Cancel, interrupted-import orphan recovery, full external-tool success/failure/cancellation cleanup and C71 authored-tag publication remain unfinished.

Linux/macOS packages/startup need actual native runners; none are available locally. New hosted CI and public distribution await their approvals. Accepted C49 Windows 0.4.1 stays unchanged and does not contain these newer repairs. All 475 ledger IDs and exact 25 recovered prompts #04–#28 are preserved. No human gameplay, game-peer, clean-machine or whole-platform acceptance is inferred.

Compact evidence: [p0-release-stabilization.json](fixtures/p0-release-stabilization.json). The bounded active checkpoint names the exact next operation. No new archive warehouse, full SDK, service or watchdog was retained.
