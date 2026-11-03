# C62 — Verified storage reclamation and recoverable native QA

Continues local master from `7e684a040a91a50dae8bd79e99ef0b53895fc2dc` (C61). The supplied C51 checkpoint was historical. All four worktrees and every pre-existing branch/tag are preserved, including the separate dirty C41 checkout. The 472-row feature ledger is unchanged. Original installations, maps, unique research and accepted release files remain protected.

## Final storage result

**The complete measured footprint is 95.21 GiB, including all recovery archives and new QA evidence.** The first completed pass left 218.59 GiB; the deeper pass removes another **123.37 GiB net**. Compared conservatively with the initial 314.67 GiB area, the final reduction is **219.46 GiB**. This charges all new evidence to the cleanup and does not count the earlier C49/C61 reclamation again.

The comparable scans exclude only `.local/c62-safe-cleanup-20261103`, where the new audit and acceptance runs live. Both skip 721 junctions/reparse points, use extended Windows paths, deduplicate hardlinks by volume/file identity and read `FileStandardInfo.AllocationSize`. Both finish with zero errors. File allocation can be shared with links elsewhere; this is not a claim of exclusive-drive usage.

| Measured area          |          Before | Final comparable area |                    Reduction |
| ---------------------- | --------------: | --------------------: | ---------------------------: |
| Logical bytes          | 337,889,724,946 |        97,740,986,101 |              240,148,738,845 |
| Unique allocated bytes | 337,878,053,296 |        97,714,930,704 | 240,163,122,592 (223.67 GiB) |
| Regular file names     |         858,395 |               438,176 |                      420,219 |

New evidence adds **4,519,055,400 allocated bytes (4.21 GiB)**, giving **102,233,986,104 allocated bytes (95.21 GiB / 102.23 decimal GB)** overall. Temporary validation compiler output is gone; logs, the current embedded executable and successful native runs remain. These are timestamped measurements; small later documentation and Git metadata add overhead. The private first-pass reports and every failed attempt remain preserved.

## What was reclaimed

Ignored compiler dependency/build/fingerprint intermediates account for **18,282 files and 32,179,961,734 logical bytes**. Paths, exclusions, stable metadata, owners, absence of native project data and preserved executable hashes were checked before removal. A further **4,618,615,270 bytes** of newly created validation intermediates were removed after testing; they are not counted as original reclaimed storage.

Historical data uses five private, verified C49-format vaults under `D:/Project Guilty Spark/.local/archives`:

| Vault                         | Expanded copies removed, logical bytes | ZIP volume bytes | Actual recovery proved                                                          |
| ----------------------------- | -------------------------------------: | ---------------: | ------------------------------------------------------------------------------- |
| `C62-cold-native-copies`      |                         79,349,583,113 |    2,121,044,516 | Native map, OpenCE executable, configuration, save                              |
| `C62-expanded-cold-history`   |                        114,256,980,542 |    8,401,444,709 | Map, executable, configuration, inherited save, compiled BSP, native weapon tag |
| `C62-legacy-launch-libraries` |                         12,420,199,450 |      778,375,278 | CE map, executable, configuration, native weapon tag                            |
| `C62-cold-debug-symbols`      |       6,363,586,560 original PDB bytes |    1,215,073,288 | Three PDBs and a runnable diagnostic executable                                 |
| `C62-surplus-current-qa`      |                         10,012,297,194 |      492,484,980 | Source map, application, project document, native save                          |

All unique archive members and complete volumes are read back and hashed. Restores create independent regular files. A final resolved-path/size/time/full-hash check precedes each unlink; changed/newer files remain expanded. No such changes were encountered in these selected copies. Exact catalog identities, counts and restore results are in the [metadata receipt](fixtures/c62-safe-cleanup.json).

The larger historical vault contains **340,983 file records**, including **75,034,915,292 bytes already absent** from an earlier verified snapshot. It carries its own verified payloads, so a selected historical run can be restored without the earlier vault. Those inherited bytes are **not counted a second time** as removed. The earlier archive remains unchanged. Debug-symbol staging and fresh restoration probes are also excluded from original-reclamation arithmetic.

All **48 diagnostic executables** remain expanded, unchanged and runnable (**285,809,152 bytes**). Their 48 historical PDBs are recoverable from the symbol vault; its mapping and restore instructions are retained. No executable is removed merely because its symbols are archived.

## What stays protected

- **5,977** tracked and unique nonignored source files across four worktrees were baselined. Only the deliberately changed master files differ; no source is missing. Other worktree statuses are compared with `--untracked-files=all`, preserving the dirty C41 checkout exactly.
- **323** original runtime/mod/old-archive files (**24,702,292,247 bytes**) retain their hashes. All **67** original Zombie Apocalypse files also match the earlier C49 baseline. The Xbox image and installed CE/OpenCE/Chupathingy files stay present.
- **11,538** canonical SDK tags retain their hashes. Accepted C55 assets, C57 Workshop source/output, C61 shared Workshop and relevant gameplay fixtures remain expanded. Older experimental trees, source changes, configs and failure evidence are archived byte-for-byte or left untouched. Ambiguous sources, pinned research and folders containing worktrees/reparse points are excluded from broad selection.
- The C61 executable remains **42,968,064 bytes**, SHA **`d5aa90b439e7663315b213156ced095f5d3e9b5b09917534f400f7683ed9f5d9`**. All five sealed C49 0.4.1 release files and the upload-ready bundle remain unchanged. The sealed source ZIP passes all-entry CRC checks and four independent source-file restores.
- No Git object, branch, worktree, tag, original installation or unfinished feature requirement is pruned. Archived historical scripts may need their selected inputs restored before rerunning.

## Maintained tooling and demonstrated improvement

The existing verified C49 archive implementation and bounded Node hash worker are maintained in `scripts/maintenance/`; original C49 helpers remain unchanged. Schema 1 is retained. Preparation never deletes sources; an explicit real-restore proof gates removal. Nested worktree source is refused. A seed merge preserves missing historical children while keeping current changed files authoritative. Real long-path prepare/restore/finish tests pass.

Catalog metadata validation previously resolved every record repeatedly, including already absent files. For the same **1,000 rows over three trials**, its median falls from **574.43 ms to 9.27 ms**. Actual filesystem reads, restoration destinations and present sources still resolve their paths; payload/volume verification and final unlink checks remain. This is an archive-metadata microbenchmark, **not** an application startup/rendering or complete cleanup-speed claim.

Read-only retention advice defaults to two recent successes and four failures per workflow, with seven-/thirty-day review thresholds and an **80 GiB reviewed-QA warning**. Active, incomplete, unknown, canonical and accepted fixtures stay protected. Two native Workshop harnesses record revision, dirty state, exact harness/application identity, owner, outcome and output size. No automatic deletion or writable hardlink sharing is introduced. Not every historical one-off harness is instrumented. See [operating instructions](LOCAL_STORAGE.md).

One redundant Inspector CSS declaration is removed because an equally specific later `margin` rule already superseded it. Effective layout is unchanged. The old native OBJ harness now uses existing drawer navigation and acknowledges direct native imports through the existing authoritative history, matching the frontend workflow. Its UI-only invocation explicitly reports that no compiler was invoked. No production import workaround, test weakening, dependency removal or native-command deletion is introduced.

## Regression and native acceptance

Full offline, locked Rust workspace tests: **666 passed, eight opt-in ignored**. Frontend **366**, browser **157**, offline programs **59**, native diagnostic tests **37**, archive contracts **17**, storage contract **one**, package contracts **10** and draft contracts **six** pass. Failed attempts are retained and distinguished from successful acceptance.

The archive and storage contracts are added to both existing Windows and Linux CI jobs using the already pinned Python setup action. Local Windows execution passes; remote CI and Linux execution of these new steps are not claimed.

Native checks cover OBJ import, floor/support snapping with Undo/Redo, reopen, eight window/lifecycle workflows and four real three-process rollover/recovery cases on one computer. After the deeper cleanup, all three protected accepted native caches retain exact hashes and produce identical geometry/collision parser results. The actual looping-audio dependencies and safe sound-class audit also produce identical readback. Retained diagnostic programs run successfully without their expanded PDBs.

Current-source embedded development executable: `.local/c62-safe-cleanup-20261103/GuiltySpark-C62-embedded.exe`, **42,968,064 bytes**, SHA **`861c7835afda103769f16d0c0c6371bb684089183b5cefaf7045e081b7851fd9`**. It passes native Inspector/rendering/Undo at three window sizes and an actual three-process shared-BSP build: frozen revision **247** compiles while revision **248** is edited. Cache 13 contains **58 collision triangles, two portals and 2,239 tags**, **88,880,670 bytes**, SHA **`f94cbbbbf0643fb5accb2211f5930273e547891e48c1617ec285b706d8ca4b1e`**, matching the earlier accepted cache. Build duration **80.946 seconds** is not a comparable performance benchmark. Host death, two offline UI edits, authoritative recovery/rollover, Radmin-interface convergence on this machine and revoked-peer refusal pass.

Earlier rejected bundle-identity and development-context builds remain diagnostic evidence. The accepted current embedded build uses the pinned dependency's `tauri/custom-protocol` feature. It is a development validation output, **not a new installer or portable release**.

## Remaining footprint and open gates

The remaining **26.55 GiB of private archives** preserves historical snapshots and proprietary owned content. Other large retained groups include C55 canonical/accepted assets, C61 current Workshop/gameplay evidence, original/runtime files, pinned engine research, the offline toolchain and accepted Workshop/audio source/output. These have source, acceptance or recovery value. The ranked final inventory is retained privately. This pass does not claim that every remaining byte is irreducible.

Human audio listening, two-way Timberland–Sidewinder traversal, complete AI/death/score/rejoin parity, arbitrary live BSP replacement, direct structural compiled-map editing, separate-computer networking and platform/public-release acceptance remain open. Three editor processes are not three game peers or three computers.

No remote push, force push, publication, repository-rule change or public-tag rewrite is attempted. Local master remains the working branch; the owner pushes/uploads. The sealed C49 candidate remains the release handoff.
