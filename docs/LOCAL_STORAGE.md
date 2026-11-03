# Local development storage

## Current checkpoint: C62

The fresh November 3 inventory starts at **314.68 GiB logical / 314.67 GiB allocated**. After the first complete pass left **218.59 GiB including evidence**, the deeper pass reduces the full measured footprint to **95.21 GiB (102.23 decimal GB), including recovery archives and new QA evidence**. The conservative net reduction from the initial area is **219.46 GiB**. The comparable area alone is **91.03 GiB logical / 91.00 GiB allocated**, plus **4.21 GiB** of new evidence. Windows allocation is deduplicated by volume/file identity; 721 reparse points are skipped and both comparable scans have zero errors. External hardlinks can share allocation. Timestamped scans exclude small later documentation/Git metadata. See [the audit and exact arithmetic](CONTINUATION_62_SAFE_CLEANUP.md).

All four worktrees, the dirty C41 source, original installed runtimes/maps, original Zombie Apocalypse files, canonical SDK input, accepted native cache outputs, diagnostic executables and the sealed C49 release remain protected. Historical C49 receipts are retained as history; their reclaimed bytes are not counted again in C62.

### Reuse the verified archive workflow

The C49 schema and bounded hash worker are now maintained under `scripts/maintenance/`. Existing private C49 restore helpers remain unchanged. The maintained helper has three explicit steps: `prepare` never deletes source data; `prove-restore` creates independent real restored files; `finish` removes only the still-identical expanded copies after verifying the recovery proof. Changed/newer files stay expanded. It refuses worktree source, links, traversal, missing proof, changed archive volumes and modified restored samples.

Run from the master worktree, with an explicit owning workspace and reviewed nonoverlapping relative roots in a JSON array:

```powershell
python -B scripts/maintenance/qa-vault.py --workspace "D:/Project Guilty Spark" prepare plan.json "D:/Project Guilty Spark/.local/archives/NAME"
python -B scripts/maintenance/qa-vault.py --workspace "D:/Project Guilty Spark" prove-restore "D:/Project Guilty Spark/.local/archives/NAME" "D:/Project Guilty Spark/.local/restore-proof-NAME" ".local/TRIAL/maps/level.map" ".local/TRIAL/halo.exe" ".local/TRIAL/config.toml"
# Check the owning processes have stopped before explicitly finishing.
python -B scripts/maintenance/qa-vault.py --workspace "D:/Project Guilty Spark" finish "D:/Project Guilty Spark/.local/archives/NAME" --confirm-inactive
python -B scripts/maintenance/qa-vault.py --workspace "D:/Project Guilty Spark" restore "D:/Project Guilty Spark/.local/archives/NAME" --only ".local/TRIAL"
```

Select actual exact sample paths from that archive's catalog, including a map, executable and configuration where present. Do not replace an active project or installation with an archived copy. Keep proof files until `finish` succeeds. `.ARCHIVED.json` notes identify the vault; restore only historical inputs needed before rerunning an old script. C62's five vaults are `C62-cold-native-copies`, `C62-expanded-cold-history`, `C62-legacy-launch-libraries`, `C62-cold-debug-symbols` and `C62-surplus-current-qa`, under `D:/Project Guilty Spark/.local/archives`. Each includes the final maintained `qa-vault-C62-final.py` and its hash worker for independent recovery. They contain owned proprietary content and must never be uploaded or included in a public package.

For an explicitly reviewed larger historical snapshot, `prepare ... --seed OLD_VAULT --merge-seed-catalog` copies and verifies the earlier payloads, merging only selected absent records. Current files win. The resulting selected snapshot is self-contained; inherited absent bytes are recorded and never counted again as newly reclaimed. Older vaults remain unchanged. Restore a whole old run when its native project references multiple archived inputs; copying just a project descriptor does not recover those dependencies.

### Keep future QA bounded

`scripts/maintenance/retention-policy.json` configures two recent successful runs and four failed runs per workflow, with seven-day and thirty-day archive-review thresholds respectively. Active, incomplete, unknown and protected fixtures stay retained. These are **review suggestions**, never permission to delete by age. The read-only `retention <manifests.json>` command consumes an explicit array of owner manifests and reports budget warnings; it cannot prune anything. Default warnings are 4 GiB per run, **80 GiB of reviewed QA data** and less than 20 GiB free.

The native Workshop-object and three-process Workshop harnesses record source commit, dirty-source state, exact harness/application hashes, owning PID, outcome and actual logical output size in their fresh private run directories. They emit free-space/output warnings without changing source fixtures or compiler behavior. Existing one-off historical harnesses are not all instrumented; their inputs still require ownership review. Immutable SDK tags, publisher binaries and accepted caches remain separate from each run's writable copies. Archive content deduplication never creates writable hardlinks.

Full Rust cleanup validation uses an isolated target with debug symbols and incremental compilation disabled; logs and native evidence remain while verified disposable intermediates are removed after all owners exit. Do not sweep `target/debug/examples`: all **48 diagnostic executables remain expanded and unchanged**. Their 48 historical PDBs are preserved in the symbol vault, with mapping and selective restoration instructions; never overwrite newly rebuilt symbols. No global ignored-file sweep or automatic removal of failed research is used.

## Historical C49 audit

Historical native tests created many independent copies of the same Halo resources and SDK tags. The C49 audit initially counted about **522.6 GiB** and 2.55 million regular files under the project directory, with an additional 446 long-path directories requiring extended-path handling. This is private development/test storage, not the size of the Spark application or public download.

The first completed cleanup removed **92,908,480,937 bytes (86.5 GiB)** of ignored Cargo debug caches from three checkouts, after checking the resolved paths, Git exclusions, Cargo fingerprints, running processes and absence of native project/map files. Tracked tests and source were retained. Public release artifacts remain separate from rebuildable compiler output. Rebuilding tests can temporarily recreate a substantial target directory.

Nineteen obsolete CE trial copies (**51,604,850,918 bytes**) were preserved in a **963,002,576-byte private archive** with exact SHA-256 identities. Their expanded copies were removed only after every unique archived payload and a real largest-file restoration probe passed. This step reclaimed another **50,641,848,342 bytes (47.2 GiB)**. The larger cold test groups are now complete. The final extended-path audit measured 94.8 GiB and 404,958 regular files with zero errors, compared with the initial approximately 522.6 GiB. All three vaults preserve 2,060,611 file records. See [final results and boundaries](CONTINUATION_49_ENGINEERING.md).

## What stays available

- Every Git commit, branch, worktree and uncommitted source change.
- All original Zombie Apocalypse files and installed runtime maps.
- Canonical previous-good release installers, executables, source archives and their evidence.
- Current Megaworld source/build inputs, C48 accepted source/evidence, native restoration inputs and active editing data.
- Unique old experiments, tool receipts, compiled maps, tag changes and source snapshots, either expanded or recoverable byte-for-byte from the private archive.

No regression test is removed merely to shrink a test count. Unknown source files are not classified as expendable by extension. Runtime maps, project files and native tag data are not deleted from a Cargo cache without explicit review.

## Private archive and recovery

Cold archives live under `.local/archives/`. They are **not distributable**: they can contain proprietary owned Halo resources, runtime copies and private QA state. Never attach them to GitHub Releases or include them in a public source ZIP.

Each archive uses a SHA-bound catalog mapping every original relative filename, size, timestamp and mode to a verified unique payload. Exact duplicates are stored once; restoration creates **independent regular files**, not shared hardlinks. A catalog checksum, whole-volume checksums and per-payload SHA-256 checks protect recovery. Changed existing files are refused instead of overwritten.

The private C49 helper and hash worker are retained with the cleanup evidence and copied beside completed archives. Use its `restore` operation with Python and Node installed. From the original workspace root, for example:

```powershell
python -B .local/archives/C49-cold-ce-trials/restore.py restore .local/archives/C49-cold-ce-trials --only .local/ce-startup-20261031-release
```

`--only` can select an original root, a subtree or one exact file from the catalog. Restore just the job/source needed for an old experiment rather than expanding every historical SDK copy. Old QA scripts with absolute paths require their archived inputs to be restored first. An `.ARCHIVED.json` note records the removed test tree's vault location.

Before removal, the cleanup (1) inventories/hashes source files and refuses links/worktrees, (2) reads back and hashes every unique archive entry and tests real restoration, and (3) checks each original's path, size, timestamp and complete hash again immediately before unlinking it. Unexpected changes stop removal. It never follows archive paths out of the selected workspace or replaces original installations.

Current cleanup receipts are private evidence, not application telemetry. Disk free-space changes can include unrelated activity; report accepted source bytes minus verified archive bytes rather than assuming every free-space change came from cleanup.
