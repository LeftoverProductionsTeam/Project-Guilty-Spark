# Active engineering checkpoint

Task: Operation110 — restore current CI, protect user files, then native Firefight acceptance
Status: implementation incomplete
Starting revision: 05efc661ac1e4acf35e5bba2f879d17bd309d814, canonical D:/Project Guilty Spark, local master, 14 November 2026. This merge was observed during recovery; it was not created by this engineering increment.
Latest verified revision: 05efc661ac1e4acf35e5bba2f879d17bd309d814 plus scoped CI/pack-ownership source; R641931Rust/9explicit ignores, R642280browser, R648fresh native Windows Save/restart/compile/readback pass. Exact source manifest and scoped local commit follow below; no remote publication.
Next action: Commit the verified scoped CI/ownership/readback work with refreshed source manifests. Then repair the newly observed empty native solo player profile through the existing Firefight/source builder, add its legitimate weapon dependencies, independently read back the profile and load the isolated scenario. Continue remaining file-ownership gates; Linux requires the existing approved native runner. No push/publication or Operation110/M1–M6 completion.

## Acceptance

Read goal56474fe8 and its linked Complete Creator Mission; current goal's da7bc0b1 text is the same mission. Resume c8312d86, Unified37c65d5f then100Percent237b00a4 and Operation110f3bd3ec0 remain active. Preserve all475 historical requirement IDs, original prompts and full M1–M6. CSV SHA256 b82ed1f392f70030d5e0a6bad930eeaaa8807eb58886c831275c89a448609643 is unchanged. New13November GPU-lightmap/adaptive-export/Stubbs/ownership additions are requirements, not implemented acceptance.

User files are sacred: originals, ISO/maps/mods/tags/SDKs/runtime installs, current source/history/stash and accepted C49/c035/dc/preview5 builds stay protected. No new branch/worktree/clone/archive/SDK warehouse, unsafe security changes, unapproved install/download/external writes or remote publication. Use existing bounded external owned scratch. Physical human/peer/headset/platform gates stay open without stopping independent safe engineering.

## Verified milestones

14November current hosted CI43090598198/sourcea045ea7: both Linux130766442288 and Windows130766442745 pass native storage and Rust, then fail the same one browser assertion. Empty native meter expected[25,51,76,255], actual hosted[26,51,77,255]. All other279browser checks pass. The older atomic-manifest EIO failure is not current; do not reintroduce it as a new diagnosis. CI logs were inspected read-only.

R638 local original renderer7/7 passes. R639 revised renderer7/7 passes plus TypeScript. Test now independently samples untouched framebuffer and requires exact unchanged transparent pixels; only analytical UNORM clear quantization is bounded at half one byte. No production brightness, shader or renderer quality change. Real hosted rerun awaits owner sync.

R641 full Rust931passed/0failed/9ignored; R643 storage/repository42/42; R644 frontend508/508 in106files; R645 release pipeline14Python+6Node; R646 all59offline programs; R647 contracts/continuity/native diagnostics49/49. TypeScript passes; engine-source index verifies6projects/36behaviors, pinned source/license links but not local research hashes or gameplay. Logs E/resume-20261114/r638 throughr647. Scratch disposed by existing wrappers; Rust output3,275,931,970logicalB/peak3,275,936,421B disposed. None is native Halo gameplay or Linux package acceptance.

R648 current native replay: actual UI preparation/history/Save/restart/native compilation/readback and stale-rules previous-good guard pass. Player profile count0 exposes a missing deliberately equipped start. QA app07c434461f6ff288d68285ccca00bc1ec90c2dd4cadde21193b71be4ea9b0111/50,628,608B, runtimeFP9f5e16c297c46cee7db7e48a91654390383cae8db50e14beb275a9a0b41f9083; native cache/scenario hashes match R621 below. Build208.407s/native132.094s,0errors/2normalcloses/originalsunchanged/owned2,271,317,328logicalB disposed. E/resume-20261114/r648-native-firefight.json/log/screens. No game/combat acceptance.

Prior native Firefight R621: standard actor encounters, HaloScript, immediate Save/Undo/Redo/restart and source-backed singleplayer cache13 compiled/read back. App3f46fc03bc8c1288541b6772ee900158ea584c3f3d1a05e2a52b0b646ab10685; map257cc1fc0d36296d2c5964577dcc777d0d1847c920c4feacb9bf0344bf16b4fe. No game launch/combat/player-led waves/HUD/peers accepted. Exact prior evidence FIREFIGHT_ENGINE.md.

Prior public Windows preview5 is source d832af36cb55ecd55d6c0730c24c13f90594424c, not current master. Five real assets independently downloaded/hash-verified10Nov; source-matched local installer/portable startup and uninstall passed. Accepted C49/earlier releases unchanged. Exact receipts/hashes RELEASE_CANDIDATE_20261108.md. Remote mastera045ea7 has later owner README/checksum changes; preserve them. Prior rejected direct-master push must not be bypassed.

Prior M2 R398: three editors, frozen CE compile/readback, two real same-PC private Chupathingy clients, guarded Live Rebuild and server-crash rollback. Separate MCC R396 source/native compile. Not human gameplay, AI parity, remote computers or all M2. Evidence CHUPATHINGY_DEDICATED_20261108.md and C39_NATIVE_CONTENT_ACCEPTANCE.md.

M3 R277 connected CE cachee048b11b1a50027307f60ae0a45222f9e2035e501a95319f8e89d9487d7528ce;287connector/32252source/15862render/16230collision triangles. Physical human-verified region connections0. Foot/Warthog/ridge/cave/projectile/light/material gates precede19regions. NATIVE_ASSETS_AND_SHOWCASE.md retains source-native renderer evidence and open game-parity gates.

## Changed work

Verified implementation files: runtime_mods.rs, runtime_mod_archive.rs, storage.rs, tests/ui/fixtures/haloMaterials.ts, tests/ui/halo-materials.spec.ts. Existing native pack writer now reuses project::atomic_write_checked/FileRevision rather than another unguarded rename writer. It checks reviewed file identity/hash, refuses hardlink aliases, tracks its actual create-new lock handle and exact bounded lock bytes, preserves replaced/changed locks and rechecks before archive adoption. Five adversarial fixtures pass. No actual runtime install/config was changed.

R640 first focused Rust compile failed because runtime_mod_archive still used the former tuple guard; corrected before R641 full pass. Keep this failure in evidence; do not count it as passed.

## Failures and blockers

- Current hosted CI repair is locally verified only; owner must push/invoke runners. No unauthorized push or repeat same failing source run.
- No Linux environment: WSL not installed, no Docker/Podman or nominated remote host. Existing release.yml builds genuine AppImage/Deb and requires both real Xvfb native startups before sealing. Windows/core Linux CI is not package acceptance. No WSL/system installation performed.
- storage.rs recursive check-to-delete race, atomic metadata final check-to-rename race and exact external native-setting write approval need further hostile fixtures/repair. This increment does not declare complete file-safety closure.
- Real native pack loaded-content enable/disable/persistence still unaccepted. Unit adoption is not engine content proof.
- Firefight player loadout, actual hostile combat/player-led waves/scoring/HUD/victory/defeat and real peers remain OPEN. Original Zombie carrier, persistent Extraction,19regions,VR,Interface Studio,all workflows/platforms stay open.
- Physical two-PC LAN/VPN, additional monitors/DPI/headsets, clean-machine and macOS/Linux release acceptance need appropriate environments. Preserve pending tests in HUMAN_TEST_PLAN.md.

## Operations and safe checkpoint

E = C:/Users/patri/AppData/Local/Temp/GuiltySpark-Engineering-d49eb02588bf (private small receipts/logs/screens; no public Halo payloads). Source-only disposable workspace owner GuiltySpark-Development-d49eb02588bf. R642browser complete/exit0:280passed in10.8minutes, scratch disposed. R641Rust1817 has exited0 and disposed output; other listed completed test sessions exited0. No owned game launched in this increment. R648 native source/control test is now complete; no process or temporary native tree remains.

Before native operation: use current source only, existing verify-source-only.mjs/test-firefight-native.mjs, owner-installed HCEEK archive/tool and Invader, bounded dependency closure and original-hash checks. Never replay an obsolete whole .local tree. Previous native QA is stale when runtime fingerprint changes.

Historical exact checkpoint/source/evidence retained in master05efc661 and ACTIVE_TASK.previous.md. No original data, source history, release artifact or requirement was removed to shorten this checkpoint.

## Deferred requests

Preserve M1 Windows creator/release; M2 Live creator→game; M3 natural three-route and19region MegaWorld; M4 Zombie/Firefight/campaign combat; M5 persistent timerless Extraction/AI Apocalypse/community; M6 native asset/BSP/tool/machinima/Learning Center/Windows-Linux-macOS/VR/frontier. Existing MASTER_FEATURE_LEDGER/25prompts and later directives remain authoritative. Readiness must distinguish implementation/tests/readback/compile/load/human/real peers/clean platform. Full475CSV unchanged; no competing queue or synthetic completion percentages.
