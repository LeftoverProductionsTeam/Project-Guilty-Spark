# Windows preview release evidence — 8–10 November 2026

## 10 November — verified public Windows preview5

Exact application source **d832af36cb55ecd55d6c0730c24c13f90594424c**, tree **9d8b283564aeb5513f75d516dda664a9abcf0925**, version0.4.1. Later presentation/checkpoint commits do not change these binary identities. The C49, c035b68 and dc4456e candidates remain separately preserved.

**Public downloads:** [v0.4.1-preview.5](https://github.com/LeftoverProductionsTeam/Project-Guilty-Spark/releases/tag/v0.4.1-preview.5). The owner uploaded the fresh five-file set. It initially landed on public preview4 while preview5 was an empty draft. R637 correctly rejected the manifest/tag mismatch. Under the owner's GitHub-update instruction, the existing uploaded release was reassociated with the new preview5 tag and current source; its five assets were retained. The old preview4 Git tag still resolves to dc4456ed58d3bdc26889e210fdaf7d51dced1f92. Its empty historical draft remains private; no old tag or commit was rewritten. The new preview5 tag resolves to d832af36cb55ecd55d6c0730c24c13f90594424c.

The existing anonymous public verifier now passes against preview5. It downloads all five files (including the checksum index), validates the source/tag/verification manifest, checks every payload size and SHA-256 and rejects unverified extras. Receipt: R/public-download-verification.json. Public release ID440963621; historical empty draft ID441012570. No credentials or private Halo data were uploaded.

R = C:/Users/patri/AppData/Local/Temp/GuiltySpark-Engineering-d49eb02588bf/release-20261110-preview5. Exactly five upload files in R/windows-x64, **63,721,022bytes**:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
|Project_Guilty_Spark_0.4.1_windows_x64_Setup.exe|11976680|05229a2f46a4227aa1d28752c40a3a6bc4ea790086974d8914f28bc76f389a77|
|Project_Guilty_Spark_0.4.1_windows_x64_Portable.zip|16730229|d751e21b49bf9049af47cca13ebdf214928ac11c8a3ef80a70ade00de9316ccf|
|Project_Guilty_Spark_0.4.1_d832af36cb55_Source.zip|35008148|7ae15ca026868ae50933b0ce6bd373440a47306c5a3d364cd7d93b0ddef2f8e7|
|Project_Guilty_Spark_0.4.1_windows_x64_manifest.json|5496|9f5f15455b509fdf50091c11e36f28b96003193b9837832ae661190e1a529463|
|SHA256SUMS-windows-x64.txt|469|c910ccb2312e520449bf8fc138c7d8db40472021da62b129d5f26a8564dcc68f|

R633 all nine current-source gates pass: **926Rust/9explicit opt-in ignored,508frontend,280browser**, TypeScript, source/interface,42storage/repository checks,59offline programs,40native diagnostics and14Python+6Node release tests. The three original MCC manifest path/UTF-16 failures pass. Gates/log hashes: R/gates-windows-native-r633/gates.json. R630/R631 restricted-runner native allocation-helper failures remain failed evidence; the unchanged focused test passes under normal host access R632 and the full existing suite passes R633. No assertion, native validator, storage limit or system security setting was weakened.

R634 genuine Tauri/NSIS release build exits0 in3m01s. Standalone executable50,606,592bytes, SHAd4db78b1756373e6951d1e35eeb693c5d0583f87966187c6c3573614f9bc6c94. R635 portable/native startup and R636 actual isolated installation/installed startup/owned uninstall pass, mockedIpc:false and0pageerrors. Workspace-ready samples1175.7526ms portable/1111.8867ms installed, one sample each on this host, not a performance-improvement or clean-machine claim. Installed SHA812d25476ba56f2433770caf112b477154ae37b0cf425997056a2b16a970167f; only the documented three-byte Tauri bundle marker differs. Uninstall confirms payload/registration removed with158ms final wait. Stage/seal/verify and all2145 source-ZIP members pass. Sealed test-receipt SHA35fd8f84019c6320d2145949ab6cdfeb60344601fb5b098d24c33e1925e9a114.

Owned compiler staging1,858,485,211logical bytes and verified duplicate build/extracted/profile output133,378,303logical bytes were disposed. Original Halo assets/SDKs/runtimes and accepted releases were untouched. R/temporary-retirement.json retains the exact checks. No replacement archive or repository cache was created.

Native screenshot receipts: R/portable-startup/startup.png and installed-startup/startup.png. Public GitHub proof: R/public-preview5.jpg. Installed/portable receipts do not establish human Firefight combat, waves, scoring, AI peers, MegaWorld traversal, physical multi-monitor/DPI, headset VR, clean Windows VM, upgrades or Linux/macOS. All475 requirement IDs and Operation110 M1–M6 remain open where their independent acceptance is missing.

## Historical November 8 candidates

## Historical Windows candidate: dc4456e / preview4

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

Post-verification storage retirement: the failed unsealed6d9 preview3 installer/portable/source payloads and extracted/build copies (11hash-verified generated files) were removed only after sealed dc preview4 verified.176,063,488allocated bytes reclaimed;176,037,631logical bytes. Failure gate logs, the small exact provenance/removal receipt and Git source remain; C49,c035,current release and originals were untouched. No replacement archive. E/release-6d9bb4b-preview3/retired-generated-payloads.json.
