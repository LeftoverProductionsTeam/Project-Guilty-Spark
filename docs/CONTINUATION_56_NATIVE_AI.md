# C56 — Native actors, combat rounds and game-peer recovery

Continues local master from `83a0b2ba9abbf96bc108bb43ff86d0af2ad4adb6`. Original game installations, C35–C55 history, the separate dirty root checkout, earlier failed candidates and the sealed C49 packages remain preserved. SparkLink editor synchronization and Halo game networking remain separate. No engine code, maps, sounds, models or private symbols are included in this continuation.

## Acceptance by gate

| Gate | Current evidence | Still open |
| --- | --- | --- |
| One native actor | An authored practice infantry actor spawns, moves on native navigation, targets another actor, fires, takes combat damage, dies and is removed by its captured unit reference. Exact-build read-only observations; no scripted damage or kill. | Human inspection, long-duration stress, other actor/vehicle classes. This is not the original zombie. |
| Local Firefight | The existing solo exporter builds a real two-wave controller. Native AI combat clears three hostiles, advances wave-clear score 0 → 200 → 400 and reaches completion. Owned corpses are removed. A native rendered run also produces actual game screenshots. | A player clearing the enemies. Allied AI cleared this automated round; no player fire occurred in that rendered run. Native HUD/medals and per-player kill credit are not implemented. |
| OpenCE game peers | Two real game processes observe the same five AI identities, movement, firing, damage, death and corpse removal. A held host also accepts a new client process after the old client exits. | Full lifecycle parity, vehicle combat, verified game-epoch identity, long sessions, other builds and separate computers. Round script globals are host-local. |
| Original Zombie Apocalypse mechanism | The original spawner weapon fires through its native projectile creation effect and produces the compatibility candidate's invisible carrier and seated zombie. No replacement `effect_new` or scripted ejection is used in this test. | Automatic seat release/pursuit, zombie combat/death/cleanup, bursts of carriers and multiplayer restoration. The rider remains attached. |
| Other runtimes | Chupathingy separately loads a native CE multiplayer research map on two processes with valid starts, weapons and placed equipment. The final logs have no classified native faults. | Its sampled shield/ammunition states differ; typed AI lifecycle and a playable co-op round remain unaccepted. MCC candidate compilation fails on a required solo UI dependency. Stock CE's native cache build does not establish multiplayer AI replication. |

The owner chose automated testing now and a human playtest later. No player-cleared Firefight, heard game audio, complete Zombie restoration or universal runtime support is claimed.

## Native controller repair

`ai_erase` alone does not reliably remove a dead actor's remaining unit. The existing `exportHaloCeFirefightRound` now captures each exclusively owned encounter's unit list immediately after placement. Its bounded cleanup walks that list backwards, destroys only captured units/corpses and erases the encounter. A cleared wave retains two seconds for the death animation before cleanup and the authored intermission. Partial spawns and defeat also clean the captured units.

There is no global object deletion, unit-definition deletion, synthetic damage, forced kill, invulnerability or replacement networking stack. Encounters must be **not initially created** and exclusively owned by the controller. The existing solo/one-life/no-revives bounds, finite counts, spawn and wave deadlines, source/build integrity and previous-good output safeguards remain in force. Script score means team wave-clear points, not Halo kill attribution.

Native practice infantry uses an explicitly derived 30-body/zero-shield actor variant with the original marine biped and assault rifle. Combat tests also author safe ground positions, firing positions and allied opposition. Scripted perception establishes opposing encounters' awareness; native AI controls movement, weapons and damage. This test balance and perception setup must not be mistaken for original Zombie Apocalypse fidelity.

The accepted single-actor candidate is SHA-256 `06d31ba42916d612f46b4492dc6f0bcaaa9e3a943452c399e8675b2cbdb08952`. Its hostile unit `3799973894` fires, loses health from 1 to a negative value, receives the native death flag and is later absent. No classified native faults occur in that run.

The rendered solo-round cache is `9d9c1f5ecf12873eba262dc07f12822f04b2e09113d0410cbe1e7f9df0999eaa`; its controller is `6b8167bf57474b822a56f76e300d5583ef17624172d2e954024ddffedd6f2a6f`. Native globals show wave 1 at tick 253, score 200 at 738, wave 2 at 829, score 400 at 950 and completion at 1041. All three hostile corpses are subsequently absent. Compilation uses Invader's script compiler and classic Halo Tool, with independent cache identity/header checks. Compiler warnings, including missing optional classic solo UI content, are retained. A successful native build is not a claim of warning-free compilation or human gameplay.

## Actual game networking and reconnection

The exact publisher OpenCE build-335 executable and its matching PDB are verified before and after capture. The observer opens a **read-only** process handle. New fields resolve the actual target through its salted native prop entry and report damage/pathfinding metadata. Child coordinates remain parent-relative; they are not automatically treated as out-of-world actors.

The runner attaches observations after the first native playing-tick marker, retaining the full earlier log. Old captures that include menu-to-game tick resets remain refused. No continuity rule, identity check or position tolerance is relaxed. Lightweight actor observations now sample at 50 ms to reduce phase aliasing between independent 30 Hz games; expensive detailed censuses remain about once per second. The same bounded duration, byte cap and complete identity/readback footer remain required. Legacy 100 ms captures retain their stricter sample-count bound.

The initial scoped pair records **404 exact shared ticks**, five shared AI identities, five moving actors and four firing actors. All **1,094 host AI unit-ticks** have matching client identities and tag IDs. World-space position error is median 0.01856, p95 0.07084 and maximum 0.13645 world units. Absolute health difference reaches 0.20002437 during a transition. Both sides separately observe all three hostile units' death and later absence, but corpse health values and sampled death timing can differ. Those differences stay visible; this is not perfect replication or complete combat acceptance.

Reconnection starts a host, joins a client, allows that client to exit, waits five seconds and launches a fresh client process with a byte-verified copy of its isolated player profile. Only profile files are copied; engine scratch caches and checkpoints are excluded. Three native processes are involved over time, at most two simultaneously, on one computer. No public listing, map download, router change or user installation modification is performed.

The longer-round trials expose real defeat behavior when the automatic or stationary player dies; they are not reported as completed rounds. A separate native lifecycle fixture schedules a new hostile after reconnection, independently of the solo player's round result. Both peers observe its creation, movement, firing, damage, death and later removal. The final trace has **369 exact shared ticks, three shared identities and 836 matched AI unit-ticks**, with no missing identities or tag mismatches. Position error is median 0.008894, p95 0.064378 and maximum 0.068706 world units. Health error is median 0, p95 0.00002182 and maximum 0.23999983. The hostile is first observed at tick 1232 on both peers; its sampled death/absence sequence occurs on each, with differing detailed-census phases and corpse-health values. Those sampled times are not a measured network latency. Full source/capture hashes are recorded in the [receipt](fixtures/c56-native-ai.json). No full AI capability flag is promoted.

The native engine runs scenario scripts on the host: the client's `gs_ff_*` globals stay at their initial values while the host advances. Reusing native actor replication therefore does **not** complete shared round score, UI, ownership or co-op Firefight. These need an appropriate maintained engine-side integration; SparkLink document packets cannot replace it.

## Runtime boundaries and source research

Read-only source pins, distinct from the installed binary revisions:

- [OpenCE `899219c`](https://github.com/OpenCommunityEdition/OpenCE/tree/899219cc0a14b03bc12f0517a1e9ee4c37158af8), AGPL-3.0-or-later. Installed build 335 identifies revision `da8d455623cf50002e6a798b1980068fd3ca0292`; actual observations require its exact published executable and PDB.
- [Chupathingy `9990568`](https://github.com/ChupathingyCE/chupathingyce/tree/9990568507eede8b81edd5437a4860de5465c408), GPL-3.0-or-later. The tested [v0.8.1d release](https://github.com/ChupathingyCE/chupathingyce/releases/tag/v0.8.1d) identifies `844242abdfb9d5ad51332808cb50b66266796801`. OpenCE offsets/PDBs are not reused for this different x64 executable.
- [bnunu `2e376b9`](https://github.com/bnunu/halo-1/tree/2e376b992e920bcc3a094727475c17daef71ec8c), declared CC0; decompilation provenance remains a separate review boundary.

The prior source atlas's actor creation, object ownership/deletion, damage, encounters and host-authoritative replication paths are reused. No decompiled/copyleft implementation is copied into Spark. Upstream StageKit is Linux-only, uses its own generated test content and reports player scenarios; it is not Windows AI combat acceptance. Native impact/kill test hooks are disabled in all new AI/co-op trials because an impact hook directly causing damage is not a fired projectile.

Two important corrections come from the pinned implementations:

1. OpenCE's [mounted-unit queue](https://github.com/OpenCommunityEdition/OpenCE/blob/899219cc0a14b03bc12f0517a1e9ee4c37158af8/source/ai/ai.c#L1265) has eight **pending unit creations**, consumed by [pending placement](https://github.com/OpenCommunityEdition/OpenCE/blob/899219cc0a14b03bc12f0517a1e9ee4c37158af8/source/ai/ai.c#L3032). It is not an eight-total-actor limit. Arbitrarily increasing actor pools or imposing a wrong global carrier limit is not a repair.
2. [Native vehicle-exit handling](https://github.com/OpenCommunityEdition/OpenCE/blob/899219cc0a14b03bc12f0517a1e9ee4c37158af8/source/ai/actions.c#L4185) depends on hostile occupants, eviction stimuli or dangerous attached projectiles and the unit's exit animation. `disallow_vehicle_combat` affects seat choice; it does not generate automatic exit. The original zombie remains a carrier-form actor with its seated mechanism; replacing it with a marine is not restoration.

Chupathingy's custom CE campaign selector refuses the `@ce` name in these trials and can continue on Carousel. The runner/analyzer now identifies that refusal as a fault instead of treating a successful fallback lobby as the requested level. An independently authored **multiplayer** CE research scenario loads, but is not campaign conversion: valid multiplayer starts, starting weapons and placed netgame equipment are all required. The final map is `b37172d871246493f81e0d64692545df252515633617dcfc7ce0004560be11ad`. Its 34 exact sampled player-tick pairs include four shield disagreements plus ammunition/item timing differences; those are retained.

The MCC candidate is not accepted: its native builder requires `ui/ui_tags_loaded_solo_scenario_type.tag_collection`. The installed SDK dependency walk also reports a broken nested profile-screen dependency. No fabricated empty tag or header-only conversion is used to force success. Stock Custom Edition needs separate game-peer AI support; its Tool compiler does not supply that networking.

## Reproduction and preserved evidence

Private source kits and complete failed/successful native logs remain under `.local/c56-engine-ai-20261102` and the separate `C56-AI-*` / `C56-FF-*` kits. They contain owned game content and must not be included in public packages. The receipt includes metadata and hashes only. Earlier tick-reset captures, map-selection failures, missing spawn/equipment trials, the bounded-profile refusal and zero-exact-tick captures remain intact.

Use the existing private native runner with the exact installed release, owned boot maps and a separately compiled CE scenario:

```text
node scripts/test-community-runtime-native.mjs --host-id opence-build-335 --host-dir <publisher-folder> --client-id opence-build-335 --client-dir <publisher-folder> --maps <owned-Xbox-boot-maps> --output <fresh-directory> --mode ce:coop --ce-map <compiled-CE-scenario> --ai-symbols <matching-PDB-folder> --ai-details true --native-ai true --player-input none --diagnostic-no-audio true --rejoin true
node scripts/analyze-opence-ai.mjs --rejoined-run <fresh-directory>
```

The analyzer selects the second client lifetime from the original three-process receipt, checks ordered/nonoverlapping client lifetimes within the held host and keeps exact-tick/identity/health discrepancies. It never rewrites a receipt into a fictitious two-process run. Old two-process analysis remains unchanged. Cross-computer acceptance, hostile vehicle interactions and audiovisual acceptance remain false.

Regression results, the updated development executable, previous-good executable preservation and unchanged sealed release files are recorded in the receipt. No new installer, portable ZIP, Linux package, GitHub upload or public release is created. [Push handoff](C56_PUSH_NOTES.md).

Final regression totals: **655 Rust tests passed, 8 explicitly ignored, 44 suites; 351 frontend tests in 83 files; 152 browser tests; 59 offline programs; 48 native-analysis/release-guard tests.** TypeScript and the Windows x64 development build pass. A fresh native WebView2 window returns real IPC bootstrap data, loads its workspace, matches version `0.4.1` and serves frontend bytes identical to the committed build. This startup smoke is not a whole-process performance benchmark or Halo gameplay test. Source/build commit: `c52206fb66bf2d64d0e91132d4d054320b94acec`; the receipt follow-up changes metadata only.
