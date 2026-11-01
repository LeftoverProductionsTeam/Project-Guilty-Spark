# C47 — Native conversion readback and failed AI lifecycle diagnostics

Continues committed C46 `04bd714c64df35c56ed7af4d74853b113cc96c9b` in the existing isolated local-master checkout. Original sources, complete C46 audio builds, dirty root-checkout work, branch history, releases and failed experiments remain preserved. This is a source/tooling continuation; the tested C46 Windows executable and installer remain the desktop artifacts. No remote push or repository-rule change is performed.

Machine-readable identities and results are in [the C47 receipt](fixtures/c47-native-readback-ai.json). [Publication notes](C47_PUSH_SUMMARY.md) separate the implemented improvements from experimental conversion and gameplay work.

## Measured native readback performance

The recovery recipe previously started Invader separately for individual collision/model fields. It now batches bounded read-only queries, preserves request order and empty string fields, checks response counts, and hashes the tag before/after every batch. Invalid keys/counts, changing bytes and incomplete responses refuse the snapshot. It does not send binary patches, run remote tools, remove source data or skip native compilation.

The explicit benchmark replays all **338 recorded native reads** against the same frozen C46 tag tree, including all repeated requests. Three alternating sequential/batched pairs retain every native output and produce identical value digests:

| Final series              |  Sequential |     Batched |
| ------------------------- | ----------: | ----------: |
| Pair 1                    |     6.012 s |     0.498 s |
| Pair 2                    |     5.446 s |     0.483 s |
| Pair 3                    |     5.437 s |     0.466 s |
| Median                    | **5.446 s** | **0.483 s** |
| Native processes per pass |         338 |          29 |
| Values returned per pass  |         338 |         338 |

The median improvement is **91.1%**. The earlier complete series is also retained (5.552 s to 0.489 s, 91.2%). These measure the native conversion **readback phase**, including its output records, under a warm OS file cache. They do not measure a complete changing conversion pipeline, desktop startup, showcase loading, rendering, GPU or memory use. No game or compiler runs concurrently with the paired measurements.

Run the owner-only benchmark with `scripts/benchmark-native-tag-readback.mjs`, a complete native recovery receipt, its locally owned tags and the pinned Invader executable. The script accepts only recorded literal read/count requests, writes a fresh output directory and never launches Halo. Source hashes, query outputs, tool identity and benchmark/helper source identities are recorded.

The final updated recovery recipe runs through actual classic Tool and produces a version-609 cache. Total native invocations fall from **351 to 65** for this recipe. Its exact twelve-tag change footprint remains enforced; all 3,739 reviewed input tags and native tools stay unchanged. Strict Invader comparison matches **12/12 loose tags** and **12/12 corresponding compiled-cache tags** against the preceding recipe, without functional/precision relaxation. Different native binary padding is retained, rather than classified as semantic corruption.

This recipe deliberately continues its exact inherited recovery baseline. It does **not** replace or downgrade C46's complete 331-chunk audio candidates. The selected twelve-tag comparison does not claim complete resource/audio equivalence; Invader's separate missing-resource notices are retained. Faithful conversion and gameplay remain false in the recipe receipt.

## Carrier animation-state investigation

The C46 carrier graph has a correctly linked five-node idle clip but no unit-state table. A separate native experiment compiles `stand unarmed idle` into a fresh graph, defines its generated bind-pose aim ranges as zero, verifies the idle state/index, then changes only the copied carrier's graph reference. Original biped animations, physics and complete sound chains are untouched.

Classic Tool produces the real cache; strict loose-to-cache comparison matches the new animation tag **1/1**. The candidate contains exactly two changed/added loose tags relative to C46. Its source, compiler logs, native readback and cache identity remain private and preserved. The earlier attempt which prompted to remove the old animation but did not save is a failed trial, not a successful compiler result.

In one normal two-process OpenCE trial and one normal two-process Chupathingy trial, the previous empty animation-block warning does not recur. This specific absence is narrower than a complete lifecycle fix. Other native faults remain and this graph is **not automatically admitted** into the recovery recipe or shipped as an accepted game map.

OpenCE's host crashes with `0xC0000005` after the joined simulation runs. The actual matching-symbol observer completes before the crash and retains **17 shared AI identities, 10 moving identities and one firing identity**, with 84 matched distinct ticks / 484 actor pairs. Missing identities remain substantial: 740 host-AI unit/ticks missing on the client and 300 known-AI unit/ticks missing on the host. There are also 336 host ticks and 366 client ticks without a paired observation. These are partial observations before failure, not improved replication acceptance or a valid comparison of accuracy with C46's longer trial.

The crash's exact-build offline symbol resolution points to `object_cause_damage` and a physics/vehicle update call chain following a stale-object assertion. Optimized nearest-symbol results are diagnostic evidence, not a completed root-cause repair. Mounted-weapon capacity and biped exit-placement faults also persist. No engine limit, source physics, executable or security setting is changed to force a pass.

Chupathingy's two processes join and exit normally on this candidate, but retain mounted-actor, exit-placement and invalid-tag assertions. The analyzer rejects content/gameplay acceptance despite zero exits. There is no matching approved Chupathingy actor observer here, so no offsets or AI parity are guessed.

Read-only source checks also find wrong-class legacy references with a zero spawn count. Inactive data is not replaced with guessed actors or deleted merely to quiet logs. Proper scenario/class routing and legacy spawner behavior still need reviewed native conversion work.

## Failure evidence and regression boundaries

`analyze-opence-ai.mjs --diagnostic-run` can report complete, hash-verified observer data from an abnormally exited native pair. It always refuses acceptance, preserves the actual process exit/runner errors and keeps normal `--run` refusal unchanged. Forced runs, changed input files, bad observer checksums, truncated observations, wrong symbols and out-of-bounds actor state remain rejected. Reanalysis of the complete C46 pair reproduces its original comparison exactly and retains every native refusal.

The pinned offline symbol helper also accepts bounded literal symbol names. It verifies the exact publisher executable/PDB and does not attach to or write a game process. An expression-like name is refused in an actual executable negative test.

Separate private debugger experiments used hardware execution breakpoints on newly launched owned QA copies. They are timing-perturbed diagnostics, including failed helper and debugger-exit trials; none count as native gameplay/performance acceptance. All attempts, source and logs remain preserved. The normal OpenCE/Chupathingy trials above run independently of that debugger.

Current checks pass **619 Rust tests, seven opt-in cases ignored; 284 frontend tests; 136 browser cases; 59 offline scripts; and 32 native diagnostic/source tests**. TypeScript and the updated Windows diagnostic example build. CI retains its existing checks and adds the new readback refusal tests. No hosted CI rerun is claimed.

C46's native emitter, unsafe sound-class refusal, three-process shared-source/tool reconciliation, original Baboon evidence, renderer, Smart Edit, QuickForge and BSP Workshop results remain intact. They are prior results on the unchanged C46 executable, rather than newly repeated C47 acceptance claims.

## Next gates and artifacts

Trace and repair the stale damage/physics object lifetime and mounted actor/spawner design before another gameplay acceptance round. Keep death/respawn, late join, reconnect and real cross-computer testing open. Target-runtime listening, two MCC sound-distance differences, two missing original custom cues, Timberland–Sidewinder traversal and complete audiovisual parity remain separate gates. Native loose-tag tests do not complete the direct compiled-map structural writer or arbitrary live BSP replacement backlog.

C47 supplies a verified committed source archive and a descriptive push/PR summary. The C46 installer, portable executable and portable archive remain unchanged and available; no new C47 desktop installer or fresh-machine installation is claimed. No owned maps, tag payloads, sound data, publisher engine/source, SDK, PDB or private debugger binaries are distributed.
