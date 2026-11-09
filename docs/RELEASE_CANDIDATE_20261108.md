# Source-pinned Windows preview candidate — 8 November 2026

## Latest verified Windows candidate: dc4456e / preview4

This later candidate includes the native imported-scenery source-tag workflow and the release-blocking View focus repair. Exact binary/source commit **dc4456ed58d3bdc26889e210fdaf7d51dced1f92**, tree **aecc6a570db12000dc62a1fd706b977581235a2f**, application0.4.1. The previous c035b68 preview2 and C49 remain separate previous-good builds. Failed6d9bb4b preview3 was not sealed. This report's later documentation commit is not the binary source.

Private upload directory: **C:/Users/patri/AppData/Local/Temp/GuiltySpark-Engineering-d49eb02588bf/release-dc4456e-preview4/windows-x64**. Exactly five upload files total **63354857bytes**. No proprietary Halo content, runtime, SDK, personal files or raw QA logs are bundled.

| Upload file | Bytes | SHA-256 |
| --- | ---: | --- |
|Project_Guilty_Spark_0.4.1_windows_x64_Setup.exe|11934495|4bef479be5369f59689654df43cd10f11a12219634ccd610d372f3ef0024d7cb|
|Project_Guilty_Spark_0.4.1_windows_x64_Portable.zip|16642796|4a538700094eb2e5385239b4345b402e41d01ceaf0c890de1d770017abb17eb3|
|Project_Guilty_Spark_0.4.1_dc4456ed58d3_Source.zip|34771598|92169321bad1a4f8ed3f3f4fe2a2652419ef857d46222b57a4ea8aca2e15c8dd|
|Project_Guilty_Spark_0.4.1_windows_x64_manifest.json|5499|Listed in SHA256SUMS-windows-x64.txt|
|SHA256SUMS-windows-x64.txt|469|Checksums for the four other upload files|

All nine exact-clean-source release groups pass: **894Rust/9explicit opt-in ignored,472frontend,258browser**, TypeScript, offline, storage/repository ownership, native diagnostics and14Python release tests. Native source interfaces and committed source manifests also pass. Gates and hashed logs: R/gates-windows/gates.json (R is the private root above). The sourceZIP has2134members including its two checksum lists; staging compares every member against this Git revision, and sealing/verification checks ZIP integrity and all source checksums.

Actual NSIS installation, installed-app startup, extracted portable startup and owned uninstall pass on this Windows development host. The installed payload differs only by Tauri's documented three-byte UNK-to-NSS marker. Installed SHA7ef3fa41251540d2eee59ff28ba1cf213d5341d1303aa2284a8e94bd2570bcbd; portable executable SHA4b2443ae9440e29446119ad7c4483af2377a0240b219193d7653414e46ba3ff0. Uninstall verifies payload/registration removed (189ms final observation). Workspace-ready samples: portable1112.79ms, installed1080.76ms; one run each, no optimization or clean-machine claim.

The exact packaged portable passes real native preview and project suites (R/native-preview.json, native-projects.json; mockedIpc:false). The joined CE609 cache loads138source shaders,7lightmaps,18cubes and79object model types with no pending materials/reflections or false bitmap prompt; original SHA unchanged. A/B/C project drafts0.75/1.25/2 survive independent navigation, writer/view transfer, Undo/Save and full process restart. All eight requested native logical sizes show19reachable Maps/Work controls, zero measured clipping/scrolling and retained canvas; fullscreen passes. Physical DPI/monitor-disconnect/secondary-monitor tests remain open.

Direct Computer Use on this same packaged app observes View→End visibly focusing Reset layout, File→New→Multiplayer Map→Create editable map, the corrected preview/native-source notice, Ctrl+S→Saved and normal close with owned library disposal (R/direct-native-review.json). This spot check is not a full manual/UI/gameplay acceptance. package.py seal and verify pass; publiclyPublished:false.

Owner handoff: normally push reviewed local history, then invoke existing .github/workflows/release.yml with source_commit **dc4456ed58d3bdc26889e210fdaf7d51dced1f92**, preview_number **4** only if stillunused, prepare_draft:true, build_linux:false until independent Linux acceptance. This prepares a NEW draft prerelease v0.4.1-preview.4 with actual downloadable Release assets. No alpha/C49/tag replacement, force push, remote write or publication occurred here. Hosted CI on repaired exact source, clean-machine Windows, upgrades, Linux/macOS and public anonymous download verification remain open. Owner approval is still required for publication.

The next local objective is the existing combined SparkLink frozen-source→CE compile→private Chupathingy two-client revision/restart/recovery workflow. M1's locally executable gates are closed; its hosted/public/clean-machine gates and all M2–M6 human/peer/engine acceptance remain open.

---


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
