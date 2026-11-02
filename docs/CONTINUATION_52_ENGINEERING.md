# C52 — Engine intelligence and native CE resource repair

Starting master: `c0f43f39b7a055f289603547b238ef00f534fabc`. Application/source-atlas commit: **`2d24da3632d6359cfe32c54038c64356a1540a40`**. The delivery evidence and cumulative ledger follow as a separate documentation commit. Local master remains in the existing integration worktree; the older dirty C41 root checkout is preserved.

## Delivered engineering

The concrete C51 decoder gap was native **Custom Edition indexed bitmap tag metadata**, not missing installed bitmaps or an Xbox version allowlist. CE's native tag data word selects a resource entry; pointers inside that body are relative to it. C52 independently implements that route using the existing resource index, DDS transport, material planner, source identity and native preview pipeline.

The reader verifies fresh native tag class/id/index/path/flag, exact unique resource slot/path/kind and recorded SHA-256, body-relative metadata bounds, per-image format/dimensions and the exact raw pixel span. Bodies are limited to 1 MiB and metadata to 16 MiB per transaction. The same opened resource handle is rehashed after reads. Wrong source/resource hashes, forged slots, wrong paths, pointer escape, oversized image counts and metadata budgets refuse pixels. No source bytes are changed. Other indexed tag formats are not enabled by this repair.

The material planner now schedules native CE metadata validation instead of rejecting all indexed bodies before reaching Rust. The World detail/lightmap path and existing model/library/cube preview paths use the shared validator. Original source pixels retain precedence; compatible preview resources still cannot silently become compiler resources. C38 native transactions, Baboon/Invader reconciliation, Smart Edit, builds and SparkLink remain in their existing owners.

## Source intelligence

[ENGINE_SOURCE_ATLAS.md](ENGINE_SOURCE_ATLAS.md) and [its structured index](fixtures/engine-source-index.json) contain six exact upstream pins and 30 reviewed behavior/function records. Each record includes ownership, structures/input/output, runtime scope, Spark owner, gap, integration route, license observation, source-file SHA-256 and acceptance. They cover cache metadata, BSP/model/bitmap/sound structures, actor/object/seat/damage lifetime, late loading and Delta compatibility.

Source files are in detached, sparse, separate research checkouts. All **10,368 selected files / 180,485,509 bytes** are rehashed against their acquisition manifests. Checkouts including Git occupy **246,640,334 bytes (235.2 MiB)**. No engine module is copied into production or public packages. No external engine is compiled or installed. Invader and Reclaimer remain tools/format references; current AGPL/GPL/CC0 histories are recorded per exact pin, not assumed interchangeable.

The existing operation-specific runtime report now exposes the pinned actor/co-op source references while keeping source findings separate from an installed build, a control API and gameplay acceptance. A regression supplies claimed compatibility and 128 players and still cannot promote AI/co-op to ready/multiplayer-tested. Read-only index checks are included in both normal CI jobs; no rules or release approval gates are weakened.

## Native resource acceptance

| Installed source | C52 native evidence | Limits |
|---|---|---|
| MCC Blood Gulch, cache 13 | Correct source hash/origin, **5,503 render triangles / 68 model types**, tags and independent resource discovery. | C52 does not repeat every MCC shader/audio or retail gameplay gate. Prior C51 evidence remains separate. |
| Custom Edition Blood Gulch, cache 609 | Correct origin; **5,503 render triangles / 68 model types**; **121/121 requested images and 12/12 cubes** recovered from original bitmaps.map. | Indexed sound metadata remains an explicit separate gap. |
| OpenCE Xbox b40, cache 5 | Correct installed origin/hash; **235,145 render triangles / 63 model types**, tags and source readback. | Not an all-asset or full audiovisual/gameplay parity claim. |
| Chupathingy Xbox a10, cache 5 | **364,774 render triangles / nine BSP parts / 70 model types**; **425/425 requested images, 17/17 reflection cubes and three playable sample reports**; unchanged original source. | Full shader/game-audio behavior and every asset class remain separate. |

The final packaged CE app automatically binds **159 source shaders, 15 lightmaps, 233 detail slots and 73 reflection assignments**, with zero compatible-runtime base substitutions. The preserved C51 executable binds zero of these in the same native CE case. The actual textured **mp_warthog** thumbnail is verified in the Asset Library; unused/unsupported tag forms can still report unavailable, and this is not a claim that every weapon/vehicle asset now imports or compiles.

Native screenshots and original input hashes remain in the private C52 receipts. Every original and preserved map checked in the four-runtime source test remains byte-identical. The existing solid, source-derived monitor corner/menu test also passes against the final executable: actual monitor source, textures/reflections, full opaque pixels, glass/tint separation, uncut corner bounds and menu open/close are retained.

## Two actual game processes — partial AI observations

Two isolated publisher-verified OpenCE **build 335** copies run stock campaign a30 and b30 sessions on one computer. Executable SHA-256 is `788fb4095664b9417f64f9d40a5668e6d0775823407e9d5a7b517587536766a0`; matching PDB is `b3755a3d5a7864e0ba30be6dd457c3f361c62a2bc0a04c18860a713f1931c800`. The exact source `da8d455623cf50002e6a798b1980068fd3ca0292` is read through pinned Git objects in addition to the separate current upstream checkout. It is not confused with current OpenCE research pin `899219cc…`.

Both games join through native networking, exchange packets and exit normally, with rechecked unchanged inputs and complete read-only observer footers. Tests disable injected shot and kill cues. They still use scripted player movement, null rendering and disabled/dummy audio: **diagnostics only**.

| Observation | a30 | b30 |
|---|---:|---:|
| Host actor pool peak | 5 | 92 |
| Host/client network actor peak | 0 / 0 | 44 / 44 |
| Shared actual actor identities | 0 | 42 |
| Moving shared actor identities | 0 | 34 |
| Shared actors with firing controls | 0 | 10 |
| Matched server-tick frames | 63 | 172 |
| Classified native faults | None logged | None logged |
| Full lifecycle acceptance | **No** | **No** |

a30 does not activate observed combat during this short trial; it is not counted as AI synchronization. b30 records host-owned AI, client-driven unit states and native control activity. It also retains **336 missing-client unit-ticks**, **462 known-AI missing-host unit-ticks**, **199 unclassified-client unit-ticks**, seat/parent disagreements and a maximum matched health delta of about **0.20**. No source-tag mismatch is observed. These are sampled, non-atomic reads; attachment coordinates and transition timing cannot be equated to world-space desynchronization without further evidence.

The analyzer correctly returns diagnostic/incomplete acceptance rather than passing on matching identities or movement alone. Target choice, natural attack impacts, damage/death/removal coverage, rider/vehicle transitions and reconnect still need explicit independent acceptance. No cross-computer run or newly authored Firefight round is certified.

The carrier-specific census utility was also tried on stock b30 and **refused an AI unit changing to a non-biped type**. That utility is scoped to zombie bipeds, while stock campaign networking also tracks vehicles/recorded units. Its refusal is retained; it is not weakened or relabeled a game crash/success. The broader AI analyzer remains the applicable diagnostic for these stock sessions.

Source review confirms the original carrier exit requires a valid seat animation **and** a native exit decision/stimulus. The C51 commanded-exit candidate and unforced Firefight placement failures remain preserved. No speculative carrier physics fix, automatic release claim, custom AI replication layer or unsafe game memory write is introduced.

## Regressions and measurements

| Check | Final result |
|---|---|
| `cargo test --workspace --locked -j 4` | **642 passed; 8 explicitly ignored; 44 result suites; zero failed** |
| Frontend | **319 passed / 73 files** |
| Browser | **149 passed** |
| Offline | **59 programs passed** |
| Native observer/health/chain/readback guards | **37 passed** |
| Source index | Six pins/licenses, 30 references, existing Spark owners and local source hashes checked |
| Native CE app | Automatic original materials plus actual textured library preview; unchanged source/resource hashes |
| Four installed origins | All passed source/discovery/geometry/model/tag identity readback |
| Native a10 reader | All 425 requested images and 17 cubes plus three sample previews recovered |
| Native monitor/menu | Passed on final executable |

The new CE regression first fails against the old reader, then passes with the repaired route. Synthetic cube faces remain distinct; fresh pins do not authorize corrupt metadata. Early index validation catches duplicate reference IDs; the corrected index passes without relaxing the guard. These development failures remain in private logs.

The final optimized desktop build takes **1m 36s**. The native a10 release reader measures **902.6 ms inspection, 7,298.9 ms requested bitmap recovery and 11,487.6 ms total**. CE first-view observations are **5,351.6 ms before with zero materials**, **12,587.8 ms for the first repair with complete materials**, and **12,960.6 ms in the final app**. Import observations vary from about 0.93–1.49 seconds in those runs; a concurrent diagnostic run is slower and retained separately.

These are content-recovery/reference timings, **not an optimization claim**: the baseline omits the textures restored by the fix and later runs differ in parallel load/cache state. No rendering quality or validation is dropped to manufacture a gain. The C51 performance baselines and known startup/catalog/CPU-memory work remain open.

## Preservation and storage

The preceding **449 ledger records / 965,743 CSV bytes** remain an exact prefix; three scoped records make **452 total**. The original 92 reconstruction is unchanged. Starting master remains an ancestor, experimental refs and successful builds remain available, and the older dirty root worktree is not staged/reset/switched.

The final audit finds the historical `codex/continuation-34-runtime-integration` pointer absent although its starting snapshot records it. Its commit `d6bfe25666aad35aa63cd1fdd7082d71ca72119b` remains reachable through master and multiple preserved branches. A **create-only** ref operation restores the exact recorded pointer; it cannot overwrite an existing ref. All 20 non-master branch pointers from the starting snapshot then verify. No master force update or history rewrite occurs.

Private C52 QA currently occupies about **5.43 GiB**, including independent game/Spark data copies, WebView profiles, previous-good executable copies, captures and native logs. That is separate from the 235.2 MiB research checkouts. No automatic cleanup deletes source, snapshots, research or evidence. Future native trials should reuse verified input inventories and enforce an explicit storage budget before creating more data copies.

## Executable and distribution status

Final development executable: `target/release/GuiltySpark.exe` in the integration worktree, **42,283,520 bytes**, SHA-256:

`8c1ccb4ddd43dfe3ec0f27a441508f7825239529372a6287f3b5c0f0e4a60b55`

Built using `pnpm exec tauri build --no-bundle` from application commit **`2d24da3632d6359cfe32c54038c64356a1540a40`**. Its actual packaged WebView runs the native CE/monitor tests; it is not a development-server executable. The C51 executable is retained at its original `fea8e190…` hash.

The sealed C49 directory `.local/releases/C49-preview-cb07581` is rehashed: installer **10,107,686 bytes / `6e0c3efb…`**, portable **13,941,863 bytes / `ff6c9e4d…`**, source **26,186,072 bytes / `c6ea81b2…`**, manifest and checksum list all match their prior SHA-256 identities. Source remains `cb07581597de11e83d1c10bafad526e8b031f27e`. **C52 does not replace those packages or claim a new installer/portable/source ZIP.** No Linux package is verified.

No remote push or release publication is attempted. Public Releases is not re-certified in C52. The existing draft-only release workflow and publication approval requirement remain intact. A local app, an Actions artifact and a published Release asset remain distinct.

[Machine-readable C52 receipt](fixtures/c52-engine-intelligence.json) · [Push summary and description](C52_PUSH_NOTES.md) · [Thirty source records and ten concrete next steps](ENGINE_SOURCE_ATLAS.md).
