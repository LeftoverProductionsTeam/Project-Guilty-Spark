# C46 native audio, animation hierarchy and AI diagnostics

C46 continues committed C45 (`7fb8920`) in the existing isolated local master worktree. Native source transactions, Baboon/Invader reconciliation, SparkLink, Smart Edit, BSP Workshop, the renderer, QuickForge and previous experiments remain in place. No remote push, repository-rule change, public multiplayer trial or game-memory write is part of this continuation.

## Concrete repairs

Spark's JMA reader/exporter and C45 research generator had child and sibling fields reversed. C46 fixes both. An owned five-node, two-frame carrier source passes through the **production Rust parser and exporter**, then the actual classic Halo Tool animation compiler. Native readback verifies every child/sibling link and node count. The recovery recipe also performs this link check. Existing malformed multi-root imported clips are refused with a precise request to reimport the preserved original JMA; saved source/clip data is not silently rewritten. Original zombie biped animation graphs remain untouched. This was a Spark generator bug, not evidence of a Baboon or Invader defect.

The three spawner weapons also referenced an ammunition collider that Tool discarded because its nodes did not match their gravity-rifle models. The exact-input research recipe now reuses the native-generated five-node collider for those specific three weapons and checks the model identity first. Its reviewed footprint grows from C45's nine tags to twelve. The original 3,739-tag baseline and all C45 outputs remain intact. This prerequisite repair does not establish collision or gameplay correctness for the completed map.

The shared native build runner now rejects `failed to load sound for adding to cache file` on either output stream, including the final buffered diagnostics, even if a tool exits zero and prints a successful cache footer. It waits for the source-writing tool to finish and retains the previous accepted output. Ordinary missing optional resource-pack messages stay separate. The exact failure was observed in a genuine native PCM candidate; it is not a manufactured tool-success test. Focused process tests additionally exercise the shared Runner's stdout, stderr and previous-output behavior.

## Complete long-sound recovery

The original candidate contains three large embedded Ogg samples. OpenCE explicitly cut each to its engine sample limit. C46 recovers and fully decodes their verified original bytes through the installed, hash-pinned libsndfile 1.0.31, without resampling or changing channels. Native Invader sound compilation creates linked Xbox ADPCM chunks; classic Halo Tool and official H1A Tool compile actual CE 609 and MCC 13 caches.

| Original sound | Source frames | Rate/channels | Native chunks | Explicit silent end padding |
| --- | ---: | --- | ---: | ---: |
| `sound/dialog/multiplayer1/game_over` | 7,726,080 | 44,100 Hz / stereo | 133 | 0 |
| `sound/dialog/multiplayer1/ghost` | 7,392,384 | 44,100 Hz / stereo | 127 | 0 |
| `sparky/sound/sparkmusic/v1_hit_themes/killer_tracks_invaders` | 4,127,091 | 44,100 Hz / stereo | 71 | 13 |

The first ADPCM experiment lost 51 frames from the third sample and was **rejected**. The final preparation preserves every original PCM byte and appends 13 recorded silent frames to complete its 64-frame block. The original PCM, Ogg and failed candidate are retained. ADPCM encoding is lossy; neither byte-lossless encoding nor perceptual equality is claimed.

Both final caches are reopened with Spark's real sound reader/exporter. All **331 chunks** are available and decoded. Chain audits reject missing/duplicated chunks, cycles, extra roots, changed rates/channels and unaccounted frame differences. Their order, original frame coverage and declared padding are verified. Every corresponding encoded-sample identity and exported WAV is compared across CE and MCC. Native class, emitter placement, editor audition and actual runtime playback remain independent properties.

| Native output | Bytes | SHA-256 |
| --- | ---: | --- |
| CE 609, isolated `ZA-C46-H` | 98,275,315 | `f523cd46309c3c82658dce06658ae5e21382f4b3e04c22516ff484fceb0404ad` |
| MCC 13, isolated `ZA-C46-L` | 98,556,963 | `3b1788a41f797d44cae8cc90ade81175d684dd45c877935572efc48b5f6ca1f4` |

Strict native Invader source/cache comparison, without relaxed precision, matches **3/3 CE sound tags**. For MCC it matches **1/3**: the official compiler changes minimum/maximum distance from `0/0` to `2/5` in the first two tags. This difference stays explicit; whole-tag equivalence is not claimed for them. All sample-chain coverage checks still pass. No source-distance normalization is applied to hide the discrepancy.

Failed Ogg-input, split-PCM, initial ADPCM, physics-control, collider-control and earlier native candidates/logs remain preserved. In particular, the split-PCM Tool trial exited zero with a success footer while omitting two sounds; Spark's existing raw sample reader refused the missing sample range when reopening that output. Its bounds were not weakened. The final long-audio recovery changes only the three native sound tags on top of the twelve-tag recipe. Authored carrier inertia remains at its original value; the separate one-field physics experiment is not promoted as a faithful fix. Two original custom cues missing from the inherited recovery baseline are still missing.

The earlier [MCC native looping-emitter acceptance](NATIVE_LOOPING_EMITTERS.md) remains a separate workflow: recursive bank samples, native loop attachment/position, damaged-input refusal and unsafe music-class combinations have their own evidence. Recovering long sounds is not a new automatic in-app converter or a replacement for that emitter/class audit. **No C46 audio was heard and accepted in an actual target game.**

That original-loop workflow also passes again through the actual C46 desktop application. This run selects a real ambience loop with three bank-exact encoded permutations, preserves its compiled loop attachment at `[2,3,1]`, decodes nonzero PCM, and leaves all 2,240 original base tags unchanged. A damaged managed import is rejected with the previous accepted build retained. A separate compiler-produced music-class sound-scenery/background conflict is rejected without launching the unsafe map. Editor mute remains separate from the authored native loop. These results verify native content, not heard game playback.

## Private AI results and analysis corrections

Two actual OpenCE build-335 processes run the final CE cache with the publisher-matching PDB and read-only actor observer. Both exit cleanly with unchanged map inputs and joined private network markers. The observer sees **40 shared actual AI identities**, **28 with movement**, and no firing in this particular trial. There are 271 distinct paired ticks and 3,458 matched actor-unit/tick observations. Missing peer observations remain explicit: 400 host-AI unit/ticks lack a client match; 342 known client-AI unit/ticks lack a host match. The maximum measured world-space position difference is about 221.34 Halo units. Native empty-tag/block assertions, cleared wrong-class dependencies and mounted-actor capacity faults remain. AI/gameplay acceptance is false.

The analyzer now selects the last validated observation at each distinct server tick. It reports repeated ticks and unpaired ticks, rather than weighting a stopped game as more network samples. It retains all raw observations and validates even duplicate-tick input before selection. Attached-object coordinates are parent-local: raw pairs remain visible, while world-space and same-parent-local distributions are reported separately. A different-parent raw difference is not approved as a world-space distance. No tolerance is relaxed and no full lifecycle, late-join or reconnection acceptance is granted.

Two actual Chupathingy 0.8.1d processes also produce joined markers, but the host fails and native faults remain; that trial is rejected. The final OpenCE log no longer shows the three oversized-sound cuts or the corrected carrier animation-link rewrite. Those specific absences do not erase other native faults or establish audible playback. The audio-disabled OpenCE control still produced tag faults, so merely disabling audio is not a repair.

These are private same-computer engine tests using scripted player input, hidden/null rendering and dummy audio. They are separate from editor SparkLink synchronization and cannot prove cross-computer LAN/VPN, mixed-engine replication, human gameplay or audiovisual parity. Chupathingy has no approved matching-symbol actor observer here; no offsets are guessed.

The Timberland–Sidewinder physical walkthrough remains **unverified**. The user could not locate/test the tunnel. An earlier server load with a player is not a traversal result. No failed experiment is discarded or reclassified as an accepted playtest.

## Measured performance and regressions

The opt-in sound exporter now uses one hash-verified cache snapshot per bounded batch of explicit permutations. Each batch retains source identity, sample/codec checks, requested order and the 64 MiB decoded-output budget. It does not join, trim, resample or substitute audio. The original sequential executable is retained for a paired complete 133-chunk export benchmark; every exported WAV and chain record must match byte for byte.

Three alternating before/after pairs export the entire 133-chunk `game_over` sound from the same 98,275,315-byte cache. Sequential runs take 298,083.666 / 299,765.691 / 293,818.436 ms; batched runs take 10,426.848 / 10,447.288 / 10,323.618 ms. Median time falls from **298.084 s to 10.427 s (96.5%)**. Each exports 30,910,172 bytes; all 133 WAV files, sample identities, links and final receipts match byte for byte. Original cache bytes remain unchanged. Neither implementation times out or drops a chunk.

Binary identities, regression counts and preservation checks are recorded in [the C46 metadata receipt](fixtures/c46-native-audio-ai.json) and [publication notes](C46_PUSH_SUMMARY.md). This benchmark measures the native QA export path under a warm OS file cache, with fresh output directories. It does not establish a new desktop cold/warm startup, map-load, showcase, catalog, GPU or memory improvement. Earlier measured renderer/load improvements and their quality checks remain preserved.

The final `cargo test --workspace --locked` run passes **619 tests**, with seven opt-in cases ignored. Also passing: 284 frontend tests, 136 browser cases, 59 offline scripts, 28 native diagnostics/source tests and seven actual native window/history cases. TypeScript, the Windows executable and NSIS installer build. The native loop/class controls above run against that same executable.

The three-process native-content/external-tool suite also passes through the C46 executable and three separately seeded native project directories. Participant A edits the supported pistol field, B publishes an actually validated native scenery asset, and C places its real model; all converge at revision 3. Per-author undo, same-field conflicts, bad bytes, duplicate acknowledgements, permissions and source corruption/recovery remain exercised. A genuine local Invader edit is reconciled while peers continue work. A frozen revision 17 compiles through actual H1A Tool while revision 18 continues editing; readback verifies radius `0.375`, the 31-triangle published model and placement `[3,2,0.1]`. An actual host-process death recovers revision 18 with asset bytes/history intact, renewed invitation and deduplicated replay. Revocation works and all three 2,240-file native source trees remain unchanged. The earlier human-saved Baboon evidence is retained; no new manual Baboon save is claimed in this rerun.

Seven end-to-end collaboration observations range from 63.5 to 6,611.2 ms, median 377.6 ms. They include native validation, IPC and React consumption on one physical computer, rather than isolated network latency. No cross-computer performance or new replication threshold is approved. The first empty-harness and missing-template attempts remain recorded failures; only the fully seeded run with the matching original dependency closure counts as acceptance.

## Remaining work

Resolve the native invalid tag/block calls and unsafe actor physics before the next gameplay acceptance round. Review MCC's two sound-distance changes; perform target-runtime listening after faults permit a safe trial. Continue actor damage/death/respawn, late join and reconnection coverage without treating partial controls as complete AI synchronization. Keep the unfinished direct compiled-map structural writer, arbitrary live spawning/BSP replacement, full runtime rendering/audio parity and multi-computer editor acceptance in the backlog.

No owned game assets, Ogg/PCM data, native compiler, publisher engine source/binary, SDK or PDB are distributed in this source release. Public receipts contain metadata, checksums, measured results and limits; all private source, candidates, native outputs and crash evidence remain local.

Preservation readback verifies the root checkout's dirty patches and 160 untracked files, all 67 original Zombie Apocalypse files, 94 installed original maps, 14 prior primary release artifacts, all 21 prior branch tips and the previous 413 ledger rows. The reviewed 3,739-tag input tree is unchanged; the final 3,742-file native tree has exactly the fifteen reviewed changes/additions, unchanged authored physics, and unchanged loose tags after MCC compilation. All prior local/tag refs remain unchanged. During the session two remote-tracking refs advanced to the existing C45 commit; their previous tip remains an ancestor. The advance is recorded rather than resetting those refs. C46 itself is not pushed by this continuation.
