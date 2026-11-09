# Hosted CI manifest concurrency repair — 8 November 2026

Operation 110% P0 continues local master `1d38c251715be2b8102cc0efc45437ea4735860c`. The owner pushed that exact commit; read-only GitHub API confirms CI run 42538304817. No remote write, rerun, publication, history change or runtime installation occurred.

## Hosted failure

[Core and web job 128907421673](https://github.com/LeftoverProductionsTeam/Project-Guilty-Spark/actions/runs/42538304817/job/128907421673), Ubuntu 24.04 / Node 24, failed at scripts/native-qa-storage.test.mjs:787: 29 passed, one failed, four platform skips. Subsequent steps were skipped. The Windows companion job was still running at the last read.

The assertion required every `.tmp-` file to be absent immediately after an injected EIO replacing scratch-ownership.json. The hosted log contains no temporary filename, so its exact nonce is unknown. A 4,082-byte source/URL/excerpt receipt is retained at E/ci-42538304817-core-failure.json. E is the private external evidence root in ACTIVE_TASK.md.

## Reproduction before repair

R256 uses the actual storage monitor and atomicJson implementation. It holds a genuine storage-run.json progress write at its rename boundary while a separate scratch-ownership.json rename fails with EIO. It does not fabricate filesystem inventory or substitute another writer implementation.

The failed temporary was scratch-ownership.json.tmp-f8d93326-c117-4d37-b55a-09ecf28e4747; it was already absent after failure. The remaining file was storage-run.json.tmp-c34462da-edab-4e38-be3a-9ce0e2c16f48, owned by the active manifest-error-test progress operation, PID 39736, nonce 8f70dadf-da99-41d9-ac80-ceda767206f3. The previous ownership receipt remained byte-identical. The original global assertion fails deterministically, 1 versus 0. Exact evidence: E/manifest-temp-r256-red.log.

This proves a false concurrency assumption in the test rather than an orphan from the failed atomic rename. The controlled reproduction ran on Windows; it is not local Linux acceptance. WSL is not installed and no platform/security settings were changed.

## Repair and guarantees

Only the existing test cases change. Production atomicJson, directory ownership, source protection, storage limits and retention logic remain unchanged.

The EIO regression checks that the exact failed nonce is gone, the previous receipt is unchanged and EIO was attempted once. It verifies the independent progress temporary's actual filename, owner PID, workflow, session nonce and unchanged contents while that writer is held. It releases the progress write, verifies successful registration recovers the baseline/content/recovered owned namespaces, stops all writers and requires zero remaining temporaries. The Windows transient-lock case also checks the final global inventory after completion while retaining previous-receipt and bounded-retry assertions.

No wildcard cleanup, unrelated deletion, ownership relaxation or raised retry limit was added. The deterministic concurrent writer remains in the regression. All 34 test declarations and surrounding coverage are preserved.

Automatic review rejected an earlier broad edit shape because replacing a suffix could remove later tests. Nothing executed. The applied edit verified and replaced only the exact 16-line original test and preserved surrounding source.

## Verification

- R257: both manifest fault tests pass.
- R258: complete Windows native storage suite, 34/34 pass.
- R260: 20 repetitions of both fault tests, 40/40 pass with a real progress writer held each time.
- R261: 39 Python QA archive/retention tests pass; the existing engine-source index verifies six projects / 36 behaviors and source/license links, with research content hashes not revalidated; 40 native runtime/audio/readback diagnostic tests pass. These diagnostics do not prove new gameplay.
- R259 complete:true: 889 Rust tests pass, nine explicit opt-in tests ignored; TypeScript, 472 frontend tests, three source-module contracts, 59 offline regressions, 38 storage/repository checks and all 255 browser cases pass. Browser repeat took 575,828 ms. This Windows run reproduces the CI commands with the local platform; it does not substitute for hosted Linux. Owned scratch was disposed (3,283,131,866 logical bytes); the monitor observed 3,159,207,456 allocated file bytes at peak, not a global free-space reclamation measurement. The later uncommitted P1 browser test was appended after this runner registered its 255 cases and is not counted.

## Remaining gates

The repaired exact source still needs a hosted Linux rerun after the owner's push. Do not claim CI is green until that job passes. The sealed c035b68 release candidate remains unchanged and excludes this continuation.

P1 already has a reproduced native defect: R255's actual Edit model source tags action opens manual-only text without a direct source-editing action when the source has no tab. Its receipt and failure are retained; no later build or game pass is counted. After local P0 regressions, complete source/tag selection, supported property editing, owner-specific history/Save/restart, stale-binding handling, native rebuild/readback and private Chupathingy loading within existing components.
