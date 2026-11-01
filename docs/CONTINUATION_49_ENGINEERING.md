# C49 — verified Windows candidate and completed storage cleanup

The Windows 0.4.1 application was built and tested from **`cb07581597de11e83d1c10bafad526e8b031f27e`** on local master. Documentation/evidence updates after that commit do not change its program source or the immutable candidate. The candidate is local; authenticated draft attachment, hosted-runner acceptance and approved public download remain open.

## Windows evidence

The final source passed 629 Rust tests (7 explicitly ignored), 300 frontend tests, 136 browser tests, 59 offline checks, 32 native diagnostic tests, 16 release-pipeline tests, TypeScript and release-workflow lint. Counts describe one final run. The real extracted portable and genuine NSIS-installed applications both returned native bootstrap/version responses, matched their embedded frontend bytes and finished loading the first workspace. Both startup receipts have `workspaceReady: true`; a shell stuck on its loading screen cannot pass.

Actual installation/readback exposed Tauri's three-byte `UNK` to `NSS` bundle marker. The verifier accepts that exact transformation and rejects every other byte change. A separate source check caught Windows newline normalization in a generated checksum; both source manifests now cover the exact committed archive bytes. These failures and the earlier browser-screenshot path issue remain in private evidence. A local installation is not an independently tested clean end-user machine or a hosted runner.

The sealed candidate is under `.local/releases/C49-preview-cb07581/` in the master worktree. It contains only the following three payloads, the platform manifest and `SHA256SUMS-windows-x64.txt`:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `Project_Guilty_Spark_0.4.1_windows_x64_Setup.exe` | 10,107,686 | `6e0c3efb53ced11dde522492ea341a019c93976d3ca0c16ae28ae180da334749` |
| `Project_Guilty_Spark_0.4.1_windows_x64_Portable.zip` | 13,941,863 | `ff6c9e4dea48126680c2a9b8536dfb2185fab5ac445c7d4f306b9bed52e07069` |
| `Project_Guilty_Spark_0.4.1_cb07581597de_Source.zip` | 26,186,072 | `c6ea81b25bfae352d76df58557a82daef44b72ba11bf778d0e2eee9f56ae03f0` |

Platform manifest SHA-256: `c00f7afc9b1d57963bbe0234ef4c3c992a574136a27cbf34dca83354fe2a0b52`. The manifest binds the exact source commit/tree, binaries and acceptance receipts. No Halo maps, resource banks, game/SDK files, optional Steam bridge or private test libraries enter the public packages. Windows 10/11 x64 with WebView2 is the tested route; the preview is unsigned. See [release steps and compatibility](RELEASING.md).

## Storage and recovery

The project directory changed from approximately **522.6 GiB to 94.8 GiB**, about **427.8 GiB less**, with 404,958 regular files and zero final scan errors. These are logical directory bytes. The initial scan skipped 446 long-path directories; the final scan used extended paths. This is a storage measurement, not a claim of faster application startup or a measurement of every change in drive free space.

Three deduplicated private vaults preserve **2,060,611 original file records**. Every unique archived payload and volume was hashed/read back before expanded copies were removed; sources were checked again immediately before removal. Recovery tools stored beside the vault restored a real CE configuration, executable and map as independent files with exact hashes. Fifty-seven timestamp-only changes were retained conservatively; their contents still match the archived copies. Six staging volumes were removed only after byte identity with completed vault volumes was verified; two nonidentical partial staging volumes remain as evidence.

Ignored Cargo debug caches and release compiler intermediates were removed after final acceptance. All original 67 Zombie source files, 94 installed maps, 160 untracked root files and the dirty root patches remain byte-identical. All 21 prior branch tips remain in history, prior local/tag references are retained, 23 previous release artifacts match their recorded hashes, all 426 earlier ledger records remain byte-for-byte intact, and the native tag/physics checks passed. Tracked tests and authored source were retained. [Recovery procedure and retained inputs](LOCAL_STORAGE.md).

Private archives include owned game resources and must never be distributed. Historical QA scripts need their specific archived inputs restored before replay; current original installations and active native sources remain expanded.

## Distribution and remaining engineering

At `2026-11-01T23:39:58.887Z`, public `Preview` and `alpha` releases still had zero attached assets; remote master was `98698955a7a92d4746230cfae44c41b1aacf51f9`. GitHub's connector/browser connection and noninteractive Git credential were unavailable for authenticated release writes. This continuation performed no push, draft creation, publication, force push, tag rewrite or ruleset change. The About description is prepared in [the push summary](C49_PUSH_SUMMARY.md), and has not been changed remotely.

Push the reviewed master normally, then run `.github/workflows/release.yml` on exact application source `cb07581597de11e83d1c10bafad526e8b031f27e` with an unused preview number. The workflow tests a pushed commit, creates a new draft pre-release only, attaches genuine Release assets and downloads/hashes them again. Review and approve public publication separately; then run the anonymous download verifier. Actions artifacts and local installers do not close that public-download gate.

Linux AppImage/deb have an optional genuine build/startup route, with platform-specific payload identities. Linux compilation and package startup remain unverified on this Windows host. Linux failure does not block a verified Windows draft.

Megaworld retains 94 inspected map paths and 187 BSP records with zero inspection failures. The protected 77,711,328-byte Timberland–Sidewinder native CE cache still has SHA-256 `ed2bb8920d07310c77f54a0a551ffcf17cde0ea0950b466895600d676e49e7fe`. Its two-way physical player traversal remains open. Prepare an isolated spawn at the tunnel entrance for that test, then prove four regions before all-map expansion. No complete all-map physical world, seamless streaming, native audio listening, recovered Zombie gameplay, cross-computer/Steam relay, AI/game-peer replication or unfinished compiled-map structural workflow is marked complete.

Structured results: [release and storage evidence](fixtures/c49-release-storage.json). Full requirements: [master ledger](MASTER_FEATURE_LEDGER.md).
