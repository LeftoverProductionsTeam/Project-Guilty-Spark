# Unified P0 storage cleanup — November 5, 2026

**Part 1 cleanup, final inventory and scoped automated/native checks are complete. The local revision is the commit containing this report.** This report does not accept Part 2, C70, human gameplay or a release. No push or publication is authorized.

The work starts from canonical local `master`, `55e8256a374aa3ddd47c7a16cefe0dc126ce92fd`, under the owner's preserved-consolidation directive and subsequent unified Part 1 directive. Full instructions are retained in [the preserved-consolidation receipt](../artifacts/storage-v1/preserved-consolidation-20261105/directive.txt) and [Part 1](../artifacts/storage-v1/unified-purge-20261105/directive-part1.txt). [Part 2](../artifacts/storage-v1/unified-purge-20261105/directive-part2.txt) waits for the Part 1 preservation and native-integrity gates. No branch, worktree, full repository snapshot, SDK extraction, download, installation, push or publication was introduced by this consolidation.

## Actual completed preservation and removal

The exact reviewed native plan is [preserved-consolidation-plan.json](../artifacts/storage-v1/preserved-consolidation-20261105/retirement-plan/preserved-consolidation-plan.json), SHA-256 `9b2bca1c225b833e2a9540f7d127ef04b79b323953552c76f73a9b60e3c38328`. Its [actual completion receipt](../artifacts/storage-v1/preserved-consolidation-20261105/retirement-apply/immutable-purge-receipt.json), SHA-256 `ff3dcd408a0cb19e003568780976559cf220a2d71efed40e0ec56b9e989988ac`, records:

- **18,826 exact redundant source files removed**, with 21,778,605,715 logical bytes and **21,813,688,368 allocated file bytes released**.
- All **35 selected retained containers** were sealed and freshly hashed through deletion. Source hashes, native identities, timestamps and provider proofs were checked before removal; deletion used the same native file handle. No directory was removed by this plan.
- Two complete duplicate ZIPs accounted for 2,121,044,516 logical bytes. Two incomplete ZIPs were proven exact byte prefixes of retained complete ZIPs and accounted for 1,550,335,570 bytes. Their exact original bytes remain recoverable through pinned raw/range providers.
- Raw native-tag, immutable-asset and development-binary copies were replaced by verified references to existing compressed providers or the bounded new object volumes. Source ownership markers, catalogs, manifests, receipts and journals remain physically named where existing consumers require them.

The copy-only preparation sealed **3,428 unique objects / 10,888,500,831 raw bytes** into 11 standard DEFLATE ZIP volumes totaling **3,496,417,410 compressed bytes**. Every new payload was independently read back with size, SHA-256 and CRC checks before adoption. The writer used the existing retention policy: bounded volume input, 8 GiB maximum new compressed storage, global headroom, minimum free space and exclusive owned admission lock. Original sources remained intact until the separately reviewed native removal plan. There was no full SDK or full repository archive.

The pinned [preservation index](../preserved/recovery-metadata/preservation-index.json), SHA-256 `8bf7c7a38218239620fd40a5aaf1f531f94db5686e8f20c606eb774d20b870b1`, maps **154,539 objects**, original aliases and eight legacy vault catalogs. Its [verification aggregate](../artifacts/storage-v1/preserved-consolidation-20261105/provider-verification-aggregate.json), SHA-256 `77466b877267128aba760bcec0747ca96ab18093ef2b0ab41b890d1487dfd5ba`, combines two bounded actual readback batches; it does not weaken the per-batch limit or claim another decompression pass during merge.

Independent [source-absence verification](../artifacts/storage-v1/preserved-consolidation-20261105/dedup-post-retirement-check.json) accounts for all 18,826 source paths, with none remaining unexpectedly. Independent [post-retirement provider closure](../artifacts/storage-v1/preserved-consolidation-20261105/intake-post-retirement-closure.json) confirms all **87 index backing files**, all **35 selected unchanged container identities**, eight original named catalogs and the three live ownership markers remain present. This closure reused the prior full payload proof instead of rereading huge payloads. The obsolete repository `.local` remains absent.

The live 116-byte `development-builds/ownership.json` was identified during independent review and removed from the proposed deletion list before approval. Its consumers still require it. That correction is preserved in [owner-marker-review.json](../artifacts/storage-v1/preserved-consolidation-20261105/owner-marker-review.json).

## Measured consolidation result and unified baseline

These are native file-data allocation measurements, deduplicated by volume/file identity. They exclude directory-index/MFT overhead and do not predict shared-extent reclaimability. No-follow traversal skips junction/symlink targets; recognized cloud placeholders receive metadata-only inspection without file-payload hydration. The genuine [junction fixture](../artifacts/storage-v1/unified-purge-20261105/physical-audit-fixture-acceptance.json) passed and its external sentinel remained unchanged.

| Preserved store measurement | Before consolidation | After consolidation, before broader cleanup |
| --- | ---: | ---: |
| Logical file bytes | 49,972,475,387 | 31,755,980,704 |
| Unique allocated file bytes | 50,007,757,400 | 31,756,221,744 |
| Ordinary file entries | 18,935 | 135 |

The measured net reduction inside `preserved` at that checkpoint was **18,216,494,683 logical bytes** and **18,251,535,656 allocated file bytes** after retaining the new compressed objects, indexes, receipts and restored tags. This net measurement is distinct from the gross native deletion receipt. The final snapshot below also includes subsequent recovery proof files and validation output.

The [complete native baseline](../artifacts/storage-v1/unified-purge-20261105/physical-inventory-before-broad-cleanup.jsonl), [HCEEK supplement](../artifacts/storage-v1/unified-purge-20261105/physical-inventory-editing-kit.jsonl) and [classified summary](../artifacts/storage-v1/unified-purge-20261105/physical-inventory-baseline-summary.json) enumerate **194 individual files, 210 directories and 50 collections of smaller files above 40 MiB** across the explicit roots. Every matching row includes purpose/ownership, classification and source references. Zero metadata errors occurred. The exact actively written audit output was excluded from its own scan; later reports, tests and builds change final figures.

| Explicit measured root | File entries | Logical bytes | Unique allocated file bytes | Ownership/classification |
| --- | ---: | ---: | ---: | --- |
| Canonical repository | 105,012 | 54,872,355,038 | 54,239,703,248 | Mixed protected source, tools, runtimes, evidence and generated output |
| External `GS/P0-Recovery-20261104` | 408 | 1,107,262,528 | 1,108,058,896 | Original recovery records/source snapshots/journals; protected |
| Real `studio.guiltyspark.editor` AppData | 11,338 | 1,706,271,285 | 1,728,699,408 | Active user projects, database/WAL, jobs and settings; read-only/protected |
| Installed MCC `halo1` | 423 | 10,297,827,052 | 10,298,970,168 | Required original runtime/resources and existing authorized outputs; read-only |
| Installed official `HCEEK` | 33 | 1,073,664,536 | 1,073,718,560 | Original required SDK/tool input; read-only, no extraction |

That baseline canonical root contained 24,418 multi-link entries. Its entry-level allocation sum was 819,070,712 bytes larger than its unique total. Subtree figures can overlap through hardlinks and must not be added blindly. The full inventories retain both logical and unique-allocation fields.

## Final physical inventory after reviewed cleanup and validation

The unchanged native scanner measured the same five explicit roots after cleanup. [The complete final inventory](../artifacts/storage-v1/unified-purge-20261105/physical-inventory-after-cleanup.jsonl) and [final classified summary](../artifacts/storage-v1/unified-purge-20261105/physical-inventory-after-cleanup-summary.json) retain **190 individual files, 210 directories and 45 collections of smaller files above 40 MiB**, with zero metadata errors. The original baseline remains intact. All 267 remaining directory reparse entries are dependency links whose targets were not traversed.

| Root | Baseline allocated file bytes | Final allocated file bytes | Net reduction |
| --- | ---: | ---: | ---: |
| Canonical repository | 54,239,703,248 | **50,710,752,904** | **3,528,950,344** |
| External `GS/P0-Recovery-20261104` | 1,108,058,896 | 1,108,058,896 | 0 |
| Real editor AppData | 1,728,699,408 | 1,728,699,408 | 0 |
| Installed MCC `halo1` | 10,298,970,168 | 10,298,970,168 | 0 |
| Official `HCEEK` | 1,073,718,560 | 1,073,718,560 | 0 |

The final canonical snapshot has **100,322 file entries and 51,211,864,317 logical bytes**, a further net logical reduction of **3,660,490,721 bytes** from the post-consolidation baseline. These whole-root differences include subsequent accepted validation output; they are not a sum of gross deletion receipts. The earlier preserved-store comparison covers its preceding consolidation phase and must not be relabeled as a measured whole-repository starting allocation. The final preserved subtree is 31,756,182,622 logical / 31,756,427,280 allocated file bytes across 138 files.

All four explicitly measured external roots have identical before/after file counts, logical bytes and allocations. No bloat was moved into them to produce the canonical reduction. The scan excludes its own active output; the small final summary/report and eventual Git commit are written after this snapshot.

## Every remaining top-level canonical directory at the final snapshot

All nested files/directories over 40 MiB and the large small-file collections are linked in the complete classified inventory above; this table records every top-level directory, including the smaller ones.

| Directory | Unique allocated file bytes within subtree | Classification and current disposition |
| --- | ---: | --- |
| `preserved` | 31,756,427,280 | Unique originals/recovery; pinned compressed providers and named metadata retained |
| `artifacts` | 2,612,236,768 | Retained unique receipts/projects and final accepted validation output; exact scratch removed |
| `chupathingyce-windows64-release` | 2,533,773,960 | Existing runtime and game resources, referenced by runtime discovery; retain |
| `.toolchain` | 2,055,546,792 | Required current Rust toolchain and offline dependency stores; retain |
| `opencehalo-windows-release` | 1,886,278,392 | Existing runtime and game resources, referenced by runtime discovery; retain |
| `target` | 1,627,870,704 | Supported Cargo development-profile clean complete; release app and reusable release cache retained |
| `.git` | 834,708,728 | History/refs/reflogs/stash/recovery objects; untouched and retained |
| `releases` | 751,010,008 | Accepted previous-good C49 release/source deliverables; protected |
| `Pyros Zombie Apocolypse Mod Versions` | 750,432,472 | Original owner-supplied maps/resources/provenance; protected |
| `SAMPLE CODE` | 713,332,488 | Owner-supplied reference corpus with separate provenance constraints; protected, not incorporated by this cleanup |
| `tools` | 601,136,424 | Registered local native Invader/Baboon tools; retain |
| `Halo Custom Edition` | 471,072,448 | Existing original runtime/game data; retain |
| `node_modules` | 359,631,680 | Current locked frontend dependencies; hardlink-aware, retain |
| `.research` | 297,605,800 | Upstream and engineering research/source history; protected |
| `docs` | 35,173,880 | Requirements, research, acceptance and provenance records; protected |
| `src` | 4,393,280 | Canonical frontend source; protected |
| `dist` | 3,635,696 | Small reproducible frontend output used by current build; no broad cleanup needed |
| `crates` | 3,206,128 | Canonical Rust source/tests/data; protected |
| `scripts` | 2,840,216 | Canonical build/validation/recovery entrypoints; protected |
| `src-tauri` | 2,057,704 | Canonical native app source/configuration; protected |
| `test-results` | 1,871,920 | Small generated results/evidence; exact review only |
| `tests` | 388,600 | Canonical tests; protected |
| `public` | 328,200 | Canonical product assets; protected |
| `.github` | 58,304 | Repository workflows/configuration; protected |
| `examples` | 20,480 | Canonical examples; protected |
| `reports` | 4,096 | Small retained report; protected |

## Required retention, remaining candidates and references

The historical archives retain unique content despite partial overlap. Their 122,631 unique object hashes need providers; the 7,053,035,723 compressed bytes of theoretical member overlap cannot be counted as removed without another proven transformation. No raw compressed ZIP repacker was added or run. Original catalog/hash bytes remain unchanged. Raw, ZIP-member and range restoration uses the explicit pinned index and fresh independent destinations; it never recreates the obsolete `.local` namespace or overwrites source.

The [Git/toolchain audit](../artifacts/storage-v1/unified-purge-20261105/git-toolchain-audit.md) found one canonical worktree, 17 refs and 6,514 loose objects. `git fsck --full --unreachable` passed. All 24 sealed protected metadata files and the complete object-ID set remained identical in [the final unchanged check](../artifacts/storage-v1/unified-purge-20261105/git-after-rejection-unchanged.json). Unreachable objects remain protected recovery/history; no pruning, expiry, GC, ref mutation or history rewrite occurred.

**Automatic approval review rejected the proposed mutating Git repack before execution**, citing its pack deletion and object-loss risk despite ref preservation. The root agent retained all Git storage and prohibited a workaround. The baseline 834,708,728 allocated Git bytes therefore remains valid; no repack saving is claimed.

The current project-local stable Rust toolchain and locked Cargo/pnpm dependencies are genuine build inputs. Rust documentation, rustup downloads/tmp and both incremental directories were already empty. Only three older Cargo dependency versions are absent from the current lock, totaling 5,499,127 compressed archive bytes; they remain legitimate historical offline inputs. The 53 debug probes had tracked canonical sources and dependency files, with no obsolete `.local` source reference. Following full regressions and native validation, the supported Cargo development-profile clean completed successfully: [actual log](../artifacts/storage-v1/unified-purge-20261105/cargo-clean-dev-actual.log), **4,653 files / rounded 3.5 GiB**. That rounded CLI summary is not represented as an exact physical byte count. `target` allocation decreased from 5,268,854,848 to 1,627,870,704 bytes. The current release app remains SHA-256 `43888167d87db1251fb020426283114cb0daf117ca8627a2e5b90f9b4758033e`; its profile was not cleaned. Source-backed debug probes can be rebuilt for future trials.

Two pnpm project-registration junctions pointed to removed historical worktrees. No current source referenced their registration names. Their opaque reparse data was retained, and the two exact link objects plus the audit fixture junction were removed nonrecursively: [actual three-link receipt](../artifacts/storage-v1/unified-purge-20261105/reviewed-junction-removal-receipt.json). No target was traversed, no ordinary file was deleted by this action, and the external fixture sentinel remained unchanged. Exact paths/targets remain in the audit and receipt. The active pnpm store was retained.

The QA root's 2,033,879,248 allocated bytes mix copied maps with mutable projects, SQLite/Undo histories, failed/successful receipts and screenshots. It cannot be discarded as a whole. The [exact QA candidate report](../artifacts/storage-v1/unified-purge-20261105/qa-disposable-readonly-candidates.json), SHA-256 `81404861c9e9d6cde22b22f17413a9c446e0f5dbb18ae1403d61ab8348d798df`, narrows review to:

- 24 generated WebView `Default/Cache`, `Code Cache` and `GPUCache` trees: 371 files, 68,758,712 allocated bytes.
- Two post-cleanup copied app executables proven byte-identical to the protected current app: 90,857,472 allocated bytes.

The separately reviewed [actual QA disposal receipt](../artifacts/storage-v1/unified-purge-20261105/qa-reviewed-disposal-final/disposal-receipt.json) confirms **26 targets / 373 files / 159,276,285 logical bytes / 159,616,184 allocated file bytes removed**. It also accounts for the 24 cache roots and 72 internal empty directories; zero whole run directories were removed. Eight run receipts match their original executable hashes and the known native harness. The original [process snapshot](../artifacts/storage-v1/unified-purge-20261105/qa-readonly-quiescence.json) was followed by fresh actual-disposal checks and exact unchanged seals. Acceptance/harness hashes and the authoritative current app remained unchanged. Six older differing app copies remain protected. Library caches, projects, source tags/maps, journals, LocalStorage/IndexedDB/settings and all evidence were excluded.

No additional large reproducible-but-unreferenced directory was established by this read-only review. Generated classification alone is not deletion proof. The development output was cleaned through Cargo and the exact QA scratch subset was removed; remaining release cache and mixed QA evidence have current build/recovery uses. The installed runtimes, official SDK archive, original corpora and retained recovery containers are not spare copies merely because they are large or ignored.

## Source, originals and recovery evidence

The prior [critical preservation audit](<C:/Users/patri/OneDrive/Documents/ChatGPT/GS/P0-Recovery-20261104/critical-preservation-final-audit.json>) records all 18 original unfinished C70 source snapshots, all 67 Zombie originals (750,272,565 bytes), all 100 retained release files (750,809,520 bytes) and the three critical accepted/native cache hashes. The new [final protected-originals audit](../artifacts/storage-v1/unified-purge-20261105/protected-originals-final.json) performed **fresh full payload hashing after cleanup**: all 18 canonical C70 source files match the prior accepted P0 state, all 67 Zombie originals and all 100 release files remain byte-identical, and the preservation index remains SHA-256 `8bf7c7a38218239620fd40a5aaf1f531f94db5686e8f20c606eb774d20b870b1`, with zero errors. The original snapshots remain separate recovery records; three intentional repairs made during the earlier P0 remain preserved rather than described as unchanged from the original intake. All three critical native caches retain pinned provider coverage. The historical audit's former raw blob paths are provenance, not current required raw-copy locations.

The accepted C49 preview remains version 0.4.1 from `cb07581597de11e83d1c10bafad526e8b031f27e`. The final audit freshly rehashed **all 100 retained release files**, not only their metadata. Its named C49 manifest SHA-256 `c00f7afc9b1d57963bbe0234ef4c3c992a574136a27cbf34dca83354fe2a0b52` also matches the retained checksum file; installer, portable and exact-source checksum entries agree with the manifest. No newer source is represented as shipped by C49 and no release was republished.

Actual recovery proof includes the C63 accepted door cache and two real native tags restored through pinned providers, independent native readback before removal, and the repaired real CLI restoring two missing ZIP-backed tags into a fresh Unicode destination after removal. **Post-cleanup installed Invader readback passed again:** the restored C63 cache has CRC mismatch **0**, and the two sound-tag readers return maximum distance **5**. A preserved historical C59 map project reopened through native Rust readers with four intact snapshots and acknowledged Undo/Redo revision **17 → 19**. Original catalogs/source histories were not rewritten to make the tests pass.

The existing recovery tools were extended rather than replaced: provider identity/hash checks, fresh destinations, standard ZIP compatibility, safe historical path mapping and UTF-8 subprocess requests. Focused Python recovery/sealing/merge tests passed **39/39**. Genuine combined Node consumer tests passed **15**, with zero failures and one unrelated opt-in native-retirement test skipped. The guarded native retirement focused tests passed **19/19**. The prior Python-unavailable result is historical: an already installed Blender Python 3.13.13 was used explicitly, with no installation or system setting change.

## Final regression/native checks and remaining review

Current Part 1 evidence records the following completed gates. The local revision is identified by the commit containing this report:

| Gate | Current status in this draft |
| --- | --- |
| Preserved exact removal and provider/source closure | Passed; actual receipts and independent checks linked above |
| Whole-repository final inventory and final physical/logical totals | Passed for the five explicit roots; snapshots and complete large-location classifications linked above |
| Exact QA cache/app-copy removal and empty-directory accounting | Passed; actual 26-target receipt, 373 ordinary files and bounded internal empty-directory accounting |
| Supported development-profile clean | Passed through Cargo after validation; release executable/profile retained |
| Full Rust/frontend/browser regressions and current builds | Rust 722 passed / zero failed / nine ignored in 49 result summaries; frontend 400 passed; browser 164 passed; offline 59 passed; frontend build passed |
| Existing storage/provider Node regressions | 66 passed / zero failed / four skipped; separate focused provider/retirement evidence above also retained |
| Actual Windows app startup, native editing, Undo/Redo and save/readback | Passed two actual native-app cases: owned BSP rendering, tag edit/Undo/Redo/Save and independent native reopening/readback; no mock IPC |
| Native compiler fixture and independent readback | Passed small actual model compilation, installed Invader comparison and full exposed native-field readback; source unchanged |
| Protected-original/release/provider restoration checks | Fresh full hashes: 18 C70 source files unchanged from prior P0, all 67 Zombie originals / 750,272,565 bytes and all 100 release files / 750,809,520 bytes unchanged; all three critical cache providers covered; restored C63 CRC mismatch 0, two sound-tag distance-5 readbacks and historical project recovery passed; independent provider closure passed |
| Local verified commit and clean expected source state | Completed by the local commit containing this report; no push or publication authorized |

Current logs: [Rust](../artifacts/storage-v1/unified-purge-20261105/rust-regressions.log), [frontend](../artifacts/storage-v1/unified-purge-20261105/frontend-regressions-actual.log), [browser](../artifacts/storage-v1/unified-purge-20261105/browser-regressions.log), [offline](../artifacts/storage-v1/unified-purge-20261105/offline-regressions.log), [frontend build](../artifacts/storage-v1/unified-purge-20261105/frontend-build.log), [storage Node tests](../artifacts/storage-v1/unified-purge-20261105/storage-node-regressions.log) and [actual native app](../artifacts/storage-v1/unified-purge-20261105/native-app-regressions.log).

The current native app opened the owned MCC map with 5,503 visible BSP triangles, 68 object-model types, 186 objects and eight authored decals. Its material queue settled with 159 source shader bindings, 15 lightmaps, 237 detail bindings, 73 reflection bindings/11 cubes, no pending material work and no reflection issue. A real tag edit exported radius 0.225, independently reopened by Invader with the original map SHA unchanged. The direct cache edit correctly reports `compilerRan=false`; no new full map build or engine-rendering parity is inferred.

The separate [actual native compiler verification](../artifacts/qa/unified-purge-model-compile-accepted/native-verification.json) compiled three vertices/one triangle into a standard model tag with one node/geometry. Installed Invader matched the full exposed native fields. The compiler output is **not byte-identical** to an earlier fixture: checksum bytes and two unexposed bytes differ. Exact object recovery still requires exact SHA identity; this compiler acceptance instead records independent native comparison and full known-field equality. Earlier incorrect harness path/hash assumptions remain in the logs. This is native model compilation, not map compilation, audible playback or gameplay.

Part 2 and C70 are not accepted by storage intake, preservation, this report or a local commit. Human gameplay, real peer networking, physical monitor acceptance, specialist DCC round trips and clean-machine/platform release gates retain their existing independent limits.
