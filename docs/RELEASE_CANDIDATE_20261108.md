# Source-pinned Windows preview candidate — 8 November 2026

Binary/source revision: **c035b686b5cecff77b18c24911de7c76dd7e229e**, tree ed25c4785e8d0188ca07f33a492cbcbee5888638, application0.4.1. This is a locally verified candidate, not a published release or acceptance of the full Unified/100Percent directives. The owner performs the GitHub push and workflow invocation. C49 and existing tags stay intact.

Private output root: C:/Users/patri/AppData/Local/Temp/GuiltySpark-Engineering-d49eb02588bf/release-c035b68-preview2. The **windows-x64** subdirectory contains exactly five upload files. No raw map, resource bank, engine, SDK or private QA log is part of them.

| Upload file | Bytes | SHA-256 |
| --- | ---: | --- |
| Project_Guilty_Spark_0.4.1_windows_x64_Setup.exe |11917425|5616b12196d35f70c73a66b31dac360a5cc33029ee8a3fee8bd234e08e4baeef|
| Project_Guilty_Spark_0.4.1_windows_x64_Portable.zip |16620056|be38b91508dcd02bcf6d155fa1b4b7a8a486639dedc6653140d46b32af6d3689|
| Project_Guilty_Spark_0.4.1_c035b686b5ce_Source.zip |34737654|73795fcbdf6e20bd1938aae677813e85173b0bfb9cff3ca38706582fdbbf4782|
| Project_Guilty_Spark_0.4.1_windows_x64_manifest.json |5522|Listed in SHA256SUMS-windows-x64.txt|
| SHA256SUMS-windows-x64.txt |469|Checks installer, portable, source and manifest|

The source ZIP is33.13MiB,2128members; all bytes compare to this Git commit and its SHA inventory, ZIP CRC/comment verified. The whole upload set is63,281,126bytes, not a multi-gigabyte review archive. The executable SHA is d2a3e8f02e5f92dbac6c1d2f8d44a202211dac03ad452e947375cf669463f477. The real installed payload SHA is2d0e42bb9fe12d8dae33c00698214cd5608e42c34c4c99497283694c644b35fa; independent comparison permits only Tauri's three-byte UNK-to-NSS bundle marker rewrite.

## Verification actually completed

- All nine unchanged required release groups pass on exact clean c035b68:885Rust/9explicit opt-in ignored,472frontend,254browser, TypeScript,59offline,38storage/repository checks, native diagnostics, release pipeline and staged-source integrity. Raw logs/gates.json under gates-windows. Hosted GitHub CI is not claimed.
- Genuine x64 NSIS built through existing official Tauri/NSIS pipeline. Actual installer test refuses any pre-existing user installation/shortcuts. Installation and native startup pass on this Windows development host, separate blank library. Portable extracted and launched; native bootstrap, embedded frontend identity, actual heading/window and appversion checked with mockedIpc:false. Workspace ready930.46ms portable,1160.72ms installed, one sample each, not an optimization/clean-machine claim.
- Actual packaged application opens the joined CE cache and loads all required primary shaders; native resource findings show no unnecessary bitmap-bank prompt. Real projectA/B/C navigation, histories, independent view/writer ownership, Save/restart and all eight native logical window sizes pass. R/native-regressions.json and native screenshots preserve exactscope. This is not full human/gameplay or physical multi-monitor/DPI acceptance.
- package.py seal then verify succeeds; public manifest verification.complete:true and publiclyPublished:false. Earlier failed aggregate-budget startup attempt remains recorded; sequential retry passes without raising limits.
- Actual NSIS uninstall initially exposed a completion-observation race: launcher exit preceded payload removal. The release test helper is repaired after binary freeze to wait for real payload/registration disappearance. A repeated genuine install/remove with the same c035installer passes, removalWaitMs156, payloadRemoved/registrationRemoved:true. Later helper/docs commit is not relabeled as the binary's source. Both owned test installations are gone.

Accepted C49 remains separate. No GitHub draft/tag/assets/publication was created. Clean-machine Windows10/11 without Halo/WebView2, upgrade/repair, signing, broader GPUs, physical monitors, Linux and macOS remain unaccepted. Windows preview can proceed independently after ownerreview; neither Linux nor macOS is advertised as tested.

## Owner handoff

Push reviewed local history normally, respecting protection; never force or weaken rules. The existing **Release candidate (build or draft)** workflow (.github/workflows/release.yml) takes full source_commit and preview_number2 (only if stillunused). For reproducing these exactfiles select c035b686b5cecff77b18c24911de7c76dd7e229e. Newer application engineering requires its own full source-pinned build and receipts. Set prepare_draft:true to attach verified actual Release assets to a NEW draft pre-release; build_linux:false leaves unverified Linux out, or true attempts independent native CI acceptance. It never publishes automatically. The GitHub source must be pushed and in master ancestry. An Actions artifact is not a public Release download.

Alternatively upload the five sealed files to an owner-reviewed draft associated with the exactcommit; do not overwrite alpha/C49/existingtags. Public publication needs ownerapproval. Independent anonymous download/hash verification remains required after actual publication. This report and the existing RELEASING procedure do not authorize any remote action.

Next first-directive engineering remains native connected-world imported gameplay content. Human seam traversal,19regions, AI/Firefight/Zombie/Extraction, combined SparkLink/game clients, VR and remaining workflows stay open. Tests establish only their named evidence level.
