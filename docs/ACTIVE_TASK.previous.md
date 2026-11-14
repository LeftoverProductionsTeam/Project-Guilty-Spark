# Active engineering checkpoint

Task: Operation110 — restore current CI, protect user files, then native Firefight acceptance
Status: implementation incomplete
Starting revision: 1ecbc6826dbe6ab23e0852b6117792aae3babcea, canonical D:/Project Guilty Spark local master; verified CI/pack-ownership/source-readback checkpoint committed14November.
Latest verified revision: 1ecbc6826dbe6ab23e0852b6117792aae3babcea. Current loadout WIP passes510frontend,280browser and focused14Rust; R651 actual UI Save/restart/native compilation and independent starting-profile readback pass, but optional game review times out. Full Rust R655 is running; no gameplay acceptance.
Next action: Collect R655 full Rust (session85635, E/resume-20261114/r655-rust-workspace.log). Retry the current native loadout build with source-matched E/qa-firefight-r651 app after storage releases; corrected harness closes the app/game before cleanup and hashes original inputs even on failure. Inspect genuine player/AI state, not launch alone. Finish evidence/manifests and commit verified scope locally; no push.

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


R651 current loadout source builds and independently reads back standard gs_firefight_start, pistol12loaded/72reserved, health/shields1 and two native encounters. Map7b3f9bcb0857d8ae6f918edc065c01c5c056c35c4349a0d6ba8d522883353d03; extracted scenario04ad62c679816d265a83d38092a338a5a07613dea488726cd07b562041f023c9. QA appf8a8d430c4001a36d124e5d624b52eb1eab1701236228fc453f6845f1c2b6a49/50,772,992B, runtimeFP1f65010b6884549d3f763850f65597415af07ce2b42a9ca36e6deeb617abe643. Optional native SDK review reaches an actual Halo window and scripts rebuild, but no weapon/combat is verified.180second review timeout followed by EBUSY cleanup: harness killed only app, leaving owned game35224. Computer Use now works; activated that returned Halo window and closed only it normally withAlt+F4; fresh window inventory is empty. No terminal/UI workaround or unrelated process touched. Harness now normal-closes app inside callback before workspace cleanup, uses existing stopQaProcess owned-tree fallback, and hashes staged publisher/archive inputs on failure. Full game and cleanup retry remain pending.

R652 current full browser280/280 in10.3min, output26,462,298logical/26,597,504allocated-fileB disposed. R653 current full frontend510/106files; R649 focused10 and R650 focusedRust14 pass. R654 was refused before running by the aggregate storage budget; no limits were raised. R655 now safely recovers the dead R651 owner after game close and runs full Rust.

## Changed work

Current WIP after1ecbc68: optional nativePlayerProfile in existing Firefight metadata/controls, standard scenario starting profile and weapon dependency closure, explicit guarded player_add_equipment at round start, backward-preserved legacy generated source, extended native readback and optional owned-game review. Tests R64910frontend/R65014Rust pass. No claim of new native compile or game acceptance yet.

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

E = C:/Users/patri/AppData/Local/Temp/GuiltySpark-Engineering-d49eb02588bf. Current source1ecbc68 plus loadout/harness WIP; exact dirty files must be rechecked before commit. R651 receipt/log/screens preserved externally, complete=false and gameplayVerified=false. Its owned Halo process35224 was closed normally; no Halo window remained. R652 finished exit0. R655 session85635 is the only currently running owned validation; preserve its output until it exits. No game/runtime/SDK original was intentionally modified.

Runtime-source fingerprint pins the explicit reusable QA app; current test-harness-only repairs do not invalidate it. Current runtime-source changes would require a fresh application. Before another native operation, record the new session/receipt and use only bounded existing verify-source-only/native baseline helpers. No full SDK/library staging or replacement archive.

## Deferred requests

Preserve M1 Windows creator/release; M2 Live creator→game; M3 natural three-route and19region MegaWorld; M4 Zombie/Firefight/campaign combat; M5 persistent timerless Extraction/AI Apocalypse/community; M6 native asset/BSP/tool/machinima/Learning Center/Windows-Linux-macOS/VR/frontier. Existing MASTER_FEATURE_LEDGER/25prompts and later directives remain authoritative. Readiness must distinguish implementation/tests/readback/compile/load/human/real peers/clean platform. Full475CSV unchanged; no competing queue or synthetic completion percentages.
