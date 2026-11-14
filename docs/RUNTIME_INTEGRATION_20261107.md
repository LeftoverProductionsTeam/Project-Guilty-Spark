# Runtime integration — 7 November 2026

This continues local master `97751de`. It adds runtime-specific setup and safe shared content to the existing registration, launch, Online and download paths. It does not merge engines, substitute cache formats, repair Faber's native engine, or establish new game/peer acceptance.

## Creator workflow

1. Open **Games & tools**, choose OpenCE or Chupathingy, then **Runtime folders…**. The existing stock CE and MCC connections remain separate.
2. Keep each engine's executable in its own installation folder. **Add another OpenCE engine** registers an installed fork such as Faber without replacing the upstream profile.
3. **Share an existing content library** selects a connected community content root. It must contain native Xbox `maps/ui.map`. Inspect and save the profile. These settings affect the next explicit launch; changing a profile never switches an already-running match or reinterprets an open map's source format.
4. **Set up Custom Edition maps** finds the connected or discovered owned CE installation, validates its native UI and all three bank indexes, then copies only missing `bitmaps.map`, `sounds.map` and `loc.map` into the shared `maps_ce`. Matching banks are reused; different files are preserved and setup stops with a reason. No proprietary resources are downloaded.
5. Switch saved engines from the existing **Studio** runtime selector or **Saved engine** field. The normal Play and community join commands now honor the reviewed engine's process-local content path.
6. In **Online → runtime → Join server → selected game → Check installed runtime & map**, missing CE resources expose the same setup action. A missing ordinary Xbox/CE map offers **Download and set up**. Known catalog entries can prefill the original author's direct release URL. Otherwise supply the legitimate author's direct HTTPS map/ZIP link; the server listing does not provide a verified download URL or map hash.
7. The existing downloader validates/imports the source first. Setup requires exactly one matching native header name, family and multiplayer type, preserved source hash, a fresh real server listing, and the originally inspected profile/root/executable. It never overwrites a different same-named map or launches/joins a game automatically. A stale profile leaves the import in the Spark library for deliberate setup after rechecking.

Shared content is one selected physical set, not a new managed warehouse. This pass does not move/delete any existing runtime folders or maps. Stock CE and MCC retain their distinct layouts. OpenCE's selected custom-map root is `maps_ce` once present; older `custom_maps` files remain untouched and may need deliberate consolidation before that engine can see them. Chupathingy's own multiple-folder fallback is separate. No automatic destructive directory merge is claimed.

## Exact engine interfaces and boundaries

| Engine | Reviewed content interface | Evidence boundary |
| --- | --- | --- |
| OpenCE335 /343 | `HALO_DATA_ROOT`, `HALO_CUSTOM_MAPS_ROOT` | Exact executable hashes; read-only published source research and native Spark setup/launch-plan checks. |
| Owner-installed Faber234 | Same reviewed OpenCE path interface | Installed SHA `5c7368529b3ab0856f3987b1a03c62aa34c18e63ab833d35e385c8b61e2597e3`. This is a local interface binding, not publisher/source-build attestation or Firefight acceptance. |
| Chupathingy0.8.1d / owner's current engine | `HALO_DATA_ROOT`; native `maps_ce` lookup | A reviewed tiny launcher resolves only to the exact expected `chupathingy.exe`. Unknown/changed children are refused. Do not pretend the engine supports OpenCE's custom-root environment variable. |
| Stock Custom Edition | Its own native CE installation/resource layout | Supplies owned CE banks; external Xbox-root sharing is not enabled by a filename/version declaration. |
| MCC Halo1 | Its existing installation, SDK and package workflow | No common Xbox/CE directory alias, invented multiplayer bridge or new live-write acceptance. |

Unknown executables can retain the existing explicit registration workflow, but an external common data root is refused unless that exact engine has a reviewed interface. Only fixed path environment keys are generated. Saves/logs are placed in profile-specific managed locations for shared-root launches; Faber may still create its own pack caches in the data folder. No unrestricted shell, engine memory writes or remote tool execution are added.

Source pins reviewed read-only:

- [OpenCE343](https://github.com/OpenCommunityEdition/OpenCE/tree/fc9deb0b10eaae1d62caedb0710968b4e77e6e16).
- [Faber](https://github.com/SutlabSol/OpenCE-Faber/tree/e4ffe0fe9874870b4fca1fca76beb83514c793f4), `port/linux/src/port_config.c` path settings and `port/linux/src/xbox_files.c` path resolution.
- [Chupathingy](https://github.com/ChupathingyCE/chupathingyce/tree/fe4bbff5ab87a492634190a7ba72b8ab55191402), its own config/file lookup and launcher.
- [Halo Content Evolved](https://github.com/Watanoge/halo-content-evolved/tree/981b84c4f4f18b723e436b1c11f0ec7f8f597542), separate bot/server and stats behavior.

No fork/decompiled engine source is imported into Spark. Runtime-specific license and implementation boundaries remain in ENGINE_SOURCE_ATLAS.md.

## Faber crash finding

The owner's unchanged log reports native tag imports and **all machines loaded**, followed by `lights index #6 (0xe9790006) is unused or changed` and `c0000005` reading address `0x00000004`. Module-relative fault `0xBAFA0` contains `ff 70 04` (`push [eax+4]`), consistent with a failed light lookup followed by a definition-field read. The parser now classifies that exact stale-light signature while retaining the independent crash failure and other native assertions.

This supports an engine light-lifecycle investigation. It does not establish missing bitmaps, map corruption, exhausted capacity or shield glow as the specific cause. Matching symbols are absent; exact caller attribution and an engine fix remain open. The official v2.3.4 assets list the same ZIP digests as v2.3.3, so a reinstall is not presented as a fix. Full sanitized identities, relocation-aware caller RVAs and pinned source references: [crash receipt](fixtures/faber-firefight-crash-20261107.json). No original executable/config/log or active match was changed.

## Current verification

R3 passed810Rust tests/9ignored across54suites,425frontend tests,202browser tests and the existing offline/storage/source checks, then built a genuine Windows app. The native harness initially stopped before app launch because its new output folder/application identity had not been supplied to the existing ownership guard. The corrected harness reused only that exact source-pinned binary and passed six real native-app cases. No ownership guard was weakened.

An additional explicit download-button test found a production defect: a JSON-shaped saved-job key failed the existing state-key validator, stopping setup before installation. The fix uses the provider-derived bounded community key (and existing window isolation), while React still keys the component by the full engine/root/hash intent. The strengthened download and engine-switch browser tests pass. Fresh R4 repeats425frontend tests, TypeScript,3source contracts,59offline commands and35storage tests, builds the corrected embedded app, and passes all six actual native-app cases. Full202-browser R3 evidence is preserved alongside the two final focused checks; it is not falsely relabeled a full rerun after the one-line correction.

Prior focused checks: TypeScript; 425 frontend tests; three browser workflows for saved engine choice, CE bank/download offer and runtime relocation; 18 native-health/continuity tests. These are not game trials. The complete run caught an OpenCE folder-provenance expectation and the new native harness's missing workflow-catalog entry; both were corrected without removing source/path isolation assertions. An initial junction fixture required a Windows symlink privilege and was changed to a disposable unprivileged junction, with the redirected-output refusal retained.

**Final native result:** R4 passes six cases: four actual installed profiles coexist; real CE banks copy once/reuse; native Games & tools/header activation; different-bank preservation; stale-engine refusal; real advertised Blood Gulch admission and identical-map reuse. Ten original executable/UI/bank hashes and the original Blood Gulch source remain unchanged. First bank setup copied165,658,385bytes in1,273ms; verified reuse copied0bytes in757ms. These are setup operations on this machine, not app-startup/rendering/game-load benchmarks. Integrity checks stayed enabled.

Actual QA application: `GuiltySpark.exe`,47,434,752bytes, SHA-256 `b1418e31b73dd91b82519c85e5e30d943f48e5165e193bdc3e5bcac75e78e84f`; runtime-source fingerprint `2a8b0f00c00f7cf7c5cae82cbb09ecf46415e82fc944cf9ea80d078d1696baa9`. Base commit97751de plus the current verified source; this is a temporary QA executable, not an installer/release. The build wrapper now rejects source changes during embedding instead of attesting a mixed revision.

Native scratch disposal reclaimed266,823,865logical bytes; only218,388bytes/4small receipt/screenshot files remained before the parent workflow disposed its temporary output. Full build scratch was also disposed. No SDK tree or runtime-resource copy is retained in the repository. Compact durable evidence: [runtime receipt](fixtures/runtime-integration-20261107.json).

The opt-in native stage uses the actual embedded Windows application and existing bounded QA owner. Originals are read-only, copied banks and test maps belong to disposable output, no game is launched, and exact original hashes are rechecked. QA app export is source-fingerprinted and is not a release candidate. The accepted C49 release remains unchanged.

## Remaining native gameplay work

- Real engine launches using a shared library, correct native map join/protocol agreement and per-engine source/game readback remain separate acceptance gates.
- Faber Firefight crash: matching PDB or maintainer-symbolicated stack and a verified native engine correction; not solved by Spark bank setup.
- Native scenario AI, player-slot bots and original Zombie carrier-spawned actors are distinct. Upstream343's local-Slayer bot restriction does not describe every Faber/HCE online fork. Do not replace the original Zombie mechanism with generic player bots.
- Faber/HCE `firefight_stats_export_json` is a stub. Local stats endpoints require a privacy-preserving numeric projection; no fictional export, linking-code operation, account write or public stats submission is implemented/claimed here.
- Original Zombie automatic release, stable combat, human survival and actual peer agreement remain open. Existing native builds/accepted authoring/recovery evidence are preserved.
- Wider tool/game/Live Link/physical-machine/release acceptance remains as recorded in the master ledger; no universal support claim follows from path setup.

## Forerunner companion check-in — source only, 14 November 2026

Read-only inspection found Forerunner master7732e61dd6627861d4c6ad665bb36ce6d5ab4f6f clean. Its existing SPARK_INTEGRATION_CONTRACT.md exposes contract1/runtime.discover only. TEST_EVIDENCE.md records a finite two-client B40 encounter at gameplay21a809b004a057548b641d023df24a613cf14f47, snapshotd990a0d29b1913bb58dd2ed3977c73b91b5ab3fcfbb7b490447b94f8a4d4a275 and executablefb8d204f21e57a4db6ed44f078338a02023c49a3998b6a437e1f4d1d8f8fa4b7. This is historical Forerunner evidence, not acceptance of Spark-authored content or this new adapter. Later engine source remains unbuilt/unverified.

Spark remains the native source/dependency/encounter/HaloScript editor, compiler and independent readback owner. Forerunner remains the AI/physics/combat/replication executor. No engine source is copied and no second launcher/controller is introduced.

The existing runtime manager now has WIP source admitting that exact Windows/x86 executable to shared-content path preparation. A profile uses explicit data root, Xbox UI in maps and CE content/banks in maps_ce (or the existing custom_maps fallback). The existing launch plan carries the inspected executable SHA; the existing launcher checks it before and after profile preparation. Unknown/new hashes retain their prior refusal for shared content.

For this exact engine, runtime-state/<registration-id> holds private config.toml, saves, logs and cache. Creation is exclusive, existing settings are preserved, links/nonregular/oversized settings are refused, and documented --config receives the actual Windows path. Inherited HALO_* overrides are cleared before explicit paths are applied. Documented process settings disable old-map migration, automatic map downloads and update checks. These settings were read in accepted source21a809b0: port/linux/src/port_config.c, paths.data/saves/logs/cache/custom_maps, game.move_old_map_folders, network.map_downloads and update.auto. No runtime folder, configuration or game file was modified during this source change.

UI route: Studio runtime → OpenCE flavors → Forerunner → Games & tools/Setup → Add another OpenCE engine → choose installation/executable/content → Inspect registration → Save registration → select saved engine → Play. Inspection now explains that Play opens menus and does not deploy the current project. Optional Read Forerunner capabilities remains a separate read-only query; none was executed here.

**Not accepted:** this Spark profile launch, settings persistence, dependency completeness, package/DLL identity, authored-map deployment/loading, original-file preservation under execution, mods, Live Link/Rebuild, peer compatibility or gameplay. The newer game.start_map/HALO_START_MAP source is not enabled. For authored HaloScript waves the finite engine director must be deliberately OFF; general menu launch does not change its gameplay preference. No test, typecheck, native query, build, app or game ran. Next is receipt-pinned bounded owned CE deployment, capability-appropriate map selection and fresh-process revision/rollback through the existing playtest architecture.

Source checkpoint db43c04bc8fb519580ccd72b37d3cbcd6291e947 is WIP/untested; source manifest64e31b1f399754630fff60a0aa411ab41b4c36aadb8065298508e50b58791c42,2148files/51,947,722B. No new executable represents this source. Checkpoint/evidence follow-up only; no native execution or publication.

## Owned Forerunner CE solo handoff — WIP source, 14 November 2026

The existing runtime_rebuild registry now has a Forerunner menu-selected solo path; Chupathingy's multiplayer restart adapter remains separate. Level editor → Game connection prepares the currently selected OpenCE-family profile through existing list/inspect calls. Only the admitted profileInterface=forerunner is enabled. Start staged solo test saves first and sends the complete inspected registration plus executable SHA; backend checks the same selected profile again after staging. It requires a current project-owned validated gbx-custom receipt, matching project fingerprint/output hash, standard CE609 solo header/native filename and self-contained resources. Source edition is not inferred from the hosting runtime.

Staging reuses the existing storage lease, 512MiB aggregate input bound, 1.5GiB reservation, copying/readback helper, owned child process, window ownership, eight-hour lifetime, periodic budget checks and disposable cleanup. It copies only the admitted executable, its adjacent x86 SDL3 DLL (bounded PE/DLL check and recorded installed SHA), Xbox UI/optional carousel, the exact derived map and three validated CE resource banks. No SDK, original map collection, link to writable originals or original settings/profile is copied. Installed SDL identity is a local pin, not independent publisher/package acceptance. All staged members are rehashed before launch.

The existing registered-runtime command helper accepts an internally owned private profile root. The isolated engine uses private config/saves/logs/cache and explicit CE content paths. Process-only settings select the recorded GL renderer, disable online play/public lobby/clipboard joining/downloads/migration/update checks/crash upload/Discord presence and keep the finite Firefight director OFF so native HSC remains the sole wave owner. No debug/test startup, memory hook, invented RPC or unbuilt game.start_map is used. Actual process execution is NOT RUN.

The native custom campaign chooser is required. Status remains awaitingMapSelection with game build/hash unset, even if console text resembles Chupathingy test ticks. Native profile creation is manual and temporary; stopping the owned test disposes it. A new source revision needs Stop → Save/native build → Start staged solo test → choose the new map. Automatic Forerunner Live Rebuild is refused in both UI and backend. Another selected runtime never retargets this process. A clean Forerunner exit stops the session; abnormal exit remains failed. No unrelated process/server is touched.

Open gates: compilation/typecheck and all focused regressions; real UI/menu selection and gameplay; minimal runtime package completeness; profile/resource/original preservation under execution; close/window-loss/budget/failure cleanup; revised map loading; score/HUD/combat and peer agreement. No tests, native queries, compiler, application or game ran under the owner's code-only instruction. No Forerunner source or original content changed. Next requires native acceptance once authorized, plus visible authored score/outcome/replay policy without assuming gs_ff globals are an engine HUD/session API.

Owned solo source checkpoint a19a626926fa42e800ec5b02509517f35036a32a, WIP/untested. Source manifest3cbaab6b676ce35f4fbae5ee65a8faff02e39cb8b1e883a243256d3a5369da99,2148files/51,973,899B, no archive. No executable or native acceptance represents this source. Immediate source step: existing authored visible outcome/replay behavior; execution gates above stay OPEN.
