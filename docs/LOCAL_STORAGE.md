# Local development storage

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
