# C50 completion checkpoint — native acceptance and retained workspaces

This continues local `master` from `f247cbae3969631870bc4a6ac1abc55a6468e628`. The checkout already contained **88 modified/untracked paths**; that work was retained and integrated. No branch, original map, research snapshot, previous-good build or C49 release asset was deleted. This is a local development checkpoint, not a new public release or completion of every gameplay goal.

[Machine-readable evidence](fixtures/c50-completion-pass.json) · [Custom tag names and comparison measurements](C50_COMPARE_AND_TAG_NAMES.md) · [Push and distribution notes](C50_PUSH_NOTES.md)

The exact ending commit/tree and clean status are captured after committing in the private run's `end.json` and final handoff. All raw runs, including failures, remain under `.local/c50-completion-20261102/`. The separately dirty top-level checkout was not reset or switched.

## Changes and actual UI coverage

- Source level views retain their React/WebGL state between tools and maps. Inactive views stop animation, input, audio and polling; returning resumes them. Explicit map closing still releases the view.
- Static visible scenes draw on demand. Native animated shader layers continue to advance when visible. RMB flight, pointer gestures and cinematic playback wake continuous rendering. The four-view BSP Workshop retains one perspective WebGL view and three orthographic SVG views.
- The native pop-out test exposed a real writer-handoff race: background history persistence could run after the new window took ownership, leaving the original window on an empty editor with a rejected-draft notice. Close/transfer now quiesces background persistence and refreshes, saves the focused edit, flushes acknowledged history and then transfers ownership. It returns to the remaining map or Library. Native ownership checks were preserved.
- Compare variants uses height-aware rows, full-value expansion and a details drawer. Small-window selectors and showcase choices fit their available width. Inspector, sound audition, camera controls, tools and settings follow the compact drawer layout. Reachable advanced actions remain available through the existing More menu.
- Tag editor and object drawers accept custom names/paths for supported ordinary native tags, with saved drafts and undo/redo. Native refactoring updates references and verifies the rebuilt cache. Dedicated scenario/BSP/globals paths remain guarded. This is not a general compiled-cache structural renamer.
- Owned-resource preview fixes include bounded Xbox model/BSP/bitmap readers, compatible exact-image preview resolution, source material/reflection handling, compact sound audition, interactive model previews and a saved showcase choice. Preview compatibility does not silently repin compiler inputs.

The real packaged application was exercised through native IPC and actual rendered WebViews: **25 routes × four sizes = 100 base layouts**, plus **22 subviews**. Sizes were 800×600, 1280×720, 1920×1080 and 1280×720 with emulated 2× device scale. Final audit: no horizontal page overflow or inaccessible clipped controls. Large lists/field panels still scroll where needed; controls were not removed to obtain compact screenshots. Screenshots are retained privately; this is not a claim that every control has human gameplay acceptance.

The window runner opened **23 native workspace windows**, including **three simultaneous detached workspaces**, and verified actual project ownership transfer. The separate history runner passed **seven cases**, including independent-map isolation, acknowledged unsaved edits after abrupt process death, undo/redo and closing/reopening a pop-out. Physical movement between multiple monitors and every hardware DPI combination remain untested. Existing current-monitor fullscreen evidence is retained.

## Comparable performance measurements

The comparison uses two independent fresh-profile runs per C50 executable, with the same owned Timberland–Sidewinder and MCC Blood Gulch inputs, 1440×900/DPR 1 and an identical 1428×888 map work area. “Cold” means a fresh process/profile, **not** a flushed Windows disk cache. Readiness requires completed textures, all authored decals, zero pending materials and a stable signature for at least 750 ms.

| Operation | Before median | After median | Result |
|---|---:|---:|---|
| Cold process → Home/showcase ready | 3915.21 ms | 3942.27 ms | 0.69% slower |
| Warm process → Home/showcase ready | 2963.25 ms | 2916.73 ms | 1.57% faster |
| First textured Timberland–Sidewinder view | 6270.08 ms | 6238.81 ms | 0.50% faster |
| First textured MCC Blood Gulch view | 7545.89 ms | 7277.35 ms | 3.56% faster |
| Repeated map switching | 1049.78 ms | 958.66 ms | **8.68% faster** |
| Large catalog preparation | 2748.35 ms | 2729.95 ms | Essentially unchanged |
| Open-project native IPC | 109.35 ms | 124.20 ms | 13.58% slower |
| Polling IPC | 2.47 ms | 2.22 ms | Small absolute difference |

Repeated switches decode no additional bitmaps or reflection cubes in either version. Original quality assertions pass: map/canvas resolution, source mesh/model/object counts, visible-pass triangles, resident geometry, shader bindings, reflections, lightmaps, detail layers, decals and environment settings remain consistent. Animated surfaces were not frozen to improve a timing result. PNGs are retained, but animated materials mean exact screenshot hashes are not a valid equality gate.

There is **no general GPU or memory improvement claim**. Settled map-1 CPU was 5.454→5.394% of the machine, map-2 CPU 2.702→2.755%, and repeat-switch CPU 3.062→3.110%. Repeat resident memory was 1629.66→1647.42 MiB. Map-2 GPU 3D samples rose from a 10% median to 14%; repeat samples rose 10.5→14%. These are sparse owned-process-tree observations, not isolated peak GPU benchmarks. The regressions/variation remain visible for subsequent profiling. A static/demand-render sample's FPS counter is not throughput.

In a separate genuine BSP Workshop comparison, geometry SHA-256 stayed `bebdd68fd55ec01d498b146a1d7b7ff4f2a46729a17553ab5e41445e66df31fc`: 58 source triangles and two native textures. Three approximately 2.7-second idle observations changed from **165/164/163 GL clears to 0/0/0**. Native RMB camera flight worked before and after. One-core CPU observations changed from 1.251/0/1.149% to 0/0/0.574%. This is one fresh process pair with three samples; its higher after-run RAM is retained, not advertised as a memory gain.

The Atlas native UI scanned **94 map paths / 187 BSP records / 71 unique source hashes** in 20.57 seconds. Ten actual MCC maps exercised the existing bounded inspection cache: final eight entries, 101,024,140 estimated bytes and six evictions. Reopening the evicted map reproduced its original decoded content fingerprint. Limits remain eight entries / 256 MiB.

An early demand-render experiment stopped animated shaders and appeared dramatically faster. It was rejected. Earlier telemetry/readiness and UI-harness failures are retained. Only the final quality-preserving comparison is accepted.

## Native audio and tag names

The fresh MCC looping-emitter runner passed actual installed-tool compilation and native readback, without mock IPC:

- Recovered original bank samples and complete `sound_scenery → sound_looping → sound` dependencies.
- Compiled emitter position `[2, 3, 1]`, exact loop attachment and preserved source sample hashes.
- Output cache SHA-256 `01d187eb0a547b606db258ae3d2cb2df272f6d6a3ae50e6e0a4df75348bd57b4`.
- Music-class background/sound-scenery conflicts rejected; deliberately corrupted managed source refused; original files and previous-good output preserved.
- Editor mute/audition settings remain separate from game-authored sound properties. One authored operation undoes/redoes coherently.

The existing C50 native rename acceptance also remains successful: an actual looping sound-scenery tag was renamed through native refactoring and H1A compilation, with dependency/placement readback and original sources unchanged. The native UI test saved the custom name and exercised undo/redo.

**Not accepted:** audible playback in MCC, every sound class/codec, universal rendering/audio parity, or game-peer sound replication. A decoded nonzero waveform and a valid compiler output are not evidence that a person heard the target game.

## Timberland–Sidewinder gameplay gate

The isolated acceptance build changes player starts, not the original connected geometry. Native compilation and 68 starting-location readbacks passed. Its cache is `.local/c50-workbench-20261101/tunnel-native-f/c50tunnel.map`, SHA-256 `c84a1ed439ea0d37705899382c6304e14203c68518a743fcb57bdf1a0c5ea7e7`.

Starting positions are inside the Timberland-side metal tunnel, approximately X 40.81–52.8, Y 34.05–34.65, Z −20.875, facing +X toward Sidewinder. Floor height is approximately −21.075. The test retains source scenery/materials and the connected BSP; original source hashes remain intact.

The checked Custom Edition private host loaded this exact cache and reported **one genuine joined player**. Its matching client had a native Halo window and no startup error. It ran under the isolated `D:\Project Guilty Spark\.local\C50-Walk` directory; no stock game installation was altered and no public listing was requested. The map was selected through the checked runtime catalog. No managed-project build receipt was invented for this separately prepared acceptance cache.

Computer control could not initialize. One precise test instruction was presented: **walk forward through the tunnel into snowy Sidewinder, turn back through the entire tunnel into Timberland, then return; check both mouths, floor and head clearance, and quit normally**. No reply arrived during the bounded 30-minute trial; its isolated client/server were closed afterward and the prepared cache remains available for relaunch. Two-way traversal remains open until the user confirms it. A joined player does not close this gate. Four-region expansion was not started.

## Zombie carrier investigation and AI gate

The original vehicle-based design and original 3,743-file source tree were preserved. Three isolated native CE candidates were built and read back. A minimal diagnostic scenario removes unrelated placements explicitly for isolation; it is not presented as a faithful finished conversion.

| Candidate | Actual native evidence | Acceptance |
|---|---|---|
| A: original carrier physics | Vehicle speed reached 2541.37 native units; spawned AI were unparented/unsafe. Actor count reached three and one remained in the final sampled pool. | Failed lifecycle |
| B: physics `moment_scale` 0.001→1 only | Two independent 75-second OpenCE runs, three cycles each. Maximum observed vehicle speeds 0.0205 and 0.0708; final actor/carrier counts zero. Each actor stayed parented in seat 0, health 1. | Bounded physics observations; release/damage/death failed |
| C: B plus stable rider binding and native `unit_exit_vehicle` | Third 75-second run, three cycles; maximum vehicle speed 0.0684, cleanup zero. Actors still stayed seated with health 1. | Native exit operation did not resolve lifecycle |

Each trial used one exact publisher-pinned OpenCE process, exact matching public symbols and the existing read-only native observer. Renderer/audio were null/dummy; this is not visual or listening acceptance. Native snapshots are non-atomic. Attached object coordinates are parent-relative, not world-space; the analysis separates them.

The public [census analyzer](../scripts/analyze-carrier-census.mjs) records source hashes, native identities, bounded position/velocity observations, seat transitions, health and cleanup. It refuses incomplete observer runs and refuses overwriting previous evidence. It deliberately does not certify a lifecycle from counts. Actual failed and repeated observations are retained in the metadata fixture.

Strict Invader compilation also exposed inherited malformed/target-incompatible source fields; they were not clamped, skipped or declared harmless. Classic Tool produced the isolated caches, but runtime dependency faults and seated-actor behavior remain. The inertia candidate is **experimental**, not a promoted production repair. No actor behavior was disabled to claim success.

**Next engineering gate:** understand the built-in seated actor's exit/invulnerability behavior and obtain safe world-space release, movement/animation, damage/death and repeatable cleanup. Only then advance host-authoritative game-peer AI tests. No new AI replication, MCC Zombie behavior or Chupathingy lifecycle acceptance is claimed here.

## SparkLink and external tools

Fresh acceptance ran three independent native Spark processes with separate project libraries on one physical computer. Genuine TLS sessions, actual UI edits and native H1A compilation passed:

- Simultaneous brush edits, expiring mouse-drag ghosts, acknowledged rendering in all editors, per-author undo/redo, conflicts, viewer/build permissions and lease reauthentication.
- 240 sustained source commits, revision 247, 1,140,156-byte journal and unchanged history limit of 100.
- A frozen shared revision compiled while a newer revision remained editable: cache version 13, 58 compiled collision triangles, two portals and 2,239 native readback tags.
- Owner process death retained two genuine offline UI edits and original operation identities; recovery converged through revisions 248→250 without replaying the first edit twice or losing the newer draft.
- Actual Radmin interface addressing on this PC and revoked reconnect refusal.

Observed convergence across 25 samples was 890.70–1154.73 ms, median 913.30 ms. These polling/UI/native observations are not transport RTTs and were not an isolated comparison against C48. JavaScript heaps rose approximately 80.50→81.91 MiB (owner), 81.80→83.06 MiB and 80.24→81.52 MiB; documents remained one per process. The bounded run took about 141 seconds, not an overnight stability certification.

C37–C42 native source transactions, semantic save checks, tool attribution/receipts and regression safeguards were retained. This pass's actual Invader/native builds did not execute remote tools or broadcast raw binary patches. The optional older shared-external-tool runner was not replayed successfully: it requires accepted per-participant source-library seeds that were not present in the fresh folder. That setup failure is retained, not counted as a passing Baboon handoff. Previous genuine Baboon acceptance and research remain preserved; no new GUI-save result is invented.

Cross-computer LAN/VPN, Steam relay and in-game multiplayer replication remain separate and unverified. Direct structural editing of compiled maps remains in the master backlog.

## Regressions, failures and ignored tests

| Verification | Final result |
|---|---|
| `cargo test --workspace --locked` on Windows | **636 passed, 8 opt-in ignored, 0 failed** |
| Frontend | **308 passed**, 70 files |
| Browser | **143 passed** |
| Offline | **59 command chains passed** |
| Release pipeline | **10 Python + 6 Node tests passed** |
| TypeScript and `git diff --check` | Passed |
| Native pop-outs / window history | 23 windows + seven history cases passed |
| Native UI / Atlas / audio / shared BSP | Scoped acceptances above passed |

An intermediate full browser run timed out inside OfflineAudioContext while other native trials were active: 142 passed / one timeout. No assertion or timeout was weakened. The isolated spatial-audio retry and subsequent complete 143-test run passed. The failure log is retained. Incorrect harness invocation, stale release-dist comparison and earlier audit/profile setup failures are also retained and are not successful acceptance evidence.

The eight Rust opt-ins remain explicit: live MCC camera disconnect requires a reviewed running mods-mode session; community HTTPS listing requires internet; campaign painted-BSP audio/detail and campaign tag duplication need explicitly selected owned native sources; custom-powerup compilation needs its SDK/tag environment; native emitter rename needs its owner-provided inputs; installed MCC inventory requires a selected installation. The native rename/emitter and ten-map inventory paths have separate scoped native evidence. Ignored tests are not counted as passes.

## Storage and release preservation

This pass did **not repeat cleanup**. The complete extended-path audit grew from **105.0233 to 118.1676 GiB**: **+13.1442 GiB**, 455,859 files, 719 links skipped, zero inventory errors. Approximately 11.6876 GiB is the new C50 evidence directory, 0.7458 GiB the held CE walk, and roughly 0.236 GiB each the three native carrier candidates. Repeated independent profiles, failed profiling attempts, native build/readback jobs and their private map copies account for the growth. Those duplicated test inputs are identified rather than silently deleted. No hundreds-of-GiB archive restoration was performed.

All three cold-vault catalog SHA-256 values were freshly verified; 13 archive volumes and recovery tools remain present. Existing complete restoration receipts were preserved. Full blob-by-blob restoration was not repeated. All five sealed C49 files were rehashed unchanged.

The sealed **0.4.1 source is `cb07581597de11e83d1c10bafad526e8b031f27e`**:

| Asset | Bytes | SHA-256 |
|---|---:|---|
| `Project_Guilty_Spark_0.4.1_windows_x64_Setup.exe` | 10,107,686 | `6e0c3efb53ced11dde522492ea341a019c93976d3ca0c16ae28ae180da334749` |
| `Project_Guilty_Spark_0.4.1_windows_x64_Portable.zip` | 13,941,863 | `ff6c9e4dea48126680c2a9b8536dfb2185fab5ac445c7d4f306b9bed52e07069` |
| `Project_Guilty_Spark_0.4.1_cb07581597de_Source.zip` | 26,186,072 | `c6ea81b25bfae352d76df58557a82daef44b72ba11bf778d0e2eee9f56ae03f0` |

They remain in `.local/releases/C49-preview-cb07581/`, with the original manifest and checksum list. Fresh NSIS installation/uninstallation and native installed/portable startup passed. Only the known three-byte NSIS bundle marker differs in the installed executable; all other payload bytes match. Exact embedded frontend bytes were compared with an independently rebuilt copy of the **sealed C49 source**, not C50's dist.

Two fresh first-run observations were portable **1193.54 / 1185.67 ms** and installed **1405.73 / 1169.33 ms** to the first workspace heading plus native IPC. These are C49 first-run checks, not complete C50 Home/showcase times or clean-machine measurements.

The GitHub release workflow still uses a known pushed commit, tests and package checks, actual Release uploads, a new draft pre-release and downloaded-asset hash verification. It does not publish, overwrite `alpha` or bypass rules. Anonymous GitHub verification still returns **zero public releases**. Public master remains `f247cba`; its CI and the sealed `cb07581` CI are successful. Authenticated GitHub writes/draft inspection are unavailable here. No release was published or source pushed. Linux was not built/launched and is not advertised as a verified download.

The minimal distribution action is in [C50 push notes](C50_PUSH_NOTES.md): use the existing workflow against the sealed pushed C49 commit to prepare a new Windows draft, inspect its real attachments and approve publication separately. C50 has not replaced the accepted installer under its old identity.
