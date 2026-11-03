# C60 push and Windows upload handoff

Title: **C60: order native refreshes, consolidate ownership and verify the preserved Windows release**

Fix the reproduced stale library reply race using bounded latest-request publication and a focused-map queue. Idle map saves still consume their incremental receipt; active reads are fenced. Co-locate the five existing window/lease commands with placement/recovery and reuse one QuickForge source-resource resolver. All 255 IPC names, native guards, public helper interfaces, 472 requirement rows and experimental work remain.

Paired native runs preserve full rendering. Warm 40-event bursts use **2+2 reads instead of 40+40**. Other load-time, CPU/RAM/GPU measurements are mixed; no broad memory or speedup claim is made. Native window/history tests, 23-route/126-state audit, real three-process collaboration, H1A BSP compilation, crash/rollover recovery and another CE→MCC conversion pass. Full results: 664 Rust passed / 8 opt-in ignored; 365 frontend; 155 browser; 59 offline scripts; separate native/release contracts. [Exact report](CONTINUATION_60_RELEASE_MAINTENANCE.md).

Local master is the working branch. The final commit is identified in the handoff and ignored committed-source receipt, without embedding a self-referential commit in this file. The owner pushes normally. Do not force-push, remove branches, rewrite tags or weaken rules; any remote refusal must be handled under its actual policy. No push, hosted CI success or remote metadata write is claimed.

## Preserved Windows 0.4.1 C49 candidate

Exact source: `cb07581597de11e83d1c10bafad526e8b031f27e`; tree `c4196fc48c0dc22e3daa17affcabe2a7279f200a`; intended new tag `v0.4.1-preview.1`.

Original immutable folder:
`D:\Project Guilty Spark\.local\c39-native-collaboration\.local\releases\C49-preview-cb07581`

**Owner upload folder (all five files):**
`D:\Project Guilty Spark\.local\c39-native-collaboration\.local\c60-release-maintenance-20261103\upload-ready\C49-preview-cb07581`

The parent `upload-ready` folder also contains draft notes, a non-executed draft plan, exact asset checks and upload instructions. Those instructions are not additional public binary assets.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `Project_Guilty_Spark_0.4.1_windows_x64_Setup.exe` | 10,107,686 | `6e0c3efb53ced11dde522492ea341a019c93976d3ca0c16ae28ae180da334749` |
| `Project_Guilty_Spark_0.4.1_windows_x64_Portable.zip` | 13,941,863 | `ff6c9e4dea48126680c2a9b8536dfb2185fab5ac445c7d4f306b9bed52e07069` |
| `Project_Guilty_Spark_0.4.1_cb07581597de_Source.zip` | 26,186,072 | `c6ea81b25bfae352d76df58557a82daef44b72ba11bf778d0e2eee9f56ae03f0` |
| `Project_Guilty_Spark_0.4.1_windows_x64_manifest.json` | 4,879 | Identified in the included checksum file |
| `SHA256SUMS-windows-x64.txt` | 469 | Verifies installer, portable, source archive and manifest |

The portable payload contains the complete embedded `GuiltySpark.exe`, license/notices, README and exact build metadata. It does not bundle Halo maps/assets, SDKs, proprietary sound/texture banks, local libraries, optional Steam SDK/bridge or credentials. Windows 10/11 x64 needs WebView2; this is an unsigned preview. Linux/macOS binaries remain separate unaccepted targets.

C49 portable executable SHA-256: `02fc21ec292f45591ad43f6e8541b47e6da668d3e13872595a36b1aa84af16c6`.
Fresh installed payload SHA-256: `c4c0c5b71be39cca6556f7d0a7c688ed2493ce585bf8e3fe6de4b792f131201d`.
The expected three-byte Tauri bundle marker accounts for the entire difference. Fresh portable and installed startups pass; the owned test installation has been removed normally.

**This candidate predates C50–C60. Do not rename its source identity or imply it contains newer repairs.** Current source requires its own new candidate/versioned preview when packaged.

## Upload / publication

The owner selected manual upload. There is no confirmed GitHub draft or attached asset yet. Anonymous API verification at November 3, 2026 12:53 UTC shows no public releases; private drafts cannot be checked without authentication.

1. Open GitHub Releases and create a **new draft pre-release** for the source/tag above. Check that no existing release/tag is being replaced. Keep `alpha` and historical tags untouched.
2. Attach **all five files** from the sealed upload folder. Use the supplied `DRAFT_NOTES.md`, which describes C49's actual scope and later-source distinction.
3. Alternatively, authenticated local `scripts/release/draft.mjs` can attach the same sealed set and re-download/hash every asset; it refuses existing releases/tags and never publishes. Normal `release.yml` builds a **new** candidate from a known pushed commit; Actions artifacts alone are not public downloads.
4. Review and approve publication, then publish via GitHub. Approval is not inferred from preparing the bundle.
5. After publication, verify actual anonymous downloads:

```powershell
node scripts/release/verify-public.mjs v0.4.1-preview.1 cb07581597de11e83d1c10bafad526e8b031f27e .local/c60-release-maintenance-20261103/github-public-assets.json
```

Only that real public-download result closes distribution. [Complete release procedure](RELEASING.md).

## Proposed GitHub About / topics — prepared, not applied

About:
> Open-source Halo 1 modding studio: native Forge/BSP Workshop, map conversion, MCC Live Link and collaborative editing. Megaworld, Firefight/Zombie restoration and multiplayer AI are in development. Requires owned Halo content.

Topics:
`halo`, `halo-ce`, `halo-mcc`, `opence`, `chupathingy`, `modding`, `level-editor`, `bsp`, `forge`, `tauri`, `rust`, `typescript`, `collaborative-editing`, `machinima`, `game-tools`, `windows`.

The actual remote description/topics were read; no authenticated write confirmation exists. README, genuine screenshots, onboarding, roadmap, compatibility and release notes are updated locally. Gameplay traversal, native game sound listening, complete AI/Zombie acceptance, two-computer/physical-monitor tests and native Linux/macOS remain open.
