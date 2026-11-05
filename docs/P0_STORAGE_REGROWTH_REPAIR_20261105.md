# P0 storage regrowth repair — 5 November 2026

Source checkpoint: local master `0d04cc7`. The owner's cb4f5ad4 directive supersedes earlier cleanup prompts. No push, publication, original game changes, source reset, full repository archive or new SDK tree.

## Measured storage checkpoint

Same unchanged Windows FileStandardInfo.Allocation scanner, same five absolute roots, no followed links, deduplicated volume/file IDs. Sizes are allocated **file content**, excluding filesystem metadata and uncertain shared/compressed extents. Parent/child totals must not be added; hardlinks are deduplicated per subtree.

| Location | Before allocated bytes | After allocated bytes |
| --- | ---: | ---: |
| Canonical repository | 67,607,624,560 (62.96 GiB) | 55,852,134,784 (52.02 GiB) |
| artifacts/qa | 13,920,147,144 | 2,129,793,584 |
| target | 6,549,926,528 | 6,549,947,008 |
| preserved | 31,865,210,080 | 31,865,210,080 |

Net canonical allocation reduction: **11,755,489,776 bytes (10.95 GiB)**, after acceptance workloads and new diagnostics. Observed D: free space increased 11,745,722,368 bytes; volume movement also includes other activity and filesystem overhead. External recovery, user app data, MCC Halo1 and the editing kit have unchanged allocations. Raw scan paths and file IDs remain intact. The second invocation omitted display IDs; its contiguous root blocks were associated through their exact recorded absolute root-summary paths, with no altered allocation values.

Full accounting, every top-level directory, ownership classifications and references: `artifacts/storage-v1/regrowth-repair-20261105/storage-accounting.json`, `remaining-over-40MiB.csv`, `physical-before.jsonl`, `physical-after-storage.jsonl`. The storage checkpoint has480large rows; the final inventory below has487. Small-file collections are included, not hidden behind the threshold.

## Final accounting after resumed C71

The same unchanged scanner, in the original PowerShell7 runtime, finishes with0errors after C71's actual native tests: **55,956,550,104allocated bytes (52.11GiB)**. Net reduction from the original baseline is **11,651,074,456bytes (10.85GiB)**. Final QA allocation is2,224,180,912bytes; target6,549,947,008; preserved31,865,210,080. D: free space is up11,646,332,928bytes from the original reading; that volume-wide movement includes unrelated activity/metadata and is not substituted for the file-allocation measurement.

The104,415,320-byte increase since the storage checkpoint is reviewed engineering evidence: five bounded C71 context runs, the current79,527,766-byte accepted native DCC cache, source/Git changes and metadata inventory. Context runs retain about3MB each and remove every fresh application/library/WebView/extraction tree. The DCC run registers9writers, removes475,571,928logical scratch bytes and retains one validated map plus compact Blender/compiler/readback proof. No SDK tree survives it. This retained output is deliberate, rather than unexplained cumulative staging.

Exact final inventory: `physical-final-accepted.jsonl`, `storage-accounting.json` → `finalEngineeringFollowThrough`, and the updated487-row `remaining-over-40MiB.csv`. The scanner excludes its own live output; subsequently written compact reports/Git commit metadata are outside that timestamp. External-root allocations remain the separately recorded storage-checkpoint measurements, not falsely fresh scans. A .NET Framework whole-root attempt encountered one historical long-path limit and was excluded. Its compact exact error/result/SHA and the superseded intermediate scan are preserved in `superseded-measurements.json`;19,237,731bytes of redundant generated metadata reports were retired after hash/identity checks. No source, map, archive or historical native evidence was removed in that step.

## Deleted and protected

18,008 reviewed files and4,360 empty directories removed: 10,896 exact duplicates (11,442,265,321 logical bytes), plus7,112 inactive test WebView files (415,912,099 logical bytes). Initial hashes, complete preflight and immediate pre-unlink identity/hash checks were used. 1,787 retained providers verified before retirement. The interrupted-admission copy was separately hash-matched to the working application and its45,799,424bytes reclaimed through the existing sealed-scratch path. No deletion from original installations or preservation archives.

Fresh final readback confirms all18,008 planned files absent,5,211 retained historical QA files unchanged, and62 expected ownership/browser-result metadata updates whose original values remain in the audit. All475 requirements remain byte-identical. Exact file journal, provider alternatives and old ownership records are retained in the same bounded local evidence directory; historical QA folders are evidence, not intact user libraries. Retired copies resolve through the provider journal; the current C71 native input and unique output fixtures remain at their exact paths.

preserved retains31,865,210,080allocated bytes, including28,343,646,840in nested recovery archives. The existing index resolves154,539objects through87 backing files; every backing-file length/SHA matched, and no whole backing files are identical. This is backing-file verification, not a new claim of all-object decompression. Overlapping archives cannot be dropped just because some members repeat; unique historical source, prior builds, recovery catalogs, originals and accepted release material stay protected. No new archive was created. The C49 source/installer/portable/manifest checksums still match source cb07581597de.

The shared Cargo cache is6.10GiB: debug/release dependencies plus reusable native helpers. Locked full regressions reused it; its20,480-byte increase is the allocation scanner executable. Local rustup already has the minimal compiler/Cargo/clippy/rustfmt/standard-library components, with no rust-docs component to remove. Repeated cache purges would regenerate these files. Git integrity passes; dangling recovery objects, reflogs, stashes and reachable history were retained without repack or prune. Installed runtimes, pinned research, SDK/examples and registered Invader/Baboon remain. Their individual sizes/purposes are in the inventory.

## Producer repair

Existing native-qa-storage now declares fresh scratch **before** writers start, refuses existing/aliased namespaces, records process ownership, retains only explicitly selected fixtures and cleans declared payloads on pass/failure. Graceful interruption stops only registered children and their Windows process trees. Explicit killed-owner recovery requires matching ownership/lease/nonce and dead writers; unknown/active/replaced/shared data remain protected. Read-only independent tag copies can be reclaimed without changing shared originals. Brief known-live admission contention waits; unknown/interrupted locks are never deleted.

Native lifecycle, native compiler and functionality runners use this path. Executable copies are inside declared scratch, avoiding a45MB orphan when admission is refused. Compiler diagnostics/source recipes and one accepted final map survive; full isolated libraries, compiler tag trees and profiles do not. Native export acceptance now completes source-owned export before opening the built cache as another document; its original failure receipts are preserved.

Configured limits:4GiB maximum QA reservation (1GiB small preview/context,2GiB compiler),16GiB aggregate admission,4GiB free-disk floor,8MiB defined diagnostics plus at most256MiB explicitly retained fixtures per run,1000ms runtime sampling. Cargo/Tauri share one16GiB monitored cache with4GiB admission reserve. No cached admission exemption. A real over-budget writer was stopped and its payload reclaimed; first-build absent output roots are accepted correctly.

Sampling is a stop threshold, **not an OS per-write quota**; native writers can overshoot between samples. Unwrapped tools/shared system caches are not controlled. Legacy standalone harnesses retain global admission protection but do not all have the new live scratch contract; they must be ported before reuse. No automatic eviction of unknown historical evidence or user projects. Total admission/file-count bounds stop further generation rather than silently delete unique evidence. No claim that all future growth is impossible.

## Acceptance

| Actual workload | Allocated start / sampled peak / final | Result |
| --- | --- | --- |
|20real native UI tag edits, Undo/Redo, immediate saves, app restart/recovery, configured export/reuse, independent Invader readback | 45,806,192 / 292,095,408 / 1,888,880 | All5cases pass. Physical samples surround20edits/recovery; the separate logical runtime monitor observed later export peak529,976,330bytes. Sampled physical peak is a lower bound. 206416bytes project growth is acknowledged journal/backup metadata. |
|20separate real Invader edit/readback QA cycles | 0 / 424,960 / 424,960 |14passed,2intentional failures,4killed-owner recoveries. All20temporary tag trees gone; only bounded readback/ownership/measurement receipts remain (<2MiB). Original tag hash unchanged. |
|Two native H1A builds,10unchanged reuse requests, corrupt-save rejection/recovery, valid external edit/reconcile/rebuild/readback | 4,392 / 838,254,272 / 81,035,888 | Helper exit0, native acceptance complete;745,960,883logical scratch bytes reclaimed. Final81MB is the deliberately retained validated map and compact recipes/receipts. |

Rust744passed/9existing opt-in ignored; frontend412passed; browser174passed; offline59/59scripts; storage/continuity20passed; TypeScript and Git diff checks pass. Git fsck passes with existing dangling recovery objects retained. Failure evidence includes the visible-panel locator fix, source/built-document export ordering, read-only copied-tag setup and admission contention; no failed run was relabeled successful.

No fresh Halo gameplay, human hearing, physical two-computer/monitor or clean-machine release acceptance is inferred. No new installer or public release.

## Exact continuation

Storage repair is committed47f5d9d. C71's final bitmap/cubemap/animation contexts now pass: actual MCC edit/history/Invader readback plus read-only CE609 and Xbox5content at both installed OpenCE/Chupathingy locations. An uncovered DCC child-runner gap was repaired within the existing lifecycle harness and verified through real Blender/H1A compilation/independent readback. See OVERNIGHT_ENGINEERING_20261105.md and fixtures/c71-native-contexts.json. All25preserved directives04–28 were reviewed without marking them implemented. Remaining C71asset-class authoring and combined object/behavior→Halo→independent GUI acceptance stay open; human/game/peer/platform/release gates are not waived. All475requirements remain byte-identical. Local commits only; no push or publication.
