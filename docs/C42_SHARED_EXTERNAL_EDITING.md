# C42 — External tools inside shared editing

Continues local master `a3e0ea6bc7c869f09ea3fe993cff481f9feca86e`. The original checkout's tracked and untracked edits, C35–C39 history, existing releases and experimental recovery trees remain preserved. This extends the existing SparkLink service and native operation boundary; it does not introduce another project format or network protocol.

## Workflow

1. Open an editable QuickForge source project. Each creator verifies the matching native source and admitted scenery template in SparkLink, then hosts or joins a private editing session.
2. Expand **External editor · shared native field** and prepare a tool fork. Open the displayed loose-tag path in a compatible native editor. Each participant has a separate project directory and private tool copy. Everyone can continue editing the shared world.
3. Save in the external tool. Spark checks the local tag every two seconds and reviews a change after two matching observations. The resulting review is explicit: choose **Propose reviewed field edit**, then wait for the authoritative acknowledgement.
4. Independent world edits merge through the existing ordered transactions. Same-field conflicts are refused and the external files remain retained. Shared Undo reverses that participant's transaction while preserving other authors' work.
5. The owner builds a saved, acknowledged revision through the actual Halo toolchain. The build consumes an immutable source copy; later edits can continue without altering that build's input.

This shared tool route currently supports **pistol bounding radius**. Publication remains limited to complete copies of the admitted scenery template and its pinned dependencies. Other native fields, arbitrary external `.map` writers, source geometry reimport and custom model/sound/animation publication require their own supported transactions and acceptance. The separate C37/C38 complete-file reconciliation and working-tag build workflows remain available outside an active shared source session. An independent build cannot replace a SparkLink-owned revision.

## Source and integrity checks

The tool copy includes the complete admitted native tree. Its receipt binds the local project, shared session, source inventory, starting revision, starting value and baseline hashes. A different map/client cannot reuse that receipt. Prepare/review actions check document ownership and creator permissions. Local checks do not grant permission to publish: the authoritative service checks the subsequent proposal again.

Review checks every candidate file, the native header/class/CRC, the pinned native reader's complete exposed field output and the intended scalar's bounds. Added, removed or unrelated modified tags are retained for separate review. A truncated or bad-CRC file is refused before normalization.

Spark reproduces the scalar using the reviewed writer against the preserved starting tag. If the external serializer produces different bytes, Spark normalizes a **separate review copy**, verifies that its exposed fields are unchanged and requires an exact match to that baseline replay. This permits the retained genuine Baboon save tested below without accepting arbitrary raw rewrites. Raw and normalized candidates stay available. Only the scalar enters the shared document; opaque cells and serializer changes are not imported or certified as repaired.

No offsets, binary patches, executable paths or remote tool commands enter the transport. A received peer edit cannot launch a tool. Watcher notifications do not identify a writer; the UI explicitly leaves writer identity unknown unless there is observed launch evidence. Controlled corruption produced by the QA harness is not attributed to Baboon or Invader.

## Real acceptance

The final Windows executable is SHA-256 `de24bd7dac9430e16006034761f320f32f38e3327fdcf0c5a960d782d5cd56a6`. The runner used **three independent Spark processes and three private project/library directories on one physical computer**, actual IPC and pinned TLS, and real Invader/H1A tools. No game was launched.

| Check | Result |
| --- | --- |
| Simultaneous creators | A edited the native field, B imported/published a complete scenery file, C placed it; all reached revision 3 with actual model previews |
| Live external tool handoff | Real Invader saved radius 0.375 while C changed the shared world; all three converged at revision 14 |
| Different native serialization | The exact C37 human-saved Baboon 0.1 → 0.5 file was replayed into a new private fork, retained unchanged and reviewed as equivalent serialization; all three converged at revision 15 |
| Corrupt and unsupported saves | Truncated tag, bad CRC and another exposed field edit refused without changing the shared revision |
| Conflict and history | A stale same-field tool save refused; B's undo preserved the external edit and C's world edit; duplicate accepted values created no extra transaction |
| Permissions | A viewer could not prepare a tool fork or publish a native edit; revocation preserved the remaining participants |
| Native build | Frozen revision 18 compiled radius **0.5**, a **31-triangle** published model and placement **[3, 2, 0.1]** while editing advanced to revision 19 |
| Real host loss | Host process killed/restarted; acknowledged revision 19, author history, asset bytes and retained external copy recovered; replay stayed deduplicated |
| Input integrity | All **2,240 files in each of three starting native trees**, the template and imported asset remained unchanged |

Compiled cache SHA-256: `067435e6135097b5a1159e493b1ee91123995971aee9ba3a588f2bd2b305e4c5`.

The Baboon case reuses the earlier genuinely human-edited file, SHA-256 `6dc893d2375864e4648d45cd161d2e73a5b4ab18442fcb8d6fdb6a6e401d9d95`; **no new Baboon GUI interaction is claimed**. The earlier first C42 Invader-only acceptance and failed attempts remain retained separately. One early harness attempt started before its final seed existed; another stopped because its assertion expected the old native-reader refusal instead of the new earlier CRC refusal. Neither is counted as a pass.

Observed final-run timings: external save plus concurrent edit/review/proposal/convergence **20.93 s**; native build/readback **37.34 s**; actual host restart/recovery **13.60 s**. Six warm edit-to-three-editor observations ranged **98.57–416.47 ms**, median **400.74 ms**. Initial three-author content/model convergence took **8.37 s**. These are observations of this workload, not a before/after optimization comparison or a guaranteed network latency. Full native inventories and native validation remain enabled.

Reproduce with fresh isolated `qa_runtime_library` seeds and owner-installed tools:

~~~powershell
node scripts/test-sparklink-content-native.mjs --app <Spark.exe> --root <three-fresh-libraries> --kit <HCEEK> --invader <Invader> --map <owned-MCC-Blood-Gulch.map> --template-tags <matching-native-template-closure> --external-tools
~~~

The optional `--baboon-edited-tag` argument replays the exact separately retained human-saved C37 input above. No Halo tag bytes are distributed in source. [Metadata-only evidence](fixtures/c42-shared-external-editing.json).

The existing native operations runner also compiled the intended 0.55 value before an earlier attempt refused restoring a source owned by another window. The refusal and compiled output remain retained. A fresh isolated rerun passed source acceptance, compilation, recovery and retained UI history; no ownership guard was bypassed. The independent native save-integrity runner again accepted a 201-byte harmless normalization, rejected malformed semantics with a valid CRC and a separate checksum failure, retained recovery data and compiled an intentional 0.225 edit.

## Other corrected integration points

Ctrl+S now captures the focused drawer's map before committing its pending numeric value, then saves that exact project. The new browser contract reproduced the previous lost draft and now verifies a donor tag save without changing the active map or focus. This is browser/IPC-contract evidence, distinct from the native collaboration test.

Portable runtime detection now uses linked folders, reviewed registrations and preserved original-map provenance, bounded to known folder names and 256 candidates. A genuine native test moved both Spark's executable and working directory outside the repository. After importing the same preserved source, the old executable found zero portable clients; the final one found CE, OpenCE and Chupathingy. Exact executable/content checks remain. This reproduces a working-directory dependency; it does not identify which earlier executable the owner was running or establish non-MCC Live Link.

Full local regressions: **611 Rust passed / 7 opt-in ignored; 275 frontend; 136 browser; 59 offline scripts; two interface probes**. TypeScript, the Windows executable and NSIS installer build. The existing original-loop compiler/readback and CE Workshop walkthrough results remain separate historical acceptance; this continuation adds no new in-game listening, Zombie AI or gameplay claim.

The [Find tools and default-material acceptance](C42_TOOLS_AND_DEFAULTS.md) uses this same executable. Its native metadata records standalone launch separately from supported source handoff, and preview textures separately from native compilation.

## Remaining gates

No second computer was available. Real multi-computer LAN/VPN, network impairment/performance, mixed-version sessions and hostile-peer review remain open. Current three-process editor synchronization is separate from in-game multiplayer/AI replication. Broad native schemas, arbitrary compiled-map editing, general source/tool round-trips, cross-runtime conversion fidelity and universal Live Link remain in the master backlog. Native loose-tag tests do not complete a direct compiled-map writer.

Final source is consolidated locally on master. Repository rules are unchanged. Publication and any protected-master merge remain owner-controlled; no remote push, rules bypass or hosted CI result is claimed.
