# Active engineering checkpoint

Task: Operation110 - verify Black Echo faction use, rescue, and extraction
Status: awaiting human verification
Starting revision: 8eaffb29b03c2d8812f06e26d590e289240d4014, canonical master.
Latest verified revision: 8e8d3312 on 098a5d79 proved two-client deployment, boarding, outbound flight, field landing and both exits before the installed turret blocked the old raw rider count. Candidate 7b3940f6 independently reads back direct player occupancy across all 14 native Spirit seats. Windows unchanged-Save recovery passed separately.
Next action: Pair-test exact 7b3940f6 on the reviewed Forerunner build. Confirm the former-passenger signal and empty return after both exits with the original installed turret seated. Continue through recall, rescue, combat and settlement. Original Save37944 remains open.

## Acceptance

Latest final-master e210fbc9 is preserved in Master Engineering Prompts/GS_2026-11-16_Final_Master_Engineering_Directive.txt; full scope remains active.

Owner's current Engineering Correction d377d97b and Development & Verification/Velocity/Simplicity directives supersede code-only: prioritize implementation; focused tests and compilation after meaningful/shared changes; fix regressions; integration checks at milestones; avoid repeated full suites. Keep one primary deliverable in progress and complete connected UI/backend/native/history workflows. Comprehensive UI/multiplayer/hardware/platform/gameplay acceptance is reserved for stabilization; targeted regression smoke checks remain authorized. No push/publication or Forerunner writes. Source, automated, native, game and human evidence remain distinct.

Full Operation110, M1–M6 and all475 historical requirement IDs remain active. Updated goal6abac492, anti-overengineering8e568da0 and unified Spark–Forerunner65a424af are preserved in existing Master Engineering Prompts. Spark authors; Forerunner executes. Owner explicitly provides D:/Project Forerunner. Only Spark is modified. No new runtime manager/editor/queue/contract system, branch/worktree/clone/archive, push or publication. Preserve original Halo files/ISOs/maps/mods/tags/SDKs/runtimes, source/Git/stashes and accepted C49/preview5 releases. Owner subsequently authorized bounded automatically deleted external test output for native checks. All source work stays in D:/Project Guilty Spark; no other project writes, persistent test warehouse, policy bypass or unrelated Codex cleanup.

## Verified milestones

18Nov passenger insertion: the existing dropship controller records a living rider after grounded disembarkation. Mission Director can require this event on a named Spirit or Pelican pad. Three browser workflows, 55 unit tests, 24 Rust tests plus one skip, TypeScript and installed Invader pass. Disposable CE609 76441903 preserved the Pelican mission and independently read back the Spirit arrival source. Full paired receipts, pad survey and limits are in RUNTIME_INTEGRATION_20261107.

18Nov insertion crew standby: the existing transport editor can keep a deferred insertion troop out of combat until its captured actor disembarks. Four browser workflows, 25 unit tests, TypeScript and a5bf6680 native compile/readback pass. The new candidate still needs native flight and combat validation. Direct 70641e81 run stalled at the rally-to-pickup lane. Sampled BSP and posed Spirit collision did not intersect at infantry heights. Current evidence and hashes are in RUNTIME_INTEGRATION_20261107.

18Nov Black Echo optional Flood route: the native containment box no longer overlaps the pickup. Mission Director branches can remember an area visit during an earlier weapon collection in the same scope. Browser six, frontend 54, Rust 24 plus one explicit skip, HaloScript checks and native CE609 compile/readbacks pass. Scope, full candidate hashes and companion results are in RUNTIME_INTEGRATION_20261107. The exact new cache has not been played.

18Nov Black Echo faction body and technology: Spark’s existing native faction editor now reviews a nonautomatic native biped and signed permutation for an accepted kit. CE609 2c8990af and a disposable random-permutation build passed native compile and both readbacks. TypeScript, Windows cargo check, six Rust tests and three browser checks passed. Exact paired 05415099 verified a living rally, Covenant combat and physical technology ownership on both clients. The next gameplay gate is the Flood branch before defense and evacuation. See RUNTIME_INTEGRATION_20261107.

18Nov Black Echo field approach: the same native route reached the target from the usual boarding pose but stopped north of the field volume from a farther, reversed pose. Candidate 539f6fa0 adds a separate above-pad alignment command before the original descent. Eight compiled BSP legs from the two observed origins were clear. Native compile and both readbacks pass. The new candidate still needs paired gameplay. See RUNTIME_INTEGRATION_20261107.

18Nov Black Echo rescue rally: opt-in player presence in the existing rescue volume survives project history, Save and source review. New Black Echo drafts enable it. The corrected CE609 cache 05415099 preserves 13 scripts, 17 globals and 3,313 tags in order. Independent scenario readback matches exactly. Forerunner gameplay of the new cache remains open. See RUNTIME_INTEGRATION_20261107.

18Nov paired Black Echo 833f7081: both authenticated Covenant players used the native faction terminal and deployed. A separate UNSC run reached rescue and spawned technology on both clients. Marine health went from full at tick 4830 to a death at tick 5370, before the first recorded player engagement. Both observed walking stalls have floor support and clear sampled compiled BSP traces. See RUNTIME_INTEGRATION_20261107 for the exact receipts and remaining gates.

18Nov native terminal interaction sides: the existing device placement editor reviews a per-control two-sided flag. Four device tests, 16 native Logic tests (four ignored), four browser checks, TypeScript and the offline core build pass. Invader CE609 compile and independent readback confirm the only edited field. The exact 833f7081 paired UNSC run clears boarding, flight, landing and disembarkation. Rescue approach and later gameplay remain open. See RUNTIME_INTEGRATION_20261107.

18Nov Black Echo Covenant terminal 833f7081: native range and marker orientation explain the missed north-side use prompt on 0ec0. The corrected placement preserves the other controls, both aircraft, all scripts and the BSP. Native compile and both readbacks pass. The paired 7074 approach reached one physical boarding and outbound climb. Host and guest disagreed about the guest position below existing ground, blocking paired departure. Exact traces are in RUNTIME_INTEGRATION_20261107.

18Nov Black Echo apron candidate 7074cffc: exact paired trace showed a pre-boarding turn while the pilot was idle. The existing native placement and route editors move the Pelican to a flatter pad farther from the approach and realign the climb and hub landing. CE609 compile, independent Invader readback and 15 compiled BSP leg checks pass. The new exact gameplay gate remains open. Evidence and retained path are in RUNTIME_INTEGRATION_20261107.

18Nov Save publication: a Windows session database refusal reproduced a changed descriptor after failed Save. Session draft and baseline writes now stage before descriptor and recovery publication. Focused core84 and native seven-objective, 42-edit workflow passed. The original intermittent Save37944 report has not been linked to this cause. Paired Black Echo 51ba08d6 reached successful native Marine rescue, Covenant combat and technology spawn. A separate trial rejected two outgoing Pelican commands. Full hashes and boundaries are in RUNTIME_INTEGRATION_20261107.

18Nov Black Echo Marine rescue: paired predecessor flight and disembarkation passed. The Marine remained stationary after squad transfer. CE609 candidate 51ba08d6 adds a grounded native command route with 22 waypoints and passes independent readback. Evidence and hashes are in RUNTIME_INTEGRATION_20261107. Candidate gameplay is pending.

18Nov native flight-leg review: the old Pelican takeoff registers its documented crossing at 26.552% of the leg. All nine revised Black Echo command-order legs show no interior crossing. Windows controls verify aircraft start, three outbound legs, a deliberately obstructed draft and reset. Browser4/core15 pass. Exact map/app hashes and disposal in RUNTIME_INTEGRATION_20261107. Gameplay is open.

18Nov read-only windows: fixed the save attempt that blocked closing, moving or opening another view of a dirty map. Nine browser checks and nine Windows history cases passed. Revision 8 and the saved descriptor stayed identical during the read-only actions. Exact hashes and disposal receipt are in RUNTIME_INTEGRATION_20261107.

18Nov Pelican route 0ec05e41: actual paired predecessor trace matched the collision BSP obstruction. The fresh CE609 candidate preserves unrelated scenario data and verifies nine revised route legs. Build/source/readback identities and engine boundaries are in RUNTIME_INTEGRATION_20261107.

18Nov workspace transfer: reproduced missing Pop out IPC and Close prompt while render frames were held. Fixed both along with background writes in observers. Actual Windows Workshop moves and closes with the WebView render callbacks held. Selection, independent ownership, explicit Save, press/release drag, reopening and Undo/Redo pass. RUNTIME_INTEGRATION_20261107 has exact hashes and test evidence.

18Nov project snapshots: reproduced restore leaving the pre-restore Undo head and descriptor. Windows fix durably restores the chosen checkpoint, backs up the current unsaved edit, refuses a stale revision and preserves Undo/Redo across restart. Frontend29 and Rust16 pass. Exact receipts and scope in RUNTIME_INTEGRATION_20261107.

17Nov P8_BUMP gold-face preview: verified owned Halo palette, exact CE609 and Halo Xbox mip chains, actual Windows texture upload and stable matching native renders. Wrong tables and unrecognized version 5 builds refuse. Rust29/frontend33 pass. See RUNTIME_INTEGRATION_20261107 and the retained gold-face crops. Game parity remains open.

17Nov Save recovery isolation (parent27b854d): embedded native Window History acknowledges edits, Undo and Redo while a genuine optional checkpoint failure keeps the descriptor and latest recovery head hash-identical. Explicit Save correctly refuses until the owned blocker is removed, then persists the exact draft through full restart. Frontend25/browser5/Rust11 pass. Exact app/disk hashes and limits in RUNTIME_INTEGRATION_20261107.

17Nov arch(parent54c1984): repaired generated roof refinement, f32 collision fins and redundant portal contours; unchanged quality/budget/source transforms.83BSP+2explicit skips,CEprofile3,native CE609/Invader readback/Windows3 actual controls PASS.194connector/32460total triangles;869samples each way/68spawns. Remaining Tool warnings/gameplay gates in MEGAWORLD_SEAM_ROUTES_20261108; R157 retained.

17Nov Black Echo939cea8/ground5a7a53a/radio4339020/recovered0b57e8c/attachedaa7c7f3/insertion(parent234b6bb) retain scoped source/browser/production CE609 proof, full hashes and limits in RUNTIME_INTEGRATION_20261107 and Git; Windows/game gates OPEN.

17Nov crew/factions/moving milestones234b6bb/01d108b/7fe4041: retained source/native evidence in RUNTIME_INTEGRATION_20261107; Windows/game OPEN.

16–17Nov flags/guidance(parent1ce17fe), independent squad50837f2, squad hubc2e6797 and Forerunner admission retain exact source/browser/CE609 hashes, tests, fixes and limits in RUNTIME_INTEGRATION_20261107 and Git. These native-source passes do not accept Windows/gameplay.

16Nov retained HUD (parent c911f04): production CE parent→working-tags radio revision now passes with actual staged custom-HUD reference/table and no generated ownership or overwrite. Five sound hashes and original input identities preserved; conflicting edited tag refuses and keeps prior-good map. Native1/core17+1explicit skip/core all-target/browser1/guide4 pass. Exact hashes/setup corrections in RUNTIME_INTEGRATION_20261107. Native Windows/game gates OPEN.

16Nov recovered radio (parent bbbfe21): existing solo CE609/MCC13 UI/import/history/source build staging now includes immutable sound without replacing edited tags. Native typed sound path crash fixed; exact prior generated drafts upgrade safely. Frontend51/core17+imports4/browser1 and companion4/guide4/Windows all-target/TypeScript-Vite pass; actual Pelican+Spirit CE609 compile/readback preserves5original sample hashes. Exact source/cache/scenario/test-exe hashes, initial failures and boundaries: RUNTIME_INTEGRATION_20261107. Complete Windows working-tag job/restart/audible playback/game remain OPEN.

Cameras bbbfe21, faction kits b24bac4 and pilot/Spirit defc08c retain their scoped source/browser/CE609 compile/readback proofs, exact hashes, controls and negative cases in RUNTIME_INTEGRATION_20261107 and Git. Actual Windows/full restart/gameplay remain OPEN.

Deferred pilot/named technology/deployment milestones027c8c0/08500da retain exact scoped tests, hashes and native evidence in RUNTIME_INTEGRATION_20261107 and Git. They remain accepted in scope, not gameplay.

4249bb5 recovered composition/native slots/HUD preservation is accepted in scope; exact tests/source/native hashes and guard corrections remain in RUNTIME_INTEGRATION_20261107 and Git. Native Windows/gameplay remain OPEN.

d5870e1 BSP/native point surface repair retains its exact native/cache/source hashes and tests in RUNTIME_INTEGRATION_20261107 and Gitd5870e1. Targeted Flood/route warnings cleared; collision-space membership, surface association and actual clearance remain distinct. Native desktop/gameplay gates remain open.

Prior recovered7-beat/native collection authoring (74c16ac) and mission source→CE609 readback (bb8e906) retain their exact scoped native/browser/history/Save evidence in RUNTIME_INTEGRATION_20261107 and Git. Source/path/recipe/handwritten ownership and all475IDs preserved. No complete Black Echo/flight/gameplay acceptance was inferred.

Native flight/route milestones78c01b2/e2879a6 retain exact scoped hashes/tests/clearance limits in RUNTIME_INTEGRATION_20261107 and Git. Gameplay remains OPEN.

Prior CI/setup and P0 fixes fbcdc8d/e3f0e2d retain root-cause/worker/ordering evidence in RUNTIME_INTEGRATION_20261107.17Nov current recovered Windows42-edit/Save/restart/HUD/native readback passes; broader37944 and hosted CI remain OPEN.

16Nov native cinematic area: saved existing-volume activation/history/Save/restart, startup-source generation, CE compile/independent enabled+disabled readback pass in one fresh Windows run,5normal closes/0page errors. Drawer Save only staged: fixed App binding to persistent Save; browser checks all3Save entrypoints. Frontend36/core18/creative16+1skip/browser6/TypeScript/Vite/Windows pass. QA68860/run-vGibcv CLOSED:3455554819 logicalB disposed; physical reclamation unavailable. Exact failures/hashes: RUNTIME_INTEGRATION_20261107.475IDs/legacy/originals unchanged; no game/37944/full-suite claim.

Reuse historical evidence; run proportionate focused checks under the updated policy:

- R689 actual Windows ammunition/history/Save/two restarts/native Tool/independent readback accepted in scope. Exact cache/scenario hashes and compact-layout evidence remain in FIREFIGHT_ENGINE.md/UI_INTERACTION_AUDIT.md and Git. Failed changed-rules build preserves previous-good; no game acceptance.
- R688 TypeScript/two browser paths/eight viewport sizes pass; not eight-native-display acceptance. R690 existing Firefight Rust14/14. R686 full Windows Rust960passed/0failed/9explicit opt-in skips; source835a3cf lease repair. SOURCE_ONLY_STORAGE_POLICY.md retains exact scoped preservation evidence and remaining native namespace/non-Windows limitations.
- R691 reproduced linked Chupathingy preview choosing MCC13 instead of Xbox5; terminal exit1, original Blood Gulch SHA50fe52406f075d975e24100a65b26ff696458023dd3509878953052ab0ef858f unchanged. Owned scratch disposed. R692 fresh selector build passed four actual source/tag IPC checks (MCC13/CE609/OpenCE5/Chupa5), then failed the real Library/Create a map path before final original hash verification. See NATIVE_ASSETS_AND_SHOWCASE.md; do not promote its partial result.
- M1 imported source editing already reached actual edit/history/Save/restart, correct source writer, dependency refresh, native CE compile/readback and exact private Chupathingy map loading (R277). NATIVE_SOURCE_TAG_EDIT_20261108.md is authoritative. Human fidelity/traversal remains independent; do not restart this accepted scope.
- M2 R398 three editors/frozen CE source/native compile/two same-PC private Chupathingy clients/guarded rebuild/recovery pass. CHUPATHINGY_DEDICATED_20261108.md and C39_NATIVE_CONTENT_ACCEPTANCE.md retain boundaries. Not two-physical-PC or human multiplayer combat acceptance.
- M3 R277:287connector/32252source/15862render/16230collision triangles; human-verified region connections0. Native/readback/map-load evidence does not close foot/Warthog/ridge/cave/projectile/material/light gates or19regions.

## Changed work

The projectile field wraps the full selected path and the open list expands toward the model viewer to fit long choices. The desktop frame and tint share the same viewport inset and outline. TypeScript and seven focused Windows Edge tests pass, covering 800 and 1500 px, emulated 150% scaling, selecting the end of a long choice, restored corner hit testing, fullscreen/maximize transitions, Object Tags, Undo/Redo and Save. Earlier isolated Windows build 43ce062c72a2c5483e988c1479b35d991713cf6a9a5d0e7ce6b021a0a6a042f9 verified the actual Blood Gulch pistol list and unchanged original map. The layout follow-up has no fresh desktop-binary verification.

New encounter authoring carries a chosen major-variant upgrade policy through one-group and queued preview, native scalar verification and compiled expectation. Legacy requests and controller-owned Firefight use their prior defaults. Existing recipe-owned restrictions still apply. Native operations 26/26 including installed Invader, ownership 1/1 and combined picker/frame/encounter browser checks 4/4. Actual Black Echo pilot adoption and gameplay are still open.

Current scoped slice(parent8693c4f): original-native squad migration/major policy through existing UI/Invader/readback; recovered Marine seat revision; scenario-only complete4MiB source review while display/non-scenario512KiB/integrity64MiB/5s guards remain; bounded error messages. Pistol projectile labels now sort/disambiguate existing choices with explicit unresolved references; no gameplay presets added. Exact tests, corrected failures, source/executable hashes, native artifacts and limitations:c40 nativeSquadCrew20261117/RUNTIME/UI_INTERACTION_AUDIT.

Current verified source through45763a8: recovered actor dependency import, source-backed native palette, Source Guardian full-field hashing, protected source merge, saved-profile recovery, and native build-history persistence. Exact hashes/actions/tests/limits remain in c40-native-save-integrity.json and RUNTIME_INTEGRATION_20261107.

Committed Spirit slice f72ce07: native trigger append/viewport review, controller ownership distinct from protected native fields, retained owned actor listing, explicit pose-only append revision preserving actor/population/wave ownership, and shared Forerunner extraction-area guards. Corrected pilot native compilation/readback passes. Actual controls authored two separate Spirit pads/routes, shared-area bounds and raised aircraft; HSC Undo/Redo/Save/full restart passes. Final native compilation/readback/export/Open compiled map/Save/full restart/reopen passes;3BSP warnings cleared,18media warnings remain. Exact evidence:nativeSpiritAuthoring20261117. No gameplay or physical desktop-input acceptance.

Older detailed source/check summaries were consolidated here to keep the existing checkpoint bounded. They remain unchanged in45763a8:docs/ACTIVE_TASK.md, the Verified milestones above, RUNTIME_INTEGRATION_20261107, UI_INTERACTION_AUDIT, HUMAN_TEST_PLAN and their cited fixtures/commits. This changes no requirement status or historical evidence; all475IDs and M1–M6 remain.

## Failures and blockers

17Nov current candidate dee2d9a7 compiled and passed independent Invader checks with the compatible Spirit pilot, revised touchdown pose/return route, Pelican seat and both Marine flags. Prior entries below are historical. Runtime startup in the private profile did not confirm a map load. Full physics/AI and two-player mission acceptance stay open. Exact native identities in RUNTIME_INTEGRATION_20261107.

Latest Forerunner gameplay evidence remains7ec2: Spirit up.k .918 needs>=.95 and old Grunt lacks c_dropship driver. New retained fdc6 candidate independently verifies both be_marines migration flags1 and13P-riderLM/0LF script references, preserving13scripts/17globals; it has not been launched. Compatible pilot import Preview/Accept/Restore passes after complete scenario-review repair, but the appended group remains recipe-owned and its exact-variant upgrade policy must be authored/reconciled before adoption. Retained source/pilot-unverified.scenario is a draft, not a compiled/gameplay fix. Actual pathfinding, seats, landing and complete mission acceptance remain OPEN.

Current: releases/black-echo-native-crew-20261117 retains partial native candidatefdc6, matching sourceSCNR6d711c28, reviewed HSCd0765076 and explicitly uncompiled pilot draft5e4b41e7. Old7ec2/source71e6 remain protected. No game launched in this slice; five-terminal use, flight/boarding, objectives/audio/combat/extraction/settlement/two clients, reflection and broader37944 remain OPEN. Embedded CDP controls are distinct from physical desktop acceptance.

- Campaign native counts/individual poses now pass scoped source/browser/actual Windows history/Save/restart/MCC compilation/independent readback. Actual runtime difficulty mapping, actor spawning/health/damage/tactics, AI navigation, human/all-axis/CE/peer gameplay remain unaccepted. Recipe-owned Firefight overrides still refuse.

- Recovered campaign source now has scoped real Windows module selection/edit, project Undo/Redo, Save/restart, CE compile and independent readback proof. Arbitrary file/search breadth, cancel/stale/native negative outcomes, complete structural/cinematic mission editing and gameplay remain open. Native Restore is distinct from project draft Undo; no full native history acceptance inferred.


- Native mission actions WIP: HUD generation/reference/readback, source compatibility, UI/history/Save/restart, safe-save restoration, actual level completion and First Contact gameplay are UNRUN. Focused checks are now authorized; an HSC request is not a saved checkpoint or accepted ending.

- Mission data reconciliation/review/adoption passes scoped source/browser/native checks (0b57e8c and current combined evidence). Independent editor synchronization, Windows history/Save/restart and game/peer gates remain OPEN. Studio metadata still needs explicit review/adoption; it is not an automatically synchronized transport document.

- Mission attachment WIP: all execution/native/game/history/Save/restart gates are unrun. Peer source modules do not by themselves synchronize Creator Studio mission data; explicit reconciliation is the next implementation, not a reason to disable stale binding checks. HUD objectives/checkpoints/ending/AI viewport and combat remain incomplete.

- Authored campaign encounter counts/poses/patrol/firing/tactical source now pass scoped Windows Save/restart/native MCC/readback. Original-native structural/squad/command-list editing, actor previews and AI/navigation/combat remain incomplete; source and cache acceptance do not establish gameplay.

- Campaign/loadout WIP: typecheck, compilation, UI Save/Undo/Redo/restart, profile semantics, dependency staging/readback, SparkLink peers and engine application are unrun. No playable Extraction, inventory persistence or new runtime capability was established. Existing native controller and source preservation guards are retained.

- Native control pose/UI/Restore/Save/3restarts/CE device/name/palette readback passes; real machine/door/collision/gameplay, native Undo and other targets remain open. Not playable Extraction/persistence acceptance.

- Current source: frontend/backend compilation checks pass. Full UI/discovery/profile persistence/window isolation and native source-preservation workflows still await stabilization. No new packaged executable represents it.
- Historical R692 creation failure is repaired and scoped Windows create/Save/restart/textures passes. Earlier create-OjDwa6 Interface Studio navigation anomaly was not reproduced by later instrumented runs; not claimed repaired. Native newly authored cache compilation/AI/gameplay and complete UI/history/companion acceptance remain open.
- Joint Spark→Forerunner authored original-Zombie encounter loading/score/completion remains unimplemented/unverified. Preserve original carrier/spawner/audio recovery and source provenance; no stock-enemy replacement, guard removal, synthetic gameplay, private-memory or chat-console fallback.
- Firefight combat, score/HUD, defeat/victory, AI parity/real peers and human gameplay remain OPEN. Windows release-current-source, Linux/macOS/headset/physical displays/two-PC and all M3–M6 independent gates remain OPEN. Prior hosted CI failed a framebuffer assertion; local test-only repair awaits owner source sync/rerun. Do not revive older resolved atomic EIO diagnosis.

## Operations and safe checkpoint

18Nov control-side run-w9uCnP closed. Owned native output of 1,008,128,495 logical bytes was disposed and the root is absent. Existing game trials are tracked by their Forerunner receipts.

18Nov run-LRDY8K closed. Spark stopped only owned Forerunner PID4580, retained its diagnostics through stop, and exited0. Disposed 3,023,142,765 logical bytes, root absent, runs/issues zero. Retained exactly the new map and its two source files (113,362,688 bytes).

18Nov run-f7IUXC and run-94ldKr closed. Their owned test apps and scripts exited; temporary output disposed 2,081,487,353 and 2,168,372,640 logical bytes. Both roots absent with zero development runs or issues.

18Nov run-qjZQox closed. All native test writers exited and owned scratch disposed 2,245,630,569 logical bytes. Physical allocation unmeasured. Run root absent with zero development runs or issues.

17Nov run-4VnRhV closed. Two isolated embedded apps exited0. Temporary output disposed 2,274,487,462 logical bytes, root absent and development runs/issues zero. Only the verified 10,170-byte screenshot crop was retained.

17Nov run-ItuFaA closed, 2,209,867,051 logical bytes disposed. Temporary run absent, development runs/issues zero. Both test apps closed normally. No SDK prep, game or remote work.

17Nov run-hH9GHn closed. Spark and the isolated Forerunner process exited. Owned workspace disposed 3,751,531,999 logical bytes. Root absent, no development runs or issues. Latest cache and two reviewed files independently hash-verified under releases/black-echo-native-pilot-landing-20261117.

QA61647/run-wsWoBU,91709/run-0v0sq0 and50103/node12444/run-kXE610 CLOSED/absent; app18840 closed0, all writers exited. Initial cleanup refused100000entry cap despite166219entries admitted under200000; shared-cap source fix5focused storage checks pass. Existing dead-owner recovery disposed11247798547logicalB, receipts retired, root absent/runs[]/issues[]. Large-tree physical reclamation unmeasured. Candidate7ec2/source71e6/HSC3ff1 retained and freshly hash-matched. Experiment2a10 disposed; original terminal9a0e restored beforehand. Native app05fda346 predates camera-mode fix. QA61093/node run-gzri03: native apps17232/19792/6704 closed normally; all test/build writers exited. Existing sealed cleanup disposed4180915095logicalB; physical disposal allocation unavailable. Root absent, development storage runs[]/issues[]. Four retained candidate/source files total112361259B; exact copied hashes match. Exact native candidate/source retained and hash-verified outside disposable output. Do not kill unrelated Forerunner clients or dispose protected historical inputs. No game/Forerunner writes/push.

17Nov seam QA Node17603/run-U2tZRe CLOSED: all owned writers settled; disposed1,933,265,960 logical bytes, peak1,957,455,356; last allocated1,909,313,696, disposal allocated unavailable. Run root absent/runs[]/issues[]. Original maps/banks and2,506 extracted file hashes unchanged. No app/game/Forerunner write/push. Exact diagnostics and source hashes in existing native-terrain fixture.

QA28750/run-ftk6Wy and run-isvZ4C CLOSED: 499041826/28907163logicalB disposed; native allocation unavailable, frontend allocation29153432B. Both roots absent, runs[]/issues[], all writers exited; exact receipt: RUNTIME_INTEGRATION_20261107. Protected hashes/stashes unchanged.

Earlier owned QA roots remain closed; exact receipts survive in RUNTIME_INTEGRATION_20261107/UI_INTERACTION_AUDIT and Git. No old jobs revived or checkpoint duplicated.

Interrupted legacy run-8Ak6hz remains protected; PID11588 was reused by unrelated conhost, never kill/recover it. Preserve both manifest compatibility aliases, all Git refs/stashes, C49/preview5, original Halo maps/tags/SDKs/runtimes/ISOs/mods/source and475IDs. No replacement tracking system/archive. Full Operation110/M1–M6/master Goal remain incomplete.

## Deferred requests

M1 Windows creator/release; M2 live creator→game; M3 natural three-route/19region MegaWorld; M4 original Zombie/Firefight/campaign combat; M5 timerless persistent Extraction/AI Apocalypse/community; M6 native asset/BSP/tool/machinima/Learning Center/Windows/Linux/macOS/VR/frontier. Existing MASTER_FEATURE_LEDGER/CSV and prompts remain authoritative. Native tags/maps stay standard; metadata and engine extensions remain separate. No invented progress percentage or plan-as-acceptance.
